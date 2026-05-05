/**
 * Recording reconciliation cron — safety net for missed webhooks and stuck egress.
 *
 * Tightened thresholds vs prior version (was 15min interval, 2h stale):
 *   - 2 min interval
 *   - 5 min "stale" cutoff for non-terminal rows
 *   - 8 h hard force-resolve for any row still active
 *
 * Resolves rows in any non-terminal state (pending/recording/stopping/finalizing)
 * by querying LiveKit egress and routing the result through recordingSync.
 *
 * Pending rows: rare. They mean startRoomCompositeEgress succeeded but
 * attachEgressId Mongo write failed. We have no egressId — mark missing.
 */

import { EgressStatus } from 'livekit-server-sdk';
import Recording from '../models/recording.model.js';
import recordingSyncService from './recordingSync.service.js';
import logger from '../config/logger.js';

const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const FORCE_RESOLVE_THRESHOLD_MS = 8 * 60 * 60 * 1000;
const RECONCILE_INTERVAL_MS = 2 * 60 * 1000;

let intervalId = null;

const NON_TERMINAL = ['pending', 'recording', 'stopping', 'finalizing'];

/**
 * Resolve a single stale recording. Returns final status string or null if skipped.
 */
const resolveStaleRecording = async (recording, egressClient) => {
  const { egressId, _id } = recording;

  // Pending row with no egressId: orphan from a failed two-phase start.
  if (!egressId) {
    await Recording.findByIdAndUpdate(_id, {
      $set: {
        status: 'missing',
        statusRank: 10,
        completedAt: new Date(),
        lastError: 'pending row with no egressId; egress start likely failed silently',
      },
    });
    logger.warn('[Recording cron] Pending row → missing', { recordingId: String(_id) });
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
      logger.warn('[Recording cron] Egress lookup error', { egressId, error: err.message });
      return null;
    }
  }

  const now = new Date();

  // Egress purged from LiveKit → mark missing.
  if (!egressInfo) {
    await recordingSyncService.transitionRecording(egressId, 'missing', {
      completedAt: now,
      lastError: 'Egress purged from LiveKit',
    });
    logger.info('[Recording cron] Resolved purged egress → missing', { egressId, recordingId: String(_id) });
    return 'missing';
  }

  const egressStatus = egressInfo.status;
  const isTerminal =
    egressStatus === EgressStatus.EGRESS_COMPLETE ||
    egressStatus === EgressStatus.EGRESS_FAILED ||
    egressStatus === EgressStatus.EGRESS_ABORTED ||
    egressStatus === EgressStatus.EGRESS_LIMIT_REACHED ||
    Number(egressStatus) >= 3;

  if (!isTerminal) {
    const startedAt = new Date(recording.startedAt);
    if (Number.isNaN(startedAt.getTime())) {
      await recordingSyncService.transitionRecording(egressId, 'missing', {
        completedAt: now,
        lastError: 'Invalid startedAt during reconcile',
      });
      return 'missing';
    }
    const age = now - startedAt;
    if (age < FORCE_RESOLVE_THRESHOLD_MS) {
      // Still active and within window — leave it. Next webhook should resolve.
      return null;
    }
    logger.warn('[Recording cron] Force-resolving active egress > 8h', { egressId });
  }

  // Terminal in LiveKit; figure out filePath + status.
  const fileResults =
    egressInfo.fileResults || egressInfo.file_results || egressInfo.fileResultsList;
  const f0 = fileResults?.[0] || egressInfo.files?.[0] || {};
  const filePath = f0.filename || f0.filepath || f0.location;
  const bytes = Number(f0.size || f0.bytes || 0) || null;

  // LiveKit endedAt: ns (bigint/string), ms, or seconds. Branch by magnitude
  // to avoid the 1970-date bug from the prior unconditional ns conversion.
  const endedAtRaw = egressInfo.endedAt;
  let endedMs = null;
  if (endedAtRaw != null && endedAtRaw !== '') {
    let n;
    if (typeof endedAtRaw === 'bigint') {
      n = Number(endedAtRaw);
    } else if (typeof endedAtRaw === 'number') {
      n = endedAtRaw;
    } else {
      const s = String(endedAtRaw).trim();
      if (/^\d+(\.\d+)?$/.test(s)) {
        try { n = Number(BigInt(s.split('.')[0])); } catch { n = Number(s); }
      } else {
        const parsed = Date.parse(s);
        n = Number.isNaN(parsed) ? null : parsed;
      }
    }
    if (Number.isFinite(n) && n > 0) {
      if (n >= 1e16) endedMs = Math.floor(n / 1e6);       // ns
      else if (n >= 1e10) endedMs = Math.floor(n);        // ms
      else endedMs = Math.floor(n * 1000);                // seconds
    }
  }
  const completedAt = endedMs ? new Date(endedMs) : now;

  if (filePath) {
    await recordingSyncService.transitionRecording(egressId, 'completed', {
      completedAt,
      filePath,
      bytes,
    });
    logger.info('[Recording cron] Resolved → completed', { egressId, recordingId: String(_id) });
    return 'completed';
  }

  await recordingSyncService.transitionRecording(egressId, 'missing', {
    completedAt,
    lastError: 'Terminal in LiveKit but no filePath in egressInfo',
  });
  logger.info('[Recording cron] Resolved → missing (no filePath)', { egressId, recordingId: String(_id) });
  return 'missing';
};

export const runRecoveryPass = async (egressClient) => {
  if (!egressClient) return;

  const threshold = new Date(Date.now() - STALE_THRESHOLD_MS);

  const stale = await Recording.find({
    status: { $in: NON_TERMINAL },
    startedAt: { $lt: threshold },
  })
    .limit(200)
    .lean();

  if (!stale.length) return;

  logger.info(`[Recording cron] ${stale.length} stale row(s) — resolving`);

  let completed = 0;
  let missing = 0;
  let skipped = 0;

  for (const rec of stale) {
    try {
      const result = await resolveStaleRecording(rec, egressClient);
      if (result === 'completed') completed += 1;
      else if (result === 'missing') missing += 1;
      else skipped += 1;
    } catch (err) {
      logger.error('[Recording cron] resolve failed', { recordingId: String(rec._id), error: err.message });
      skipped += 1;
    }
  }

  logger.info(`[Recording cron] pass done — completed:${completed} missing:${missing} skipped:${skipped}`);
};

export const startRecordingScheduler = (egressClient) => {
  if (intervalId) return;
  runRecoveryPass(egressClient);
  intervalId = setInterval(() => runRecoveryPass(egressClient), RECONCILE_INTERVAL_MS);
  logger.info(
    `[Recording cron] started (interval: ${RECONCILE_INTERVAL_MS / 60000} min, stale: ${
      STALE_THRESHOLD_MS / 60000
    } min)`
  );
};

export const stopRecordingScheduler = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[Recording cron] stopped');
  }
};
