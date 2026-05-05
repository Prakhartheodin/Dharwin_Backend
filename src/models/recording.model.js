import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';

/**
 * Recording state machine.
 *
 *   pending (DB row, no egressId yet)
 *      ↓  startRoomCompositeEgress success
 *   recording (egressId set)
 *      ↓  stopEgress requested
 *   stopping
 *      ↓  egress_ended webhook
 *   finalizing (filePath captured, awaiting S3 verify)
 *      ↓  HEAD object: ok && size > 0
 *   completed
 *
 * Failure terminals (any state → terminal, never regress):
 *   failed   — Egress reported EGRESS_FAILED / EGRESS_ABORTED, or stop never succeeded
 *   missing  — egress_ended without filePath, OR S3 HEAD returned 404 / size 0
 *   expired  — never reached terminal after FORCE_RESOLVE_THRESHOLD (cron)
 */

export const RECORDING_TERMINAL = ['completed', 'failed', 'missing', 'expired'];

export const RECORDING_RANK = {
  pending: 0,
  recording: 1,
  stopping: 2,
  finalizing: 3,
  completed: 10,
  failed: 10,
  missing: 10,
  expired: 10,
};

export function recordingRank(status) {
  return RECORDING_RANK[String(status || '').toLowerCase()] ?? 0;
}

export function isRecordingTerminal(status) {
  return RECORDING_TERMINAL.includes(String(status || '').toLowerCase());
}

const recordingSchema = mongoose.Schema(
  {
    /** Room name in LiveKit (meetingId for meetings, livekitRoom for chat calls) */
    meetingId: { type: String, required: true, trim: true, index: true },

    /** LiveKit egress id. Sparse unique: null while in `pending` (before egress starts). */
    egressId: { type: String, trim: true, unique: true, sparse: true, index: true },

    /** Object key in storage. Set when egress starts (predicted) and confirmed at egress_ended. */
    filePath: { type: String, trim: true, default: null },
    /** Resolved bucket after S3 HEAD verify. */
    s3Bucket: { type: String, trim: true, default: null },
    /** Same as filePath when verified — kept separate so a future migration can normalize keys. */
    s3Key: { type: String, trim: true, default: null },
    /** ContentLength from S3 HEAD; null until verified. */
    bytes: { type: Number, default: null },
    /** Egress duration in ms; populated from completedAt - startedAt at finalize. */
    durationMs: { type: Number, default: null },

    status: {
      type: String,
      enum: ['pending', 'recording', 'stopping', 'finalizing', 'completed', 'failed', 'missing', 'expired'],
      default: 'pending',
      index: true,
    },
    /** Monotonic guard. Always set together with status. See RECORDING_RANK. */
    statusRank: { type: Number, default: 0, index: true },

    startedAt: { type: Date, default: Date.now },
    stopRequestedAt: { type: Date, default: null },
    finalizingAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    /** Number of times stopEgress was retried for this row. */
    stopAttempts: { type: Number, default: 0 },
    /** S3 HEAD attempts (after egress_ended). */
    verifyAttempts: { type: Number, default: 0 },
    /** Last error message captured during stop / verify. */
    lastError: { type: String, default: null },
    /** Audit: 'manual' | 'host_leave' | 'room_finished' | 'room_close' | 'cron'. */
    stopReason: { type: String, default: null },
  },
  { timestamps: true }
);

recordingSchema.index({ meetingId: 1, status: 1 });
recordingSchema.index({ status: 1, startedAt: -1 });
recordingSchema.index({ statusRank: 1, startedAt: -1 });

recordingSchema.plugin(toJSON);

const Recording = mongoose.model('Recording', recordingSchema);
export default Recording;
