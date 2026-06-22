import { describe, it, expect } from 'vitest';
import { countPdf } from '../../src/counters/pdf';
import { pdfBytes, writeTemp } from '../helpers/fixtures';

describe('countPdf', () => {
  it('counts pages in a valid PDF', async () => {
    const file = await writeTemp(await pdfBytes(3), 'a.pdf');
    expect(await countPdf(file)).toMatchObject({ pageCount: 3, status: 'ok' });
  });
  it('reports corrupt for non-PDF bytes', async () => {
    const file = await writeTemp(new Uint8Array([1, 2, 3, 4]), 'a.pdf');
    const out = await countPdf(file);
    expect(out.pageCount).toBeNull();
    expect(out.status).toBe('corrupt');
  });
});
