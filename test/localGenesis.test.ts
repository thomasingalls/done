import { openCreationSeed, eraseCreationSeed, type CreationSeed } from '../src/crdt/creationSeed';
import { utf8, normalizeDeviceCode, hex } from '../src/crdt/custodyCrypto';
import { withCeremonyVault } from '../src/account/ceremonyVault';
import { claimScope } from '../src/crdt/localGenesisRecord';
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
  beginLocalGenesis,
  inspectLocalStartup,
  resumeLocalGenesis,
  listLocalWorkspaces,
  openLocalWorkspace,
} from '../src/crdt/localGenesis';
import { withExclusiveSlot } from '../src/crdt/writeSession';
import {
  readLocalClaim,
  verifyLocalClaim,
  parseLocalClaim,
  type LocalClaim,
} from '../src/crdt/localGenesisRecord';
import { openSlotIndex } from '../src/crdt/slotIndex';
const slot = 'local-unit-slot';
const read = () => withExclusiveSlot(slot, (task) => readLocalClaim(task, slot));
const create = async (id = slot) => {
  const enrollment = beginLocalGenesis(id),
    code = enrollment.displayCode!;
  return { code, receipt: await enrollment.confirm(code) };
};
const change = async (name: string, store: string, fn: (store: IDBObjectStore) => void) => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      fn(tx.objectStore(store));
    });
  } finally {
    db.close();
  }
};
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('isSecureContext', true);
  // Unit wiring only. Browser schedules establish actual exclusion.
  vi.stubGlobal('navigator', {
    locks: { request: async (_name: string, _opts: unknown, fn: () => Promise<void>) => fn() },
  });
  const values: Record<string, string> = {};
  vi.stubGlobal(
    'localStorage',
    new Proxy(values, {
      get(target, p) {
        if (p === 'getItem') return (key: string) => target[key] ?? null;
        if (p === 'setItem')
          return (key: string, value: string) => {
            target[key] = value;
          };
        if (p === 'removeItem')
          return (key: string) => {
            delete target[key];
          };
        return target[p as string];
      },
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('verified Local genesis', () => {
  it('does not persist before generated-code confirmation, including a mistaken or cancelled confirmation', async () => {
    const ceremony = beginLocalGenesis(slot);
    expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'fresh' });
    await expect(ceremony.confirm('wrong')).rejects.toMatchObject({
      code: 'confirmation-required',
    });
    ceremony.cancel();
    expect(ceremony.displayCode).toBeNull();
    await expect(ceremony.confirm('wrong')).rejects.toMatchObject({ code: 'enrollment-closed' });
    expect(await indexedDB.databases()).toEqual([]);
  });
  it('creates and verifies Local identity without an Account binding or database enumeration', async () => {
    const enumeration = vi.spyOn(indexedDB, 'databases').mockRejectedValue(Error('Forbidden'));
    const { code, receipt } = await create();
    expect(receipt.scope.principalId).toMatch(/^[0-9a-f]{32}$/u);
    expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'unlock-required' });
    expect(await listLocalWorkspaces(slot, code)).toMatchObject([
      { principal: receipt.scope.principalId, workspace: receipt.scope.workspaceId },
    ]);
    expect((await read())?.stage).toBe('ready');
    expect(enumeration).not.toHaveBeenCalled();
  });
  it('a second creator cannot replace the winning identity or enroll another factor', async () => {
    const { code } = await create(),
      before = await read();
    const loser = beginLocalGenesis(slot),
      losingCode = loser.displayCode!;
    await expect(loser.confirm(losingCode)).rejects.toMatchObject({
      disposition: { kind: 'unlock-required' },
    });
    await expect(resumeLocalGenesis(slot, losingCode)).rejects.toMatchObject({
      disposition: { kind: 'unlock-failed' },
    });
    expect(await read()).toEqual(before);
    await expect(resumeLocalGenesis(slot, code)).resolves.toMatchObject({ kind: 'created' });
    expect(await read()).toEqual(before);
  });
  it('authenticates the progress stage and all immutable identity metadata', async () => {
    const { code } = await create(),
      claim = (await read())!;
    const changed = structuredClone(claim);
    changed.stage = 'custody';
    await expect(
      withExclusiveSlot(slot, (task) => verifyLocalClaim(task, changed, code)),
    ).rejects.toMatchObject({ disposition: { kind: 'repair-required' } });
    const changedId = structuredClone(claim);
    changedId.initial.creation_intent!.signingId = 'fa'.repeat(16);
    await expect(
      withExclusiveSlot(slot, (task) => verifyLocalClaim(task, changedId, code)),
    ).rejects.toMatchObject({ code: 'repair-required' });
  });
  it.each([undefined, 'later', null, 3])('refuses malformed progress %s', async (stage) => {
    await create();
    const claim = (await read())!;
    expect(() => parseLocalClaim({ ...claim, stage }, slot)).toThrow();
  });
  it('does not reconstruct a missing completed content store even if its index and witness were also removed', async () => {
    const { code, receipt } = await create(),
      route = (await listLocalWorkspaces(slot, code))[0]!;
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.deleteDatabase(route.dbName);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
    await change('done.slots', 'slots', (s) => {
      s.delete(slot);
    });
    await change('done.custody', 'entries', (s) => {
      s.delete([slot, receipt.scope.principalId, receipt.scope.workspaceId, 'content-v1']);
    });
    await expect(resumeLocalGenesis(slot, code)).rejects.toMatchObject({
      disposition: { kind: 'repair-required' },
    });
    expect(await inspectLocalStartup(slot)).toMatchObject({ kind: 'repair-required' });
    expect((await indexedDB.databases()).some((d) => d.name === route.dbName)).toBe(false);
  });
  it('refuses missing live custody instead of restoring the initial claim snapshot', async () => {
    const { code, receipt } = await create();
    await change('done.custody', 'entries', (s) => {
      s.delete([slot, receipt.scope.principalId, receipt.scope.workspaceId]);
    });
    await expect(resumeLocalGenesis(slot, code)).rejects.toMatchObject({
      disposition: { reason: 'claimed-custody-missing' },
    });
  });
  it('blocks every legacy index mutation of a Local slot', async () => {
    await create();
    const before = await read(),
      index = await openSlotIndex();
    try {
      for (const operation of [
        () => index.createSlot(slot),
        () => index.closeSlot(slot),
        () => index.reopenSlot(slot),
        () => index.registerStore(slot, 'x'),
        () => index.removeSlot(slot),
        () => index.resetForHandoff(),
      ])
        await expect(operation()).rejects.toThrow(/Local/u);
    } finally {
      index.close();
    }
    expect(await read()).toEqual(before);
  });
  it('keeps independent slots scoped and returned routes detached', async () => {
    const a = await create(),
      b = await create('other');
    const routes = await listLocalWorkspaces(slot, a.code);
    routes[0]!.dbName = 'wrong';
    expect((await listLocalWorkspaces(slot, a.code))[0]!.dbName).not.toBe('wrong');
    expect((await listLocalWorkspaces('other', b.code))[0]!.principal).not.toBe(
      a.receipt.scope.principalId,
    );
    await expect(listLocalWorkspaces('other', a.code)).rejects.toMatchObject({
      disposition: { kind: 'unlock-failed' },
    });
  });
  it('opens through real factor verification, replay and admitted initialization', async () => {
    const { code } = await create();
    const result = await openLocalWorkspace(slot, code, {
      identity: {
        id: 'actor',
        actor: { kind: 'human', name: 'human', color: '#000000' },
        device: { id: 'device', name: 'device' },
      },
      validateReceive: () => {},
      today: () => '2026-09-08',
    });
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') await result.workspace.close();
  });
  it('refuses an existing undefined witness row during authenticated creation resumption', async () => {
    const sign = crypto.subtle.sign.bind(crypto.subtle);
    const fault = vi
      .spyOn(crypto.subtle, 'sign')
      .mockImplementation(async (algorithm, key, data) => {
        if (new TextDecoder().decode(data).includes('done/content-witness/v1'))
          throw Error('Stop before first witness');
        return sign(algorithm, key, data);
      });
    const ceremony = beginLocalGenesis(slot),
      code = ceremony.displayCode!;
    await expect(ceremony.confirm(code)).rejects.toThrow('Stop before first witness');
    fault.mockRestore();
    const claim = (await read())!;
    expect(claim.stage).toBe('content');
    const key = [slot, claim.initial.principal_id, claim.initial.workspace_id, 'content-v1'];
    await change('done.custody', 'entries', (s) => {
      s.put(undefined, key);
    });
    const before = await indexedDB.databases();
    await expect(resumeLocalGenesis(slot, code)).rejects.toMatchObject({ code: 'repair-required' });
    expect(await indexedDB.databases()).toEqual(before);
    expect(await read()).toEqual(claim);
  });
  it('refuses creation when the durable progress MAC is damaged', async () => {
    const { code } = await create();
    await change('done.custody', 'entries', (s) => {
      const r = s.get([slot, 'local-genesis-v1']);
      r.onsuccess = () => {
        const c = r.result as LocalClaim;
        c.mac[0] = c.mac[0]! ^ 1;
        s.put(c, [slot, 'local-genesis-v1']);
      };
    });
    await expect(resumeLocalGenesis(slot, code)).rejects.toMatchObject({
      disposition: { kind: 'repair-required' },
    });
  });
});

