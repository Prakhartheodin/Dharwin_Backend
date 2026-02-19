import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';
import paginate from './plugins/paginate.plugin.js';

const organisationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    website: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    description: { type: String, trim: true },
  },
  { _id: false }
);

const jobSchema = new mongoose.Schema(
  {
    // Organisation Details
    organisation: { type: organisationSchema, required: true },

    // Job Details
    title: { type: String, required: true, trim: true },
    jobDescription: { type: String, required: true, trim: true },
    jobType: {
      type: String,
      enum: ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship', 'Freelance'],
      required: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },

    // Skill Tags
    skillTags: [{ type: String, trim: true }],

    // Additional Fields
    salaryRange: {
      min: { type: Number },
      max: { type: Number },
      currency: { type: String, default: 'USD', trim: true },
    },
    experienceLevel: {
      type: String,
      enum: ['Entry Level', 'Mid Level', 'Senior Level', 'Executive'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['Draft', 'Active', 'Closed', 'Archived'],
      default: 'Active',
    },

    // Template Reference (if created from template)
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobTemplate',
    },

    // Ownership
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Job posting verification call (Bolna)
    verificationCallExecutionId: { type: String, default: null, index: true },
    verificationCallInitiatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes for search functionality
jobSchema.index({ title: 'text', 'organisation.name': 'text', jobDescription: 'text' });
jobSchema.index({ jobType: 1 });
jobSchema.index({ location: 1 });
jobSchema.index({ status: 1 });
jobSchema.index({ skillTags: 1 });
jobSchema.index({ createdAt: -1 });

jobSchema.plugin(toJSON);
jobSchema.plugin(paginate);

const Job = mongoose.model('Job', jobSchema);

export default Job;
