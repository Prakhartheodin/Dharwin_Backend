import crypto from 'crypto';
import Meeting from '../models/meeting.model.js';
import InternalMeeting from '../models/internalMeeting.model.js';

/**
 * Unique LiveKit room name shared by ATS interviews (Meeting) and Communication internal meetings (InternalMeeting).
 * @returns {Promise<string>} e.g. meeting_0a33c0436e6c302d
 */
export async function generateUniqueLivekitRoomId() {
  let id;
  let exists = true;
  while (exists) {
    id = `meeting_${crypto.randomBytes(8).toString('hex')}`;
    const [a, b] = await Promise.all([
      Meeting.findOne({ meetingId: id }).select('_id').lean(),
      InternalMeeting.findOne({ meetingId: id }).select('_id').lean(),
    ]);
    exists = !!(a || b);
  }
  return id;
}
