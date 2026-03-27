import httpStatus from 'http-status';
import ApiError from '../utils/ApiError.js';
import config from '../config/config.js';

/**
 * Requires authenticated user email to be in config.designatedSuperadminEmails
 * (see DESIGNATED_SUPERADMIN_EMAILS). Used for sensitive platform-only surfaces.
 */
const requireDesignatedSuperadmin = (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
  }
  if (!config.isDesignatedSuperadminEmail(req.user.email)) {
    return next(new ApiError(httpStatus.FORBIDDEN, 'This action is restricted to the designated platform account'));
  }
  return next();
};

export default requireDesignatedSuperadmin;
