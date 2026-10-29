/** Internal bounded transport. Messages carry data, never a native permit or verification lease. */
export const WORKER_MESSAGE_BYTES = 1024 * 1024;
export const WORKER_PENDING_CALLS = 8;
export class WorkerChannelError extends Error {
  override readonly name = 'WorkerChannelError';
  constructor(readonly code: string) {
    super('Worker operation could not finish.');
  }
}
/** Avoid getters, shared/detached buffers, alias graphs and executable/prototyped payloads. */
export function workerMessageBytes(value: unknown): number {
  let bytes = 0,
    nodes = 0;
  const seen = new Set<object>(),
    todo: unknown[] = [value];
  while (todo.length) {
    if (++nodes > 65536) throw new WorkerChannelError('message-bound');
    const v = todo.pop();
    if (v === null || v === undefined || typeof v === 'boolean') continue;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new WorkerChannelError('message-shape');
      bytes += 8;
    } else if (typeof v === 'string') bytes += v.length * 2;
    else if (typeof v === 'object') {
      if (seen.has(v)) throw new WorkerChannelError('message-alias');
      seen.add(v);
      if (v instanceof Uint8Array) {
        if (Object.getPrototypeOf(v) !== Uint8Array.prototype || !(v.buffer instanceof ArrayBuffer))
          throw new WorkerChannelError('message-buffer');
        try {
          v.subarray(0, 0);
        } catch {
          throw new WorkerChannelError('message-buffer');
        }
        bytes += v.buffer.byteLength;
      } else {
        if (
          Array.isArray(v)
            ? Object.getPrototypeOf(v) !== Array.prototype || v.length > 65536
            : Object.getPrototypeOf(v) !== Object.prototype
        )
          throw new WorkerChannelError('message-shape');
        for (const key of Reflect.ownKeys(v)) {
          if (typeof key !== 'string') throw new WorkerChannelError('message-shape');
          const d = Object.getOwnPropertyDescriptor(v, key)!;
          if (!('value' in d)) throw new WorkerChannelError('message-accessor');
          bytes += key.length * 2;
          todo.push(d.value);
        }
      }
    } else throw new WorkerChannelError('message-shape');
    if (bytes > WORKER_MESSAGE_BYTES) throw new WorkerChannelError('message-bound');
  }
  return bytes;
}
export function eraseWorkerMessage(value: unknown): void {
  const seen = new Set<object>(),
    todo = [value];
  while (todo.length) {
    const v = todo.pop();
    if (!v || typeof v !== 'object' || seen.has(v)) continue;
    seen.add(v);
    if (v instanceof Uint8Array && v.buffer instanceof ArrayBuffer) {
      try {
        v.fill(0);
      } catch {
        /* detached bytes cannot be reused */
      }
    } else
      for (const d of Object.values(Object.getOwnPropertyDescriptors(v)))
        if ('value' in d) todo.push(d.value);
  }
}
type Handler = (value: unknown) => unknown | Promise<unknown>;
const codeOf = (cause: unknown): string => {
  if (!cause || typeof cause !== 'object') return 'operation-refused';
  const code = Object.getOwnPropertyDescriptor(cause, 'code')?.value;
  return typeof code === 'string' && /^[a-z-]{1,64}$/.test(code) ? code : 'operation-refused';
};

/** Handler inputs/results are owned copies. Handlers must detach results from their private caches.
 * Replies are erased after native postMessage has copied them; late replies are erased on receipt. */
