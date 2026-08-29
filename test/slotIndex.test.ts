/**
 * TRD §6.5: the device-local user slot index, store naming, and the scoping it
 * enforces. §11.1's "slot scoping" and the clear-ordering half of "crash-safe
 * clear" — the key-material half arrives with the key store.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveStoreName, openSlotIndex, type SlotIndex, type StoredBinding } from '../src/crdt';

let open: SlotIndex | null = null;

const freshIndex = async (name: string): Promise<SlotIndex> => {
  open = await openSlotIndex(name);
  return open;
};

/**
 * The binding as §6.5's index stores it. Only `principalId` matters to this
 * layer — the rest is carried and read by `L-2`'s verifier, which is the point
 * of the seam these tests police.
 */
const binding = (principalId: string): StoredBinding => ({
  binding: {
    v: 1,
    accountId: 'account-1',
    principalId,
    rpId: 'example.test',
    epoch: 1,
    credId: 'cred-1',
    publicKey: '00',
  },
  bindingSignature: 'ff',
});

/** A slot that can name stores, which means a slot with a binding. */
const boundSlot = async (index: SlotIndex, id: string, principalId: string): Promise<void> => {
  await index.createSlot(id);
  await index.bindSlot(id, binding(principalId));
};

afterEach(() => {
  open?.close();
  open = null;
  vi.restoreAllMocks();
});

describe('store naming', () => {
  it('binds the principal, so a workspace id alone does not name the store', async () => {
    const mine = await deriveStoreName('principal-a', 'workspace-1');
    const theirs = await deriveStoreName('principal-b', 'workspace-1');
    expect(mine).not.toBe(theirs);
  });

  it('is deterministic, because the index is not the only thing that must agree', async () => {
    expect(await deriveStoreName('p', 'w')).toBe(await deriveStoreName('p', 'w'));
  });

  it('length-prefixes its fields, so a boundary cannot be moved between them', async () => {
    // Without LP, ("ab","c") and ("a","bc") concatenate identically and name one
    // store. This is the whole reason row 3's convention is used here.
    expect(await deriveStoreName('ab', 'c')).not.toBe(await deriveStoreName('a', 'bc'));
  });

  it('reproduces its published values, so the whole input survives a refactor', async () => {
    // A known-answer test, because the properties above each hold with a piece
    // of the input missing: dropping the domain tag changes no relation any of
    // them assert. This pins the construction whole —
    // SHA-256( LP('done/store-name/v1') || LP(principal) || LP(workspace) ),
    // truncated to 128 bits — so the tag, the prefixes and the truncation
    // cannot be edited away in silence. Recompute deliberately if the
    // derivation is ever salted; that is a rename of every store.
    expect(await deriveStoreName('principal-a', 'workspace-1')).toBe(
      'done.58af7672bdeed2545b3676be0ad4b434',
    );
    expect(await deriveStoreName('', '')).toBe('done.bf8b64b533d3c0741a712d13f7ffd789');
  });

  it('does not leak either input into the name', async () => {
    const name = await deriveStoreName('principal-secret', 'workspace-secret');
    expect(name).not.toContain('secret');
    expect(name).toMatch(/^done\.[0-9a-f]{32}$/);
  });
});

