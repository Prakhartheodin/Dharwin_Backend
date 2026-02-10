import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Embedded document schema for file attachments.
 * Store this in entities that have documents (e.g. candidates, tasks, tickets).
 * Always store S3 key; url can be API URL or last-generated presigned URL.
 */
export const documentSchema = new Schema(
  {
    label: { type: String, required: true },
    url: { type: String, trim: true }, // API URL or last known download URL
    key: { type: String, trim: true, required: true }, // S3 key (source of truth)
    originalName: { type: String, trim: true },
    size: { type: Number },
    mimeType: { type: String, trim: true },
  },
  { _id: false }
);
