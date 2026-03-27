import httpStatus from 'http-status';
import ApiError from '../utils/ApiError.js';
import Role from '../models/role.model.js';

/**
 * External jobs: unchanged for Administrator / platform super user; otherwise requires
 * permissions derived from ats.external-jobs:* (external-jobs.read / external-jobs.manage).
 * Use after auth() so req.user and req.authContext are set.
 *
 * @param {{ requireManage?: boolean }} [opts] - When true, require external-jobs.manage (save, delete).
 */
const requireExternalJobsAccess = (opts = {}) => async (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
  }
  if (req.user.platformSuperUser) {
    return next();
  }
  const roleIds = req.user.roleIds || [];
  if (roleIds.length > 0) {
    const adminRole = await Role.findOne({ _id: { $in: roleIds }, name: 'Administrator', status: 'active' });
    if (adminRole) {
      return next();
    }
  }
  const perms = req.authContext?.permissions;
  if (!perms) {
    return next(new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to perform this action'));
  }
  if (opts.requireManage) {
    if (perms.has('external-jobs.manage')) return next();
    return next(new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to perform this action'));
  }
  if (perms.has('external-jobs.read') || perms.has('external-jobs.manage')) {
    return next();
  }
  return next(new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to perform this action'));
};

export default requireExternalJobsAccess;
