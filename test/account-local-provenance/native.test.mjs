import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  native as base,
  seed,
  prepare,
  genesis,
  admit,
  handoff,
  classify,
  inventory,
  args,
} from '../account-handoff/fixtures.mjs';
import { bundle } from './runtime.mjs';
import * as o from './oracle.mjs';
import * as c from '../account-local-custody/oracle.mjs';
import { report, resultJSON } from '../account-checkpoint-contract/report.mjs';
const scripts = {};
for (const variant of ['base', 'claimMac', 'barriers'])
  scripts[variant] = await bundle(variant === 'base' ? undefined : variant, true);
async function fixture(t) {
  const f = await base(t),
    setup = f.setup;
  f.setup = async (page, variant = 'base') => {
    await setup(page);
    await page.evaluate(scripts[variant]);
    await page.evaluate(() => {
      window.Harness = LocalProvenance;
    });
  };
  await f.setup(f.page);
  return f;
}
const stored = (p, i) => p.evaluate((slot) => LocalProvenance.storedClaim(slot), i.slotId);
const put = (p, i, claim) =>
  p.evaluate(({ slot, claim }) => Harness.put([slot, 'local-genesis-v1'], claim), {
    slot: i.slotId,
    claim,
  });
const variant = (p, i, cleanup) =>
  p.evaluate(
    ({ item, imported, cleanup }) =>
      LocalProvenance.installVariant(item.slotId, item.code, imported, cleanup),
    { item: args(i), imported: o.imported(), cleanup },
  );
function validate(r, code) {
  const s = {
      slotId: r.initial.slot_id,
      principalId: r.initial.principal_id,
      workspaceId: r.initial.workspace_id,
    },
    lock = r.initial.seals[0];
  const root = c.openAES(
    c.factorKey(s, o.hex(Buffer.from(code.replaceAll('-', ''))), lock),
    o.bytes(lock.nonce),
    o.lp(...c.factorFields(s, lock)),
    o.bytes(lock.ct),
  );
  try {
    assert.equal(o.hex(o.mac(o.key(r.initial, undefined, o.hex(root)), o.encode(r))), r.mac);
  } finally {
    root.fill(0);
  }
}
const inspect = (p, i) =>
  p.evaluate((i) => Harness.inspectLocalPromotion({ ...i, pin, proveAuthority: prove }), args(i));
