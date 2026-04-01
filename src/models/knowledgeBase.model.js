import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';

const knowledgeBaseSchema = new mongoose.Schema(
  {
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VoiceAgent',
      required: true,
      unique: true,
      index: true,
    },
  },
  { timestamps: true }
);

knowledgeBaseSchema.plugin(toJSON);

const KnowledgeBase = mongoose.model('KnowledgeBase', knowledgeBaseSchema);

export default KnowledgeBase;
