import type { AppendColumn } from '../types';

// A TOTAL row for the bottom of the output: "TOTAL" in the first column, and the sum of
// each numeric appended column under that column ('' for the other original columns and
// for any appended column with no numeric values, e.g. the notes column).
export function buildTotalRow(originalCols: number, columns: AppendColumn[]): (string | number)[] {
  const row: (string | number)[] = [];
  for (let i = 0; i < originalCols; i++) row.push(i === 0 ? 'TOTAL' : '');
  for (const c of columns) {
    const hasNumber = c.values.some((v) => typeof v === 'number');
    const sum = c.values.reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
    row.push(hasNumber ? sum : '');
  }
  return row;
}
