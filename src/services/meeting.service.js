import Meeting from '../models/meeting.model.js';
import ApiError from '../utils/ApiError.js';
import httpStatus from 'http-status';
import config from '../config/config.js';
import { sendMeetingInvitationEmail } from './email.service.js';
import logger from '../config/logger.js';

/**
 * Build public meeting URL for a meetingId
 * @param {string} meetingId
 * @returns {string}
 */
const getPublicMeetingUrl = (meetingId) => {
  const base = (config.frontendBaseUrl || '').replace(/\/$/, '');
  return `${base}/join/room/${encodeURIComponent(meetingId)}`;
};

/**
 * Collect all unique emails to send invitation to (hosts + emailInvites + optional candidate/recruiter)
 * @param {Object} meeting
 * @returns {string[]}
 */
const getInvitationEmails = (meeting) => {
  const set = new Set();
  (meeting.hosts || []).forEach((h) => {
    if (h.email && h.email.trim()) set.add(h.email.trim().toLowerCase());
  });
  (meeting.emailInvites || []).forEach((email) => {
    if (email && String(email).trim()) set.add(String(email).trim().toLowerCase());
  });
  if (meeting.candidate?.email && meeting.candidate.email.trim()) {
    set.add(meeting.candidate.email.trim().toLowerCase());
  }
  if (meeting.recruiter?.email && meeting.recruiter.email.trim()) {
    set.add(meeting.recruiter.email.trim().toLowerCase());
  }
  return [...set];
};

/**
 * Create a meeting and send invitation emails
 * @param {Object} body - Meeting payload
 * @param {string} userId - Created by user id
 * @returns {Promise<Object>} Meeting with publicMeetingUrl
 */
const createMeeting = async (body, userId) => {
  const meetingId = await Meeting.generateMeetingId();
  const meeting = await Meeting.create({
    ...body,
    meetingId,
    roomName: meetingId, // same as meetingId for LiveKit; satisfies legacy index roomName_1
    createdBy: userId,
  });

  const publicMeetingUrl = getPublicMeetingUrl(meeting.meetingId);
  const meetingObj = meeting.toJSON();
  meetingObj.publicMeetingUrl = publicMeetingUrl;

  // Send invitation emails (fire-and-forget; log errors)
  const emails = getInvitationEmails(meeting);
  const payload = {
    title: meeting.title,
    scheduledAt: meeting.scheduledAt,
    durationMinutes: meeting.durationMinutes,
    publicMeetingUrl,
  };
  emails.forEach((to) => {
    sendMeetingInvitationEmail(to, payload).catch((err) => {
      logger.warn(`Failed to send meeting invitation to ${to}:`, err?.message || err);
    });
  });

  return meetingObj;
};

/**
 * Query meetings with filter and pagination
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const queryMeetings = async (filter, options) => {
  const result = await Meeting.paginate(filter, {
    ...options,
    populate: 'createdBy',
    sort: options.sortBy || '-createdAt',
  });
  result.results = (result.results || []).map((m) => {
    const doc = m.toJSON ? m.toJSON() : m;
    doc.publicMeetingUrl = getPublicMeetingUrl(doc.meetingId);
    return doc;
  });
  return result;
};

/**
 * Get meeting by id (MongoDB ObjectId or meetingId string)
 * @param {string} id - MongoDB ObjectId (24 hex) or meetingId (e.g. meeting_xxx)
 * @returns {Promise<Meeting|null>}
 */
const getMeetingById = async (id) => {
  const meeting = await resolveMeetingByIdOrMeetingId(id);
  if (!meeting) return null;
  const populated = await Meeting.findById(meeting._id).populate('createdBy');
  if (!populated) return null;
  const doc = populated.toJSON();
  doc.publicMeetingUrl = getPublicMeetingUrl(populated.meetingId);
  return doc;
};

/**
 * Get meeting by meetingId (for public URL lookup)
 * @param {string} meetingId
 * @returns {Promise<Meeting|null>}
 */
const getMeetingByMeetingId = async (meetingId) => {
  const meeting = await Meeting.findOne({ meetingId }).populate('createdBy');
  if (!meeting) return null;
  const doc = meeting.toJSON();
  doc.publicMeetingUrl = getPublicMeetingUrl(meeting.meetingId);
  return doc;
};

/**
 * Resolve id (MongoDB ObjectId or meetingId string) to a meeting document
 * @param {string} id - MongoDB ObjectId (24 hex) or meetingId (e.g. meeting_xxx)
 * @returns {Promise<Meeting|null>}
 */
const resolveMeetingByIdOrMeetingId = async (id) => {
  if (!id || typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (/^[0-9a-fA-F]{24}$/.test(trimmed)) {
    return Meeting.findById(trimmed);
  }
  return Meeting.findOne({ meetingId: trimmed });
};

/**
 * Update meeting by id (MongoDB ObjectId or meetingId string)
 * @param {string} id - MongoDB ObjectId or meetingId
 * @param {Object} updateBody
 * @returns {Promise<Meeting>}
 */
const updateMeetingById = async (id, updateBody) => {
  const meeting = await resolveMeetingByIdOrMeetingId(id);
  if (!meeting) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Meeting not found');
  }
  Object.assign(meeting, updateBody);
  await meeting.save();
  return getMeetingById(meeting._id.toString());
};

/**
 * Delete meeting by id
 * @param {ObjectId} id
 * @returns {Promise<Meeting|null>}
 */
const deleteMeetingById = async (id) => {
  const meeting = await Meeting.findById(id);
  if (!meeting) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Meeting not found');
  }
  await meeting.deleteOne();
  return meeting;
};

/**
 * Resend meeting invitations
 * @param {ObjectId} id
 * @returns {Promise<{ sent: number }>}
 */
const resendMeetingInvitations = async (id) => {
  const meeting = await Meeting.findById(id);
  if (!meeting) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Meeting not found');
  }
  const publicMeetingUrl = getPublicMeetingUrl(meeting.meetingId);
  const emails = getInvitationEmails(meeting);
  const payload = {
    title: meeting.title,
    scheduledAt: meeting.scheduledAt,
    durationMinutes: meeting.durationMinutes,
    publicMeetingUrl,
  };
  let sent = 0;
  await Promise.all(
    emails.map((to) =>
      sendMeetingInvitationEmail(to, payload)
        .then(() => {
          sent += 1;
        })
        .catch((err) => {
          logger.warn(`Failed to send meeting invitation to ${to}:`, err?.message || err);
        })
    )
  );
  return { sent };
};

/**
 * End meeting by room name (public: host only by email)
 * @param {string} roomName - meetingId (room name)
 * @param {string} hostEmail - Email of the participant leaving (must be a host)
 * @returns {Promise<Meeting>}
 */
const endMeetingByRoomPublic = async (roomName, hostEmail) => {
  const meeting = await Meeting.findOne({ meetingId: roomName });
  if (!meeting) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Meeting not found');
  }
  const emailLower = (hostEmail || '').toLowerCase().trim();
  const isHost = meeting.hosts?.some((h) => (h.email || '').toLowerCase().trim() === emailLower);
  if (!isHost) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only a host can end the meeting');
  }
  meeting.status = 'ended';
  await meeting.save();
  const doc = meeting.toJSON();
  doc.publicMeetingUrl = getPublicMeetingUrl(meeting.meetingId);
  return doc;
};

export {
  createMeeting,
  queryMeetings,
  getMeetingById,
  getMeetingByMeetingId,
  updateMeetingById,
  deleteMeetingById,
  resendMeetingInvitations,
  getPublicMeetingUrl,
  endMeetingByRoomPublic,
};
