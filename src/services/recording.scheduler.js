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

  // 🔥 Guard: missing egressId
  if (!egressId) {
    logger.warn('[Recording scheduler] Missing egressId', {
      recordingId: String(_id),
    });

    await Recording.findByIdAndUpdate(_id, {
      status: 'missing',
      completedAt: new Date(),
    });

    return 'missing';
  }

  let egressInfo = null;
  try {
    const results = await egressClient.listEgress({ egressId });
    egressInfo = results?.[0] || null;
  } catch (err) {
    const notFound =
      err?.message?.toLowerCase().includes('not found') ||
      err?.message?.toLowerCase().includes('cannot be found');

    if (!notFound) {
      logger.warn('[Recording scheduler] Egress lookup error', {
        egressId,
        error: err.message,
      });
      return null;
    }
    // Egress purged from LiveKit
  }

  const now = new Date();

  // 🔥 If egress doesn't exist anymore → mark missing
  if (!egressInfo) {
    await Recording.findByIdAndUpdate(_id, {
      status: 'missing',
      completedAt: now,
    });

    logger.info('[Recording scheduler] Resolved purged egress → missing', {
      egressId,
      recordingId: String(_id),
    });

    return 'missing';
  }

  const status = egressInfo.status;

  const isTerminal =
    status === EgressStatus.EGRESS_COMPLETE ||
    status === EgressStatus.EGRESS_FAILED ||
    status === EgressStatus.EGRESS_ABORTED ||
    status === EgressStatus.EGRESS_LIMIT_REACHED ||
    Number(status) >= 3;

  // 🔥 Handle non-terminal state safely
  if (!isTerminal) {
    const startedAt = new Date(recording.startedAt);

    if (isNaN(startedAt.getTime())) {
      logger.warn('[Recording scheduler] Invalid startedAt, forcing resolve', {
        recordingId: String(_id),
        startedAt: recording.startedAt,
      });

      await Recording.findByIdAndUpdate(_id, {
        status: 'missing',
        completedAt: new Date(),
      });

      return 'missing';
    }

    const age = now - startedAt;

    if (age < FORCE_RESOLVE_THRESHOLD_MS) return null;

    logger.warn(
      '[Recording scheduler] Force-resolving active egress older than 8h',
      { egressId }
    );
  }

  // 🔥 Safe endedAt handling
  const endedAtMs = egressInfo.endedAt
    ? Number(egressInfo.endedAt) * 1000
    : NaN;

  const endedAt =
    Number.isFinite(endedAtMs) && endedAtMs > 0
      ? new Date(endedAtMs)
      : now;

  const safeCompletedAt =
    endedAt instanceof Date && !isNaN(endedAt.getTime())
      ? endedAt
      : new Date();

  const fileResults =
    egressInfo.fileResults ||
    egressInfo.file_results ||
    egressInfo.fileResultsList;

  const filePath =
    fileResults?.[0]?.filename ||
    fileResults?.[0]?.filepath ||
    fileResults?.[0]?.location ||
    egressInfo.files?.[0]?.filename ||
    egressInfo.files?.[0]?.location;

  const resolvedStatus = filePath ? 'completed' : 'missing';

  const update = {
    status: resolvedStatus,
    completedAt: safeCompletedAt,
  };

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

  const stale = await Recording.find({
    status: 'recording',
    startedAt: { $lt: threshold },
  }).lean();

  if (!stale.length) return;

  logger.info(
    `[Recording scheduler] Found ${stale.length} stale recording(s) — resolving`
  );

  let completed = 0;
  let missing = 0;
  let skipped = 0;

  // 🔥 Safe loop (no crash)
  for (const rec of stale) {
    try {
      const result = await resolveStaleRecording(rec, egressClient);

      if (result === 'completed') completed++;
      else if (result === 'missing') missing++;
      else skipped++;
    } catch (err) {
      logger.error('[Recording scheduler] Failed resolving recording', {
        recordingId: String(rec._id),
        error: err.message,
      });
      skipped++;
    }
  }

  logger.info(
    `[Recording scheduler] Recovery pass done — completed:${completed} missing:${missing} skipped:${skipped}`
  );
};

export const startRecordingScheduler = (egressClient) => {
  if (intervalId) return;

  runRecoveryPass(egressClient);

  intervalId = setInterval(
    () => runRecoveryPass(egressClient),
    15 * 60 * 1000
  );

  logger.info(
    '[Recording scheduler] Started (interval: 15 min, stale threshold: 2h)'
  );
};

export const stopRecordingScheduler = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[Recording scheduler] Stopped');
  }
};