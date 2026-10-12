// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createContentOwner } from '../src/crdt/contentStore';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';
import { recordAAD, type StoredRecord } from '../src/crdt/contentRecord';
import { deriveStoreName } from '../src/crdt/storeName';
import type { SessionTask } from '../src/crdt/writeSession';
afterEach(() => vi.unstubAllGlobals());
it('interruption retains only authenticated reuse; changed old ciphertext still reopens and refuses', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  const scope = {
    slotId: 'audit',
    principalId: 'audit',
    workspaceId: 'audit',
    storeId: 'ab'.repeat(16),
    rootId: 'cd'.repeat(16),
  };
  const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const hmac = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
  let interrupt = false,
    opened = 0;
  const parent: SessionTask = {
    signal: new AbortController().signal,
    step: (f) => f(),
    wait: async (f) => f(),
  };
  const owner = createContentOwner(scope, 1, {
    reuseOpened: true,
    validate: () => {
      if (interrupt) throw new MaintenanceInterrupted();
    },
    sign: async (_task, bytes) => new Uint8Array(await crypto.subtle.sign('HMAC', hmac, bytes)),
    verify: (_task, bytes, mac) => crypto.subtle.verify('HMAC', hmac, mac, bytes),
    open: async (_task, r) => {
      opened++;
      return new Uint8Array(
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: r.nonce, additionalData: recordAAD(scope, r) },
          aes,
          r.ct,
        ),
      );
    },
    seal: async (_task, r, bytes) => {
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      return {
        ...r,
        nonce,
        ct: new Uint8Array(
          await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: nonce, additionalData: recordAAD(scope, r) },
            aes,
            bytes,
          ),
        ),
      };
    },
  });
  try {
    await owner.initialize(parent, { checkCreation() {} });
    await owner.append(parent, [{ kind: 'update', bytes: new Uint8Array([0, 0]) }]);
    expect((await owner.load(parent))[0]!.bytes).toEqual(new Uint8Array([0, 0]));
    expect(opened).toBe(1);
    interrupt = true;
    await expect(owner.load(parent)).rejects.toBeInstanceOf(MaintenanceInterrupted);
    interrupt = false;
    await owner.load(parent);
    expect(opened).toBe(1);
    const awaitName = await deriveStoreName(scope.principalId, scope.workspaceId);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(awaitName);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('content', 'readwrite'),
          store = tx.objectStore('content'),
          read = store.get(1);
        read.onsuccess = () => {
          const changed = read.result as StoredRecord;
          changed.ct[0] = changed.ct[0]! ^ 1;
          store.put(changed, 1);
        };
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
    await expect(owner.load(parent)).rejects.toThrow();
    expect(opened).toBe(2);
  } finally {
    owner.dispose();
  }
});
