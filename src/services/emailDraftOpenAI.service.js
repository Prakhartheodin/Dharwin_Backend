import httpStatus from 'http-status';
import OpenAI from 'openai';
import config from '../config/config.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 1400;

function getClient() {
  const apiKey = config.openai?.apiKey;
  if (!apiKey) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'AI drafting is not configured right now.');
  }
  return new OpenAI({ apiKey });
}

function truncateToBalancedJson(str) {
  let braceDepth = 0;
  let bracketDepth = 0;
  let inString = false;
  let escape = false;
  let quote = null;

  for (let i = 0; i < str.length; i += 1) {
    const char = str[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === '{') braceDepth += 1;
    else if (char === '}') braceDepth -= 1;
    else if (char === '[') bracketDepth += 1;
    else if (char === ']') bracketDepth -= 1;
  }

  return str + ']'.repeat(Math.max(0, bracketDepth)) + '}'.repeat(Math.max(0, braceDepth));
}

function parseJsonWithRepair(text) {
  const raw = String(text || '').trim();
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const attempts = [
    () => JSON.parse(cleaned),
    () => JSON.parse(cleaned.replace(/,(\s*[}\]])/g, '$1')),
    () => {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON object found');
      return JSON.parse(match[0]);
    },
    () => JSON.parse(truncateToBalancedJson(cleaned).replace(/,(\s*[}\]])/g, '$1')),
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch (error) {
      lastError = error;
    }
  }

  logger.error('[Email Draft AI] Failed to parse OpenAI JSON response', {
    rawLength: raw.length,
    rawSnippet: raw.slice(0, 300),
    lastError: lastError?.message,
  });
  throw new ApiError(httpStatus.BAD_GATEWAY, 'AI drafting returned an invalid response.');
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toSimpleHtml(text) {
  const normalized = normalizeText(text);
  if (!normalized) return '<p></p>';
  return normalized
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function normalizeOption(option, index) {
  const text = normalizeText(option?.text);
  if (!text) {
    throw new ApiError(httpStatus.BAD_GATEWAY, 'AI drafting did not return a usable draft option.');
  }
  return {
    id: index === 0 ? 'option-a' : 'option-b',
    label: index === 0 ? 'Option A' : 'Option B',
    text,
    html: toSimpleHtml(text),
  };
}

export async function generateEmailDraftOptions({
  tone,
  prompt,
  subject = '',
  context = '',
  recipientName = '',
  length = 'medium',
}) {
  const client = getClient();
  const subjectHint = subject.trim() ? `Existing subject: ${subject.trim()}` : 'No subject has been written yet.';
  const recipientHint = recipientName.trim() ? `Recipient name: ${recipientName.trim()}` : 'Recipient name was not provided.';
  const contextHint = context.trim() ? `Extra context:\n${context.trim()}` : 'No extra context was provided.';
  const promptBody = `You are assisting with drafting a professional email.

Return ONLY valid JSON with this exact shape:
{
  "subject": "string",
  "options": [
    { "text": "string" },
    { "text": "string" }
  ]
}

Rules:
- Generate exactly 2 distinct email options.
- Match the requested tone: ${tone}.
- Target length: ${length}.
- Keep the output ready to send, not meta commentary.
- Do not include markdown fences.
- Do not include placeholders like [Name] unless the recipient name is missing.
- Use concise paragraphs and a realistic email structure.
- The subject should be concise and suitable for the drafted email.

Draft request:
${prompt.trim()}

${subjectHint}
${recipientHint}
${contextHint}`;

  logger.info('[Email Draft AI] Generating email draft options', {
    tone,
    length,
    hasSubject: Boolean(subject.trim()),
    hasContext: Boolean(context.trim()),
    hasRecipientName: Boolean(recipientName.trim()),
    promptLength: prompt.trim().length,
  });

  try {
    const response = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [{ role: 'user', content: promptBody }],
      temperature: 0.8,
      max_tokens: DEFAULT_MAX_TOKENS,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices?.[0]?.message?.content;
    if (!raw) {
      throw new ApiError(httpStatus.BAD_GATEWAY, 'AI drafting returned no content.');
    }

    const parsed = parseJsonWithRepair(raw);
    const options = Array.isArray(parsed?.options) ? parsed.options.slice(0, 2) : [];
    if (options.length !== 2) {
      throw new ApiError(httpStatus.BAD_GATEWAY, 'AI drafting did not return two draft options.');
    }

    return {
      subject: normalizeText(parsed?.subject || subject),
      options: options.map((option, index) => normalizeOption(option, index)),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;

    logger.error('[Email Draft AI] OpenAI request failed', {
      error: error?.message || String(error),
    });
    throw new ApiError(httpStatus.BAD_GATEWAY, 'AI drafting is temporarily unavailable. Please try again.');
  }
}
