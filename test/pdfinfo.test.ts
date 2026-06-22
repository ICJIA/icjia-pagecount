import { describe, it, expect } from 'vitest';
import { findPdfinfo, pdfinfoPageCount } from '../src/render/pdfinfo';
import { pdfBytes, writeTemp } from './helpers/fixtures';

describe('pdfinfo', () => {
  it('findPdfinfo returns a string or null without throwing', () => {
    const r = findPdfinfo();
    expect(r === null || typeof r === 'string').toBe(true);
  });

  const cmd = findPdfinfo();
  it.skipIf(!cmd)('counts pages of a real PDF via pdfinfo', async () => {
    const file = await writeTemp(await pdfBytes(4), 'a.pdf');
    expect(await pdfinfoPageCount(file, cmd as string)).toBe(4);
  });
});
