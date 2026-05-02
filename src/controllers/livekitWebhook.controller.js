import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import httpStatus from 'http-status';
import { WebhookReceiver } from 'livekit-server-sdk';
import catchAsync from '../utils/catchAsync.js';
import Recording from '../models/recording.model.js';
import ChatCall from '../models/chatCall.model.js';
import logger from '../config/logger.js';
import config from '../config/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECORDINGS_DIR = path.resolve(__dirname, '../../recordings');

/**
 * Save webhook payload to local recordings folder (JSON file).
 */
const savePayloadLocally = async (payload) => {
  try {
    await fs.mkdir(RECORDINGS_DIR, { recursive: true });
    const info = payload?.egressInfo || {};
    const egressId = info.egressId || info.id || 'unknown';
    const ts = Date.now();
    const filename = `egress-${egressId}-${ts}.json`;
    const filepath = path.join(RECORDINGS_DIR, filename);
    const data = {
      receivedAt: new Date().toISOString(),
      ...payload,
    };
    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf8');
    logger.info('[LiveKit Webhook] Saved locally', { filepath });
  } catch (err) {
    logger.warn('[LiveKit Webhook] Failed to save locally', { error: err.message });
  }
};

/**
 * Handle LiveKit Egress webhook events.
 * Configure this URL in LiveKit Cloud: Settings > Webhooks
 * or in server.yaml (self-hosted): webhook.urls
 *
 * Full URL example: https://your-backend.com/v1/webhooks/livekit-egress
 */
const receiveLiveKitEgressWebhook = catchAsync(async (req, res) => {
  const raw =
    req.rawBody && Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString('utf8')
      : typeof req.body === 'object' && req.body !== null
        ? JSON.stringify(req.body)
        : String(req.body || '');

  const { apiKey, apiSecret } = config.livekit || {};
  const hasLiveKitCreds = Boolean(apiKey && apiSecret);

  if (config.env === 'production' && !hasLiveKitCreds) {
    return res.status(httpStatus.SERVICE_UNAVAILABLE).json({
      status: 'error',
      message: 'LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set in production to verify egress webhooks.',
    });
  }

  if (hasLiveKitCreds) {
    try {
      const receiver = new WebhookReceiver(apiKey, apiSecret);
      await receiver.receive(raw, req.get('Authorization') || '', false);
    } catch (err) {
      logger.warn('[LiveKit Webhook] Verification failed', { error: err.message });
      return res.status(httpStatus.UNAUTHORIZED).json({ status: 'error', message: 'Invalid LiveKit webhook signature' });
    }
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return res.status(httpStatus.BAD_REQUEST).json({ status: 'error', message: 'Invalid JSON body' });
  }

  const event = payload?.event;

  logger.info('[LiveKit Webhook] Received', { event, egressId: payload?.egressInfo?.egressId });

  // Store webhook payload locally (recordings folder)
  await savePayloadLocally(payload);

  if (event === 'egress_ended') {
    const info = payload.egressInfo || {};
    const egressId = info.egressId || info.id;

    if (!egressId) {
      logger.warn('[LiveKit Webhook] egress_ended missing egressId', payload);
      return res.status(httpStatus.OK).json({ status: 'received' });
    }

    // endedAt: Unix timestamp (seconds) from LiveKit
    const completedAt = info.endedAt
      ? new Date(Number(info.endedAt) * 1000)
      : new Date();

    // Extract actual uploaded file path — try all known field name variants
    const fileResults = info.fileResults || info.file_results || info.fileResultsList;
    const filePath =
      fileResults?.[0]?.filename ||
      fileResults?.[0]?.filepath ||
      fileResults?.[0]?.location ||
      info.files?.[0]?.filename ||
      info.files?.[0]?.location;

    // No filePath = egress failed to produce a file (room ended too fast, upload error, etc.)
    const status = filePath ? 'completed' : 'missing';

    const update = {
      status,
      completedAt,
      ...(filePath && { filePath }),
    };

    const recording = await Recording.findOneAndUpdate(
      { egressId },
      update,
      { new: true }
    );

    if (recording) {
      logger.info('[LiveKit Webhook] Recording updated', {
        egressId,
        status,
        filePath: filePath || null,
        completedAt: update.completedAt,
      });
      // If this was a chat call room, link Recording to ChatCall
      if (recording.meetingId && String(recording.meetingId).startsWith('chat-')) {
        const chatCall = await ChatCall.findOneAndUpdate(
          { livekitRoom: recording.meetingId },
          { $set: { recordingId: recording._id } },
          { new: true }
        );
        if (chatCall) {
          logger.info('[LiveKit Webhook] ChatCall linked to recording', {
            chatCallId: chatCall._id?.toString(),
            roomName: recording.meetingId,
          });
        }
      }
    } else {
      logger.warn('[LiveKit Webhook] No Recording found for egressId', { egressId });
    }
  } else if (event === 'egress_started' || event === 'egress_updated') {
    // Optional: log or handle started/updated events
    logger.debug('[LiveKit Webhook] Event', { event, egressId: payload?.egressInfo?.egressId });
  }

  res.status(httpStatus.OK).json({ status: 'received' });
});

export { receiveLiveKitEgressWebhook };
