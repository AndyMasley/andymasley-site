export async function mapWithConcurrency<T, U>(
  items: T[],
  mapper: (item: T, index: number) => Promise<U>,
  concurrency = 6
): Promise<U[]> {
  if (concurrency < 1) {
    throw new Error('concurrency must be at least 1');
  }

  if (items.length === 0) {
    return [];
  }

  const results = new Array<U>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
