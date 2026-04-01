import jwt from 'jsonwebtoken';
import moment from 'moment';
import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import ApiError from '../utils/ApiError.js';
import config from '../config/config.js';

/**
 * Short-lived JWT for the HRM WebRTC SignalR hub (admin role).
 * Secret / issuer / audience must match hrm-webrtc/backend appsettings.
 */
const getSignalingToken = catchAsync(async (req, res) => {
  const { jwtSecret, jwtIssuer, jwtAudience, signalingBaseUrl, tokenExpirationMinutes } = config.hrmWebRtc;

  if (!jwtSecret || !jwtIssuer || !jwtAudience) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'HRM WebRTC signaling is not configured. Set HRM_WEBRTC_JWT_SECRET, HRM_WEBRTC_JWT_ISSUER, and HRM_WEBRTC_JWT_AUDIENCE on the API server (match the HRM backend Jwt settings).'
    );
  }

  const expires = moment().add(tokenExpirationMinutes, 'minutes');
  const token = jwt.sign(
    {
      sub: String(req.user.id),
      email: req.user.email,
      role: 'admin',
    },
    jwtSecret,
    {
      expiresIn: `${tokenExpirationMinutes}m`,
      issuer: jwtIssuer,
      audience: jwtAudience,
    }
  );

  res.send({
    token,
    expiresAt: expires.toISOString(),
    backendUrl: signalingBaseUrl || null,
  });
});

export { getSignalingToken };
