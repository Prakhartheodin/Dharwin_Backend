/**
 * Bolna hosted Knowledge Base API — mirrors dashboard "Add Knowledge Base" (PDF or URL).
 * @see https://docs.bolna.ai/api-reference/knowledgebase/create
 *
 * Agents still need the RAG attached in Bolna → Agent → LLM tab unless Bolna adds API support.
 */

import config from '../config/config.js';
import logger from '../config/logger.js';

const BOLNA_KB_MAX_PDF_BYTES = 20 * 1024 * 1024;

function getBolnaConfig() {
  return {
    apiKey: config.bolna.apiKey || '',
    apiBase: (config.bolna.apiBase || 'https://api.bolna.ai').replace(/\/$/, ''),
  };
}

function isSyncEnabled() {
  return (
    config.voiceAgentKb.bolnaSyncEnabled === true &&
    Boolean(String(config.bolna.apiKey || '').trim())
  );
}

/**
 * @param {Response} res
 * @param {string} context
 */
async function parseBolnaKbResponse(res, context) {
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const message = (data && (data.message || data.error || data.detail)) || text || res.statusText;
    const err = new Error(`${context}: ${message}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * @param {FormData} form
 */
async function postKnowledgebase(form) {
  const { apiKey, apiBase } = getBolnaConfig();
  const res = await fetch(`${apiBase}/knowledgebase`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });
  return parseBolnaKbResponse(res, 'Bolna POST /knowledgebase');
}

/**
 * @param {string} url - Public HTTPS URL
 * @param {{ multilingual?: boolean, chunkSize?: number, overlapping?: number, similarityTopK?: number }} [opts]
 * @returns {Promise<{ rag_id: string, file_name?: string, source_type?: string, status?: string }>}
 */
export async function createBolnaKnowledgebaseFromUrl(url, opts = {}) {
  if (!isSyncEnabled()) {
    return null;
  }
  const form = new FormData();
  form.append('url', String(url).trim());
  if (opts.multilingual) {
    form.append('language_support', 'multilingual');
  }
  if (opts.chunkSize != null && Number.isFinite(opts.chunkSize)) {
    form.append('chunk_size', String(Math.round(opts.chunkSize)));
  }
  if (opts.overlapping != null && Number.isFinite(opts.overlapping)) {
    form.append('overlapping', String(Math.round(opts.overlapping)));
  }
  if (opts.similarityTopK != null && Number.isFinite(opts.similarityTopK)) {
    form.append('similarity_top_k', String(Math.round(opts.similarityTopK)));
  }
  return postKnowledgebase(form);
}

/**
 * @param {Buffer} buffer
 * @param {string} filename - e.g. handbook.pdf
 * @param {{ multilingual?: boolean, chunkSize?: number, overlapping?: number, similarityTopK?: number }} [opts]
 * @returns {Promise<{ rag_id: string, file_name?: string, source_type?: string, status?: string } | null>}
 */
export async function createBolnaKnowledgebaseFromPdf(buffer, filename, opts = {}) {
  if (!isSyncEnabled()) {
    return null;
  }
  if (!buffer?.length) {
    throw new Error('PDF buffer is empty');
  }
  if (buffer.length > BOLNA_KB_MAX_PDF_BYTES) {
    throw new Error(`PDF exceeds Bolna knowledge base limit (${BOLNA_KB_MAX_PDF_BYTES} bytes)`);
  }
  const safeName = String(filename || 'document.pdf').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 200);
  const name = safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;

  const form = new FormData();
  const blob = new Blob([buffer], { type: 'application/pdf' });
  form.append('file', blob, name);
  if (opts.multilingual) {
    form.append('language_support', 'multilingual');
  }
  if (opts.chunkSize != null && Number.isFinite(opts.chunkSize)) {
    form.append('chunk_size', String(Math.round(opts.chunkSize)));
  }
  if (opts.overlapping != null && Number.isFinite(opts.overlapping)) {
    form.append('overlapping', String(Math.round(opts.overlapping)));
  }
  if (opts.similarityTopK != null && Number.isFinite(opts.similarityTopK)) {
    form.append('similarity_top_k', String(Math.round(opts.similarityTopK)));
  }
  return postKnowledgebase(form);
}

/**
 * Current KB row on Bolna (status moves processing → processed after async ingest).
 * @see https://www.bolna.ai/docs/api-reference/knowledgebase/get_knowledgebase.md
 * @param {string} ragId
 * @returns {Promise<{ status?: string, rag_id?: string, file_name?: string } | null>}
 */
export async function getBolnaKnowledgebase(ragId) {
  if (!ragId || !String(config.bolna.apiKey || '').trim()) {
    return null;
  }
  const { apiKey, apiBase } = getBolnaConfig();
  const res = await fetch(`${apiBase}/knowledgebase/${encodeURIComponent(String(ragId).trim())}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  return parseBolnaKbResponse(res, 'Bolna GET /knowledgebase');
}

/**
 * @param {string} ragId
 * @returns {Promise<boolean>} true if deleted or skipped (no sync / no id)
 */
export async function deleteBolnaKnowledgebase(ragId) {
  /** Remove hosted KB even if KB_BOLNA_SYNC_ENABLED is off (cleanup of previously synced docs). */
  if (!ragId || !String(config.bolna.apiKey || '').trim()) {
    return false;
  }
  const { apiKey, apiBase } = getBolnaConfig();
  try {
    const res = await fetch(`${apiBase}/knowledgebase/${encodeURIComponent(ragId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    await parseBolnaKbResponse(res, 'Bolna DELETE /knowledgebase');
    logger.info(`[Bolna KB] deleted rag_id=${ragId}`);
    return true;
  } catch (e) {
    logger.warn(`[Bolna KB] delete failed rag_id=${ragId}: ${e.message}`);
    return false;
  }
}

export { isSyncEnabled, BOLNA_KB_MAX_PDF_BYTES };
