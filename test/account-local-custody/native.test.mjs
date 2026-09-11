import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { bundle } from './runtime.mjs';
import * as o from './oracle.mjs';
const scripts = {};
for (const c of [
  'base',
  'signingPair',
  'wrappingPair',
  'metadataAuth',
  'equalMac',
  'stateCoercion',
])
  scripts[c] = await bundle(c === 'base' ? undefined : c, true);
const report = (n, v) => {
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, n + '.json'),
      JSON.stringify(v, null, 2) + '\n',
    );
  }
};
async function fixture(t, control = 'base', race = false) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>Disposable D6 custody</title>');
  });
  await new Promise((r, rej) => {
    server.once('error', rej);
    server.listen(0, '127.0.0.1', r);
  });
  t.after(() => new Promise((r) => server.close(r)));
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  t.after(() => browser.close());
  const page = await browser.newPage(),
    url = 'http://127.0.0.1:' + server.address().port;
  const cold = async (c = control) => {
    await page.goto(url);
    await page.evaluate(scripts[c]);
    await page.evaluate((r) => LocalCustodyContract.observe(r), race);
  };
  await cold();
  return { page, cold };
}
const call = (p, method, arg) =>
  p.evaluate(({ method, arg }) => LocalCustodyContract[method](arg), { method, arg });
const scopeOf = (r) => ({
  slotId: r.slot_id,
  principalId: r.principal_id,
  workspaceId: r.workspace_id,
});
const openRoot = (record, code) =>
  o.hex(
    o.openAES(
      o.factorKey(scopeOf(record), o.hex(Buffer.from(code.replaceAll('-', ''))), record.seals[0]),
      o.bytes(record.seals[0].nonce),
      o.lp(...o.factorFields(scopeOf(record), record.seals[0])),
      o.bytes(record.seals[0].ct),
    ),
  );
const signRecord = (r, root) => ({
  ...r,
  mac: o.hex(o.mac(o.metadataKey(r, root), o.json(o.metadataValues(r)))),
});
function validateRecord(r, root) {
  assert.equal(signRecord(r, root).mac, r.mac);
  const scope = scopeOf(r),
    gen = o.openAES(
      o.bytes(root),
      o.bytes(r.envelope.nonce),
      o.lp(...o.envelopeFields(scope, r.envelope.gen)),
      o.bytes(r.envelope.ct),
    );
  assert.equal(gen.length, 32);
  for (const c of r.credentials) {
    const raw = o.openAES(
      o.bytes(root),
      o.bytes(c.sealed.nonce),
      o.lp(...o.credentialFields(scope, c)),
      o.bytes(c.sealed.ct),
    );
    assert.equal(raw.length, 32);
    assert.equal(o.hex(o.publicBytes(c.role, o.hex(raw))), c.publicKey);
  }
}

test(
  'native creation and cold unlock use exact factor/envelope/credential/MAC bytes and dispose owned temporary key material',
  { timeout: 40000 },
  async (t) => {
    const f = await fixture(t),
      created = await call(f.page, 'begin');
    assert(created.ok);
    const r = await call(f.page, 'record'),
      root = openRoot(r, created.code);
    validateRecord(r, root);
    assert.equal(r.seal_reserved, 3);
    assert.equal(r.state, 'protected');
    const first = await call(f.page, 'observations');
    assert(first.temporaries.length >= 10);
    assert(first.temporaries.every((x) => x.zero));
    await f.cold();
    await call(f.page, 'configure', created.code);
    const opened = await call(f.page, 'open');
    assert(opened.ok);
    assert.deepEqual(opened.descriptor.publicCredentials, created.descriptor.publicCredentials);
    await call(f.page, 'close');
    const after = await call(f.page, 'observations');
    assert(after.temporaries.every((x) => x.zero));
    const traces = [...first.traces, ...after.traces].filter((t) => t.kind === 'metadata-key');
    assert(traces.length >= 4);
    for (const x of traces) {
      assert.equal(x.info, o.hex(o.metadataInfo(r)));
      assert.equal(x.salt, '');
      assert.equal(x.extractable, false);
      assert.deepEqual(x.usages, ['sign', 'verify']);
      assert.equal(x.probe, o.hex(o.mac(o.metadataKey(r, root), Buffer.from('d6-native-probe'))));
    }
    const encryptions = first.traces.filter((t) => t.kind === 'encrypt');
    assert.equal(encryptions.length, 4);
    assert(encryptions.every((x) => x.length === 32));
    report('native-bytes', {
      rootUses: r.seal_reserved,
      encryptions: encryptions.length,
      metadataDerivations: traces.length,
      temporaryBuffers: first.temporaries.length + after.temporaries.length,
      logicalDisposal: true,
      scope: scopeOf(r),
    });
  },
);

