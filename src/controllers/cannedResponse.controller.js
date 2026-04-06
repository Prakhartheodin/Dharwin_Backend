import httpStatus from 'http-status';
import pick from '../utils/pick.js';
import catchAsync from '../utils/catchAsync.js';
import {
  createCannedResponse,
  queryCannedResponses,
  getCannedResponseById,
  updateCannedResponseById,
  deleteCannedResponseById,
  incrementUsage,
} from '../services/cannedResponse.service.js';

const create = catchAsync(async (req, res) => {
  const response = await createCannedResponse(req.body, req.user.id);
  res.status(httpStatus.CREATED).send(response);
});

const list = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['category', 'search']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  if (!options.sortBy) options.sortBy = 'usageCount:desc';
  if (!options.limit) options.limit = 50;
  const result = await queryCannedResponses(filter, options);
  res.send(result);
});

const get = catchAsync(async (req, res) => {
  const response = await getCannedResponseById(req.params.responseId);
  res.send(response);
});

const update = catchAsync(async (req, res) => {
  const response = await updateCannedResponseById(req.params.responseId, req.body, req.user.id);
  res.send(response);
});

const remove = catchAsync(async (req, res) => {
  await deleteCannedResponseById(req.params.responseId);
  res.status(httpStatus.NO_CONTENT).send();
});

const use = catchAsync(async (req, res) => {
  const response = await getCannedResponseById(req.params.responseId);
  await incrementUsage(req.params.responseId);
  res.send(response);
});

export { create, list, get, update, remove, use };
