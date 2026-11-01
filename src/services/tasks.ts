/** Coalesces duplicate taps into one operation, and permits a real retry after failure. */
export function createSingleFlight<T>() {
  const pending = new Map<string, Promise<T>>();
  return (key: string, operation: () => Promise<T>): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing;
    const promise = Promise.resolve().then(operation).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  };
}
