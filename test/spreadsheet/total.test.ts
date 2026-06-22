import { describe, it, expect } from 'vitest';
import { buildTotalRow } from '../../src/spreadsheet/total';

describe('buildTotalRow', () => {
  it('sums each numeric column under that column and labels the first cell TOTAL', () => {
    const row = buildTotalRow(2, [
      { header: 'programmatic_page_count', values: [3, null, 5] },
      { header: 'programmatic_page_count_notes', values: ['', 'corrupt', ''] },
    ]);
    expect(row).toEqual(['TOTAL', '', 8, '']);
  });

  it('leaves a column blank when it has no numeric values', () => {
    expect(buildTotalRow(1, [{ header: 'notes', values: ['a', 'b'] }])).toEqual(['TOTAL', '']);
  });
});
