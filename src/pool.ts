import pLimit from 'p-limit';

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const run = pLimit(limit);
  return Promise.all(items.map((item, i) => run(() => fn(item, i))));
}
