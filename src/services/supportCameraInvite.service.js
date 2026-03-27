import crypto from 'crypto';
import httpStatus from 'http-status';
import ApiError from '../utils/ApiError.js';
import User from '../models/user.model.js';
import SupportCameraInvite from '../models/supportCameraInvite.model.js';
import * as livekitService from './livekit.service.js';
import * as activityLogService from './activityLog.service.js';
import * as chatSocketService from './chatSocket.service.js';
import { ActivityActions, EntityTypes } from '../config/activityLog.js';
import { pickUserDisplayForActivityLog } from '../utils/activityLogSubject.util.js';
import config from '../config/config.js';

const INVITE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * @param {string} targetUserId
 * @param {object} adminUser - req.user (designated platform email; checked by route)
 * @param {import('express').Request|null} [httpReq] - pass for ActivityLog ip / geo (platform audit)
 */
const createInvite = async (targetUserId, adminUser, httpReq = null) => {
  const target = await User.findById(targetUserId).select('_id name email platformSuperUser status');
  if (!target) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (target.platformSuperUser) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot create support camera invite for another platform super user');
  }
  if (target.status !== 'active') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User must be active to receive a camera session invite');
  }

  const token = crypto.randomBytes(32).toString('hex');
  const roomName = `support-cam-${crypto.randomBytes(12).toString('hex')}`;
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await SupportCameraInvite.create({
    token,
    roomName,
    targetUserId: target._id,
    createdBy: adminUser._id || adminUser.id,
    expiresAt,
  });

  const actorId = String(adminUser.id || adminUser._id);
  await activityLogService.createActivityLog(
    actorId,
    ActivityActions.SUPPORT_CAMERA_INVITE,
    EntityTypes.USER,
    String(target._id),
    { roomName, inviteExpiresAt: expiresAt.toISOString(), ...pickUserDisplayForActivityLog(target) },
    httpReq
  );

  const base = (config.frontendBaseUrl || 'http://localhost:3001').replace(/\/$/, '');
  const joinUrl = `${base}/support/camera/join/${token}`;

  chatSocketService.emitSupportCameraIncomingCall(String(target._id), {
    token,
    roomName,
    caller: {
      id: actorId,
      name: adminUser.name,
      email: adminUser.email,
    },
  });

  return {
    inviteToken: token,
    roomName,
    expiresAt: expiresAt.toISOString(),
    joinUrl,
    targetName: target.name,
    targetEmail: target.email,
  };
};

/**
 * @param {string} inviteToken
 * @param {object} requestUser - req.user
 * @returns {Promise<{ token: string, roomName: string, role: 'viewer'|'publisher' }>}
 */
const exchangeToken = async (inviteToken, requestUser) => {
  if (!inviteToken || typeof inviteToken !== 'string') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'inviteToken is required');
  }
  const invite = await SupportCameraInvite.findOne({ token: inviteToken.trim() });
  if (!invite) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invitation not found or already used');
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    throw new ApiError(httpStatus.GONE, 'This invitation has expired');
  }

  const requesterId = String(requestUser._id || requestUser.id);
  const targetId = String(invite.targetUserId);
  const creatorId = String(invite.createdBy);

  let asPublisher = false;
  if (requesterId === creatorId) {
    if (!config.isDesignatedSuperadminEmail(requestUser.email)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Only the designated platform account that created the invite can open the viewer session'
      );
    }
    asPublisher = false;
  } else if (requesterId === targetId) {
    asPublisher = true;
  } else {
    throw new ApiError(httpStatus.FORBIDDEN, 'This invitation is not for your account');
  }

  const name =
    requestUser.name ||
    requestUser.email ||
    (asPublisher ? 'Guest' : 'Support viewer');
  const jwt = await livekitService.generateSupportCameraToken({
    roomName: invite.roomName,
    participantName: name,
    participantIdentity: requesterId,
    asPublisher,
  });

  return {
    token: jwt,
    roomName: invite.roomName,
    role: asPublisher ? 'publisher' : 'viewer',
  };
};

export { createInvite, exchangeToken };
