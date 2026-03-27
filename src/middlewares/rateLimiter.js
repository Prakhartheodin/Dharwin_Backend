import rateLimit from 'express-rate-limit';
import config from '../config/config.js';

const authLimiter = rateLimit({
  windowMs: (config.rateLimit?.authWindowMinutes ?? 15) * 60 * 1000,
  max: config.rateLimit?.authMax ?? 500,
  skipSuccessfulRequests: true,
  message: { message: 'Too many sign-in attempts. Please try again later.' },
});

const attendancePunchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => (req.user && req.user.id ? String(req.user.id) : req.ip),
  message: { message: 'Too many punch requests. Please try again in a minute.' },
});

/** Anonymous/authenticated job browse (GET /jobs/browse, GET /jobs/browse/:id) — per IP */
const jobsBrowseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimit.jobsBrowsePerMinute ?? 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again shortly.' },
});

export {
  authLimiter,
  attendancePunchLimiter,
  jobsBrowseLimiter,
};

