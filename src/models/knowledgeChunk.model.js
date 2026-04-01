import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';

const knowledgeChunkSchema = new mongoose.Schema(
  {
    knowledgeBaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeBase',
      required: true,
      index: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeDocument',
      required: true,
      index: true,
    },
    text: { type: String, required: true },
    embedding: { type: [Number], default: [] },
    tokenCount: { type: Number, default: null },
    chunkIndex: { type: Number, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

knowledgeChunkSchema.index({ knowledgeBaseId: 1, documentId: 1, chunkIndex: 1 }, { unique: true });

knowledgeChunkSchema.plugin(toJSON);

const KnowledgeChunk = mongoose.model('KnowledgeChunk', knowledgeChunkSchema);

export default KnowledgeChunk;
