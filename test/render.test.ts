import { describe, it, expect } from 'vitest';
import { findLibreOffice, renderDocxToPdf } from '../src/render/libreoffice';

describe('findLibreOffice', () => {
  it('returns a string or null without throwing', () => {
    const r = findLibreOffice();
    expect(r === null || typeof r === 'string').toBe(true);
  });
});

describe('renderDocxToPdf', () => {
  it('throws when no LibreOffice is available', async () => {
    await expect(renderDocxToPdf('/nope/x.docx', null)).rejects.toThrow(/LibreOffice/);
  });
});
