import express from 'express';
import multer from 'multer';
import auth from '../../middlewares/auth.js';
import requirePermissions from '../../middlewares/requirePermissions.js';
import { uploadSingleDocument } from '../../controllers/upload.controller.js';

const router = express.Router();

// Use memory storage so file buffer is available for S3 upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.UPLOAD_MAX_FILE_BYTES) || 25 * 1024 * 1024 },
});

// POST /v1/upload/single
router.post('/single', auth(), requirePermissions('uploads.document'), upload.single('file'), uploadSingleDocument);

export default router;

