// Parent document upload — text extraction. Server-only: pulls plain text out of an
// uploaded .txt / .docx / .pdf so the content can be previewed and published verbatim as a
// story. Parsers are pure-JS (mammoth, pdfjs-dist) — no native build, no LLM. Heavy modules
// are dynamically imported so they never reach the client bundle (and are listed in
// next.config.ts serverExternalPackages).

export interface ParsedDocument {
  text: string;
  /** Set when the extracted text contains no Han characters (empty / non-Chinese / lossy PDF). */
  warning?: string;
}

const HAN = /\p{Script=Han}/u;

/** Collapse intra-line whitespace, keep single newlines as paragraph breaks. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ ]*\n[ ]*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : '';
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

async function parsePdf(data: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // No workerSrc → pdfjs runs on the main thread (fine for text extraction; no canvas needed).
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(''));
  }
  await doc.cleanup();
  return pages.join('\n');
}

/**
 * Extract text from an uploaded document. Dispatches by extension (mime as a fallback):
 * .docx → mammoth, .pdf → pdfjs-dist, everything else → UTF-8 plain text.
 */
export async function parseDocument(
  bytes: ArrayBuffer | Buffer,
  filename: string,
  mime?: string,
): Promise<ParsedDocument> {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const ext = extensionOf(filename);

  let raw: string;
  if (ext === 'docx' || mime?.includes('officedocument.wordprocessing')) {
    raw = await parseDocx(buffer);
  } else if (ext === 'pdf' || mime === 'application/pdf') {
    raw = await parsePdf(new Uint8Array(buffer));
  } else {
    raw = new TextDecoder('utf-8').decode(buffer);
  }

  const text = normalizeText(raw);
  const warning = HAN.test(text) ? undefined : 'No Chinese characters found in this document.';
  return { text, warning };
}
