import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import {
  native,
  selected,
  open,
  edit,
  close,
  cold,
  inventory,
} from '../account-editing/fixtures.mjs';

const artifact = (name, value) => {
  if (process.env.OUTBOUND_REPORT_DIR)
    writeFileSync(
      join(process.env.OUTBOUND_REPORT_DIR, name),
      JSON.stringify(value, null, 2) + '\n',
    );
};
async function codec(control) {
  let applied = 0;
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'outbound-control',
            enforce: 'pre',
            transform(code, id) {
              if (!id.endsWith('/account-protocol/envelope.ts')) return;
              const anchor = `throw Error('Envelope ${control} mismatch');`;
              assert.equal(code.split(anchor).length, 2, 'unique mutation anchor');
              applied++;
              return code.replace(anchor, 'void 0;');
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('account-protocol/envelope.ts'),
        name: 'Envelope',
        formats: ['iife'],
      },
    },
  });
  if (control) assert.equal(applied, 1);
  const script = (Array.isArray(result) ? result[0] : result).output.find(
    (f) => f.type === 'chunk',
  ).code;
  return new Function(script + '\nreturn Envelope;')();
}
test(
  'real content-blind codec controls accept the respective bad envelope when each guard is removed',
  { timeout: 30000 },
  async () => {
    const suite = JSON.parse(readFileSync('test/vectors/private-envelope.json', 'utf8')),
      v = suite.vectors[0],
      bytes = (s) => new Uint8Array(Buffer.from(s, 'hex')),
      verifier = await crypto.subtle.importKey(
        'raw',
        bytes(suite.keys.device.public_key),
        'Ed25519',
        false,
        ['verify'],
      );
    const route = {
      v: 2,
      workspace_id: v.inputs.workspace_id,
      credential_id: v.inputs.credential_id,
      epoch: 7,
      gen: 1,
    };
    const e = {
      ...route,
      v: 2,
      seq: 2,
      nonce: bytes(v.inputs.nonce),
      digest: bytes(v.expected.digest),
      ct: bytes(v.expected.ciphertext),
      sig: bytes(v.expected.signature),
    };
    const baseline = await codec();
    const cases = [];
    const recorded = (value) => ({
      ...value,
      nonce: Buffer.from(value.nonce).toString('hex'),
      ct: Buffer.from(value.ct).toString('hex'),
      digest: Buffer.from(value.digest).toString('hex'),
      sig: Buffer.from(value.sig).toString('hex'),
    });
    for (const control of ['signature', 'digest', 'route']) {
      const mutated = await codec(control),
        bad = structuredClone(e),
        expected = { ...route };
      if (control === 'signature') bad.sig.fill(0);
      if (control === 'digest') bad.ct[0] ^= 1;
      if (control === 'route') expected.workspace_id = 'wrong-workspace';
      const wire = baseline.encodeNetworkEnvelope(bad);
      await assert.rejects(
        baseline.verifyNetworkEnvelope(wire, expected, verifier),
        new RegExp(control),
      );
      const accepted = await mutated.verifyNetworkEnvelope(wire, expected, verifier);
      assert.deepEqual(accepted, bad);
      cases.push({
        control,
        original: recorded(e),
        expected,
        accepted: recorded(accepted),
        baseline: 'refused',
        mutant: 'bad content-blind acceptance observed',
        limit:
          'This verifier is not connected to a relay; it does not grant membership or acceptance.',
      });
    }
    artifact('codec-controls.json', cases);
  },
);

test(
  'real Account journal survives a failed outgoing observer and renderer death; no outbox is reconstructed',
  { timeout: 45000 },
  async (t) => {
    const f = await native(t),
      item = await selected(f, 'outbound-gap');
    await open(f.page, item);
    await f.page.evaluate(() => {
      const original = window.setTimeout;
      window.setTimeout = function (fn, ms, ...rest) {
        // Keep this test's edit journal-only until explicit crash. Not an application change.
        return original.call(this, fn, ms === 250 ? 60000 : ms, ...rest);
      };
      window.observed = 0;
      editor.outgoing(() => {
        window.observed++;
        throw Error('Simulated outbox persistence failure');
      });
    });
    const before = JSON.parse(await inventory(f.page));
    const acceptedText = await edit(f.page, 4, 0, ' retained');
    assert.equal(acceptedText, 'base retained original');
    const after = JSON.parse(await inventory(f.page));
    const observerCalls = await f.page.evaluate(() => observed);
    assert.equal(observerCalls, 1);
    assert.ok(
      Object.keys(after[1]).length > Object.keys(before[1]).length,
      'new synchronous journal entry exists',
    );
    assert.deepEqual(after[0], before[0], 'no asynchronous database/outbox write has occurred');
    const cdp = await f.context.newCDPSession(f.page),
      crashed = f.page.waitForEvent('crash');
    void cdp.send('Page.crash').catch(() => {});
    await crashed;
    await cold(f);
    const recoveredText = (await open(f.page, item)).master;
    assert.equal(recoveredText, 'base retained original');
    await f.page.evaluate(() => {
      window.replayed = 0;
      editor.outgoing(() => window.replayed++);
    });
    await f.page.evaluate(() => opened.compactContent());
    assert.equal(await f.page.evaluate(() => replayed), 0);
    const compacted = JSON.parse(await inventory(f.page));
    await close(f.page);
    // Inspection in the same disposable browser; no writer authority or key escapes.
    const recovery = await f.page.evaluate(
      async (item) => {
        const o = optionsFor(item),
          { carrier } = await Harness.openAccountJournalSession(o, o.identity.id);
        try {
          const r = await carrier.loadRecovery();
          try {
            return {
              kinds: r.records.map((r) => r.kind),
              journal: r.journal.length,
              fields: r.records.map((r) => Object.keys(r).sort()),
            };
          } finally {
            for (const row of [...r.records, ...r.journal]) row.bytes.fill(0);
          }
        } finally {
          await carrier.close();
        }
      },
      { slotId: item.slotId, code: item.code, scope: item.scope },
    );
    assert.ok(recovery.kinds.includes('state'));
    assert.ok(!recovery.kinds.includes('outbound'));
    artifact('counterexample-listener-gap.json', {
      acceptedText,
      observerCalls,
      observerFailed: true,
      journalOnlyBeforeRendererCrash: true,
      recoveredText,
      replayedOutgoingCallbacks: 0,
      recovery,
      persistedStoresAfterCompaction: compacted[0].map((db) => db[0]),
      scope:
        'Current document durability works. An asynchronous observer is insufficient as a future outbox; this does not claim current sync lost data, because no Account relay is connected.',
    });
  },
);
