import express from 'express';
import auth from '../../middlewares/auth.js';
import requireAdministratorRole from '../../middlewares/requireAdministratorRole.js';
import { uploadSingle } from '../../middlewares/upload.js';
import * as recruiterExcelController from '../../controllers/recruiterExcel.controller.js';

const router = express.Router();

router
  .route('/export/excel')
  .get(auth(), requireAdministratorRole(), recruiterExcelController.exportExcel);

router
  .route('/template/excel')
  .get(auth(), requireAdministratorRole(), recruiterExcelController.getTemplate);

router
  .route('/import/excel')
  .post(auth(), requireAdministratorRole(), uploadSingle('file'), recruiterExcelController.importExcel);

export default router;
