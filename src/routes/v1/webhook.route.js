import express from 'express';
import * as bolnaController from '../../controllers/bolna.controller.js';

const router = express.Router();

router
  .route('/bolna-calls')
  .post(bolnaController.receiveWebhook);

export default router;

