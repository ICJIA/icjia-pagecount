# Remediation Row Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, default-on row filter so `pagecount` counts pages only for spreadsheet rows whose `Recommendation` column equals `remediate` (overridable), giving remediation vendors a TOTAL of pages to remediate per site.

**Architecture:** Extend the existing row-by-row pipeline (`processSpreadsheet` → `mapWithConcurrency`) with a predicate evaluated *before* the download: non-matching rows short-circuit to a new `filtered` status (blank count, never fetched). Column resolution reuses extracted helpers from `detectColumn.ts`; the filter is parsed into `Config.filter` and surfaced via two CLI flags plus `--no-filter`.

**Tech Stack:** TypeScript (ESM, Node 20+), commander (CLI), vitest (tests), tsup (build). No new dependencies.

## Global Constraints

- **Node.js ≥ 20** (`package.json` `engines`); uses built-in `fetch`.
- **No new dependencies** — use what's already in `package.json`.
- **Code style:** 2-space indent, single quotes, existing file patterns; keep files focused.
- **Commit messages:** Conventional-commits style (`feat:`, `refactor:`, `release:`). **Do NOT add any `Co-Authored-By` / AI-attribution trailer** (user's global rule).
- **Version sync:** `src/cli.ts` `.version('…')` must equal `package.json` `version`.
- **Filter matching is exact + case-insensitive + whitespace-trimmed**; comma = alternatives.
- **Default filter:** column `Recommendation`, value `remediate`. Absent *default* column → count all + notice; absent *explicit* `--filter-column` → error; `--no-filter` → count all.
- Test a single file with `npx vitest run <path>`; full suite `npm test`; types `npm run typecheck`.

---

### Task 1: Column resolution helpers

Extract reusable name-or-index column resolution from `detectUrlColumn` so the filter can resolve a column either strictly (throw) or softly (undefined). No behavior change to `detectUrlColumn`.

**Files:**
- Modify: `src/detectColumn.ts`
- Test: `test/detectColumn.test.ts`

**Interfaces:**
- Produces:
  - `findColumn(table: Table, ref: string): number | undefined` — name (case-insensitive, trimmed) or 1-based index; `undefined` when unknown/out-of-range/blank.
  - `resolveColumn(table: Table, ref: string, flagName: string): number` — same, but throws a `flagName`-aware error.
  - `Table` interface is already exported (unchanged).

- [ ] **Step 1: Write the failing tests**

In `test/detectColumn.test.ts`, change the import line and append two `describe` blocks. The shared `table` (header `['Name','Notes','Link']`) is already defined at the top of the file.

Change the existing import (line 2) to:

```ts
import { detectUrlColumn, findColumn, resolveColumn, type Table } from '../src/detectColumn';
```

Append at the end of the file:

```ts
describe('findColumn', () => {
  it('resolves a header name case-insensitively and trims', () => {
    expect(findColumn(table, 'link')).toBe(2);
    expect(findColumn(table, '  LINK ')).toBe(2);
  });
  it('resolves a 1-based index', () => {
    expect(findColumn(table, '1')).toBe(0);
    expect(findColumn(table, '3')).toBe(2);
  });
  it('returns undefined for an unknown name', () => {
    expect(findColumn(table, 'nope')).toBeUndefined();
  });
  it('returns undefined for an out-of-range or zero index', () => {
    expect(findColumn(table, '9')).toBeUndefined();
    expect(findColumn(table, '0')).toBeUndefined();
  });
  it('returns undefined for a blank ref', () => {
    expect(findColumn(table, '   ')).toBeUndefined();
  });
});

describe('resolveColumn', () => {
  it('resolves valid name or index refs', () => {
    expect(resolveColumn(table, 'Name', '--filter-column')).toBe(0);
    expect(resolveColumn(table, '3', '--filter-column')).toBe(2);
  });
  it('throws a flag-aware error for an unknown name', () => {
    expect(() => resolveColumn(table, 'nope', '--filter-column'))
      .toThrow(/--filter-column "nope" not found/);
  });
  it('throws a flag-aware error for an out-of-range index', () => {
    expect(() => resolveColumn(table, '9', '--filter-column'))
      .toThrow(/--filter-column index 9 is out of range/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/detectColumn.test.ts`
Expected: FAIL — `findColumn`/`resolveColumn` are not exported (import/type error).

- [ ] **Step 3: Implement the helpers and refactor `detectUrlColumn`**

Replace the entire contents of `src/detectColumn.ts` with:

```ts
import { isFullUrl, typeFromExtension } from './url';

export interface Table {
  header: string[];
  rows: string[][];
}

type ColumnLookup = { ok: true; index: number } | { ok: false; reason: 'range' | 'name' };

// Resolve a header name (case-insensitive, trimmed) or a 1-based index to a 0-based index.
function lookupColumn(table: Table, ref: string): ColumnLookup {
  const r = ref.trim();
  if (r === '') return { ok: false, reason: 'name' };
  const asNum = Number(r);
  if (Number.isInteger(asNum)) {
    const index = asNum - 1; // 1-based
    if (index < 0 || index >= table.header.length) return { ok: false, reason: 'range' };
    return { ok: true, index };
  }
  const index = table.header.findIndex((h) => h.trim().toLowerCase() === r.toLowerCase());
  return index === -1 ? { ok: false, reason: 'name' } : { ok: true, index };
}

// Name-or-index resolution that returns undefined when the column isn't present
// (unknown name, out-of-range index, or blank ref). Used for the optional default
// filter column, where absence falls back to counting every row rather than erroring.
export function findColumn(table: Table, ref: string): number | undefined {
  const r = lookupColumn(table, ref);
  return r.ok ? r.index : undefined;
}

// Name-or-index resolution that throws a flag-aware error when the column isn't present.
// Used for explicit overrides (`--column`, an explicit `--filter-column`).
export function resolveColumn(table: Table, ref: string, flagName: string): number {
  const r = lookupColumn(table, ref);
  if (r.ok) return r.index;
  if (r.reason === 'range') {
    throw new Error(`${flagName} index ${ref} is out of range (1..${table.header.length})`);
  }
  throw new Error(`${flagName} "${ref}" not found in header`);
}

export function detectUrlColumn(table: Table, override?: string): number {
  if (override !== undefined && override !== '') {
    return resolveColumn(table, override, '--column');
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/detectColumn.test.ts`
Expected: PASS (new `findColumn`/`resolveColumn` blocks **and** the pre-existing `detectUrlColumn` cases, whose `--column` error messages are unchanged).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/detectColumn.ts test/detectColumn.test.ts
git commit -m "refactor: extract findColumn/resolveColumn for reuse by the row filter"
```

---

### Task 2: Parse the filter into `Config`

Turn the CLI's raw filter options into a normalized `Config.filter`, with the `Recommendation`/`remediate` defaults and value validation.

**Files:**
- Modify: `src/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `FilterSpec { column: string; columnExplicit: boolean; values: string[] }`
  - `Config.filter: FilterSpec | null` (null only when `--no-filter`)
  - `RawOptions` gains `filterColumn?: string; filterValue?: string; noFilter?: boolean;`
  - `DEFAULTS.filterColumn = 'Recommendation'`, `DEFAULTS.filterValue = 'remediate'`

- [ ] **Step 1: Write the failing tests**

Append to `test/config.test.ts` (inside the file, after the existing `describe('resolveConfig', …)` block):

```ts
describe('resolveConfig filter', () => {
  it('defaults to Recommendation=remediate', () => {
    expect(resolveConfig({}).filter)
      .toEqual({ column: 'Recommendation', columnExplicit: false, values: ['remediate'] });
  });
  it('marks an explicit filter column', () => {
    expect(resolveConfig({ filterColumn: 'Action' }).filter)
      .toMatchObject({ column: 'Action', columnExplicit: true });
  });
  it('splits, trims, lowercases, and de-dupes values', () => {
    expect(resolveConfig({ filterValue: 'Remediate, TRUE ,remediate, ' }).filter?.values)
      .toEqual(['remediate', 'true']);
  });
  it('disables filtering with noFilter', () => {
    expect(resolveConfig({ noFilter: true }).filter).toBeNull();
  });
  it('rejects an all-empty filter value', () => {
    expect(() => resolveConfig({ filterValue: ' , ,' })).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/config.test.ts`
Expected: FAIL — `filter` is not on `Config` / `filterColumn` not on `RawOptions`.

- [ ] **Step 3: Implement the config changes**

Replace the entire contents of `src/config.ts` with:

```ts
export interface FilterSpec {
  column: string;          // header name or 1-based index, as given or defaulted
  columnExplicit: boolean; // true only when the user passed --filter-column
  values: string[];        // trimmed, lowercased, de-duped, non-empty
}

export interface Config {
  output?: string;
  column?: string;
  countColumn: string;
  suffix: string;
  json: boolean;
  quiet: boolean;
  concurrency: number;
  timeout: number; // milliseconds
  maxSize: number; // bytes
  docxRender: boolean;
  allowPrivateHosts: boolean;
  filter: FilterSpec | null; // null only when --no-filter
}

export interface RawOptions {
  output?: string;
  column?: string;
  countColumn?: string;
  suffix?: string;
  json?: boolean;
  quiet?: boolean;
  concurrency?: string | number;
  timeout?: string | number;
  maxSize?: string | number;
  docxRender?: boolean;
  allowPrivateHosts?: boolean;
  filterColumn?: string;
  filterValue?: string;
  noFilter?: boolean;
}

export const DEFAULTS = {
  countColumn: 'programmatic_page_count',
  suffix: 'pagecount',
  concurrency: 8,
  timeoutSec: 30,
  maxSizeMb: 100,
  filterColumn: 'Recommendation',
  filterValue: 'remediate',
} as const;

function positive(value: string | number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Expected a positive number, got: ${String(value)}`);
  }
  return n;
}

