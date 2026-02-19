/**
 * Phone number normalization and validation (E.164).
 */

function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits.length) return null;
  if (digits.startsWith('91') && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (phone.trim().startsWith('+')) return phone.trim();
  return `+${digits}`;
}

function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  return /^\+[1-9]\d{1,14}$/.test(phone.trim());
}

export { normalizePhone, validatePhone };

