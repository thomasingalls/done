import { toBase64 } from 'lib0/buffer';
import { inspectLegacySource } from '../../src/crdt/legacySource';
import type { SessionTask } from '../../src/crdt/writeSession';
import { makeSource } from '../storage-properties/oracle';

export const key = (i: number): string => `done.pending-update.done.fixture.${i}`;
export const modernKey = `done.pending-update.done.${'1'.repeat(32)}.${'2'.repeat(32)}.${'3'.repeat(32)}.${'0'.repeat(16)}`;
export const source = () =>
  makeSource([
    { lane: 0, actor: 1, at: 1, remove: 0, text: 'journal-only' },
    { lane: 0, actor: 0, at: 2, remove: 4, text: '' },
  ]);
export const transaction = (db: IDBDatabase, body: (tx: IDBTransaction) => void) =>
  new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['updates', 'custom'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? Error('seed aborted'));
    body(tx);
  });
export const database = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open('done', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('updates', { autoIncrement: true });
      request.result.createObjectStore('custom');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export const reset = async () => {
  localStorage.clear();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('done');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('fixture reset blocked'));
  });
};
export const seed = async (disk: number[], wal: number[], updates = source().updates) => {
  await reset();
  const db = await database();
  try {
    await transaction(db, (tx) =>
      disk.forEach((id, i) =>
        tx.objectStore('updates').add(new Uint8Array(updates[id]!), 1 + i * 2),
      ),
    );
  } finally {
    db.close();
  }
  wal.forEach((id, i) =>
    localStorage.setItem(key(i), '1:' + toBase64(new Uint8Array(updates[id]!))),
  );
  localStorage.setItem('done.actor', 'legacy-human');
  localStorage.setItem('done.device', JSON.stringify({ id: 'old-device', name: 'private-name' }));
  localStorage.setItem(
    'done.sync',
    JSON.stringify({ token: 'private-token', room: 'legacy-room' }),
  );
  localStorage.setItem(modernKey, '2:unrelated-encrypted-carrier');
  localStorage.setItem('other-app', 'unrelated');
};
export const summarize = async (task: SessionTask) => {
  const result = await inspectLegacySource(task);
  return {
    ...result,
    updates: result.updates.map((r) => ({ key: r.key, bytes: [...r.bytes] })),
    journal: result.journal.map((r) => ({ ...r, bytes: [...r.bytes] })),
  };
};
