import Joi from 'joi';
import { objectId } from './custom.validation.js';

const createCannedResponse = {
  body: Joi.object()
    .keys({
      title: Joi.string().required().trim().min(2).max(200),
      content: Joi.string().required().trim().min(2).max(5000),
      category: Joi.string().trim().max(100).default('General'),
      shortcut: Joi.string().trim().max(50).allow(''),
      isShared: Joi.boolean().default(true),
    })
    .required(),
};

const getCannedResponses = {
  query: Joi.object().keys({
    category: Joi.string().trim(),
    search: Joi.string().trim().max(200).allow(''),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getCannedResponse = {
  params: Joi.object().keys({
    responseId: Joi.string().custom(objectId).required(),
  }),
};

const updateCannedResponse = {
  params: Joi.object().keys({
    responseId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      title: Joi.string().trim().min(2).max(200),
      content: Joi.string().trim().min(2).max(5000),
      category: Joi.string().trim().max(100),
      shortcut: Joi.string().trim().max(50).allow(''),
      isShared: Joi.boolean(),
    })
    .min(1)
    .required(),
};

const deleteCannedResponse = {
  params: Joi.object().keys({
    responseId: Joi.string().custom(objectId).required(),
  }),
};

export { createCannedResponse, getCannedResponses, getCannedResponse, updateCannedResponse, deleteCannedResponse };
