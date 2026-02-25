import Joi from 'joi';
import { objectId } from './custom.validation.js';

const getNotifications = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(50),
    unreadOnly: Joi.string().valid('true', 'false'),
  }),
};

const notificationIdParam = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

export { getNotifications, notificationIdParam };
