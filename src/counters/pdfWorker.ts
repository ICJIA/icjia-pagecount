import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

// Runs in an isolated worker so a malicious PDF (e.g. one whose FlateDecode streams
// inflate to gigabytes, or that drives pathological CPU) can only exhaust THIS worker —
// bounded by the parent's wall-clock timeout and heap cap — not the whole process.
async function run(): Promise<void> {
  // pdf-lib writes parser warnings to the console; silence them inside the worker.
  console.log = console.warn = console.error = (): void => {};
  try {
    const bytes = await readFile(workerData.filePath as string);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    parentPort?.postMessage({ ok: true, pageCount: doc.getPageCount() });
  } catch (err) {
    parentPort?.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

void run();
