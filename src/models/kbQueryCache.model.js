import mongoose from 'mongoose';

/**
 * Cached RAG answers. TTL via expiresAt + expireAfterSeconds index.
 */
const kbQueryCacheSchema = new mongoose.Schema(
  {
    cacheKey: { type: String, required: true, unique: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'VoiceAgent', required: true },
    answer: { type: String, required: true },
    /** true when answer was the support fallback (short TTL recommended) */
    isFallback: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

kbQueryCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const KbQueryCache = mongoose.model('KbQueryCache', kbQueryCacheSchema);

export default KbQueryCache;
