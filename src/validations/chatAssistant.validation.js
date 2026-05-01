import Joi from 'joi';

const MESSAGE_CONTENT_MAX = 2000;
const MESSAGES_MAX = 100;

const chatMessage = Joi.object().keys({
  role: Joi.string().valid('user', 'assistant').required(),
  content: Joi.string().trim().min(1).max(MESSAGE_CONTENT_MAX).required(),
});

export const sendMessage = {
  body: Joi.object().keys({
    messages: Joi.array().items(chatMessage).min(1).max(MESSAGES_MAX).required(),
  }),
};