describe('slot scoping', () => {
  it('enumerates only the asking slot, with a second slot present and closed', async () => {
    const index = await freshIndex('done.slots-test-scoping');
    await boundSlot(index, 'slot-a', 'principal-a');
    await boundSlot(index, 'slot-b', 'principal-b');
    await index.registerStore('slot-a', 'workspace-1');
    await index.registerStore('slot-b', 'workspace-2');
    await index.closeSlot('slot-b');

    const listed = await index.listWorkspaces('slot-a');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.workspace).toBe('workspace-1');
    expect(listed.map((s) => s.principal)).not.toContain('principal-b');
  });

  it('never falls back to a database listing', async () => {
    const index = await freshIndex('done.slots-test-no-listing');
    await boundSlot(index, 'slot-a', 'principal-a');
    await index.registerStore('slot-a', 'workspace-1');

    // §6.5's "must not happen": no picker enumerates by database name. The
    // spy is the assertion — a future enumeration that reaches for the listing
    // fails here rather than passing quietly with the same visible result.
    const databases = vi.spyOn(indexedDB, 'databases');
    await index.listWorkspaces('slot-a');
    expect(databases).not.toHaveBeenCalled();
  });

  it("keeps a closed slot's entries and refuses to reach its stores", async () => {
    const index = await freshIndex('done.slots-test-closed');
    await boundSlot(index, 'slot-a', 'principal-a');
    await index.registerStore('slot-a', 'workspace-1');

    await index.closeSlot('slot-a');
    // Sign-out retains the entries...
    expect(await index.listWorkspaces('slot-a')).toHaveLength(1);
    // ...and makes the stores unreachable, which is the half that matters.
    expect(await index.resolveHandle('slot-a', 'workspace-1')).toBeNull();

    await index.reopenSlot('slot-a');
    expect(await index.resolveHandle('slot-a', 'workspace-1')).not.toBeNull();
  });

  it('resolves a handle whose journal namespace travels with its database', async () => {
    const index = await freshIndex('done.slots-test-handle');
    await boundSlot(index, 'slot-a', 'principal-a');
    const registered = await index.registerStore('slot-a', 'workspace-1');
    const resolved = await index.resolveHandle('slot-a', 'workspace-1');

    expect(resolved?.dbName).toBe(registered.dbName);
    expect(resolved?.journalPrefix).toBe(registered.journalPrefix);
    expect(resolved?.journalPrefix).toContain(encodeURIComponent(registered.dbName));
  });

  it('does not resolve a workspace the slot never registered', async () => {
    const index = await freshIndex('done.slots-test-unregistered');
    await boundSlot(index, 'slot-a', 'principal-a');
    await index.registerStore('slot-a', 'workspace-1');
    expect(await index.resolveHandle('slot-a', 'workspace-9')).toBeNull();
  });
});

describe('destructive clears', () => {
  it('removes the index entry last, so an interrupted clear is resumable', async () => {
    const index = await freshIndex('done.slots-test-order');
    await boundSlot(index, 'slot-a', 'principal-a');
    const handle = await index.registerStore('slot-a', 'workspace-1');

    // Both deletions are observed where they actually happen. An earlier
    // version of this test appended 'index-entry' after removeSlot resolved,
    // which put it last whatever the code did — the mutation that reverses the
    // order survived it. Spying on the object store's own delete is what makes
    // the assertion about ordering rather than about this test's own appends.
    const order: string[] = [];
    vi.spyOn(indexedDB, 'deleteDatabase').mockImplementation(((name: string) => {
      order.push(`store:${name}`);
      const req = { onsuccess: null, onerror: null, onblocked: null } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => (req.onsuccess as unknown as () => void)?.());
      return req;
    }) as typeof indexedDB.deleteDatabase);

    const realDelete = IDBObjectStore.prototype.delete;
    vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
      this: IDBObjectStore,
      key: IDBValidKey | IDBKeyRange,
    ) {
      order.push('index-entry');
      return realDelete.call(this, key);
    });

    await index.removeSlot('slot-a');

    expect(order).toEqual([`store:${handle.dbName}`, 'index-entry']);
    expect(await index.readSlot('slot-a')).toBeNull();
  });

  it('resumes an interrupted clear rather than orphaning what it reached', async () => {
    const index = await freshIndex('done.slots-test-resume');
    await boundSlot(index, 'slot-a', 'principal-a');
    const handle = await index.registerStore('slot-a', 'workspace-1');

    // The kill lands on the store deletion, which is what makes this assertion
    // about the ordering rather than about throwing. Under the required order
    // the entry has not been touched yet and survives; under the reverse the
    // entry is already gone and the store it named is orphaned — the exact
    // state §11.1 forbids, and §6.5's reason for removing the entry last.
    const killed = vi.spyOn(indexedDB, 'deleteDatabase').mockImplementation((() => {
      const req = { onsuccess: null, onerror: null, onblocked: null } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => {
        (req as unknown as { error: Error }).error = new Error('killed clearing the store');
        (req.onerror as unknown as (() => void) | null)?.();
      });
      return req;
    }) as typeof indexedDB.deleteDatabase);

    await expect(index.removeSlot('slot-a')).rejects.toThrow('killed clearing the store');

    // The entry survived, so the slot is still discoverable — which is what
    // makes the second attempt a resume rather than a search.
    const stranded = await index.readSlot('slot-a');
    expect(stranded?.stores.map((s) => s.dbName)).toEqual([handle.dbName]);

    killed.mockRestore();
    await index.removeSlot('slot-a');
    expect(await index.readSlot('slot-a')).toBeNull();
  });

  it('treats a blocked store deletion as a refusal, keeping the entry', async () => {
    const index = await freshIndex('done.slots-test-blocked');
    await boundSlot(index, 'slot-a', 'principal-a');
    const handle = await index.registerStore('slot-a', 'workspace-1');

    // Another tab holds the database open. The store is still on disk, so
    // reporting success here would let the clear go on to remove the entry and
    // orphan it — blocked has to refuse, not resolve.
    vi.spyOn(indexedDB, 'deleteDatabase').mockImplementation((() => {
      const req = { onsuccess: null, onerror: null, onblocked: null } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => (req.onblocked as unknown as (() => void) | null)?.());
      return req;
    }) as typeof indexedDB.deleteDatabase);

    await expect(index.removeSlot('slot-a')).rejects.toThrow('blocked by another connection');
    expect((await index.readSlot('slot-a'))?.stores.map((s) => s.dbName)).toEqual([handle.dbName]);
  });

  it('leaves the other slot untouched when one account is removed', async () => {
    const index = await freshIndex('done.slots-test-remove-one');
    await boundSlot(index, 'slot-a', 'principal-a');
    await boundSlot(index, 'slot-b', 'principal-b');
    await index.registerStore('slot-a', 'workspace-1');
    await index.registerStore('slot-b', 'workspace-2');

    await index.removeSlot('slot-a');

    expect(await index.readSlot('slot-a')).toBeNull();
    expect(await index.readSlot('slot-b')).not.toBeNull();
    expect(await index.listWorkspaces('slot-b')).toHaveLength(1);
  });

  it('clears every slot for a handoff reset', async () => {
    const index = await freshIndex('done.slots-test-handoff');
    await boundSlot(index, 'slot-a', 'principal-a');
    await boundSlot(index, 'slot-b', 'principal-b');
    await index.registerStore('slot-a', 'workspace-1');
    await index.registerStore('slot-b', 'workspace-2');

    await index.resetForHandoff();

    expect(await index.readSlot('slot-a')).toBeNull();
    expect(await index.readSlot('slot-b')).toBeNull();
  });
});

