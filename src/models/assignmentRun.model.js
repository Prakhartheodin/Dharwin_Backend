import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';

const RUN_STATUSES = [
  'draft',
  'generating',
  'ready_for_review',
  'approved',
  'applied',
  'cancelled',
  'failed',
];

const assignmentRunSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: RUN_STATUSES,
      default: 'draft',
      index: true,
    },
    /** Short hash of the prompt template + key inputs for audit */
    promptHash: { type: String, trim: true },
    modelId: { type: String, trim: true },
    errorMessage: { type: String, trim: true },
    /** Supervisor display or user id string applied with the run */
    supervisorValue: { type: String, trim: true },
    /** Populated after roster screening (capacity vs apply rules) + AI step */
    generationMeta: {
      rosterFetched: { type: Number },
      excludedMissingOwner: { type: Number },
      excludedAtCapacity: { type: Number },
      eligibleForAi: { type: Number },
      /** e.g. admin_capacity_filtered | legacy project_assignees | admin_fallback */
      rosterScope: { type: String, trim: true },
      rosterPoolMode: { type: String, trim: true },
      projectAssigneeCount: { type: Number },
      rosterQueryLimit: { type: Number },
      adminFallbackLimit: { type: Number },
      rosterAtsCurrentEmployment: { type: Boolean },
      rosterPoolOwnerScope: { type: String, trim: true },
      candidateRoleOwnerCount: { type: Number },
      assignmentTotalTaskCount: { type: Number },
      assignmentAiDistinctTaskCount: { type: Number },
      assignmentBackfilledTaskCount: { type: Number },
      assignmentTaskBatchSize: { type: Number },
      assignmentBatchCount: { type: Number },
      assignmentAllTasksSingleRequest: { type: Boolean },
      skillPrefilter: {
        overlapTaskCount: { type: Number },
        fullRosterTaskCount: { type: Number },
      },
    },
  },
  { timestamps: true }
);

assignmentRunSchema.index({ projectId: 1, status: 1, createdAt: -1 });

assignmentRunSchema.plugin(toJSON);

const AssignmentRun = mongoose.model('AssignmentRun', assignmentRunSchema);

export default AssignmentRun;
export { RUN_STATUSES };
