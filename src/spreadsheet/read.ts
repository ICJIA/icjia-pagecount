import { extname } from 'node:path';
import type { AppendColumn } from '../types';
import { readCsv, writeCsv } from './csv';
import { readXlsx, writeXlsx, writeXlsxFromData } from './xlsx';

export interface LoadedSpreadsheet {
  header: string[];
  rows: string[][];
  writeCsv: (outPath: string, columns: AppendColumn[]) => Promise<void>;
  writeXlsx: (outPath: string, columns: AppendColumn[]) => Promise<void>;
}

function cell(value: string | number | null | undefined): string {
  return value == null ? '' : String(value);
}

function appended(
  header: string[],
  rows: string[][],
  columns: AppendColumn[],
): { header: string[]; rows: string[][] } {
  return {
    header: [...header, ...columns.map((c) => c.header)],
    rows: rows.map((r, i) => [...r, ...columns.map((c) => cell(c.values[i]))]),
  };
}

export async function readSpreadsheet(path: string): Promise<LoadedSpreadsheet> {
  const ext = extname(path).toLowerCase();

  if (ext === '.csv') {
    const { header, rows } = await readCsv(path);
    return {
      header,
      rows,
      writeCsv: (outPath, columns) => {
        const t = appended(header, rows, columns);
        return writeCsv(outPath, t.header, t.rows);
      },
      writeXlsx: (outPath, columns) => writeXlsxFromData(outPath, header, rows, columns),
    };
  }

  if (ext === '.xlsx') {
    const data = await readXlsx(path);
    return {
      header: data.header,
      rows: data.rows,
      writeCsv: (outPath, columns) => {
        const t = appended(data.header, data.rows, columns);
        return writeCsv(outPath, t.header, t.rows);
      },
      writeXlsx: (outPath, columns) => writeXlsx(data, outPath, columns),
    };
  }

  throw new Error(`Unsupported spreadsheet type: ${ext || '(none)'}`);
}
