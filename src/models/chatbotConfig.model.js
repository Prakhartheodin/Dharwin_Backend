import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';

/**
 * Per-company chatbot visibility config.
 * adminId = the company admin's User._id.
 * enabledPages = list of Next.js route prefixes where the chatbot FAB is shown.
 * Empty array means all pages enabled (default-open).
 * isGloballyEnabled = master switch; false hides chatbot for everyone under this admin.
 */
const chatbotConfigSchema = mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    isGloballyEnabled: {
      type: Boolean,
      default: true,
    },
    // Empty = all pages. Non-empty = only these prefixes show the chatbot.
    enabledPages: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

chatbotConfigSchema.plugin(toJSON);

const ChatbotConfig = mongoose.model('ChatbotConfig', chatbotConfigSchema);

export default ChatbotConfig;
