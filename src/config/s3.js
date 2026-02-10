import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import config from './config.js';

const isS3Configured = () =>
  Boolean(config.aws?.region && config.aws?.bucketName && config.aws?.accessKeyId && config.aws?.secretAccessKey);

export const s3Client = isS3Configured()
  ? new S3Client({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    })
  : null;

/**
 * Generate a namespaced S3 key for a file.
 * @param {string} originalName - Original filename
 * @param {string} userId - User ID (or entity ID) for namespacing
 * @param {string} [folder='documents'] - Top-level folder (e.g. documents, support-tickets)
 * @returns {string} S3 key
 */
export const generateFileKey = (originalName, userId, folder = 'documents') => {
  const timestamp = Date.now();
  const safeName = originalName.replace(/\s+/g, '-');
  return `${folder}/${userId}/${timestamp}-${safeName}`;
};

/**
 * Generate a short-lived presigned URL for downloading a file from S3.
 * @param {string} fileKey - S3 object key
 * @param {number} expiresInSeconds - URL expiry in seconds (e.g. 300 for 5 minutes)
 * @returns {Promise<string>} Presigned URL
 */
export const generatePresignedDownloadUrl = async (fileKey, expiresInSeconds) => {
  if (!s3Client || !config.aws?.bucketName) {
    throw new Error('S3 is not configured. Set AWS_* environment variables.');
  }
  const command = new GetObjectCommand({
    Bucket: config.aws.bucketName,
    Key: fileKey,
  });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
};

/**
 * Generate a short-lived presigned URL for uploading a file directly to S3.
 * @param {string} fileKey - S3 object key
 * @param {string} contentType - MIME type
 * @param {number} expiresInSeconds - URL expiry in seconds (e.g. 3600 for 1 hour)
 * @returns {Promise<string>} Presigned URL
 */
export const generatePresignedUploadUrl = async (fileKey, contentType, expiresInSeconds) => {
  if (!s3Client || !config.aws?.bucketName) {
    throw new Error('S3 is not configured. Set AWS_* environment variables.');
  }
  const command = new PutObjectCommand({
    Bucket: config.aws.bucketName,
    Key: fileKey,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
};

export { isS3Configured };
