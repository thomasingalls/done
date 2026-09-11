export {
  setup,
  configure,
  run,
  getCounter,
  putCounter,
} from '../account-counter-contract/native-browser';
import { contentTransaction } from '../../src/crdt/contentDatabase';
import { transact, type CustodyRecord } from '../../src/crdt/custodyRecord';
import { withExclusiveSlot } from '../../src/crdt/writeSession';
const scope = { slotId: 'durability-boundary', principalId: 'p', workspaceId: 'w' };
export async function boundary(kind: 'content' | 'custody', write = true) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('durability-boundary', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('entries');
      r.result.createObjectStore('meta');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await withExclusiveSlot(scope.slotId, async (task) => {
      if (kind === 'custody') {
        // An absent-row write exercises the transaction wrapper; full records and actual AES
        // are exercised separately through enrollment. This fixture is never reopened as custody.
        return transact(
          db,
          task,
          scope,
          null,
          write ? ({ fixture: true } as unknown as CustodyRecord) : undefined,
        );
      }
      return contentTransaction(
        db,
        task,
        ['meta'],
        write ? 'readwrite' : 'readonly',
        (tx, result) => {
          if (write) tx.objectStore('meta').put('body-ran', 'probe');
          result('ok');
        },
        write ? 'strict' : 'relaxed',
      );
    });
  } finally {
    db.close();
  }
}
