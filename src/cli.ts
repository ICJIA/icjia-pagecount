import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { resolveConfig } from './config';
import { run } from './run';

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('pagecount')
    .description('Add page counts to a spreadsheet of document URLs, or count a single document.')
    .argument('<input...>', 'spreadsheets (.csv/.xlsx) and/or documents (.pdf/.docx/.pptx or a URL)')
    .option('-o, --output <dir>', 'force one shared output dir (default: .pagecount-output beside each file)')
    .option('-c, --column <name|index>', 'URL column: header name or 1-based index (default: auto-detect)')
    .option('--count-column <name>', 'name of the added column (default: PageCount)')
    .option('--suffix <text>', 'output filename suffix (default: pagecount)')
    .option('--json', 'emit JSON (sidecar in spreadsheet mode; stdout in document mode)')
    .option('-q, --quiet', 'document mode: print only the page number')
    .option('--concurrency <n>', 'parallel downloads per spreadsheet (default: 8)')
    .option('--timeout <sec>', 'per-URL fetch timeout (default: 30)')
    .option('--max-size <mb>', 'skip files larger than this (default: 100)')
    .option('--docx-render', 'force LibreOffice render for docx')
    .version('0.1.0');
  return program;
}

export async function main(argv: string[]): Promise<void> {
  const program = buildProgram();
  program.parse(argv);
  const opts = program.opts();
  const cfg = resolveConfig({
    output: opts.output,
    column: opts.column,
    countColumn: opts.countColumn,
    suffix: opts.suffix,
    json: opts.json,
    quiet: opts.quiet,
    concurrency: opts.concurrency,
    timeout: opts.timeout,
    maxSize: opts.maxSize,
    docxRender: opts.docxRender,
  });
  process.exitCode = await run(program.args, cfg);
}

function isDirectRun(): boolean {
  try {
    const entry = process.argv[1];
    return Boolean(entry) && realpathSync(entry as string) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main(process.argv).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
