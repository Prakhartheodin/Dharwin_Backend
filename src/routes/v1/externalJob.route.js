import express from 'express';
import auth from '../../middlewares/auth.js';
import requireExternalJobsAccess from '../../middlewares/requireExternalJobsAccess.js';
import externalJobController from '../../controllers/externalJob.controller.js';

const router = express.Router();

router.post('/search', auth(), requireExternalJobsAccess(), externalJobController.search);
router.post('/save', auth(), requireExternalJobsAccess({ requireManage: true }), externalJobController.save);
router.get('/saved', auth(), requireExternalJobsAccess(), externalJobController.listSaved);
router.delete(
  '/saved/:externalId',
  auth(),
  requireExternalJobsAccess({ requireManage: true }),
  externalJobController.unsave
);

export default router;
