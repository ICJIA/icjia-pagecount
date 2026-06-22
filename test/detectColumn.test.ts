import { describe, it, expect } from 'vitest';
import { detectUrlColumn, type Table } from '../src/detectColumn';

const table: Table = {
  header: ['Name', 'Notes', 'Link'],
  rows: [
    ['Alpha', 'x', 'https://x.org/a.pdf'],
    ['Beta', 'y', 'https://x.org/b.docx'],
    ['Gamma', 'z', ''],
  ],
};

describe('detectUrlColumn', () => {
  it('auto-detects the column with the most URLs', () => {
    expect(detectUrlColumn(table)).toBe(2);
  });
  it('prefers a column of document URLs over a column of page URLs', () => {
    const t: Table = {
      header: ['Title', 'Page URL', 'File URL'],
      rows: [
        ['A', 'https://site.org/news/a', 'https://site.org/files/a.pdf'],
        ['B', 'https://site.org/news/b', 'https://site.org/files/b.docx'],
      ],
    };
    expect(detectUrlColumn(t)).toBe(2); // File URL, not Page URL
  });
  it('falls back to any URL column when none link to documents', () => {
    const t: Table = {
      header: ['Title', 'Link'],
      rows: [
        ['A', 'https://site.org/page-a'],
        ['B', 'https://site.org/page-b'],
      ],
    };
    expect(detectUrlColumn(t)).toBe(1);
  });
  it('honors an override by header name (case-insensitive)', () => {
    expect(detectUrlColumn(table, 'link')).toBe(2);
  });
  it('honors an override by 1-based index', () => {
    expect(detectUrlColumn(table, '1')).toBe(0);
  });
  it('throws when no URL column is found', () => {
    expect(() => detectUrlColumn({ header: ['a', 'b'], rows: [['1', '2']] })).toThrow();
  });
  it('throws on an out-of-range index override', () => {
    expect(() => detectUrlColumn(table, '9')).toThrow(/range/);
  });
  it('throws on an unknown name override', () => {
    expect(() => detectUrlColumn(table, 'nope')).toThrow(/not found/);
  });
});
