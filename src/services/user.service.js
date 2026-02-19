import httpStatus from 'http-status';

import ApiError from '../utils/ApiError.js';
import User from '../models/user.model.js';
import Token from '../models/token.model.js';
import logger from '../config/logger.js';


/**
 * Create a user
 * @param {Object} userBody
 * @returns {Promise<User>}
 */
const createUser = async (userBody) => {
  if (await User.isEmailTaken(userBody.email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  const user = await User.create(userBody);
  // Auto-create Student profile when user has Student role (avoids 404 on /training/students/me)
  if (user.roleIds?.length) {
    // eslint-disable-next-line import/no-cycle
    const { ensureStudentProfileForUser } = await import('./student.service.js');
    await ensureStudentProfileForUser(user.id).catch(() => {});
  }
  return user;
};

/**
 * Query for users
 * @param {Object} filter - Mongo filter (name, role, status, search)
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryUsers = async (filter, options) => {
  const { search, ...restFilter } = filter;
  const mongoFilter = { ...restFilter };
  if (search && search.trim()) {
    const trimmed = search.trim();
    const searchRegex = new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    mongoFilter.$or = [
      { name: { $regex: searchRegex } },
      { email: { $regex: searchRegex } },
    ];
  }
  const users = await User.paginate(mongoFilter, options);
  return users;
};

/**
 * Get user by id
 * @param {ObjectId} id
 * @returns {Promise<User>}
 */
const getUserById = async (id) => {
  return User.findById(id);
};

/**
 * Get user by email
 * @param {string} email
 * @returns {Promise<User>}
 */
const getUserByEmail = async (email) => {
  return User.findOne({ email });
};

/**
 * Update user by id
 * @param {ObjectId} userId
 * @param {Object} updateBody
 * @returns {Promise<User>}
 */
const updateUserById = async (userId, updateBody) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (updateBody.email && (await User.isEmailTaken(updateBody.email, userId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  const previousStatus = user.status;
  Object.assign(user, updateBody);
  await user.save();

  // Send confirmation email when candidate account is activated by admin (pending -> active)
  if (updateBody.status === 'active' && previousStatus === 'pending' && user.email) {
    const { sendCandidateAccountActivationEmail } = await import('./email.service.js');
    sendCandidateAccountActivationEmail(user.email, user.name).catch((err) => {
      logger.warn(`Failed to send account activation email to ${user.email}: ${err?.message || err}`);
    });
  }
  // Auto-create Student profile when user gains Student role (avoids 404 on /training/students/me)
  if (user.roleIds?.length) {
    // eslint-disable-next-line import/no-cycle
    const { ensureStudentProfileForUser } = await import('./student.service.js');
    await ensureStudentProfileForUser(user.id).catch(() => {});
  }
  return user;
};

/**
 * Delete user by id.
 * Also deletes linked Student profile (cascade).
 * Invalidates only the deleted user's sessions/tokens (Token documents for that user).
 * Does not touch the requester's session or cookies.
 * @param {ObjectId} userId
 * @returns {Promise<User>}
 */
const deleteUserById = async (userId) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  // Cascade delete Student profile when user has Student role
  // eslint-disable-next-line import/no-cycle
  const { deleteStudentByUserId } = await import('./student.service.js');
  await deleteStudentByUserId(userId).catch(() => {});
  await user.deleteOne();
  // Invalidate only this user's tokens (refresh, reset, verify). Do not touch the requester's tokens.
  await Token.deleteMany({ user: userId });
  return user;
};

export {
  createUser,
  queryUsers,
  getUserById,
  getUserByEmail,
  updateUserById,
  deleteUserById,
};

