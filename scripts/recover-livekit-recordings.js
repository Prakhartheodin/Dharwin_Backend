/**
 * Recover orphaned LiveKit recordings.
 *
 * Why this exists:
 *   - Old code did `Recording.create` AFTER `startRoomCompositeEgress`. If the
 *     Mongo write failed (transient blip), egress ran orphaned and finished;
 *     S3 has the MP4 but DB has no row. The recordings UI never sees it.
 *   - Old `egress_ended` webhook also marked rows `missing` if `fileResults`
 *     was empty in the payload (LiveKit field name varies by version), even
 *     when S3 actually had the file.
 *
 * Two-pass recovery:
 *   PASS A — LiveKit known: list all egress from LiveKit (whatever LiveKit
 *            still retains, usually last 7 days). For each, ensure a Recording
 *            row exists; if status='missing' but S3 has file → upgrade to completed.
 *   PASS B — S3 truth: list every object under recordings/ prefix in the bucket.
 *            For each, ensure a Recording row exists; insert if missing.
 *            File key embeds roomName + timestamp (recordings/<roomName>-<ts>.mp4).
 *
 * Usage:
 *   node scripts/recover-livekit-recordings.js          # dry run
 *   node scripts/recover-livekit-recordings.js --apply  # write
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { EgressClient, EgressStatus } from 'livekit-server-sdk';
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const MONGO_URL = process.env.MONGODB_URL || process.env.MONGO_URI || process.env.DATABASE_URL;
if (!MONGO_URL) {
  console.error('No MongoDB URL found in env.');
  process.exit(1);
}
const APPLY = process.argv.includes('--apply');

const recordingSchema = new mongoose.Schema({}, { strict: false });
const Recording = mongoose.models.Recording || mongoose.model('Recording', recordingSchema);

const RECORDING_RANK = {
  pending: 0, recording: 1, stopping: 2, finalizing: 3,
  completed: 10, failed: 10, missing: 10, expired: 10,
};

const livekitUrl = (process.env.LIVEKIT_URL || 'ws://localhost:7880').replace(/^ws/, 'http');
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

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

function nsToMs(v) {
  if (v == null || v === '') return null;
  let n;
  if (typeof v === 'bigint') n = Number(v);
  else if (typeof v === 'number') n = v;
  else {
    const s = String(v).trim();
    if (!/^\d+(\.\d+)?$/.test(s)) {
      const p = Date.parse(s);
      return Number.isNaN(p) ? null : p;
    }
    try { n = Number(BigInt(s.split('.')[0])); } catch { n = Number(s); }
  }
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1e16) return Math.floor(n / 1e6);
  if (n >= 1e10) return Math.floor(n);
  return Math.floor(n * 1000);
}

/**
 * Parse Egress S3 key into { roomName, ts, egressId? }. Two formats seen:
 *   1. recordings/<roomName>-<ts>.<ext>                                — old app-prefixed (startRecording predicted name)
 *   2. recordings/<YYYY-MM-DD>/<roomName>/rec_<id>_<ts>.<ext>          — LiveKit Cloud default partitioned layout
 */
function parseRecordingKey(key) {
  const stripped = key.replace(/^recordings\//, '').replace(/\.[^.]+$/, '');

  // Format 2: <date>/<roomName>/rec_<id>_<ts>
  const partitioned = stripped.match(/^\d{4}-\d{2}-\d{2}\/([^/]+)\/rec_([a-zA-Z0-9_-]+)_(\d{10,16})$/);
  if (partitioned) {
    const ts = Number(partitioned[3]);
    return {
      roomName: partitioned[1],
      ts: Number.isFinite(ts) ? ts : null,
      egressId: partitioned[2] || null,
    };
  }

  // Format 1: <roomName>-<ts>
  const flat = stripped.match(/^(.+)-(\d{10,16})$/);
  if (flat) {
    const ts = Number(flat[2]);
    return { roomName: flat[1], ts: Number.isFinite(ts) ? ts : null, egressId: null };
  }

  // Fallback: take the last path segment as roomName, no timestamp
  const tail = stripped.split('/').pop();
  return { roomName: tail || 'unknown', ts: null, egressId: null };
}

/**
 * Drop the legacy non-sparse `egressId_1` index if present. The pre-rewrite
 * schema declared egressId unique-but-non-sparse, so multiple null values
 * collide on insert. New schema is sparse — but Mongo keeps the old index
 * until we drop it.
 */
async function ensureSparseEgressIndex(collection) {
  let indexes;
  try {
    indexes = await collection.indexes();
  } catch (err) {
    console.warn('[index] cannot list indexes:', err.message);
    return;
  }
  const target = indexes.find((i) => i.name === 'egressId_1');
  if (!target) return;
  if (target.sparse === true) return;
  console.log('[index] dropping legacy non-sparse egressId_1 (will be recreated sparse on next insert by Mongoose)');
  if (APPLY) {
    try {
      await collection.dropIndex('egressId_1');
      await collection.createIndex({ egressId: 1 }, { unique: true, sparse: true });
      console.log('[index] recreated egressId_1 as sparse unique');
    } catch (err) {
      console.warn('[index] drop/recreate failed:', err.message);
    }
  } else {
    console.log('[index] DRY RUN — would drop and recreate sparse');
  }
}

async function passALiveKit() {
  if (!apiKey || !apiSecret) {
    console.log('[Pass A] LiveKit creds missing; skipping.');
    return { scanned: 0, inserted: 0, upgraded: 0 };
  }
  const eg = new EgressClient(livekitUrl, apiKey, apiSecret);
  let inserted = 0;
  let upgraded = 0;
  let scanned = 0;
  const list = await eg.listEgress({}).catch((e) => {
    console.warn('[Pass A] listEgress failed:', e.message);
    return [];
  });
  const { client, bucket } = buildS3();

  for (const info of list) {
    scanned += 1;
    const egressId = info.egressId;
    if (!egressId) continue;
    const fileResults = info.fileResults || info.file_results || info.fileResultsList;
    const f0 = fileResults?.[0] || info.files?.[0] || {};
    const filePath = f0.filename || f0.filepath || f0.location;

    const existing = await Recording.findOne({ egressId }).lean();
    const isTerminal =
      info.status === EgressStatus.EGRESS_COMPLETE ||
      Number(info.status) >= 3;

    if (!isTerminal) continue; // active egress — leave to webhook/cron

    const startedAt = nsToMs(info.startedAt);
    const endedAt = nsToMs(info.endedAt);

    let s3Ok = false;
    let bytes = null;
    if (filePath && bucket) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: filePath }));
        s3Ok = true;
        bytes = Number(head.ContentLength || 0);
      } catch { /* not in S3 */ }
    }

    const status = s3Ok && bytes > 0 ? 'completed' : 'missing';
    const rank = RECORDING_RANK[status];

    if (!existing) {
      console.log(`[Pass A] INSERT egressId=${egressId} room=${info.roomName} status=${status} bytes=${bytes}`);
      if (APPLY) {
        await Recording.create({
          meetingId: info.roomName,
          egressId,
          filePath: filePath || null,
          s3Bucket: s3Ok ? bucket : null,
          s3Key: s3Ok ? filePath : null,
          bytes,
          status,
          statusRank: rank,
          startedAt: startedAt ? new Date(startedAt) : new Date(),
          completedAt: endedAt ? new Date(endedAt) : new Date(),
          durationMs: startedAt && endedAt ? Math.max(0, endedAt - startedAt) : null,
        });
      }
      inserted += 1;
    } else if (existing.status === 'missing' && s3Ok && bytes > 0) {
      console.log(`[Pass A] UPGRADE missing → completed egressId=${egressId} bytes=${bytes}`);
      if (APPLY) {
        await Recording.updateOne(
          { _id: existing._id },
          { $set: { status: 'completed', statusRank: 10, filePath, s3Bucket: bucket, s3Key: filePath, bytes, completedAt: endedAt ? new Date(endedAt) : new Date() } }
        );
      }
      upgraded += 1;
    }
  }
  return { scanned, inserted, upgraded };
}

