import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import ApiError from '../utils/ApiError.js';
import Notification from '../models/notification.model.js';
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  addSseClient,
  removeSseClient,
  pushToSse,
} from '../services/notification.service.js';

const list = catchAsync(async (req, res) => {
  const userId = req.user._id?.toString?.() || req.user.id;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const unreadOnly = req.query.unreadOnly === 'true';
  const result = await getUserNotifications(userId, { page, limit, unreadOnly });
  res.send(result);
});

const unreadCount = catchAsync(async (req, res) => {
  const userId = req.user._id?.toString?.() || req.user.id;
  const count = await getUnreadCount(userId);
  res.send({ count });
});

const markOneRead = catchAsync(async (req, res) => {
  const userId = req.user._id?.toString?.() || req.user.id;
  const doc = await markAsRead(req.params.id, userId);
  if (!doc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Notification not found');
  }
  const count = await getUnreadCount(userId);
  pushToSse(userId, { type: 'unread_count', count });
  res.send(doc);
});

const markAllRead = catchAsync(async (req, res) => {
  const userId = req.user._id?.toString?.() || req.user.id;
  const modifiedCount = await markAllAsRead(userId);
  pushToSse(userId, { type: 'unread_count', count: 0 });
  res.send({ modifiedCount });
});

const remove = catchAsync(async (req, res) => {
  const userId = req.user._id?.toString?.() || req.user.id;
  const doc = await deleteNotification(req.params.id, userId);
  if (!doc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Notification not found');
  }
  res.status(httpStatus.NO_CONTENT).send();
});

/** SSE: stream notifications for the authenticated user */
const sse = catchAsync(async (req, res) => {
  const userId = req.user._id?.toString?.() || req.user.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  addSseClient(userId, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
      removeSseClient(userId, res);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeSseClient(userId, res);
  });

  // Send initial unread count to this connection only
  const count = await getUnreadCount(userId);
  try {
    res.write(`data: ${JSON.stringify({ type: 'unread_count', count })}\n\n`);
  } catch (e) {
    clearInterval(heartbeat);
    removeSseClient(userId, res);
  }
});

const getAuditLog = catchAsync(async (req, res) => {
  const { userId, type, from, to, read, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (userId) filter.user = userId;
  if (type) filter.type = type;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  if (read !== undefined) filter.read = read === 'true' || read === true;

  const result = await Notification.paginate(filter, {
    page: Math.max(1, parseInt(page, 10) || 1),
    limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    sortBy: 'createdAt:desc',
    populate: { path: 'user', select: 'name email' },
  });
  res.send(result);
});

export { list, unreadCount, markOneRead, markAllRead, remove, sse, getAuditLog };
