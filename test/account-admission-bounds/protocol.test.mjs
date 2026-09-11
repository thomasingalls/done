import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verify } from 'node:crypto';
import * as p from '../../account-protocol/admission.ts';
import { history } from './histories.mjs';
import {
  prepared,
  signing,
  manifestBytes,
  semanticBytes,
  hash,
} from '../account-admission/core-fixtures.mjs';
export const evidence = (name, data) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(data, null, 2) + '\n',
    );
};
async function variant(t, change) {
  const dir = mkdtempSync(resolve('account-protocol/.bounds-control-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source =
    change === 'old'
      ? execFileSync('git', ['show', '6398e33:account-protocol/admission.ts'], { encoding: 'utf8' })
      : change(readFileSync('account-protocol/admission.ts', 'utf8'));
  writeFileSync(join(dir, 'admission.ts'), source.replaceAll("from './", "from '../"));
  return {
    ...(await import(pathToFileURL(join(dir, 'admission.ts')).href)),
    modulePath: join(dir, 'admission.ts'),
  };
}
const signCompletion = (x, c, bytes = manifestBytes, semantic = semanticBytes) => {
  c.manifest.signature = signing(x.s.privateKey, bytes(c.manifest));
  c.admission.manifestDigest = hash(bytes(c.manifest));
  c.admission.signature = signing(x.s.privateKey, semantic(c.admission));
  return c;
};
const finish = (x, o, c) => x.finish(o, c);

test('v2 binds both decoded descriptors at old boundaries and generated sizes through independent OpenSSL bytes', async (t) => {
  const x = await prepared(t),
    o = await x.begin(),
    sizes = [1, 32766, 32767, 32768, 65536];
  const generated = [];
  const check = async (input) => {
    generated.push(input);
    const b = input.byte.toString(16).padStart(2, '0');
    const parts = { sv: b.repeat(input.sv), ds: b.repeat(input.ds) };
    const c = signCompletion(x, await p.completionBodies(x.request, o, parts));
    assert.deepEqual(Buffer.from(await p.manifestMessage(c.manifest)), manifestBytes(c.manifest));
    assert.deepEqual(Buffer.from(await p.semanticMessage(c.admission)), semanticBytes(c.admission));
    await p.verifyCompletion(c, x.request, o, parts);
    for (const field of ['sv', 'ds']) {
      const bad = structuredClone(c),
        aField = field === 'sv' ? 'derivedSv' : 'derivedDs';
      bad.manifest[field] = (input.byte === 0 ? '01' : '00') + parts[field].slice(2);
      bad.admission[aField] = bad.manifest[field];
      // Binding, rather than internal disagreement: rebuild manifest digest but retain signatures.
      bad.admission.manifestDigest = hash(manifestBytes(bad.manifest));
      assert.equal(
        verify(
          null,
          manifestBytes(bad.manifest),
          x.s.publicKey,
          Buffer.from(c.manifest.signature, 'hex'),
        ),
        false,
      );
      assert.equal(
        verify(
          null,
          semanticBytes(bad.admission),
          x.s.publicKey,
          Buffer.from(c.admission.signature, 'hex'),
        ),
        false,
      );
      await assert.rejects(p.verifyCompletion(bad, x.request, o));
    }
  };
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        sv: fc.integer({ min: 1, max: 80000 }),
        ds: fc.integer({ min: 1, max: 80000 }),
        byte: fc.integer({ min: 0, max: 255 }),
      }),
      check,
    ),
    { seed: 9112071, numRuns: 80 },
  );
  for (const bytes of sizes) await check({ sv: bytes, ds: bytes, byte: 17 });
  evidence('generated-codecs', {
    seed: 9112071,
    histories: generated.length,
    oldBoundaries: sizes,
    generatedInputs: generated,
    shrinking: true,
    independent: 'OpenSSL SHA256 and Ed25519; decoded opaque bytes',
  });
});

