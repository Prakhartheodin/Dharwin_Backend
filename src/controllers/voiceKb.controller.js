import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import * as knowledgeIngestService from '../services/knowledgeIngest.service.js';
import * as kbQueryService from '../services/kbQuery.service.js';
import { createActivityLog } from '../services/activityLog.service.js';
import { ActivityActions, EntityTypes } from '../config/activityLog.js';

const postKbQuery = catchAsync(async (req, res) => {
  const { agentId, query, includeSources } = req.body;
  const result = await kbQueryService.queryKb(agentId, query, { includeSources: Boolean(includeSources) });
  res.status(httpStatus.OK).send({ success: true, ...result });
});

const postPdfDocument = catchAsync(async (req, res) => {
  const userId = req.user?.id || req.user?._id;
  const file = req.file;
  if (!file?.buffer) {
    res.status(httpStatus.BAD_REQUEST).send({ success: false, message: 'PDF file is required (field: file)' });
    return;
  }
  const title = req.body?.title?.trim() || file.originalname || 'Uploaded PDF';
  const { document, duplicate } = await knowledgeIngestService.ingestPdfDocument(
    req.params.agentId,
    file.buffer,
    title
  );
  if (userId) {
    await createActivityLog(
      String(userId),
      ActivityActions.SETTINGS_BOLNA_CANDIDATE_AGENT_UPDATE,
      EntityTypes.BOLNA_CANDIDATE_AGENT_SETTINGS,
      document.id || String(document._id),
      { action: 'kb_pdf_upload', duplicate },
      req
    );
  }
  const code = duplicate ? httpStatus.OK : httpStatus.ACCEPTED;
  res.status(code).send({ success: true, document, duplicate: Boolean(duplicate) });
});

const postTextDocument = catchAsync(async (req, res) => {
  const userId = req.user?.id || req.user?._id;
  const { document, duplicate } = await knowledgeIngestService.ingestTextDocument(req.params.agentId, req.body);
  if (userId) {
    await createActivityLog(
      String(userId),
      ActivityActions.SETTINGS_BOLNA_CANDIDATE_AGENT_UPDATE,
      EntityTypes.BOLNA_CANDIDATE_AGENT_SETTINGS,
      document.id || String(document._id),
      { action: 'kb_text_ingest', duplicate },
      req
    );
  }
  const code = duplicate ? httpStatus.OK : httpStatus.ACCEPTED;
  res.status(code).send({ success: true, document, duplicate: Boolean(duplicate) });
});

const postUrlDocument = catchAsync(async (req, res) => {
  const userId = req.user?.id || req.user?._id;
  const { document, duplicate } = await knowledgeIngestService.ingestUrlDocument(req.params.agentId, req.body.url);
  if (userId) {
    await createActivityLog(
      String(userId),
      ActivityActions.SETTINGS_BOLNA_CANDIDATE_AGENT_UPDATE,
      EntityTypes.BOLNA_CANDIDATE_AGENT_SETTINGS,
      document.id || String(document._id),
      { action: 'kb_url_ingest', duplicate },
      req
    );
  }
  const code = duplicate ? httpStatus.OK : httpStatus.ACCEPTED;
  res.status(code).send({ success: true, document, duplicate: Boolean(duplicate) });
});

const listDocuments = catchAsync(async (req, res) => {
  const documents = await knowledgeIngestService.listDocumentsForAgent(req.params.agentId);
  res.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.status(httpStatus.OK).send({ success: true, documents });
});

const deleteDocument = catchAsync(async (req, res) => {
  const userId = req.user?.id || req.user?._id;
  await knowledgeIngestService.deleteKnowledgeDocument(req.params.documentId);
  if (userId) {
    await createActivityLog(
      String(userId),
      ActivityActions.SETTINGS_BOLNA_CANDIDATE_AGENT_UPDATE,
      EntityTypes.BOLNA_CANDIDATE_AGENT_SETTINGS,
      req.params.documentId,
      { action: 'kb_document_delete' },
      req
    );
  }
  res.status(httpStatus.NO_CONTENT).send();
});

export { postKbQuery, postPdfDocument, postTextDocument, postUrlDocument, listDocuments, deleteDocument };
