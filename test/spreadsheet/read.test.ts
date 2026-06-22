import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSpreadsheet } from '../../src/spreadsheet/read';
import { readXlsx } from '../../src/spreadsheet/xlsx';
import { writeTemp, writeXlsxFile } from '../helpers/fixtures';

describe('readSpreadsheet', () => {
  it('reads csv and writes both csv and xlsx with appended columns', async () => {
    const file = await writeTemp('Name,URL\nA,u1\nB,u2\n', 'in.csv');
    const loaded = await readSpreadsheet(file);
    expect(loaded.header).toEqual(['Name', 'URL']);

    const dir = await mkdtemp(join(tmpdir(), 'pc-'));
    const outCsv = join(dir, 'out.csv');
    await loaded.writeCsv(outCsv, [{ header: 'PageCount', values: [5, null] }]);
    const text = await readFile(outCsv, 'utf8');
    expect(text).toContain('Name,URL,PageCount');
    expect(text).toContain('A,u1,5');
    expect(text).toContain('B,u2,');

    const outXlsx = join(dir, 'out.xlsx');
    await loaded.writeXlsx(outXlsx, [{ header: 'PageCount', values: [5, null] }]);
    const reread = await readXlsx(outXlsx);
    expect(reread.header).toEqual(['Name', 'URL', 'PageCount']);
    expect(reread.rows[0]).toEqual(['A', 'u1', '5']);
    expect(reread.rows[1]).toEqual(['B', 'u2', '']);
  });

  it('reads xlsx and writes a format-preserving xlsx and a csv', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pc-'));
    const file = join(dir, 'in.xlsx');
    await writeXlsxFile(file, ['Name', 'URL'], [['A', 'u1']]);
    const loaded = await readSpreadsheet(file);

    const outXlsx = join(dir, 'out.xlsx');
    await loaded.writeXlsx(outXlsx, [{ header: 'PageCount', values: [3] }]);
    const reread = await readXlsx(outXlsx);
    expect(reread.header).toEqual(['Name', 'URL', 'PageCount']);
    expect(reread.rows[0]).toEqual(['A', 'u1', '3']);

    const outCsv = join(dir, 'out.csv');
    await loaded.writeCsv(outCsv, [{ header: 'PageCount', values: [3] }]);
    const text = await readFile(outCsv, 'utf8');
    expect(text).toContain('Name,URL,PageCount');
    expect(text).toContain('A,u1,3');
  });

  it('appends multiple columns in order (csv)', async () => {
    const file = await writeTemp('Name,URL\nA,u1\nB,u2\n', 'in.csv');
    const loaded = await readSpreadsheet(file);
    const out = await writeTemp('', 'out.csv');
    await loaded.writeCsv(out, [
      { header: 'programmatic_page_count', values: [5, null] },
      { header: 'programmatic_page_count_notes', values: ['', 'corrupt'] },
    ]);
    const text = await readFile(out, 'utf8');
    expect(text).toContain('Name,URL,programmatic_page_count,programmatic_page_count_notes');
    expect(text).toContain('A,u1,5,');
    expect(text).toContain('B,u2,,corrupt');
  });
});