test(
  'native owner refuses authentically sealed wrong key pairs and changed metadata; actual guard omissions expose each boundary',
  { timeout: 40000 },
  async (t) => {
    const f = await fixture(t),
      created = await call(f.page, 'begin'),
      original = await call(f.page, 'record'),
      root = openRoot(original, created.code),
      scope = scopeOf(original),
      evidence = [];
    assert(created.ok);
    for (const [name, control, change] of [
      [
        'signing correspondence',
        'signingPair',
        (r) => {
          const c = r.credentials[1];
          c.sealed.ct = o.hex(
            o.aes(
              o.bytes(root),
              o.bytes(c.sealed.nonce),
              o.lp(...o.credentialFields(scope, c)),
              o.bytes('99'.repeat(32)),
            ),
          );
          return signRecord(r, root);
        },
      ],
      [
        'wrapping correspondence',
        'wrappingPair',
        (r) => {
          const c = r.credentials[0];
          c.sealed.ct = o.hex(
            o.aes(
              o.bytes(root),
              o.bytes(c.sealed.nonce),
              o.lp(...o.credentialFields(scope, c)),
              o.bytes('99'.repeat(32)),
            ),
          );
          return signRecord(r, root);
        },
      ],
      [
        'metadata authentication',
        'metadataAuth',
        (r) => ({ ...r, seal_reserved: r.seal_reserved + 3 }),
      ],
    ]) {
      const changed = change(structuredClone(original));
      await call(f.page, 'put', changed);
      await f.cold('base');
      await call(f.page, 'configure', created.code);
      assert.deepEqual(await call(f.page, 'open'), { ok: false, error: 'repair-required' }, name);
      assert.deepEqual(await call(f.page, 'record'), changed);
      await f.cold(control);
      await call(f.page, 'configure', created.code);
      assert.equal((await call(f.page, 'open')).ok, true, name);
      await call(f.page, 'close');
      evidence.push({ name, baseline: 'refused', control: 'opened' });
    }
    await call(f.page, 'put', original);
    await f.cold('base');
    await call(
      f.page,
      'configure',
      created.code.replace(/^./, created.code[0] === '0' ? '1' : '0'),
    );
    assert.deepEqual(await call(f.page, 'open'), { ok: false, error: 'unlock-failed' });
    assert.deepEqual(await call(f.page, 'record'), original);
    report('native-authentic-faults', { evidence, wrongFactor: 'unlock-failed, preserved', scope });
  },
);

test(
  'native structured-clone state counterexample is rejected at parsing; old coercion still cannot open the ordinary owner',
  { timeout: 40000 },
  async (t) => {
    const f = await fixture(t),
      created = await call(f.page, 'begin'),
      r = await call(f.page, 'record'),
      evidence = [];
    for (const form of ['array', 'boxed']) {
      await call(f.page, 'put', r);
      await call(f.page, 'stateShape', form);
      assert.deepEqual(await call(f.page, 'parserProbe'), {
        accepted: false,
        error: 'repair-required',
      });
      assert.deepEqual(await call(f.page, 'open'), { ok: false, error: 'repair-required' });
      await f.cold('stateCoercion');
      await call(f.page, 'configure', created.code);
      assert.deepEqual(await call(f.page, 'parserProbe'), { accepted: true, type: 'object' });
      assert.deepEqual(await call(f.page, 'open'), { ok: false, error: 'creation-pending' });
      evidence.push(form);
      await f.cold('base');
      await call(f.page, 'configure', created.code);
    }
    await call(f.page, 'put', r);
    assert((await call(f.page, 'open')).ok);
    await call(f.page, 'close');
    report('native-state-fix', {
      forms: evidence,
      oldOwnerAlsoRefused: true,
      severity: 'parser contract defect, no reproduced authority bypass',
    });
  },
);

test(
  'native reservation comparison includes the prior MAC before any root encryption',
  { timeout: 40000 },
  async (t) => {
    const evidence = [];
    for (const control of ['base', 'equalMac'])
      await t.test(control, async (child) => {
        const f = await fixture(child, control, true),
          created = await call(f.page, 'begin'),
          r = await call(f.page, 'record'),
          obs = await call(f.page, 'observations');
        assert(obs.raceFired);
        const rootEncryptions = obs.traces.filter(
          (x) =>
            x.kind === 'encrypt' &&
            !Buffer.from(x.aad, 'hex').includes(Buffer.from('done/devicelock/v1')),
        ).length;
        if (control === 'base') {
          assert.equal(created.ok, false);
          assert.equal(created.error, 'repair-required');
          assert.equal(r.state, 'creating');
          assert.equal(rootEncryptions, 0);
        } else {
          assert(created.ok);
          assert.equal(r.state, 'protected');
          assert.equal(rootEncryptions, 3);
        }
        evidence.push({
          control,
          rootEncryptions,
          result: created.ok ? 'completed' : created.error,
        });
      });
    report('native-comparison-control', {
      evidence,
      crypto: 'real native comparison race; changed stored MAC is not silently overwritten',
    });
  },
);
