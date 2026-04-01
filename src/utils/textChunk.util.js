import { encode, decode } from 'gpt-tokenizer';

const MAX_CHUNK_ENCODE = 8192;

/**
 * Split text into overlapping token windows (cl100k-style tokenizer; suitable for embedding inputs).
 * @param {string} fullText
 * @param {{ targetTokens: number, overlapTokens: number }} opts
 * @returns {Generator<{ text: string, tokenCount: number, chunkIndex: number }>}
 */
export function* chunkTextByTokens(fullText, opts) {
  const target = Math.max(64, opts.targetTokens);
  const overlap = Math.min(Math.max(0, opts.overlapTokens), target - 1);
  const raw = String(fullText || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return;

  const tokens = encode(raw).slice(0, 500000);
  if (tokens.length === 0) return;

  let start = 0;
  let chunkIndex = 0;
  while (start < tokens.length) {
    const end = Math.min(start + target, tokens.length);
    const slice = tokens.slice(start, end);
    const text = decode(slice);
    yield {
      text,
      tokenCount: slice.length,
      chunkIndex,
    };
    chunkIndex += 1;
    if (end >= tokens.length) break;
    start = end - overlap;
    if (start < 0) start = 0;
  }
}

/**
 * @param {string} text
 */
export function countTokens(text) {
  return encode(String(text || '').slice(0, MAX_CHUNK_ENCODE * 100)).length;
}
