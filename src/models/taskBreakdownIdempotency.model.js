import mongoose from 'mongoose';

/**
 * Short-lived records for POST task-breakdown/apply idempotency (replay same response, no duplicate tasks).
 * TTL index removes documents after ~48h.
 */
const taskBreakdownIdempotencySchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    keyHash: { type: String, required: true },
    payloadHash: { type: String, required: true },
    responseBody: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

taskBreakdownIdempotencySchema.index(
  { projectId: 1, userId: 1, keyHash: 1 },
  { unique: true, name: 'task_breakdown_idem_project_user_key' }
);

taskBreakdownIdempotencySchema.index({ createdAt: 1 }, { expireAfterSeconds: 172800, name: 'task_breakdown_idem_ttl' });

const TaskBreakdownIdempotency = mongoose.model('TaskBreakdownIdempotency', taskBreakdownIdempotencySchema);

export default TaskBreakdownIdempotency;
