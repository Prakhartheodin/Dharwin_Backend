import express from 'express';
import multer from 'multer';
import config from '../../config/config.js';
import auth from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import requireUsersManageOrAdministrator from '../../middlewares/requireUsersManageOrAdministrator.js';
import * as voiceAgentValidation from '../../validations/voiceAgent.validation.js';
import * as voiceKbController from '../../controllers/voiceKb.controller.js';

const maxPdfBytes = (config.voiceAgentKb.maxPdfMb || 25) * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxPdfBytes, files: 1 },
});

const router = express.Router();

router.post(
  '/query',
  auth(),
  requireUsersManageOrAdministrator,
  validate(voiceAgentValidation.kbQuery),
  voiceKbController.postKbQuery
);

router.post(
  '/:agentId/documents/pdf',
  auth(),
  requireUsersManageOrAdministrator,
  validate(voiceAgentValidation.kbPdfIngest),
  upload.single('file'),
  voiceKbController.postPdfDocument
);

router.post(
  '/:agentId/documents/text',
  auth(),
  requireUsersManageOrAdministrator,
  validate(voiceAgentValidation.kbTextIngest),
  voiceKbController.postTextDocument
);

router.post(
  '/:agentId/documents/url',
  auth(),
  requireUsersManageOrAdministrator,
  validate(voiceAgentValidation.kbUrlIngest),
  voiceKbController.postUrlDocument
);

router.get(
  '/:agentId/documents',
  auth(),
  requireUsersManageOrAdministrator,
  validate(voiceAgentValidation.kbListDocs),
  voiceKbController.listDocuments
);

router.delete(
  '/documents/:documentId',
  auth(),
  requireUsersManageOrAdministrator,
  validate(voiceAgentValidation.kbDeleteDoc),
  voiceKbController.deleteDocument
);

export default router;
