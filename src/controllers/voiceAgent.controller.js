import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import * as voiceAgentService from '../services/voiceAgent.service.js';

const listVoiceAgents = catchAsync(async (req, res) => {
  const agents = await voiceAgentService.listVoiceAgents();
  res.status(httpStatus.OK).send({ success: true, agents });
});

const createVoiceAgent = catchAsync(async (req, res) => {
  const userId = req.user?.id || req.user?._id;
  const agent = await voiceAgentService.createVoiceAgent(req.body, userId ? String(userId) : null);
  res.status(httpStatus.CREATED).send({ success: true, agent });
});

const getVoiceAgent = catchAsync(async (req, res) => {
  const agent = await voiceAgentService.getVoiceAgentById(req.params.agentId);
  res.status(httpStatus.OK).send({ success: true, agent });
});

const updateVoiceAgent = catchAsync(async (req, res) => {
  const agent = await voiceAgentService.updateVoiceAgent(req.params.agentId, req.body);
  res.status(httpStatus.OK).send({ success: true, agent });
});

export { listVoiceAgents, createVoiceAgent, getVoiceAgent, updateVoiceAgent };
