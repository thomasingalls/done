// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createContentOwner } from '../src/crdt/contentStore';
import { extendSpoolWitness } from '../src/crdt/spoolRecord';
import { MaintenanceInterrupted } from '../src/crdt/contentMaintenance';
import type { OpenedRecord } from '../src/crdt/contentRecord';
import { oneShotFixture, task } from './local-baseline/one-shot-fixture';

const clean: (() => void)[] = [];
afterEach(() => {
  clean.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function fixture() {
  const x = await oneShotFixture(clean);
  const owner = createContentOwner(x.context.identity, 1, { ...x.crypt, warmLoads: true });
  clean.push(() => owner.dispose());
  await owner.initialize(task);
  await owner.loadAccount(task);
  let persisted = x.f.rows.length;
  const append = async () => {
    await x.f.appendOwn();
    const added = (x.f.rows as OpenedRecord[]).slice(persisted);
    for (const row of added) {
      const event =
        row.kind === 'heads' ||
        (row.kind === 'outbound' &&
          !new TextDecoder().decode(row.bytes).startsWith('["done/source-capture/v1"'));
      if (event) {
        const before = await owner.spoolWitness(task),
          after = await extendSpoolWitness(before, row.bytes, crypto.subtle);
        await owner.appendSpool(task, row, { before, after });
      } else await owner.append(task, [row]);
    }
    persisted = x.f.rows.length;
    return added.length;
  };
  return { ...x, owner, append };
}
it('physical suffix pressure survives rolling ciphertext audit hits until the semantic oracle completes', async () => {
  const x = await fixture();
  expect(x.owner.pendingWarmAuditRows()).toBe(0);
  const added = await x.append();
  await x.owner.loadAccount(task);
  expect(added).toBeGreaterThan(0);
  expect(x.owner.pendingWarmAuditRows()).toBe(added);
  // These regular authenticated reads can finish their rolling ciphertext audit.
  // They must not reset the independent full semantic-oracle pressure.
  for (let n = 0; n < 4; n++) await x.owner.loadAccount(task);
  expect(x.owner.pendingWarmAuditRows()).toBe(added);
  const now = performance.now();
  vi.spyOn(performance, 'now').mockReturnValue(now + 300_001);
  for (let n = 0; n < 100; n++) {
    if (await x.owner.auditWarm(task)) break;
    if (n === 99) throw Error('Audit did not complete');
  }
  expect(x.owner.pendingWarmAuditRows()).toBe(0);
  expect(x.owner.warmAuditDue()).toBe(false);
});
it('an unconsumed committed suffix still contributes physical pressure and reaches the same full replay', async () => {
  const x = await fixture();
  await x.append();
  expect(x.owner.pendingWarmAuditRows()).toBeGreaterThan(0);
  const now = performance.now();
  vi.spyOn(performance, 'now').mockReturnValue(now + 300_001);
  for (let n = 0; n < 100; n++) {
    if (await x.owner.auditWarm(task)) break;
    if (n === 99) throw Error('Audit did not complete');
  }
  expect(x.owner.pendingWarmAuditRows()).toBe(0);
  const warm = await x.owner.loadAccount(task);
  x.owner.dispose();
  const cold = createContentOwner(x.context.identity, 1, { ...x.crypt, warmLoads: true });
  clean.push(() => cold.dispose());
  await cold.initialize(task);
  expect(await cold.loadAccount(task)).toEqual(warm);
});
it('interrupted maintenance cannot clear physical pressure or replace the retained view', async () => {
  const x = await fixture();
  await x.append();
  await x.owner.loadAccount(task);
  const pressure = x.owner.pendingWarmAuditRows();
  const interrupted = {
    ...task,
    step() {
      throw new MaintenanceInterrupted();
    },
  };
  await expect(x.owner.auditWarm(interrupted)).rejects.toBeInstanceOf(MaintenanceInterrupted);
  expect(x.owner.pendingWarmAuditRows()).toBe(pressure);
  expect((await x.owner.loadAccount(task)).kind).toBe('baseline-plus-suffix');
});
it('physical pressure includes fresh commits after an already consumed suffix without double counting', async () => {
  const x = await fixture();
  const first = await x.append();
  await x.owner.loadAccount(task);
  expect(x.owner.pendingWarmAuditRows()).toBe(first);
  const second = await x.append();
  expect(x.owner.pendingWarmAuditRows()).toBe(first + second);
  await x.owner.loadAccount(task);
  expect(x.owner.pendingWarmAuditRows()).toBe(first + second);
});