test('inclusive combined 16 MiB bound fits service limit; malformed/oversize refuse before digesting', async (t) => {
  const x = await prepared(t),
    o = await x.begin();
  const parts = { sv: '01'.repeat(p.COVERAGE_LIMIT - 2), ds: '0000' };
  const c = signCompletion(x, await p.completionBodies(x.request, o, parts));
  assert.ok(Buffer.byteLength(JSON.stringify(c)) < p.ADMISSION_LIMIT);
  await p.verifyCompletion(c, x.request, o, parts);
  const r = await finish(x, o, c);
  assert.equal(r.kind, 'promotion-receipt');
  assert.ok(Buffer.byteLength(JSON.stringify(r)) < p.ADMISSION_LIMIT);
  x.f.restart();
  x.authority.restart();
  assert.deepEqual(await x.begin(), r);
  const before = x.f.rows('promotions');
  for (const field of ['sv', 'ds']) {
    const bad = structuredClone(c),
      aField = field === 'sv' ? 'derivedSv' : 'derivedDs';
    bad.manifest[field] += '00';
    bad.admission[aField] += '00';
    assert.throws(() => p.parseCompletion(bad), /bound/);
    await assert.rejects(p.manifestMessage(bad.manifest), /bound/);
    await assert.rejects(p.semanticMessage(bad.admission), /bound/);
    assert.equal((await finish(x, o, bad)).ok, false);
  }
  for (const val of ['', 'A0', '0', 'gg', null, [], 42]) {
    assert.throws(() => p.coverageParts({ sv: val, ds: '0000' }));
    assert.throws(() => p.coverageParts({ sv: '00', ds: val }));
  }
  assert.deepEqual(x.f.rows('promotions'), before);
  evidence('upper-bound', {
    combinedBytes: p.COVERAGE_LIMIT,
    completionJsonBytes: Buffer.byteLength(JSON.stringify(c)),
    receiptJsonBytes: Buffer.byteLength(JSON.stringify(r)),
    coldService: true,
    overBoundRefused: true,
  });
});

test('correctly signed independent SV and DS lies pass content-blind service but fail client-derived coverage; omissions are effective', async (t) => {
  const semanticOmission = await variant(t, (s) => {
    const needle = 'parts ?? c.manifest';
    assert.equal(s.split(needle).length, 2);
    return s.replace(needle, 'c.manifest');
  });
  for (const field of ['sv', 'ds']) {
    const x = await prepared(t),
      o = await x.begin(),
      real = { sv: '00', ds: '0000' };
    const badParts = { ...real, [field]: '0100' };
    const c = signCompletion(x, await p.completionBodies(x.request, o, badParts));
    assert.ok(
      verify(
        null,
        manifestBytes(c.manifest),
        x.s.publicKey,
        Buffer.from(c.manifest.signature, 'hex'),
      ),
    );
    assert.ok(
      verify(
        null,
        semanticBytes(c.admission),
        x.s.publicKey,
        Buffer.from(c.admission.signature, 'hex'),
      ),
    );
    await assert.rejects(p.verifyCompletion(c, x.request, o, real), /coverage/);
    await semanticOmission.verifyCompletion(c, x.request, o, real);
    assert.equal((await finish(x, o, c)).kind, 'promotion-receipt');
    // Removing either bound hash from both messages rescues the respective signature forgery.
    const omission = await variant(t, (s) => {
      const needle = 'hashes.' + field + ',';
      assert.equal(s.split(needle).length, 3);
      return s.replaceAll(needle, '');
    });
    const base = await p.completionBodies(x.request, o, real);
    for (const [fn, which] of [
      ['manifestMessage', 'manifest'],
      ['semanticMessage', 'admission'],
    ]) {
      const one = await omission[fn](base[which]);
      if (which === 'admission') c.admission.manifestDigest = base.admission.manifestDigest;
      const changed = await omission[fn](c[which]);
      assert.deepEqual(one, changed, `${fn}:${field}`);
      assert.ok(
        verify(null, changed, x.s.publicKey, Buffer.from(signing(x.s.privateKey, one), 'hex')),
      );
    }
  }
  evidence('controls', {
    semanticRederivation: ['sv', 'ds'],
    omittedSignatureFields: [
      'manifest.sv',
      'manifest.ds',
      'admission.derivedSv',
      'admission.derivedDs',
    ],
    genuineSignatures: true,
  });
});

