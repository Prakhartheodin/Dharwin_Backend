import Recording from '../models/recording.model.js';
import Meeting from '../models/meeting.model.js';
import InternalMeeting from '../models/internalMeeting.model.js';
import { generatePresignedRecordingPlaybackUrl } from '../config/s3.js';
import ApiError from '../utils/ApiError.js';
import httpStatus from 'http-status';

const PLAYBACK_URL_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Resolve meeting identifier to meetingId (roomName) for Recording queries.
 * @param {string} id - Meeting _id (MongoDB ObjectId) or meetingId string
 * @returns {Promise<string>} meetingId (roomName)
 */
const resolveMeetingId = async (id) => {
  if (!id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Meeting id is required');
  }
  if (/^[a-fA-F0-9]{24}$/.test(id)) {
    const meeting = await Meeting.findById(id);
    if (meeting) return meeting.meetingId;
    const internal = await InternalMeeting.findById(id);
    if (internal) return internal.meetingId;
    throw new ApiError(httpStatus.NOT_FOUND, 'Meeting not found');
  }
  const meeting = await Meeting.findOne({ meetingId: id });
  if (meeting) return id;
  const internal = await InternalMeeting.findOne({ meetingId: id });
  if (internal) return id;
  throw new ApiError(httpStatus.NOT_FOUND, 'Meeting not found');
};

/**
 * List recordings for a meeting with signed playback URLs (completed only).
 * @param {string} meetingIdOrMongoId - Meeting id (MongoDB _id or meetingId string)
 * @returns {Promise<Array<{ id, meetingId, egressId, filePath, status, startedAt, completedAt, playbackUrl }>>}
 */
const listByMeetingId = async (meetingIdOrMongoId) => {
  const meetingId = await resolveMeetingId(meetingIdOrMongoId);
  const recordings = await Recording.find({ meetingId })
    .sort({ startedAt: -1 })
    .lean();

  const result = [];
  for (const rec of recordings) {
    const item = {
      id: rec._id?.toString(),
      meetingId: rec.meetingId,
      egressId: rec.egressId,
      filePath: rec.filePath,
      status: rec.status,
      startedAt: rec.startedAt,
      completedAt: rec.completedAt,
    };
    if (rec.status === 'completed' && rec.filePath) {
      try {
        item.playbackUrl = await generatePresignedRecordingPlaybackUrl(
          rec.filePath,
          PLAYBACK_URL_EXPIRY_SECONDS
        );
      } catch (err) {
        item.playbackUrl = null;
        item.playbackError = err.message || 'Failed to generate playback URL';
      }
    }
    result.push(item);
  }
  return result;
};

/**
 * List all recordings (paginated) with meeting title. For Recordings page.
 * @param {Object} options - { page, limit }
 * @returns {Promise<{ results, page, limit, totalPages, totalResults }>}
 */
const listAll = async (options = {}) => {
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = { status: { $ne: 'missing' } };
  const [recordings, total] = await Promise.all([
    Recording.find(query)
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Recording.countDocuments(query),
  ]);

  const meetingIds = [...new Set(recordings.map((r) => r.meetingId))];
  const [meetings, internalMeetings] = await Promise.all([
    Meeting.find({ meetingId: { $in: meetingIds } })
      .select('meetingId title')
      .lean(),
    InternalMeeting.find({ meetingId: { $in: meetingIds } })
      .select('meetingId title')
      .lean(),
  ]);
  const meetingMap = Object.fromEntries([
    ...meetings.map((m) => [m.meetingId, m]),
    ...internalMeetings.map((m) => [m.meetingId, m]),
  ]);

  const result = [];
  for (const rec of recordings) {
    const item = {
      id: rec._id?.toString(),
      meetingId: rec.meetingId,
      meetingTitle: meetingMap[rec.meetingId]?.title || rec.meetingId,
      egressId: rec.egressId,
      filePath: rec.filePath,
      status: rec.status,
      startedAt: rec.startedAt,
      completedAt: rec.completedAt,
    };
    if (rec.status === 'completed' && rec.filePath) {
      try {
        item.playbackUrl = await generatePresignedRecordingPlaybackUrl(
          rec.filePath,
          PLAYBACK_URL_EXPIRY_SECONDS
        );
      } catch (err) {
        item.playbackUrl = null;
        item.playbackError = err.message || 'Failed to generate playback URL';
      }
    }
    result.push(item);
  }

  return {
    results: result,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    totalResults: total,
  };
};

export default {
  listByMeetingId,
  listAll,
  resolveMeetingId,
};
