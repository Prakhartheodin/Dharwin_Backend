import OpenAI from 'openai';
import config from '../config/config.js';
import logger from '../config/logger.js';
import { encode, decode } from 'gpt-tokenizer';

const MAX_INPUT_TOKENS = 8192;
const MAX_BATCH_TOTAL_TOKENS = 280000;

function getClient() {
  const apiKey = config.openai.apiKey;
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.code = 'OPENAI_MISSING';
    throw err;
  }
  return new OpenAI({ apiKey });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} text
 * @param {number} maxTokens
 */
function clipToTokenBudget(text, maxTokens) {
  const tokens = encode(String(text || ''));
  if (tokens.length <= maxTokens) return String(text || '');
  return decode(tokens.slice(0, maxTokens));
}

/**
 * Embed many texts; batches to respect per-input and total token limits.
 * @param {string[]} inputs
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(inputs) {
  const model = config.voiceAgentKb.embeddingModel;
  const dimensions = config.voiceAgentKb.embeddingDimensions;
  const client = getClient();

  const clipped = inputs.map((t) => clipToTokenBudget(t, MAX_INPUT_TOKENS));
  const batches = [];
  let current = [];
  let currentTotal = 0;

  for (const text of clipped) {
    const n = encode(text).length;
    if (n > MAX_INPUT_TOKENS) continue;
    if (current.length && (currentTotal + n > MAX_BATCH_TOTAL_TOKENS || current.length >= 100)) {
      batches.push(current);
      current = [];
      currentTotal = 0;
    }
    current.push(text);
    currentTotal += n;
  }
  if (current.length) batches.push(current);

  const all = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    let attempt = 0;
    let batchDone = false;
    while (!batchDone && attempt < 8) {
      try {
        const body = {
          model,
          input: batch,
        };
        if (dimensions != null && Number.isFinite(dimensions)) {
          body.dimensions = dimensions;
        }
        const res = await client.embeddings.create(body);
        const sorted = [...res.data].sort((a, b) => a.index - b.index);
        for (const row of sorted) {
          all.push(row.embedding);
        }
        batchDone = true;
      } catch (e) {
        const status = e?.status || e?.response?.status;
        attempt += 1;
        if (status === 429 && attempt < 6) {
          const wait = Math.min(32000, 1000 * 2 ** attempt) + Math.random() * 400;
          logger.warn(`[KB] OpenAI embeddings 429, retry in ${Math.round(wait)}ms (batch ${b + 1}/${batches.length})`);
          await sleep(wait);
        } else {
          throw e;
        }
      }
    }
    if (!batchDone) {
      throw new Error('OpenAI embeddings batch failed after retries');
    }
  }
  return all;
}

/**
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedQuery(text) {
  const [vec] = await embedTexts([text]);
  return vec || [];
}
