// @vitest-environment node
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { Y } from '../src/crdt/yjs';
import { createPrivateMigration, type SavedFile } from '../src/ui/privateMigration';
import type { createLegacyCoordinator, MigrationInspection } from '../src/crdt/legacyCoordinator';

const origin = 'https://private.test';
const file = (bytes: Uint8Array<ArrayBuffer>): SavedFile => ({
  size: bytes.length,
  arrayBuffer: async () => bytes.slice().buffer,
});
const fixture = () => {
  const doc = new Y.Doc();
  doc.getMap('meta').set('schemaVersion', 4);
  doc.getText('master').insert(0, 'saved writing');
  const recovery = new TextEncoder().encode(
    JSON.stringify({
      kind: 'done-legacy-source-recovery',
      v: 1,
      origin,
      sourceDigest: '1'.repeat(64),
      records: [
        {
          carrier: 'disk',
          id: 1,
          update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
        },
      ],
    }),
  );
  doc.destroy();
  const binding = {
    kind: 'done-private-migration-binding',
    v: 1,
    policy: 'markdown-system-v1',
    sourceOrigin: origin,
    sourceDigest: '1'.repeat(64),
    recoveryDigest: createHash('sha256').update(recovery).digest('hex'),
  };
  return {
    recovery,
    binding,
    packet: file(recovery),
    bindingFile: file(new TextEncoder().encode(JSON.stringify(binding))),
  };
};
const fake = (retained = false) => {
  const close = vi.fn(async () => {});
  const inspect = vi.fn(
    async (code?: string): Promise<MigrationInspection> =>
      retained
        ? code === undefined
          ? { kind: 'unlock-required', owner: 'import' }
          : {
              kind: 'import',
              stage: 'importing',
              storeId: 'store',
              intentId: 'intent',
              input: 'verified',
              cleanup: 'pending',
            }
        : { kind: 'unused' },
  );
  const cancel = vi.fn();
  const confirm = vi.fn(async () => {
    retained = true;
  });
  const enroll = vi.fn(() => ({ displayCode: 'saved-factor', confirm, cancel }));
  const capture = vi.fn(async () => {
    throw Error('No synthetic capture supplied.');
  });
  const advance = vi.fn(async () => {});
  const coordinator = { close, inspect, enroll, capture, advance } as unknown as ReturnType<
    typeof createLegacyCoordinator
  >;
  return { coordinator, close, inspect, enroll, capture, advance, confirm, cancel };
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};

it('generated recovery and binding corruptions cannot reach enrollment', async () => {
  const saved = fixture();
  await fc.assert(
    fc.asyncProperty(
      fc.nat(),
      fc.integer({ min: 1, max: 255 }),
      fc.boolean(),
      async (index, xor, packetMutation) => {
        const deps = fake();
        const owner = createPrivateMigration({ ...deps, origin, checkBrowser: async () => {} });
        await owner.acknowledgeHost();
        const altered = saved.recovery.slice();
        altered[index % altered.length] = altered[index % altered.length]! ^ xor;
        const badBinding = file(
          new TextEncoder().encode(
            JSON.stringify({ ...saved.binding, sourceDigest: '2'.repeat(64) }),
          ),
        );
        await owner.load(
          packetMutation ? file(altered) : saved.packet,
          packetMutation ? saved.bindingFile : badBinding,
        );
        await owner.enroll();
        owner.savedCode();
        await owner.confirm('saved-factor');
        expect(deps.enroll).not.toHaveBeenCalled();
        expect(deps.confirm).not.toHaveBeenCalled();
        expect(owner.getSnapshot().error).not.toBe('');
        await owner.close();
      },
    ),
    { seed: 8941, numRuns: 200 },
  );
});

