import { beginCustodyEnrollment, initializeContentStore, openJournalSession } from '@custody';
import { deriveStoreName } from '@store-name';
import { makeSource, checkRecovery, equal, PropertyViolation } from './oracle.ts';

const scope = {
  slotId: 'property-slot',
  principalId: 'property-principal',
  workspaceId: 'property-workspace',
};
const authority = { ...scope, resolvePrincipal: () => scope.principalId };
let model,
  sessions = [],
  armed,
  held,
  storageFault;
const count = (name) => {
  model.counts[name] = (model.counts[name] ?? 0) + 1;
};
const take = (name) => {
  if (armed !== name) return false;
  armed = undefined;
  count(`fault:${name}`);
  return true;
};
const gate = () =>
  new Promise((resolve) => {
    held = resolve;
  });
const parseFields = (input) => {
  const bytes = new Uint8Array(input),
    values = [];
  for (let i = 0; i < bytes.length;) {
    const length = bytes[i] * 256 + bytes[i + 1];
    i += 2;
    values.push(new TextDecoder().decode(bytes.subarray(i, i + length)));
    i += length;
  }
  return values;
};
const encrypt = SubtleCrypto.prototype.encrypt;
SubtleCrypto.prototype.encrypt = async function (p, k, b) {
  if (p.additionalData) {
    const fields = parseFields(p.additionalData);
    if (fields[0] === 'done/store/v1') {
      if (take('seal')) await gate();
      const identity = fields.slice(1, 7).join('/');
      equal('unique-encryption-reservation', model.invocations.includes(identity), false);
      model.invocations.push(identity);
    }
  }
  return encrypt.call(this, p, k, b);
};
const stateTx = new WeakSet(),
  deleteTx = new WeakSet();
const transaction = IDBDatabase.prototype.transaction;
IDBDatabase.prototype.transaction = function (...args) {
  const tx = transaction.apply(this, args);
  Object.defineProperty(tx, 'oncomplete', {
    configurable: true,
    set(fn) {
      tx.addEventListener('complete', async (e) => {
        // Native commit has happened. Only delivery to the owner is held.
        if ((stateTx.has(tx) && take('published')) || (deleteTx.has(tx) && take('deleted')))
          await gate();
        fn?.call(tx, e);
      });
    },
  });
  return tx;
};
for (const method of ['add', 'put', 'delete']) {
  const native = IDBObjectStore.prototype[method];
  IDBObjectStore.prototype[method] = function (value, ...args) {
    const content = this.name === 'content';
    if (content && value?.kind === 'state') stateTx.add(this.transaction);
    if (content && method === 'delete') deleteTx.add(this.transaction);
    const req = native.call(this, value, ...args);
    if (
      (this.name === 'meta' && value?.next_seq > 1 && take('abort-reserve')) ||
      (content && value?.kind === 'update' && take('abort-record')) ||
      (content && value?.kind === 'state' && take('abort-publish')) ||
      (content && method === 'delete' && take('abort-delete'))
    )
      req.addEventListener('success', () => this.transaction.abort());
    return req;
  };
}
for (const method of ['setItem', 'removeItem']) {
  const native = Storage.prototype[method];
  Storage.prototype[method] = function (...args) {
    if (storageFault === method)
      throw new DOMException('Injected storage failure', 'QuotaExceededError');
    return native.apply(this, args);
  };
}
const journal = () =>
  Object.fromEntries(
    Object.keys(localStorage)
      .sort()
      .map((k) => [k, localStorage.getItem(k)]),
  );
const disk = async () => {
  const name = await deriveStoreName(scope.principalId, scope.workspaceId);
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const rows = {},
        tx = db.transaction([...db.objectStoreNames]);
      for (const name of db.objectStoreNames) {
        rows[name] = [];
        const r = tx.objectStore(name).openCursor();
        r.onsuccess = () => {
          const c = r.result;
          if (c) {
            rows[name].push({ key: c.key, value: c.value });
            c.continue();
          }
        };
      }
      tx.oncomplete = () => resolve(rows);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};
const serialize = (rows) =>
  JSON.stringify(rows, (_key, value) => (value instanceof Uint8Array ? [...value] : value));
const errorInfo = (error) => ({
  type: error instanceof PropertyViolation ? 'property' : 'harness',
  invariant: error.invariant,
  actual: error.actual,
  expected: error.expected,
  code: error.code,
  message: error.message,
  stack: error.stack,
});
const reopen = async () => {
  await Promise.all(sessions.map((s) => s.close()));
  sessions = [];
  for (let i = 0; i < 2; i++) sessions.push(await openJournalSession(authority, model.code));
  count('reopen');
};
const idsOf = (ids) => ids.map((n) => n % model.source.updates.length);
const accept = (ids) => {
  model.accepted = [...new Set([...model.accepted, ...ids])];
};
const batch = (ids) =>
  ids.map((id) => ({ kind: 'update', bytes: new Uint8Array(model.source.updates[id]) }));
