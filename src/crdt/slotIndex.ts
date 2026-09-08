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
 * **What is here and what is not.** The naming, scoping and enumeration half of
 * §6.5 is `L-1`'s and is built here. The slot's offline-verifiable unlock
 * binding is §13.9's, and its service-signed anchor is §15 row 12's — both
 * `L-2`'s. `unlockBinding` is carried as a column and never verified here;
 * a slot's `status` is the only gate this layer enforces. Building half of
 * §13.9 inside Stage 1 is the specific mistake this comment exists to prevent.
 *
 * Nothing in the app resolves through this index yet, because the app has no
 * principal or workspace identity to scope by — it opens `LEGACY_STORE`
 * directly. The encrypted content store registers through it when it lands.
 */

import { deriveStoreName } from './storeName';
export { deriveStoreName } from './storeName';
import type { SlotBinding } from '../account/slotUnlock';
import { storeHandle, type StoreHandle } from './persistence';

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

  const read = async (id: string): Promise<Slot | null> => {
    const tx = db.transaction(SLOTS_STORE, 'readonly');
    const slot = await request<Slot | undefined>(tx.objectStore(SLOTS_STORE).get(id));
    return slot ?? null;
  };

  const write = async (slot: Slot): Promise<void> => {
    const tx = db.transaction(SLOTS_STORE, 'readwrite');
    await request(tx.objectStore(SLOTS_STORE).put(slot));
  };

  /**
   * A slot with no binding has no principal, so it can name no store. Refusing
   * is the whole point: the alternative is a caller-supplied principal, which
   * is the seam this index exists on the correct side of.
   */
  const principalOf = (slot: Slot): string => {
    const principal = slot.unlockBinding?.binding.principalId;
    if (!principal) throw new Error(`Slot ${slot.id} has no binding, so it names no store.`);
    return principal;
  };

  const mustRead = async (id: string): Promise<Slot> => {
    const slot = await read(id);
    if (!slot) throw new Error(`No such slot: ${id}`);
    return slot;
  };

  const setStatus = async (id: string, status: Slot['status']): Promise<void> => {
    await write({ ...(await mustRead(id)), status });
  };

  return {
    createSlot: async (id) => {
      const slot: Slot = { id, status: 'active', unlockBinding: null, stores: [] };
      await write(slot);
      return slot;
    },

    readSlot: read,

    bindSlot: async (slotId, stored) => {
      await write({ ...(await mustRead(slotId)), unlockBinding: stored });
    },

    /**
     * **The principal comes from the slot's binding, never from the caller.**
     * `L-2`'s verifier reaches the same rule from the other side — it reads
     * `principalId` and `credId` out of the verified binding because taking
     * them alongside would let a bug verify a challenge minted for somebody
     * else. The same bug here would name another principal's store, and the
     * name is what the §6.1 subkey binds, so it would be a key's scope that
     * moved. An unbound slot has no principal and therefore no store name;
     * the pre-account path is `LEGACY_STORE`, which is not in this index.
     */
    registerStore: async (slotId, workspace) => {
      const slot = await mustRead(slotId);
      const principal = principalOf(slot);
      const dbName = await deriveStoreName(principal, workspace);
      const existing = slot.stores.find((s) => s.dbName === dbName);
      if (!existing) {
        await write({ ...slot, stores: [...slot.stores, { principal, workspace, dbName }] });
      }
      return storeHandle(dbName);
    },

    listWorkspaces: async (slotId) => (await mustRead(slotId)).stores,

    resolveHandle: async (slotId, workspace) => {
      const slot = await mustRead(slotId);
      // "No slot's stores are reachable while that slot is closed" (§6.5). The
      // entries survive a sign-out; reachability does not.
      if (slot.status === 'closed') return null;
      const dbName = await deriveStoreName(principalOf(slot), workspace);
      return slot.stores.some((s) => s.dbName === dbName) ? storeHandle(dbName) : null;
    },

    closeSlot: (id) => setStatus(id, 'closed'),
    reopenSlot: (id) => setStatus(id, 'active'),

    /**
     * Remove-account. **The index entry goes last** (§6.5): an interrupted clear
     * that has dropped stores but kept the entry is re-discoverable and
     * resumable, where the opposite order orphans whatever it did not reach.
     */
    removeSlot: async (id) => {
      const slot = await read(id);
      if (!slot) return;
      for (const store of slot.stores) await deleteDatabase(store.dbName);
      const tx = db.transaction(SLOTS_STORE, 'readwrite');
      await request(tx.objectStore(SLOTS_STORE).delete(id));
    },

    resetForHandoff: async () => {
      const tx = db.transaction(SLOTS_STORE, 'readonly');
      const slots = await request<Slot[]>(tx.objectStore(SLOTS_STORE).getAll());
      for (const slot of slots) {
        for (const store of slot.stores) await deleteDatabase(store.dbName);
        const del = db.transaction(SLOTS_STORE, 'readwrite');
        await request(del.objectStore(SLOTS_STORE).delete(slot.id));
      }
    },

    close: () => db.close(),
  };
};
