import httpStatus from 'http-status';
import Task from '../models/task.model.js';
import ApiError from '../utils/ApiError.js';
import { userIsAdmin } from '../utils/roleHelpers.js';

const isOwnerOrAdmin = async (user, resource) => {
  if (!resource) return false;
  const admin = await userIsAdmin(user);
  if (admin) return true;
  return String(resource.createdBy?._id || resource.createdBy) === String(user.id || user._id);
};

const createTask = async (createdById, payload) => {
  const task = await Task.create({
    createdBy: createdById,
    ...payload,
  });
  await task.populate([
    { path: 'createdBy', select: 'name email' },
    { path: 'assignedTo', select: 'name email' },
    { path: 'projectId', select: 'name' },
  ]);
  const assigneeId = task.assignedTo?._id || task.assignedTo;
  if (assigneeId && String(assigneeId) !== String(createdById)) {
    const { notify } = await import('./notification.service.js');
    notify(assigneeId, {
      type: 'task',
      title: 'Task assigned to you',
      message: `"${task.title || 'Task'}" has been assigned to you.`,
      link: '/task/kanban-board',
    }).catch(() => {});
  }
  return task;
};

const queryTasks = async (filter, options) => {
  if (filter.search) {
    const searchRegex = new RegExp(filter.search, 'i');
    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { taskCode: searchRegex },
      { tags: searchRegex },
    ];
    delete filter.search;
  }

  const userId = filter.userId;
  const userRoleIds = filter.userRoleIds;
  delete filter.userRoleIds;
  delete filter.userId;

  const isAdmin = await userIsAdmin({ roleIds: userRoleIds || [] });
  let finalFilter = { ...filter };
  if (!isAdmin && userId) {
    finalFilter = {
      $and: [
        finalFilter,
        { $or: [{ createdBy: userId }, { assignedTo: userId }] },
      ],
    };
  }

  const sort = options.sortBy || '-createdAt';
  const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 100;
  const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
  const skip = (page - 1) * limit;

  const [results, totalResults] = await Promise.all([
    Task.find(finalFilter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate([{ path: 'createdBy', select: 'name email' }, { path: 'assignedTo', select: 'name email' }, { path: 'projectId', select: 'name' }])
      .exec(),
    Task.countDocuments(finalFilter).exec(),
  ]);

  const totalPages = Math.ceil(totalResults / limit);
  return { results, page, limit, totalPages, totalResults };
};

const getTaskById = async (id) => {
  const task = await Task.findById(id).exec();
  if (!task) return null;
  await task.populate([
    { path: 'createdBy', select: 'name email' },
    { path: 'assignedTo', select: 'name email' },
    { path: 'projectId', select: 'name' },
  ]);
  return task;
};

const updateTaskById = async (id, updateBody, currentUser) => {
  const task = await getTaskById(id);
  if (!task) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');
  }
  const canUpdate = await isOwnerOrAdmin(currentUser, task);
  if (!canUpdate) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden');
  }
  const previousAssignee = task.assignedTo?._id || task.assignedTo;
  Object.assign(task, updateBody);
  await task.save();
  await task.populate([
    { path: 'createdBy', select: 'name email' },
    { path: 'assignedTo', select: 'name email' },
    { path: 'projectId', select: 'name' },
  ]);
  const newAssigneeId = task.assignedTo?._id || task.assignedTo;
  if (newAssigneeId && String(newAssigneeId) !== String(previousAssignee) && String(newAssigneeId) !== String(currentUser.id || currentUser._id)) {
    const { notify } = await import('./notification.service.js');
    notify(newAssigneeId, {
      type: 'task',
      title: 'Task assigned to you',
      message: `"${task.title || 'Task'}" has been assigned to you.`,
      link: '/task/kanban-board',
    }).catch(() => {});
  }
  return task;
};

const updateTaskStatusById = async (id, status, order, currentUser) => {
  const task = await getTaskById(id);
  if (!task) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');
  }
  const canUpdate = await isOwnerOrAdmin(currentUser, task);
  if (!canUpdate) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden');
  }
  const creatorId = task.createdBy?._id || task.createdBy;
  task.status = status;
  if (typeof order === 'number') task.order = order;
  await task.save();
  await task.populate([
    { path: 'createdBy', select: 'name email' },
    { path: 'assignedTo', select: 'name email' },
    { path: 'projectId', select: 'name' },
  ]);
  if (creatorId && String(creatorId) !== String(currentUser.id || currentUser._id)) {
    const { notify } = await import('./notification.service.js');
    notify(creatorId, {
      type: 'task',
      title: 'Task status updated',
      message: `"${task.title || 'Task'}" is now ${status}.`,
      link: '/task/kanban-board',
    }).catch(() => {});
  }
  return task;
};

const deleteTaskById = async (id, currentUser) => {
  const task = await getTaskById(id);
  if (!task) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');
  }
  const canDelete = await isOwnerOrAdmin(currentUser, task);
  if (!canDelete) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden');
  }
  await task.deleteOne();
  return task;
};

export {
  createTask,
  queryTasks,
  getTaskById,
  updateTaskById,
  updateTaskStatusById,
  deleteTaskById,
};
