import crypto from 'node:crypto';
import logger from '../config/logger.js';
import config from '../config/config.js';
import ApiError from '../utils/ApiError.js';
import httpStatus from 'http-status';
import KnowledgeDocument from '../models/knowledgeDocument.model.js';
import KnowledgeChunk from '../models/knowledgeChunk.model.js';
import KnowledgeBase from '../models/knowledgeBase.model.js';
import KbQueryCache from '../models/kbQueryCache.model.js';
import * as voiceAgentService from './voiceAgent.service.js';
import { extractPdfText } from '../utils/pdfText.util.js';
import { chunkTextByTokens } from '../utils/textChunk.util.js';
import { embedTexts } from '../utils/embedding.util.js';
import { parsePublicHttpUrl, assertSafeHostname } from '../utils/urlSsrf.util.js';
import { htmlToPlainText } from '../utils/htmlText.util.js';
import * as bolnaKnowledgebaseService from './bolnaKnowledgebase.service.js';

const FETCH_TIMEOUT_MS = 20000;

function bolnaKbFormOpts() {
  const k = config.voiceAgentKb;
  return {
    multilingual: k.bolnaKbMultilingual,
    chunkSize: k.bolnaKbChunkSize,
    overlapping: k.bolnaKbOverlapping,
    similarityTopK: k.bolnaKbSimilarityTopK,
  };
}

/**
 * Re-read metadata from MongoDB before merging so concurrent jobs (embed pipeline vs Bolna sync)
 * do not overwrite each other's fields on save.
 * @param {import('mongoose').Types.ObjectId} docId
 * @param {Record<string, unknown>} patch
 */
async function mergeMetadataFromDb(docId, patch) {
  const row = await KnowledgeDocument.findById(docId).select('metadata').lean();
  const base =
    row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? { ...row.metadata } : {};
  return { ...base, ...patch };
}

/**
 * @param {import('mongoose').Types.ObjectId} docId
 * @param {object} data
 */
async function applyBolnaKbSyncSuccess(docId, data) {
  const doc = await KnowledgeDocument.findById(docId);
  if (!doc || !data?.rag_id) return;
  const base = await mergeMetadataFromDb(docId, {});
  doc.metadata = {
    ...base,
    bolna: {
      rag_id: String(data.rag_id),
      file_name: data.file_name != null ? String(data.file_name) : undefined,
      source_type: data.source_type != null ? String(data.source_type) : undefined,
      status: data.status != null ? String(data.status) : 'processing',
      syncedAt: new Date().toISOString(),
      error: null,
    },
  };
  await doc.save();
  logger.info(`[Bolna KB] synced doc=${docId} rag_id=${data.rag_id}`);
}

/**
 * @param {import('mongoose').Types.ObjectId} docId
 * @param {Error|unknown} err
 */
async function applyBolnaKbSyncFailure(docId, err) {
  const doc = await KnowledgeDocument.findById(docId);
  if (!doc) return;
  const msg = err instanceof Error ? err.message : String(err);
  const base = await mergeMetadataFromDb(docId, {});
  const prevBolna = base.bolna && typeof base.bolna === 'object' ? { ...base.bolna } : {};
  doc.metadata = {
    ...base,
    bolna: {
      ...prevBolna,
      status: 'error',
      error: msg.slice(0, 500),
      syncedAt: new Date().toISOString(),
    },
  };
  await doc.save();
  logger.warn(`[Bolna KB] sync failed doc=${docId}: ${msg}`);
}

/**
 * @param {import('mongoose').Types.ObjectId} docId
 * @param {string} url
 */
async function runBolnaKbUrlSync(docId, url) {
  if (!bolnaKnowledgebaseService.isSyncEnabled()) return;
  const doc = await KnowledgeDocument.findById(docId).select('metadata');
  if (doc?.metadata?.bolna?.rag_id) return;
  try {
    const data = await bolnaKnowledgebaseService.createBolnaKnowledgebaseFromUrl(url, bolnaKbFormOpts());
    if (data?.rag_id) await applyBolnaKbSyncSuccess(docId, data);
    else if (data) await applyBolnaKbSyncFailure(docId, new Error('Bolna response missing rag_id'));
  } catch (e) {
    await applyBolnaKbSyncFailure(docId, e);
  }
}

