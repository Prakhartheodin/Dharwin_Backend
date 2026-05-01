import ChatbotConfig from '../models/chatbotConfig.model.js';

/**
 * Resolve the adminId for a user: if user.adminId exists, they're an employee → use that.
 * Otherwise they're the admin themselves.
 */
function resolveAdminId(user) {
  return user?.adminId ?? user?.id;
}

export async function getConfig(user) {
  const adminId = resolveAdminId(user);
  const doc = await ChatbotConfig.findOne({ adminId }).lean();
  if (!doc) {
    return { isGloballyEnabled: true, enabledPages: [] };
  }
  return { isGloballyEnabled: doc.isGloballyEnabled, enabledPages: doc.enabledPages };
}

export async function updateConfig(user, { isGloballyEnabled, enabledPages }) {
  const adminId = resolveAdminId(user);
  const doc = await ChatbotConfig.findOneAndUpdate(
    { adminId },
    { $set: { isGloballyEnabled, enabledPages } },
    { upsert: true, new: true, runValidators: true }
  ).lean();
  return { isGloballyEnabled: doc.isGloballyEnabled, enabledPages: doc.enabledPages };
}
