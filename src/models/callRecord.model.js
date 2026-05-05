import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';

/**
 * Status state machine. `statusRank` enforces monotonic forward progression so
 * a late "in_progress" poll can never overwrite a "completed" terminal status.
 * Terminal statuses share rank 10 — equal-rank events may still enrich
 * fields (transcript, recording, duration) but cannot change the status text.
 */
export const TERMINAL_STATUSES = [
  'completed',
  'failed',
  'no_answer',
  'busy',
  'call_disconnected',
  'expired',
];

export const STATUS_RANK = {
  unknown: 0,
  initiated: 1,
  ringing: 2,
  in_progress: 3,
  completed: 10,
  failed: 10,
  no_answer: 10,
  busy: 10,
  call_disconnected: 10,
  expired: 10,
};

export function rankOf(status) {
  if (!status) return 0;
  return STATUS_RANK[String(status).toLowerCase()] ?? 0;
}

export function isTerminal(status) {
  if (!status) return false;
  return TERMINAL_STATUSES.includes(String(status).toLowerCase());
}

const callRecordSchema = mongoose.Schema(
  {
    executionId: {
      type: String,
      index: true,
      unique: true,
      sparse: true,
    },
    status: {
      type: String,
      default: 'unknown',
      index: true,
    },
    /** Monotonic guard. Always set together with status. See STATUS_RANK. */
    statusRank: { type: Number, default: 0, index: true },
    statusUpdatedAt: { type: Date, default: Date.now, index: true },
    lastEventId: { type: String, default: null },
    lastEventTs: { type: Date, default: null },
    bolnaUpdatedAt: { type: Date, default: null },

    phone: String,
    recipientPhoneNumber: String,
    toPhoneNumber: { type: String, trim: true },
    userNumber: String,
    fromPhoneNumber: { type: String, trim: true },
    businessName: { type: String, trim: true },
    language: { type: String, trim: true, default: null },
    transcript: String,
    conversationTranscript: String,
    duration: Number,
    recordingUrl: String,
    errorMessage: { type: String, default: null },
    completedAt: { type: Date, default: null },
    extractedData: mongoose.Schema.Types.Mixed,
    telephonyData: mongoose.Schema.Types.Mixed,
    purpose: { type: String, trim: true, default: null },
    agentId: { type: String, trim: true, default: null },
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
    raw: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    /** Set after post-call thank-you email + in-app notification sent (Bolna webhook idempotency). */
    postCallFollowUpSent: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

callRecordSchema.index({ status: 1, createdAt: -1 });
callRecordSchema.index({ statusRank: 1, statusUpdatedAt: -1 });

callRecordSchema.plugin(toJSON);

const CallRecord = mongoose.model('CallRecord', callRecordSchema);
export default CallRecord;
