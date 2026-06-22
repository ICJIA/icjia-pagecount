import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import type { CountOutcome } from '../types';

export async function countPdf(filePath: string): Promise<CountOutcome> {
  try {
    const bytes = await readFile(filePath);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return { pageCount: doc.getPageCount(), status: 'ok' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { pageCount: null, status: /encrypt/i.test(msg) ? 'encrypted' : 'corrupt', error: msg };
  }
}