it('generated UI actions on retained intent never offer capture or replacement enrollment', async () => {
  const saved = fixture();
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 0, max: 8 }), { maxLength: 30 }),
      async (actions) => {
        const deps = fake(true);
        const owner = createPrivateMigration({ ...deps, origin, checkBrowser: async () => {} });
        for (const action of actions) {
          if (action === 0) await owner.acknowledgeHost();
          if (action === 1) await owner.capture();
          if (action === 2) await owner.load(saved.packet, saved.bindingFile);
          if (action === 3) await owner.enroll();
          if (action === 4) owner.savedCode();
          if (action === 5) await owner.confirm('saved-factor');
          if (action === 6) await owner.unlock('saved-factor');
          if (action === 7) await owner.advance('import');
          if (action === 8) await owner.close();
        }
        expect(deps.enroll).not.toHaveBeenCalled();
        expect(deps.capture).not.toHaveBeenCalled();
        expect(deps.confirm).not.toHaveBeenCalled();
        await owner.close();
      },
    ),
    { seed: 8941, numRuns: 150 },
  );
});

it('requires separate code confirmation and rechecks retained intent before enrollment', async () => {
  const saved = fixture();
  const deps = fake();
  const owner = createPrivateMigration({ ...deps, origin, checkBrowser: async () => {} });
  await owner.acknowledgeHost();
  await owner.load(saved.packet, saved.bindingFile);
  await owner.enroll();
  expect(owner.getSnapshot().code).toBe('saved-factor');
  await owner.confirm('saved-factor');
  expect(deps.confirm).not.toHaveBeenCalled();
  owner.savedCode();
  expect(owner.getSnapshot().code).toBe(null);
  await owner.confirm('saved-factor');
  expect(deps.confirm).toHaveBeenCalledTimes(1);
  expect(owner.getSnapshot().phase).toBe('authenticated');
  await owner.close();
  expect(JSON.stringify(owner.getSnapshot())).not.toContain('saved writing');
  const changed = fake();
  const other = createPrivateMigration({ ...changed, origin, checkBrowser: async () => {} });
  await other.acknowledgeHost();
  await other.load(saved.packet, saved.bindingFile);
  changed.inspect.mockResolvedValue({ kind: 'unlock-required', owner: 'import' });
  await other.enroll();
  expect(changed.enroll).not.toHaveBeenCalled();
  expect(other.getSnapshot().error).toContain('retained migration');
  await other.close();
});

it('close during saved-file read drains and erases late bytes without publishing a verified result', async () => {
  const saved = fixture();
  const deps = fake();
  const owner = createPrivateMigration({ ...deps, origin, checkBrowser: async () => {} });
  await owner.acknowledgeHost();
  const started = deferred<void>(),
    read = deferred<ArrayBuffer>();
  const operation = owner.load(
    {
      size: saved.recovery.length,
      arrayBuffer: () => {
        started.resolve();
        return read.promise;
      },
    },
    saved.bindingFile,
  );
  await started.promise;
  const closing = owner.close();
  let drained = false;
  void closing.then(() => {
    drained = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(drained).toBe(false);
  const late = saved.recovery.slice();
  read.resolve(late.buffer);
  await Promise.all([operation, closing]);
  expect(late.every((value) => value === 0)).toBe(true);
  expect(owner.getSnapshot().phase).toBe('closed');
  expect(owner.getSnapshot().entries).toEqual([]);
  expect(deps.inspect).toHaveBeenCalledTimes(1);
});

it('closing from a busy notification cannot start a native operation and waits for the browser check', async () => {
  const deps = fake(),
    checked = deferred<void>();
  const owner = createPrivateMigration({ ...deps, origin, checkBrowser: () => checked.promise });
  owner.subscribe(() => {
    if (owner.getSnapshot().busy) void owner.close();
  });
  const running = owner.acknowledgeHost();
  let drained = false;
  const closed = owner.close().then(() => {
    drained = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(drained).toBe(false);
  checked.resolve();
  await Promise.all([running, closed]);
  expect(deps.inspect).not.toHaveBeenCalled();
  expect(deps.close).toHaveBeenCalledTimes(1);
});
