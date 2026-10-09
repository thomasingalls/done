import { EventEmitter } from 'node:events';
import { within } from '../legacy-cleanup/diagnostics.mjs';

/** Separate debugger connection: no automation library silently resumes quarantined targets. */
export class CDP extends EventEmitter {
  constructor(socket, timeout) {
    super();
    this.socket = socket;
    this.timeout = timeout;
    this.next = 0;
    this.pending = new Map();
    this.disconnected = false;
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error)
          pending.reject(new Error(`CDP ${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result);
      } else this.emit(message.method, message.params, message.sessionId);
    });
    socket.addEventListener('close', () => {
      this.disconnected = true;
      for (const pending of this.pending.values()) pending.reject(new Error('CDP disconnected'));
      this.pending.clear();
      this.emit('disconnected');
    });
  }
  static async connect(url, timeout = 15000) {
    const socket = new WebSocket(url);
    await within(
      'debugger connection',
      timeout,
      () =>
        new Promise((resolve, reject) => {
          socket.addEventListener('open', resolve, { once: true });
          socket.addEventListener('error', () => reject(new Error('Debugger connection failed')), {
            once: true,
          });
        }),
    );
    return new CDP(socket, timeout);
  }
  async send(method, params = {}, sessionId) {
    const id = ++this.next;
    try {
      return await within(
        `CDP ${method}`,
        this.timeout,
        () =>
          new Promise((resolve, reject) => {
            if (this.disconnected) {
              reject(new Error('CDP disconnected'));
              return;
            }
            this.pending.set(id, { method, resolve, reject });
            this.socket.send(
              JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }),
            );
          }),
      );
    } finally {
      this.pending.delete(id);
    }
  }
  async evaluate(sessionId, expression) {
    const result = await this.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (result.exceptionDetails)
      throw new Error(
        `Fixture evaluation: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
      );
    return result.result.value;
  }
  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await within(
      'debugger close',
      this.timeout,
      () =>
        new Promise((resolve) => {
          this.socket.addEventListener('close', resolve, { once: true });
          this.socket.close();
        }),
    );
  }
}

export const eventually = async (label, read, predicate = Boolean, ms = 10000) =>
  within(label, ms, async () => {
    for (;;) {
      const value = await read();
      if (predicate(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  });
