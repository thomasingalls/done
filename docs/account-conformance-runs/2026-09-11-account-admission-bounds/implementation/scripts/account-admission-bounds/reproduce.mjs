import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { history } from '../../test/account-admission-bounds/histories.mjs';
// Load the immutable prior parser/builders beside their unchanged dependency imports.
const dir = mkdtempSync(resolve('account-protocol/.bounds-before-'));
try {
  const code = execFileSync('git', ['show', '6398e33:account-protocol/admission.ts'], {
    encoding: 'utf8',
  }).replaceAll("from './", "from '../");
  writeFileSync(join(dir, 'admission.ts'), code);
  const old = await import(pathToFileURL(join(dir, 'admission.ts')).href);
  const m = {
    v: 1,
    workspaceId: '11'.repeat(16),
    epoch: 1,
    epochHead: '22'.repeat(32),
    generation: 1,
    checkpointDigest: '33'.repeat(32),
    sv: '00',
    ds: '0000',
    headVectorDigest: '44'.repeat(32),
    producer: '55'.repeat(16),
    signature: '00'.repeat(64),
  };
  const a = {
    v: 1,
    workspaceId: m.workspaceId,
    checkpointDigest: m.checkpointDigest,
    manifestDigest: '66'.repeat(32),
    derivedSv: m.sv,
    derivedDs: m.ds,
    headBaselineDigest: m.headVectorDigest,
    derivation: old.DERIVATION,
    admittingCredential: m.producer,
    selfAdmitted: 1,
    decisionParent: old.ZERO_HEAD,
    signature: m.signature,
  };
  const cases = [];
  for (const bytes of [32766, 32767, 32768])
    for (const field of ['sv', 'ds']) {
      const value = '01'.repeat(bytes),
        mm = { ...m, [field]: value },
        aa = { ...a, [field === 'sv' ? 'derivedSv' : 'derivedDs']: value };
      for (const [name, run] of [
        ['manifest', () => old.manifestMessage(mm)],
        ['admission', () => old.semanticMessage(aa)],
        ['parser', () => old.parseCompletion({ manifest: mm, admission: aa })],
      ]) {
        let error = null;
        try {
          run();
        } catch (e) {
          error = e.message;
        }
        assert.equal(!!error, bytes > 32767);
        cases.push({ bytes, field, name, error });
      }
    }
  for (const field of ['sv', 'ds']) {
    const h = history(field);
    assert.ok(h.parts[field].length / 2 > 32767);
    assert.throws(() => old.manifestMessage({ ...m, ...h.parts }), /too long/);
    assert.throws(
      () => old.semanticMessage({ ...a, derivedSv: h.parts.sv, derivedDs: h.parts.ds }),
      /too long/,
    );
    cases.push({
      history: field,
      count: h.count,
      svBytes: h.parts.sv.length / 2,
      dsBytes: h.parts.ds.length / 2,
      updateBytes: h.update.length,
      refusedBoth: true,
    });
  }
  const output = resolve(
    process.env.ACCOUNT_REPORT_DIR ?? 'test-results/account-admission-bounds-reproduction',
  );
  mkdirSync(output, { recursive: true });
  writeFileSync(
    join(output, 'reproduction.json'),
    JSON.stringify({ commit: '6398e33', cases }, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      output,
      histories: cases.filter((c) => c.history),
      boundaries: cases.length - 2,
    }),
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
