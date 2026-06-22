import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import type { CountOutcome } from '../types';
import { findPdfinfo, pdfinfoPageCount } from '../render/pdfinfo';

export interface PdfDeps {
  findPdfinfo: () => string | null;
  pdfinfoPageCount: (filePath: string, cmd: string) => Promise<number | null>;
}

const defaultDeps: PdfDeps = { findPdfinfo, pdfinfoPageCount };

// pdf-lib writes parser warnings to console.warn while reading slightly malformed
// (but still readable) PDFs. Mute the console around the load, ref-counted so that
// concurrent loads don't permanently silence it.
let muteDepth = 0;
let saved: { log: typeof console.log; warn: typeof console.warn; error: typeof console.error } | null = null;
function mute(): void {
  if (muteDepth === 0) {
    saved = { log: console.log, warn: console.warn, error: console.error };
    const noop = (): void => {};
    console.log = noop;
    console.warn = noop;
    console.error = noop;
  }
  muteDepth++;
}
function unmute(): void {
  muteDepth--;
  if (muteDepth === 0 && saved) {
    console.log = saved.log;
    console.warn = saved.warn;
    console.error = saved.error;
    saved = null;
  }
}

export async function countPdf(filePath: string, deps: PdfDeps = defaultDeps): Promise<CountOutcome> {
  let pdfLibError = '';
  try {
    const bytes = await readFile(filePath);
    mute();
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      return { pageCount: doc.getPageCount(), status: 'ok' };
    } finally {
      unmute();
    }
  } catch (err) {
    pdfLibError = err instanceof Error ? err.message : String(err);
  }

  // pdf-lib failed — often an encrypted or structurally complex PDF. Fall back to
  // pdfinfo (poppler) when available; it reads many PDFs pdf-lib cannot.
  const cmd = deps.findPdfinfo();
  if (cmd) {
    try {
      const pages = await deps.pdfinfoPageCount(filePath, cmd);
      if (pages != null && pages > 0) return { pageCount: pages, status: 'ok' };
    } catch {
      /* fall through to error classification */
    }
  }

  const status = /encrypt/i.test(pdfLibError) ? 'encrypted' : 'corrupt';
  return { pageCount: null, status, error: pdfLibError };
}
