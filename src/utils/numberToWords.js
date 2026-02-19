const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function upTo99(n) {
  if (n === 0) return '';
  if (n < 10) return ones[n];
  if (n < 20) return teens[n - 10];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return tens[t] + (o ? ` ${ones[o]}` : '');
}

function upTo999(n) {
  if (n === 0) return '';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const part = upTo99(rest);
  return (h ? `${ones[h]} hundred${part ? ' ' : ''}` : '') + part;
}

export function numberToWords(n) {
  const num = typeof n === 'string' ? parseInt(n, 10) : Number(n);
  if (!Number.isInteger(num) || num < 0) return String(n);
  if (num === 0) return 'zero';

  const l = Math.floor(num / 100000);
  const restL = num % 100000;
  const th = Math.floor(restL / 1000);
  const restTh = restL % 1000;

  const parts = [];
  if (l > 0) parts.push(`${upTo99(l)} lakh`);
  if (th > 0) parts.push(`${upTo99(th)} thousand`);
  if (restTh > 0) parts.push(upTo999(restTh));
  return parts.join(' ').trim() || String(n);
}

export function currencyToWords(code) {
  const c = (code || 'USD').toUpperCase();
  if (c === 'INR') return 'rupees';
  if (c === 'USD') return 'dollars';
  return (code || 'USD').toLowerCase();
}