export function createWorkerChannel(
  port: MessagePort,
  incarnation: string,
  handlers: Readonly<Record<string, Handler>>,
  onClose: (reason: unknown) => void,
) {
  if (!/^[a-f0-9]{32}$/.test(incarnation)) throw new WorkerChannelError('owner-shape');
  const methods = Object.freeze({ ...handlers });
  let closed = false,
    sequence = 0,
    received = 0,
    active = 0;
  const pending = new Map<
    number,
    { method: string; resolve(value: unknown): void; reject(cause: unknown): void }
  >();
  const fail = (reason: unknown, notify = true) => {
    if (closed) return;
    closed = true;
    if (notify) {
      try {
        port.postMessage({ v: 1, kind: 'closed', owner: incarnation });
      } catch {
        /* remote context may already be gone */
      }
    }
    port.removeEventListener('message', message);
    port.removeEventListener('messageerror', unreadable);
    port.close();
    for (const p of pending.values()) p.reject(reason);
    pending.clear();
    onClose(reason);
  };
  const post = (value: unknown) => {
    workerMessageBytes(value);
    port.postMessage(value);
  };
  const message = (event: MessageEvent) => {
    const m = event.data;
    // Unknown old incarnations cannot authorize work or close the current lifetime.
    if (m?.owner !== incarnation || closed) {
      eraseWorkerMessage(m);
      return;
    }
    try {
      workerMessageBytes(m);
      if (m.kind === 'closed') {
        if (Object.keys(m).sort().join() !== 'kind,owner,v' || m.v !== 1)
          throw new WorkerChannelError('message-shape');
        fail(new WorkerChannelError('closed'), false);
        return;
      }
      if (
        m.v !== 1 ||
        !Number.isSafeInteger(m.id) ||
        m.id < 1 ||
        typeof m.method !== 'string' ||
        !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(m.method)
      )
        throw new WorkerChannelError('message-shape');
      if (m.kind === 'reply') {
        if (
          Object.keys(m).sort().join() !== 'id,kind,method,ok,owner,v,value' ||
          typeof m.ok !== 'boolean'
        )
          throw new WorkerChannelError('message-shape');
        const p = pending.get(m.id);
        if (!p || p.method !== m.method) {
          eraseWorkerMessage(m);
          return;
        }
        if (m.ok) {
          pending.delete(m.id);
          p.resolve(m.value);
        } else {
          const code = m.value?.code;
          if (typeof code !== 'string' || !/^[a-z-]{1,64}$/.test(code))
            throw new WorkerChannelError('message-shape');
          pending.delete(m.id);
          p.reject(new WorkerChannelError(code));
        }
        return;
      }
      if (
        m.kind !== 'call' ||
        Object.keys(m).sort().join() !== 'id,kind,method,owner,v,value' ||
        m.id !== received + 1 ||
        !Object.hasOwn(methods, m.method) ||
        active >= WORKER_PENDING_CALLS
      )
        throw new WorkerChannelError('message-order');
      received = m.id;
      active++;
      void Promise.resolve()
        .then(() => {
          if (closed) throw new WorkerChannelError('closed');
          return methods[m.method]!(m.value);
        })
        .then(
          (value) => {
            try {
              if (!closed)
                post({
                  v: 1,
                  kind: 'reply',
                  owner: incarnation,
                  id: m.id,
                  method: m.method,
                  ok: true,
                  value,
                });
            } catch (cause) {
              if (!closed)
                post({
                  v: 1,
                  kind: 'reply',
                  owner: incarnation,
                  id: m.id,
                  method: m.method,
                  ok: false,
                  value: { code: codeOf(cause) },
                });
            } finally {
              eraseWorkerMessage(value);
            }
          },
          (cause) => {
            if (!closed)
              post({
                v: 1,
                kind: 'reply',
                owner: incarnation,
                id: m.id,
                method: m.method,
                ok: false,
                value: { code: codeOf(cause) },
              });
          },
        )
        .catch(fail)
        .finally(() => {
          active--;
          eraseWorkerMessage(m.value);
        });
    } catch (cause) {
      eraseWorkerMessage(m);
      fail(cause);
    }
  };
  const unreadable = () => fail(new WorkerChannelError('message-unreadable'));
  port.addEventListener('message', message);
  port.addEventListener('messageerror', unreadable);
  port.start();
  return Object.freeze({
    request<T = unknown>(method: string, value?: unknown): Promise<T> {
      if (closed) return Promise.reject(new WorkerChannelError('closed'));
      if (pending.size >= WORKER_PENDING_CALLS)
        return Promise.reject(new WorkerChannelError('queue-full'));
      if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(method) || sequence === Number.MAX_SAFE_INTEGER)
        return Promise.reject(new WorkerChannelError('message-shape'));
      const id = sequence + 1;
      try {
        // Reject BEFORE consuming a sequence number; the next valid request must remain usable.
        workerMessageBytes({ v: 1, kind: 'call', owner: incarnation, id, method, value });
      } catch (cause) {
        return Promise.reject(cause);
      }
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { method, resolve: (v) => resolve(v as T), reject });
        try {
          port.postMessage({ v: 1, kind: 'call', owner: incarnation, id, method, value });
          sequence = id;
        } catch (cause) {
          pending.delete(id);
          reject(cause);
          fail(cause);
        }
      });
    },
    get pending() {
      return pending.size;
    },
    get closed() {
      return closed;
    },
    close: (reason: unknown = new WorkerChannelError('closed')) => fail(reason),
  });
}
export type WorkerChannel = ReturnType<typeof createWorkerChannel>;
