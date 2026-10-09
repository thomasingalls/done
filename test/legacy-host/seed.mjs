import { makeExportSource } from '../legacy-export/source';
import { Y } from '../../src/crdt/yjs';
import { toBase64 } from 'lib0/buffer';

window.seedFixture = async ({ input, disk, wal }) => {
  // Preparation only, always in a newly allocated disposable profile. No resets/deletion helper.
  if ((await indexedDB.databases()).some((d) => d.name === 'done'))
    throw Error('seed-requires-unused-profile');
  const source = makeExportSource(input);
  try {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('done', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('updates', { autoIncrement: true });
        r.result.createObjectStore('custom');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['updates', 'custom'], 'readwrite');
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
        disk.forEach((id, i) =>
          tx.objectStore('updates').add(new Uint8Array(source.updates[id]), 1 + i * 2),
        );
      });
    } finally {
      db.close();
    }
    wal.forEach((id, i) =>
      localStorage.setItem(
        `done.pending-update.done.fixture.${i}`,
        '1:' + toBase64(new Uint8Array(source.updates[id])),
      ),
    );
    localStorage.setItem('done.actor', 'legacy-human');
    localStorage.setItem('other-app', 'preserve-unknown-material');
    return { updates: source.updates, integrated: [...Y.encodeStateAsUpdate(source.doc)] };
  } finally {
    source.doc.destroy();
  }
};
