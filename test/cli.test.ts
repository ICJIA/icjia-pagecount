import { describe, it, expect, vi } from 'vitest';
import { buildProgram, main } from '../src/cli';
import { pdfBytes, writeTemp } from './helpers/fixtures';

describe('buildProgram', () => {
  it('parses inputs and options', () => {
    const p = buildProgram().exitOverride();
    p.parse(['node', 'pagecount', 'a.csv', 'b.pdf', '--concurrency', '4', '--json']);
    expect(p.args).toEqual(['a.csv', 'b.pdf']);
    expect(p.opts()).toMatchObject({ concurrency: '4', json: true });
  });
});

describe('main', () => {
  it('counts a local pdf and sets exit code 0', async () => {
    const file = await writeTemp(await pdfBytes(2), 'a.pdf');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(['node', 'pagecount', file]);
    expect(process.exitCode).toBe(0);
    expect(log.mock.calls.flat().join(' ')).toContain('pdf');
    log.mockRestore();
    process.exitCode = 0;
  });
});
