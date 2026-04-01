import httpStatus from 'http-status';
import ApiError from '../utils/ApiError.js';
import config from '../config/config.js';

/**
 * Platform-only HRM WebRTC feed: platform super user or designated superadmin email
 * (same elevated tier as support camera invites).
 */
export default function requireHrmWebRtcAccess(req, res, next) {
  const u = req.user;
  if (!u) {
    return next(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
  }
  if (u.platformSuperUser) {
    return next();
  }
  if (config.isDesignatedSuperadminEmail(u.email)) {
    return next();
  }
  return next(new ApiError(httpStatus.FORBIDDEN, 'This action is restricted to platform administrators'));
}
