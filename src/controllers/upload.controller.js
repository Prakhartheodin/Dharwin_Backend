import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import ApiError from '../utils/ApiError.js';
import { isS3Configured } from '../config/s3.js';
import * as uploadService from '../services/upload.service.js';

/**
 * Backend-managed upload: single file via multer, stored in S3.
 * Body (optional): label, entityId (for future entity attachment).
 */
export const uploadSingleFile = catchAsync(async (req, res) => {
  if (!isS3Configured()) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'S3 is not configured. Set AWS_* environment variables.');
  }
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No file provided');
  }

  const userId = req.user.id;
  const { label } = req.body || {};

  const uploadResult = await uploadService.uploadFileToS3(req.file, userId);

  return res.status(httpStatus.CREATED).json({
    success: true,
    message: 'File uploaded successfully',
    data: {
      ...uploadResult,
      ...(label && { label }),
    },
  });
});

/**
 * Generate a presigned upload URL for client-side direct upload to S3.
 * Body: fileName, contentType. Optional: entityId (opaque context for frontend).
 */
export const getPresignedUploadUrl = catchAsync(async (req, res) => {
  if (!isS3Configured()) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'S3 is not configured. Set AWS_* environment variables.');
  }

  const { fileName, contentType, entityId } = req.body;
  const userId = req.user.id;

  if (!fileName || !contentType) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'fileName and contentType are required');
  }

  const data = await uploadService.generatePresignedUploadData(fileName, contentType, userId);

  return res.status(httpStatus.OK).json({
    success: true,
    message: 'Presigned URL generated successfully',
    data: {
      ...data,
      ...(entityId && { entityId }),
    },
  });
});

/**
 * Confirm upload after client has PUT the file to the presigned URL.
 * Persists a Document record and returns the document with API URL for download.
 * Body: fileKey, label, originalFileName. Optional: entityId.
 */
export const confirmUpload = catchAsync(async (req, res) => {
  const { fileKey, label, originalFileName, entityId } = req.body;
  const userId = req.user.id;

  if (!fileKey || !label) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'fileKey and label are required');
  }

  const doc = await uploadService.createDocumentRecord({
    fileKey,
    label,
    originalFileName: originalFileName || fileKey.split('/').pop(),
    userId,
  });

  return res.status(httpStatus.CREATED).json({
    success: true,
    message: 'File upload confirmed and saved',
    data: {
      document: {
        id: doc.id,
        label: doc.label,
        url: doc.url,
        key: doc.key,
        originalName: doc.originalName,
      },
      ...(entityId && { entityId }),
    },
  });
});

/**
 * Download a document by ID: authorize, then redirect to a short-lived presigned URL.
 */
export const getDocument = catchAsync(async (req, res) => {
  if (!isS3Configured()) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'S3 is not configured. Set AWS_* environment variables.');
  }

  const { documentId } = req.params;
  const userId = req.user.id;

  const doc = await uploadService.getDocumentByIdForUser(documentId, userId);
  if (!doc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Document not found');
  }

  const presignedUrl = await uploadService.getPresignedDownloadUrlForKey(doc.key, 5 * 60); // 5 minutes
  return res.redirect(presignedUrl);
});
