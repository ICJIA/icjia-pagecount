import { describe, it, expect } from 'vitest';
import { countPdf, type PdfDeps } from '../../src/counters/pdf';
import { pdfBytes, writeTemp } from '../helpers/fixtures';

// Inject "no pdfinfo available" so error-path tests stay hermetic (no subprocess).
const noFallback: PdfDeps = { findPdfinfo: () => null, pdfinfoPageCount: async () => null };

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
    const deps: PdfDeps = { findPdfinfo: () => 'pdfinfo', pdfinfoPageCount: async () => 145 };
    expect(await countPdf(file, deps)).toMatchObject({ pageCount: 145, status: 'ok' });
  });
});
