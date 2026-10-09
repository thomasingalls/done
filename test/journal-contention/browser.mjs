import '../workspace-admission/browser.mjs';
import { openJournalSession } from '@custody';
import { startupRefusal } from '@startup';

const scope = {
  slotId: 'content-slot',
  principalId: 'content-principal',
  workspaceId: 'content-workspace',
};
const authority = { ...scope, resolvePrincipal: () => scope.principalId };
const nativeKeys = Object.keys,
  nativeTimer = globalThis.setTimeout,
  nativeClear = globalThis.clearTimeout;
const entries = {},
  held = new Set();
let peer,
  probe,
  controller,
  plan,
  first = true,
  attempts = 0,
  inserted = 0,
  holdRetry = false;
const prefix = 'done.pending-update.';
const failure = (e) => ({
  code: typeof e.code === 'string' ? e.code : e.name,
  message: e.message,
  disposition: startupRefusal(e),
});
const track = (id, fn) => {
  entries[id] = { status: 'pending' };
  void Promise.resolve()
    .then(fn)
    .then(
      (value) => {
        entries[id] = { status: 'resolved', value };
      },
      (e) => {
        entries[id] = { status: 'rejected', error: failure(e) };
      },
    );
};
Object.keys = function (value) {
  const result = nativeKeys(value);
  if (value === localStorage && plan) {
    if (first) {
      attempts++;
      if (plan.fatal && attempts === 2) window.journal.fault('read-unavailable');
      if (plan.pause) {
        plan.pause = false;
        // eslint-disable-next-line no-debugger -- Pin the cross-tab capture boundary, never alter storage results.
        debugger;
      } else if (inserted < plan.changes) {
        const accepted = peer.appendLocal(Uint8Array.from([0, 0]));
        if (accepted.status !== 'journalled') throw Error('Fixture peer append refused');
        inserted++;
      }
    }
    first = !first;
  }
  return result;
};
globalThis.setTimeout = function (callback, delay, ...args) {
  // Extend only the retry timer so close/abort can be tested while native timer work is outstanding.
  if (holdRetry && (delay === 0 || delay === 8) && new Error().stack.includes('journalStore')) {
    holdRetry = false;
    const timer = nativeTimer(callback, 60000, ...args);
    held.add(timer);
    return timer;
  }
  return nativeTimer(callback, delay, ...args);
};
globalThis.clearTimeout = function (timer) {
  held.delete(timer);
  return nativeClear(timer);
};
const inventory = () =>
  Object.fromEntries(
    nativeKeys(localStorage)
      .filter((key) => key.startsWith(prefix))
      .sort()
      .map((key) => [key, localStorage.getItem(key)]),
  );
const recoveryValue = (result) => {
  try {
    return {
      records: result.records.map((r) => ({ ...r, bytes: Array.from(r.bytes) })),
      journal: result.journal.map((r) => ({ ...r, bytes: Array.from(r.bytes) })),
    };
  } finally {
    for (const r of [...result.records, ...result.journal]) r.bytes.fill(0);
  }
};
window.contention = {
  async peer(code) {
    peer = await openJournalSession(authority, code);
  },
  async closePeer() {
    await peer?.close();
    peer = undefined;
  },
  arm(changes, pause = false, hold = false, fatal = false) {
    plan = { changes, pause, fatal };
    attempts = 0;
    inserted = 0;
    first = true;
    holdRetry = hold;
  },
  disarm() {
    plan = undefined;
    holdRetry = false;
  },
  snapshot: () => ({
    entries,
    attempts,
    inserted,
    held: held.size,
    journal: inventory(),
    encryptions: window.content.snapshot().encryptions,
  }),
  recover: (id) => track(id, async () => recoveryValue(await peer.loadRecovery())),
  append: () => peer.appendLocal(Uint8Array.from([0, 0])),
  flush: (id) => track(id, () => peer.flushJournal()),
  open: (id, code) =>
    track(id, async () => {
      controller = new AbortController();
      probe = await openJournalSession(authority, code, { signal: controller.signal });
      return { storeId: probe.storeId };
    }),
  cancelOpen() {
    controller.abort();
  },
  closeProbe: (id) =>
    track(id, async () => {
      await probe?.close();
      probe = undefined;
    }),
  async closeAll() {
    plan = undefined;
    await probe?.close();
    await peer?.close();
  },
};
