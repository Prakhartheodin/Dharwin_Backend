import Joi from 'joi';

// User-typed input is capped tight to discourage prompt-injection floods.
// Assistant replies are echoed back as conversation history, and our markdown
// table replies can run long, so allow much more on assistant role to prevent
// 400 errors on multi-turn chats.
const USER_CONTENT_MAX = 4000;
const ASSISTANT_CONTENT_MAX = 32000;
const MESSAGES_MAX = 100;

const chatMessage = Joi.alternatives().try(
  Joi.object().keys({
    role: Joi.string().valid('user').required(),
    content: Joi.string().trim().min(1).max(USER_CONTENT_MAX).required(),
  }),
  Joi.object().keys({
    role: Joi.string().valid('assistant').required(),
    content: Joi.string().trim().min(1).max(ASSISTANT_CONTENT_MAX).required(),
  })
);

export const sendMessage = {
  body: Joi.object().keys({
    messages: Joi.array().items(chatMessage).min(1).max(MESSAGES_MAX).required(),
  }),
};
