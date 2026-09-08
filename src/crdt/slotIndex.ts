/**
 * The device-local user slot index, and store naming (TRD §6.5).
 *
 * Every store a device holds belongs to exactly one local user slot, and a
 * picker scoped to the active slot must be unable to enumerate any other slot's
 * stores (PRD §6.7). The database key alone cannot supply that: keying by
 * *(principal, workspace)* prevents merges but still leaves a previous person's
 * retained Local workspace enumerable. So the index is a separate structure
 * that points *at* the stores rather than being derivable from them, and
 * **enumeration goes through it, never through `indexedDB.databases()`**.
 *
 * It is device-local, never synced, and is not identity state — it groups for
 * local access only and makes no claim that two principals in one slot are the
 * same person.
 *
 * Account binding storage/verification remains L-2's external authority boundary.
 * The Local owner is in localGenesis.ts: its signed claim, factor verification and
 * scoped index installation require no service-signed binding. These earlier
 * Account/legacy methods now take slot lifecycle permits and refuse Local rows
 * or claims. They are not an encrypted clear or Account verification owner.
 * The default application still opens LEGACY_STORE directly.
 */

import { deriveStoreName } from './storeName';
export { deriveStoreName } from './storeName';
import type { SlotBinding } from '../account/slotUnlock';
import { storeHandle, type StoreHandle } from './persistence';
import { withExclusiveSlot, openWriteSession, type SessionTask } from './writeSession';
import { contentTransaction } from './contentDatabase';
import { readLocalClaim } from './localGenesisRecord';

/** The index's own database. It names no workspace, so its name may be fixed. */
const INDEX_DB = 'done.slots';
const SLOTS_STORE = 'slots';
const INDEX_VERSION = 1;

export const deriveStoreHandle = async (
  principal: string,
  workspace: string,
): Promise<StoreHandle> => storeHandle(await deriveStoreName(principal, workspace));

export interface SlotStore {
  /**
   * Read out of the slot's binding, never taken from a caller — see
   * `registerStore`. Recorded so a later read does not have to re-open the
   * binding to learn whose store this is.
   */
  principal: string;
  workspace: string;
  /**
   * Recorded rather than recomputed at read time. The index is the authority on
   * which stores exist; a reader that re-derived would be deriving its way to an
   * answer the index already holds, and would keep working if the index were
   * wrong — which is the failure the index exists to make visible.
   */
  dbName: string;
}

export interface Slot {
  /** Verified Local genesis owner; legacy Account writers cannot mutate these rows. */
  local?: { principalId: string; workspaceId: string; intentId: string };
  id: string;
  status: 'active' | 'closed';
  /**
   * §13.9's offline-verifiable unlock binding, as stored: the service-signed
   * `SlotBinding` and the signature over it. **Stored here, verified nowhere
   * here** — `verifySlotUnlock` is `L-2`'s and the caller runs it before
   * opening a slot. §6.5's index is a structured clone, which is exactly why
   * the binding is a structure rather than a string: a reader that had to parse
   * it would be trusting the parse as well as the bytes.
   */
  unlockBinding: StoredBinding | null;
  stores: SlotStore[];
}

/** What §6.5's index holds for one credential, and nothing more. */
export interface StoredBinding {
  binding: SlotBinding;
  /** Ed25519 over `slotBindingMessage(binding)`, hex. */
  bindingSignature: string;
}

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Slot index request failed.'));
  });

const openIndexDb = (name: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const open = indexedDB.open(name, INDEX_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(SLOTS_STORE))
        db.createObjectStore(SLOTS_STORE, { keyPath: 'id' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('Slot index failed to open.'));
  });

const deleteDatabase = (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error(`Failed to delete ${name}.`));
    // **Blocked is a refusal here, not a success.** Another tab holds the
    // database open, so the store is still on disk; resolving would let the
    // caller go on to remove the index entry and orphan it — the one state the
    // entry-last ordering exists to prevent. Rejecting keeps the entry, which
    // makes the clear resumable once the other connection closes.
    req.onblocked = () =>
      reject(new Error(`Deleting ${name} is blocked by another connection; the clear can resume.`));
  });

export interface SlotIndex {
  createSlot: (id: string) => Promise<Slot>;
  readSlot: (id: string) => Promise<Slot | null>;
  bindSlot: (slotId: string, stored: StoredBinding) => Promise<void>;
  registerStore: (slotId: string, workspace: string) => Promise<StoreHandle>;
  /** The picker's enumeration. Through the index, by construction. */
  listWorkspaces: (slotId: string) => Promise<SlotStore[]>;
  resolveHandle: (slotId: string, workspace: string) => Promise<StoreHandle | null>;
  closeSlot: (id: string) => Promise<void>;
  reopenSlot: (id: string) => Promise<void>;
  removeSlot: (id: string) => Promise<void>;
  resetForHandoff: () => Promise<void>;
  close: () => void;
}

