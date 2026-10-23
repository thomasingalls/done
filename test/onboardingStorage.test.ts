// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
  beginLocalGenesis,
  inspectLocalStartup,
  listLocalWorkspaces,
  openLocalWorkspace,
} from '../src/crdt/localGenesis';
import { automaticCode, automaticOpeningKey } from '../src/crdt/automaticOpening';
import { readLocalClaim, slotCustodyRows } from '../src/crdt/localGenesisRecord';
import { withExclusiveSlot } from '../src/crdt/writeSession';
import {
  beginLocalProtection,
  protectLocalWorkspace,
  readLocalProtection,
} from '../src/crdt/localProtection';
import { deriveStoreName } from '../src/crdt/storeName';
import { acknowledgeLocalRemoval, removeDeviceData } from '../src/crdt/deviceDataRemoval';
import { generateDeviceCode, normalizeDeviceCode } from '../src/crdt/custodyCrypto';
import { EditorSelection } from '@codemirror/state';
import { createLocalStartup } from '../src/ui/localStartup';
import { openContentSession } from '../src/crdt/custody';
import { Y } from '../src/crdt/yjs';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('isSecureContext', true);
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
async function create(slot: string, automatic = false) {
  const ceremony = beginLocalGenesis(slot, { automatic }),
    code = ceremony.displayCode!;
  const receipt = await ceremony.confirm(code);
  return { code, receipt };
}
async function open(slot: string, code: string) {
  const route = (await listLocalWorkspaces(slot, code))[0]!;
  const result = await openLocalWorkspace(slot, code, {
    today: () => '2026-10-14',
    identity: {
      id: route.principal,
      actor: { kind: 'human', name: 'Alex', color: '#e0662f' },
      device: { id: 'test-device', name: 'Test browser' },
    },
    validateReceive: () => {
      throw Error('No network');
    },
  });
  if (result.kind !== 'ready') throw Error(result.reason);
  return result.workspace;
}
it('automatic opening persists only an encrypted random opener, bound to its exact Local claim', async () => {
  const { code } = await create('local', true);
  await withExclusiveSlot('local', async (task) => {
    const claim = (await readLocalClaim(task, 'local'))!;
    expect(await automaticCode(task, claim)).toBe(normalizeDeviceCode(code));
    const rows = await slotCustodyRows(task, 'local');
    expect(JSON.stringify(rows)).not.toContain(code);
    expect(JSON.stringify(rows)).not.toContain(normalizeDeviceCode(code));
    const opener = rows!.find((r) => indexedDB.cmp(r.key, automaticOpeningKey('local')) === 0)!
      .value as { key: CryptoKey };
    expect(opener.key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', opener.key)).rejects.toThrow();
  });
});
it('copies the complete list, preferences, card identities, and attribution into fresh protected storage', async () => {
  const { code, receipt } = await create('local', true),
    workspace = await open('local', code);
  await workspace
    .text({ kind: 'master' })
    .input(
      { name: 'insert', text: 'Project\n  - nested task\nNotes to self' },
      EditorSelection.single(0).toJSON(),
    ).accepted;
  await workspace.command({
    kind: 'compose',
    to: { date: '2026-10-14', section: 'done' },
    text: 'Unexpected useful work',
  }).accepted;
  expect(workspace.read().cards.map((card) => card.text)).toContain('Unexpected useful work');
  await workspace.command({ kind: 'settings', rolloverHour: 4 }).accepted;
  await workspace.whenDurable();
  const before = workspace.read(),
    sourceName = (await listLocalWorkspaces('local', code))[0]!.dbName;
  await workspace.close();
  const enrollment = beginLocalProtection('local'),
    protectedCode = enrollment.displayCode!;
  await expect(enrollment.confirm('wrong')).rejects.toThrow();
  expect(enrollment.displayCode).toBe(protectedCode);
  await enrollment.confirm(protectedCode);
  expect(enrollment.displayCode).toBeNull();
  expect((await listLocalWorkspaces('local', protectedCode))[0]!.workspace).not.toBe(
    receipt.scope.workspaceId,
  );
  expect((await indexedDB.databases()).some((d) => d.name === sourceName)).toBe(false);
  await expect(listLocalWorkspaces('local', code)).rejects.toMatchObject({
    disposition: { kind: 'unlock-failed' },
  });
  const reopened = await open('local', protectedCode);
  expect(reopened.text({ kind: 'master' }).read().text).toBe(
    'Project\n  - nested task\nNotes to self',
  );
  const after = reopened.read();
  expect(after.settings).toEqual(before.settings);
  expect(after.days).toEqual(before.days);
  await reopened.close();
  await withExclusiveSlot('local', async (task) => {
    expect(await automaticCode(task, (await readLocalClaim(task, 'local'))!)).toBeNull();
  });
});
it('never adds an automatic opener to an already protected workspace', async () => {
  const { code } = await create('local');
  const before = await withExclusiveSlot('local', (task) => slotCustodyRows(task, 'local'));
  const startup = createLocalStartup(true);
  await startup.inspect();
  expect(startup.getSnapshot()).toMatchObject({ kind: 'unlock-required' });
  await startup.close();
  expect(await withExclusiveSlot('local', (task) => slotCustodyRows(task, 'local'))).toEqual(
    before,
  );
  await expect(protectLocalWorkspace('local', generateDeviceCode())).rejects.toThrow(
    'already protected',
  );
  const attempt = beginLocalGenesis('local', { automatic: true });
  await expect(attempt.confirm(attempt.displayCode!)).rejects.toMatchObject({
    disposition: { kind: 'unlock-required' },
  });
  expect(await inspectLocalStartup('local')).toMatchObject({ kind: 'unlock-required' });
  expect(await listLocalWorkspaces('local', code)).toHaveLength(1);
});
it('removes a locked slot without a credential, preserving other slots and refusing implicit recreation', async () => {
  const first = await create('local'),
    other = await create('account-11111111111111111111111111111111');
  const workspace = await open('local', first.code);
  await workspace.command({
    kind: 'compose',
    to: { date: '2026-10-14', section: 'done' },
    text: 'Private work',
  }).accepted;
  expect(workspace.read().cards.map((card) => card.text)).toContain('Private work');
  await workspace.whenDurable();
  await workspace.close();
  await removeDeviceData('local');
  expect(await inspectLocalStartup('local')).toMatchObject({ kind: 'cleared' });
  const attempt = beginLocalGenesis('local', { automatic: true });
  await expect(attempt.confirm(attempt.displayCode!)).rejects.toMatchObject({
    disposition: { kind: 'cleared' },
  });
  expect(
    await listLocalWorkspaces('account-11111111111111111111111111111111', other.code),
  ).toHaveLength(1);
  await acknowledgeLocalRemoval('local');
  expect(await inspectLocalStartup('local')).toMatchObject({ kind: 'fresh' });
});
it('resumes protection after refused source deletion and keeps ordinary opening blocked until completion', async () => {
  const { code } = await create('local', true),
    workspace = await open('local', code);
  await workspace.command({
    kind: 'compose',
    to: { date: '2026-10-14', section: 'done' },
    text: 'Keep this',
  }).accepted;
  expect(workspace.read().cards.map((card) => card.text)).toContain('Keep this');
  await workspace.whenDurable();
  await workspace.close();
  const protectedCode = generateDeviceCode(),
    nativeDelete = indexedDB.deleteDatabase.bind(indexedDB);
  vi.spyOn(indexedDB, 'deleteDatabase').mockImplementationOnce(() => {
    const request = {} as IDBOpenDBRequest;
    queueMicrotask(() => request.onerror?.call(request, new Event('error')));
    return request;
  });
  await expect(protectLocalWorkspace('local', protectedCode)).rejects.toBeDefined();
  expect(await inspectLocalStartup('local')).toMatchObject({
    kind: 'creation-pending',
    reason: 'local-protection-needs-unlock-code',
  });
  await expect(protectLocalWorkspace('local', code)).rejects.toMatchObject({
    disposition: { kind: 'unlock-failed' },
  });
  vi.spyOn(indexedDB, 'deleteDatabase').mockImplementation(nativeDelete);
  await protectLocalWorkspace('local', protectedCode);
  const reopened = await open('local', protectedCode);
  expect(reopened.read().days.find((d) => d.date === '2026-10-14')).toBeDefined();
  await reopened.close();
});

it.each([
  'creating',
  'copying',
  'verified',
  'content-removed',
  'journal-removed',
  'index-selected',
] as const)(
  'resumes a protection interruption after %s without losing the list or reusing old keys',
  async (phase) => {
    const { code } = await create('local', true),
      workspace = await open('local', code);
    await workspace.command({
      kind: 'compose',
      to: { date: '2026-10-14', section: 'scheduled' },
      text: 'Keep through interruption',
    }).accepted;
    expect(workspace.read().cards.map((card) => card.text)).toContain('Keep through interruption');
    await workspace.whenDurable();
    const before = workspace.read();
    await workspace.close();
    const protectedCode = generateDeviceCode();
    await expect(
      protectLocalWorkspace('local', protectedCode, {
        onPhase: (observed) => {
          if (observed === phase) throw Error('Simulated process exit');
        },
      }),
    ).rejects.toThrow('Simulated process exit');
    expect(await inspectLocalStartup('local')).toMatchObject({ kind: 'creation-pending' });
    await protectLocalWorkspace('local', protectedCode);
    const reopened = await open('local', protectedCode);
    expect(reopened.read().days).toEqual(before.days);
    expect(reopened.read().cards).toEqual(before.cards);
    await reopened.close();
    await expect(listLocalWorkspaces('local', code)).rejects.toMatchObject({
      disposition: { kind: 'unlock-failed' },
    });
  },
);

it('preserves the source if a previously verified protected copy is damaged before resumption', async () => {
  const { code } = await create('local', true),
    workspace = await open('local', code);
  await workspace.command({
    kind: 'compose',
    to: { date: '2026-10-14', section: 'done' },
    text: 'Last readable copy',
  }).accepted;
  expect(workspace.read().cards.map((card) => card.text)).toContain('Last readable copy');
  await workspace.whenDurable();
  await workspace.close();
  const protectedCode = generateDeviceCode();
  await expect(
    protectLocalWorkspace('local', protectedCode, {
      onPhase: (phase) => {
        if (phase === 'verified') throw Error('Stop before deletion');
      },
    }),
  ).rejects.toThrow();
  const names = await withExclusiveSlot('local', async (task) => {
    const p = (await readLocalProtection(task, 'local'))!;
    return {
      source: await deriveStoreName(p.source.initial.principal_id, p.source.initial.workspace_id),
      target: await deriveStoreName(p.target.initial.principal_id, p.target.initial.workspace_id),
    };
  });
  const db = await new Promise<IDBDatabase>((resolve) => {
    const r = indexedDB.open(names.target);
    r.onsuccess = () => resolve(r.result);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('content', 'readwrite'),
      cursor = tx.objectStore('content').openCursor();
    cursor.onsuccess = () => {
      const row = cursor.result!;
      const value = row.value;
      value.ct[0] ^= 1;
      row.update(value);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  db.close();
  await expect(protectLocalWorkspace('local', protectedCode)).rejects.toThrow();
  expect((await indexedDB.databases()).some((d) => d.name === names.source)).toBe(true);
});

it('protects a notebook larger than one storage batch without flattening or dropping content', async () => {
  const { code, receipt } = await create('local', true),
    workspace = await open('local', code);
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, workspace.snapshot());
  await workspace.whenDurable();
  await workspace.close();
  const content = await openContentSession(
    { ...receipt.scope, resolvePrincipal: () => receipt.scope.principalId },
    code,
  );
  const updates: Uint8Array<ArrayBuffer>[] = [];
  doc.on('update', (bytes) => updates.push(new Uint8Array(bytes)));
  try {
    for (let i = 0; i < 5; i++) {
      doc.getText('master').insert(doc.getText('master').length, String(i).repeat(1024 * 1024));
      await content.appendBatch([{ kind: 'update', bytes: updates.shift()! }]);
    }
    await content.close();
    const protectedCode = generateDeviceCode();
    await protectLocalWorkspace('local', protectedCode);
    const reopened = await open('local', protectedCode),
      text = reopened.text({ kind: 'master' }).read().text;
    expect(text.length).toBe(5 * 1024 * 1024);
    for (let i = 0; i < 5; i++)
      expect(text.slice(i * 1024 * 1024, (i + 1) * 1024 * 1024)).toBe(
        String(i).repeat(1024 * 1024),
      );
    await reopened.close();
  } finally {
    await content.close();
    doc.destroy();
  }
}, 30000);