describe('the principal comes from the binding', () => {
  it('refuses to name a store for a slot with no binding', async () => {
    const index = await freshIndex('done.slots-test-unbound');
    await index.createSlot('slot-unbound');
    // No binding means no principal, and a caller-supplied one is exactly what
    // this refuses. L-2's verifier reaches the same rule from the other side.
    await expect(index.registerStore('slot-unbound', 'workspace-1')).rejects.toThrow(
      'names no store',
    );
    await expect(index.resolveHandle('slot-unbound', 'workspace-1')).rejects.toThrow(
      'names no store',
    );
  });

  it('names the store after the bound principal, not the asking slot', async () => {
    const index = await freshIndex('done.slots-test-bound-name');
    await boundSlot(index, 'slot-a', 'principal-a');
    await boundSlot(index, 'slot-b', 'principal-b');

    const a = await index.registerStore('slot-a', 'workspace-1');
    const b = await index.registerStore('slot-b', 'workspace-1');

    // Same workspace, different bound principals, different stores — the
    // property §6.5 asks for, now sourced where it cannot be spoofed.
    expect(a.dbName).not.toBe(b.dbName);
    expect(a.dbName).toBe(await deriveStoreName('principal-a', 'workspace-1'));
  });
});

describe('the unlock binding is carried, not verified', () => {
  it('is null until L-2 mints it, and no read here consults it', async () => {
    const index = await freshIndex('done.slots-test-binding');
    await boundSlot(index, 'slot-a', 'principal-a');
    await index.registerStore('slot-a', 'workspace-1');

    // §13.9 and row 12 own verification and the service-signed anchor. This
    // layer stores the binding and gates on `status` alone — the signature here
    // is 'ff' and resolves anyway, which is the seam stated as a test rather
    // than a comment: verifySlotUnlock is L-2's and the caller runs it before
    // opening a slot. Building half of §13.9 here is what this pins against.
    expect((await index.readSlot('slot-a'))?.unlockBinding?.bindingSignature).toBe('ff');
    expect(await index.resolveHandle('slot-a', 'workspace-1')).not.toBeNull();
  });
});
