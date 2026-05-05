/**
 * Reconciliation cron — safety net for missed Bolna webhooks.
 *
 * Two passes per tick:
 *   1. reconcileStuckRecords  — for any CallRecord stuck in non-terminal state
 *      for > 5 min, GET /execution/:id and feed the response through
 *      callSyncService.applyEvent. Catches dropped webhooks.
 *   2. backfillFromAgentList  — list recent Bolna agent executions and feed
 *      them through applyEvent. Catches calls Bolna fired but never told us
 *      about (e.g. webhook endpoint mis-configured).
 *
 * Both routes converge on callSyncService.applyEvent — the only writer of
 * Bolna-derived fields. No more inline status-merge / field-overwrite logic.
 */

import logger from '../config/logger.js';
import bolnaService from './bolna.service.js';
import callSyncService from './callSync.service.js';
import CallRecord, { TERMINAL_STATUSES } from '../models/callRecord.model.js';
import config from '../config/config.js';

const STUCK_THRESHOLD_MS = 5 * 60 * 1000;
const RECONCILE_LOOKBACK_DAYS = 30;
const RECONCILE_BATCH = 100;
const BACKFILL_PAGE_SIZE = 50;
const BACKFILL_PAGES = 1;

async function reconcileStuckRecords() {
  const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);
  const lookbackCutoff = new Date(Date.now() - RECONCILE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const stuck = await CallRecord.find({
    executionId: { $exists: true, $ne: null },
    status: { $nin: [...TERMINAL_STATUSES] },
    statusUpdatedAt: { $lte: stuckCutoff },
    createdAt: { $gte: lookbackCutoff },
  })
    .select('executionId status')
    .limit(RECONCILE_BATCH)
    .lean();

  if (!stuck.length) return { reconciled: 0, applied: 0, errors: 0 };

  let applied = 0;
  let errors = 0;
  for (const rec of stuck) {
    try {
      const r = await bolnaService.getExecutionDetails(rec.executionId);
      if (!r.success || !r.details) {
        errors += 1;
        continue;
      }
      // Bolna 404 → execution gone. Mark expired so we stop polling it.
      if (
        r.details.status === 'unknown' &&
        typeof r.details.error_message === 'string' &&
        r.details.error_message.includes('not found')
      ) {
        const result = await callSyncService.applyEvent(
          {
            id: rec.executionId,
            execution_id: rec.executionId,
            status: 'expired',
            error_message: r.details.error_message,
            updated_at: new Date().toISOString(),
          },
          'reconciliation'
        );
        if (result.applied) applied += 1;
        continue;
      }
      const result = await callSyncService.applyEvent(
        { ...r.details, id: r.details.id ?? r.details.execution_id ?? rec.executionId },
        'reconciliation'
      );
      if (result.applied) applied += 1;
    } catch (err) {
      errors += 1;
      logger.warn(`[callSync cron] reconcile failed for ${rec.executionId}: ${err.message}`);
    }
  }
  return { reconciled: stuck.length, applied, errors };
}

async function backfillFromAgentList() {
  const agents = [config.bolna?.agentId, config.bolna?.candidateAgentId].filter(Boolean);
  const uniqueAgents = [...new Set(agents)];
  let scanned = 0;
  let applied = 0;
  let errors = 0;

  for (const agentId of uniqueAgents) {
    for (let page = 1; page <= BACKFILL_PAGES; page += 1) {
      try {
        const r = await bolnaService.getAgentExecutions({
          agentId,
          page_number: page,
          page_size: BACKFILL_PAGE_SIZE,
        });
        if (!r.success || !Array.isArray(r.data)) {
          errors += 1;
          break;
        }
        scanned += r.data.length;
        for (const exec of r.data) {
          const payload = {
            ...exec,
            id: exec.id ?? exec.execution_id,
            agent_id: exec.agent_id ?? agentId,
          };
          const result = await callSyncService.applyEvent(payload, 'backfill');
          if (result.applied) applied += 1;
        }
        if (!r.has_more) break;
      } catch (err) {
        errors += 1;
        logger.warn(`[callSync cron] backfill page ${page} agent=${agentId} failed: ${err.message}`);
      }
    }
  }
  return { scanned, applied, errors };
}

export async function runCallHistorySync() {
  try {
    const reconcile = await reconcileStuckRecords();
    const backfill = await backfillFromAgentList();
    if (reconcile.reconciled || backfill.applied || reconcile.errors || backfill.errors) {
      logger.info(
        `[callSync cron] reconcile=${reconcile.reconciled}/applied=${reconcile.applied}/err=${reconcile.errors} ` +
          `backfill=${backfill.scanned}/applied=${backfill.applied}/err=${backfill.errors}`
      );
    }
  } catch (err) {
    logger.error(`[callSync cron] tick failed: ${err.message}`);
  }
}

export function startCallRecordSyncScheduler(intervalMinutes = 1) {
  const intervalMs = Math.max(1, Number(intervalMinutes) || 1) * 60 * 1000;
  // Fire-and-forget initial run; subsequent runs on interval.
  runCallHistorySync();
  const id = setInterval(runCallHistorySync, intervalMs);
  logger.info(`[callSync cron] scheduler started (every ${intervalMinutes} min)`);
  return id;
}

export function stopCallRecordSyncScheduler(id) {
  if (id) {
    clearInterval(id);
    logger.info('[callSync cron] scheduler stopped');
    return true;
  }
  return false;
}