describe('factor-sealed recovery custody seed', () => {
  const seed = async (): Promise<CreationSeed> => {
    const credentials = [];
    for (const role of ['wrapping', 'signing'] as const) {
      const pair = (await crypto.subtle.generateKey(
        role === 'wrapping' ? 'X25519' : 'Ed25519',
        true,
        role === 'wrapping' ? ['deriveBits'] : ['sign', 'verify'],
      )) as CryptoKeyPair;
      credentials.push({
        role,
        id: (role === 'wrapping' ? 'b1' : 'b2').repeat(16),
        publicKey: new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)),
        privateBytes: new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
      });
    }
    return {
      credentials: credentials as CreationSeed['credentials'],
      progress: { exactRequest: 'retained recovery bytes' },
    };
  };
  it('captures keys before caller mutation and refuses replacing an existing local slot', async () => {
    const input = await seed(),
      pub = input.credentials.map((c) => hex(c.publicKey));
    const ceremony = beginLocalGenesis(slot, { seed: input }),
      code = ceremony.displayCode!;
    eraseCreationSeed(input);
    input.progress = { exactRequest: 'mutated' };
    await ceremony.confirm(code);
    const own = await withCeremonyVault(
      slot,
      code,
      new AbortController().signal,
      async (o) => o.participant,
    );
    expect([own.wPub, own.sPub]).toEqual(pub);
    const claim = (await read())!,
      factor = utf8(normalizeDeviceCode(code));
    const reopened = await openCreationSeed(
      claim.initial.creation_seed!,
      claimScope(claim),
      claim.initial.creation_intent!.id,
      factor,
      crypto.subtle,
    );
    factor.fill(0);
    expect(reopened.progress).toEqual({ exactRequest: 'retained recovery bytes' });
    eraseCreationSeed(reopened);
    const another = await seed(),
      loser = beginLocalGenesis(slot, { seed: another });
    eraseCreationSeed(another);
    await expect(loser.confirm(loser.displayCode!)).rejects.toMatchObject({
      disposition: { kind: 'unlock-required' },
    });
    expect(await read()).toEqual(claim);
  });
  it('authenticates the encrypted seed and its original local scope', async () => {
    const input = await seed(),
      ceremony = beginLocalGenesis(slot, { seed: input }),
      code = ceremony.displayCode!;
    eraseCreationSeed(input);
    await ceremony.confirm(code);
    const claim = (await read())!,
      factor = utf8(normalizeDeviceCode(code));
    try {
      await expect(
        openCreationSeed(
          claim.initial.creation_seed!,
          { ...claimScope(claim), workspaceId: 'ff'.repeat(16) },
          claim.initial.creation_intent!.id,
          factor,
          crypto.subtle,
        ),
      ).rejects.toThrow();
      const damaged = structuredClone(claim);
      damaged.initial.creation_seed!.ct[0] = damaged.initial.creation_seed!.ct[0]! ^ 1;
      await expect(
        withExclusiveSlot(slot, (task) => verifyLocalClaim(task, damaged, code)),
      ).rejects.toThrow();
    } finally {
      factor.fill(0);
    }
  });
});
