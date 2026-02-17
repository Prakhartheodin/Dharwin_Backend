import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';
import paginate from './plugins/paginate.plugin.js';

const studentGroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    students: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
      default: [],
      index: true,
    },
    holidays: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Holiday' }],
      default: [],
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

studentGroupSchema.index({ name: 1, isActive: 1 });
studentGroupSchema.index({ createdBy: 1, isActive: 1 });

studentGroupSchema.plugin(toJSON);
studentGroupSchema.plugin(paginate);

const StudentGroup = mongoose.model('StudentGroup', studentGroupSchema);

export default StudentGroup;
