import { describe, it, expect } from 'vitest';
import { sanitizeCell } from '../../src/spreadsheet/sanitize';

describe('sanitizeCell (formula-injection defense)', () => {
  it('prefixes a leading formula trigger with a quote', () => {
    expect(sanitizeCell('=1+2')).toBe("'=1+2");
    expect(sanitizeCell('+1')).toBe("'+1");
    expect(sanitizeCell('-1')).toBe("'-1");
    expect(sanitizeCell('@cmd')).toBe("'@cmd");
  });

  it('prefixes when a stripped control char precedes a formula', () => {
    expect(sanitizeCell('\t=x')).toBe("'\t=x");
    expect(sanitizeCell('\r=x')).toBe("'\r=x");
    // a newline can be stripped by a spreadsheet app, exposing the formula underneath
    expect(sanitizeCell('\n=cmd')).toBe("'\n=cmd");
  });

  it('leaves ordinary values untouched', () => {
    expect(sanitizeCell('hello')).toBe('hello');
    expect(sanitizeCell('https://example.org/a.pdf')).toBe('https://example.org/a.pdf');
    expect(sanitizeCell('123')).toBe('123');
    expect(sanitizeCell(' leading space')).toBe(' leading space');
  });
});
