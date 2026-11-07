/** Presentation lifetime only. Native cleanup must finish before a replacement can be constructed. */
export interface RenewableCeremony<T> {
  readonly failed: boolean;
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
  command(input: unknown): Promise<unknown>;
  send(input: unknown): void;
  whenIdle(): Promise<void>;
  close(): Promise<void>;
}
export function renewCeremonyOnCommand<T, O extends RenewableCeremony<T>>(
  create: (first: boolean) => O,
  retry: unknown,
) {
  let current = create(true),
    closed = false,
    opening: Promise<void> | undefined,
    closing: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const publish = () => {
    for (const listener of listeners) listener();
  };
  let off = current.subscribe(publish);
  const ready = async () => {
    if (closed) throw Error('Setup closed');
    if (current.failed) {
      if (retry === undefined) throw Error('Unlock this workspace again to continue.');
      opening ??= (async () => {
        await current.close();
        await current.whenIdle().catch(() => {});
        if (closed) throw Error('Setup closed');
        off();
        current = create(false);
        off = current.subscribe(publish);
        publish();
        await current.command(retry);
      })().finally(() => {
        opening = undefined;
      });
    }
    await opening;
    if (closed) throw Error('Setup closed');
    return current;
  };
  return {
    get current() {
      return current;
    },
    getSnapshot: () => current.getSnapshot(),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    command(input: unknown) {
      if (closed) return Promise.reject(Error('Setup closed'));
      // Preserve synchronous acquisition of the first real supervisor by the original adapter.
      if (!current.failed && !opening) return current.command(input);
      return ready().then((owner) => owner.command(input));
    },
    send(input: unknown) {
      if (closed) return;
      if (!current.failed && !opening) current.send(input);
      else
        void ready()
          .then((owner) => owner.send(input))
          .catch(() => {});
    },
    close() {
      if (closing) return closing;
      closed = true;
      const native = current.close();
      return (closing = (async () => {
        try {
          await native;
          await opening?.catch(() => {});
          await current.close();
        } finally {
          off();
        }
      })());
    },
  };
}
