import express from 'express';
import auth from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import requireUsersManageOrAdministrator from '../../middlewares/requireUsersManageOrAdministrator.js';
import * as voiceAgentValidation from '../../validations/voiceAgent.validation.js';
import * as voiceAgentController from '../../controllers/voiceAgent.controller.js';

const router = express.Router();

router
  .route('/')
  .get(auth(), requireUsersManageOrAdministrator, voiceAgentController.listVoiceAgents)
  .post(
    auth(),
    requireUsersManageOrAdministrator,
    validate(voiceAgentValidation.createVoiceAgent),
    voiceAgentController.createVoiceAgent
  );

router
  .route('/:agentId')
  .get(auth(), requireUsersManageOrAdministrator, validate(voiceAgentValidation.getVoiceAgent), voiceAgentController.getVoiceAgent)
  .patch(
    auth(),
    requireUsersManageOrAdministrator,
    validate(voiceAgentValidation.updateVoiceAgent),
    voiceAgentController.updateVoiceAgent
  );

export default router;
