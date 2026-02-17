import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
});

const attendancePunchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => (req.user && req.user.id ? String(req.user.id) : req.ip),
  message: { message: 'Too many punch requests. Please try again in a minute.' },
});

export {
  authLimiter,
  attendancePunchLimiter,
};

