import httpStatus from 'http-status';
import ApiError from '../utils/ApiError.js';
import Module from '../models/module.model.js';
import Category from '../models/category.model.js';
import * as uploadService from './upload.service.js';

/**
 * Create a training module (course info + playlist in one).
 * If coverImage file is provided, uploads to S3 and sets coverImageKey + coverImageUrl.
 * If playlistItemFiles are provided, uploads them to S3 in order and sets sourceKey/sourceUrl on the
 * corresponding playlist items (k-th file → k-th playlist item with type video or pdf).
 * @param {Object} body - Parsed body: categoryId, name, shortDescription, studentIds, mentorIds, playlist
 * @param {object} [coverFile] - Optional Multer file for cover image
 * @param {object[]} [playlistItemFiles] - Optional array of Multer files for playlist items (video/PDF), same order as video/pdf items in playlist
 * @returns {Promise<Module>}
 */
const createModule = async (body, coverFile = null, playlistItemFiles = []) => {
  const { categoryId, name, shortDescription, studentIds, mentorIds, playlist } = body;

  const category = await Category.findById(categoryId);
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  }

  const playlistArray = Array.isArray(playlist) ? playlist : [];
  const normalizedPlaylist = playlistArray.map((item, index) => {
    const entry = {
      order: item.order ?? index + 1,
      type: item.type,
      title: item.title,
      duration: item.duration,
      sourceKey: item.sourceKey || undefined,
      sourceUrl: item.sourceUrl || undefined,
      blogContent: item.blogContent || undefined,
      quizData: item.quizData || undefined,
    };
    if (entry.type === 'quiz' && Array.isArray(entry.quizData)) {
      entry.quizData = entry.quizData.map((q) => {
        const correctCount = (q.options || []).filter((o) => o.correct).length;
        if (correctCount === 0) {
          throw new ApiError(httpStatus.BAD_REQUEST, 'Quiz: at least one option must be marked correct per question');
        }
        if (!q.multipleCorrect && correctCount > 1) {
          throw new ApiError(httpStatus.BAD_REQUEST, 'Quiz: when multipleCorrect is false, at most one option may be correct');
        }
        return q;
      });
    }
    return entry;
  });

  const moduleData = {
    category: categoryId,
    name,
    shortDescription,
    studentIds: studentIds || [],
    mentorIds: mentorIds || [],
    playlist: normalizedPlaylist,
    coverImageKey: body.coverImageKey || null,
    coverImageUrl: body.coverImageUrl || null,
  };

  const moduleDoc = await Module.create(moduleData);
  const moduleId = moduleDoc.id;

  if (coverFile) {
    const result = await uploadService.uploadFileToS3(coverFile, moduleId, 'module-covers');
    const coverImageUrl = `/training/curriculum/modules/${moduleId}/cover`;
    moduleDoc.coverImageKey = result.key;
    moduleDoc.coverImageUrl = coverImageUrl;
    await moduleDoc.save();
  }

  const videoPdfIndices = moduleDoc.playlist
    .map((item, index) => ((item.type === 'video' || item.type === 'pdf') ? index : null))
    .filter((i) => i !== null);

  if (playlistItemFiles.length > 0) {
    if (playlistItemFiles.length !== videoPdfIndices.length) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `playlistItemFiles count (${playlistItemFiles.length}) must match number of video/pdf items in playlist (${videoPdfIndices.length})`
      );
    }
    for (let k = 0; k < playlistItemFiles.length; k += 1) {
      const itemIndex = videoPdfIndices[k];
      const item = moduleDoc.playlist[itemIndex];
      const file = playlistItemFiles[k];
      const result = await uploadService.uploadFileToS3(file, `${moduleId}/${item._id}`, 'module-playlist');
      const sourceUrl = `/training/curriculum/modules/${moduleId}/items/${item._id}/source`;
      item.sourceKey = result.key;
      item.sourceUrl = sourceUrl;
    }
    await moduleDoc.save();
  }

  return moduleDoc;
};

/**
 * Get module by id
 * @param {string} moduleId
 * @returns {Promise<Module|null>}
 */
const getModuleById = async (moduleId) => {
  return Module.findById(moduleId)
    .populate('category', 'name')
    .populate('studentIds', 'id user')
    .populate('mentorIds', 'id user');
};

/**
 * Update module by id.
 * Supports JSON-only updates or multipart-style updates when used from the controller
 * (coverFile and playlistItemFiles handled separately).
 * Re-validates playlist and quiz data if playlist is provided.
 * @param {string} moduleId
 * @param {Object} updateBody
 * @param {object|null} [coverFile]
 * @param {object[]} [playlistItemFiles]
 * @returns {Promise<Module>}
 */
