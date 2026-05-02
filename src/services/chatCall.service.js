import { AccessToken } from 'livekit-server-sdk';
import config from '../config/config.js';
import logger from '../config/logger.js';
import ChatCall from '../models/chatCall.model.js';
import { getConversationParticipantIds } from './chat.service.js';

const apiKey = config.livekit?.apiKey;
const apiSecret = config.livekit?.apiSecret;

const mintP2PToken = async (roomName, participantIdentity, participantName) => {
  if (!apiKey || !apiSecret) throw new Error('LiveKit credentials not configured');
  const token = new AccessToken(apiKey, apiSecret, {
    identity: String(participantIdentity),
    name: String(participantName),
    ttl: '6h',
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });
  return token.toJwt();
};

const initiateCall = async (conversationId, callerId, callType) => {
  const participantIds = await getConversationParticipantIds(conversationId);
  const call = await ChatCall.create({
    conversation: conversationId,
    caller: callerId,
    participants: participantIds,
    callType,
    status: 'ringing',
  });
  logger.info('[ChatCall] initiateCall', { callId: call._id, conversationId, callerId, callType });
  return call;
};

/**
 * Atomically transition ringing → ongoing, assign room name, mint tokens for all participants.
 * Returns null if the call was already accepted or declined (race condition guard).
 */
const acceptCall = async (callId) => {
  const existing = await ChatCall.findById(callId).lean();
  if (!existing) return null;
  const roomName = `chat-${existing.conversation}-${callId}`;

  const call = await ChatCall.findOneAndUpdate(
    { _id: callId, status: 'ringing' },
    { status: 'ongoing', startedAt: new Date(), livekitRoom: roomName },
    { new: true }
  )
    .populate('caller', 'name email')
    .populate('participants', 'name email');

  if (!call) return null;

  const tokenEntries = await Promise.all(
    call.participants.map(async (p) => {
      const uid = String(p._id);
      const token = await mintP2PToken(roomName, uid, p.name || uid);
      return [uid, token];
    })
  );

  const tokens = Object.fromEntries(tokenEntries);
  logger.info('[ChatCall] acceptCall', { callId, roomName, participants: call.participants.length });
  return { call, tokens };
};

const declineCall = async (callId) => {
  return ChatCall.findOneAndUpdate(
    { _id: callId, status: 'ringing' },
    { status: 'declined' },
    { new: true }
  ).lean();
};

const cancelCall = async (callId, callerId) => {
  return ChatCall.findOneAndUpdate(
    { _id: callId, status: 'ringing', caller: callerId },
    { status: 'missed' },
    { new: true }
  ).lean();
};

const endCall = async (callId) => {
  const call = await ChatCall.findById(callId).lean();
  if (!call || call.status !== 'ongoing') return null;
  const endedAt = new Date();
  const duration = call.startedAt
    ? Math.round((endedAt.getTime() - new Date(call.startedAt).getTime()) / 1000)
    : 0;
  return ChatCall.findByIdAndUpdate(callId, { status: 'completed', endedAt, duration }, { new: true }).lean();
};

export { mintP2PToken, initiateCall, acceptCall, declineCall, cancelCall, endCall };
