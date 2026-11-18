const locks = new Map<string, Promise<void>>();

/** Serialize publication and compensation for one task in the current worker. */
export async function withTaskCreationLock<T>(taskId: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(taskId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => gate);
  locks.set(taskId, tail);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (locks.get(taskId) === tail) locks.delete(taskId);
  }
}

export function withUserProtocolLock<T>(userId: number, action: () => Promise<T>): Promise<T> {
  return withTaskCreationLock(`protocol:${userId}`, action);
}