export const openSlotIndex = async (name: string = INDEX_DB): Promise<SlotIndex> => {
  const db = await openIndexDb(name);

  const read = (task: SessionTask, id: string): Promise<Slot | null> =>
    task.wait(() =>
      contentTransaction<Slot | null>(db, task, [SLOTS_STORE], 'readonly', (tx, result, guard) => {
        const req = tx.objectStore(SLOTS_STORE).get(id);
        req.onsuccess = () => guard(() => result(req.result ?? null));
      }),
    );
  const write = (task: SessionTask, slot: Slot, create = false): Promise<void> =>
    task.wait(() =>
      contentTransaction<void>(db, task, [SLOTS_STORE], 'readwrite', (tx) => {
        const store = tx.objectStore(SLOTS_STORE);
        if (create) store.add(slot);
        else store.put(slot);
      }),
    );
  const legacy = async (task: SessionTask, id: string): Promise<Slot | null> => {
    const slot = await read(task, id);
    if (slot?.local || (await readLocalClaim(task, id)))
      throw new Error('Use the verified Local genesis/index owner for this slot.');
    return slot;
  };
  const mustRead = async (task: SessionTask, id: string): Promise<Slot> => {
    const slot = await legacy(task, id);
    if (!slot) throw new Error(`No such slot: ${id}`);
    return slot;
  };
  const reading = async <T>(id: string, fn: (task: SessionTask) => Promise<T>): Promise<T> => {
    const session = await openWriteSession(id);
    try {
      return await session.run(fn);
    } finally {
      await session.close();
    }
  };
  const principalOf = (slot: Slot): string => {
    const principal = slot.unlockBinding?.binding.principalId;
    if (!principal) throw new Error(`Slot ${slot.id} has no binding, so it names no store.`);
    return principal;
  };
  const setStatus = (id: string, status: Slot['status']) =>
    withExclusiveSlot(id, async (task) => {
      await write(task, { ...(await mustRead(task, id)), status });
    });
  const remove = (id: string) =>
    withExclusiveSlot(id, async (task) => {
      const slot = await legacy(task, id);
      if (!slot) return;
      // Legacy plaintext cleanup only; the Local guard above prevents encrypted-carrier deletion here.
      for (const store of slot.stores) await task.wait(() => deleteDatabase(store.dbName));
      await task.wait(() =>
        contentTransaction<void>(db, task, [SLOTS_STORE], 'readwrite', (tx) => {
          tx.objectStore(SLOTS_STORE).delete(id);
        }),
      );
    });
  return {
    createSlot: (id) =>
      withExclusiveSlot(id, async (task) => {
        await legacy(task, id);
        const slot: Slot = { id, status: 'active', unlockBinding: null, stores: [] };
        await write(task, slot, true);
        return slot;
      }),
    readSlot: (id) => reading(id, (task) => legacy(task, id)),
    bindSlot: (id, stored) => {
      const captured = structuredClone(stored);
      return withExclusiveSlot(id, async (task) => {
        await write(task, { ...(await mustRead(task, id)), unlockBinding: captured });
      });
    },
    registerStore: (id, workspace) =>
      withExclusiveSlot(id, async (task) => {
        const slot = await mustRead(task, id),
          principal = principalOf(slot);
        if (slot.status === 'closed') throw new Error('Slot is closed.');
        const dbName = await task.wait(() => deriveStoreName(principal, workspace));
        if (!slot.stores.some((s) => s.dbName === dbName))
          await write(task, {
            ...slot,
            stores: [...slot.stores, { principal, workspace, dbName }],
          });
        return storeHandle(dbName);
      }),
    listWorkspaces: (id) => reading(id, async (task) => (await mustRead(task, id)).stores),
    resolveHandle: (id, workspace) =>
      reading(id, async (task) => {
        const slot = await mustRead(task, id);
        if (slot.status === 'closed') return null;
        const dbName = await task.wait(() => deriveStoreName(principalOf(slot), workspace));
        return slot.stores.some((s) => s.dbName === dbName) ? storeHandle(dbName) : null;
      }),
    closeSlot: (id) => setStatus(id, 'closed'),
    reopenSlot: (id) => setStatus(id, 'active'),
    removeSlot: remove,
    resetForHandoff: async () => {
      // Administrative legacy inventory. Each removal rereads after its scoped exclusive grant.
      const tx = db.transaction(SLOTS_STORE, 'readonly');
      const slots = await request<Slot[]>(tx.objectStore(SLOTS_STORE).getAll());
      if (slots.some((s) => s.local)) throw new Error('Local slots require their clear owner.');
      for (const slot of slots) await remove(slot.id);
    },
    close: () => db.close(),
  };
};
