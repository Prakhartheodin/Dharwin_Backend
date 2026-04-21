import mongoose from 'mongoose';
import toJSON from './plugins/toJSON.plugin.js';
import paginate from './plugins/paginate.plugin.js';

/**
 * Quick internal / team meetings (Communication). Not ATS interviews.
 * LiveKit room name = meetingId (same pattern as Meeting collection).
 */
const internalMeetingSchema = mongoose.Schema(
  {
    meetingId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    roomName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    scheduledAt: {
      type: Date,
      required: true,
    },
    timezone: {
      type: String,
      trim: true,
      default: 'Asia/Calcutta',
    },
    durationMinutes: {
      type: Number,
      required: true,
      default: 60,
    },
    maxParticipants: {
      type: Number,
      default: 10,
    },
    allowGuestJoin: {
      type: Boolean,
      default: true,
    },
    requireApproval: {
      type: Boolean,
      default: false,
    },
    meetingType: {
      type: String,
      enum: ['Video', 'In-Person', 'Phone'],
      default: 'Video',
    },
    hosts: [
      {
        nameOrRole: { type: String, trim: true, default: '' },
        email: { type: String, required: true, trim: true },
      },
    ],
    emailInvites: [
      {
        type: String,
        trim: true,
      },
    ],
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    admittedIdentities: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['scheduled', 'ended', 'cancelled'],
      default: 'scheduled',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

internalMeetingSchema.plugin(toJSON);
internalMeetingSchema.plugin(paginate);

const InternalMeeting = mongoose.model('InternalMeeting', internalMeetingSchema);
export default InternalMeeting;
