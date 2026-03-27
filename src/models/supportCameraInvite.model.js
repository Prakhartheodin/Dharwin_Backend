import mongoose from 'mongoose';

/**
 * One-time consent-based support camera session (LiveKit).
 * Target user must open join link while logged in and allow camera in their browser.
 */
const supportCameraInviteSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    roomName: {
      type: String,
      required: true,
      trim: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

supportCameraInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const SupportCameraInvite = mongoose.model('SupportCameraInvite', supportCameraInviteSchema);

export default SupportCameraInvite;
