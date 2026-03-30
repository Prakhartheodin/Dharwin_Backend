/** Loose IPv4 / IPv6 pattern for first-party `x-client-ip` (browser ipify); not a full validator. */
const CLIENT_IP_HEADER_PATTERN = /^[0-9a-fA-F:.]{3,45}$/;

/**
 * Optional public IP reported by the first-party SPA (e.g. api.ipify.org). Spoofable; use for display when proxy is wrong.
 *
 * @param {import('express').Request|null|undefined} req
 * @returns {string|null}
 */
export function parseClientSuppliedIpHeader(req) {
  if (!req?.get) return null;
  const raw = req.get('x-client-ip') || req.get('X-Client-Ip');
  if (!raw || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (t.length < 7 || t.length > 45) return null;
  if (!CLIENT_IP_HEADER_PATTERN.test(t)) return null;
  return t;
}

/**
 * Resolve the TCP peer / proxy-forwarded client IP for audit and rate limiting.
 * Prefer Express `req.ip` (respects `trust proxy` and X-Forwarded-For parsing).
 * Do not read X-Forwarded-For manually — spoofable unless Express trust settings match your edge.
 *
 * @param {import('express').Request|null|undefined} req
 * @returns {string|null}
 */
export function getClientIpFromRequest(req) {
  if (!req) return null;
  const fromExpress = req.ip;
  if (fromExpress != null && String(fromExpress).trim() !== '') {
    const t = String(fromExpress).trim();
    if (t !== '::') return t;
  }
  const sock = req.socket || req.connection;
  const ra = sock?.remoteAddress;
  if (ra != null && String(ra).trim() !== '') {
    return String(ra).trim();
  }
  return null;
}
