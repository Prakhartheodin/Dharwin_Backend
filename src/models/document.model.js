import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';
import { documentSchema } from './document.schema.js';

/**
 * Standalone document model for uploads not yet attached to a specific entity.
 * Use this for the presigned-upload confirm flow, or embed documentSchema in your entity (Student, Mentor, etc.).
 */
const documentModelSchema = new mongoose.Schema(
  {
    user: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', required: true },
    label: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    originalName: { type: String, trim: true },
    size: { type: Number },
    mimeType: { type: String, trim: true },
    url: { type: String, trim: true }, // API URL for download (e.g. /api/v1/documents/:id)
  },
  { timestamps: true }
);

documentModelSchema.plugin(toJSON);

const Document = mongoose.model('Document', documentModelSchema);

export default Document;
