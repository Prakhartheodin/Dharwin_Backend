import httpStatus from 'http-status';
import { getGrantingPermissions } from '../config/permissions.js';
import { userIsAdmin } from '../utils/roleHelpers.js';
import ApiError from '../utils/ApiError.js';

/** users.manage (derived from settings.users) or Administrator role — same gate as Bolna candidate agent settings. */
export default async function requireUsersManageOrAdministrator(req, res, next) {
  if (req.user?.platformSuperUser) return next();
  const granting = getGrantingPermissions('users.manage');
  const has = granting.some((p) => req.authContext.permissions.has(p));
  if (has) return next();
  try {
    if (await userIsAdmin(req.user)) return next();
  } catch {
    /* fall through */
  }
  next(new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to perform this action'));
}
