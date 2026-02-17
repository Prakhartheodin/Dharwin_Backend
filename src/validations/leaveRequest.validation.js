import Joi from 'joi';
import { objectId } from './custom.validation.js';

const createLeaveRequest = {
  params: Joi.object().keys({
    studentId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    dates: Joi.array()
      .items(Joi.date().iso().required())
      .min(1)
      .required()
      .messages({
        'array.min': 'At least one date is required',
        'any.required': 'Dates are required',
      }),
    leaveType: Joi.string()
      .valid('casual', 'sick', 'unpaid')
      .required()
      .messages({
        'any.only': 'Leave type must be either "casual", "sick", or "unpaid"',
        'any.required': 'Leave type is required',
      }),
    notes: Joi.string().optional().trim().max(1000).allow(null, '').messages({
      'string.max': 'Notes must not exceed 1000 characters',
    }),
  }),
};

const getLeaveRequests = {
  query: Joi.object().keys({
    student: Joi.string().custom(objectId).optional(),
    status: Joi.string().valid('pending', 'approved', 'rejected', 'cancelled').optional(),
    leaveType: Joi.string().valid('casual', 'sick', 'unpaid').optional(),
    sortBy: Joi.string().optional(),
    limit: Joi.number().integer().optional(),
    page: Joi.number().integer().optional(),
  }),
};

const getLeaveRequest = {
  params: Joi.object().keys({
    requestId: Joi.string().custom(objectId).required(),
  }),
};

const getLeaveRequestsByStudent = {
  params: Joi.object().keys({
    studentId: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object().keys({
    status: Joi.string().valid('pending', 'approved', 'rejected', 'cancelled').optional(),
    sortBy: Joi.string().optional(),
    limit: Joi.number().integer().optional(),
    page: Joi.number().integer().optional(),
  }),
};

const approveLeaveRequest = {
  params: Joi.object().keys({
    requestId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    adminComment: Joi.string().optional().trim().max(1000).allow(null, '').messages({
      'string.max': 'Admin comment must not exceed 1000 characters',
    }),
  }),
};

const rejectLeaveRequest = {
  params: Joi.object().keys({
    requestId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    adminComment: Joi.string().optional().trim().max(1000).allow(null, '').messages({
      'string.max': 'Admin comment must not exceed 1000 characters',
    }),
  }),
};

const cancelLeaveRequest = {
  params: Joi.object().keys({
    requestId: Joi.string().custom(objectId).required(),
  }),
};

export {
  createLeaveRequest,
  getLeaveRequests,
  getLeaveRequest,
  getLeaveRequestsByStudent,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
};
