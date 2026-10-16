// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { withRecoveryOwner } from '../src/account/recoveryOwner';
import { setupProgress, type Retained } from '../src/account/setupProgress';
import { beginLocalGenesis, listLocalWorkspaces } from '../src/crdt/localGenesis';
import { removeDeviceData } from '../src/crdt/deviceDataRemoval';
import { createFirstDeviceSetup } from '../src/account/firstDeviceSetup';
import { retainedRecoveryKey } from '../src/account/setupRecoveryMetadata';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('location', { origin: 'https://isolation.example' });
  const tails = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', {
    locks: {
      request(name: string, _options: unknown, work: (lock: { name: string }) => unknown) {
        const result = (tails.get(name) ?? Promise.resolve()).then(() => work({ name }));
        tails.set(
          name,
          result.catch(() => {}),
        );
        return result;
      },
    },
  });
  const values: Record<string, string> = {};
  vi.stubGlobal(
    'localStorage',
    new Proxy(values, {
      get(target, key) {
        if (key === 'getItem') return (name: string) => target[name] ?? null;
        if (key === 'setItem')
          return (name: string, value: string) => {
            target[name] = value;
          };
        if (key === 'removeItem')
          return (name: string) => {
            delete target[name];
          };
        return target[key as string];
      },
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const pin = {
  v: 1 as const,
  origin: 'https://isolation.example',
  rpId: 'isolation.example',
  serviceId: '01'.repeat(16),
  authRoot: '02'.repeat(32),
};
const options = (letter: string, slotId = 'local') => ({
  context: {
    principalId: 'principal-' + letter,
    workspaceId: 'workspace-' + letter,
    lineageId: 'lineage-' + letter,
    authRoot: pin.authRoot,
  },
  pin,
  local: { slotId, code: 'unused-by-draft-only-operations' },
  accountId: letter.repeat(42) + 'A',
  retryKey: letter.toLowerCase().repeat(42) + 'A',
  transport: { begin: vi.fn(), finish: vi.fn() },
});
async function select(input: ReturnType<typeof options>) {
  await setupProgress(
    {
      v: 1,
      pin,
      slotId: input.local.slotId,
      retryKey: input.retryKey,
      view: {
        ok: true,
        stage: 'credential-confirmed',
        accountId: input.accountId,
        credentialId: 'test-credential',
      },
      proof: null,
    } satisfies Retained,
    input.local.slotId,
  );
  return { ...input, isolateSetupProgress: true as const };
}
async function rows() {
  const request = indexedDB.open('done.account-recovery-preparation.v1', 1);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onupgradeneeded = () => request.result.createObjectStore('progress');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<{ key: IDBValidKey; value: unknown }[]>((resolve, reject) => {
      const tx = db.transaction('progress');
      const store = tx.objectStore('progress'),
        keys = store.getAllKeys(),
        values = store.getAll();
      tx.oncomplete = () =>
        resolve(keys.result.map((key, i) => ({ key, value: values.result[i] })));
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

it('keeps an unrelated legacy draft intact while a different Local attempt generates and resumes its own recovery', async () => {
  const legacy = options('A');
  await withRecoveryOwner(legacy, (owner) => owner.generate());
  const before = await rows();
  const current = await select(options('B'));
  expect(await withRecoveryOwner(current, (owner) => owner.status())).toBe('empty');
  await withRecoveryOwner(current, (owner) => owner.generate());
  expect(await withRecoveryOwner(current, (owner) => owner.status())).toBe('awaiting-code');
  expect(
    (await rows()).filter((row) => JSON.stringify(row.value) === JSON.stringify(before[0]!.value)),
  ).toHaveLength(1);
  await expect(withRecoveryOwner(legacy, (owner) => owner.status())).rejects.toThrow(
    'owner mismatch',
  );
  // Selecting the old attempt still reaches its original draft; the route itself grants no authority.
  await select(legacy);
  expect(
    await withRecoveryOwner({ ...legacy, isolateSetupProgress: true }, (owner) => owner.status()),
  ).toBe('awaiting-code');
});

it('resumes an exact legacy attempt in place without forking or replacing its saved recovery code', async () => {
  const legacy = options('A');
  await withRecoveryOwner(legacy, (owner) => owner.generate());
  const before = await rows();
  const current = await select(legacy);
  expect(await withRecoveryOwner(current, (owner) => owner.status())).toBe('awaiting-code');
  await expect(withRecoveryOwner(current, (owner) => owner.generate())).rejects.toThrow(
    'already generated',
  );
  expect(await rows()).toEqual(before);
  await expect(
    withRecoveryOwner(
      { ...current, context: { ...current.context, workspaceId: 'wrong' } },
      (owner) => owner.status(),
    ),
  ).rejects.toThrow('target changed');
  expect(await rows()).toEqual(before);
});

it('fences a staged recovery write when its selected setup is removed before crypto finishes', async () => {
  const current = await select(options('B'));
  let release!: () => void, reached!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const generate = crypto.subtle.generateKey.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, 'generateKey').mockImplementationOnce((async (
    ...args: Parameters<typeof generate>
  ) => {
    reached();
    await barrier;
    return generate(...args);
  }) as typeof generate);
  const operation = withRecoveryOwner(current, (owner) => owner.generate());
  const refused = expect(operation).rejects.toThrow(/setup.*(retired|changed|missing)|removed/i);
  await ready;
  await setupProgress(null);
  release();
  await refused;
  expect(await rows()).toEqual([]);
});

it('removes only the selected slot’s attempt progress and fences later writes without deleting unrelated legacy recovery', async () => {
  const genesis = beginLocalGenesis('local'),
    code = genesis.displayCode!;
  await genesis.confirm(code);
  expect(await listLocalWorkspaces('local', code)).toHaveLength(1);
  await withRecoveryOwner(options('A'), (owner) => owner.generate());
  const legacy = (await rows())[0];
  const current = await select(options('B'));
  await withRecoveryOwner(current, (owner) => owner.generate());
  await removeDeviceData('local');
  expect((await rows()).map((row) => row.value)).toEqual([legacy!.value]);
  await expect(withRecoveryOwner(current, (owner) => owner.generate())).rejects.toThrow(
    /setup.*(retired|changed|missing)|remov/i,
  );
  expect((await rows()).map((row) => row.value)).toEqual([legacy!.value]);
});

it('distinguishes a post-passkey continuation failure from rejection of the independently verified Local factor', async () => {
  const genesis = beginLocalGenesis('local'),
    code = genesis.displayCode!;
  await genesis.confirm(code);
  await select(options('B'));
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new TypeError('Synthetic offline authority check')),
  );
  const owner = createFirstDeviceSetup({ networkSessions: true, pin });
  try {
    await owner.inspect();
    await owner.unlock(code);
    expect(owner.getSnapshot()).toMatchObject({
      kind: 'resume-setup',
      error: expect.stringContaining('unlock code was accepted'),
    });
    expect(await listLocalWorkspaces('local', code)).toHaveLength(1);
  } finally {
    await owner.close();
  }
  const cold = createFirstDeviceSetup({ networkSessions: true, pin });
  try {
    await cold.inspect();
    await cold.unlock('00000-00000-00000-00000-00000');
    expect(cold.getSnapshot()).toMatchObject({
      kind: 'unlock',
      error: expect.stringContaining('Could not unlock'),
    });
    expect(await listLocalWorkspaces('local', code)).toHaveLength(1);
  } finally {
    await cold.close();
  }
});

it('refuses an occupied preservation destination atomically instead of replacing either draft', async () => {
  const legacy = options('A');
  await withRecoveryOwner(legacy, (owner) => owner.generate());
  const request = indexedDB.open('done.account-recovery-preparation.v1');
  const db = await new Promise<IDBDatabase>((resolve) => {
    request.onsuccess = () => resolve(request.result);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('progress', 'readwrite');
    tx.objectStore('progress').put(
      { retained: 'do not replace this record' },
      retainedRecoveryKey(legacy.accountId, legacy.retryKey),
    );
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  db.close();
  const before = await rows();
  const current = await select(options('B'));
  await expect(withRecoveryOwner(current, (owner) => owner.generate())).rejects.toThrow(
    'already exists',
  );
  expect(await rows()).toEqual(before);
  expect(await withRecoveryOwner(legacy, (owner) => owner.status())).toBe('awaiting-code');
});
