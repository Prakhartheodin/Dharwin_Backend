/**
 * Hourly discovery cron — find LiveKit egress files our DB doesn't know about.
 *
 * Why:
 *   - Egress can be triggered outside our app (LiveKit dashboard, manual API
 *     call, alternative client). Those land in storage but never create a
 *     Recording row → invisible in UI.
 *   - Our `startRecording` already sets s3Config to OUR bucket, so most files
 *     land directly in our S3. But egress started elsewhere may use LiveKit's
 *     storage. This cron handles both.
 *
 * Per tick:
 *   1. listEgress with multiple filters — collect terminal egress.
 *   2. For each egressId not in our Recording collection:
 *      a. Read fileResults to get the storage URL/key.
 *      b. If file already in our S3 (HEAD ok) → just create Recording row.
 *      c. Else: download from LiveKit's URL, upload to our S3 under the same
 *         key, then create Recording row.
 *   3. Insert via Recording.create — race-safe via unique index on egressId.
 *
 * Recordings collection is APPEND-ONLY by design (no delete paths exist).
 *
 * Wired in src/index.js — startup + SIGTERM cleanup.
 */

import { EgressClient, EgressStatus } from 'livekit-server-sdk';
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import config from '../config/config.js';
import logger from '../config/logger.js';
import Recording, { recordingRank } from '../models/recording.model.js';

const DISCOVERY_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_FILE_DOWNLOAD_MB = 500;
const RUN_TIMEOUT_MS = 30 * 60 * 1000;

let intervalId = null;
let inFlight = false;

const isLiveKitCloud = (config.livekit?.url || '').includes('livekit.cloud');
const isLocalDev =
  !isLiveKitCloud &&
  (config.env !== 'production' || !config.aws?.accessKeyId || !config.aws?.secretAccessKey);

function buildS3() {
  if (isLocalDev) {
    return {
      client: new S3Client({
        region: 'us-east-1',
        endpoint: config.livekit?.minio?.endpoint || 'http://minio:9000',
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.livekit?.minio?.accessKey || 'minioadmin',
          secretAccessKey: config.livekit?.minio?.secretKey || 'minioadmin123',
        },
      }),
      bucket: config.livekit?.minio?.bucket || 'recordings',
    };
  }
  return {
    client: new S3Client({
      region: config.aws?.region || 'us-east-1',
      ...(config.aws?.accessKeyId
        ? {
            credentials: {
              accessKeyId: config.aws.accessKeyId,
              secretAccessKey: config.aws.secretAccessKey,
            },
          }
        : {}),
    }),
    bucket: config.livekit?.s3Bucket || config.aws?.bucketName,
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

async function s3Has(client, bucket, key) {
  try {
    const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { ok: true, size: Number(r.ContentLength || 0) };
  } catch {
    return { ok: false };
  }
}

/**
 * Mirror a LiveKit-hosted file into our S3 bucket under the same key.
 */
async function ingestRemote(client, bucket, sourceUrl, targetKey) {
  const res = await fetch(sourceUrl);
  if (!res.ok || !res.body) {
    logger.warn(`[recordingDiscovery] fetch ${sourceUrl} → ${res.status}`);
    return null;
  }
  const sizeHeader = Number(res.headers.get('content-length') || 0);
  if (sizeHeader && sizeHeader > MAX_FILE_DOWNLOAD_MB * 1024 * 1024) {
    logger.warn(`[recordingDiscovery] file ${sourceUrl} > ${MAX_FILE_DOWNLOAD_MB}MB; skipping`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) return null;
  const contentType =
    res.headers.get('content-type') ||
    (targetKey.endsWith('.webm') ? 'video/webm' : 'video/mp4');
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: targetKey,
      Body: buf,
      ContentType: contentType,
    })
  );
  return { key: targetKey, bytes: buf.length };
}

function pickStorageUrlAndKey(info) {
  const fr = info.fileResults || info.file_results || info.fileResultsList;
  const f0 = fr?.[0] || info.files?.[0] || {};
  const filename = f0.filename || f0.filepath || f0.location || null;
  const isUrl = (s) => typeof s === 'string' && /^https?:\/\//i.test(s);
  let key = filename;
  let sourceUrl = null;
  if (isUrl(filename)) {
    try {
      key = new URL(filename).pathname.replace(/^\/+/, '');
      sourceUrl = filename;
    } catch {
      /* not a parseable URL */
    }
  } else if (isUrl(f0.location)) {
    sourceUrl = f0.location;
  }
  return {
    sourceUrl,
    key,
    bytes: Number(f0.size || f0.bytes || 0) || null,
  };
}

