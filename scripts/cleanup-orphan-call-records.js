/**
 * Delete junk CallRecord rows created by the legacy backfill path.
 *
 * Symptoms in UI: Telephony source rows with status="Unknown", no caller, no
 * recipient, no business name. Source: Bolna agent-list endpoint returns every
 * execution under the agent_id (including foreign/test calls + queued execs
 * with no telephony fields). The old code did `CallRecord.create` on every
 * exec; the new callSync path now skips backfill stub-creation, but pre-existing
 * junk rows remain. This script removes them.
 *
 * Match rule (conservative — only deletes rows that have NO usable signal):
 *   - status = unknown OR initiated (no progress)
 *   - all phone fields empty
 *   - no candidate ref AND no job ref
 *   - no transcript AND no recordingUrl AND no duration
 *
 * Usage:
 *   node scripts/cleanup-orphan-call-records.js              # dry run, prints count + sample
 *   node scripts/cleanup-orphan-call-records.js --apply      # actually delete
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

const callRecordSchema = new mongoose.Schema({}, { strict: false });
const CallRecord = mongoose.models.CallRecord || mongoose.model('CallRecord', callRecordSchema);

async function main() {
  await mongoose.connect(MONGO_URL);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (will delete)' : 'DRY RUN'}`);

  const orphanFilter = {
    status: { $in: ['unknown', 'initiated'] },
    $and: [
      { $or: [{ toPhoneNumber: { $in: [null, ''] } }, { toPhoneNumber: { $exists: false } }] },
      { $or: [{ recipientPhoneNumber: { $in: [null, ''] } }, { recipientPhoneNumber: { $exists: false } }] },
      { $or: [{ phone: { $in: [null, ''] } }, { phone: { $exists: false } }] },
      { $or: [{ candidate: null }, { candidate: { $exists: false } }] },
      { $or: [{ job: null }, { job: { $exists: false } }] },
      { $or: [{ transcript: { $in: [null, ''] } }, { transcript: { $exists: false } }] },
      { $or: [{ recordingUrl: { $in: [null, ''] } }, { recordingUrl: { $exists: false } }] },
      { $or: [{ duration: null }, { duration: { $exists: false } }, { duration: 0 }] },
    ],
  };

  const total = await CallRecord.countDocuments(orphanFilter);
  console.log(`Orphan rows matched: ${total}`);

  const sample = await CallRecord.find(orphanFilter)
    .select('_id executionId status agentId createdAt raw.fromList')
    .limit(10)
    .lean();
  console.log('Sample (up to 10):');
  for (const r of sample) {
    console.log(
      `  ${r._id}  exec=${r.executionId || '-'}  status=${r.status}  agent=${r.agentId || '-'}  fromList=${r.raw?.fromList || false}  createdAt=${r.createdAt?.toISOString?.() || '-'}`
    );
  }

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to delete.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const result = await CallRecord.deleteMany(orphanFilter);
  console.log(`\nDeleted: ${result.deletedCount}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
