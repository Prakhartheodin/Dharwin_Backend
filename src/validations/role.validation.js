import Joi from 'joi';
import { objectId } from './custom.validation.js';

const createRole = {
  body: Joi.object().keys({
    name: Joi.string().required().trim(),
    permissions: Joi.array().items(Joi.string()).default([]),
    status: Joi.string().valid('active', 'inactive').default('active'),
  }),
};

const getRoles = {
  query: Joi.object().keys({
    name: Joi.string(),
    status: Joi.string().valid('active', 'inactive'),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getRole = {
  params: Joi.object().keys({
    roleId: Joi.string().custom(objectId),
  }),
};

const updateRole = {
  params: Joi.object().keys({
    roleId: Joi.string().required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string().trim(),
      permissions: Joi.array().items(Joi.string()),
      status: Joi.string().valid('active', 'inactive'),
    })
    .min(1),
};

const deleteRole = {
  params: Joi.object().keys({
    roleId: Joi.string().custom(objectId),
  }),
};

export { createRole, getRoles, getRole, updateRole, deleteRole };
