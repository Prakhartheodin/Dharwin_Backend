import Joi from 'joi';
import { objectId } from './custom.validation.js';

const getPresignedUploadUrl = {
  body: Joi.object().keys({
    fileName: Joi.string().required().trim(),
    contentType: Joi.string().required().trim(),
    entityId: Joi.string().optional().custom(objectId),
  }),
};

const confirmUpload = {
  body: Joi.object().keys({
    fileKey: Joi.string().required().trim(),
    label: Joi.string().required().trim(),
    originalFileName: Joi.string().optional().trim(),
    entityId: Joi.string().optional().custom(objectId),
  }),
};

const getDocument = {
  params: Joi.object().keys({
    documentId: Joi.string().required().custom(objectId),
  }),
};

export { getPresignedUploadUrl, confirmUpload, getDocument };
