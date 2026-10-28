// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import {
  preparationContext,
  parsePreparationPrefix,
} from '../src/crdt/retentionPreparationBinding';
import { cryptFor, keys } from './local-baseline/anchor-fixture';
import { task } from './local-baseline/one-shot-fixture';
import type { LocalBaselineContext } from '../src/crdt/localBaselineReplay';
// @ts-expect-error Shared independently built real Account protocol fixture.
import { memberFixture } from './local-baseline/fixtures.mjs';
const clean: (() => void)[] = [];
afterEach(() => clean.splice(0).forEach((f) => f()));
async function fixture() {
  const f = await memberFixture();
  clean.push(f.clear);
  const c: LocalBaselineContext = f.ctx,
    k = await keys(),
    crypt = cryptFor(c.identity, k);
  return { c, auth: { sign: (b: Uint8Array<ArrayBuffer>) => crypt.sign(task, b) } };
}
it('fresh scope, verifier implementation, key material and authority partition durable reuse', async () => {
  const { c, auth } = await fixture(),
    implementation = '01'.repeat(32),
    intent = '02'.repeat(16);
  const original = c.inbound.generationKey.slice(),
    first = await preparationContext(c, implementation, intent, auth);
  expect(await preparationContext(c, implementation, intent, auth)).toBe(first);
  expect(await preparationContext(c, '02'.repeat(32), intent, auth)).not.toBe(first);
  expect(await preparationContext(c, implementation, '03'.repeat(16), auth)).not.toBe(first);
  expect(
    await preparationContext(
      { ...c, identity: { ...c.identity, rootId: 'ff'.repeat(16) } },
      implementation,
      intent,
      auth,
    ),
  ).not.toBe(first);
  const changed = c.inbound.generationKey.map((b) => b ^ 1);
  expect(
    await preparationContext(
      { ...c, inbound: { ...c.inbound, generationKey: changed } },
      implementation,
      intent,
      auth,
    ),
  ).not.toBe(first);
  expect(c.inbound.generationKey).toEqual(original);
  expect(changed.some((b) => b !== 0)).toBe(true);
  await expect(preparationContext(c, '', intent, auth)).rejects.toThrow('identity required');
});
it('context capture owns mutable input before asynchronous hashing or signing', async () => {
  const { c, auth } = await fixture(),
    before = c.inbound.generationKey.slice(),
    expected = await preparationContext(c, '01'.repeat(32), '02'.repeat(16), auth);
  const pending = preparationContext(c, '01'.repeat(32), '02'.repeat(16), auth);
  c.inbound.generationKey[0]! ^= 1;
  expect(await pending).toBe(expected);
  c.inbound.generationKey.set(before);
});
it('native prefix grammar refuses unknown fields, inconsistent allocation sums and cursor/witness shapes', () => {
  const value = {
    through: 2,
    records: 1,
    digest: '00'.repeat(32),
    generation: 1,
    intent: 'ab'.repeat(16),
    reserved: [[1, 1]],
    events: 0,
    witness: '00'.repeat(32),
  };
  expect(parsePreparationPrefix(value)).toEqual(value);
  for (const bad of [
    { ...value, extra: true },
    { ...value, through: 3 },
    { ...value, events: -1 },
    {
      ...value,
      reserved: [
        [1, 1],
        [1, 0],
      ],
    },
    { ...value, digest: 'x' },
  ])
    expect(() => parsePreparationPrefix(bad)).toThrow();
});
