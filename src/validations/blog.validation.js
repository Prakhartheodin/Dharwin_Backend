import Joi from 'joi';

const blogFormat = Joi.string()
  .valid('neutral', 'expressive', 'assertive', 'professional', 'casual', 'informative', 'persuasive')
  .default('neutral');

const generate = {
  body: Joi.object().keys({
    mode: Joi.string().valid('enhance', 'generate').required(),
    existingContent: Joi.string().allow('').optional(),
    title: Joi.string().allow('').optional(),
    keywords: Joi.string().allow('').optional(),
    wordCount: Joi.number().min(100).max(5000).optional(),
    format: blogFormat,
  }),
};

const generateFromTheme = {
  body: Joi.object().keys({
    theme: Joi.string().required(),
    index: Joi.number().integer().min(0).required(),
    total: Joi.number().integer().min(1).required(),
    keywords: Joi.string().allow('').optional(),
    wordCount: Joi.number().min(100).max(5000).optional(),
    format: blogFormat,
  }),
};

const suggestions = {
  body: Joi.object().keys({
    content: Joi.string().required(),
    format: blogFormat,
  }),
};

export default { generate, generateFromTheme, suggestions };
