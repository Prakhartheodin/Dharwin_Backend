/**
 * One-shot migration: backfill `statusRank` on existing Recording rows.
 *
 * The new schema introduces `statusRank` as a monotonic guard (see
 * src/models/recording.model.js). Existing rows have no rank — without this
 * migration, the next webhook would treat every existing row as rank 0
 * and could regress completed → recording.
 *
 * Maps current status → rank:
 *   recording             → 1
 *   completed/missing     → 10
 *   anything unknown      → 0
 *
 * Usage:
 *   node scripts/migrate-recording-statusrank.js          # dry run
 *   node scripts/migrate-recording-statusrank.js --apply  # write
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const MONGO_URL = process.env.MONGODB_URL || process.env.MONGO_URI || process.env.DATABASE_URL;
if (!MONGO_URL) {
  console.error('No MongoDB URL found in env. Set MONGODB_URL.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

const RECORDING_RANK = {
  pending: 0,
  recording: 1,
  stopping: 2,
  finalizing: 3,
  completed: 10,
  failed: 10,
  missing: 10,
  expired: 10,
};

const recordingSchema = new mongoose.Schema({}, { strict: false });
const Recording = mongoose.models.Recording || mongoose.model('Recording', recordingSchema);

async function main() {
  await mongoose.connect(MONGO_URL);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  const rows = await Recording.find(
    { $or: [{ statusRank: { $exists: false } }, { statusRank: null }] },
    { _id: 1, status: 1, statusRank: 1 }
  ).lean();

  console.log(`Rows missing statusRank: ${rows.length}`);

  const buckets = new Map();
  for (const r of rows) {
    const key = String(r.status || 'unknown').toLowerCase();
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  console.log('Distribution:');
  for (const [s, n] of buckets.entries()) {
    console.log(`  ${s.padEnd(12)} → rank ${RECORDING_RANK[s] ?? 0}  count=${n}`);
  }

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write.');
    await mongoose.disconnect();
    process.exit(0);
  }

  let written = 0;
  for (const status of buckets.keys()) {
    const rank = RECORDING_RANK[status] ?? 0;
    const r = await Recording.updateMany(
      { status, $or: [{ statusRank: { $exists: false } }, { statusRank: null }] },
      { $set: { statusRank: rank } }
    );
    written += r.modifiedCount || 0;
  }
  console.log(`\nUpdated rows: ${written}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
