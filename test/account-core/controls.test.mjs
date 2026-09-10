import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AccountCore } from '../../account-service/core.ts';
import { fixture, fresh, registered, authenticator, finishRequest, cbor } from './fixtures.mjs';
import { snapshot, diagnostic } from './diagnostics.mjs';

async function mutated(t, edits) {
  const parent = resolve('test-results/account-core-controls');
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, 'mutant-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'account-service'));
  mkdirSync(join(dir, 'account-protocol'));
  for (const name of readdirSync('account-protocol').filter((n) => n.endsWith('.ts')))
    writeFileSync(
      join(dir, 'account-protocol', name),
      readFileSync(join('account-protocol', name)),
    );
  for (const file of readdirSync('account-service').filter((name) => name.endsWith('.ts'))) {
    let source = readFileSync(resolve('account-service', file), 'utf8');
    for (const [target, from, to] of edits)
      if (file === target) {
        assert(source.includes(from), `Control no longer matches ${file}: ${from}`);
        source = source.replaceAll(from, to);
      }
    writeFileSync(join(dir, 'account-service', file), source);
  }
  return (await import(pathToFileURL(join(dir, 'account-service/core.ts')).href)).AccountCore;
}

test('replay control actually mints a second logical result when retirement guards are removed', async (t) => {
  const Mutant = await mutated(t, [
    ['core.ts', 'if (ceremony.proof_hash !== null)', 'if (false)'],
    [
      'core.ts',
      "if (attempt.current_id !== ceremony.id || attempt.state !== 'open')",
      'if (false)',
    ],
  ]);
  for (const Core of [AccountCore, Mutant]) {
    const f = fixture(t, {}, Core),
      item = await registered(f);
    f.seedActive(item.result.accountId);
    const retryKey = fresh(),
      view = f.core.begin({ operation: 'authenticate', retryKey });
    const proof = finishRequest(view, retryKey, item.key.assert(view));
    const first = await f.core.finish(proof);
    const before = snapshot(f.path);
    const second = await f.core.finish(proof);
    diagnostic(`control-replay-${Core === AccountCore ? 'baseline' : 'mutant'}`, {
      scope: 'Synthetic test account only',
      proof,
      first,
      second,
      before,
      after: snapshot(f.path),
    });
    assert.equal(first.stage, 'account-proof');
    assert.equal(second.stage, 'account-proof');
    if (Core === AccountCore) assert.equal(first.receiptId, second.receiptId);
    else assert.notEqual(first.receiptId, second.receiptId);
  }
});

test('wrong-operation proof control is accepted only with expected-challenge verification removed', async (t) => {
  const Mutant = await mutated(t, [
    ['webauthn.ts', '    expectedChallenge,', '    expectedChallenge: () => true,'],
  ]);
  for (const Core of [AccountCore, Mutant]) {
    const f = fixture(t, {}, Core),
      item = await registered(f);
    f.seedActive(item.result.accountId);
    const retryKey = fresh(),
      view = f.core.begin({ operation: 'authenticate', retryKey });
    const confirmationProof = item.key.assert(item.confirmation);
    const before = snapshot(f.path);
    const result = await f.core.finish(finishRequest(view, retryKey, confirmationProof));
    diagnostic(`control-purpose-${Core === AccountCore ? 'baseline' : 'mutant'}`, {
      scope: 'Synthetic test account only',
      proof: finishRequest(view, retryKey, confirmationProof),
      result,
      before,
      after: snapshot(f.path),
    });
    if (Core === AccountCore) assert.equal(result.refusal, 'invalid-proof');
    else assert.equal(result.stage, 'account-proof');
  }
});

test('substituted-key control grants proof only when a caller key replaces the retained verifier', async (t) => {
  const Mutant = await mutated(t, [
    [
      'webauthn.ts',
      'publicKey: new Uint8Array(credential.public_key),',
      'publicKey: value.response.publicKey ? new Uint8Array(bytes(value.response.publicKey)) : new Uint8Array(credential.public_key),',
    ],
  ]);
  for (const Core of [AccountCore, Mutant]) {
    const f = fixture(t, {}, Core),
      item = await registered(f);
    f.seedActive(item.result.accountId);
    const retryKey = fresh(),
      view = f.core.begin({ operation: 'authenticate', retryKey });
    const other = authenticator();
    const response = item.key.assert(view, { privateKey: other.pair.privateKey });
    response.response.publicKey = cbor(other.cose).toString('base64url');
    const before = snapshot(f.path);
    const result = await f.core.finish(finishRequest(view, retryKey, response));
    diagnostic(`control-key-${Core === AccountCore ? 'baseline' : 'mutant'}`, {
      scope: 'Synthetic test account only',
      proof: finishRequest(view, retryKey, response),
      result,
      before,
      after: snapshot(f.path),
    });
    if (Core === AccountCore) assert.equal(result.refusal, 'invalid-proof');
    else assert.equal(result.stage, 'account-proof');
  }
});