/**
 * @param {import('mongoose').Types.ObjectId} docId
 * @param {Buffer} pdfBuffer
 * @param {string} title
 */
async function runBolnaKbPdfSync(docId, pdfBuffer, title) {
  if (!bolnaKnowledgebaseService.isSyncEnabled()) return;
  const doc = await KnowledgeDocument.findById(docId).select('metadata');
  if (doc?.metadata?.bolna?.rag_id) return;
  try {
    const data = await bolnaKnowledgebaseService.createBolnaKnowledgebaseFromPdf(
      pdfBuffer,
      title || 'document.pdf',
      bolnaKbFormOpts()
    );
    if (data?.rag_id) await applyBolnaKbSyncSuccess(docId, data);
    else if (data) await applyBolnaKbSyncFailure(docId, new Error('Bolna response missing rag_id'));
  } catch (e) {
    await applyBolnaKbSyncFailure(docId, e);
  }
}

/**
 * @param {import('mongoose').Types.ObjectId} docId
 * @param {string} url
 */
function scheduleBolnaKbSyncForUrl(docId, url) {
  if (!bolnaKnowledgebaseService.isSyncEnabled()) return;
  setImmediate(() => {
    runBolnaKbUrlSync(docId, url).catch((err) =>
      logger.error(`[Bolna KB] runBolnaKbUrlSync crash: ${err?.message}`)
    );
  });
}

/**
 * @param {import('mongoose').Types.ObjectId} docId
 * @param {Buffer} pdfBuffer
 * @param {string} title
 */
