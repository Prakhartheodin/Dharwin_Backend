import express from 'express';
import auth from '../../middlewares/auth.js';
import requirePermissions from '../../middlewares/requirePermissions.js';
import validate from '../../middlewares/validate.js';
import * as cannedResponseValidation from '../../validations/cannedResponse.validation.js';
import * as cannedResponseController from '../../controllers/cannedResponse.controller.js';

const router = express.Router();

const canRead = [auth(), requirePermissions('supportTickets.read')];
const canManage = [auth(), requirePermissions('supportTickets.manage')];

router
  .route('/')
  .post(...canManage, validate(cannedResponseValidation.createCannedResponse), cannedResponseController.create)
  .get(...canRead, validate(cannedResponseValidation.getCannedResponses), cannedResponseController.list);

router
  .route('/:responseId')
  .get(...canRead, validate(cannedResponseValidation.getCannedResponse), cannedResponseController.get)
  .patch(...canManage, validate(cannedResponseValidation.updateCannedResponse), cannedResponseController.update)
  .delete(...canManage, validate(cannedResponseValidation.deleteCannedResponse), cannedResponseController.remove);

router
  .route('/:responseId/use')
  .post(...canRead, validate(cannedResponseValidation.getCannedResponse), cannedResponseController.use);

export default router;
