import Joi from 'joi';
import { objectId } from './custom.validation.js';

const PLAYLIST_TYPES = ['video', 'youtube', 'quiz', 'pdf', 'blog', 'test'];

const quizOptionSchema = Joi.object({
  text: Joi.string().required().trim(),
  correct: Joi.boolean().required(),
});

const quizQuestionSchema = Joi.object({
  question: Joi.string().required().trim(),
  multipleCorrect: Joi.boolean().optional(),
  options: Joi.array().items(quizOptionSchema).min(1).required(),
});

const playlistItemSchema = Joi.object({
  order: Joi.number().integer().min(1).optional(),
  type: Joi.string()
    .valid(...PLAYLIST_TYPES)
    .required(),
  title: Joi.string().required().trim(),
  duration: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
  sourceKey: Joi.string().trim().optional(),
  sourceUrl: Joi.string().trim().optional(),
  blogContent: Joi.string().trim().optional().allow(''),
  quizData: Joi.array().items(quizQuestionSchema).optional(),
});

const createModuleBody = Joi.object({
  categoryId: Joi.string().required().custom(objectId),
  name: Joi.string().required().trim(),
  shortDescription: Joi.string().required().trim(),
  studentIds: Joi.array().items(Joi.string().custom(objectId)).optional(),
  mentorIds: Joi.array().items(Joi.string().custom(objectId)).optional(),
  playlist: Joi.array().items(playlistItemSchema).optional().default([]),
  coverImageKey: Joi.string().trim().optional(),
  coverImageUrl: Joi.string().trim().optional(),
});

const createModule = {
  body: createModuleBody,
};

const updateModuleBody = Joi.object({
  categoryId: Joi.string().custom(objectId),
  name: Joi.string().trim(),
  shortDescription: Joi.string().trim(),
  studentIds: Joi.array().items(Joi.string().custom(objectId)),
  mentorIds: Joi.array().items(Joi.string().custom(objectId)),
  playlist: Joi.array().items(playlistItemSchema),
  coverImageKey: Joi.string().trim(),
  coverImageUrl: Joi.string().trim(),
  status: Joi.string().valid('active', 'draft'),
}).min(1);

const updateModule = {
  params: Joi.object({
    moduleId: Joi.string().required().custom(objectId),
  }),
  body: updateModuleBody,
};

const getModules = {
  query: Joi.object({
    categoryId: Joi.string().custom(objectId).optional(),
    status: Joi.string().valid('active', 'draft').optional(),
    search: Joi.string().allow('').optional(),
    sortBy: Joi.string().optional(),
    limit: Joi.number().integer().optional(),
    page: Joi.number().integer().optional(),
  }),
};

const getModule = {
  params: Joi.object({
    moduleId: Joi.string().required().custom(objectId),
  }),
};

const getPlaylistItemSource = {
  params: Joi.object({
    moduleId: Joi.string().required().custom(objectId),
    itemId: Joi.string().required().custom(objectId),
  }),
};

export { createModule, updateModule, getModules, getModule, getPlaylistItemSource };