function scheduleBolnaKbSyncForPdf(docId, pdfBuffer, title) {
  if (!bolnaKnowledgebaseService.isSyncEnabled()) return;
  const copy = Buffer.from(pdfBuffer);
  setImmediate(() => {
    runBolnaKbPdfSync(docId, copy, title).catch((err) =>
      logger.error(`[Bolna KB] runBolnaKbPdfSync crash: ${err?.message}`)
    );
  });
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function normalizeQueryKey(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * @param {import('mongoose').Types.ObjectId} knowledgeBaseId
 */
async function countReadyDocs(knowledgeBaseId) {
  return KnowledgeDocument.countDocuments({
    knowledgeBaseId,
    status: { $in: ['pending', 'processing', 'ready'] },
  });
}

/**
 * @param {string} agentIdOrExternal
 */
async function assertUnderDocLimit(knowledgeBaseId) {
  const n = await countReadyDocs(knowledgeBaseId);
  const max = config.voiceAgentKb.maxDocsPerAgent;
  if (n >= max) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Maximum of ${max} documents per knowledge base reached`);
  }
}

/**
 * @param {import('mongoose').Types.ObjectId} docId
 */
async function runEmbedPipeline(docId) {
  const doc = await KnowledgeDocument.findById(docId);
  if (!doc) return;

  doc.status = 'processing';
  doc.errorMessage = null;
  await doc.save();

  try {
    const raw = String(doc.rawText || '').trim();
    if (!raw) {
      doc.status = 'failed';
      doc.errorMessage = 'No extractable text (empty document or scanned PDF without OCR).';
      doc.metadata = await mergeMetadataFromDb(doc._id, { code: 'EMPTY_TEXT' });
      await doc.save();
      return;
    }

    await KnowledgeChunk.deleteMany({ documentId: doc._id });

    const target = config.voiceAgentKb.chunkTargetTokens;
    const overlap = config.voiceAgentKb.chunkOverlapTokens;
    const chunks = [...chunkTextByTokens(raw, { targetTokens: target, overlapTokens: overlap })];

    if (chunks.length === 0) {
      doc.status = 'failed';
      doc.errorMessage = 'No extractable text after chunking.';
      await doc.save();
      return;
    }

    const texts = chunks.map((c) => c.text);
    const embeddings = await embedTexts(texts);

    const bulk = chunks.map((c, i) => ({
      knowledgeBaseId: doc.knowledgeBaseId,
      documentId: doc._id,
      text: c.text,
      embedding: embeddings[i] || [],
      tokenCount: c.tokenCount,
      chunkIndex: c.chunkIndex,
      metadata: {},
    }));

    await KnowledgeChunk.insertMany(bulk);

    doc.status = 'ready';
    doc.metadata = await mergeMetadataFromDb(doc._id, { chunkCount: bulk.length });
    await doc.save();

    const kbRow = await KnowledgeBase.findById(doc.knowledgeBaseId).select('agentId').lean();
    if (kbRow?.agentId) {
      await KbQueryCache.deleteMany({ agentId: kbRow.agentId });
    }
  } catch (e) {
    logger.error(`[KB] ingest failed doc=${docId}: ${e.message}`);
    doc.status = 'failed';
    doc.errorMessage = e.message || 'Processing failed';
    doc.metadata = await mergeMetadataFromDb(doc._id, { code: e.code || 'INGEST_ERROR' });
    await doc.save();
  }
}

/**
 * Schedule pipeline without blocking caller.
 * @param {import('mongoose').Types.ObjectId} docId
 */
export function scheduleProcessDocument(docId) {
  setImmediate(() => {
    runEmbedPipeline(docId).catch((err) => logger.error(`[KB] runEmbedPipeline crash: ${err?.message}`));
  });
}

/**
 * @param {string} agentIdOrExternal
 * @param {Buffer} buffer
 * @param {string} [title]
 */
export async function ingestPdfDocument(agentIdOrExternal, buffer, title) {
  const agent = await voiceAgentService.resolveVoiceAgent(agentIdOrExternal);
  if (!agent) throw new ApiError(httpStatus.NOT_FOUND, 'Voice agent not found');
  if (!agent.knowledgeBaseEnabled) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Knowledge base is disabled for this agent');
  }

  const kb = await voiceAgentService.getKnowledgeBaseForAgent(agent._id);

  const hash = sha256Hex(buffer);
  const dup = await KnowledgeDocument.findOne({
    knowledgeBaseId: kb._id,
    type: 'pdf',
    contentSha256: hash,
    status: { $ne: 'failed' },
  }).lean();
  if (dup) {
    return { document: dup, duplicate: true };
  }

  await assertUnderDocLimit(kb._id);

  const { text, pageCount, metadata } = await extractPdfText(buffer, {
    maxMb: config.voiceAgentKb.maxPdfMb,
  });

  if (!text || text.length < 20) {
    const doc = await KnowledgeDocument.create({
      knowledgeBaseId: kb._id,
      type: 'pdf',
      title: title || 'Uploaded PDF',
      status: 'failed',
      errorMessage: 'No extractable text — this may be a scanned PDF (OCR not enabled).',
      rawText: text,
      contentSha256: hash,
      metadata: { ...metadata, code: 'SCANNED_PDF_NEEDS_OCR', pageCount },
    });
    return { document: doc.toJSON ? doc.toJSON() : doc, duplicate: false };
  }

  const doc = await KnowledgeDocument.create({
    knowledgeBaseId: kb._id,
    type: 'pdf',
    title: title || 'Uploaded PDF',
    status: 'pending',
    rawText: text,
    contentSha256: hash,
    metadata: { pageCount, ...metadata },
  });

  scheduleProcessDocument(doc._id);
  scheduleBolnaKbSyncForPdf(doc._id, buffer, title || 'document.pdf');
  return { document: doc.toJSON ? doc.toJSON() : doc, duplicate: false };
}

/**
 * @param {string} agentIdOrExternal
 * @param {{ title?: string, text: string }} body
 */
export async function ingestTextDocument(agentIdOrExternal, body) {
  const agent = await voiceAgentService.resolveVoiceAgent(agentIdOrExternal);
  if (!agent) throw new ApiError(httpStatus.NOT_FOUND, 'Voice agent not found');
  if (!agent.knowledgeBaseEnabled) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Knowledge base is disabled for this agent');
  }

  const kb = await voiceAgentService.getKnowledgeBaseForAgent(agent._id);
  const text = normalizeQueryKey(body.text);
  if (!text) throw new ApiError(httpStatus.BAD_REQUEST, 'text is required');

  const hash = sha256Hex(Buffer.from(text, 'utf8'));
  const dup = await KnowledgeDocument.findOne({
    knowledgeBaseId: kb._id,
    type: 'text',
    contentSha256: hash,
    status: { $ne: 'failed' },
  }).lean();
  if (dup) {
    return { document: dup, duplicate: true };
  }

  await assertUnderDocLimit(kb._id);

  const doc = await KnowledgeDocument.create({
    knowledgeBaseId: kb._id,
    type: 'text',
    title: body.title?.trim() || 'Pasted text',
    status: 'pending',
    rawText: text,
    contentSha256: hash,
    metadata: {},
  });

  scheduleProcessDocument(doc._id);
  return { document: doc.toJSON ? doc.toJSON() : doc, duplicate: false };
}

/**
 * @param {string} agentIdOrExternal
 * @param {string} urlStr
 */
export async function ingestUrlDocument(agentIdOrExternal, urlStr) {
  const agent = await voiceAgentService.resolveVoiceAgent(agentIdOrExternal);
  if (!agent) throw new ApiError(httpStatus.NOT_FOUND, 'Voice agent not found');
  if (!agent.knowledgeBaseEnabled) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Knowledge base is disabled for this agent');
  }

  const u = parsePublicHttpUrl(urlStr);
  await assertSafeHostname(u.hostname);

  const kb = await voiceAgentService.getKnowledgeBaseForAgent(agent._id);

  const canonicalUrl = u.toString();
  const hash = sha256Hex(Buffer.from(canonicalUrl, 'utf8'));
  const dup = await KnowledgeDocument.findOne({
    knowledgeBaseId: kb._id,
    type: 'url',
    contentSha256: hash,
    status: { $ne: 'failed' },
  }).lean();
  if (dup) {
    return { document: dup, duplicate: true };
  }

  await assertUnderDocLimit(kb._id);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(canonicalUrl, {
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'User-Agent': 'DharwinKBIngest/1.0',
        Accept: 'text/html, text/plain;q=0.9,*/*;q=0.1',
      },
    });
  } catch (e) {
    clearTimeout(t);
    if (e.name === 'AbortError') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'URL fetch timed out');
    }
    throw new ApiError(httpStatus.BAD_REQUEST, e.message || 'URL fetch failed');
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    throw new ApiError(httpStatus.BAD_REQUEST, `URL returned HTTP ${res.status}`);
  }

  const cl = res.headers.get('content-length');
  const maxBytes = config.voiceAgentKb.maxUrlBytes;
  if (cl && Number(cl) > maxBytes) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Response too large');
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Response too large');
  }

  const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  let plain;
  if (ct.includes('html')) {
    plain = htmlToPlainText(buf.toString('utf8'));
  } else {
    plain = buf.toString('utf8').replace(/\0/g, '').trim();
  }

  if (!plain || plain.length < 20) {
    const doc = await KnowledgeDocument.create({
      knowledgeBaseId: kb._id,
      type: 'url',
      title: u.hostname,
      sourceUrl: canonicalUrl,
      status: 'failed',
      errorMessage: 'No extractable text from URL.',
      rawText: plain,
      contentSha256: hash,
      metadata: { contentType: ct },
    });
    return { document: doc.toJSON ? doc.toJSON() : doc, duplicate: false };
  }

  const doc = await KnowledgeDocument.create({
    knowledgeBaseId: kb._id,
    type: 'url',
    title: u.hostname,
    sourceUrl: canonicalUrl,
    status: 'pending',
    rawText: plain,
    contentSha256: hash,
    metadata: { contentType: ct },
  });

  scheduleProcessDocument(doc._id);
  scheduleBolnaKbSyncForUrl(doc._id, canonicalUrl);
  return { document: doc.toJSON ? doc.toJSON() : doc, duplicate: false };
}

/**
 * Create-time Bolna response is usually status=processing; Bolna later flips to processed.
 * Poll GET /knowledgebase/:id when listing so the admin UI matches Bolna's dashboard.
 * @param {object[]} leanDocs - KnowledgeDocument lean rows
 */
async function refreshBolnaStatusesForDocs(leanDocs) {
  if (!String(config.bolna.apiKey || '').trim()) return;

  const needsPoll = leanDocs.filter((d) => {
    const b = d.metadata?.bolna;
    if (!b || typeof b !== 'object' || !b.rag_id) return false;
    const st = b.status;
    if (st === 'processed') return false;
    if (st === 'error') return false;
    return true;
  });

  await Promise.all(
    needsPoll.map(async (d) => {
      const ragId = String(d.metadata.bolna.rag_id);
      try {
        const remote = await bolnaKnowledgebaseService.getBolnaKnowledgebase(ragId);
        const st = remote?.status;
        if (!st || st === d.metadata.bolna.status) return;
        await KnowledgeDocument.updateOne({ _id: d._id }, { $set: { 'metadata.bolna.status': st } });
        d.metadata = {
          ...d.metadata,
          bolna: { ...d.metadata.bolna, status: st },
        };
      } catch (e) {
        logger.warn(`[Bolna KB] GET status rag_id=${ragId}: ${e.message}`);
      }
    })
  );
}

/**
 * @param {string} agentIdOrExternal
 */
export async function listDocumentsForAgent(agentIdOrExternal) {
  const agent = await voiceAgentService.resolveVoiceAgent(agentIdOrExternal);
  if (!agent) throw new ApiError(httpStatus.NOT_FOUND, 'Voice agent not found');

  const kb = await voiceAgentService.getKnowledgeBaseForAgent(agent._id);
  const docs = await KnowledgeDocument.find({ knowledgeBaseId: kb._id })
    .sort({ updatedAt: -1 })
    .select('-rawText')
    .lean();

  await refreshBolnaStatusesForDocs(docs);

  return docs.map((d) => ({
    ...d,
    id: d._id.toString(),
  }));
}

/**
 * @param {string} documentId
 * @param {string} [agentIdOrExternal] - when set, ensures doc belongs to that agent's KB
 */
export async function deleteKnowledgeDocument(documentId, agentIdOrExternal) {
  const doc = await KnowledgeDocument.findById(documentId);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Document not found');

  if (agentIdOrExternal) {
    const agent = await voiceAgentService.resolveVoiceAgent(agentIdOrExternal);
    if (!agent) throw new ApiError(httpStatus.NOT_FOUND, 'Voice agent not found');
    const kb = await voiceAgentService.getKnowledgeBaseForAgent(agent._id);
    if (String(doc.knowledgeBaseId) !== String(kb._id)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Document does not belong to this agent');
    }
  }

  const bolnaRagId =
    doc.metadata && typeof doc.metadata.bolna === 'object' && doc.metadata.bolna?.rag_id
      ? String(doc.metadata.bolna.rag_id)
      : null;

  await KnowledgeChunk.deleteMany({ documentId: doc._id });
  const kbRow = await KnowledgeBase.findById(doc.knowledgeBaseId).select('agentId').lean();
  if (kbRow?.agentId) {
    await KbQueryCache.deleteMany({ agentId: kbRow.agentId });
  }

  if (bolnaRagId) {
    await bolnaKnowledgebaseService.deleteBolnaKnowledgebase(bolnaRagId);
  }

  await doc.deleteOne();
}
