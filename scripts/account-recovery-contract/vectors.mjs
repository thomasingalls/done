import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { corpus } from '../../test/account-recovery-contract/oracle.mjs';
const path = 'test/vectors/account-recovery.json';
const value = corpus();
if (process.argv.includes('--check')) assert.deepEqual(JSON.parse(readFileSync(path)), value);
else writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
console.log('Current recovery corpus: ' + value.vectors.length + ' fixed constructions.');
