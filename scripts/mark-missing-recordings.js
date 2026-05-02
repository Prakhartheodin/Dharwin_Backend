/**
 * One-time script: checks every completed Recording against S3.
 * Marks status='missing' for any whose file doesn't exist in the bucket.
 *
 * Usage:
 *   node scripts/mark-missing-recordings.js
 *
 * Dry-run (no DB writes):
 *   DRY_RUN=true node scripts/mark-missing-recordings.js
 */

import mongoose from 'mongoose';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DRY_RUN = process.env.DRY_RUN === 'true';

const client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.LIVEKIT_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME;

async function fileExistsInS3(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function run() {
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Dry run: ${DRY_RUN}`);

  await mongoose.connect(process.env.MONGODB_URL);
  console.log('Connected to MongoDB');

  const { default: Recording } = await import('../src/models/recording.model.js');

  const completed = await Recording.find({ status: 'completed', filePath: { $exists: true, $ne: null } }).lean();
  console.log(`Found ${completed.length} completed recordings to check`);

  let missing = 0;
  let found = 0;

  for (const rec of completed) {
    const exists = await fileExistsInS3(rec.filePath);
    if (exists) {
      found++;
      console.log(`  OK   ${rec.filePath}`);
    } else {
      missing++;
      console.log(`  MISS ${rec.filePath}`);
      if (!DRY_RUN) {
        await Recording.updateOne({ _id: rec._id }, { $set: { status: 'missing' } });
      }
    }
  }

  console.log(`\nDone. Found: ${found} | Missing: ${missing}${DRY_RUN ? ' (dry run — no DB writes)' : ' (marked in DB)'}`);
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
