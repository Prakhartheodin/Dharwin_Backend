/**
 * Repair script: finds `missing` recordings whose S3 file actually exists
 * (matched by meetingId prefix), fixes filePath, restores status to `completed`.
 *
 * Usage:
 *   node scripts/repair-missing-recordings.js          # live run
 *   DRY_RUN=true node scripts/repair-missing-recordings.js
 */

import mongoose from 'mongoose';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DRY_RUN = process.env.DRY_RUN === 'true';
const BUCKET = process.env.LIVEKIT_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME;

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function listRecordingKeys() {
  const keys = [];
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: 'recordings/',
      ContinuationToken: token,
    }));
    for (const obj of (res.Contents || [])) {
      if (obj.Key.endsWith('.mp4') || obj.Key.endsWith('.webm')) {
        keys.push(obj.Key);
      }
    }
    token = res.NextContinuationToken;
  } while (token);
  return keys;
}

async function run() {
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Dry run: ${DRY_RUN}\n`);

  await mongoose.connect(process.env.MONGODB_URL);
  console.log('Connected to MongoDB');

  const { default: Recording } = await import('../src/models/recording.model.js');

  const missing = await Recording.find({ status: 'missing' }).lean();
  console.log(`Missing recordings in DB: ${missing.length}`);

  const s3Keys = await listRecordingKeys();
  console.log(`S3 recording keys found: ${s3Keys.length}\n`);

  let fixed = 0;
  let stillMissing = 0;
  let exactMatch = 0;

  for (const rec of missing) {
    // 1. Try exact filePath match first
    if (s3Keys.includes(rec.filePath)) {
      exactMatch++;
      console.log(`  EXACT  ${rec.filePath}`);
      if (!DRY_RUN) {
        await Recording.updateOne({ _id: rec._id }, { $set: { status: 'completed' } });
      }
      fixed++;
      continue;
    }

    // 2. Match by meetingId prefix in S3 key
    const roomId = rec.meetingId;
    const candidates = s3Keys.filter(k => k.includes(roomId));

    if (candidates.length === 0) {
      stillMissing++;
      console.log(`  MISS   meetingId=${rec.meetingId}  dbPath=${rec.filePath}`);
      continue;
    }

    // Pick best candidate: prefer mp4, then latest by sort
    const best = candidates.filter(k => k.endsWith('.mp4')).sort().pop()
      || candidates.sort().pop();

    console.log(`  FIX    meetingId=${rec.meetingId}`);
    console.log(`         old=${rec.filePath}`);
    console.log(`         new=${best}`);

    if (!DRY_RUN) {
      await Recording.updateOne(
        { _id: rec._id },
        { $set: { status: 'completed', filePath: best } }
      );
    }
    fixed++;
  }

  console.log(`\nDone.`);
  console.log(`  Fixed (exact):  ${exactMatch}`);
  console.log(`  Fixed (roomId): ${fixed - exactMatch}`);
  console.log(`  Still missing:  ${stillMissing}`);
  if (DRY_RUN) console.log(`  (dry run — no DB writes)`);

  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
