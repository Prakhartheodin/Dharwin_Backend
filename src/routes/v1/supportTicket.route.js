import express from 'express';
import auth from '../../middlewares/auth.js';
import requirePermissions from '../../middlewares/requirePermissions.js';
import validate from '../../middlewares/validate.js';
import { uploadImagesVideos } from '../../middlewares/upload.js';
import * as supportTicketValidation from '../../validations/supportTicket.validation.js';
import * as supportTicketController from '../../controllers/supportTicket.controller.js';

const router = express.Router();

const canRead = [auth(), requirePermissions('supportTickets.read')];
const canManage = [auth(), requirePermissions('supportTickets.manage')];

router
  .route('/')
  .post(
    ...canRead,
    uploadImagesVideos('attachments', 10),
    validate(supportTicketValidation.createSupportTicket),
    supportTicketController.create
  )
  .get(...canRead, validate(supportTicketValidation.getSupportTickets), supportTicketController.list);

router
  .route('/:ticketId')
  .get(...canRead, validate(supportTicketValidation.getSupportTicket), supportTicketController.get)
  .patch(...canManage, validate(supportTicketValidation.updateSupportTicket), supportTicketController.update)
  .delete(...canManage, validate(supportTicketValidation.deleteSupportTicket), supportTicketController.remove);

router
  .route('/:ticketId/comments')
  .post(
    ...canRead,
    uploadImagesVideos('attachments', 10),
    validate(supportTicketValidation.addComment),
    supportTicketController.addComment
  );

export default router;