// Normalize the raw filter options into a FilterSpec, or null when filtering is off.
function buildFilter(raw: RawOptions): FilterSpec | null {
  if (raw.noFilter) return null;
  const explicit = raw.filterColumn !== undefined && raw.filterColumn.trim() !== '';
  const column = explicit ? raw.filterColumn!.trim() : DEFAULTS.filterColumn;
  const rawValue = raw.filterValue ?? DEFAULTS.filterValue;
  const values = [
    ...new Set(rawValue.split(',').map((v) => v.trim().toLowerCase()).filter((v) => v !== '')),
  ];
  if (values.length === 0) {
    throw new Error('--filter-value must contain at least one non-empty value');
  }
  return { column, columnExplicit: explicit, values };
}

export function resolveConfig(raw: RawOptions): Config {
  const suffix = raw.suffix ?? DEFAULTS.suffix;
  if (/[/\\]|\.\./.test(suffix)) {
    throw new Error('--suffix may not contain path separators or ".."');
  }
  return {
    output: raw.output,
    column: raw.column,
    countColumn: raw.countColumn ?? DEFAULTS.countColumn,
    suffix,
    json: raw.json ?? false,
    quiet: raw.quiet ?? false,
    concurrency: Math.min(positive(raw.concurrency, DEFAULTS.concurrency), 64),
    timeout: positive(raw.timeout, DEFAULTS.timeoutSec) * 1000,
    maxSize: positive(raw.maxSize, DEFAULTS.maxSizeMb) * 1024 * 1024,
    docxRender: raw.docxRender ?? false,
    allowPrivateHosts: raw.allowPrivateHosts ?? false,
    filter: buildFilter(raw),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/config.test.ts`
Expected: PASS (new filter cases **and** the existing default/parse cases, which use `toBe`/partial checks unaffected by the added `filter` field).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: parse --filter-column/--filter-value/--no-filter into Config.filter"
```

---

### Task 3: Status, summary, and notes for filtered rows

Add the `filtered` status, count it separately, total the matched pages, and give filtered rows a friendly note.

**Files:**
- Modify: `src/types.ts`
- Modify: `src/report.ts`
- Test: `test/report.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `Status` includes `'filtered'`.
  - `Summary` gains `filtered: number` and `totalPages: number`.
  - `rowNote(r)` returns `'skipped (filtered out)'` when `r.status === 'filtered'`.
  - `formatSpreadsheetSummary` line: `N rows · M counted · K filtered · P no-url · F failed · T total pages`.

- [ ] **Step 1: Write/Update the failing tests**

In `test/report.test.ts`:

(a) Update the existing summary-format assertion (currently `expect(txt).toContain('4 rows · 1 counted · 1 no-url · 2 failed');`) to the new format:

```ts
    expect(txt).toContain('4 rows · 1 counted · 0 filtered · 1 no-url · 2 failed · 3 total pages');
```

(b) Append these tests at the end of the file:

```ts
describe('summarize with filtered rows', () => {
  const withFiltered: RowResult[] = [
    { row: 2, url: 'u', type: 'pdf', pageCount: 4, status: 'ok' },
    { row: 3, url: null, type: null, pageCount: null, status: 'filtered' },
    { row: 4, url: 'u', type: 'pdf', pageCount: 6, status: 'ok' },
  ];
  it('counts filtered rows separately and totals matched pages', () => {
    expect(summarize(withFiltered))
      .toMatchObject({ total: 3, counted: 2, filtered: 1, noUrl: 0, failed: 0, totalPages: 10 });
  });
});

describe('rowNote for filtered', () => {
  it('returns a friendly skipped note', () => {
    expect(rowNote({ row: 9, url: null, type: null, pageCount: null, status: 'filtered' }))
      .toBe('skipped (filtered out)');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/report.test.ts`
Expected: FAIL — `'filtered'` not assignable to `Status`; summary lacks `filtered`/`totalPages`; format string mismatch.

- [ ] **Step 3a: Add the `filtered` status and Summary fields (`src/types.ts`)**

Change the `Status` union (add `'filtered'` after `'no-url'`):

```ts
export type Status =
  | 'ok'
  | 'no-url'
  | 'filtered'
  | 'unsupported'
  | 'not-found'
  | 'http-error'
  | 'timeout'
  | 'network-error'
  | 'too-large'
  | 'corrupt'
  | 'encrypted'
  | 'no-page-data';
```

Change the `Summary` interface (add `filtered` and `totalPages`):

```ts
export interface Summary {
  total: number;
  counted: number;
  filtered: number;
  noUrl: number;
  failed: number;
  totalPages: number;
  byError: Record<string, number>;
}
```

- [ ] **Step 3b: Update `summarize`, `formatSpreadsheetSummary`, and `rowNote` (`src/report.ts`)**

Replace `summarize`:

```ts
export function summarize(results: RowResult[]): Summary {
  const summary: Summary = {
    total: results.length, counted: 0, filtered: 0, noUrl: 0, failed: 0, totalPages: 0, byError: {},
  };
  for (const r of results) {
    if (typeof r.pageCount === 'number') summary.totalPages += r.pageCount;
    if (r.status === 'ok') summary.counted++;
    else if (r.status === 'filtered') summary.filtered++;
    else if (r.status === 'no-url') summary.noUrl++;
    else {
      summary.failed++;
      summary.byError[r.status] = (summary.byError[r.status] ?? 0) + 1;
    }
  }
  return summary;
}
```

Replace the summary line inside `formatSpreadsheetSummary` (the second array entry):

```ts
    `  ${summary.total} rows · ${summary.counted} counted · ${summary.filtered} filtered · ${summary.noUrl} no-url · ${summary.failed} failed · ${summary.totalPages} total pages`,
```

Replace `rowNote` (add the filtered branch first):

```ts
export function rowNote(r: RowResult): string {
  if (r.status === 'filtered') return 'skipped (filtered out)';
  if (r.status !== 'ok') return r.status;
  if (r.type === 'docx') return 'estimate (docx page count depends on fonts/margins)';
  return '';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (confirms no exhaustive `Status` switch elsewhere broke).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/report.ts test/report.test.ts
git commit -m "feat: report filtered rows and total pages; add skipped note"
```

---

### Task 4: Apply the filter in the processing pipeline

Resolve the filter column, short-circuit non-matching rows to `filtered` before any download, and surface the missing-default-column notice as a warning printed by the runner.

**Files:**
- Modify: `src/spreadsheet/process.ts`
- Modify: `src/run.ts`
- Test: `test/spreadsheet/process.test.ts`

**Interfaces:**
- Consumes: `findColumn` (Task 1), `Config.filter` (Task 2), `'filtered'` status + `summarize` (Task 3).
- Produces: `ProcessResult` gains `warnings: string[]`.

- [ ] **Step 1: Write the failing tests**

Append these tests inside the existing `describe('processSpreadsheet', …)` block in `test/spreadsheet/process.test.ts` (the `beforeAll` server already serves a 3-page PDF at `/a.pdf` and 404s everything else; `base` is the server URL):

```ts
  it('by default counts only rows whose Recommendation is remediate', async () => {
    const csv = `File,Recommendation,Link\n` +
      `A,Remediate,${base}/a.pdf\n` +
      `B,Accessible,${base}/a.pdf\n` +
      `C,remediate,${base}/a.pdf\n`;
    const file = await writeTemp(csv, 'rec.csv');
    const { results, counts, summary } =
      await processSpreadsheet(file, resolveConfig({ allowPrivateHosts: true }));
    expect(results.map((r) => r.status)).toEqual(['ok', 'filtered', 'ok']);
    expect(counts).toEqual([3, null, 3]);
    expect(summary).toMatchObject({ counted: 2, filtered: 1, totalPages: 6 });
  });

  it('never fetches filtered rows', async () => {
    // The non-matching row points at a URL the server 404s. If it were fetched the
    // status would be 'not-found'; filtering must short-circuit it to 'filtered'.
    const csv = `File,Recommendation,Link\nB,Accessible,${base}/missing.pdf\n`;
    const file = await writeTemp(csv, 'nofetch.csv');
    const { results } = await processSpreadsheet(file, resolveConfig({ allowPrivateHosts: true }));
    expect(results[0].status).toBe('filtered');
  });

  it('matches any of several --filter-value alternatives, case-insensitively', async () => {
    const csv = `File,Recommendation,Link\nA,Remediate,${base}/a.pdf\nB,TRUE,${base}/a.pdf\n`;
    const file = await writeTemp(csv, 'multi.csv');
    const cfg = resolveConfig({ allowPrivateHosts: true, filterValue: 'remediate,true' });
    const { results } = await processSpreadsheet(file, cfg);
    expect(results.map((r) => r.status)).toEqual(['ok', 'ok']);
  });

  it('counts every row and warns when the default column is absent', async () => {
    const csv = `Name,Link\nA,${base}/a.pdf\n`;
    const file = await writeTemp(csv, 'nocol.csv');
    const { results, warnings } =
      await processSpreadsheet(file, resolveConfig({ allowPrivateHosts: true }));
    expect(results.map((r) => r.status)).toEqual(['ok']);
    expect(warnings.join(' ')).toMatch(/Recommendation/);
  });

  it('throws when an explicit --filter-column is missing', async () => {
    const csv = `Name,Link\nA,${base}/a.pdf\n`;
    const file = await writeTemp(csv, 'explicit.csv');
    const cfg = resolveConfig({ allowPrivateHosts: true, filterColumn: 'Disposition' });
    await expect(processSpreadsheet(file, cfg)).rejects.toThrow(/Disposition/);
  });

  it('counts all rows with noFilter even when Recommendation exists', async () => {
    const csv = `File,Recommendation,Link\nA,Remediate,${base}/a.pdf\nB,Accessible,${base}/a.pdf\n`;
    const file = await writeTemp(csv, 'all.csv');
    const cfg = resolveConfig({ allowPrivateHosts: true, noFilter: true });
    const { results } = await processSpreadsheet(file, cfg);
    expect(results.map((r) => r.status)).toEqual(['ok', 'ok']);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/spreadsheet/process.test.ts`
Expected: FAIL — no filtering yet (`filtered` never returned; `warnings` undefined).

- [ ] **Step 3a: Implement filtering in `src/spreadsheet/process.ts`**

Replace the entire contents of `src/spreadsheet/process.ts` with:

```ts
import type { Config } from '../config';
import type { RowResult, Summary } from '../types';
import { readSpreadsheet, type LoadedSpreadsheet } from './read';
import { detectUrlColumn, findColumn } from '../detectColumn';
import { mapWithConcurrency } from '../pool';
import { countUrl } from '../counting';
import { isFullUrl } from '../url';
import { summarize } from '../report';

export interface ProcessResult {
  loaded: LoadedSpreadsheet;
  results: RowResult[];
  summary: Summary;
  counts: (number | null)[];
  warnings: string[];
}

export async function processSpreadsheet(path: string, cfg: Config): Promise<ProcessResult> {
  const loaded = await readSpreadsheet(path);
  const table = { header: loaded.header, rows: loaded.rows };
  const col = detectUrlColumn(table, cfg.column);

  // Resolve the optional row filter. An explicit --filter-column that is missing is an
  // error; the default column merely being absent falls back to counting every row.
  const warnings: string[] = [];
  let filterCol: number | null = null;
  let accept: Set<string> | null = null;
  if (cfg.filter) {
    const idx = findColumn(table, cfg.filter.column);
    if (idx !== undefined) {
      filterCol = idx;
      accept = new Set(cfg.filter.values);
    } else if (cfg.filter.columnExplicit) {
      throw new Error(`--filter-column "${cfg.filter.column}" not found in header`);
    } else {
      warnings.push(`No "${cfg.filter.column}" column found; counted all rows.`);
    }
  }

  const results = await mapWithConcurrency(
    loaded.rows,
    cfg.concurrency,
    async (row, i): Promise<RowResult> => {
      const rowNumber = i + 2; // row 1 is the header
      if (filterCol !== null && accept) {
        const value = (row[filterCol] ?? '').trim().toLowerCase();
        if (!accept.has(value)) {
          return { row: rowNumber, url: null, type: null, pageCount: null, status: 'filtered' };
        }
      }
      const cell = (row[col] ?? '').trim();
      if (!isFullUrl(cell)) {
        return { row: rowNumber, url: cell || null, type: null, pageCount: null, status: 'no-url' };
      }
      const { type, outcome } = await countUrl(cell, cfg);
      return {
        row: rowNumber,
        url: cell,
        type,
        pageCount: outcome.pageCount,
        status: outcome.status,
        ...(outcome.error ? { error: outcome.error } : {}),
      };
    },
  );

  return {
    loaded,
    results,
    summary: summarize(results),
    counts: results.map((r) => r.pageCount),
    warnings,
  };
}
```

- [ ] **Step 3b: Print the warnings in `src/run.ts`**

Replace the `runSpreadsheet` function in `src/run.ts` with (only the first two lines of the body change — destructure `warnings` and print each):

```ts
async function runSpreadsheet(path: string, cfg: Config): Promise<void> {
  const { loaded, results, summary, counts, warnings } = await processSpreadsheet(path, cfg);
  for (const w of warnings) console.warn(w);
  const notes = results.map(rowNote);
  const columns = [
    { header: cfg.countColumn, values: counts },
    { header: `${cfg.countColumn}_notes`, values: notes },
  ];

  const base = outputBaseFor(path, cfg);
  await mkdir(dirname(base), { recursive: true });
  // Always write both a CSV and an XLSX version of the result.
  await loaded.writeCsv(`${base}.csv`, columns);
  await loaded.writeXlsx(`${base}.xlsx`, columns);
  console.log(formatSpreadsheetSummary(path, outputPathFor(path, cfg), summary));

  // Keep .pagecount-output to the single latest result: write the JSON sidecar only
  // with --json, and remove a stale one otherwise.
  const jsonPath = `${base}.json`;
  if (cfg.json) {
    await writeFile(
      jsonPath,
      JSON.stringify(buildSpreadsheetJson(path, `${base}.csv`, results, summary), null, 2),
    );
  } else {
    await rm(jsonPath, { force: true });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/spreadsheet/process.test.ts`
Expected: PASS — including the pre-existing `'counts URLs, blanks non-URLs…'` test (its `Name,Link` sheet has no `Recommendation` column → soft fallback → all rows counted as before).

- [ ] **Step 5: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/spreadsheet/process.ts src/run.ts test/spreadsheet/process.test.ts
git commit -m "feat: filter spreadsheet rows before counting; skip downloads for non-matches"
```

---

### Task 5: CLI flags

Expose `--filter-column`, `--filter-value`, and `--no-filter`, and wire them into `resolveConfig`.

**Files:**
- Modify: `src/cli.ts`
- Test: `test/cli.test.ts`

**Interfaces:**
- Consumes: `RawOptions.filterColumn/filterValue/noFilter` (Task 2).
- Commander note: `--no-filter` produces `opts.filter` (boolean, default `true`; `false` when the flag is passed). `--filter-column`/`--filter-value` produce `opts.filterColumn`/`opts.filterValue`.

- [ ] **Step 1: Write the failing tests**

Append to `test/cli.test.ts` inside the `describe('buildProgram', …)` block:

```ts
  it('defaults filter on when --no-filter is absent', () => {
    const p = buildProgram().exitOverride();
    p.parse(['node', 'pagecount', 'a.csv']);
    expect(p.opts().filter).toBe(true);
  });

  it('parses filter options and --no-filter', () => {
    const p = buildProgram().exitOverride();
    p.parse([
      'node', 'pagecount', 'a.csv',
      '--filter-column', 'Recommendation', '--filter-value', 'remediate,true', '--no-filter',
    ]);
    expect(p.opts()).toMatchObject({
      filterColumn: 'Recommendation', filterValue: 'remediate,true', filter: false,
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/cli.test.ts`
Expected: FAIL — options not defined (`filterColumn` undefined; `filter` undefined).

- [ ] **Step 3: Implement the CLI options**

In `src/cli.ts`, add the three options to the `program` chain in `buildProgram`, immediately after the `--count-column` line:

```ts
    .option('--filter-column <name|index>', 'only count rows matching --filter-value; header name or 1-based index (default: Recommendation)')
    .option('--filter-value <values>', 'comma-separated value(s) to match, exact & case-insensitive (default: remediate)')
    .option('--no-filter', 'count every row, ignoring the default Recommendation filter')
```

In `main`, add three properties to the `resolveConfig({ … })` object (after `allowPrivateHosts: opts.allowPrivateHosts,`):

```ts
    filterColumn: opts.filterColumn,
    filterValue: opts.filterValue,
    noFilter: opts.filter === false,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/cli.test.ts`
Expected: PASS (including the pre-existing `'parses inputs and options'` test).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts test/cli.test.ts
git commit -m "feat: add --filter-column/--filter-value/--no-filter CLI flags"
```

---

### Task 6: Docs and version bump

Document the new behavior and flags, record the behavior change, and bump to `0.2.0`.

**Files:**
- Modify: `package.json` (version)
- Modify: `src/cli.ts` (`.version(...)`)
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:** none (docs + metadata).

- [ ] **Step 1: Bump the version**

In `package.json`, change `"version": "0.1.1",` to `"version": "0.2.0",`.

In `src/cli.ts`, change `.version('0.1.1');` to `.version('0.2.0');`.

- [ ] **Step 2: Update the README options table**

In `README.md`, insert three rows in the options table immediately after the `--count-column` row (around line 105):

```markdown
| `--filter-column <name\|index>` | (spreadsheet) only count rows matching `--filter-value`; name or 1-based index | `Recommendation` |
| `--filter-value <values>` | (spreadsheet) comma-separated value(s) to match (exact, case-insensitive) | `remediate` |
| `--no-filter` | (spreadsheet) count every row, ignoring the default filter | off |
```

- [ ] **Step 3: Add a README "Filtering rows" subsection**

In `README.md`, immediately before `### Document mode` (around line 82), insert:

```markdown
### Filtering rows (remediation)

By default, spreadsheet mode counts pages only for rows whose **`Recommendation`** column
equals **`remediate`** (case-insensitive). This gives remediation vendors a single number
per site: the TOTAL row sums just the pages marked for remediation. Non-matching rows are
kept in place with a blank `programmatic_page_count` and `skipped (filtered out)` in the
notes column — and are never downloaded.

```bash
pagecount "samples/ICJIA R&A publications-as of 2026-05-29(DVFR).csv"
```

- Different column or values:
  `pagecount data.csv --filter-column Action --filter-value fix,review`
- Count **every** row (e.g. a sheet with no disposition column, or when you want all of
  them): `pagecount data.csv --no-filter`

If a sheet has no `Recommendation` column and you didn't pass `--filter-column`,
`pagecount` prints a one-line notice and counts every row.

```

- [ ] **Step 4: Update the README summary example**

In `README.md`, replace the summary code block under "Output & errors" (currently lines ~150–154) with the new format:

```
  data.csv  →  .pagecount-output/data-pagecount.csv
    150 rows · 14 counted · 132 filtered · 3 no-url · 1 failed · 318 total pages
      failed: 1 timeout
```

Also, in the appended-columns paragraph (around line 67), add `skipped (filtered out)` to the example reasons: change `e.g. \`corrupt\`, \`unsupported\`, \`no-url\`` to `e.g. \`corrupt\`, \`unsupported\`, \`no-url\`, \`skipped (filtered out)\``.

- [ ] **Step 5: Add the CHANGELOG entry**

In `CHANGELOG.md`, insert directly under the `# Changelog` intro paragraph (before `## [0.1.1]`):

```markdown
## [0.2.0] — 2026-06-23

### Added

- **Row filtering** — spreadsheet mode now counts only rows whose **`Recommendation`**
  column equals **`remediate`** (case-insensitive) by default, so the TOTAL reflects just
  the pages marked for remediation. Override with `--filter-column <name|index>` and
  `--filter-value <a,b,c>` (exact, case-insensitive, comma-separated alternatives).
  Non-matching rows keep a blank count with `skipped (filtered out)` in the notes column
  and are never downloaded.
- `--no-filter` to count every row regardless of the default filter.
- The terminal summary now reports the `filtered` row count and `total pages`.

### Changed

- **Behavior change:** spreadsheets containing a `Recommendation` column now auto-filter
  to `remediate` rows by default. Sheets without that column are unaffected (every row is
  counted, with a one-line notice); pass `--no-filter` to count all rows even when the
  column is present.
```

And add the link reference near the bottom of the file, above the `[0.1.1]:` line:

```markdown
[0.2.0]: https://github.com/ICJIA/pagecount/releases/tag/v0.2.0
```

- [ ] **Step 6: Build, full test, and sync the test count**

Run: `npm run build && npm test && npm run typecheck`
Expected: build succeeds; all tests pass; no type errors.

Read the test total printed by `npm test` (e.g. `Tests  N passed`). Replace both occurrences of `109` in `README.md` (lines ~6 and ~185, the "(109 ... tests)" mentions) with that number.

- [ ] **Step 7: Smoke-test on the real sample (needs network)**

Run: `node dist/cli.js "samples/ICJIA R&A publications-as of 2026-05-29(DVFR).csv"`
Expected: the summary line shows `… filtered …` and `… total pages`; `samples/.pagecount-output/` contains the `-pagecount.csv`/`.xlsx` with `programmatic_page_count` populated only on `Remediate` rows and `skipped (filtered out)` notes elsewhere, plus a `TOTAL` row equal to the sum of the remediate pages. (This fetches the live DVFR URLs; if offline, skip and rely on the test suite.)

- [ ] **Step 8: Commit**

```bash
git add README.md CHANGELOG.md package.json src/cli.ts
git commit -m "release: v0.2.0 — default Recommendation=remediate row filter"
```

---

## Self-Review

**Spec coverage:**
- CLI surface (`--filter-column`/`--filter-value`/`--no-filter`, defaults) → Task 5 + Task 6 (docs). ✓
- Column resolution (`findColumn`/`resolveColumn`, `detectUrlColumn` delegation) → Task 1. ✓
- Config (`FilterSpec`, defaults, `buildFilter`, both-empty validation, `columnExplicit`) → Task 2. ✓
- Filtering data flow (resolve column, soft-vs-explicit, short-circuit before fetch, warnings) → Task 4. ✓
- Status/reporting/summary (`filtered`, `totalPages`, summary line, `rowNote`) → Task 3. ✓
- TOTAL row excludes blanks → **already covered** by `test/spreadsheet/total.test.ts:5-11` (`[3, null, 5]` → `8`); filtered rows yield `null` counts. No new code/test. ✓
- Document mode unaffected → no change to `countDocument` path; filter lives only in `processSpreadsheet`. ✓
- Behavior change + minor bump → Task 6 (CHANGELOG "Changed" + `0.2.0`). ✓
- `--no-filter` precedence over filter flags → `buildFilter` returns `null` first when `raw.noFilter` (Task 2); covered by the `noFilter` config test and the process `noFilter` test. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; the one derived value (test count) has an explicit "read it from `npm test`" instruction. ✓

**Type consistency:** `findColumn`/`resolveColumn` signatures match across Tasks 1 and 4; `Config.filter`/`FilterSpec` fields (`column`, `columnExplicit`, `values`) match across Tasks 2 and 4; `Status` `'filtered'` and `Summary.{filtered,totalPages}` match across Tasks 3 and 4; `ProcessResult.warnings` produced in Task 4 and consumed in `run.ts` (Task 4). ✓
