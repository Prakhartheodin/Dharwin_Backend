import crypto from 'node:crypto';
import OpenAI from 'openai';
import config from '../config/config.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';
import httpStatus from 'http-status';
import KnowledgeChunk from '../models/knowledgeChunk.model.js';
import KbQueryCache from '../models/kbQueryCache.model.js';
import * as voiceAgentService from './voiceAgent.service.js';
import { embedQuery } from '../utils/embedding.util.js';
import { topKCosine } from '../utils/vectorSearch.util.js';

export const KB_FALLBACK_ANSWER =
  "I don't have that information in our knowledge base right now. Our team will follow up with details by email.";

const PROMPT_SEED_QUERY =
  'Company policies, hiring process, application steps, contact information, FAQs, and support details for candidates.';

function normalizeQuery(q) {
  return String(q || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function cacheKey(agentMongoId, normalizedQuery) {
  const h = crypto.createHash('sha256').update(`${agentMongoId}\n${normalizedQuery}`).digest('hex');
  return `kbq:${h}`;
}

/**
 * @param {string} agentIdOrExternal
 * @param {string} query
 * @param {{ includeSources?: boolean, skipCache?: boolean }} [opts]
 */
export async function queryKb(agentIdOrExternal, query, opts = {}) {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'query is required');
  }

  const agent = await voiceAgentService.resolveVoiceAgent(agentIdOrExternal);
  if (!agent) throw new ApiError(httpStatus.NOT_FOUND, 'Voice agent not found');
  if (!agent.knowledgeBaseEnabled) {
    return {
      answer: KB_FALLBACK_ANSWER,
      fallback: true,
      reason: 'kb_disabled',
      sources: [],
    };
  }

  const kb = await voiceAgentService.getKnowledgeBaseForAgent(agent._id);
  const key = cacheKey(agent._id.toString(), normalized);

  if (!opts.skipCache && config.voiceAgentKb.queryCacheTtlSeconds > 0) {
    const hit = await KbQueryCache.findOne({ cacheKey: key, expiresAt: { $gt: new Date() } }).lean();
    if (hit) {
      return {
        answer: hit.answer,
        fallback: hit.isFallback,
        cached: true,
        sources: [],
      };
    }
  }

  const qEmb = await embedQuery(normalized);
  if (!qEmb.length) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Embeddings unavailable');
  }

  const chunks = await KnowledgeChunk.find({ knowledgeBaseId: kb._id }).select('text embedding').lean();

  const k = config.voiceAgentKb.topK;
  const minSim = config.voiceAgentKb.minSimilarity;
  const ranked = topKCosine(qEmb, chunks, k);
  const best = ranked[0]?.score ?? 0;

  if (ranked.length) {
    logger.info(
      `[KB] retrieval agent=${agent._id} queryLen=${normalized.length} topScore=${ranked[0].score.toFixed(4)} k=${k} minSim=${minSim}`
    );
  } else {
    logger.info(`[KB] retrieval agent=${agent._id} no chunks`);
  }

  const overThreshold = ranked.filter((r) => r.score >= minSim);
  if (overThreshold.length === 0) {
    const out = {
      answer: KB_FALLBACK_ANSWER,
      fallback: true,
      reason: 'below_threshold',
      bestScore: best,
      sources: opts.includeSources
        ? ranked.slice(0, 3).map((r) => ({ score: r.score, preview: r.chunk.text.slice(0, 200) }))
        : [],
    };
    await writeCache(key, agent._id, out.answer, true);
    return out;
  }

  const context = overThreshold.map((r, i) => `---\n[${i + 1}] ${r.chunk.text}`).join('\n');

  const apiKey = config.openai.apiKey;
  if (!apiKey) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'OPENAI_API_KEY is not configured');
  }
  const client = new OpenAI({ apiKey });

  const system = `You are a concise voice-assistant answerer for a hiring platform. Answer ONLY using the CONTEXT below.
Rules:
- Reply in 2–3 short lines suitable for text-to-speech.
- If the context does not contain enough information, reply with exactly: ${JSON.stringify(KB_FALLBACK_ANSWER)}
- Never invent phone numbers, URLs, or policy details.
- If context conflicts, prefer the shortest factually supported phrase.
- Do not mention "context" or "chunks".`;

  const userMsg = `QUESTION:\n${normalized}\n\nCONTEXT:\n${context}`;

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: 220,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ],
  });

  let answer = (completion.choices[0]?.message?.content || '').trim();
  if (!answer) answer = KB_FALLBACK_ANSWER;
  const isFallback = answer.includes("don't have that information") || answer === KB_FALLBACK_ANSWER;

  const out = {
    answer,
    fallback: isFallback,
    bestScore: best,
    sources: opts.includeSources
      ? overThreshold.map((r) => ({ score: r.score, preview: r.chunk.text.slice(0, 200) }))
      : [],
  };

  await writeCache(key, agent._id, answer, isFallback);
  return out;
}

