/** Bounded advisory Window activity; no event is permission for a storage or authority effect. */
import type { WorkerActivity } from './accountWorkerRuntime';

export const workerActivityKinds = [
  'visibilitychange',
  'keydown',
  'beforeinput',
  'pointerdown',
  'freeze',
  'resume',
  'online',
  'offline',
  'pageshow',
  'pagehide',
] as const;
export type WorkerActivityKind = (typeof workerActivityKinds)[number];
export type WorkerActivityMessage = WorkerActivity & { readonly kind: WorkerActivityKind };

/** One in-flight call plus the latest occurrence of each kind/state pair. Repeated input cannot
 * consume the channel's other request credits. Retained lifecycle transitions drain in observed
 * order, ending at the latest Window state. No timer, polling or synchronous worker wait. */
export function createWorkerActivityForwarder(options: {
  signal: AbortSignal;
  snapshot(): WorkerActivity;
  send(message: WorkerActivityMessage): Promise<unknown>;
  failed(): void;
}) {
  const pending = new Map<string, { sequence: number; message: WorkerActivityMessage }>();
  let sequence = 0,
    sending = false,
    closed = false;
  const close = () => {
    closed = true;
    pending.clear();
    options.signal.removeEventListener('abort', close);
  };
  const drain = () => {
    if (closed || sending || !pending.size) return;
    const [key, value] = [...pending.entries()].reduce((a, b) =>
      a[1].sequence < b[1].sequence ? a : b,
    );
    pending.delete(key);
    sending = true;
    void (async () => {
      try {
        await options.send(value.message);
      } catch {
        if (!closed) {
          close();
          options.failed();
        }
      } finally {
        sending = false;
        drain();
      }
    })();
  };
  options.signal.addEventListener('abort', close, { once: true });
  if (options.signal.aborted) close();
  return Object.freeze({
    notify(kind: WorkerActivityKind) {
      if (closed) return;
      const state = options.snapshot();
      if (
        !workerActivityKinds.includes(kind) ||
        !['visible', 'hidden'].includes(state.visibility) ||
        typeof state.online !== 'boolean' ||
        !Number.isSafeInteger(++sequence)
      ) {
        close();
        options.failed();
        return;
      }
      const message = { kind, visibility: state.visibility, online: state.online };
      pending.set(kind + '/' + state.visibility + '/' + state.online, { sequence, message });
      drain();
    },
    close,
  });
}
