import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inventorySnapshot } from '../../scripts/release-validation/inventory-snapshot.mjs';
import { assertSnapshot } from '../../scripts/release-validation/inventory.mjs';
test('compact inventory retains every field, case, disposition, input identity and drift check', () => {
  const original = JSON.parse(
    readFileSync(new URL('../../docs/release-validation-graph.json', import.meta.url)),
  );
  const bytes = inventorySnapshot(original);
  assert.deepEqual(JSON.parse(bytes), original);
  assert(Buffer.byteLength(bytes) < Buffer.byteLength(JSON.stringify(original, null, 2)));
  assert(Buffer.byteLength(bytes) <= 700000);
  assertSnapshot(original, bytes);
  for (const key of ['tests', 'campaigns', 'inputs', 'constructions']) {
    const changed = structuredClone(original);
    changed[key].pop();
    assert.throws(() => assertSnapshot(changed, bytes), /drifted/);
  }
});