/**
 * @param {string} key
 * @param {import('mongoose').Types.ObjectId} agentId
 * @param {string} answer
 * @param {boolean} isFallback
 */
async function writeCache(key, agentId, answer, isFallback) {
  const ttlGood = config.voiceAgentKb.queryCacheTtlSeconds;
  const ttlMiss = config.voiceAgentKb.queryCacheMissTtlSeconds;
  const ttl = isFallback ? ttlMiss : ttlGood;
  if (ttl <= 0) return;

  const expiresAt = new Date(Date.now() + ttl * 1000);
  await KbQueryCache.findOneAndUpdate(
    { cacheKey: key },
    {
      cacheKey: key,
      agentId,
      answer,
      isFallback,
      expiresAt,
    },
    { upsert: true }
  );
}

/**
 * Programmatic entry for Bolna / services: same as queryKb but returns string only.
 * @param {string} agentIdOrExternal
 * @param {string} query
 */
export async function getAnswer(agentIdOrExternal, query) {
  const res = await queryKb(agentIdOrExternal, query, { skipCache: false });
  return res.answer;
}

/**
 * Short KB excerpt to inject into candidate verification system prompt (seed retrieval).
 * @param {string} externalAgentId - Bolna agent id
 * @param {{ maxChars?: number }} [opts]
 */
export async function getKbPromptContextForExternalAgent(externalAgentId, opts = {}) {
  const maxChars = opts.maxChars ?? 3500;
  const ext = String(externalAgentId || '').trim();
  if (!ext) return '';

  const agent = await voiceAgentService.resolveVoiceAgent(ext);
  if (!agent || !agent.knowledgeBaseEnabled) {
    logger.debug(`[KB] call prompt seed skipped: agent not found or Knowledge base toggle off (Bolna id=${ext})`);
    return '';
  }

  const qEmb = await embedQuery(PROMPT_SEED_QUERY);
  if (!qEmb.length) {
    logger.warn(`[KB] call prompt seed skipped: embeddings unavailable (OPENAI / embed query) agent=${agent._id}`);
    return '';
  }

  const kb = await voiceAgentService.getKnowledgeBaseForAgent(agent._id);
  const chunks = await KnowledgeChunk.find({ knowledgeBaseId: kb._id }).select('text embedding').lean();
  if (chunks.length === 0) {
    logger.info(`[KB] call prompt seed: no indexed chunks yet for agent Bolna id=${ext}`);
    return '';
  }

  const k = Math.min(config.voiceAgentKb.topK, 12);
  const minSim = config.voiceAgentKb.minSimilarity;
  const ranked = topKCosine(qEmb, chunks, k).filter((r) => r.score >= minSim);
  if (!ranked.length) {
    logger.info(
      `[KB] call prompt seed: no chunk above KB_MIN_SIMILARITY=${minSim} for default seed query (use Test query in portal or lower threshold) agent=${ext}`
    );
    return '';
  }

  let buf = '';
  for (const r of ranked) {
    const piece = r.chunk.text.trim();
    if (!piece) continue;
    const next = buf ? `${buf}\n\n${piece}` : piece;
    if (next.length > maxChars) break;
    buf = next;
  }
  if (!buf) return '';
  logger.info(
    `[KB] call prompt seed: loaded ~${buf.length} chars from top matching chunks into system prompt (Dharwin RAG) Bolna id=${ext}`
  );
  return `### Knowledge base (reference only; do not read verbatim if long — summarize for voice)\n${buf}`;
}
