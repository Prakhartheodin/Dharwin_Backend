import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';

const knowledgeDocumentSchema = new mongoose.Schema(
  {
    knowledgeBaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeBase',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['pdf', 'text', 'url'],
      required: true,
    },
    title: { type: String, default: '', trim: true, maxlength: 500 },
    sourceUrl: { type: String, default: null },
    /** Full extracted or pasted text (large). Omitted in list API. */
    rawText: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'processing', 'ready', 'failed'],
      default: 'pending',
      index: true,
    },
    errorMessage: { type: String, default: null },
    contentSha256: { type: String, default: null, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

knowledgeDocumentSchema.index({ knowledgeBaseId: 1, contentSha256: 1 });

knowledgeDocumentSchema.plugin(toJSON);

const KnowledgeDocument = mongoose.model('KnowledgeDocument', knowledgeDocumentSchema);

export default KnowledgeDocument;
