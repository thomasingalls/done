import { encodeImportSlice } from '../../src/crdt/legacyImportPlan';
import { beginLegacyImport, resumeLegacyImport } from '../../src/crdt/legacyImport';
import { captureLegacyExport } from '../../src/crdt/legacyExport';
import { inspectLegacySource } from '../../src/crdt/legacySource';
import { withExclusiveSlot } from '../../src/crdt/writeSession';
import { readImportClaim, importScope } from '../../src/crdt/legacyImportRecord';
import { withPreactiveContentUnderPermit, openContentSession } from '../../src/crdt/custody';
import { inspectLocalStartup, beginLocalGenesis } from '../../src/crdt/localGenesis';
import { deriveStoreName } from '../../src/crdt/storeName';
import { openSlotIndex } from '../../src/crdt/slotIndex';
import { Y } from '../../src/crdt/yjs';
import { exportEntries } from '../../src/crdt/export';
import { cardBody, unfiledCards } from '../../src/crdt/days';
import { makeExportSource } from '../legacy-export/source';
import { seed } from '../legacy-source/fixture';
const slot = 'seeded-import';
const enumerate = indexedDB.databases.bind(indexedDB);
indexedDB.databases = () => {
  throw Error('Production database enumeration');
};
let ceremony,
  fault = null,
  gate = false,
  trigger = false;
const pause = async () => {
  gate = true;
  await new Promise(() => {});
};
const run = async (operation) => {
  try {
    const value = await operation();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (trigger && fault?.startsWith('kill-')) await pause();
    return { status: 'ok', value };
  } catch (e) {
    return { status: 'refused', reason: e.reason ?? e.disposition?.reason ?? e.code ?? e.name };
  }
};
const nativeAdd = IDBObjectStore.prototype.add,
  nativePut = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.add = function (value, key) {
  const req = nativeAdd.call(this, value, key),
    tx = this.transaction;
  const claim = this.name === 'entries' && Array.isArray(key) && key[1] === 'legacy-import-v1';
  const slice = this.name === 'content';
  if (this.name === 'meta' && key === 'counter' && fault === 'kill-content-counter')
    tx.addEventListener(
      'complete',
      () => {
        trigger = true;
      },
      { once: true },
    );
  if ((claim && fault === 'abort-claim') || (slice && fault === 'abort-slice')) {
    fault = null;
    req.addEventListener('success', () => tx.abort(), { once: true });
  }
  if ((claim && fault === 'kill-claim') || (slice && fault === 'kill-slice'))
    tx.addEventListener(
      'complete',
      () => {
        trigger = true;
      },
      { once: true },
    );
  return req;
};
IDBObjectStore.prototype.put = function (value, key) {
  const req = nativePut.call(this, value, key),
    tx = this.transaction;
  if (
    this.name === 'entries' &&
    Array.isArray(key) &&
    ((key.length === 3 && value.state === 'protected' && fault === 'kill-custody-complete') ||
      (key[1] === 'legacy-import-v1' && fault === `kill-progress-${value.stage}`) ||
      (key[3] === 'content-v1' && value.state === 'creating' && fault === 'kill-content-witness') ||
      (key[3] === 'content-v1' && value.state === 'ready' && fault === 'kill-witness-ready'))
  )
    tx.addEventListener(
      'complete',
      () => {
        trigger = true;
      },
      { once: true },
    );
  if (
    this.name === 'meta' &&
    key === 'counter' &&
    value.next_seq > 1 &&
    fault === 'kill-reservation'
  )
    tx.addEventListener(
      'complete',
      () => {
        trigger = true;
      },
      { once: true },
    );
  return req;
};
for (const method of ['encrypt', 'decrypt', 'sign', 'verify']) {
  const native = crypto.subtle[method].bind(crypto.subtle);
  crypto.subtle[method] = async (...args) => {
    if (trigger && fault?.startsWith('kill-')) await pause();
    return native(...args);
  };
}
const decode = (input) => ({ ...input, recovery: new Uint8Array(input.recovery) });
const observation = () =>
  withExclusiveSlot('source-read', async (task) => (await inspectLegacySource(task)).digest);
const serialize = (value) =>
  JSON.stringify(value, (_k, v) => (v instanceof Uint8Array ? { bytes: Array.from(v) } : v));
