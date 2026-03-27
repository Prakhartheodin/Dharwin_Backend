import httpStatus from 'http-status';
import ApiError from '../utils/ApiError.js';

/**
 * Requires req.user.platformSuperUser (JWT + user document).
 */
const requirePlatformSuperUser = (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
  }
  if (!req.user.platformSuperUser) {
    return next(new ApiError(httpStatus.FORBIDDEN, 'Platform super user only'));
  }
  return next();
};

export default requirePlatformSuperUser;
