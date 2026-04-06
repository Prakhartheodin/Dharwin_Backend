import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';
import paginate from './plugins/paginate.plugin.js';

const cannedResponseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, required: true, trim: true, maxlength: 5000 },
    category: { type: String, trim: true, default: 'General', maxlength: 100 },
    shortcut: { type: String, trim: true, maxlength: 50 },
    isShared: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

cannedResponseSchema.index({ title: 'text', content: 'text' });
cannedResponseSchema.index({ category: 1 });
cannedResponseSchema.index({ shortcut: 1 });

cannedResponseSchema.plugin(toJSON);
cannedResponseSchema.plugin(paginate);

const CannedResponse = mongoose.model('CannedResponse', cannedResponseSchema);
export default CannedResponse;
