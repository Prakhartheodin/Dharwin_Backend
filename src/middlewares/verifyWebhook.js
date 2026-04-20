import crypto from 'crypto';
import httpStatus from 'http-status';
import config from '../config/config.js';

/**
 * Bolna call webhooks must send header `X-Bolna-Webhook-Secret` matching `BOLNA_WEBHOOK_SECRET`
 * when that env var is set. In production, the secret is required (configure Bolna or a proxy to send it).
 */
export function verifyBolnaWebhook(req, res, next) {
  const secret = (config.webhooks?.bolnaSecret || '').trim();
  if (!secret) {
    if (config.env === 'production') {
      return res.status(httpStatus.SERVICE_UNAVAILABLE).json({
        success: false,
        error:
          'BOLNA_WEBHOOK_SECRET is not configured. Set it and send the same value in the X-Bolna-Webhook-Secret header from Bolna (or your webhook proxy).',
      });
    }
    return next();
  }
  const header = String(req.get('x-bolna-webhook-secret') || req.get('X-Bolna-Webhook-Secret') || '');
  try {
    const a = Buffer.from(header, 'utf8');
    const b = Buffer.from(secret, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(httpStatus.UNAUTHORIZED).json({ success: false, error: 'Invalid webhook secret' });
    }
  } catch {
    return res.status(httpStatus.UNAUTHORIZED).json({ success: false, error: 'Invalid webhook secret' });
  }
  next();
}
