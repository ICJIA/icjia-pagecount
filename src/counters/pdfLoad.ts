import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { PDFDocument } from 'pdf-lib';

const PDF_TIMEOUT_MS = 30_000;  // wall-clock cap on an isolated parse
const PDF_MAX_OLD_MB = 768;     // V8 heap cap for the worker (backstop; timeout is primary)

// Thrown when an isolated parse exceeds its time/memory budget — a likely DoS attempt,
// distinct from a normal "this PDF is encrypted/corrupt" parse failure.
export class PdfBudgetError extends Error {}

// Thrown when the isolated worker can't be started at all (e.g. the bundled worker file
// is missing); the caller degrades to an in-process parse so counting still works.
class PdfWorkerUnavailable extends Error {}

// pdf-lib writes parser warnings to console while reading slightly malformed PDFs. Mute
// the console around the in-process load, ref-counted so concurrent loads don't
// permanently silence it.
let muteDepth = 0;
let saved: { log: typeof console.log; warn: typeof console.warn; error: typeof console.error } | null = null;
function mute(): void {
  if (muteDepth === 0) {
    saved = { log: console.log, warn: console.warn, error: console.error };
    const noop = (): void => {};
    console.log = noop;
    console.warn = noop;
    console.error = noop;
  }
  muteDepth++;
}
function unmute(): void {
  muteDepth--;
  if (muteDepth === 0 && saved) {
    console.log = saved.log;
    console.warn = saved.warn;
    console.error = saved.error;
    saved = null;
  }
}

export async function loadPdfInProcess(filePath: string): Promise<number> {
  const bytes = await readFile(filePath);
  mute();
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return doc.getPageCount();
  } finally {
    unmute();
  }
}

function loadPdfIsolated(filePath: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./pdf-worker.js', import.meta.url), {
        workerData: { filePath },
        resourceLimits: { maxOldGenerationSizeMb: PDF_MAX_OLD_MB },
      });
    } catch (err) {
      reject(new PdfWorkerUnavailable(err instanceof Error ? err.message : String(err)));
      return;
    }

    let settled = false;
    const finish = (fn: (v: never) => void, value: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      fn(value as never);
    };
    const timer = setTimeout(
      () => finish(reject, new PdfBudgetError('pdf parse timed out')),
      PDF_TIMEOUT_MS,
    );

    worker.once('message', (m: { ok?: boolean; pageCount?: number; error?: string }) => {
      if (m?.ok && typeof m.pageCount === 'number') finish(resolve, m.pageCount);
      else finish(reject, new Error(m?.error ?? 'pdf parse failed'));
    });
    worker.once('error', (err: Error & { code?: string }) => {
      // A worker that blows its heap cap reports ERR_WORKER_OUT_OF_MEMORY — treat that as a
      // budget breach (do NOT fall back in-process, which would just re-OOM the main thread).
      if (err?.code === 'ERR_WORKER_OUT_OF_MEMORY') {
        finish(reject, new PdfBudgetError('pdf parse exceeded memory budget'));
      } else {
        finish(reject, new PdfWorkerUnavailable(err?.message ?? 'worker error'));
      }
    });
    worker.once('exit', (code) => {
      if (!settled) finish(reject, new PdfWorkerUnavailable(`worker exited with code ${code}`));
    });
  });
}

// Default page-count loader: parse the PDF in an isolated worker bounded by a wall-clock
// timeout and a heap cap, so a malicious PDF can hang/OOM only that worker — not the whole
// run. If the worker can't be started, fall back to an in-process parse (isolation is
// best-effort; correctness is not).
export async function loadPdfPageCount(filePath: string): Promise<number> {
  try {
    return await loadPdfIsolated(filePath);
  } catch (err) {
    if (err instanceof PdfWorkerUnavailable) return loadPdfInProcess(filePath);
    throw err; // budget breach, or a genuine pdf-lib parse error (encrypted/corrupt)
  }
}
