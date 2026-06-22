import type { Status } from './types';

export class CountError extends Error {
  constructor(public status: Status, message?: string) {
    super(message ?? status);
    this.name = 'CountError';
  }
}

export function statusFromHttp(code: number): Status {
  if (code === 404 || code === 410) return 'not-found';
  return 'http-error';
}

export function statusFromFetchError(err: unknown): Status {
  if (err instanceof CountError) return err.status;
  const name = (err as { name?: string } | null)?.name;
  if (name === 'AbortError' || name === 'TimeoutError') return 'timeout';
  return 'network-error';
}
