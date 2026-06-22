import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from '../src/pool';

describe('mapWithConcurrency', () => {
  it('preserves order and maps results', async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40]);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let max = 0;
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    });
    expect(max).toBeLessThanOrEqual(3);
  });
});
