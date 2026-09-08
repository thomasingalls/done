import '../journal/browser.mjs';
import { openAdmissionSession, MAX_PENDING_BYTES } from '@admission';
import * as Y from 'yjs';
const scope = {
  slotId: 'content-slot',
  principalId: 'content-principal',
  workspaceId: 'content-workspace',
};
const authority = { ...scope, resolvePrincipal: () => scope.principalId };
const sessions = new Map(),
  entries = {},
  prepared = [],
  events = [],
  projections = new Map();
let mode = 'append',
  rejectReceive = false,
  afterFirstGate = false,
  commits = 0;
const bytes = (v) => (typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v));
const text = (v) => new TextDecoder().decode(v);
const failure = (e) => ({ code: e.code ?? e.name, message: e.message });
const track = (id, operation) => {
  entries[id] = { status: 'pending' };
  try {
    Promise.resolve(operation()).then(
      (value) => {
        entries[id] = { status: 'resolved', value };
      },
      (error) => {
        entries[id] = { status: 'rejected', error: failure(error) };
      },
    );
  } catch (error) {
    entries[id] = { status: 'rejected', error: failure(error) };
  }
};
// Observe completion before the carrier installs its promise-settling listener.
// Chromium can run microtasks between listeners for the same native event.
const transactions = new WeakSet();
const nativeTransaction = IDBDatabase.prototype.transaction;
IDBDatabase.prototype.transaction = function (...args) {
  const tx = nativeTransaction.apply(this, args);
  tx.addEventListener('complete', () => {
    if (transactions.has(tx)) commits++;
  });
  return tx;
};
const contentAdd = IDBObjectStore.prototype.add;
IDBObjectStore.prototype.add = function (value, ...args) {
  const result = contentAdd.call(this, value, ...args);
  if (this.name === 'content') transactions.add(this.transaction);
  return result;
};
const snapshot = () => ({
  entries,
  prepared,
  events,
  commits,
  sessions: Object.fromEntries(
    [...sessions].map(([id, s]) => {
      let visible;
      try {
        const d = new Y.Doc();
        Y.applyUpdate(d, s.snapshot());
        visible = d.getText('text').toString();
        d.destroy();
      } catch (error) {
        visible = failure(error);
      }
      return [
        id,
        { status: s.status, visible, projection: projections.get(id).getText('text').toString() },
      ];
    }),
  ),
  storage: window.journal.snapshot(),
  base: window.content.snapshot(),
});
window.admission = {
  base: window.content,
  journal: window.journal,
  snapshot,
  open: (id, code) =>
    track(id, async () => {
      const s = await openAdmissionSession(authority, code, {
        prepare(draft, input) {
          const t = draft.getText('text'),
            value = text(input);
          prepared.push({ before: t.toString(), bytes: input.length });
          if (mode === 'throw') throw Error('fixture command error');
          if (mode === 'oversize') {
            t.insert(t.length, 'X'.repeat(17000));
            return;
          }
          if (mode === 'slice') {
            t.insert(t.length, value.slice(0, 1000));
            if (value.length > 1000) return { remaining: bytes(value.slice(1000)) };
            return;
          }
          t.insert(t.length, value);
        },
        validateReceive() {
          if (rejectReceive) throw Error('fixture authority refusal');
        },
      });
      sessions.set(id, s);
      const projection = new Y.Doc();
      Y.applyUpdate(projection, s.snapshot());
      projections.set(id, projection);
      s.subscribe((e) => {
        Y.applyUpdate(projection, e.update);
        events.push({
          source: e.source,
          revision: e.revision,
          commits,
          bytes: Array.from(e.update),
        });
        if (afterFirstGate && e.revision === 1) window.content.fault('gate-sealed');
      });
      return s.status;
    }),
  submit: (id, value, mutate = false) => {
    const b = bytes(value);
    track(id, () => sessions.get('s').submit(b).accepted);
    if (mutate) b.fill(88);
    return snapshot();
  },
  receive: (id, value) => {
    track(id, () => sessions.get('s').receive(bytes(value)).accepted);
    return snapshot();
  },
  durable: (id) => track(id, () => sessions.get('s').whenDurable()),
  retry: () => sessions.get('s').retry(),
  discard: () => {
    try {
      sessions.get('s').discardPending();
      return { ok: true };
    } catch (e) {
      return failure(e);
    }
  },
  close: (id, session = 's') => track(id, () => sessions.get(session).close()),
  capacity: () => {
    try {
      sessions.get('s').submit(new Uint8Array(MAX_PENDING_BYTES));
      return { accepted: true };
    } catch (e) {
      return failure(e);
    }
  },
  mode: (v) => {
    mode = v;
  },
  rejectReceive: (v) => {
    rejectReceive = v;
  },
  afterFirstGate: () => {
    afterFirstGate = true;
  },
  structs: () => {
    const d = new Y.Doc(),
      updates = [];
    d.on('update', (u) => updates.push(Array.from(u)));
    d.getText('text').insert(0, 'R');
    d.getText('text').insert(1, 'L');
    d.destroy();
    return updates;
  },
  deletes: () => {
    const d = new Y.Doc(),
      updates = [];
    d.on('update', (u) => updates.push(Array.from(u)));
    d.getText('text').insert(0, 'ABCDE');
    d.getText('text').delete(0, 5);
    d.destroy();
    return updates;
  },
};
