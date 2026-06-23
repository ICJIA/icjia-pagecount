import { describe, it, expect } from 'vitest';
import { countPdf, type PdfDeps } from '../../src/counters/pdf';
import { loadPdfInProcess, PdfBudgetError } from '../../src/counters/pdfLoad';
import { pdfBytes, writeTemp } from '../helpers/fixtures';

// Parse in-process (not in a worker) and inject "no pdfinfo available" so tests stay
// hermetic — no worker spawn, no subprocess.
const noFallback: PdfDeps = {
  loadPageCount: loadPdfInProcess,
  findPdfinfo: () => null,
  pdfinfoPageCount: async () => null,
};

describe('countPdf', () => {
  it('counts pages in a valid PDF', async () => {
    const file = await writeTemp(await pdfBytes(3), 'a.pdf');
    expect(await countPdf(file, noFallback)).toMatchObject({ pageCount: 3, status: 'ok' });
  });

  it('reports corrupt for non-PDF bytes when no fallback is available', async () => {
    const file = await writeTemp(new Uint8Array([1, 2, 3, 4]), 'a.pdf');
    const out = await countPdf(file, noFallback);
    expect(out.pageCount).toBeNull();
    expect(out.status).toBe('corrupt');
  });

  it('falls back to pdfinfo when pdf-lib cannot parse', async () => {
    const file = await writeTemp(new Uint8Array([1, 2, 3, 4]), 'a.pdf');
    const deps: PdfDeps = {
      loadPageCount: loadPdfInProcess,
      findPdfinfo: () => 'pdfinfo',
      pdfinfoPageCount: async () => 145,
    };
    expect(await countPdf(file, deps)).toMatchObject({ pageCount: 145, status: 'ok' });
  });

  it('reports too-large when an isolated parse exceeds its budget and pdfinfo is unavailable', async () => {
    const deps: PdfDeps = {
      loadPageCount: async () => { throw new PdfBudgetError('pdf parse timed out'); },
      findPdfinfo: () => null,
      pdfinfoPageCount: async () => null,
    };
    expect(await countPdf('big.pdf', deps)).toMatchObject({ pageCount: null, status: 'too-large' });
  });

  it('still uses pdfinfo when an isolated parse exceeds its budget', async () => {
    const deps: PdfDeps = {
      loadPageCount: async () => { throw new PdfBudgetError('pdf parse exceeded memory budget'); },
      findPdfinfo: () => 'pdfinfo',
      pdfinfoPageCount: async () => 51,
    };
    expect(await countPdf('big.pdf', deps)).toMatchObject({ pageCount: 51, status: 'ok' });
  });
});
