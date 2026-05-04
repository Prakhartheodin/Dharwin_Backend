import mongoose from 'mongoose';

const conversationMemorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    summary: { type: String, default: '' },
    turnCount: { type: Number, default: 0 },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  },
  { timestamps: true }
);

conversationMemorySchema.index({ userId: 1, adminId: 1 }, { unique: true });
conversationMemorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ConversationMemory = mongoose.model('ConversationMemory', conversationMemorySchema);
export default ConversationMemory;
