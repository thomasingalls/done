import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildInventory, assertSnapshot } from './inventory.mjs';
import { digest } from './identity.mjs';
import { compileManifest, selectStages } from './manifest.mjs';
import { manifestSnapshot } from './manifest-snapshot.mjs';
const args = process.argv.slice(2);
assert(
  args.length === 0 || (args.length === 1 && ['--record', '--require-complete'].includes(args[0])),
  'Usage: node scripts/release-validation/plan.mjs [--record|--require-complete]',
);
const root = fileURLToPath(new URL('../..', import.meta.url));
const inventory = buildInventory(
  root,
  JSON.parse(readFileSync(new URL('./policy.json', import.meta.url))),
);
assertSnapshot(
  inventory,
  readFileSync(new URL('../../docs/release-validation-graph.json', import.meta.url), 'utf8'),
);
const plan = compileManifest(root, inventory),
  path = new URL('../../docs/release-validation-manifest.json', import.meta.url);
if (args[0] === '--record') writeFileSync(path, manifestSnapshot(plan));
else
  assert.equal(
    digest(plan),
    digest(JSON.parse(readFileSync(path))),
    'Execution manifest drifted; review before --record',
  );
console.log(
  JSON.stringify({
    status: plan.status,
    obligations: plan.rows.length,
    unresolved: plan.unresolved.length,
    infrastructureStages: selectStages(plan, 'infrastructure').length,
    vectorStages: selectStages(plan, 'vectors').length,
  }),
);
if (args[0] === '--require-complete') selectStages(plan, 'release');
