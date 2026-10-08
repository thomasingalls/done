/** Disposable native boundary probe. Never shipped in the application. */
import { createContentOwner, type ContentCrypto } from '../../src/crdt/contentStore';
import { createJournalOwner, eraseJournalSnapshot } from '../../src/crdt/journalStore';
import { withExclusiveSlot } from '../../src/crdt/writeSession';
import { openCustodyDb, CUSTODY_STORE } from '../../src/crdt/custodyRecord';
import { contentTransaction } from '../../src/crdt/contentDatabase';
import { fields, random, type Bytes } from '../../src/crdt/custodyCrypto';
import { recordAAD, type StoredRecord } from '../../src/crdt/contentRecord';
import { deriveStoreName } from '../../src/crdt/storeName';

export async function exercise(fault: 'seal' | 'commit' | 'journal' | 'opener') {
  const scope = {
    slotId: crypto.randomUUID(),
    principalId: 'rotation-probe',
    workspaceId: 'rotation-probe',
    storeId: Array.from(random(16), (b) => b.toString(16).padStart(2, '0')).join(''),
    rootId: 'ee'.repeat(16),
  };
  const name = await deriveStoreName(scope.principalId, scope.workspaceId);
  const metadata = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
  const keys = new Map(
    await Promise.all(
      [1, 2].map(
        async (g) =>
          [
            g,
            await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
              'encrypt',
              'decrypt',
            ]),
          ] as const,
      ),
    ),
  );
  const sign = async (b: Bytes) => new Uint8Array(await crypto.subtle.sign('HMAC', metadata, b));
  const open = async (r: StoredRecord) =>
    new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: r.nonce, additionalData: recordAAD(scope, r) },
        keys.get(r.gen)!,
        r.ct,
      ),
    );
  const seal = async (h: Omit<StoredRecord, 'nonce' | 'ct'>, bytes: Bytes) => {
    const nonce = random(12);
    return {
      ...h,
      nonce,
      ct: new Uint8Array(
        await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: nonce, additionalData: recordAAD(scope, h) },
          keys.get(h.gen)!,
          bytes,
        ),
      ),
    };
  };
  const crypt: ContentCrypto = {
    open: (_t, r) => open(r),
    seal: (_t, h, b) => seal(h, b),
    sign: (_t, b) => sign(b),
    verify: (_t, b, mac) => crypto.subtle.verify('HMAC', metadata, mac, b),
  };
  const db = await openCustodyDb();
  const journal = createJournalOwner(scope, name, 1, new Uint8Array(32).fill(7));
  let reserved = 0;
  const originals = [new Uint8Array([0, 0]), new Uint8Array([0, 0])];
  try {
    return await withExclusiveSlot(scope.slotId, async (task) => {
      const reservationKey = ['rotation-probe', scope.slotId];
      const reserve = async (count: number) => {
        const before = await task.wait(() =>
          contentTransaction<{ count: number; mac: Bytes } | undefined>(
            db,
            task,
            [CUSTODY_STORE],
            'readonly',
            (tx, result) => {
              const r = tx.objectStore(CUSTODY_STORE).get(reservationKey);
              r.onsuccess = () => result(r.result);
            },
          ),
        );
        if (
          before &&
          !(await crypto.subtle.verify(
            'HMAC',
            metadata,
            before.mac,
            fields(scope.slotId, String(before.count)),
          ))
        )
          throw Error('Reservation changed');
        const next = (before?.count ?? 0) + count;
        const mac = await sign(fields(scope.slotId, String(next)));
        await task.wait(() =>
          contentTransaction<void>(
            db,
            task,
            [CUSTODY_STORE],
            'readwrite',
            (tx, _result, guard) => {
              const store = tx.objectStore(CUSTODY_STORE),
                r = store.get(reservationKey);
              r.onsuccess = () =>
                guard(() => {
                  if ((r.result?.count ?? 0) !== (before?.count ?? 0))
                    throw Error('Reservation raced');
                  store.put({ count: next, mac }, reservationKey);
                });
            },
            'strict',
          ),
        );
        reserved = next;
        return next;
      };
      const first = createContentOwner(scope, 1, crypt);
      await first.initialize(task, { checkCreation() {} });
      await first.append(
        task,
        originals.map((bytes) => ({ kind: 'update', bytes })),
      );
      // Journal-only work must be copied durably before the activation transaction can start.
      journal.append(new Uint8Array([0, 0]));
      const snapshot = await journal.readSnapshot(task);
      try {
        await journal.flush(task, snapshot, (t, updates) =>
          first.append(
            t,
            updates.map((bytes) => ({ kind: 'update', bytes })),
          ),
        );
      } finally {
        eraseJournalSnapshot(snapshot);
      }
      const checkJournal = () => {
        const rows = journal.snapshot();
        try {
          if (rows.length) throw Error('Journal is not covered');
        } finally {
          eraseJournalSnapshot(rows);
        }
      };
      const initial = await first.load(task);
      let failed = false,
        calls = 0;
      const put = IDBObjectStore.prototype.put;
      if (fault === 'commit')
        IDBObjectStore.prototype.put = function (value, ...args) {
          const result = put.call(this, value, ...args);
          if (this.name === 'meta' && value.active_gen === 2) this.transaction.abort();
          return result;
        };
      try {
        await first.rotate(task, {
          generation: 2,
          reserve,
          checkJournal,
          seal: async (h, b) => {
            if (++calls === 1 && fault === 'seal')
              throw Error('Interrupted after durable reservation');
            const result = await seal(h, b);
            if (calls === 1 && fault === 'journal') journal.append(new Uint8Array([0, 0]));
            return result;
          },
          open: async (r) => (fault === 'opener' ? new Uint8Array([1, 0]) : open(r)),
        });
      } catch {
        failed = true;
      } finally {
        IDBObjectStore.prototype.put = put;
      }
      if (!failed || reserved !== initial.length)
        throw Error('Fault did not consume a durable reservation');
      const intact = await first.load(task);
      if (JSON.stringify(intact) !== JSON.stringify(initial))
        throw Error('Failed rotation changed the predecessor');
      for (const r of intact) r.bytes.fill(0);
      if (fault === 'journal') {
        const late = await journal.readSnapshot(task);
        try {
          await journal.flush(task, late, (t, updates) =>
            first.append(
              t,
              updates.map((bytes) => ({ kind: 'update', bytes })),
            ),
          );
        } finally {
          eraseJournalSnapshot(late);
        }
      }
      first.dispose();
      // A fresh owner recovers from the committed reservation, not an in-memory grant.
      const retry = createContentOwner(scope, 1, crypt);
      try {
        await retry.initialize(task);
        await retry.rotate(task, { generation: 2, reserve, seal, open, checkJournal });
        let staleRefused = false;
        try {
          await retry.append(task, [{ kind: 'update', bytes: originals[0]! }]);
        } catch {
          staleRefused = true;
        }
        if (!staleRefused) throw Error('Old generation writer survived activation');
      } finally {
        retry.dispose();
      }
      const cold = createContentOwner(scope, 2, crypt);
      try {
        await cold.initialize(task);
        const recovered = await cold.load(task);
        const expected = initial.length + (fault === 'journal' ? 1 : 0);
        if (
          recovered.length !== expected ||
          recovered.some((r) => r.gen !== 2 || r.bytes[0] !== 0 || r.bytes[1] !== 0)
        )
          throw Error('Successor lost covered writing');
        await cold.append(task, [{ kind: 'update', bytes: originals[0]! }]);
        for (const r of recovered) r.bytes.fill(0);
        for (const r of initial) r.bytes.fill(0);
        return { failedBeforeSwitch: true, recovered: expected, reserved, newWrite: true };
      } finally {
        cold.dispose();
      }
    });
  } finally {
    journal.dispose();
    db.close();
  }
}
