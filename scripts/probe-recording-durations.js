/**
 * Probe S3 recording files (MP4/WebM) to extract real container duration.
 *
 * Why: LiveKit Cloud's egress API doesn't retain old metadata. The MP4/WebM
 * file itself carries duration in its container header (mvhd atom for MP4,
 * EBML Duration element for WebM). Reading the bytes is the only ground truth
 * for historical recordings.
 *
 * For each row with filePath AND (durationMs null/missing/>24h):
 *   1. GetObject from S3.
 *   2. Pipe stream to music-metadata.parseStream — bails early once it has
 *      format.duration (typically reads only the first MB or so for WebM,
 *      may need full read for MP4 if moov atom is at file end).
 *   3. durationMs = format.duration * 1000, clamped to [0, 24h].
 *   4. Persist durationMs.
 *
 * Usage:
 *   node scripts/probe-recording-durations.js          # dry run
 *   node scripts/probe-recording-durations.js --apply  # write
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { parseStream } from 'music-metadata';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const MONGO_URL = process.env.MONGODB_URL || process.env.MONGO_URI || process.env.DATABASE_URL;
if (!MONGO_URL) { console.error('No MongoDB URL.'); process.exit(1); }
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

function mimeForKey(key) {
  const ext = key.split('.').pop()?.toLowerCase();
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mkv') return 'video/x-matroska';
  if (ext === 'ogg') return 'video/ogg';
  return 'application/octet-stream';
}

async function probeOne(client, bucket, key) {
  const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const stream = r.Body;
  if (!stream) throw new Error('empty body');
  const meta = await parseStream(stream, { mimeType: mimeForKey(key), size: r.ContentLength });
  if (typeof stream.destroy === 'function') stream.destroy();
  return meta?.format?.duration ?? null;
}

async function main() {
  await mongoose.connect(MONGO_URL);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  const { client, bucket } = buildS3();
  if (!bucket) { console.error('No bucket configured.'); process.exit(1); }

  const candidates = await Recording.find(
    {
      filePath: { $exists: true, $nin: [null, ''] },
      $or: [
        { durationMs: null },
        { durationMs: { $exists: false } },
        { durationMs: { $gt: MAX_MS } },
      ],
    },
    { _id: 1, filePath: 1, s3Key: 1, durationMs: 1, meetingId: 1, status: 1, bytes: 1 }
  ).lean();

  console.log(`Candidates: ${candidates.length}`);

  let updated = 0;
  let skippedNoFile = 0;
  let failed = 0;

  for (const r of candidates) {
    const key = r.s3Key || r.filePath;
    const tag = `${String(r._id).slice(-8)} ${r.meetingId || '?'} ${key}`;
    try {
      const seconds = await probeOne(client, bucket, key);
      if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
        console.warn(`[probe] ${tag} → no duration in container`);
        failed += 1;
        continue;
      }
      const ms = Math.round(seconds * 1000);
      const clamped = ms > MAX_MS ? null : ms;
      console.log(`[probe] ${tag} → ${seconds}s (${clamped}ms)`);
      if (APPLY && clamped != null) {
        await Recording.updateOne({ _id: r._id }, { $set: { durationMs: clamped } });
      }
      if (clamped != null) updated += 1;
      else failed += 1;
    } catch (err) {
      const msg = err?.message || String(err);
      if (/NoSuchKey|not found|404/i.test(msg)) {
        console.warn(`[probe] ${tag} → S3 missing`);
        skippedNoFile += 1;
      } else {
        console.warn(`[probe] ${tag} → error: ${msg}`);
        failed += 1;
      }
    }
  }

  console.log(`\nSummary: candidates=${candidates.length} updated=${updated} skippedNoFile=${skippedNoFile} failed=${failed}`);
  if (!APPLY) console.log('Dry run only.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