const dump = async () => {
  const names = (await enumerate()).map((d) => d.name).sort(),
    output = {};
  for (const name of names) {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const rows = [];
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction([...db.objectStoreNames], 'readonly');
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
        for (const store of db.objectStoreNames) {
          const req = tx.objectStore(store).openCursor();
          req.onsuccess = () => {
            const c = req.result;
            if (c) {
              rows.push([store, c.key, c.value]);
              c.continue();
            }
          };
        }
      });
    } finally {
      db.close();
    }
    output[name] = rows;
  }
  return {
    names,
    databases: serialize(output),
    local: Object.keys(localStorage)
      .sort()
      .map((k) => [k, localStorage.getItem(k)]),
  };
};
window.importFixture = {
  receiptStress: () =>
    run(async () => {
      const actions = [{ kind: 'init' }];
      for (let i = 0; i < 2600; i++)
        actions.push({ kind: 'card', index: i, date: null, section: null });
      const plan = {
        binding: {
          policy: 'markdown-system-v1',
          recoveryDigest: 'a'.repeat(64),
          sourceDigest: 'b'.repeat(64),
          sourceOrigin: location.origin,
          planDigest: 'c'.repeat(64),
        },
        actions,
        entries: [],
        unfiled: [],
      };
      const doc = new Y.Doc({ gc: false });
      let maximum = 0;
      try {
        for (let i = 0; i < actions.length; i++) {
          doc.clientID = 100000000 + i;
          maximum = Math.max(
            maximum,
            encodeImportSlice(doc, plan, 'd'.repeat(32), '2026-09-09T00:00:00.000Z', i).length,
          );
        }
        return { maximum, slices: actions.length };
      } finally {
        doc.destroy();
      }
    }),
  prepare: async ({ input, disk = [0], wal = [1, 2] }) => {
    const source = makeExportSource(input);
    try {
      await seed(disk, wal, source.updates);
    } finally {
      source.doc.destroy();
    }
    const result = await withExclusiveSlot('capture', (task) =>
      captureLegacyExport(task, { preview: 'markdown-v1' }),
    );
    return {
      recovery: [...result.recovery],
      recoveryDigest: result.recoveryDigest,
      sourceOrigin: location.origin,
      sourceDigest: result.sourceDigest,
      policy: 'markdown-system-v1',
    };
  },
  enroll: (input, maxSlices = 8) => {
    ceremony = beginLegacyImport(slot, decode(input), { maxSlices });
    return ceremony.displayCode;
  },
  confirm: (code) => run(() => ceremony.confirm(code)),
  complete: (code, input) =>
    run(async () => {
      let value = await ceremony.confirm(code);
      while (value.stage !== 'imported')
        value = await resumeLegacyImport(slot, code, decode(input), { maxSlices: 32 });
      return value;
    }),
  resume: (code, input, maxSlices = 32) =>
    run(() => resumeLegacyImport(slot, code, decode(input), { maxSlices })),
  raceEnroll: (input) =>
    run(async () => {
      const a = beginLegacyImport(slot, decode(input), { maxSlices: 1 });
      const b = beginLegacyImport(slot, decode(input), { maxSlices: 1 });
      const codes = [a.displayCode, b.displayCode];
      const results = await Promise.all([
        run(() => a.confirm(codes[0])),
        run(() => b.confirm(codes[1])),
      ]);
      return { codes, results };
    }),
  raceResume: (code, input) =>
    Promise.all([
      run(() => resumeLegacyImport(slot, code, decode(input), { maxSlices: 1 })),
      run(() => resumeLegacyImport(slot, code, decode(input), { maxSlices: 1 })),
    ]),
  fault: (value) => {
    fault = value;
    trigger = false;
    gate = false;
  },
  gated: () => gate,
  sourceDigest: observation,
  dump,
  claim: () => withExclusiveSlot(slot, (task) => readImportClaim(task, slot)),
  guards: (code) =>
    run(async () => {
      const startup = await inspectLocalStartup(slot);
      const claim = await withExclusiveSlot(slot, (task) => readImportClaim(task, slot)),
        scope = importScope(claim);
      const raw = await run(async () => {
        const c = await openContentSession(
          { ...scope, resolvePrincipal: () => scope.principalId },
          code,
        );
        await c.close();
      });
      const index = await openSlotIndex();
      let indexResult;
      try {
        indexResult = await run(() => index.createSlot(slot));
      } finally {
        index.close();
      }
      const genesis = beginLocalGenesis('unrelated-fresh-attempt'),
        another = genesis.displayCode;
      const fresh = await run(() => genesis.confirm(another));
      return { startup, raw, indexResult, fresh };
    }),
  state: (code) =>
    run(() =>
      withExclusiveSlot(slot, async (task) => {
        const claim = await readImportClaim(task, slot),
          scope = importScope(claim);
        return withPreactiveContentUnderPermit(
          task,
          { ...scope, resolvePrincipal: () => scope.principalId },
          code,
          async (content) => {
            const rows = await content.loadRecords(),
              doc = new Y.Doc({ gc: false });
            try {
              for (const row of rows) Y.applyUpdate(doc, row.bytes);
              return {
                claim: {
                  stage: claim.stage,
                  storeId: claim.initial.store_id,
                  rootId: claim.initial.root_id,
                  createdAt: claim.createdAt,
                },
                entries: exportEntries(doc, doc.getText('master').toString()).filter(
                  (e) => e.path !== 'unfiled.md',
                ),
                unfiled: unfiledCards(doc).map(({ card }) => cardBody(card)),
                cards: [...doc.getMap('cards').values()].map((c) => c.toJSON()),
                rows: rows.map((r) => ({ seq: r.seq, length: r.bytes.length })),
                name: await deriveStoreName(scope.principalId, scope.workspaceId),
              };
            } finally {
              rows.forEach((r) => r.bytes.fill(0));
              doc.destroy();
            }
          },
        );
      }),
    ),
  mutate: async (kind) => {
    const claim = await withExclusiveSlot(slot, (task) => readImportClaim(task, slot)),
      scope = importScope(claim);
    const name =
      kind === 'counter' || kind === 'slice'
        ? await deriveStoreName(scope.principalId, scope.workspaceId)
        : 'done.custody';
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const store = kind === 'counter' ? 'meta' : kind === 'slice' ? 'content' : 'entries',
          tx = db.transaction(store, 'readwrite'),
          s = tx.objectStore(store);
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
        if (kind === 'counter') s.delete('counter');
        else if (kind === 'slice') s.delete(1);
        else if (kind === 'custody') s.delete([slot, scope.principalId, scope.workspaceId]);
        else {
          claim.stage = claim.stage === 'imported' ? 'importing' : 'imported';
          s.put(claim, [slot, 'legacy-import-v1']);
        }
      });
    } finally {
      db.close();
    }
  },
};
// The reused test controller waits for this readiness name; it receives no production authority.
window.captureFixture = window.importFixture;
