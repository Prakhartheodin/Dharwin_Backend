import Notification from '../models/notification.model.js';
import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import httpStatus from 'http-status';
import logger from '../config/logger.js';

/** SSE: userId -> Set of response objects for real-time push */
const sseClients = new Map();

/**
 * Register an SSE connection for a user (called by controller).
 * @param {string} userId
 * @param {import('express').Response} res
 */
export const addSseClient = (userId, res) => {
  const key = String(userId);
  if (!sseClients.has(key)) sseClients.set(key, new Set());
  sseClients.get(key).add(res);
};

/**
 * Unregister an SSE connection.
 * @param {string} userId
 * @param {import('express').Response} res
 */
export const removeSseClient = (userId, res) => {
  const key = String(userId);
  const set = sseClients.get(key);
  if (set) {
    set.delete(res);
    if (set.size === 0) sseClients.delete(key);
  }
};

/**
 * Push a notification payload to all SSE connections for a user.
 * @param {string} userId
 * @param {Object} data
 */
export const pushToSse = (userId, data) => {
  const key = String(userId);
  const set = sseClients.get(key);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  set.forEach((res) => {
    try {
      res.write(payload);
    } catch (e) {
      set.delete(res);
    }
  });
};

/**
 * Create an in-app notification and optionally push via SSE.
 * @param {string} userId
 * @param {Object} options - { type, title, message, link }
 * @returns {Promise<Notification>}
 */
export const createNotification = async (userId, options) => {
  const { type = 'general', title, message, link = null } = options;
  const doc = await Notification.create({
    user: userId,
    type,
    title,
    message,
    link,
    read: false,
  });
  const payload = doc.toJSON ? doc.toJSON() : doc;
  pushToSse(userId, { type: 'notification', notification: payload });
  const count = await Notification.countDocuments({ user: userId, read: false });
  pushToSse(userId, { type: 'unread_count', count });
  return doc;
};

/**
 * Get paginated notifications for a user.
 * @param {string} userId
 * @param {Object} options - { page, limit, unreadOnly }
 * @returns {Promise<QueryResult>}
 */
export const getUserNotifications = async (userId, options = {}) => {
  const filter = { user: userId };
  if (options.unreadOnly) filter.read = false;
  const result = await Notification.paginate(filter, {
    page: options.page || 1,
    limit: options.limit || 20,
    sortBy: 'createdAt:desc',
  });
  return result;
};

/**
 * Mark one notification as read (only if it belongs to the user).
 * @param {string} notificationId
 * @param {string} userId
 * @returns {Promise<Notification|null>}
 */
export const markAsRead = async (notificationId, userId) => {
  const doc = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { read: true },
    { new: true }
  );
  return doc;
};

/**
 * Mark all notifications for a user as read.
 * @param {string} userId
 * @returns {Promise<number>}
 */
export const markAllAsRead = async (userId) => {
  const result = await Notification.updateMany({ user: userId, read: false }, { read: true });
  return result.modifiedCount || 0;
};

/**
 * Delete one notification (only if it belongs to the user).
 * @param {string} notificationId
 * @param {string} userId
 * @returns {Promise<Notification|null>}
 */
export const deleteNotification = async (notificationId, userId) => {
  const doc = await Notification.findOneAndDelete({ _id: notificationId, user: userId });
  return doc;
};

/**
 * Get unread count for a user.
 * @param {string} userId
 * @returns {Promise<number>}
 */
export const getUnreadCount = async (userId) => {
  return Notification.countDocuments({ user: userId, read: false });
};

/**
 * Create in-app notification for a user identified by email (looks up user by email).
 * Use when sending an email to a recipient and you want the same user to see an in-app notification.
 * @param {string} email - Recipient email
 * @param {Object} options - { type, title, message, link }
 * @returns {Promise<Notification|null>}
 */
export const notifyByEmail = async (email, options) => {
  const user = await User.findOne({ email: String(email).trim().toLowerCase() }).select('_id').lean();
  if (!user?._id) return null;
  return createNotification(user._id, options);
};

/**
 * Unified notify: create in-app notification and optionally send email.
 * In-app notification is always created. Email is sent only if email options are provided
 * and (when we have preferences) user has not opted out.
 * @param {string} userId - User ID (ObjectId or string)
 * @param {Object} options - { type, title, message, link, email?: { subject, text, html } }
 * @returns {Promise<Notification>}
 */
export const notify = async (userId, options) => {
  const { type, title, message, link, email: emailOptions } = options;
  const doc = await createNotification(userId, { type, title, message, link });

  if (emailOptions && emailOptions.subject && (emailOptions.text || emailOptions.html)) {
    let to;
    try {
      const user = await User.findById(userId).select('email notificationPreferences').lean();
      if (!user || !user.email) return doc;
      to = user.email;
      // When notificationPreferences exists, check the relevant key by type (we add this in phase 4)
      const prefs = user.notificationPreferences || {};
      const typeToPref = {
        leave: 'leaveUpdates',
        task: 'taskAssignments',
        job_application: 'applicationUpdates',
        offer: 'offerUpdates',
        meeting: 'meetingInvitations',
        meeting_reminder: 'meetingReminders',
        certificate: 'certificates',
        course: 'courseUpdates',
        recruiter: 'recruiterUpdates',
      };
      const prefKey = typeToPref[type];
      if (prefKey && prefs[prefKey] === false) return doc;
    } catch (e) {
      logger.warn(`notify: could not get user email for ${userId}: ${e?.message || e}`);
      return doc;
    }
    try {
      const { queueEmail } = await import('./email.service.js');
      queueEmail(
        to,
        emailOptions.subject,
        emailOptions.text || '',
        emailOptions.html || undefined,
        `notification_${type}`,
        { notificationId: doc._id?.toString?.() }
      );
    } catch (e) {
      logger.warn(`notify: queue email failed: ${e?.message || e}`);
    }
  }
  return doc;
};
