import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { corpus } from '../../test/account-transport-contract/oracle.mjs';
const path = 'test/vectors/account-transport.json',
  value = corpus();
if (process.argv.includes('--check')) assert.deepEqual(JSON.parse(readFileSync(path)), value);
else writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
console.log(`${value.vectors.length} fixed transport constructions reproduced independently.`);
