import { load } from 'cheerio';

/**
 * Strip scripts/styles and extract visible text from HTML.
 * @param {string} html
 */
export function htmlToPlainText(html) {
  const $ = load(String(html || ''), { xml: false });
  $('script, style, noscript, svg, iframe').remove();
  const text = $('body').length ? $('body').text() : $.root().text();
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}