test('v1, mixed, unknown versions and old readers refuse without rewriting completed service rows', async (t) => {
  const x = await prepared(t),
    o = await x.begin(),
    old = await variant(t, 'old'),
    base = await x.completion(o);
  const v1 = signCompletion(
    x,
    await old.completionBodies(x.request, o, { sv: '00', ds: '0000' }),
    old.manifestMessage,
    old.semanticMessage,
  );
  await old.verifyCompletion(v1, x.request, o, { sv: '00', ds: '0000' });
  const before = x.f.rows('promotions');
  for (const versions of [
    [1, 1],
    [1, 2],
    [2, 1],
    [3, 2],
    [2, 3],
  ]) {
    const c = structuredClone(base);
    c.manifest.v = versions[0];
    c.admission.v = versions[1];
    assert.throws(() => p.parseCompletion(c), /Unsupported/);
    assert.equal((await finish(x, o, c)).ok, false);
  }
  assert.equal((await finish(x, o, v1)).ok, false);
  assert.deepEqual(x.f.rows('promotions'), before);
  assert.throws(() => old.parseCompletion(base), /Unsupported/);
  const authorityDir = mkdtempSync(resolve('account-service/.bounds-old-'));
  t.after(() => rmSync(authorityDir, { recursive: true, force: true }));
  const authoritySource = execFileSync('git', ['show', '6398e33:account-service/authority.ts'], {
    encoding: 'utf8',
  })
    .replaceAll("from './", "from '../")
    .replaceAll("'../account-protocol/admission.ts'", JSON.stringify(old.modulePath))
    .replaceAll("'../account-protocol/", "'../../account-protocol/");
  writeFileSync(join(authorityDir, 'authority.ts'), authoritySource);
  const { PrivateAuthority } = await import(pathToFileURL(join(authorityDir, 'authority.ts')).href);
  const oldAuthority = PrivateAuthority.open(x.authority.path, x.authority.pin, x.authority.key);
  let receipt;
  try {
    receipt = await oldAuthority.finishPromotion(
      { finishPromotion: (_input, issuer) => issuer.complete(o, v1) },
      {},
    );
  } finally {
    oldAuthority.close();
  }
  await old.verifyReceipt(receipt, x.request, x.authority.pin, { sv: '00', ds: '0000' });
  // Immutable genuine v1 artifact in a disposable service database, exactly as an upgrade would find it.
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(x.f.path);
  db.prepare("UPDATE promotions SET state='admitted',result=?").run(JSON.stringify(receipt));
  db.prepare("UPDATE accounts SET state='active'").run();
  db.close();
  const retained = x.f.rows('promotions');
  x.f.restart();
  x.authority.restart();
  assert.equal((await x.begin()).ok, false);
  assert.equal((await finish(x, o, base)).ok, false);
  assert.deepEqual(x.f.rows('promotions'), retained);
  evidence('versions', {
    oldCompletionGenuine: true,
    pairs: [
      [1, 1],
      [1, 2],
      [2, 1],
      [3, 2],
      [2, 3],
    ],
    oldReaderRefused: true,
    retainedV1Unchanged: true,
  });
});

test('real generated writer and deletion histories exceed the old limit and retain exact descriptors', async (t) => {
  const x = await prepared(t),
    o = await x.begin(),
    cases = [];
  for (const kind of ['sv', 'ds'])
    for (const count of [12000, 12317, 13001]) {
      const h = history(kind, count),
        c = signCompletion(x, await p.completionBodies(x.request, o, h.parts));
      assert.ok(h.parts[kind].length / 2 > 32767);
      await p.verifyCompletion(c, x.request, o, h.parts);
      cases.push({
        kind,
        count,
        svBytes: h.parts.sv.length / 2,
        dsBytes: h.parts.ds.length / 2,
        checkpointBytes: h.update.length,
      });
    }
  evidence('long-histories', cases);
});
