import { PDFParse } from 'pdf-parse';

const DEFAULT_MAX_PAGES = 200;

/**
 * @param {Buffer} buffer
 * @param {{ maxMb?: number, maxPages?: number }} [opts]
 * @returns {Promise<{ text: string, pageCount: number, metadata: Record<string, unknown> }>}
 */
export async function extractPdfText(buffer, opts = {}) {
  const maxMb = opts.maxMb ?? 25;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const sizeMb = buffer.length / (1024 * 1024);
  if (sizeMb > maxMb) {
    const err = new Error(`PDF exceeds maximum size (${maxMb} MB)`);
    err.code = 'PDF_TOO_LARGE';
    throw err;
  }

  const parser = new PDFParse({ data: buffer });
  let textResult;
  try {
    textResult = await parser.getText();
  } finally {
    await parser.destroy?.();
  }

  const text = (textResult?.text || '').replace(/\0/g, '').trim();
  const pages = textResult?.pages?.length ?? textResult?.numPages ?? null;

  if (pages != null && pages > maxPages) {
    const err = new Error(`PDF exceeds maximum page count (${maxPages})`);
    err.code = 'PDF_TOO_MANY_PAGES';
    throw err;
  }

  return {
    text,
    pageCount: typeof pages === 'number' ? pages : null,
    metadata: {
      pages: pages,
    },
  };
}
