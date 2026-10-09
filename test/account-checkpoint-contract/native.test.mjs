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
  snapshot,
  inventory,
  args,
  open,
  edit,
  close,
} from '../account-editing/fixtures.mjs';
import { bundle } from './runtime.mjs';
import * as o from './oracle.mjs';
import * as custody from '../account-local-custody/oracle.mjs';
import { report, resultJSON } from './report.mjs';
const scripts = {};
for (const c of ['base', 'selectedCoverage', 'activeCoverage', 'startupWorkspace'])
  scripts[c] = await bundle(c === 'base' ? undefined : c, true);
async function fixture(t) {
  const f = await base(t),
    setup = f.setup;
  f.setup = async (page, c = 'base') => {
    await setup(page);
    await page.evaluate(scripts[c]);
    await page.evaluate(() => {
      window.Harness = CheckpointContract;
      CheckpointContract.observe();
    });
  };
  await f.setup(f.page);
  return f;
}
const obs = (p) => p.evaluate(() => CheckpointContract.observations());
const rows = (p, item) => p.evaluate((s) => CheckpointContract.journalRows(s), item.scope);
const removeRows = (p, rows) =>
  p.evaluate((rows) => rows.forEach(([k]) => localStorage.removeItem(k)), rows);
const restoreRows = (p, rows) =>
  p.evaluate((rows) => rows.forEach(([k, v]) => localStorage.setItem(k, v)), rows);
const retained = (p, item) =>
  p.evaluate((s) => Harness.snapshot(s).then(CheckpointContract.wire), item.scope);
