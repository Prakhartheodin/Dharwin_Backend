import Joi from 'joi';
import { objectId } from './custom.validation.js';

const createSupportTicket = {
  body: Joi.object()
    .keys({
      title: Joi.string().required().trim().min(5).max(200).messages({
        'string.min': 'Title must be at least 5 characters long',
        'string.max': 'Title must not exceed 200 characters',
        'any.required': 'Title is required',
      }),
      description: Joi.string().required().trim().min(10).max(5000).messages({
        'string.min': 'Description must be at least 10 characters long',
        'string.max': 'Description must not exceed 5000 characters',
        'any.required': 'Description is required',
      }),
      priority: Joi.string().valid('Low', 'Medium', 'High', 'Urgent').default('Medium'),
      category: Joi.string().trim().max(100).default('General'),
      candidateId: Joi.string().custom(objectId).optional().messages({
        'string.base': 'Candidate ID must be a valid MongoDB ObjectId',
      }),
    })
    .required(),
};

const getSupportTickets = {
  query: Joi.object().keys({
    status: Joi.string().valid('Open', 'In Progress', 'Resolved', 'Closed'),
    priority: Joi.string().valid('Low', 'Medium', 'High', 'Urgent'),
    category: Joi.string().trim(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getSupportTicket = {
  params: Joi.object().keys({
    ticketId: Joi.string().custom(objectId).required(),
  }),
};

const updateSupportTicket = {
  params: Joi.object().keys({
    ticketId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      status: Joi.string().valid('Open', 'In Progress', 'Resolved', 'Closed'),
      priority: Joi.string().valid('Low', 'Medium', 'High', 'Urgent'),
      category: Joi.string().trim().max(100),
      assignedTo: Joi.string().custom(objectId),
    })
    .min(1)
    .required(),
};

const addComment = {
  params: Joi.object().keys({
    ticketId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      content: Joi.string().required().trim().min(5).max(2000).messages({
        'string.min': 'Comment must be at least 5 characters long',
        'string.max': 'Comment must not exceed 2000 characters',
        'any.required': 'Comment content is required',
      }),
    })
    .required(),
};

const deleteSupportTicket = {
  params: Joi.object().keys({
    ticketId: Joi.string().custom(objectId).required(),
  }),
};

export {
  createSupportTicket,
  getSupportTickets,
  getSupportTicket,
  updateSupportTicket,
  addComment,
  deleteSupportTicket,
};
