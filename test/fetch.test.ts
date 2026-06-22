import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { fetchToTempFile } from '../src/fetch';
import { resolveConfig } from '../src/config';
import { statusFromFetchError } from '../src/errors';
import { pdfBytes } from './helpers/fixtures';

let server: Server;
let base: string;
let pdf: Uint8Array;

beforeAll(async () => {
  pdf = await pdfBytes(2);
  server = createServer((req, res) => {
    if (req.url === '/ok.pdf') {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end(Buffer.from(pdf));
    } else if (req.url === '/redirect') {
      res.writeHead(302, { location: '/ok.pdf' });
      res.end();
    } else if (req.url === '/missing') {
      res.writeHead(404);
      res.end('nope');
    } else if (req.url === '/slow') {
      setTimeout(() => { res.writeHead(200); res.end('late'); }, 1000);
    } else {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const cfg = resolveConfig({});

describe('fetchToTempFile', () => {
  it('downloads a file and reports content-type', async () => {
    const f = await fetchToTempFile(`${base}/ok.pdf`, cfg);
    const bytes = new Uint8Array(await readFile(f.tempPath));
    expect(bytes.length).toBe(pdf.length);
    expect(f.contentType).toContain('application/pdf');
    await f.cleanup();
  });

  it('follows redirects', async () => {
    const f = await fetchToTempFile(`${base}/redirect`, cfg);
    expect(f.contentType).toContain('application/pdf');
    await f.cleanup();
  });

  it('maps 404 to a not-found CountError', async () => {
    await expect(fetchToTempFile(`${base}/missing`, cfg)).rejects.toMatchObject({ status: 'not-found' });
  });

  it('times out slow responses', async () => {
    const fast = resolveConfig({ timeout: '0.1' });
    try {
      await fetchToTempFile(`${base}/slow`, fast);
      throw new Error('should have thrown');
    } catch (err) {
      expect(statusFromFetchError(err)).toBe('timeout');
    }
  });
});
