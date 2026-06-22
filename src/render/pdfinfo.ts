import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const CANDIDATES = [
  process.env.PAGECOUNT_PDFINFO,
  'pdfinfo',
  '/opt/homebrew/bin/pdfinfo',
  '/usr/local/bin/pdfinfo',
  '/usr/bin/pdfinfo',
].filter((c): c is string => Boolean(c));

export function findPdfinfo(): string | null {
  for (const cmd of CANDIDATES) {
    if (cmd.includes('/')) {
      if (existsSync(cmd)) return cmd;
      continue;
    }
    const r = spawnSync(cmd, ['-v'], { stdio: 'ignore' });
    if (!r.error) return cmd; // found on PATH (ran without ENOENT)
  }
  return null;
}

// Count pages with poppler's `pdfinfo`, which reads many PDFs pdf-lib cannot
// (notably AES-encrypted files with an empty user password). Returns null if the
// page count can't be determined.
export function pdfinfoPageCount(filePath: string, cmd: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, [filePath], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 });
    let out = '';
    proc.stdout.on('data', (d) => {
      out += String(d);
    });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      const m = out.match(/^Pages:\s+(\d+)/m);
      resolve(m ? Number(m[1]) : null);
    });
  });
}
