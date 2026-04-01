import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * @param {string} host
 */
function normalizeHost(host) {
  return String(host || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
}

/**
 * @param {string} ip
 */
export function isBlockedIp(ip) {
  const addr = String(ip || '').trim();
  if (!addr) return true;

  if (net.isIPv4(addr)) {
    const oct = addr.split('.').map((x) => parseInt(x, 10));
    if (oct.length !== 4 || oct.some((n) => Number.isNaN(n))) return true;
    const [a, b] = oct;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a >= 224) return true;
    return false;
  }

  if (net.isIPv6(addr)) {
    const lower = addr.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fe80:')) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) {
      const v4 = lower.replace(/^::ffff:/, '');
      if (net.isIPv4(v4)) return isBlockedIp(v4);
    }
    return false;
  }

  return true;
}

/**
 * Resolve hostname to addresses; reject if any blocked.
 * @param {string} hostname
 */
export async function assertSafeHostname(hostname) {
  const host = normalizeHost(hostname);
  if (!host || host === 'localhost') {
    const err = new Error('Host is not allowed');
    err.code = 'SSRF_HOST';
    throw err;
  }

  let records;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    const err = new Error('Could not resolve host');
    err.code = 'SSRF_DNS';
    throw err;
  }

  for (const r of records) {
    if (isBlockedIp(r.address)) {
      const err = new Error('Resolved address is not allowed');
      err.code = 'SSRF_IP';
      throw err;
    }
  }
}

/**
 * Parse URL, allow only http/https, no credentials.
 * @param {string} raw
 */
export function parsePublicHttpUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    const err = new Error('Invalid URL');
    err.code = 'URL_INVALID';
    throw err;
  }
  if (u.username || u.password) {
    const err = new Error('URL must not include credentials');
    err.code = 'URL_AUTH';
    throw err;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    const err = new Error('Only http and https URLs are allowed');
    err.code = 'URL_SCHEME';
    throw err;
  }
  if (!u.hostname) {
    const err = new Error('Invalid URL host');
    err.code = 'URL_HOST';
    throw err;
  }
  return u;
}
