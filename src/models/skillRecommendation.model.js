import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';

const recommendedSkillSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'], default: 'Beginner' },
    category: { type: String, trim: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  },
  { _id: false }
);

const skillRecommendationSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    targetRole: { type: String, required: true, trim: true },
    skills: [recommendedSkillSchema],
    buckets: { type: mongoose.Schema.Types.Mixed, default: {} },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  },
  { timestamps: true }
);

skillRecommendationSchema.plugin(toJSON);

const SkillRecommendation = mongoose.model('SkillRecommendation', skillRecommendationSchema);
export default SkillRecommendation;
