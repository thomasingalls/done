import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { authorityFixture, nonce } from './fixtures.mjs';
import { verifyPinnedAuthority } from '../../account-protocol/authority.ts';
async function mutant(t, edits) {
  const parent = resolve('test-results/account-authority-controls');
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, 'mutant-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let source = readFileSync('account-protocol/authority.ts', 'utf8');
  for (const [from, to] of edits) {
    assert(source.includes(from), 'Control guard must match');
    source = source.replace(from, to);
  }
  writeFileSync(join(dir, 'authority.ts'), source);
  writeFileSync(join(dir, 'recovery.ts'), readFileSync('account-protocol/recovery.ts'));
  return (await import(pathToFileURL(join(dir, 'authority.ts')).href)).verifyPinnedAuthority;
}
const evidence = (name, data) => {
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
      JSON.stringify(data, null, 2),
    );
};
test('control: resolving the anchor from the reply accepts a self-signed attacker root', async (t) => {
  const f = authorityFixture(t),
    attacker = authorityFixture(t),
    n = nonce(),
    proof = attacker.owner.prove({ nonce: n });
  const bad = await mutant(t, [
    ['const pin = parseAuthorityPin(expected);', 'const pin = parseAuthorityPin(input.pin);'],
  ]);
  await assert.rejects(verifyPinnedAuthority(f.pin, n, proof));
  const result = await bad(f.pin, n, proof);
  assert.deepEqual(result, attacker.pin);
  evidence('control-pin', {
    expected: f.pin,
    nonce: n,
    proof,
    baseline: 'refused',
    mutant: result,
  });
});
test('control: trusting the returned nonce accepts a captured bootstrap response', async (t) => {
  const f = authorityFixture(t),
    first = nonce(),
    second = nonce(),
    proof = f.owner.prove({ nonce: first });
  const bad = await mutant(t, [
    ['value.nonce !== nonce', 'false'],
    ['authorityMessage(pin, nonce)', 'authorityMessage(pin, value.nonce)'],
  ]);
  await assert.rejects(verifyPinnedAuthority(f.pin, second, proof));
  const result = await bad(f.pin, second, proof);
  assert.deepEqual(result, f.pin);
  evidence('control-nonce', {
    expected: f.pin,
    requestedNonce: second,
    proof,
    baseline: 'refused',
    mutant: result,
  });
});
