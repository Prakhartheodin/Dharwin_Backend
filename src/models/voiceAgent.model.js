import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';

const voiceAgentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    externalAgentId: { type: String, required: true, unique: true, trim: true, index: true },
    knowledgeBaseEnabled: { type: Boolean, default: false },
    description: { type: String, default: '', maxlength: 2000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

voiceAgentSchema.plugin(toJSON);

const VoiceAgent = mongoose.model('VoiceAgent', voiceAgentSchema);

export default VoiceAgent;