const check = async (actor = 0) => {
  const r = await sessions[actor].loadRecovery();
  try {
    model.comparisons += checkRecovery(model.source, model.accepted, [
      ...r.records.filter((r) => r.kind === 'update' || r.kind === 'state').map((r) => r.bytes),
      ...r.journal.map((r) => r.bytes),
    ]);
  } finally {
    for (const row of [...r.records, ...r.journal]) row.bytes.fill(0);
  }
  const rows = await disk(),
    counter = rows.meta[0].value;
  equal('reservation-never-rewinds', counter.next_seq >= model.nextSeq, true);
  equal(
    'reservation-accounting',
    counter.next_seq - 1,
    Object.values(counter.reserved).reduce((n, v) => n + v, 0),
  );
  equal('encryption-budget', counter.next_seq - 1 >= model.invocations.length, true);
  model.nextSeq = counter.next_seq;
  const seen = new Set();
  for (const name of ['content', 'heads', 'outbound'])
    for (const r of rows[name]) {
      equal('unique-record-sequence', seen.has(r.key), false);
      equal('record-reserved', r.key < counter.next_seq, true);
      seen.add(r.key);
    }
  equal(
    'retained-auxiliary',
    serialize({ heads: rows.heads, outbound: rows.outbound }),
    model.auxiliary,
  );
  count('recovery');
};
const canCompact = async () => {
  const rows = (await disk()).content;
  return rows.length > 0 && !(rows.length === 1 && rows[0].value.kind === 'state');
};
const simple = async (command, actor = 0) => {
  const s = sessions[actor],
    ids = idsOf(command.ids ?? [command.id ?? 0]);
  count(command.op);
  if (command.op === 'disk') {
    await s.appendBatch(batch(ids));
    accept(ids);
  } else if (command.op === 'journal') {
    equal('small-journal-admitted', s.appendLocal(batch(ids)[0].bytes).status, 'journalled');
    accept([ids[0]]);
  } else if (command.op === 'flush') await s.flushJournal();
  else if (command.op === 'compact') {
    const before = journal();
    await s.compactContent();
    equal('compaction-keeps-journal', journal(), before);
  } else throw Error('Unknown simple command: ' + command.op);
};
const holdOperation = async (boundary, fn) => {
  armed = boundary;
  let settled = false;
  const pending = fn().then(
    (value) => {
      settled = true;
      return { value };
    },
    (error) => {
      settled = true;
      return { error };
    },
  );
  // Timeout is a harness error, never a property counterexample or a detected mutant.
  const deadline = performance.now() + 5000;
  while (!held && !settled && performance.now() < deadline)
    await new Promise((r) => setTimeout(r, 0));
  if (!held) {
    if (settled) {
      const result = await pending;
      if (['retained', 'unchanged'].includes(result.value?.status)) {
        armed = undefined;
        return { pending, release() {}, skipped: true };
      }
    }
    throw Error(`Expected ${boundary} boundary was not reached (settled=${settled})`);
  }
  const release = held;
  held = undefined;
  return { pending, release };
};
const overlap = async (command) => {
  const kind = command.background;
  if (
    (kind === 'compact' && !(await canCompact())) ||
    (kind === 'flush' && !Object.keys(journal()).length)
  ) {
    count('overlap-inapplicable');
    for (const c of command.during) await simple(c, 1);
    return;
  }
  const boundary = kind === 'compact' ? command.boundary : 'seal';
  const ids = idsOf(command.ids);
  const { pending, release, skipped } = await holdOperation(boundary, () =>
    kind === 'disk'
      ? sessions[0].appendBatch(batch(ids))
      : kind === 'flush'
        ? sessions[0].flushJournal()
        : sessions[0].compactContent(),
  );
  if (skipped) {
    count('overlap-deferred');
    for (const c of command.during) await simple(c, 1);
    return;
  }
  count(`overlap:${kind}:${boundary}:${command.finish}`);
  for (const c of command.during) await simple(c, 1);
  await check(1);
  if (command.finish === 'crash') return { crash: true, model };
  const closing = command.finish === 'close' ? sessions[0].close() : null;
  release();
  const result = await pending;
  if (closing) {
    await closing;
    equal('closed-owner-state', sessions[0].state, 'closed');
    // After native deletion completion, close can race only the receipt; either outcome is safe.
    if (boundary !== 'deleted') equal('closed-owner-no-success', Boolean(result.error), true);
    await reopen();
  } else {
    if (result.error) throw result.error;
    if (kind === 'disk') accept(ids);
  }
};
// A generated two-operation overlap can commit an earlier reservation after replacement publication.
const late = async (c) => {
  const ids = idsOf(c.ids);
  const append = await holdOperation('seal', () => sessions[0].appendBatch(batch(ids)));
  await simple({ op: 'disk', ids: c.after }, 1);
  const trim = await holdOperation('published', () => sessions[1].compactContent());
  append.release();
  const written = await append.pending;
  if (written.error) throw written.error;
  accept(ids);
  trim.release();
  const compacted = await trim.pending;
  if (compacted.error) throw compacted.error;
  count(trim.skipped ? 'late-deferred' : 'late-reservation');
};
const step = async (c) => {
  if (['disk', 'journal', 'flush', 'compact'].includes(c.op)) await simple(c);
  else if (c.op === 'overlap') {
    const r = await overlap(c);
    if (r) return r;
  } else if (c.op === 'late') await late(c);
  else if (c.op === 'reopen') await reopen();
  else if (c.op === 'quota') {
    const before = journal();
    storageFault = 'setItem';
    try {
      equal(
        'quota-refused',
        sessions[0].appendLocal(batch(idsOf([c.id]))[0].bytes).status,
        'refused',
      );
    } finally {
      storageFault = undefined;
    }
    equal('quota-keeps-journal', journal(), before);
    count('quota');
  } else if (c.op === 'remove-failure') {
    const before = journal();
    storageFault = 'removeItem';
    try {
      await sessions[0].flushJournal();
    } finally {
      storageFault = undefined;
    }
    equal('failed-removal-keeps-journal', journal(), before);
    count('remove-failure');
  } else if (c.op === 'abort') {
    const compact = ['publish', 'delete'].includes(c.at);
    if (!compact || (await canCompact())) {
      const before = await disk();
      armed = `abort-${c.at}`;
      const result = await (
        compact ? sessions[0].compactContent() : sessions[0].appendBatch(batch(idsOf(c.ids)))
      ).then(
        (value) => ({ success: true, value }),
        (e) => ({ error: e }),
      );
      if (armed && compact && ['retained', 'unchanged'].includes(result.value?.status)) {
        armed = undefined;
        equal('deferred-trim-keeps-disk', serialize(await disk()), serialize(before));
        count('abort-deferred');
        await check();
        return { counts: model.counts, comparisons: model.comparisons };
      }
      if (armed) throw Error('Abort injection was not reached: ' + armed);
      equal('aborted-operation-no-receipt', result.success === true, false);
      equal('abort-is-storage-failure', result.error?.code, 'storage-failed');
      const after = (await disk()).content;
      for (const row of before.content)
        equal('abort-keeps-input', serialize(after.find((r) => r.key === row.key)), serialize(row));
    } else count('abort-inapplicable');
  } else throw Error('Unknown command: ' + c.op);
  await check();
  return { counts: model.counts, comparisons: model.comparisons };
};
window.properties = {
  async start(history) {
    model = {
      source: makeSource(history.edits),
      accepted: [],
      invocations: [],
      nextSeq: 1,
      comparisons: 0,
      counts: {},
    };
    const enrollment = beginCustodyEnrollment(authority, { checkCreation() {} });
    model.code = enrollment.displayCode;
    await enrollment.confirm(model.code);
    await initializeContentStore(authority, model.code, { checkCreation() {} });
    await reopen();
    await sessions[0].appendBatch([
      { kind: 'heads', bytes: new Uint8Array([11, 22]) },
      { kind: 'outbound', bytes: new Uint8Array([33, 44]) },
    ]);
    const rows = await disk();
    model.auxiliary = serialize({ heads: rows.heads, outbound: rows.outbound });
    await check();
  },
  async resume(saved) {
    try {
      model = saved;
      await reopen();
      await check();
      count('renderer-crash');
      return {};
    } catch (error) {
      return { error: errorInfo(error) };
    }
  },
  async step(c) {
    try {
      return await step(c);
    } catch (error) {
      return { error: errorInfo(error) };
    }
  },
  async finish() {
    try {
      await reopen();
      await check();
      // Maintenance must resume when the full semantic basis is actually on disk.
      const missing = model.source.updates
        .map((_, i) => i)
        .filter((i) => !model.accepted.includes(i));
      if (missing.length) {
        await sessions[0].appendBatch(batch(missing));
        accept(missing);
      }
      await sessions[0].flushJournal();
      const r = await sessions[0].compactContent();
      equal('complete-basis-compacts', ['compacted', 'unchanged'].includes(r.status), true);
      count('eventual-compaction');
      await reopen();
      await check();
      return { counts: model.counts, comparisons: model.comparisons };
    } catch (error) {
      return { error: errorInfo(error) };
    }
  },
};
