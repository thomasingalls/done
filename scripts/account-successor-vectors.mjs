/** Exact reproduction of the maintained independent successor oracle. Does not change old vectors. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { published } from '../test/account-successor/oracle.mjs';
assert.deepEqual(
  process.argv.slice(2),
  ['--check'],
  'Usage: node scripts/account-successor-vectors.mjs --check',
);
assert.deepEqual(
  JSON.parse(
    readFileSync(new URL('../test/vectors/account-successor.json', import.meta.url), 'utf8'),
  ),
  published(),
);
console.log('account-successor.json matches the independent encoding/signature oracle.');
