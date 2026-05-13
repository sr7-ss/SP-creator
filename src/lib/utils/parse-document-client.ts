/**
 * Client-side document parsing.
 *
 * Keeps file bytes inside the browser — nothing is uploaded. PDF/PPTX/TXT/MD
 * supported. Mirrors the shape of the server /api/ai/parse-document response so
 * callers can swap without further changes.
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 50_000;

export interface ParsedDocument {
  text: string;
  fileName: string;
  fileSize: number;
  charCount: number;
  truncated: boolean;
}

async function parsePdfInBrowser(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Configure worker only once
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: unknown) =>
        typeof item === 'object' && item && 'str' in item
          ? String((item as { str: string }).str)
          : ''
      )
      .join(' ');
    pages.push(pageText);
  }
  return pages.join('\n\n');
}

function parsePptxInBrowser(buffer: ArrayBuffer): string {
  // Same simple heuristic as the server: match <a:t>…</a:t> text nodes.
  // Works well enough for most decks; a proper parser would unzip the pptx.
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const content = decoder.decode(buffer);
  const textMatches = content.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
  return textMatches
    .map(m => m.match(/<a:t[^>]*>([^<]*)<\/a:t>/)?.[1] || '')
    .filter(Boolean)
    .join(' ');
}

export async function parseDocumentClient(file: File): Promise<ParsedDocument> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File too large (max 10MB)');
  }

  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  let text = '';

  if (name.endsWith('.pdf')) {
    text = await parsePdfInBrowser(buffer);
  } else if (name.endsWith('.pptx') || name.endsWith('.ppt')) {
    text = parsePptxInBrowser(buffer);
  } else if (name.endsWith('.txt') || name.endsWith('.md')) {
    text = new TextDecoder('utf-8').decode(buffer);
  } else {
    throw new Error('Unsupported file type. Supported: PDF, PPTX, TXT, MD');
  }

  const trimmed = text.slice(0, MAX_TEXT_CHARS);
  return {
    text: trimmed,
    fileName: file.name,
    fileSize: file.size,
    charCount: trimmed.length,
    truncated: text.length > MAX_TEXT_CHARS,
  };
}
