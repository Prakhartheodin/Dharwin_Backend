import httpStatus from 'http-status';
import CannedResponse from '../models/cannedResponse.model.js';
import ApiError from '../utils/ApiError.js';

const createCannedResponse = async (data, userId) => {
  const response = await CannedResponse.create({ ...data, createdBy: userId });
  return response;
};

const queryCannedResponses = async (filter, options) => {
  if (filter.search) {
    const q = filter.search.trim();
    delete filter.search;
    if (q) filter.$text = { $search: q };
  }
  return CannedResponse.paginate(filter, options);
};

const getCannedResponseById = async (id) => {
  const response = await CannedResponse.findById(id);
  if (!response) throw new ApiError(httpStatus.NOT_FOUND, 'Canned response not found');
  return response;
};

const updateCannedResponseById = async (id, updateData, userId) => {
  const response = await CannedResponse.findById(id);
  if (!response) throw new ApiError(httpStatus.NOT_FOUND, 'Canned response not found');
  Object.assign(response, updateData);
  await response.save();
  return response;
};

const deleteCannedResponseById = async (id) => {
  const response = await CannedResponse.findById(id);
  if (!response) throw new ApiError(httpStatus.NOT_FOUND, 'Canned response not found');
  await response.deleteOne();
};

const incrementUsage = async (id) => {
  await CannedResponse.findByIdAndUpdate(id, { $inc: { usageCount: 1 } });
};

export {
  createCannedResponse,
  queryCannedResponses,
  getCannedResponseById,
  updateCannedResponseById,
  deleteCannedResponseById,
  incrementUsage,
};
