import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AccountCore } from '../../account-service/core.ts';
import { generateRecovery, confirmRecovery } from '../../src/account/recovery.ts';
import { draftDigest, rootCommitment } from '../../account-protocol/recovery.ts';
import { fixture, registered, scope } from './fixtures.mjs';
async function mutation(t, file, from, to) {
  const parent = resolve('test-results/account-recovery-controls');
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, 'mutant-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const path of [
    'account-service/core.ts',
    'account-service/protocol.ts',
    'account-service/webauthn.ts',
    'account-service/recovery.ts',
    'account-protocol/recovery.ts',
    'account-protocol/authority.ts',
    'account-protocol/preparation.ts',
    'src/account/recovery.ts',
  ]) {
    let s = readFileSync(path, 'utf8');
    if (path === file) {
      assert(s.includes(from), 'Control must match actual guard');
      s = s.replace(from, to);
    }
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), s);
  }
  return import(pathToFileURL(join(dir, file)).href);
}
function evidence(name, data) {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(data, null, 2),
    );
}
for (const gate of ['recovery', 'passkey'])
  test(`control: removing ${gate} verification actually accepts a one-factor finalization`, async (t) => {
    const source = readFileSync('account-service/core.ts', 'utf8');
    const start = source.indexOf(
      gate === 'recovery' ? '      await verifyRecoveryProof(' : '      counter = await assertion(',
      source.indexOf('async finishRecovery'),
    );
    const end = source.indexOf('\n      );', start) + 9;
    assert(start > 0 && end > start);
    const { AccountCore: Mutant } = await mutation(
      t,
      'account-service/core.ts',
      source.slice(start, end),
      gate === 'recovery' ? '' : '      counter = 0;',
    );
    for (const Core of [AccountCore, Mutant]) {
      const f = fixture(t, {}, Core),
        account = await registered(f),
        { draft, code } = await generateRecovery(scope);
      const view = await f.core.beginRecovery({ retryKey: account.retryKey, draft });
      const proof = {
        retryKey: account.retryKey,
        recoveryId: view.recoveryId,
        response: gate === 'passkey' ? {} : account.key.assert(view),
        recoveryProof:
          gate === 'recovery'
            ? '00'.repeat(64)
            : await confirmRecovery(draft, code, view.options.challenge, view.draftDigest),
      };
      const before = f.rows('recovery'),
        result = await f.core.finishRecovery(proof);
      evidence(`control-${gate}-${Core === AccountCore ? 'baseline' : 'mutant'}`, {
        proof,
        result,
        before,
        after: f.rows('recovery'),
      });
      if (Core === AccountCore) assert.equal(result.refusal, 'invalid-proof');
      else assert.equal(result.stage, 'recovery-confirmed');
    }
  });
test('control: removing the sealed-root check accepts an attacker-substituted authority root', async (t) => {
  const { confirmRecovery: badConfirm } = await mutation(
    t,
    'src/account/recovery.ts',
    'if (payload.length !== 96 || hex(payload.subarray(32, 64)) !== draft.rootCommitment)',
    'if (payload.length !== 96)',
  );
  const f = fixture(t),
    account = await registered(f),
    { draft: original, code } = await generateRecovery(scope);
  const draft = { ...original, authRoot: 'cd'.repeat(32) };
  draft.rootCommitment = await rootCommitment(draft);
  const view = await f.core.beginRecovery({ retryKey: account.retryKey, draft }),
    digest = await draftDigest(draft);
  await assert.rejects(
    confirmRecovery(draft, code, view.options.challenge, digest),
    /Sealed root mismatch/,
  );
  const proof = {
    retryKey: account.retryKey,
    recoveryId: view.recoveryId,
    response: account.key.assert(view),
    recoveryProof: await badConfirm(draft, code, view.options.challenge, digest),
  };
  const before = f.rows('recovery'),
    result = await f.core.finishRecovery(proof);
  evidence('control-root', { original, draft, proof, before, result, after: f.rows('recovery') });
  assert.equal(result.stage, 'recovery-confirmed');
});