async function ready(
  f,
  id,
  ops = [{ at: 4, remove: 0, insert: ' journal content', disk: false }],
  reverse = false,
) {
  const item = await f.ready(id);
  const expected = await seed(f.page, item, ops, reverse);
  await prepare(f.page, item);
  const candidate = await genesis(f.page, item);
  return { item, expected, candidate };
}
function generation(record, code) {
  const scope = {
      slotId: record.slot_id,
      principalId: record.principal_id,
      workspaceId: record.workspace_id,
    },
    lock = record.seals[0];
  const root = custody.openAES(
    custody.factorKey(scope, o.hex(Buffer.from(code.replaceAll('-', ''))), lock),
    o.bytes(lock.nonce),
    o.lp(...custody.factorFields(scope, lock)),
    o.bytes(lock.ct),
  );
  try {
    return o.hex(
      custody.openAES(
        root,
        o.bytes(record.envelope.nonce),
        o.lp(...custody.envelopeFields(scope, 1)),
        o.bytes(record.envelope.ct),
      ),
    );
  } finally {
    root.fill(0);
  }
}
test(
  'native genesis seal and read-only persisted startup share exact KDF/AAD bytes; retry never reseals',
  { timeout: 40000 },
  async (t) => {
    const f = await fixture(t),
      { item, expected, candidate } = await ready(f, 'bytes'),
      stored = await retained(f.page, item),
      kg = generation(stored.record, item.code);
    const v = {
      key: kg,
      salt: candidate.checkpoint.salt,
      nonce: candidate.checkpoint.nonce,
      plaintext: o.hex(new Uint8Array(expected.update)),
      ...candidate,
    };
    assert.equal(o.hex(o.seal(v)), candidate.checkpoint.ct);
    assert.deepEqual(await genesis(f.page, item), candidate);
    const created = await obs(f.page),
      seals = created.traces.filter((x) => x.kind === 'seal');
    assert.equal(seals.length, 1);
    assert.equal(seals[0].ct, candidate.checkpoint.ct);
    assert.equal(seals[0].plaintext, v.plaintext);
    assert(created.temporary.every((x) => x.zero));
    await admit(f.page, item);
    await handoff(f.page, item);
    const before = await inventory(f.page);
    await f.setup(f.page);
    await f.page.evaluate(() => {
      window.fetch = () => {
        throw Error('unexpected network');
      };
    });
    assert.equal((await classify(f.page, { ...item, recoveryCode: undefined })).kind, 'account');
    assert.equal(await inventory(f.page), before);
    const reopened = await obs(f.page);
    assert(reopened.temporary.length >= 1);
    assert(reopened.temporary.every((x) => x.zero));
    const keys = reopened.traces.filter((x) => x.kind === 'key');
    assert.equal(keys.length, 1);
    assert.deepEqual(keys[0].usages, ['decrypt']);
    assert.equal(keys[0].info, o.hex(o.lp(...o.infoFields(v))));
    assert.equal(keys[0].salt, v.salt);
    assert.equal(keys[0].extractable, false);
    assert.equal(reopened.traces.filter((x) => x.kind === 'seal').length, 0);
    assert(
      reopened.traces
        .filter((x) => x.kind === 'open')
        .every(
          (x) =>
            x.aad === o.hex(o.lp(...o.aadFields(v))) &&
            x.ct === candidate.checkpoint.ct &&
            x.tagLength === 128,
        ),
    );
    await f.setup(f.page, 'startupWorkspace');
    await assert.rejects(classify(f.page, item));
    assert.equal(await inventory(f.page), before);
    report('native-bytes', {
      created,
      reopened,
      startupWorkspaceOmission: 'refused',
      inventoryUnchanged: true,
      retrySeals: seals.length,
    });
  },
);
test(
  'persisted selected and active startup refuse missing writing; source omission controls really accept it',
  { timeout: 40000 },
  async (t) => {
    const f = await fixture(t),
      { item } = await ready(f, 'coverage');
    await admit(f.page, item);
    await handoff(f.page, item);
    const journal = await rows(f.page, item);
    assert(journal.length > 0);
    await removeRows(f.page, journal);
    const damaged = await inventory(f.page);
    await f.setup(f.page);
    await assert.rejects(classify(f.page, item), /Account checkpoint differs from retained source/);
    assert.equal(await inventory(f.page), damaged);
    const refused = await obs(f.page);
    assert(refused.temporary.every((x) => x.zero));
    await f.setup(f.page, 'selectedCoverage');
    assert.equal((await classify(f.page, item)).kind, 'account');
    assert.equal(await inventory(f.page), damaged);
    await restoreRows(f.page, journal);
    await f.setup(f.page);
    assert.equal((await classify(f.page, item)).kind, 'account');
    const view = await open(f.page, item);
    const text = await edit(f.page, 0, 0, 'later ');
    assert.equal(text, 'later ' + view.master);
    await close(f.page);
    await f.setup(f.page);
    assert.equal((await open(f.page, item)).master, text);
    await close(f.page);
    await f.page.evaluate(
      (item) => Harness.contentFault(item.slotId, item.code, 'erase'),
      args(item),
    );
    await removeRows(f.page, await rows(f.page, item));
    const empty = await inventory(f.page);
    await f.setup(f.page);
    await assert.rejects(classify(f.page, item), /Account checkpoint differs from retained source/);
    assert.equal(await inventory(f.page), empty);
    await f.setup(f.page, 'activeCoverage');
    assert.equal((await classify(f.page, item)).kind, 'account');
    assert.equal(await inventory(f.page), empty);
    report('native-coverage', {
      selected: { baseline: 'refused', omission: 'accepted missing journal', readOnly: true },
      active: { baseline: 'refused', omission: 'accepted erased content', readOnly: true },
      laterEditReopened: text,
      refused,
    });
  },
);
test(
  'local MAC cannot substitute for pinned receipt, candidate signature or authenticated checkpoint',
  { timeout: 40000 },
  async (t) => {
    const f = await fixture(t),
      { item } = await ready(f, 'authority');
    await admit(f.page, item);
    await handoff(f.page, item);
    const marker = (await snapshot(f.page, item)).marker,
      results = [];
    for (const field of ['receipt', 'candidate', 'salt', 'nonce', 'ct']) {
      await f.page.evaluate(
        ({ item, field }) => CheckpointContract.tamper(item.slotId, item.code, field),
        { item: args(item), field },
      );
      const before = await inventory(f.page);
      await f.setup(f.page);
      await assert.rejects(classify(f.page, item));
      assert.equal(await inventory(f.page), before);
      const observed = await obs(f.page);
      assert.equal(observed.traces.length, 0, 'authority refusal precedes checkpoint decryption');
      results.push({ field, refusedBeforeCheckpoint: true, readOnly: true });
      await f.page.evaluate(
        ({ item, marker }) => Harness.put([item.slotId, 'application-upgrade'], marker),
        { item: args(item), marker },
      );
    }
    assert.equal((await classify(f.page, item)).kind, 'account');
    const before = await inventory(f.page);
    await assert.rejects(
      f.page.evaluate(
        (item) =>
          Harness.classifyAccountStartup({
            ...item,
            pin: { ...pin, authRoot: '00'.repeat(32) },
            assertPasskey,
          }),
        args(item),
      ),
    );
    assert.equal(await inventory(f.page), before);
    report('native-authority', { results, wrongPin: 'refused', restored: 'account' });
  },
);
test(
  '24 shrinking-enabled native histories cold replay inserts/deletions and refuse loss of their admitted journal',
  { timeout: 120000 },
  async (t) => {
    const f = await fixture(t),
      histories = [];
    let index = 0;
    const result = await fc.check(
      fc.asyncProperty(
        fc.array(
          fc.record({
            at: fc.nat(100),
            remove: fc.nat(4),
            insert: fc.string({ minLength: 1, maxLength: 15 }),
            disk: fc.boolean(),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        fc.boolean(),
        async (ops, reverse) => {
          await f.setup(f.page); // Independent scopes on every run, including shrink attempts.
          ops = [...ops, { at: 0, remove: 0, insert: ' mandatory journal suffix ', disk: false }];
          const { item, expected } = await ready(f, 'history-' + index++, ops, reverse);
          let text = 'base';
          for (const op of ops) {
            const at = op.at % (text.length + 1);
            text =
              text.slice(0, at) +
              op.insert +
              text.slice(at + Math.min(op.remove, text.length - at));
          }
          assert.equal(expected.state.json.master, text);
          await admit(f.page, item);
          await handoff(f.page, item);
          await f.setup(f.page);
          assert.equal((await classify(f.page, item)).kind, 'account');
          const journal = await rows(f.page, item);
          assert(journal.length > 0);
          await removeRows(f.page, journal);
          const before = await inventory(f.page);
          await f.setup(f.page);
          await assert.rejects(classify(f.page, item));
          assert.equal(await inventory(f.page), before);
          await restoreRows(f.page, journal);
          await f.setup(f.page);
          assert.equal((await classify(f.page, item)).kind, 'account');
          histories.push({ ops, reverse, expected: text, refusedMissingJournal: true });
        },
      ),
      { seed: 5110932, numRuns: 24 },
    );
    report('native-properties', { ...resultJSON(result), histories });
    assert.equal(result.failed, false, String(result.errorInstance));
  },
);
