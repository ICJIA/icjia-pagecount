import type { CountOutcome } from '../types';
import { findPdfinfo, pdfinfoPageCount } from '../render/pdfinfo';
import { loadPdfPageCount, PdfBudgetError } from './pdfLoad';

export interface PdfDeps {
  loadPageCount: (filePath: string) => Promise<number>;
  findPdfinfo: () => string | null;
  pdfinfoPageCount: (filePath: string, cmd: string) => Promise<number | null>;
}

const defaultDeps: PdfDeps = { loadPageCount: loadPdfPageCount, findPdfinfo, pdfinfoPageCount };

export async function countPdf(filePath: string, deps: PdfDeps = defaultDeps): Promise<CountOutcome> {
  let pdfLibError = '';
  let budgetExceeded = false;
  try {
    return { pageCount: await deps.loadPageCount(filePath), status: 'ok' };
  } catch (err) {
    if (err instanceof PdfBudgetError) budgetExceeded = true;
    pdfLibError = err instanceof Error ? err.message : String(err);
  }

  // pdf-lib failed — often an encrypted or structurally complex PDF, or a parse that blew
  // its budget. Fall back to pdfinfo (poppler) when available; it reads many PDFs pdf-lib
  // cannot and runs under its own subprocess timeout.
  const cmd = deps.findPdfinfo();
  if (cmd) {
    try {
      const pages = await deps.pdfinfoPageCount(filePath, cmd);
      if (pages != null && pages > 0) return { pageCount: pages, status: 'ok' };
    } catch {
      /* fall through to error classification */
    }
  }

  // A budget breach (timeout / OOM in the isolated worker) is a resource limit, not a
  // malformed file — report it distinctly so it isn't mistaken for a corrupt PDF.
  if (budgetExceeded) return { pageCount: null, status: 'too-large', error: pdfLibError };

  const status = /encrypt/i.test(pdfLibError) ? 'encrypted' : 'corrupt';
  return { pageCount: null, status, error: pdfLibError };
}
