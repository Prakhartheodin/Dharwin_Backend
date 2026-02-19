import express from 'express';
import auth from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import requirePermissions from '../../middlewares/requirePermissions.js';
import * as livekitValidation from '../../validations/livekit.validation.js';
import * as livekitController from '../../controllers/livekit.controller.js';

const router = express.Router();

/**
 * Generate LiveKit access token
 * Requires authentication
 */
router
  .route('/token')
  .post(
    auth(),
    validate(livekitValidation.getToken),
    livekitController.getToken
  );

/**
 * Start recording for a room
 * Requires authentication and meetings.record permission
 */
router
  .route('/recording/start')
  .post(
    auth(),
    requirePermissions('meetings.record'),
    validate(livekitValidation.startRecording),
    livekitController.startRecording
  );

/**
 * Stop recording
 * Requires authentication and meetings.record permission
 */
router
  .route('/recording/stop')
  .post(
    auth(),
    requirePermissions('meetings.record'),
    validate(livekitValidation.stopRecording),
    livekitController.stopRecording
  );

/**
 * Get recording status for a room
 * Requires authentication and meetings.record permission
 */
router
  .route('/recording/status/:roomName')
  .get(
    auth(),
    requirePermissions('meetings.record'),
    validate(livekitValidation.getRecordingStatus),
    livekitController.getRecordingStatus
  );

export default router;
