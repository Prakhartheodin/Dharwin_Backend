/**
 * Fix bogus completedAt + durationMs on Recording rows.
 *
 * The pre-rewrite webhook handler did `Number(info.endedAt) * 1000` where
 * info.endedAt was nanoseconds. That overflows JS safe-int and stamps
 * completedAt at year ~58000+, making completedAt - startedAt evaluate to
 * millions of hours. UI then shows "1234h 56m" for a 50-second clip.
 *
 * For each row:
 *   1. If completedAt is bogus (year < 2000 OR > 2100), try to recompute:
 *      a. HEAD the S3 object → use LastModified as completedAt.
 *      b. If S3 missing, leave completedAt unchanged but null durationMs.
 *   2. Recompute durationMs = completedAt - startedAt.
 *   3. Clamp durationMs to [0, 24h]; null if outside.
 *   4. Persist completedAt + durationMs.
 *
 * Usage:
 *   node scripts/fix-recording-durations.js          # dry run
 *   node scripts/fix-recording-durations.js --apply  # write
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const MONGO_URL = process.env.MONGODB_URL || process.env.MONGO_URI || process.env.DATABASE_URL;
if (!MONGO_URL) {
  console.error('No MongoDB URL.');
  process.exit(1);
}
const APPLY = process.argv.includes('--apply');
const MAX_MS = 24 * 60 * 60 * 1000;

const recordingSchema = new mongoose.Schema({}, { strict: false });
const Recording = mongoose.models.Recording || mongoose.model('Recording', recordingSchema);

const isLiveKitCloud = (process.env.LIVEKIT_URL || '').includes('livekit.cloud');
const isLocalDev =
  !isLiveKitCloud &&
  (process.env.NODE_ENV !== 'production' || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY);

function buildS3() {
  if (isLocalDev) {
    return {
      client: new S3Client({
        region: 'us-east-1',
        endpoint: process.env.MINIO_PUBLIC_ENDPOINT || 'http://localhost:9000',
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
          secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
        },
      }),
      bucket: process.env.MINIO_BUCKET || 'recordings',
    };
  }
  return {
    client: new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      ...(process.env.AWS_ACCESS_KEY_ID
        ? { credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } }
        : {}),
    }),
    bucket: process.env.LIVEKIT_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME,
  };
}

function isBogusDate(d) {
  if (!d) return true;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return true;
  const y = dt.getUTCFullYear();
  return y < 2000 || y > 2100;
}

async function main() {
  await mongoose.connect(MONGO_URL);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  const { client, bucket } = buildS3();

  const rows = await Recording.find({}, {
    _id: 1, startedAt: 1, completedAt: 1, durationMs: 1, filePath: 1, s3Key: 1, status: 1, meetingId: 1,
  }).lean();
  console.log(`Total rows: ${rows.length}`);

  let fixed = 0;
  let cleared = 0;
  let okAlready = 0;

  for (const r of rows) {
    const startedAt = r.startedAt ? new Date(r.startedAt) : null;
    let completedAt = r.completedAt ? new Date(r.completedAt) : null;

    let recomputeNeeded = false;
    if (completedAt && isBogusDate(completedAt)) {
      recomputeNeeded = true;
      completedAt = null;
    }

    const currentDur = r.durationMs;
    const currentDurBogus = currentDur != null && (!Number.isFinite(currentDur) || currentDur < 0 || currentDur > MAX_MS);
    if (currentDurBogus) recomputeNeeded = true;

    if (!recomputeNeeded) {
      okAlready += 1;
      continue;
    }

    const key = r.s3Key || r.filePath;
    if (!completedAt && key && bucket) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        if (head?.LastModified) completedAt = new Date(head.LastModified);
      } catch { /* not in S3 */ }
    }

    let newDuration = null;
    if (startedAt && completedAt && !isBogusDate(completedAt)) {
      const diff = completedAt.getTime() - startedAt.getTime();
      if (Number.isFinite(diff) && diff >= 0 && diff <= MAX_MS) {
        newDuration = diff;
      }
    }

    const set = { durationMs: newDuration };
    if (completedAt && !isBogusDate(completedAt)) set.completedAt = completedAt;

    console.log(
      `[fix] ${r._id} status=${r.status} oldDur=${currentDur} newDur=${newDuration} oldCompletedAt=${r.completedAt} → newCompletedAt=${set.completedAt || '(unchanged)'}`
    );

    if (APPLY) {
      await Recording.updateOne({ _id: r._id }, { $set: set });
    }
    if (newDuration == null) cleared += 1;
    else fixed += 1;
  }

  console.log(`\nSummary: ok=${okAlready} fixed-with-duration=${fixed} cleared-to-null=${cleared}`);
  if (!APPLY) console.log('Dry run only. Re-run with --apply to write.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
