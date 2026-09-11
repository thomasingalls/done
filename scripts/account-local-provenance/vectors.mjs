import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { corpus } from '../../test/account-local-provenance/oracle.mjs';
const file = 'test/vectors/account-local-provenance.json',
  value = corpus();
if (process.argv.includes('--check')) assert.deepEqual(JSON.parse(readFileSync(file)), value);
else writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
console.log(value.vectors.length + ' independent retained Local claim vectors current.');
