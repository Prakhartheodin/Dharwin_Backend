import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import ApiError from '../utils/ApiError.js';
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  addSseClient,
  removeSseClient,
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
  res.send(doc);
});

const markAllRead = catchAsync(async (req, res) => {
  const userId = req.user._id?.toString?.() || req.user.id;
  const modifiedCount = await markAllAsRead(userId);
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

export { list, unreadCount, markOneRead, markAllRead, remove, sse };
