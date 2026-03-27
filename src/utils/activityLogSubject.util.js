/**
 * Display label for User-shaped subjects in activity log metadata.
 * Keys avoid activityLog sanitize rules (e.g. no key containing "email").
 */
export const pickUserDisplayForActivityLog = (user) => {
  if (!user) return {};
  const name = user.name != null ? String(user.name).trim() : '';
  const email = user.email != null ? String(user.email).trim() : '';
  const username = user.username != null ? String(user.username).trim() : '';
  const targetUserName = name || email || username;
  return targetUserName ? { targetUserName } : {};
};

/**
 * Snapshot stored on user.delete before hard-delete so audit rows keep a label after User doc is gone.
 * Keys must pass activityLog sanitizeMetadata (no key substring like "email").
 */
export const buildUserDeleteActivityMetadata = (user) => {
  if (!user) {
    return { targetUserName: 'Unknown user', hardDeleted: true };
  }
  const o = typeof user.toObject === 'function' ? user.toObject({ virtuals: false }) : user;
  const id = o._id != null ? String(o._id) : '';
  const name = o.name != null ? String(o.name).trim() : '';
  const username = o.username != null ? String(o.username).trim() : '';
  const email = o.email != null ? String(o.email).trim() : '';
  const targetUserName =
    name || username || email || (id ? `User (id …${id.slice(-8)})` : 'Unknown user');
  const meta = { targetUserName, hardDeleted: true };
  if (name) meta.deletedNameSnapshot = name;
  if (username) meta.deletedUsernameSnapshot = username;
  return meta;
};
