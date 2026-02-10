import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import ApiError from '../utils/ApiError.js';
import pick from '../utils/pick.js';
import { isS3Configured } from '../config/s3.js';
import * as moduleService from '../services/module.service.js';
import { createModule as createModuleValidation, updateModule as updateModuleValidation } from '../validations/module.validation.js';

/**
 * Parse multipart body: stringified arrays/objects from form fields.
 * @param {object} body - req.body
 * @returns {object} Parsed body for createModule
 */
const parseModuleBody = (body) => {
  const categoryId = body.categoryId;
  const name = body.name;
  const shortDescription = body.shortDescription;

  let studentIds = body.studentIds;
  if (typeof studentIds === 'string') {
    try {
      studentIds = JSON.parse(studentIds);
    } catch {
      studentIds = [];
    }
  }
  if (!Array.isArray(studentIds)) studentIds = [];

  let mentorIds = body.mentorIds;
  if (typeof mentorIds === 'string') {
    try {
      mentorIds = JSON.parse(mentorIds);
    } catch {
      mentorIds = [];
    }
  }
  if (!Array.isArray(mentorIds)) mentorIds = [];

  let playlist = body.playlist;
  if (typeof playlist === 'string') {
    try {
      playlist = JSON.parse(playlist);
    } catch {
      playlist = [];
    }
  }
  if (!Array.isArray(playlist)) playlist = [];

  return {
    categoryId,
    name,
    shortDescription,
    studentIds,
    mentorIds,
    playlist,
    coverImageKey: body.coverImageKey || undefined,
    coverImageUrl: body.coverImageUrl || undefined,
  };
};

/**
 * POST create module.
 * Accepts multipart/form-data (coverImage file + fields) or application/json.
 * When multipart: coverImage (file), categoryId, name, shortDescription, studentIds (JSON string), mentorIds (JSON string), playlist (JSON string).
 */
const createModule = catchAsync(async (req, res) => {
  const isMultipart = req.is('multipart/form-data');
  let body;
  let coverFile = null;

  let playlistItemFiles = [];
  if (isMultipart) {
    body = parseModuleBody(req.body);
    coverFile = req.files?.coverImage?.[0] ?? null;
    playlistItemFiles = req.files?.playlistItemFiles ?? [];
    if ((coverFile || playlistItemFiles.length > 0) && !isS3Configured()) {
      throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'S3 is not configured. Set AWS_* environment variables.');
    }
  } else {
    body = req.body;
  }

  const { error, value } = createModuleValidation.body.validate(body);
  if (error) {
    const message = error.details.map((d) => d.message).join(', ');
    throw new ApiError(httpStatus.BAD_REQUEST, message);
  }

  const moduleDoc = await moduleService.createModule(value, coverFile, playlistItemFiles);
  res.status(httpStatus.CREATED).send(moduleDoc);
});

const getModules = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['categoryId', 'status']); // extend when you add more filters
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await moduleService.queryModules(filter, options);
  res.send(result);
});

const getModule = catchAsync(async (req, res) => {
  const moduleDoc = await moduleService.getModuleById(req.params.moduleId);
  if (!moduleDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }
  res.send(moduleDoc);
});

const updateModule = catchAsync(async (req, res) => {
  const isMultipart = req.is('multipart/form-data');
  let body;
  let coverFile = null;
  let playlistItemFiles = [];

  if (isMultipart) {
    body = parseModuleBody(req.body);
    coverFile = req.files?.coverImage?.[0] ?? null;
    playlistItemFiles = req.files?.playlistItemFiles ?? [];
    if ((coverFile || playlistItemFiles.length > 0) && !isS3Configured()) {
      throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'S3 is not configured. Set AWS_* environment variables.');
    }
  } else {
    body = req.body;
  }

  const { error, value } = updateModuleValidation.body.validate(body);
  if (error) {
    const message = error.details.map((d) => d.message).join(', ');
    throw new ApiError(httpStatus.BAD_REQUEST, message);
  }

  const moduleDoc = await moduleService.updateModuleById(req.params.moduleId, value, coverFile, playlistItemFiles);
  res.send(moduleDoc);
});

const getModuleCover = catchAsync(async (req, res) => {
  if (!isS3Configured()) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'S3 is not configured. Set AWS_* environment variables.');
  }
  const presignedUrl = await moduleService.getModuleCoverUrl(req.params.moduleId);
  if (!presignedUrl) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module has no cover image');
  }
  res.redirect(presignedUrl);
});

const deleteModule = catchAsync(async (req, res) => {
  await moduleService.deleteModuleById(req.params.moduleId);
  res.status(httpStatus.NO_CONTENT).send();
});

const getPlaylistItemSource = catchAsync(async (req, res) => {
  if (!isS3Configured()) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'S3 is not configured. Set AWS_* environment variables.');
  }
  const { moduleId, itemId } = req.params;
  const presignedUrl = await moduleService.getPlaylistItemSourceUrl(moduleId, itemId);
  if (!presignedUrl) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Playlist item has no source file');
  }
  res.redirect(presignedUrl);
});

export { createModule, getModules, getModule, updateModule, deleteModule, getModuleCover, getPlaylistItemSource };
