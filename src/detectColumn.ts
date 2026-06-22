import { isFullUrl, typeFromExtension } from './url';

export interface Table {
  header: string[];
  rows: string[][];
}

export function detectUrlColumn(table: Table, override?: string): number {
  if (override !== undefined && override !== '') {
    const asNum = Number(override);
    if (Number.isInteger(asNum)) {
      const idx = asNum - 1; // 1-based
      if (idx < 0 || idx >= table.header.length) {
        throw new Error(`--column index ${override} is out of range (1..${table.header.length})`);
      }
      return idx;
    }
    const idx = table.header.findIndex(
      (h) => h.trim().toLowerCase() === override.trim().toLowerCase(),
    );
    if (idx === -1) throw new Error(`--column "${override}" not found in header`);
    return idx;
  }

  // Score each column two ways: by how many non-empty cells link to an actual
  // document (a .pdf/.docx/.pptx URL), and by how many are any http(s) URL.
  // Prefer the column that points at real files (e.g. a "File URL" column) over
  // one that merely holds page links (e.g. a "Page URL" column). Fall back to
  // the any-URL score when no column links to documents (e.g. extensionless
  // download URLs); `--column` overrides either way.
  let bestDoc = -1;
  let bestDocRatio = 0;
  let bestUrl = -1;
  let bestUrlRatio = 0;
  for (let c = 0; c < table.header.length; c++) {
    let nonEmpty = 0;
    let urls = 0;
    let docs = 0;
    for (const row of table.rows) {
      const cell = (row[c] ?? '').trim();
      if (!cell) continue;
      nonEmpty++;
      if (isFullUrl(cell)) {
        urls++;
        if (typeFromExtension(cell) !== null) docs++;
      }
    }
    if (nonEmpty === 0) continue;
    const docRatio = docs / nonEmpty;
    const urlRatio = urls / nonEmpty;
    if (docRatio > bestDocRatio) {
      bestDocRatio = docRatio;
      bestDoc = c;
    }
    if (urlRatio > bestUrlRatio) {
      bestUrlRatio = urlRatio;
      bestUrl = c;
    }
  }

  if (bestDoc !== -1 && bestDocRatio >= 0.5) return bestDoc;
  if (bestUrl !== -1 && bestUrlRatio >= 0.5) return bestUrl;
  throw new Error('Could not find a URL column; specify one with --column');
}
