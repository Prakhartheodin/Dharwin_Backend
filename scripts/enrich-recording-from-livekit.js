/**
 * Enrich Recording rows with accurate timing fetched from LiveKit by roomName.
 *
 * Why this approach:
 *   - The "egressId" in the S3 key (`rec_<hex>_<ts>`) is the egress recorder
 *     PARTICIPANT IDENTITY, not LiveKit's egressId (which starts with `EG_`).
 *     Querying listEgress({egressId}) with that hex always returns "not found".
 *   - Querying by roomName returns ALL egress for that room. We then match by
 *     start-time proximity to identify the correct egress for this Recording.
 *
 * For each row with meetingId AND (durationMs null/missing OR > 24h):
 *   1. listEgress({roomName}) → array
 *   2. Pick the egress whose startedAt is closest to row.startedAt (within 1h)
 *   3. Pull info.startedAt + info.endedAt (ns → ms) → durationMs
 *   4. Overwrite egressId with the REAL EG_* id, plus startedAt/completedAt/duration
 *
 * Usage:
 *   node scripts/enrich-recording-from-livekit.js          # dry run
 *   node scripts/enrich-recording-from-livekit.js --apply  # write
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { EgressClient } from 'livekit-server-sdk';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const MONGO_URL = process.env.MONGODB_URL || process.env.MONGO_URI || process.env.DATABASE_URL;
if (!MONGO_URL) { console.error('No MongoDB URL.'); process.exit(1); }
const APPLY = process.argv.includes('--apply');
const MAX_MS = 24 * 60 * 60 * 1000;
const MATCH_WINDOW_MS = 60 * 60 * 1000; // accept egress whose startedAt is within 1h of row's

const livekitUrl = (process.env.LIVEKIT_URL || 'ws://localhost:7880').replace(/^ws/, 'http');
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
if (!apiKey || !apiSecret) { console.error('LiveKit creds missing.'); process.exit(1); }
const eg = new EgressClient(livekitUrl, apiKey, apiSecret);

const recordingSchema = new mongoose.Schema({}, { strict: false });
const Recording = mongoose.models.Recording || mongoose.model('Recording', recordingSchema);

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

async function main() {
  await mongoose.connect(MONGO_URL);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  const candidates = await Recording.find(
    {
      meetingId: { $exists: true, $nin: [null, ''] },
      $or: [
        { durationMs: null },
        { durationMs: { $exists: false } },
        { durationMs: { $gt: MAX_MS } },
      ],
    },
    { _id: 1, egressId: 1, startedAt: 1, completedAt: 1, durationMs: 1, status: 1, meetingId: 1, filePath: 1, bytes: 1 }
  ).lean();

  console.log(`Candidates: ${candidates.length}`);

  // Cache listEgress per roomName so multiple recordings in same room hit LiveKit once.
  const cache = new Map();
  async function listForRoom(roomName) {
    if (cache.has(roomName)) return cache.get(roomName);
    let out = [];
    try {
      out = await eg.listEgress({ roomName });
    } catch (err) {
      console.warn(`[enrich] listEgress(roomName=${roomName}) failed: ${err.message}`);
    }
    cache.set(roomName, out || []);
    return out || [];
  }

  let updated = 0;
  let noMatch = 0;
  let stillUnknown = 0;

  for (const r of candidates) {
    const list = await listForRoom(r.meetingId);
    if (!list.length) {
      noMatch += 1;
      continue;
    }

    const rowStartedMs = r.startedAt ? new Date(r.startedAt).getTime() : null;

    // Pick best match: smallest |startedAt diff| within MATCH_WINDOW_MS.
    let best = null;
    let bestDelta = Infinity;
    for (const info of list) {
      const egStartedMs = nsToMs(info.startedAt);
      if (!egStartedMs) continue;
      const delta = rowStartedMs ? Math.abs(egStartedMs - rowStartedMs) : 0;
      if (delta < bestDelta) {
        bestDelta = delta;
        best = info;
      }
    }
    if (!best || (rowStartedMs && bestDelta > MATCH_WINDOW_MS)) {
      // Fallback: only one egress in this room → take it.
      if (list.length === 1) best = list[0];
      else { noMatch += 1; continue; }
    }

    const startedAtMs = nsToMs(best.startedAt);
    const endedAtMs = nsToMs(best.endedAt);
    const fileResults = best.fileResults || best.file_results || best.fileResultsList;
    const f0 = fileResults?.[0] || best.files?.[0] || {};
    const filePath = f0.filename || f0.filepath || f0.location || r.filePath;
    const bytes = Number(f0.size || f0.bytes || 0) || r.bytes || null;

    let durationMs = null;
    if (startedAtMs && endedAtMs) {
      const diff = endedAtMs - startedAtMs;
      if (Number.isFinite(diff) && diff >= 0 && diff <= MAX_MS) durationMs = diff;
    }

    const set = {};
    if (best.egressId && best.egressId !== r.egressId) set.egressId = best.egressId;
    if (startedAtMs) set.startedAt = new Date(startedAtMs);
    if (endedAtMs) set.completedAt = new Date(endedAtMs);
    set.durationMs = durationMs;
    if (filePath) set.filePath = filePath;
    if (bytes) set.bytes = bytes;

    console.log(
      `[enrich] ${r._id} room=${r.meetingId} oldEg=${r.egressId} → newEg=${best.egressId} startedAt=${startedAtMs ? new Date(startedAtMs).toISOString() : '-'} endedAt=${endedAtMs ? new Date(endedAtMs).toISOString() : '-'} dur=${durationMs}ms`
    );

    if (APPLY) {
      try {
        await Recording.updateOne({ _id: r._id }, { $set: set });
      } catch (err) {
        if (err.code === 11000) {
          console.warn(`[enrich] dup egressId on ${r._id}, skipping egressId rewrite`);
          delete set.egressId;
          await Recording.updateOne({ _id: r._id }, { $set: set });
        } else throw err;
      }
    }
    if (durationMs != null) updated += 1;
    else stillUnknown += 1;
  }

  console.log(`\nSummary: candidates=${candidates.length} updated=${updated} noMatch=${noMatch} stillUnknown=${stillUnknown}`);
  if (!APPLY) console.log('Dry run only.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
