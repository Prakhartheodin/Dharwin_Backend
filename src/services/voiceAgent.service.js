import mongoose from 'mongoose';
import VoiceAgent from '../models/voiceAgent.model.js';
import KnowledgeBase from '../models/knowledgeBase.model.js';
import KnowledgeDocument from '../models/knowledgeDocument.model.js';
import KnowledgeChunk from '../models/knowledgeChunk.model.js';
import config from '../config/config.js';
import ApiError from '../utils/ApiError.js';
import httpStatus from 'http-status';

/**
 * Ensure a KnowledgeBase doc exists for this agent (1:1).
 * @param {import('mongoose').Types.ObjectId} agentId
 */
export async function ensureKnowledgeBaseForAgent(agentId) {
  let kb = await KnowledgeBase.findOne({ agentId });
  if (!kb) {
    kb = await KnowledgeBase.create({ agentId });
  }
  return kb;
}

/**
 * Upsert seed agents from Bolna env (idempotent).
 */
export async function seedVoiceAgentsFromEnv() {
  const seeds = [
    { name: 'Job / recruiter verification (Bolna)', externalAgentId: String(config.bolna.agentId || '').trim() },
    {
      name: 'Candidate application verification (Bolna)',
      externalAgentId: String(config.bolna.candidateAgentId || '').trim(),
    },
  ].filter((s) => s.externalAgentId);

  const seen = new Set();
  for (const s of seeds) {
    if (seen.has(s.externalAgentId)) continue;
    seen.add(s.externalAgentId);
    await VoiceAgent.findOneAndUpdate(
      { externalAgentId: s.externalAgentId },
      { $setOnInsert: { name: s.name, knowledgeBaseEnabled: false } },
      { upsert: true, new: true }
    );
  }
}

/**
 * @param {object} [filter]
 */
export async function listVoiceAgents() {
  await seedVoiceAgentsFromEnv();
  const agents = await VoiceAgent.find().sort({ name: 1 }).lean();
  const out = [];
  for (const a of agents) {
    const kb = await KnowledgeBase.findOne({ agentId: a._id }).lean();
    let docCount = 0;
    let chunkCount = 0;
    if (kb) {
      docCount = await KnowledgeDocument.countDocuments({ knowledgeBaseId: kb._id });
      chunkCount = await KnowledgeChunk.countDocuments({ knowledgeBaseId: kb._id });
    }
    out.push({
      ...a,
      id: a._id.toString(),
      knowledgeBaseSummary: kb
        ? { id: kb._id.toString(), documentCount: docCount, chunkCount }
        : null,
    });
  }
  return out;
}

/**
 * @param {string} idOrExternal
 */
export async function getVoiceAgentById(idOrExternal) {
  await seedVoiceAgentsFromEnv();
  const resolved = await resolveVoiceAgent(idOrExternal);
  if (!resolved) throw new ApiError(httpStatus.NOT_FOUND, 'Voice agent not found');
  const agent = typeof resolved.toObject === 'function' ? resolved.toObject() : resolved;
  const kb = await ensureKnowledgeBaseForAgent(agent._id);
  const docCount = await KnowledgeDocument.countDocuments({ knowledgeBaseId: kb._id });
  const chunkCount = await KnowledgeChunk.countDocuments({ knowledgeBaseId: kb._id });
  return {
    ...agent,
    id: agent._id.toString(),
    knowledgeBase: { id: kb._id.toString(), documentCount: docCount, chunkCount },
  };
}

async function findAgentDocByIdOrExternal(idOrExternal) {
  await seedVoiceAgentsFromEnv();
  const resolved = await resolveVoiceAgent(idOrExternal);
  if (!resolved) return null;
  return VoiceAgent.findById(resolved._id);
}

/**
 * @param {{ name: string, externalAgentId: string, knowledgeBaseEnabled?: boolean, description?: string }} body
 * @param {string|null} userId
 */
export async function createVoiceAgent(body, userId) {
  const exists = await VoiceAgent.findOne({ externalAgentId: body.externalAgentId.trim() });
  if (exists) {
    throw new ApiError(httpStatus.CONFLICT, 'An agent with this externalAgentId already exists');
  }
  const createdBy =
    userId && mongoose.Types.ObjectId.isValid(String(userId)) ? new mongoose.Types.ObjectId(String(userId)) : null;
  const agent = await VoiceAgent.create({
    name: body.name.trim(),
    externalAgentId: body.externalAgentId.trim(),
    knowledgeBaseEnabled: Boolean(body.knowledgeBaseEnabled),
    description: (body.description || '').slice(0, 2000),
    createdBy,
  });
  await ensureKnowledgeBaseForAgent(agent._id);
  return getVoiceAgentById(agent._id.toString());
}

/**
 * @param {string} id
 * @param {{ name?: string, knowledgeBaseEnabled?: boolean, description?: string }} body
 */
export async function updateVoiceAgent(idOrExternal, body) {
  const agent = await findAgentDocByIdOrExternal(idOrExternal);
  if (!agent) throw new ApiError(httpStatus.NOT_FOUND, 'Voice agent not found');
  if (body.name != null) agent.name = String(body.name).trim().slice(0, 200);
  if (body.knowledgeBaseEnabled != null) agent.knowledgeBaseEnabled = Boolean(body.knowledgeBaseEnabled);
  if (body.description != null) agent.description = String(body.description).slice(0, 2000);
  await agent.save();
  return getVoiceAgentById(agent._id.toString());
}

/**
 * Resolve VoiceAgent by Mongo id or external Bolna agent id string.
 * @param {string} agentIdOrExternal
 */
export async function resolveVoiceAgent(agentIdOrExternal) {
  await seedVoiceAgentsFromEnv();
  if (mongoose.Types.ObjectId.isValid(agentIdOrExternal)) {
    const a = await VoiceAgent.findById(agentIdOrExternal);
    if (a) return a;
  }
  return VoiceAgent.findOne({ externalAgentId: String(agentIdOrExternal).trim() });
}

/**
 * @param {import('mongoose').Types.ObjectId|string} agentId
 */
export async function getKnowledgeBaseForAgent(agentId) {
  const agent = await VoiceAgent.findById(agentId);
  if (!agent) throw new ApiError(httpStatus.NOT_FOUND, 'Voice agent not found');
  return ensureKnowledgeBaseForAgent(agent._id);
}
