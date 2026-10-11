import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { resolve } from 'node:path';
import { native, selected } from '../account-delivery/fixtures.mjs';

async function bundle(weakIdentity = false) {
  let hits = 0;
  const output = await build({
    configFile: false,
    logLevel: 'error',
    plugins: weakIdentity
      ? [
          {
            name: 'cold-recovery-identity-control',
            enforce: 'pre',
            transform(code, id) {
              if (!id.endsWith('/src/crdt/custody.ts')) return;
              const anchor = 'if (view && view === validatedView) return;';
              assert.equal(code.split(anchor).length, 2);
              hits++;
              return code.replace(anchor, 'if (validatedView) return;');
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-cold-recovery/browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  assert.equal(hits, weakIdentity ? 1 : 0);
  return (Array.isArray(output) ? output[0] : output).output.find((f) => f.type === 'chunk').code;
}
const script = await bundle();
async function ready(t) {
  const f = await native(t, script),
    item = await selected(f, 'recovery');
  const exercise = (fault = 'none', reuse = true) =>
    f.page.evaluate(
      ({ slot, code, fault, reuse }) => Harness.recoveryBoundary(slot, code, fault, reuse),
      { slot: item.slotId, code: item.code, fault, reuse },
    );
  return { f, exercise };
}
test(
  'only opted-in exact snapshots reuse validation, and nothing survives a recovery owner',
  { timeout: 40000 },
  async (t) => {
    const { exercise } = await ready(t);
    for (const reuse of [false, true, true]) {
      const r = await exercise('none', reuse);
      assert.equal(r.validations, reuse ? 1 : 2);
      assert.equal(r.delivered, true);
      assert.equal(r.erased, true);
      assert.equal(r.error, '');
    }
  },
);
for (const fault of ['missing', 'row', 'ciphertext', 'counter-mac'])
  test(
    `a ${fault} change between the two physical reads refuses recovery`,
    { timeout: 40000 },
    async (t) => {
      const { exercise } = await ready(t),
        r = await exercise(fault);
      assert.equal(r.delivered, false);
      assert.equal(r.erased, true);
      assert.equal(r.validations, ['missing', 'row'].includes(fault) ? 2 : 1);
      assert.match(
        r.error,
        ['missing', 'row'].includes(fault) ? /Semantic snapshot changed/ : /authentication failed/,
      );
    },
  );
test(
  'authenticated counter-only change forces another validation; late journal entries remain visible',
  { timeout: 40000 },
  async (t) => {
    const { exercise } = await ready(t),
      c = await exercise('counter');
    assert.equal(c.error, '');
    assert.equal(c.delivered, true);
    assert.equal(c.validations, 2);
    assert.equal(c.finalCounter, c.firstCounter + 1);
    assert.equal(c.erased, true);
    const j = await exercise('journal');
    assert.equal(j.error, '');
    assert.equal(j.validations, 1);
    assert.equal(j.journal, 1);
    assert.equal(j.erased, true);
  },
);
for (const fault of ['fail', 'cancel'])
  test(
    `${fault} during verification cannot install success or outlive cleanup`,
    { timeout: 40000 },
    async (t) => {
      const { exercise } = await ready(t),
        r = await exercise(fault);
      assert.equal(r.delivered, false);
      assert.equal(r.validations, 1);
      assert.equal(r.erased, true);
      assert.match(
        r.error,
        fault === 'fail' ? /Validation refused/ : /no longer live|cancel|inactive/i,
      );
      const next = await exercise();
      assert.equal(next.delivered, true);
      assert.equal(next.validations, 1);
      assert.equal(next.erased, true);
    },
  );
test(
  'weakening exact identity to any prior success exposes missing-row acceptance',
  { timeout: 40000 },
  async (t) => {
    const { f, exercise } = await ready(t);
    await f.page.evaluate(await bundle(true));
    const r = await exercise('missing');
    assert.equal(r.validations, 1);
    assert.equal(r.delivered, true);
    assert.equal(r.error, '');
  },
);
