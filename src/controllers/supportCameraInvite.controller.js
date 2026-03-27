import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import * as supportCameraInviteService from '../services/supportCameraInvite.service.js';

const createInvite = catchAsync(async (req, res) => {
  const { targetUserId } = req.body;
  const out = await supportCameraInviteService.createInvite(targetUserId, req.user, req);
  res.status(httpStatus.CREATED).send(out);
});

const exchangeToken = catchAsync(async (req, res) => {
  const { inviteToken } = req.body;
  const out = await supportCameraInviteService.exchangeToken(inviteToken, req.user);
  res.send(out);
});

export { createInvite, exchangeToken };
