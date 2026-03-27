import httpStatus from 'http-status';

import ApiError from '../utils/ApiError.js';
import Role from '../models/role.model.js';
import User from '../models/user.model.js';

/**
 * Create a role
 * @param {Object} roleBody
 * @returns {Promise<Role>}
 */
const createRole = async (roleBody) => {
  if (await Role.isNameTaken(roleBody.name)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Role name already taken');
  }
  return Role.create(roleBody);
};

/**
 * Query for roles
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryRoles = async (filter, options) => {
  const roles = await Role.paginate(filter, options);
  return roles;
};

/**
 * Get role by id
 * @param {ObjectId} roleId
 * @returns {Promise<Role>}
 */
const getRoleById = async (roleId) => {
  return Role.findById(roleId);
};

/**
 * Get role by name (case-insensitive)
 * @param {string} name
 * @returns {Promise<Role>}
 */
const getRoleByName = async (name) => {
  return Role.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
};

/**
 * Update role by id
 * @param {ObjectId} roleId
 * @param {Object} updateBody
 * @returns {Promise<Role>}
 */
const updateRoleById = async (roleId, updateBody) => {
  const role = await getRoleById(roleId);
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  if (updateBody.name && (await Role.isNameTaken(updateBody.name, roleId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Role name already taken');
  }
  Object.assign(role, updateBody);
  await role.save();
  return role;
};

/**
 * Delete role by id
 * @param {ObjectId} roleId
 * @returns {Promise<Role>}
 */
/** Max display names stored on role.update audit rows (avoids huge metadata). */
const ROLE_UPDATE_MEMBER_NAMES_LIMIT = 40;

/**
 * Snapshot of users assigned to a role (for activity log at role update time).
 * @param {import('mongoose').Types.ObjectId|string} roleId
 * @returns {Promise<{ roleMemberDisplayNames: string[], roleMemberCount: number, roleMemberNamesTruncated?: boolean }>}
 */
const getRoleAssigneeDisplaySnapshot = async (roleId) => {
  const [roleMemberCount, users] = await Promise.all([
    User.countDocuments({ roleIds: roleId }),
    User.find({ roleIds: roleId })
      .select('name username email')
      .sort({ name: 1 })
      .limit(ROLE_UPDATE_MEMBER_NAMES_LIMIT)
      .lean(),
  ]);
  const roleMemberDisplayNames = users
    .map((u) => {
      const name = u.name != null ? String(u.name).trim() : '';
      const username = u.username != null ? String(u.username).trim() : '';
      const email = u.email != null ? String(u.email).trim() : '';
      return name || username || email || '';
    })
    .filter(Boolean);
  const out = { roleMemberDisplayNames, roleMemberCount };
  if (roleMemberCount > ROLE_UPDATE_MEMBER_NAMES_LIMIT) {
    out.roleMemberNamesTruncated = true;
  }
  return out;
};

const deleteRoleById = async (roleId) => {
  const role = await getRoleById(roleId);
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }

  // Prevent deleting roles that are currently assigned to active users
  const isAssignedToActiveUser = await User.exists({ roleIds: roleId, status: 'active' });
  if (isAssignedToActiveUser) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Role cannot be deleted because it is assigned to one or more active users'
    );
  }

  await role.deleteOne();
  return role;
};

export {
  createRole,
  queryRoles,
  getRoleById,
  getRoleByName,
  updateRoleById,
  deleteRoleById,
  getRoleAssigneeDisplaySnapshot,
};
