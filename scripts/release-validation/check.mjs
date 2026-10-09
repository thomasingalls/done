/** Read-only by default; --record explicitly replaces the reviewed planning snapshot. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildInventory, assertSnapshot } from './inventory.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
assert(
  args.length === 0 || (args.length === 1 && args[0] === '--record'),
  'Usage: node scripts/release-validation/check.mjs [--record]',
);
const policy = JSON.parse(readFileSync(new URL('./policy.json', import.meta.url)));
const inventory = buildInventory(root, policy);
let bytes = JSON.stringify(inventory, null, 2) + '\n';
if (args[0] === '--record') {
  const { format } = await import('oxfmt');
  const { printWidth } = JSON.parse(readFileSync(new URL('../../.oxfmtrc.json', import.meta.url)));
  const result = await format('docs/release-validation-graph.json', bytes, { printWidth });
  assert.equal(result.errors.length, 0, 'Cannot format planning inventory');
  bytes = result.code;
}
const path = new URL('../../docs/release-validation-graph.json', import.meta.url);
assert(
  Buffer.byteLength(bytes) <= 700000,
  'Inventory exceeds the 700 kB prospective artifact budget; review representation',
);
if (args[0] === '--record') writeFileSync(path, bytes);
else {
  bytes = readFileSync(path, 'utf8');
  assertSnapshot(inventory, bytes);
}
console.log(
  JSON.stringify({
    status: 'passed',
    mode: args[0] === '--record' ? 'record' : 'check',
    ...inventory.counts,
    snapshotBytes: Buffer.byteLength(bytes),
  }),
);
console.log('Planning coverage only: no test bodies, native campaigns or aggregate have run.');
