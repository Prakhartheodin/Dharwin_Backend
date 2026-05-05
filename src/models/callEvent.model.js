import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';

/**
 * Append-only log of every Bolna-derived state change.
 * Unique `eventId` makes webhook retries and reconciliation polls free —
 * the second insert with the same id throws E11000, which the chokepoint
 * (`callSync.service.js::applyEvent`) treats as "already processed".
 */
const callEventSchema = mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    executionId: { type: String, required: true, index: true },
    status: { type: String, required: true },
    eventTs: { type: Date, required: true },
    source: {
      type: String,
      enum: ['webhook', 'webhook_candidate', 'reconciliation', 'backfill', 'initiate'],
      required: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

callEventSchema.index({ executionId: 1, eventTs: 1 });
callEventSchema.plugin(toJSON);

const CallEvent = mongoose.model('CallEvent', callEventSchema);
export default CallEvent;