test(
  'native fresh/imported/cleanup claims retain exact authentication through full Account handoff and cold startup',
  { timeout: 60000 },
  async (t) => {
    const f = await fixture(t),
      evidence = [];
    for (const kind of ['fresh', 'imported', 'cleanup1', 'cleanup2']) {
      await f.setup(f.page, 'barriers');
      const item = await f.ready(kind);
      await seed(f.page, item, [{ at: 4, remove: 0, insert: ' persisted ' + kind, disk: false }]);
      if (kind !== 'fresh')
        await variant(
          f.page,
          item,
          kind.startsWith('cleanup') ? o.cleanup(kind === 'cleanup1' ? 1 : 2) : undefined,
        );
      const claim = await stored(f.page, item);
      const wire = await f.page.evaluate((claim) => LocalProvenance.wire(claim), claim);
      validate(wire, item.code);
      await prepare(f.page, item);
      await genesis(f.page, item);
      await admit(f.page, item);
      await handoff(f.page, item);
      const before = await inventory(f.page);
      await f.setup(f.page, 'barriers');
      await f.page.evaluate(() => {
        window.fetch = () => {
          throw Error('unexpected network');
        };
      });
      assert.equal((await classify(f.page, item)).kind, 'account');
      assert.equal(await inventory(f.page), before);
      assert.deepEqual(await stored(f.page, item), claim);
      evidence.push({ kind, mac: wire.mac, readOnly: true, outsideAccountCalls: 0 });
    }
    const probes = await f.page.evaluate(() => LocalProvenance.probeExcluded());
    for (const [i, name] of ['clear', 'import', 'source', 'fingerprint'].entries())
      assert.match(probes[i], new RegExp('D8 excluded call: ' + name));
    report('native-claims', {
      evidence,
      probes,
      scope:
        'Imported provenance is synthetically factor-authenticated for this boundary test; existing migration campaigns qualify creation of it.',
    });
  },
);
test(
  'claim MAC refusal is effective before promotion; Account also binds the exact winning claim MAC',
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t),
      item = await f.ready('claim-mac');
    await seed(f.page, item, []);
    const claim = await stored(f.page, item),
      bad = structuredClone(claim);
    bad.mac[0] ^= 1;
    await put(f.page, item, bad);
    const before = await inventory(f.page);
    await assert.rejects(inspect(f.page, item), /local-progress-authentication-failed/);
    assert.equal(await inventory(f.page), before);
    await f.setup(f.page, 'claimMac');
    const accepted = await inspect(f.page, item);
    assert.equal(accepted.kind, 'promotion-preflight');
    await put(f.page, item, claim);
    await f.setup(f.page);
    await prepare(f.page, item);
    await genesis(f.page, item);
    await admit(f.page, item);
    await handoff(f.page, item);
    await put(f.page, item, bad);
    await f.setup(f.page);
    await assert.rejects(classify(f.page, item), /local-progress-authentication-failed/);
    await f.setup(f.page, 'claimMac');
    await assert.rejects(classify(f.page, item));
    await put(f.page, item, claim);
    await f.setup(f.page);
    assert.equal((await classify(f.page, item)).kind, 'account');
    report('native-mac-control', {
      beforePromotion: { baseline: 'refused', omission: accepted.kind },
      afterPromotion: { baseline: 'refused', omission: 'still refused by marker binding' },
      restored: 'account',
    });
  },
);
test(
  'preactive import and Local clear carriers only block Account open; scoped deletion never runs',
  { timeout: 30000 },
  async (t) => {
    const f = await fixture(t),
      item = await f.ready('blockers');
    await seed(f.page, item, []);
    await prepare(f.page, item);
    await genesis(f.page, item);
    await admit(f.page, item);
    await handoff(f.page, item);
    const cases = [
      ['legacy-import-v1', {}],
      ['local-clear-v1', {}],
      [
        'local-clear-v1',
        await f.page.evaluate((slot) => LocalProvenance.blockingClear(slot), item.slotId),
      ],
    ];
    const evidence = [];
    for (const [key, value] of cases) {
      await f.page.evaluate(({ slot, key, value }) => Harness.put([slot, key], value), {
        slot: item.slotId,
        key,
        value,
      });
      const before = await inventory(f.page);
      await f.setup(f.page, 'barriers');
      await assert.rejects(classify(f.page, item));
      assert.equal(await inventory(f.page), before);
      await f.page.evaluate(({ slot, key }) => Harness.remove([slot, key]), {
        slot: item.slotId,
        key,
      });
      evidence.push({ key, refused: true, readOnly: true });
    }
    assert.equal((await classify(f.page, item)).kind, 'account');
    report('native-blockers', evidence);
  },
);
test(
  '20 shrinking-enabled imported-claim histories reject changed provenance and recover after exact restoration',
  { timeout: 90000 },
  async (t) => {
    const f = await fixture(t);
    let index = 0;
    const histories = [];
    const result = await fc.check(
      fc.asyncProperty(
        fc.constantFrom(1, 2),
        fc.integer({ min: 0, max: 2 }),
        fc.constantFrom('sourceDigest', 'createdAt', 'cleanupDigest', 'cleanupNext'),
        async (version, next, field) => {
          await f.setup(f.page);
          const item = await f.ready('history-' + index++);
          await seed(f.page, item, []);
          await variant(f.page, item, { ...o.cleanup(version), next });
          await prepare(f.page, item);
          await genesis(f.page, item);
          await admit(f.page, item);
          await handoff(f.page, item);
          const claim = await stored(f.page, item),
            bad = structuredClone(claim);
          if (field === 'sourceDigest') bad.imported.sourceDigest = 'fe'.repeat(32);
          if (field === 'createdAt') bad.imported.createdAt = '2026-09-12T00:00:00.000Z';
          if (field === 'cleanupDigest') bad.sourceCleanup.entries[0].digest = 'fa'.repeat(32);
          if (field === 'cleanupNext') bad.sourceCleanup.next = (next + 1) % 4;
          await put(f.page, item, bad);
          const before = await inventory(f.page);
          await f.setup(f.page);
          await assert.rejects(classify(f.page, item), /local-progress-authentication-failed/);
          assert.equal(await inventory(f.page), before);
          await put(f.page, item, claim);
          await f.setup(f.page);
          assert.equal((await classify(f.page, item)).kind, 'account');
          histories.push({ version, next, field, refused: true });
        },
      ),
      { seed: 5110941, numRuns: 20 },
    );
    report('native-properties', { ...resultJSON(result), histories });
    assert.equal(result.failed, false, String(result.errorInstance));
  },
);
