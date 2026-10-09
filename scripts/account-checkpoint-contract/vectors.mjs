import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { corpus } from '../../test/account-checkpoint-contract/oracle.mjs';
const file = 'test/vectors/account-checkpoint.json',
  value = corpus();
if (process.argv.includes('--check')) assert.deepEqual(JSON.parse(readFileSync(file)), value);
else writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
console.log(value.vectors.length + ' independent checkpoint bridge vectors current.');
