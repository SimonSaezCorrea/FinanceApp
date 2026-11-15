/**
 * Runs work for the same key one at a time, in this process (security run-4 hardening). The
 * in-memory failure counters check "locked?" before bcrypt and record the failure after it, so
 * without this a burst of parallel guesses all passed the check before any failure was counted
 * and could exceed the threshold by the size of the burst. Keys don't wait on each other.
 */
const tails = new Map<string, Promise<unknown>>();

export function serially<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(work, work);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  // Forget the key once nothing is queued behind this run.
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}
