import express from 'express';
import * as bolnaController from '../../controllers/bolna.controller.js';
import * as livekitWebhookController from '../../controllers/livekitWebhook.controller.js';
import { verifyBolnaWebhook } from '../../middlewares/verifyWebhook.js';

const router = express.Router();

// Job verification webhook (recruiter calls)
router
  .route('/bolna-calls')
  .post(verifyBolnaWebhook, bolnaController.receiveWebhook);

// Candidate verification webhook (student/candidate calls)
router
  .route('/bolna-candidate-calls')
  .post(verifyBolnaWebhook, bolnaController.receiveCandidateWebhook);

/** LiveKit Egress webhook - receives egress_started, egress_updated, egress_ended */
router
  .route('/livekit-egress')
  .post(livekitWebhookController.receiveLiveKitEgressWebhook);

export default router;