const updateModuleById = async (moduleId, updateBody, coverFile = null, playlistItemFiles = []) => {
  const moduleDoc = await Module.findById(moduleId);
  if (!moduleDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }

  if (updateBody.categoryId) {
    const category = await Category.findById(updateBody.categoryId);
    if (!category) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
    }
    moduleDoc.category = updateBody.categoryId;
  }

  if (updateBody.name !== undefined) moduleDoc.name = updateBody.name;
  if (updateBody.shortDescription !== undefined) moduleDoc.shortDescription = updateBody.shortDescription;
  if (updateBody.studentIds !== undefined) moduleDoc.studentIds = updateBody.studentIds;
  if (updateBody.mentorIds !== undefined) moduleDoc.mentorIds = updateBody.mentorIds;
  if (updateBody.status !== undefined) moduleDoc.status = updateBody.status;

  if (updateBody.coverImageKey !== undefined) moduleDoc.coverImageKey = updateBody.coverImageKey;
  if (updateBody.coverImageUrl !== undefined) moduleDoc.coverImageUrl = updateBody.coverImageUrl;

  if (updateBody.playlist !== undefined) {
    const playlistArray = Array.isArray(updateBody.playlist) ? updateBody.playlist : [];
    moduleDoc.playlist = playlistArray.map((item, index) => {
      const entry = {
        order: item.order ?? index + 1,
        type: item.type,
        title: item.title,
        duration: item.duration,
        sourceKey: item.sourceKey || undefined,
        sourceUrl: item.sourceUrl || undefined,
        blogContent: item.blogContent || undefined,
        quizData: item.quizData || undefined,
      };
      if (entry.type === 'quiz' && Array.isArray(entry.quizData)) {
        entry.quizData = entry.quizData.map((q) => {
          const correctCount = (q.options || []).filter((o) => o.correct).length;
          if (correctCount === 0) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Quiz: at least one option must be marked correct per question');
          }
          if (!q.multipleCorrect && correctCount > 1) {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              'Quiz: when multipleCorrect is false, at most one option may be correct'
            );
          }
          return q;
        });
      }
      return entry;
    });
  }

  await moduleDoc.save();

  // Optional: new cover image
  if (coverFile) {
    const result = await uploadService.uploadFileToS3(coverFile, moduleId, 'module-covers');
    const coverImageUrl = `/training/curriculum/modules/${moduleId}/cover`;
    moduleDoc.coverImageKey = result.key;
    moduleDoc.coverImageUrl = coverImageUrl;
    await moduleDoc.save();
  }

  // Optional: new playlist item files (video/PDF), same mapping rule as create:
  // k-th file → k-th playlist item of type video/pdf
  if (playlistItemFiles.length > 0) {
    const videoPdfIndices = moduleDoc.playlist
      .map((item, index) => ((item.type === 'video' || item.type === 'pdf') ? index : null))
      .filter((i) => i !== null);

    if (playlistItemFiles.length !== videoPdfIndices.length) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `playlistItemFiles count (${playlistItemFiles.length}) must match number of video/pdf items in playlist (${videoPdfIndices.length})`
      );
    }

    for (let k = 0; k < playlistItemFiles.length; k += 1) {
      const itemIndex = videoPdfIndices[k];
      const item = moduleDoc.playlist[itemIndex];
      const file = playlistItemFiles[k];
      const result = await uploadService.uploadFileToS3(file, `${moduleId}/${item._id}`, 'module-playlist');
      const sourceUrl = `/training/curriculum/modules/${moduleId}/items/${item._id}/source`;
      item.sourceKey = result.key;
      item.sourceUrl = sourceUrl;
    }

    await moduleDoc.save();
  }

  return getModuleById(moduleId);
};

/**
 * Query modules (paginated)
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const queryModules = async (filter, options) => {
  const modules = await Module.paginate(filter, {
    ...options,
    // paginate.plugin expects a space/comma separated string, not an array
    populate: 'category studentIds mentorIds',
  });
  return modules;
};

/**
 * Get short-lived presigned URL for module cover image.
 * @param {string} moduleId
 * @returns {Promise<string|null>}
 */
const getModuleCoverUrl = async (moduleId) => {
  const moduleDoc = await Module.findById(moduleId).select('coverImageKey').lean();
  if (!moduleDoc?.coverImageKey) return null;
  return uploadService.getPresignedDownloadUrlForKey(moduleDoc.coverImageKey, 5 * 60);
};

/**
 * Get short-lived presigned URL for a playlist item's source file (video/PDF).
 * @param {string} moduleId
 * @param {string} itemId - Playlist item _id
 * @returns {Promise<string|null>}
 */
const getPlaylistItemSourceUrl = async (moduleId, itemId) => {
  const moduleDoc = await Module.findById(moduleId).select('playlist').lean();
  if (!moduleDoc?.playlist) return null;
  const item = moduleDoc.playlist.find((p) => String(p._id) === String(itemId));
  if (!item?.sourceKey) return null;
  return uploadService.getPresignedDownloadUrlForKey(item.sourceKey, 5 * 60);
};

/**
 * Delete module by id (does not delete S3 assets yet).
 * @param {string} moduleId
 * @returns {Promise<void>}
 */
const deleteModuleById = async (moduleId) => {
  const moduleDoc = await Module.findById(moduleId);
  if (!moduleDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }
  await moduleDoc.remove();
};

export {
  createModule,
  getModuleById,
  updateModuleById,
  queryModules,
  getModuleCoverUrl,
  getPlaylistItemSourceUrl,
  deleteModuleById,
};
