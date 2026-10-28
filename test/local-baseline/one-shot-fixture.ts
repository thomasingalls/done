/** Disposable real-crypto reduced store; preserves real baseline and allocation readers/writers. */
import { vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createContentOwner } from '../../src/crdt/contentStore';
import { cryptFor, keys } from './anchor-fixture';
import { extendSpoolWitness } from '../../src/crdt/spoolRecord';
import { deriveStoreName } from '../../src/crdt/storeName';
import { openContentDb } from '../../src/crdt/contentDatabase';
import type { LocalBaselineContext } from '../../src/crdt/localBaselineReplay';
import type { OpenedRecord } from '../../src/crdt/contentRecord';
import type { SessionTask } from '../../src/crdt/writeSession';
// @ts-expect-error Shared independent real-protocol JavaScript fixture.
import { memberFixture } from './fixtures.mjs';

export const task: SessionTask = {
  signal: new AbortController().signal,
  step: (f) => f(),
  wait: async (f) => f(),
};
export async function oneShotFixture(clean: (() => void)[]) {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const name of [
    'VITE_ACCOUNT_RETENTION',
    'VITE_ACCOUNT_BASELINE_READ',
    'VITE_ACCOUNT_BASELINE_INSTALL',
  ])
    vi.stubEnv(name, '1');
  const f = await memberFixture();
  clean.push(f.clear);
  const context: LocalBaselineContext = f.ctx;
  const auth = vi.fn(async (_task?: SessionTask) => ({
    ...context,
    identity: { ...context.identity },
    route: { ...context.route },
  }));
  const crypt = {
    ...cryptFor(context.identity, await keys()),
    reuseOpened: true as const,
    exactBaselineReuse: true as const,
    readBaseline: true as const,
    baseline: auth,
  };
  const owners: ReturnType<typeof createContentOwner>[] = [];
  const makeOwner = () => {
    const owner = createContentOwner(context.identity, 1, crypt);
    owners.push(owner);
    return owner;
  };
  clean.push(() => owners.forEach((o) => o.dispose()));
  const seed = makeOwner();
  await seed.initialize(task, { intent: '04'.repeat(16), checkCreation() {} });
  await seed.enableSpool(task);
  await f.appendOwn();
  await f.appendPeer();
  for (const row of f.rows as OpenedRecord[]) {
    const event =
      row.kind === 'heads' ||
      (row.kind === 'outbound' &&
        !new TextDecoder().decode(row.bytes).startsWith('["done/source-capture/v1"'));
    if (event) {
      const before = await seed.spoolWitness(task),
        after = await extendSpoolWitness(before, row.bytes, crypto.subtle);
      await seed.appendSpool(task, row, { before, after });
    } else await seed.append(task, [row]);
  }
  await seed.removeHistory(
    task,
    async () => {},
    () => {},
    0,
  );
  seed.dispose();
  const db = await openContentDb(
    task,
    await deriveStoreName(context.identity.principalId, context.identity.workspaceId),
    false,
  );
  clean.push(() => db.close());
  const mutate = (fn: (s: IDBObjectStore) => void) =>
    new Promise<void>((yes, no) => {
      const tx = db.transaction('meta', 'readwrite');
      fn(tx.objectStore('meta'));
      tx.oncomplete = () => yes();
      tx.onabort = () => no(tx.error);
    });
  return { f, context, crypt, auth, makeOwner, db, mutate };
}
