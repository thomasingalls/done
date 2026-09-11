import { openWriteSession, withExclusiveSlot, slotPermitName } from '@write-session';

// Synthetic cache and writes exercise the production lifecycle; they do not
// implement factor custody, encrypted-store admission, or generation retirement.
export function fixture() {
  const entries = new Map(),
    gates = new Map(),
    saved = new Map();
  const events = [],
    writes = [];
  const record = (kind, data = {}) => events.push({ order: events.length, kind, ...data });
  const hold = (name) => {
    if (gates.has(name)) throw Error('Duplicate gate: ' + name);
    record('gate', { name });
    return new Promise((resolve) => gates.set(name, resolve));
  };
  const entry = (id) => {
    if (!entries.has(id)) throw Error('Missing fixture entry: ' + id);
    return entries.get(id);
  };
  const begin = (id, kind, work) => {
    const e = entry(id);
    const operation = (e.operations[kind] = { status: 'pending' });
    void Promise.resolve()
      .then(work)
      .then(
        (value) => {
          operation.status = 'resolved';
          operation.value = value ?? null;
        },
        (error) => {
          operation.status = 'rejected';
          operation.error = { name: error.name, code: error.code ?? null, message: error.message };
        },
      );
  };
  const append = (captured) => {
    if (!captured?.key) throw Error('Probe has no loaded key');
    writes.push(captured.generation);
    // A real synchronous browser storage effect behind the production guard.
    globalThis.localStorage?.setItem('phase-one-writes', JSON.stringify(writes));
    record('write', { generation: captured.generation });
  };
  const generation = () => Number(globalThis.localStorage?.getItem('phase-one-generation') ?? 1);
  const options = (id, flags = {}) => {
    const e = entry(id);
    return {
      signal: e.controller.signal,
      initialize: async (scope) => {
        e.initializations++;
        record('initialize', { id, locks: await navigator.locks.query() });
        e.cache = await scope.wait(async () => {
          if (flags.initializeGate) await hold(id + ':initialize');
          const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
            'encrypt',
          ]);
          return { generation: generation(), key };
        });
        record('cache-loaded', { id });
        if (flags.initializeFail)
          throw Error('Injected initialization failure after loading a key');
      },
      dispose: async () => {
        e.disposals++;
        record('dispose-start', { id });
        if (flags.disposeGate) await hold(id + ':dispose');
        if (flags.disposeFail) throw Error('Injected cleanup failure');
        e.cache = null;
        record('cache-cleared', { id });
      },
    };
  };
  const create = (id) => {
    if (entries.has(id)) throw Error('Duplicate session id: ' + id);
    entries.set(id, {
      controller: new AbortController(),
      cache: null,
      initializations: 0,
      disposals: 0,
      operations: {},
    });
  };
  return {
    open(id, slot = 'slot', flags = {}) {
      create(id);
      begin(id, 'open', async () => {
        entry(id).session = await openWriteSession(slot, options(id, flags));
      });
    },
    exclusive(id, slot = 'slot', flags = {}) {
      create(id);
      begin(id, 'exclusive', () =>
        withExclusiveSlot(
          slot,
          async (scope) => {
            const e = entry(id);
            e.entered = true;
            record('exclusive-enter', { id });
            if (flags.generation !== undefined)
              scope.step(() =>
                localStorage.setItem('phase-one-generation', String(flags.generation)),
              );
            if (flags.hold) await scope.wait(() => hold(id + ':exclusive'));
            if (flags.fail) throw Error('Injected exclusive operation failure');
            return generation();
          },
          options(id, flags),
        ),
      );
    },
    close(id) {
      begin(id, 'close', () => entry(id).session.close());
    },
    abort(id) {
      entry(id).controller.abort();
    },
    block(id, detached = false) {
      const e = entry(id),
        captured = e.cache;
      begin(id, 'work', () =>
        e.session.run(async (scope) => {
          const work = scope.wait(() => hold(id + ':work'));
          if (detached) {
            void work;
            return;
          }
          await work;
          scope.step(() => append(captured));
        }),
      );
    },
    async save(id) {
      const e = entry(id),
        captured = e.cache;
      await e.session.run((scope) => {
        saved.set(id, () => scope.step(() => append(captured)));
      });
    },
    invokeSaved(id) {
      try {
        saved.get(id)();
        return 'wrote';
      } catch (error) {
        return error.code ?? error.message;
      }
    },
    write(id) {
      const e = entry(id);
      try {
        e.session.write(() => append(e.cache));
        return 'wrote';
      } catch (error) {
        return error.code ?? error.message;
      }
    },
    abortReentry(id) {
      const e = entry(id);
      e.session.signal.addEventListener(
        'abort',
        () => {
          try {
            e.session.write(() => append(e.cache));
            e.abortWrite = 'wrote';
          } catch (error) {
            e.abortWrite = error.code;
          }
        },
        { once: true },
      );
    },
    release(name) {
      const resolve = gates.get(name);
      if (!resolve) throw Error('Gate was not reached: ' + name);
      gates.delete(name);
      record('gate-release', { name });
      resolve();
    },
    snapshot() {
      return {
        entries: Object.fromEntries(
          [...entries].map(([id, e]) => [
            id,
            {
              state: e.session?.state ?? null,
              aborted: e.controller.signal.aborted || e.session?.signal.aborted || false,
              operations: e.operations,
              entered: e.entered ?? false,
              initializations: e.initializations,
              disposals: e.disposals,
              hasCache: e.cache !== null,
              generation: e.cache?.generation ?? null,
              abortWrite: e.abortWrite ?? null,
            },
          ]),
        ),
        events,
        writes,
        gates: [...gates.keys()],
        persistedWrites: globalThis.localStorage?.getItem('phase-one-writes') ?? null,
      };
    },
    locks: () => navigator.locks.query(),
    name: slotPermitName,
  };
}
