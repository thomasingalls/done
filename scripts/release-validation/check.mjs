/** Read-only by default; --record explicitly replaces the reviewed planning snapshot. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildInventory, assertSnapshot } from './inventory.mjs';
import { inventorySnapshot } from './inventory-snapshot.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
assert(
  args.length === 0 || (args.length === 1 && args[0] === '--record'),
  'Usage: node scripts/release-validation/check.mjs [--record]',
);
const policy = JSON.parse(readFileSync(new URL('./policy.json', import.meta.url)));
const inventory = buildInventory(root, policy);
let bytes = inventorySnapshot(inventory);
const path = new URL('../../docs/release-validation-graph.json', import.meta.url);
// Both modes bound the actual canonical snapshot, not a discarded raw representation.
if (args[0] !== '--record') bytes = readFileSync(path, 'utf8');
assert(
  Buffer.byteLength(bytes) <= 700000,
  'Inventory exceeds the 700 kB prospective artifact budget; review representation',
);
if (args[0] === '--record') writeFileSync(path, bytes);
else assertSnapshot(inventory, bytes);
console.log(
  JSON.stringify({
    status: 'passed',
    mode: args[0] === '--record' ? 'record' : 'check',
    ...inventory.counts,
    snapshotBytes: Buffer.byteLength(bytes),
  }),
);
console.log('Planning coverage only: no test bodies, native campaigns or aggregate have run.');
