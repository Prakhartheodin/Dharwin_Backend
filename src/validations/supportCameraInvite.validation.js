import Joi from 'joi';
import { objectId } from './custom.validation.js';

const createInvite = {
  body: Joi.object().keys({
    targetUserId: Joi.string().required().custom(objectId),
  }),
};

const exchangeToken = {
  body: Joi.object().keys({
    inviteToken: Joi.string().trim().min(16).max(128).required(),
  }),
};

export { createInvite, exchangeToken };
