import express from 'express';
import auth from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import requirePermissions from '../../middlewares/requirePermissions.js';
import * as internalMeetingValidation from '../../validations/internalMeeting.validation.js';
import * as internalMeetingController from '../../controllers/internalMeeting.controller.js';

const router = express.Router();

router
  .route('/')
  .post(
    auth(),
    requirePermissions('meetings.manage'),
    validate(internalMeetingValidation.createInternalMeeting),
    internalMeetingController.create
  )
  .get(
    auth(),
    requirePermissions('meetings.read'),
    validate(internalMeetingValidation.getInternalMeetings),
    internalMeetingController.list
  );

router
  .route('/:id/resend-invitations')
  .post(
    auth(),
    requirePermissions('meetings.manage'),
    validate(internalMeetingValidation.resendInternalInvitations),
    internalMeetingController.resendInvitations
  );

router
  .route('/:id/recordings')
  .get(
    auth(),
    requirePermissions('meetings.read'),
    validate(internalMeetingValidation.getInternalMeetingRecordings),
    internalMeetingController.getRecordings
  );

router
  .route('/:id')
  .get(
    auth(),
    requirePermissions('meetings.read'),
    validate(internalMeetingValidation.getInternalMeeting),
    internalMeetingController.get
  )
  .patch(
    auth(),
    requirePermissions('meetings.manage'),
    validate(internalMeetingValidation.updateInternalMeeting),
    internalMeetingController.update
  )
  .delete(
    auth(),
    requirePermissions('meetings.manage'),
    validate(internalMeetingValidation.deleteInternalMeeting),
    internalMeetingController.remove
  );

export default router;
