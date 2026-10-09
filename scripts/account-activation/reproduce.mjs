import { activationReference, activationHistoricalFiles } from './historical-inputs.mjs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
mkdirSync(resolve('test-results'), { recursive: true });
const commit = activationReference,
  root = mkdtempSync(resolve('test-results/activation-before-'));
const cleanup = [];
try {
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', commit], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(
      (p) =>
        p.startsWith('account-service/') ||
        p.startsWith('account-protocol/') ||
        [
          'src/account/recovery.ts',
          'test/account-admission/core-fixtures.mjs',
          'test/account-core/fixtures.mjs',
          'test/account-authority/fixtures.mjs',
          'test/account-genesis/oracle.mjs',
        ].includes(p),
    );
  assert.deepEqual(files, activationHistoricalFiles, 'Historical reproduction file set changed');
  const sources = [];
  for (const p of files) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    const bytes = execFileSync('git', ['show', commit + ':' + p]);
    sources.push({ path: p, sha256: createHash('sha256').update(bytes).digest('hex') });
    writeFileSync(join(root, p), bytes);
  }
  const { prepared } = await import(
    pathToFileURL(join(root, 'test/account-admission/core-fixtures.mjs')).href
  );
  const x = await prepared({ after: (f) => cleanup.push(f) }),
    offer = await x.begin();
  let assertionCalls = 0;
  x.account.key.assert = () => {
    assertionCalls++;
    throw Error('No new assertion available');
  };
  const result = await x.finish(offer);
  assert.equal(result.kind, 'promotion-receipt');
  assert.equal(x.f.rows('accounts')[0].state, 'active');
  const { parseReceipt } = await import('../../account-protocol/admission.ts');
  assert.throws(() => parseReceipt(result));
  const evidence = {
    commit,
    sources,
    assertionCalls,
    receipt: result,
    accountState: x.f.rows('accounts')[0].state,
    receiptVersion: result.v,
    activatedWithoutFreshAssertion: true,
    newReaderRefusesActualOldReceipt: true,
    finishFields: ['retryKey', 'requestDigest', 'completion'],
  };
  const out = resolve(
    process.env.ACCOUNT_REPORT_DIR ?? 'test-results/account-activation-reproduction',
  );
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'before.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(evidence);
} finally {
  for (const f of cleanup.reverse()) f();
  rmSync(root, { recursive: true, force: true });
}
