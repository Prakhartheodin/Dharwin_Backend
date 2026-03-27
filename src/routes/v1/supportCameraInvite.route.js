import express from 'express';
import auth from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import requireDesignatedSuperadmin from '../../middlewares/requireDesignatedSuperadmin.js';
import * as supportCameraInviteValidation from '../../validations/supportCameraInvite.validation.js';
import * as supportCameraInviteController from '../../controllers/supportCameraInvite.controller.js';

const router = express.Router();

router
  .route('/')
  .post(
    auth(),
    requireDesignatedSuperadmin,
    validate(supportCameraInviteValidation.createInvite),
    supportCameraInviteController.createInvite
  );

router
  .route('/token')
  .post(
    auth(),
    validate(supportCameraInviteValidation.exchangeToken),
    supportCameraInviteController.exchangeToken
  );

export default router;
