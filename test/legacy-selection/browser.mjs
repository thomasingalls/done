import '../legacy-import/browser.mjs';
import { selectLegacyImport } from '../../src/crdt/legacySelection';
import { readImportClaim, advanceImportClaim } from '../../src/crdt/legacyImportRecord';
import { readLocalClaim } from '../../src/crdt/localGenesisRecord';
import { installLocalIndex } from '../../src/crdt/localGenesisStorage';
import { withExclusiveSlot } from '../../src/crdt/writeSession';
import {
  openLocalWorkspace,
  inspectLocalStartup,
  listLocalWorkspaces,
} from '../../src/crdt/localGenesis';
import { prepareLocalClear } from '../../src/crdt/localClear';
import { deriveStoreName } from '../../src/crdt/storeName';
const slot = 'seeded-import';
const inherited = window.importFixture;
let fault,
  trigger = false,
  gated = false;
const pause = async () => {
  gated = true;
  await new Promise(() => {});
};
const run = async (fn) => {
  try {
    const value = await fn();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (trigger && fault?.startsWith('kill-')) await pause();
    return { status: 'ok', value };
  } catch (e) {
    return { status: 'refused', reason: e.reason ?? e.disposition?.reason ?? e.code ?? e.name };
  }
};
const phase = (store, value, key) => {
  if (store.name === 'slots' && value?.id === slot) return 'index';
  if (store.name !== 'entries' || !Array.isArray(key)) return null;
  if (key[1] === 'legacy-import-v1' && value.stage === 'selecting') return 'intent';
  if (key[1] === 'local-genesis-v1' && value.imported) return 'decision';
  return null;
};
for (const method of ['add', 'put']) {
  const native = IDBObjectStore.prototype[method];
  IDBObjectStore.prototype[method] = function (value, key) {
    const request = native.call(this, value, key),
      point = phase(this, value, key),
      tx = this.transaction;
    if (point === 'index' && fault === 'lose-index') {
      fault = null;
      request.addEventListener('success', () => this.delete(slot), { once: true });
    }
    if (point === 'index' && fault === 'change-source-at-index') {
      fault = null;
      request.addEventListener(
        'success',
        () => localStorage.setItem('done.actor', 'changed-after-verification'),
        { once: true },
      );
    }
    if (point && fault === `abort-${point}`) {
      fault = null;
      request.addEventListener('success', () => tx.abort(), { once: true });
    }
    if (point && fault === `kill-${point}`)
      tx.addEventListener(
        'complete',
        () => {
          trigger = true;
        },
        { once: true },
      );
    return request;
  };
}
for (const method of ['encrypt', 'decrypt', 'sign', 'verify', 'digest']) {
  const native = crypto.subtle[method].bind(crypto.subtle);
  crypto.subtle[method] = async (...args) => {
    if (trigger && fault?.startsWith('kill-')) await pause();
    return native(...args);
  };
}
const decode = (input) => ({ ...input, recovery: new Uint8Array(input.recovery) });
const options = {
  identity: {
    id: 'selection-human',
    actor: { kind: 'human', name: 'Human', color: '#000000' },
    device: { id: 'selection-device', name: 'Device' },
  },
  validateReceive: () => {},
  today: () => '2026-01-01',
};
const mutate = async (name, storeName, fn) => {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      fn(tx.objectStore(storeName));
    });
  } finally {
    db.close();
  }
};
window.selectionFixture = {
  ...inherited,
  select: (code, input) => run(() => selectLegacyImport(slot, code, decode(input))),
  raceSelect: (code, input) =>
    Promise.all([1, 2].map(() => run(() => selectLegacyImport(slot, code, decode(input))))),
  fault: (value) => {
    fault = value;
    trigger = false;
    gated = false;
  },
  gated: () => gated,
  inspect: () => inspectLocalStartup(slot),
  clear: (code) => run(() => prepareLocalClear(slot, code)),
  advance: (code, index) =>
    run(() =>
      withExclusiveSlot(slot, async (task) => {
        const claim = await readImportClaim(task, slot),
          next = await advanceImportClaim(task, claim, code, 'selecting');
        if (index) await installLocalIndex(task, { ...next, stage: 'ready' });
      }),
    ),
  open: (code, edit) =>
    run(async () => {
      const opened = await openLocalWorkspace(slot, code, options);
      if (opened.kind !== 'ready') return opened;
      const workspace = opened.workspace;
      try {
        if (edit !== undefined) {
          await workspace
            .text({ kind: 'master' })
            .input({ name: 'insert', text: edit }, { ranges: [{ anchor: 0, head: 0 }], main: 0 })
            .accepted;
          await workspace.whenDurable();
        }
        const read = workspace.read();
        return {
          kind: 'ready',
          master: read.master,
          entries: workspace.exportEntries().filter((e) => e.path !== 'unfiled.md'),
          unfiled: read.cards.filter((c) => c.location === null).map((c) => c.text),
          routes: await listLocalWorkspaces(slot, code),
        };
      } finally {
        await workspace.close();
      }
    }),
  mutateSelection: async (kind) => {
    if (kind === 'source') {
      localStorage.setItem('done.actor', 'changed-source');
      return;
    }
    const claim = await withExclusiveSlot(
      slot,
      async (task) => (await readImportClaim(task, slot)) ?? (await readLocalClaim(task, slot)),
    );
    if (kind === 'provenance') {
      claim.imported.sourceDigest = '0'.repeat(64);
      return mutate('done.custody', 'entries', (s) => s.put(claim, [slot, 'local-genesis-v1']));
    }
    if (kind === 'index') return mutate('done.slots', 'slots', (s) => s.delete(slot));
    if (kind === 'route')
      return mutate('done.slots', 'slots', (s) => {
        const r = s.get(slot);
        r.onsuccess = () => s.put({ ...r.result, status: 'closed' });
      });
    const name = await deriveStoreName(claim.initial.principal_id, claim.initial.workspace_id);
    await mutate(name, 'content', (s) => {
      if (kind === 'missing') s.delete(1);
      if (kind === 'ciphertext') {
        const r = s.openCursor();
        r.onsuccess = () => {
          if (!r.result) return;
          const value = r.result.value;
          // Mutate the real persisted ciphertext, preserving its framing.
          value.ct[value.ct.length - 1] ^= 1;
          r.result.update(value);
        };
      }
    });
  },
};
