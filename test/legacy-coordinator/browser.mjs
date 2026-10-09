import '../legacy-cleanup/browser.mjs';
import { describeError } from '../legacy-import/error.mjs';
import { createLegacyCoordinator } from '../../src/crdt/legacyCoordinator';
import { replayLegacyExport } from '../../src/crdt/legacyExport';
import { withExclusiveSlot } from '../../src/crdt/writeSession';
const inherited = window.cleanupFixture,
  slot = 'seeded-import';
let owner = createLegacyCoordinator(slot),
  ceremony,
  fault,
  trigger = false,
  gated = false,
  release;
let observedAbort = null,
  point = null,
  removals = 0,
  requests = 0,
  operation,
  settled = true,
  closing,
  progress;
let competing = false,
  competitor;
const workspace = {
  identity: {
    id: 'coordinator-human',
    actor: { kind: 'human', name: 'Human', color: '#000000' },
    device: { id: 'coordinator-device', name: 'Device' },
  },
  validateReceive: () => {},
  today: () => '2026-01-01',
};
const decode = (input) =>
  input ? { ...input, recovery: new Uint8Array(input.recovery) } : undefined;
const pause = async () => {
  gated = true;
  await new Promise((resolve) => {
    release = resolve;
  });
  gated = false;
};
const resume = () => {
  trigger = false;
  const r = release;
  release = null;
  r?.();
};
const run = async (fn) => {
  try {
    const value = await fn();
    await new Promise((r) => setTimeout(r, 0));
    if (trigger) await pause();
    return { status: 'ok', value };
  } catch (e) {
    return {
      status: 'refused',
      reason: e?.reason ?? e?.disposition?.reason ?? e?.code ?? e?.name,
      error: describeError(e),
    };
  }
};
const boundary = (store, value, key) => {
  if (store.name === 'slots' && value?.id === slot) return 'index';
  if (store.name === 'content') return 'slice';
  if (store.name === 'meta' && key === 'counter')
    return value.next_seq === 1 ? 'counter' : 'reservation';
  if (store.name !== 'entries' || !Array.isArray(key)) return null;
  if (key[1] === 'legacy-import-v1')
    return value.stage === 'custody' ? 'claim' : `import-${value.stage}`;
  if (key[1] === 'local-genesis-v1' && value.imported)
    return value.sourceCleanup ? `cleanup-${value.sourceCleanup.next}` : 'decision';
  if (key[3] === 'content-v1') return `witness-${value.state}`;
  if (key.length === 3 && value.state === 'protected') return 'custody';
  if (key[1] === 'local-clear-v1') return `clear-${value.stage}`;
  return null;
};
for (const method of ['add', 'put']) {
  const native = IDBObjectStore.prototype[method];
  IDBObjectStore.prototype[method] = function (value, key) {
    const r = native.call(this, value, key),
      p = boundary(this, value, key),
      tx = this.transaction;
    if (p && fault === `abort-${p}`) {
      fault = null;
      r.addEventListener(
        'success',
        () => {
          tx.abort();
          observedAbort = p;
        },
        { once: true },
      );
    }
    if (p && fault === `kill-${p}`)
      tx.addEventListener(
        'complete',
        () => {
          point = p;
          trigger = true;
        },
        { once: true },
      );
    return r;
  };
}
const nativeDelete = indexedDB.deleteDatabase.bind(indexedDB);
indexedDB.deleteDatabase = (name) => {
  const r = nativeDelete(name);
  if (name === 'done' && fault === 'kill-database')
    r.addEventListener(
      'success',
      () => {
        point = 'database';
        trigger = true;
      },
      { once: true },
    );
  return r;
};
const nativeRemove = Storage.prototype.removeItem;
Storage.prototype.removeItem = function (key) {
  const value = nativeRemove.call(this, key);
  if (
    /^done\.pending-update\.done\.fixture\./u.test(key) ||
    ['done.actor', 'done.device', 'done.sync', 'done.sync.last'].includes(key)
  ) {
    if (fault === `kill-remove-${removals}`) {
      point = `remove-${removals}`;
      trigger = true;
    }
    removals++;
  }
  return value;
};
for (const method of ['encrypt', 'decrypt', 'sign', 'verify', 'digest']) {
  const native = crypto.subtle[method].bind(crypto.subtle);
  crypto.subtle[method] = async (...args) => {
    if (trigger) await pause();
    return native(...args);
  };
}
const nativeRequest = navigator.locks.request.bind(navigator.locks);
navigator.locks.request = async (name, options, fn) => {
  if (++requests === 2 && fault === 'park-dispatch') {
    point = 'dispatch';
    await pause();
  }
  return nativeRequest(name, options, fn);
};
const advance = (action, code, input, maxSlices = 32) =>
  owner.advance(action, code, decode(input), {
    maxSlices,
    workspace,
    onProgress: (value) => {
      progress = value;
    },
  });
window.coordinatorFixture = {
  ...inherited,
  prepare: (s) => inherited.prepare(s),
  capture: () =>
    run(async () => {
      const r = await owner.capture();
      return {
        recovery: [...r.recovery],
        recoveryDigest: r.recoveryDigest,
        sourceOrigin: location.origin,
        sourceDigest: r.sourceDigest,
        policy: 'markdown-system-v1',
      };
    }),
  replay: (input) =>
    run(() => replayLegacyExport(new Uint8Array(input.recovery), input.recoveryDigest)),
  inspect: (code, input) => run(() => owner.inspect(code, decode(input))),
  enroll: (input, slices = 1) =>
    run(() => {
      ceremony = owner.enroll(decode(input), slices);
      return ceremony.displayCode;
    }),
  confirm: (code) => run(() => ceremony.confirm(code)),
  advance: (action, code, input, slices) => run(() => advance(action, code, input, slices)),
  otherAdvance: (action, code, input) =>
    run(async () => {
      const c = createLegacyCoordinator(slot);
      try {
        return await c.advance(action, code, decode(input), { maxSlices: 32, workspace });
      } finally {
        await c.close();
      }
    }),
  fault: (value) => {
    fault = value;
    trigger = false;
    gated = false;
    point = null;
    observedAbort = null;
    removals = 0;
    requests = 0;
  },
  gated: () => gated,
  observedAbort: () => observedAbort,
  resumeGate: resume,
  start: (action, code, input, slices) => {
    settled = false;
    operation = run(() =>
      action === 'confirm' ? ceremony.confirm(code) : advance(action, code, input, slices),
    ).then((r) => {
      settled = true;
      return r;
    });
  },
  result: async () => operation,
  cancel: () => {
    closing = owner.close();
    resume();
    return true;
  },
  drained: async () => {
    await closing;
    return { state: owner.state };
  },
  state: () => ({ state: owner.state, settled, gated, point, progress, competing }),
  replaceOwner: async () => {
    await owner.close();
    owner = createLegacyCoordinator(slot);
  },
  compete: () => {
    competing = false;
    competitor = withExclusiveSlot(slot, () => {
      competing = true;
    });
  },
  finishCompetitor: async () => competitor,
};
