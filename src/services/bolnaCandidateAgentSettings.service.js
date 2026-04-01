import BolnaCandidateAgentSettings from '../models/bolnaCandidateAgentSettings.model.js';

const DEFAULT_KEY = 'default';

export async function getBolnaCandidateAgentSettingsDoc() {
  return BolnaCandidateAgentSettings.findOneAndUpdate(
    { key: DEFAULT_KEY },
    { $setOnInsert: { key: DEFAULT_KEY } },
    { upsert: true, new: true }
  );
}

/** Plain object for API responses (portal overrides removed; fields stay empty for compatibility). */
export async function getBolnaCandidateAgentSettings() {
  const doc = await getBolnaCandidateAgentSettingsDoc();
  return {
    extraSystemInstructions: '',
    greetingOverride: '',
    updatedAt: doc.updatedAt,
    updatedBy: doc.updatedBy,
  };
}

/** Clears legacy stored overrides; body keys are ignored. */
export async function updateBolnaCandidateAgentSettings(_body, userId) {
  const doc = await getBolnaCandidateAgentSettingsDoc();
  doc.extraSystemInstructions = '';
  doc.greetingOverride = '';
  if (userId) doc.updatedBy = userId;
  await doc.save();
  return getBolnaCandidateAgentSettings();
}

/** Portal greeting / extra-instruction overrides removed — only KB seed text is appended in bolnaCandidateVerification. */
export async function getBolnaCandidateAgentSettingsForPrompt() {
  return {
    extraSystemInstructions: '',
    greetingOverride: '',
  };
}
