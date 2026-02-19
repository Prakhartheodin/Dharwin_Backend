import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import * as livekitService from '../services/livekit.service.js';
import ApiError from '../utils/ApiError.js';

/**
 * Generate LiveKit access token
 * POST /v1/livekit/token
 */
const getToken = catchAsync(async (req, res) => {
  const { roomName, participantName } = req.body;

  if (!roomName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'roomName is required');
  }

  // Use authenticated user info as defaults
  const participantIdentity = req.user?.id || req.user?._id?.toString() || `user-${Date.now()}`;
  const name = participantName || req.user?.name || req.user?.email || 'Anonymous';

  const token = await livekitService.generateAccessToken({
    roomName,
    participantName: name,
    participantIdentity,
  });

  res.status(httpStatus.OK).json({
    token,
    roomName,
    participantName: name,
    participantIdentity,
  });
});

/**
 * Start recording for a room
 * POST /v1/livekit/recording/start
 */
const startRecording = catchAsync(async (req, res) => {
  const { roomName } = req.body;

  if (!roomName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'roomName is required');
  }

  const result = await livekitService.startRecording(roomName);

  res.status(httpStatus.OK).json({
    success: true,
    ...result,
    message: 'Recording started',
  });
});

/**
 * Stop recording
 * POST /v1/livekit/recording/stop
 */
const stopRecording = catchAsync(async (req, res) => {
  const { egressId } = req.body;

  if (!egressId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'egressId is required');
  }

  const result = await livekitService.stopRecording(egressId);

  res.status(httpStatus.OK).json({
    success: true,
    ...result,
    message: 'Recording stopped',
  });
});

/**
 * Get recording status for a room
 * GET /v1/livekit/recording/status/:roomName
 */
const getRecordingStatus = catchAsync(async (req, res) => {
  const { roomName } = req.params;

  if (!roomName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'roomName is required');
  }

  const result = await livekitService.getRecordingStatus(roomName);

  res.status(httpStatus.OK).json(result);
});

export { getToken, startRecording, stopRecording, getRecordingStatus };