async function discoverOnce() {
  if (inFlight) {
    logger.info('[recordingDiscovery] previous tick still running; skipping');
    return;
  }
  inFlight = true;
  const tickStart = Date.now();

  try {
    const apiKey = config.livekit?.apiKey;
    const apiSecret = config.livekit?.apiSecret;
    if (!apiKey || !apiSecret) {
      logger.warn('[recordingDiscovery] LiveKit creds missing; skipping');
      return;
    }
    const livekitUrl = (config.livekit?.url || 'ws://localhost:7880').replace(/^ws/, 'http');
    const eg = new EgressClient(livekitUrl, apiKey, apiSecret);
    const { client, bucket } = buildS3();
    if (!bucket) {
      logger.warn('[recordingDiscovery] no S3 bucket configured; skipping');
      return;
    }

    let inserted = 0;
    let alreadyKnown = 0;
    let failed = 0;
    let totalSeen = 0;

    // Try multiple filters since LiveKit's default may exclude completed.
    const filters = [{}, { active: false }];
    const seenIds = new Set();

    for (const filter of filters) {
      if (Date.now() - tickStart > RUN_TIMEOUT_MS) break;
      let list = [];
      try {
        list = await eg.listEgress(filter);
      } catch (err) {
        logger.warn(`[recordingDiscovery] listEgress(${JSON.stringify(filter)}) failed: ${err.message}`);
        continue;
      }
      for (const info of list || []) {
        const egressId = info.egressId;
        if (!egressId || seenIds.has(egressId)) continue;
        seenIds.add(egressId);
        totalSeen += 1;

        const isTerminal =
          info.status === EgressStatus.EGRESS_COMPLETE || Number(info.status) >= 3;
        if (!isTerminal) continue;

        const existing = await Recording.findOne({ egressId }).select('_id').lean();
        if (existing) {
          alreadyKnown += 1;
          continue;
        }

        const { sourceUrl, key, bytes: bytesFromEgress } = pickStorageUrlAndKey(info);
        if (!key) {
          logger.warn(`[recordingDiscovery] egress ${egressId} has no file path; skipping`);
          failed += 1;
          continue;
        }

        let s3 = await s3Has(client, bucket, key);
        if (!s3.ok && sourceUrl) {
          try {
            const ingest = await ingestRemote(client, bucket, sourceUrl, key);
            if (ingest) s3 = { ok: true, size: ingest.bytes };
          } catch (err) {
            logger.warn(`[recordingDiscovery] ingest ${sourceUrl} failed: ${err.message}`);
          }
        }
        if (!s3.ok) {
          logger.warn(`[recordingDiscovery] egress ${egressId} file unreachable; skipping`);
          failed += 1;
          continue;
        }

        const startedAtMs = nsToMs(info.startedAt);
        const endedAtMs = nsToMs(info.endedAt);
        const status = (s3.size || bytesFromEgress) > 0 ? 'completed' : 'missing';

        try {
          await Recording.create({
            meetingId: info.roomName || 'unknown',
            egressId,
            filePath: key,
            s3Bucket: bucket,
            s3Key: key,
            bytes: s3.size || bytesFromEgress || null,
            status,
            statusRank: recordingRank(status),
            startedAt: startedAtMs ? new Date(startedAtMs) : new Date(),
            completedAt: endedAtMs ? new Date(endedAtMs) : new Date(),
            durationMs:
              startedAtMs && endedAtMs ? Math.max(0, endedAtMs - startedAtMs) : null,
          });
          inserted += 1;
          logger.info(
            `[recordingDiscovery] inserted egressId=${egressId} room=${info.roomName} key=${key}`
          );
        } catch (err) {
          if (err.code === 11000) {
            alreadyKnown += 1;
          } else {
            failed += 1;
            logger.warn(`[recordingDiscovery] insert failed for ${egressId}: ${err.message}`);
          }
        }
      }
    }

    if (totalSeen || inserted || failed) {
      logger.info(
        `[recordingDiscovery] tick: seen=${totalSeen} known=${alreadyKnown} inserted=${inserted} failed=${failed}`
      );
    }
  } catch (err) {
    logger.error(`[recordingDiscovery] tick failed: ${err.message}`);
  } finally {
    inFlight = false;
  }
}

export function startRecordingDiscoveryScheduler() {
  if (intervalId) return intervalId;
  // Fire once at startup so a freshly-deployed instance catches up.
  discoverOnce();
  intervalId = setInterval(discoverOnce, DISCOVERY_INTERVAL_MS);
  logger.info(`[recordingDiscovery] scheduler started (every ${DISCOVERY_INTERVAL_MS / 60000} min)`);
  return intervalId;
}

export function stopRecordingDiscoveryScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[recordingDiscovery] scheduler stopped');
    return true;
  }
  return false;
}

export { discoverOnce };
