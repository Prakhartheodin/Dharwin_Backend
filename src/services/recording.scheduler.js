import { EgressStatus } from 'livekit-server-sdk';
import Recording from '../models/recording.model.js';
import logger from '../config/logger.js';

// Recordings stuck in 'recording' longer than this are considered stale
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
// If egress is somehow still active after this long, force-resolve as missing
const FORCE_RESOLVE_THRESHOLD_MS = 8 * 60 * 60 * 1000; // 8 hours

let intervalId = null;

/**
 * Resolve a single stale recording by querying LiveKit egress API.
 * Returns the resolved status string, or null if skipped.
 */
const resolveStaleRecording = async (recording, egressClient) => {
  const { egressId, _id } = recording;

  let egressInfo = null;
  try {
    const results = await egressClient.listEgress({ egressId });
    egressInfo = results?.[0] || null;
  } catch (err) {
    const notFound =
      err?.message?.toLowerCase().includes('not found') ||
      err?.message?.toLowerCase().includes('cannot be found');
    if (!notFound) {
      logger.warn('[Recording scheduler] Egress lookup error', { egressId, error: err.message });
      return null;
    }
    // Egress purged from LiveKit — file will never arrive
  }

  const now = new Date();

  if (!egressInfo) {
    await Recording.findByIdAndUpdate(_id, { status: 'missing', completedAt: now });
    logger.info('[Recording scheduler] Resolved purged egress → missing', { egressId, recordingId: String(_id) });
    return 'missing';
  }

  const status = egressInfo.status;
  const isTerminal =
    status === EgressStatus.EGRESS_COMPLETE ||
    status === EgressStatus.EGRESS_FAILED ||
    status === EgressStatus.EGRESS_ABORTED ||
    status === EgressStatus.EGRESS_LIMIT_REACHED ||
    Number(status) >= 3;

  if (!isTerminal) {
    const age = now - new Date(recording.startedAt);
    if (age < FORCE_RESOLVE_THRESHOLD_MS) return null;
    logger.warn('[Recording scheduler] Force-resolving active egress older than 8h', { egressId });
  }

  const endedAt = egressInfo.endedAt ? new Date(Number(egressInfo.endedAt) * 1000) : now;

  const fileResults = egressInfo.fileResults || egressInfo.file_results || egressInfo.fileResultsList;
  const filePath =
    fileResults?.[0]?.filename ||
    fileResults?.[0]?.filepath ||
    fileResults?.[0]?.location ||
    egressInfo.files?.[0]?.filename ||
    egressInfo.files?.[0]?.location;

  const resolvedStatus = filePath ? 'completed' : 'missing';
  const update = { status: resolvedStatus, completedAt: endedAt };
  if (filePath) update.filePath = filePath;

  await Recording.findByIdAndUpdate(_id, update);
  logger.info('[Recording scheduler] Resolved stale egress', {
    egressId,
    recordingId: String(_id),
    resolvedStatus,
    filePath: filePath || null,
  });
  return resolvedStatus;
};

export const runRecoveryPass = async (egressClient) => {
  if (!egressClient) return;

  const threshold = new Date(Date.now() - STALE_THRESHOLD_MS);
  const stale = await Recording.find({ status: 'recording', startedAt: { $lt: threshold } }).lean();

  if (!stale.length) return;

  logger.info(`[Recording scheduler] Found ${stale.length} stale recording(s) — resolving`);

  let completed = 0;
  let missing = 0;
  let skipped = 0;
  for (const rec of stale) {
    const result = await resolveStaleRecording(rec, egressClient);
    if (result === 'completed') completed++;
    else if (result === 'missing') missing++;
    else skipped++;
  }

  logger.info(
    `[Recording scheduler] Recovery pass done — completed:${completed} missing:${missing} skipped:${skipped}`
  );
};

export const startRecordingScheduler = (egressClient) => {
  if (intervalId) return;
  runRecoveryPass(egressClient);
  intervalId = setInterval(() => runRecoveryPass(egressClient), 15 * 60 * 1000);
  logger.info('[Recording scheduler] Started (interval: 15 min, stale threshold: 2h)');
};

export const stopRecordingScheduler = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[Recording scheduler] Stopped');
  }
};
