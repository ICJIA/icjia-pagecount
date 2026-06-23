import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli.ts', 'pdf-worker': 'src/counters/pdfWorker.ts' },
  format: ['esm'],
  target: 'node20',
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
});
