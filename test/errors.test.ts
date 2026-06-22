import { describe, it, expect } from 'vitest';
import { CountError, statusFromHttp, statusFromFetchError } from '../src/errors';

describe('statusFromHttp', () => {
  it('maps 404 and 410 to not-found', () => {
    expect(statusFromHttp(404)).toBe('not-found');
    expect(statusFromHttp(410)).toBe('not-found');
  });
  it('maps other non-2xx to http-error', () => {
    expect(statusFromHttp(500)).toBe('http-error');
    expect(statusFromHttp(403)).toBe('http-error');
  });
});

describe('statusFromFetchError', () => {
  it('maps AbortError/TimeoutError to timeout', () => {
    const a = new Error('aborted'); a.name = 'AbortError';
    const t = new Error('timed out'); t.name = 'TimeoutError';
    expect(statusFromFetchError(a)).toBe('timeout');
    expect(statusFromFetchError(t)).toBe('timeout');
  });
  it('passes through a CountError status', () => {
    expect(statusFromFetchError(new CountError('too-large'))).toBe('too-large');
  });
  it('defaults unknown errors to network-error', () => {
    expect(statusFromFetchError(new Error('boom'))).toBe('network-error');
  });
});
