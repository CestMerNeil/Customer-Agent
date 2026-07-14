/** Pending browser operations keyed by persistent profile directory. */
const profileLocks = new Map<string, Promise<void>>();

/**
 * Serializes browser contexts that share one persistent PDD profile.
 *
 * @param profileDir Persistent profile directory used as the lock key.
 * @param operation Browser operation to run exclusively for that profile.
 * @returns The operation result.
 * @throws The original operation error after releasing the lock.
 */
export async function withPddBrowserProfileLock<T>(profileDir: string, operation: () => Promise<T>): Promise<T> {
  const previous = profileLocks.get(profileDir) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = previous.then(() => gate);
  profileLocks.set(profileDir, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (profileLocks.get(profileDir) === current) {
      profileLocks.delete(profileDir);
    }
  }
}
