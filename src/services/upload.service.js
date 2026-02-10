import { PutObjectCommand } from '@aws-sdk/client-s3';
import {
  s3Client,
  isS3Configured,
  generateFileKey,
  generatePresignedDownloadUrl,
  generatePresignedUploadUrl,
} from '../config/s3.js';
import config from '../config/config.js';
import Document from '../models/document.model.js';

/**
 * Upload a file buffer to S3 (backend-managed upload).
 * @param {object} file - Multer file object (file.buffer, file.originalname, file.mimetype, file.size)
 * @param {string} userId - User ID for key namespacing
 * @param {string} [folder='documents'] - S3 key folder prefix
 * @returns {Promise<{ key, url, originalName, size, mimeType }>}
 */
export const uploadFileToS3 = async (file, userId, folder = 'documents') => {
  if (!isS3Configured() || !s3Client) {
    throw new Error('S3 is not configured. Set AWS_* environment variables.');
  }
  const fileKey = generateFileKey(file.originalname, userId, folder);

  const uploadParams = {
    Bucket: config.aws.bucketName,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
    Metadata: {
      originalName: file.originalname,
      uploadedBy: String(userId),
      uploadedAt: new Date().toISOString(),
    },
  };

  const command = new PutObjectCommand(uploadParams);
  await s3Client.send(command);

  const url = await generatePresignedDownloadUrl(fileKey, 7 * 24 * 3600); // 7 days

  return {
    key: fileKey,
    url,
    originalName: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
  };
};

/**
 * Generate presigned upload URL and file key for client-side direct upload to S3.
 * @param {string} fileName - Original filename
 * @param {string} contentType - MIME type
 * @param {string} userId - User ID for key namespacing
 * @param {string} [folder='documents'] - S3 key folder prefix
 * @returns {Promise<{ presignedUrl, fileKey, expiresIn }>}
 */
export const generatePresignedUploadData = async (fileName, contentType, userId, folder = 'documents') => {
  const fileKey = generateFileKey(fileName, userId, folder);
  const presignedUrl = await generatePresignedUploadUrl(fileKey, contentType, 3600); // 1 hour

  return {
    presignedUrl,
    fileKey,
    expiresIn: 3600,
  };
};

/**
 * Create a Document record after client has uploaded to S3 via presigned URL.
 * @param {object} params - { fileKey, label, originalFileName, userId }
 * @returns {Promise<Document>}
 */
export const createDocumentRecord = async ({ fileKey, label, originalFileName, userId }) => {
  const doc = await Document.create({
    user: userId,
    label,
    key: fileKey,
    originalName: originalFileName || fileKey.split('/').pop(),
    url: null, // API URL is built from document id in response
  });
  const apiUrl = getDocumentApiUrl(doc.id);
  doc.url = apiUrl;
  await doc.save();
  return doc;
};

/**
 * Return the API path for downloading a document by ID.
 * @param {string} documentId - Document _id
 * @returns {string} Path like /v1/upload/documents/:documentId
 */
export const getDocumentApiUrl = (documentId) => {
  return `/v1/upload/documents/${documentId}`;
};

/**
 * Get document by ID and ensure user is allowed to access it.
 * @param {string} documentId - Document _id
 * @param {string} userId - Requesting user ID (for ownership check)
 * @returns {Promise<Document|null>}
 */
export const getDocumentByIdForUser = async (documentId, userId) => {
  const doc = await Document.findById(documentId);
  if (!doc) return null;
  if (doc.user.toString() !== userId) return null;
  return doc;
};

/**
 * Generate a short-lived presigned download URL for a document key.
 * @param {string} fileKey - S3 key
 * @param {number} [expiresInSeconds=300] - Default 5 minutes
 * @returns {Promise<string>}
 */
export const getPresignedDownloadUrlForKey = (fileKey, expiresInSeconds = 5 * 60) => {
  return generatePresignedDownloadUrl(fileKey, expiresInSeconds);
};
