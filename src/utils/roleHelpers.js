import Role from '../models/role.model.js';

/**
 * Check if user has Administrator role (by roleIds).
 * @param {Object} user - User object with roleIds
 * @returns {Promise<boolean>}
 */
export const userIsAdmin = async (user) => {
  const roleIds = user?.roleIds || [];
  if (!roleIds.length) return false;
  const hasRole = await Role.exists({ _id: { $in: roleIds }, name: 'Administrator', status: 'active' });
  return !!hasRole;
};

/**
 * Check if user has Recruiter role (by roleIds or legacy role string).
 * @param {Object} user - User object with roleIds and optionally role
 * @returns {Promise<boolean>}
 */
export const userHasRecruiterRole = async (user) => {
  if (!user) return false;
  if (user.role === 'recruiter') return true;
  const roleIds = user?.roleIds || [];
  if (!roleIds.length) return false;
  const hasRole = await Role.exists({ _id: { $in: roleIds }, name: 'Recruiter', status: 'active' });
  return !!hasRole;
};
