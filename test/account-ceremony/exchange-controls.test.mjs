import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as normal from '../../account-protocol/ceremonyExchange.ts';
import { exchangeFixture } from './exchange-oracle.mjs';

async function mutant(t, from, to) {
  const root = resolve('test-results/account-ceremony-controls');
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, 'exchange-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let code = readFileSync('account-protocol/ceremonyExchange.ts', 'utf8');
  assert.equal(code.split(from).length, 2, 'Unique omission anchor');
  code = code.replace(from, to);
  for (const name of ['preparation', 'authority', 'admission', 'recovery', 'successor', 'ceremony'])
    code = code.replace(
      `'./${name}.ts'`,
      JSON.stringify(pathToFileURL(resolve(`account-protocol/${name}.ts`)).href),
    );
  const path = join(dir, 'ceremonyExchange.ts');
  writeFileSync(path, code);
  return import(pathToFileURL(path));
}
const auth = (api, x) =>
  api.verifyCeremonyContext(x.context, x.f.base, x.f.successor, x.held, x.local('existing'), x.now);
test('omitting commitment signature verification releases a proposal nonce for a forged peer commitment', async (t) => {
  const broken = await mutant(
    t,
    'await verifySignature(key, c.signature, await ceremonyCommitMessage(c), subtle);',
    'void key;',
  );
  const x = exchangeFixture(),
    forged = { ...x.commits.new, signature: '00'.repeat(64) };
  await assert.rejects(
    normal.verifyCeremonyPair(await auth(normal, x), x.commits.existing, forged, x.now),
  );
  const p = await broken.verifyCeremonyPair(
    await auth(broken, x),
    x.commits.existing,
    forged,
    x.now,
  );
  assert.equal(
    (await broken.prepareCeremonyReveal(p, x.nonces.existing, x.now)).nonce,
    x.nonces.existing,
  );
});
test('omitting context equality accepts a valid peer commitment transplanted from another attempt', async (t) => {
  const broken = await mutant(
    t,
    'c.role !== ownRole || !same(c.context, context)',
    'c.role !== ownRole',
  );
  const x = exchangeFixture(),
    other = x.commit('new', { ...x.context, attemptId: 'dd'.repeat(32) });
  await assert.rejects(
    normal.verifyCeremonyPair(await auth(normal, x), x.commits.existing, other, x.now),
  );
  const p = await broken.verifyCeremonyPair(
    await auth(broken, x),
    x.commits.existing,
    other,
    x.now,
  );
  assert.equal(
    (await broken.prepareCeremonyReveal(p, x.nonces.existing, x.now)).nonce,
    x.nonces.existing,
  );
  assert.notEqual(p.candidate.context.attemptId, p.authority.context.attemptId);
});
test('omitting the existing commitment hash accepts a stale signed peer reveal under a different pair', async (t) => {
  const broken = await mutant(t, 'r.existingCommitHash !== pair.existingCommitHash ||', '');
  const x = exchangeFixture(),
    replacement = x.commit('existing', x.context, 'ee'.repeat(32));
  const p = await normal.verifyCeremonyPair(
    await auth(normal, x),
    replacement,
    x.commits.new,
    x.now,
  );
  await assert.rejects(normal.verifyCeremonyReveal(p, x.reveals.new, 'new', x.now));
  const badPair = await broken.verifyCeremonyPair(
    await auth(broken, x),
    replacement,
    x.commits.new,
    x.now,
  );
  assert.deepEqual(
    await broken.verifyCeremonyReveal(badPair, x.reveals.new, 'new', x.now),
    x.reveals.new,
  );
  assert.notEqual(badPair.existingCommitHash, x.reveals.new.existingCommitHash);
});
