import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { corpus } from '../../test/account-promotion-contract/oracle.mjs';
const file = 'test/vectors/account-promotion.json',
  value = corpus();
if (process.argv.includes('--check')) assert.deepEqual(JSON.parse(readFileSync(file)), value);
else writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
console.log(value.vectors.length + ' independent local promotion vectors current.');
