import { pageRuntimePorts } from '../crdt/runtimePorts';
/** Hints carry no authority. Every ready/hint schedules the owner's authenticated catch-up. */
export class NotificationFrames {
  #partial = '';
  #ready = false;
  push(bytes: Uint8Array, emit: (event: 'ready' | 'hint' | 'content') => void) {
    // A fetch chunk can contain many frames. Never accumulate it as one unbounded string.
    for (const byte of bytes) {
      // This protocol's entire alphabet is ASCII; reject extensions rather than accepting
      // arbitrary SSE fields, payloads or event IDs as meaningful state.
      if (byte > 127) throw Error('Invalid notification encoding');
      this.#partial += String.fromCharCode(byte);
      if (this.#partial.length > 4096) throw Error('Notification frame too large');
      if (!this.#partial.endsWith('\n\n')) continue;
      const frame = this.#partial;
      this.#partial = '';
      if (frame === ': heartbeat\n\n') continue;
      const event = /^event: (ready|hint|content)\ndata: \{\}\n\n$/.exec(frame)?.[1];
      if (!event || (event === 'ready') === this.#ready) throw Error('Invalid notification frame');
      this.#ready = true;
      emit(event as 'ready' | 'hint' | 'content');
    }
  }
}

export async function readNotifications(
  response: Response,
  signal: AbortSignal,
  emit: (event: 'ready' | 'hint' | 'content') => void,
) {
  if (
    !response.ok ||
    !response.body ||
    response.headers.get('Content-Type')?.split(';')[0] !== 'text/event-stream'
  ) {
    await response.body?.cancel();
    throw Error('Invalid notification stream');
  }
  const reader = response.body.getReader(),
    parser = new NotificationFrames();
  let idle: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      idle = setTimeout(cancel, 25000);
      const { done, value } = await reader.read();
      clearTimeout(idle);
      signal.throwIfAborted();
      if (done) return;
      parser.push(value, (event) => {
        signal.throwIfAborted();
        emit(event);
      });
    }
  } finally {
    clearTimeout(idle);
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Own exactly one stream and retry timer. No passkey prompts or semantic operations here. */
export function startNotifications(options: {
  signal: AbortSignal;
  open(signal: AbortSignal): Promise<Response>;
  wake(event: 'ready' | 'hint' | 'content' | 'resume'): void;
  health(connected: boolean): void;
}) {
  let stopped = false,
    connected = false,
    failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let connection: AbortController | undefined;
  let flight: Promise<void> | undefined;
  let expedited = false;
  const stopActivity: (() => void)[] = [];
  const health = (value: boolean) => {
    if (connected === value) return;
    connected = value;
    options.health(value);
  };
  const schedule = (delay: number) => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(connect, delay);
  };
  const connect = () => {
    if (stopped || flight) return;
    connection = new AbortController();
    const signal = AbortSignal.any([options.signal, connection.signal]);
    let readyAt = 0;
    flight = (async () => {
      try {
        const response = await options.open(signal);
        await readNotifications(response, signal, (event) => {
          if (event === 'ready') {
            readyAt = Date.now();
            health(true);
          }
          signal.throwIfAborted();
          options.wake(event);
        });
      } catch {
        /* The bounded poll remains available; the owner presents operation failures. */
      } finally {
        connection?.abort();
        connection = undefined;
        health(false);
      }
    })().finally(() => {
      flight = undefined;
      if (stopped) return;
      // A stream that repeatedly sends ready and immediately closes must still back off.
      failures = readyAt && Date.now() - readyAt >= 10000 ? 0 : Math.min(failures + 1, 6);
      const delay = expedited ? 0 : Math.min(1000 * 2 ** failures, 30000) + Math.random() * 1000;
      expedited = false;
      schedule(delay);
    });
  };
  const resume = () => {
    if (stopped || pageRuntimePorts.activity.visibilityState() === 'hidden') return;
    options.wake('resume');
    if (connected) return;
    if (flight) {
      expedited = true;
      connection?.abort();
    } else schedule(0);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    connection?.abort();
    health(false);
    options.signal.removeEventListener('abort', stop);
    for (const stop of stopActivity.splice(0)) stop();
  };
  options.signal.addEventListener('abort', stop, { once: true });
  if (options.signal.aborted) stop();
  else {
    stopActivity.push(
      pageRuntimePorts.activity.onGlobal('online', resume),
      pageRuntimePorts.activity.onDocument('visibilitychange', resume),
    );
    schedule(0);
  }
  return {
    close: stop,
    dispose: async () => {
      stop();
      await flight;
    },
  };
}
