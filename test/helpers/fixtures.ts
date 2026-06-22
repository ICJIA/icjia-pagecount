import { zipSync, strToU8 } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Build an in-memory ZIP from a map of path → text content. */
export function zipBytes(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(files)) entries[name] = strToU8(text);
  return zipSync(entries);
}

export async function pdfBytes(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return doc.save();
}

export async function writeTemp(bytes: Uint8Array | string, name = 'f.bin'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pc-'));
  const file = join(dir, name);
  await writeFile(file, bytes);
  return file;
}