async function passBS3() {
  const { client, bucket } = buildS3();
  if (!bucket) {
    console.log('[Pass B] No bucket configured; skipping.');
    return { scanned: 0, inserted: 0, upgraded: 0 };
  }
  let inserted = 0;
  let upgraded = 0;
  let scanned = 0;
  let token;
  do {
    const r = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'recordings/',
      ContinuationToken: token,
      MaxKeys: 1000,
    }));
    for (const obj of r.Contents || []) {
      scanned += 1;
      const key = obj.Key;
      const size = Number(obj.Size || 0);
      if (!key.match(/\.(mp4|mkv|webm|ogg)$/i)) continue;

      const existing = await Recording.findOne({ $or: [{ filePath: key }, { s3Key: key }] }).lean();
      if (existing) {
        if (existing.status === 'missing' && size > 0) {
          console.log(`[Pass B] UPGRADE missing → completed key=${key} size=${size}`);
          if (APPLY) {
            await Recording.updateOne(
              { _id: existing._id },
              { $set: { status: 'completed', statusRank: 10, s3Bucket: bucket, s3Key: key, bytes: size, completedAt: existing.completedAt || obj.LastModified || new Date() } }
            );
          }
          upgraded += 1;
        }
        continue;
      }

      const meta = parseRecordingKey(key);
      const meetingId = meta?.roomName || 'unknown';
      const startedAt = meta?.ts ? new Date(meta.ts) : (obj.LastModified || new Date());
      const completedAt = obj.LastModified || new Date();
      const status = size > 0 ? 'completed' : 'missing';
      const rank = RECORDING_RANK[status];
      // If file embeds egressId in name (LiveKit default layout), reuse it so the
      // sparse-unique index does its job. Otherwise omit entirely (sparse skips nulls).
      const doc = {
        meetingId,
        filePath: key,
        s3Bucket: bucket,
        s3Key: key,
        bytes: size,
        status,
        statusRank: rank,
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        lastError: 'recovered from S3 scan',
      };
      if (meta?.egressId) doc.egressId = meta.egressId;

      console.log(`[Pass B] INSERT key=${key} meetingId=${meetingId} size=${size} status=${status} egressId=${meta?.egressId || '(none)'}`);
      if (APPLY) {
        try {
          await Recording.create(doc);
        } catch (err) {
          if (err.code === 11000) {
            console.warn(`[Pass B] dup key (likely race), skipping ${key}`);
          } else {
            throw err;
          }
        }
      }
      inserted += 1;
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return { scanned, inserted, upgraded };
}

async function main() {
  await mongoose.connect(MONGO_URL);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  await ensureSparseEgressIndex(Recording.collection);

  console.log('\n--- Pass A: LiveKit egress list ---');
  const a = await passALiveKit();
  console.log(`Pass A: scanned=${a.scanned} inserted=${a.inserted} upgraded=${a.upgraded}`);

  console.log('\n--- Pass B: S3 bucket scan ---');
  const b = await passBS3();
  console.log(`Pass B: scanned=${b.scanned} inserted=${b.inserted} upgraded=${b.upgraded}`);

  console.log(`\nTotal: inserted=${a.inserted + b.inserted} upgraded=${a.upgraded + b.upgraded}`);
  if (!APPLY) console.log('\nDry run only. Re-run with --apply to write.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
