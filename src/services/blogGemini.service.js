import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config/config.js';
import logger from '../config/logger.js';

function toSimpleHtml(text) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('');
}

function getModel() {
  const apiKey = config.gemini?.apiKey;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Add it to .env');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.8,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 8192,
    },
  });
}

/**
 * Generate or enhance blog content.
 * @param {Object} params
 * @param {'enhance'|'generate'} params.mode
 * @param {string} [params.existingContent]
 * @param {string} [params.title]
 * @param {string} [params.keywords]
 * @param {number} [params.wordCount]
 * @param {string} [params.format]
 * @returns {Promise<string>} HTML content
 */
export async function generateBlog(params) {
  const { mode, existingContent = '', title = '', keywords = '', wordCount = 500, format = 'neutral' } = params;

  const model = getModel();

  if (mode === 'enhance') {
    const text = (existingContent || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) throw new Error('No content to enhance. Type something or use Generate from title & keywords.');
    logger.info('Blog enhance: calling Gemini', { inputLength: text.length });
    const prompt = `You are an expert editor. Improve and expand this blog content. Keep the same topic. Keep the tone ${format}. Return only the enhanced blog text, no meta commentary. Use clear paragraphs.\n\n---\n${text}`;
    const result = await model.generateContent(prompt);
    const output = result.response.text();
    const html = toSimpleHtml(output);
    logger.info('Blog enhance: done', { outputLength: output.length });
    return html;
  }

  if (mode === 'generate') {
    if (!title.trim()) throw new Error('Blog title is required.');
    logger.info('Blog generate: calling Gemini', { title: title.slice(0, 80) });
    const prompt = `Generate a comprehensive, engaging blog post with the following details:
- Title: ${title}
- Keywords to incorporate: ${keywords || 'general interest'}
- Approximate length: ${wordCount} words
- Tone: ${format}

Make the content original, informative, and suitable for an online audience. Write in a ${format} tone. Use clear paragraphs. Return only the blog body text, no title or meta commentary.`;
    const result = await model.generateContent(prompt);
    const output = result.response.text();
    const html = toSimpleHtml(output);
    logger.info('Blog generate: done', { outputLength: output.length });
    return html;
  }

  throw new Error('Invalid mode');
}

/**
 * Generate one blog from a theme (for multi-blog: AI creates distinct title + content).
 * @param {Object} params
 * @param {string} params.theme
 * @param {number} params.index
 * @param {number} params.total
 * @param {string} [params.keywords]
 * @param {number} [params.wordCount]
 * @param {string} [params.format]
 * @returns {Promise<{ title: string, content: string }>}
 */
export async function generateBlogFromTheme(params) {
  const { theme, index, total, keywords = '', wordCount = 500, format = 'neutral' } = params;

  const model = getModel();
  logger.info('Blog generateFromTheme: calling Gemini', { theme: theme.slice(0, 50), index: index + 1, total });

  const prompt = `You are writing blog ${index + 1} of ${total} on the same overall theme.
Theme: ${theme}
Keywords to incorporate: ${keywords || 'general interest'}
Approximate length: ${wordCount} words
Tone: ${format}

Create a distinct, specific title for this blog (do not repeat the theme word-for-word), then write the full post in a ${format} tone. Reply in this exact format:
- First line: TITLE: your blog title here
- Then a blank line
- Then the full blog body in clear paragraphs (no extra labels).

Return only those two parts: the TITLE line and the body.`;

  const result = await model.generateContent(prompt);
  const output = result.response.text();
  const titleMatch = output.match(/TITLE:\s*(.+?)(?:\n|$)/i);
  const title = titleMatch ? titleMatch[1].trim() : `Blog ${index + 1}`;
  const bodyStart = output.indexOf('\n\n');
  const body = bodyStart >= 0 ? output.slice(bodyStart).trim() : output.replace(/^TITLE:.*/i, '').trim();
  const content = toSimpleHtml(body);
  logger.info('Blog generateFromTheme: done', { index: index + 1, total, title: title.slice(0, 50) });
  return { title, content };
}

/**
 * Get real-time suggestions (typos, spelling, small improvements).
 * @param {Object} params
 * @param {string} params.content
 * @param {string} [params.format]
 * @returns {Promise<{ edits: Array<{ original: string, suggested: string, reason: string }> }>}
 */
export async function getBlogSuggestions(params) {
  const { content, format = 'neutral' } = params;
  const plain = (content || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return { edits: [] };

  const apiKey = config.gemini?.apiKey;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured. Add it to .env');

  const genAI = new GoogleGenerativeAI(apiKey);
  const suggestionModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.3,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    },
  });

  logger.info('Blog suggestions: calling Gemini', { contentLength: plain.length });
  const prompt = `You are an expert editor. Suggest only MINUTE, targeted improvements: fix typos, spelling, and obvious grammar; suggest small word-choice or clarity improvements. Do NOT rewrite whole sentences or change every phrase. Keep the tone ${format}.

Return ONLY a single JSON object, no other text:
{"edits": [{"original": "exact phrase as it appears in the text", "suggested": "replacement", "reason": "spelling"}]}

Rules:
- Each "original" must be an exact substring of the user's text (copy it character-for-character).
- Make 2-8 small edits maximum. Prefer quality over quantity.
- reason: one short word like "spelling", "grammar", "clarity", "word choice".
- Escape quotes in JSON strings (use \\" for quotes inside strings).

Input text:

---
${plain}
---`;

  const result = await suggestionModel.generateContent(prompt);
  const output = result.response.text();
  try {
    const raw = output
      .replace(/```json\s?/gi, '')
      .replace(/```\s?/g, '')
      .trim();
    const parsed = JSON.parse(raw);
    const edits = (Array.isArray(parsed.edits) ? parsed.edits : [])
      .filter((e) => typeof e.original === 'string' && typeof e.suggested === 'string')
      .map((e) => ({
        original: String(e.original),
        suggested: String(e.suggested),
        reason: typeof e.reason === 'string' ? e.reason : 'improvement',
      }));
    logger.info('Blog suggestions: done', { editsCount: edits.length });
    return { edits };
  } catch {
    logger.warn('Blog suggestions: JSON parse failed', { outputSlice: output.slice(0, 200) });
    return { edits: [] };
  }
}
