import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as runtime from '../../account-protocol/ceremony.ts';
import { honest, commitments, change } from './oracle.mjs';

async function mutant(t, from, to) {
  const parent = resolve('test-results/account-ceremony-controls');
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, 'omission-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let source = readFileSync('account-protocol/ceremony.ts', 'utf8');
  assert.equal(source.split(from).length, 2, 'Unique runtime omission anchor');
  source = source.replace(from, to);
  for (const dependency of ['preparation', 'recovery'])
    source = source.replace(
      `'./${dependency}.ts'`,
      JSON.stringify(pathToFileURL(resolve(`account-protocol/${dependency}.ts`)).href),
    );
  const path = join(dir, 'ceremony.ts');
  writeFileSync(path, source);
  return import(pathToFileURL(path));
}

for (const key of Object.keys(honest)) {
  test(`omitting transcript field ${key} makes changed context derive identical output`, async (t) => {
    const expression = key === 'epoch' ? 'String(r.epoch)' : `r.${key}`;
    const broken = await mutant(t, `    ${expression},\n`, '');
    const changed = change(honest, key);
    const original = await runtime.deriveCeremonyOpening(honest, commitments(honest));
    const different = await runtime.deriveCeremonyOpening(changed, commitments(changed));
    assert.notEqual(original.transcriptHash, different.transcriptHash);
    const before = await broken.deriveCeremonyOpening(honest, commitments(honest));
    const after = await broken.deriveCeremonyOpening(changed, commitments(changed));
    assert.deepEqual(before, after); // positive forbidden equivalence, not just an exception
  });
}
test('omitting commitment role accepts an echoed commitment for both roles', async (t) => {
  const broken = await mutant(
    t,
    "lp('done/enroll-commit/v1', role(inputRole), h(nonce))",
    "lp('done/enroll-commit/v1', h(nonce))",
  );
  const input = { ...honest, nonceNew: honest.nonceExisting };
  const echoed = await broken.ceremonyCommitment('existing', input.nonceExisting);
  const pair = { existing: echoed, new: echoed };
  await assert.rejects(runtime.deriveCeremonyOpening(input, pair), /commitment mismatch/);
  const result = await broken.deriveCeremonyOpening(input, pair);
  assert.equal(result.sas.length, 5);
  assert.equal(echoed, await broken.ceremonyCommitment('new', input.nonceNew));
});
test('omitting opening verification derives a SAS for an uncommitted replacement nonce', async (t) => {
  const broken = await mutant(
    t,
    'if (existing !== commitments.existing || candidate !== commitments.new)',
    'if (false)',
  );
  const input = change(honest, 'nonceNew'),
    pair = commitments(honest);
  await assert.rejects(runtime.deriveCeremonyOpening(input, pair), /commitment mismatch/);
  const forbidden = await broken.deriveCeremonyOpening(input, pair);
  assert.deepEqual(forbidden, await runtime.deriveCeremonyOpening(input, commitments(input)));
});
