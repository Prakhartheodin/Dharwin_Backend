import express from 'express';
import auth from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import { uploadSingle } from '../../middlewares/upload.js';
import * as uploadValidation from '../../validations/upload.validation.js';
import * as uploadController from '../../controllers/upload.controller.js';

const router = express.Router();

router.use(auth());

router.post('/single', uploadSingle, uploadController.uploadSingleFile);

router.post('/presigned', validate(uploadValidation.getPresignedUploadUrl), uploadController.getPresignedUploadUrl);

router.post('/confirm', validate(uploadValidation.confirmUpload), uploadController.confirmUpload);

router.get('/documents/:documentId', validate(uploadValidation.getDocument), uploadController.getDocument);

export default router;
