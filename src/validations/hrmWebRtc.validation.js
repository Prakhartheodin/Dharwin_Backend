import Joi from 'joi';

const getSignalingToken = {
  body: Joi.object().keys({}).default({}),
};

export { getSignalingToken };
