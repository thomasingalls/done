/** Bounded selections only; release refuses until every execution adapter is resolved. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildInventory, assertSnapshot } from './inventory.mjs';
import { currentIdentity, identityKey, canonical, digest } from './identity.mjs';
import { compileManifest, selectStages } from './manifest.mjs';
import { createStageRunner } from './stage.mjs';

const args = process.argv.slice(2);
assert(
  args.length === 2 && args[0] === '--selection',
  'Usage: node scripts/release-validation/execute.mjs --selection infrastructure|vectors|release',
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
const manifest = compileManifest(root, inventory);
assert.equal(
  digest(manifest),
  digest(
    JSON.parse(
      readFileSync(new URL('../../docs/release-validation-manifest.json', import.meta.url)),
    ),
  ),
  'Execution manifest drifted',
);
const stages = selectStages(manifest, args[1]); // Refuse unresolved selections before filesystem setup.
const output = join(
  root,
  'test-results/release-validation',
  new Date().toISOString().replaceAll(':', '-'),
);
mkdirSync(output, { recursive: true });
console.log('Bounded release validation: ' + output);
const controller = new AbortController();
const cancel = () => controller.abort();
process.on('SIGINT', cancel);
process.on('SIGTERM', cancel);
const workspace = mkdtempSync(join(tmpdir(), 'done-release-validation-')),
  checkout = join(workspace, 'checkout');
const summary = {
  schema: 1,
  selection: args[1],
  claim: 'Only this bounded selection; no native aggregate or release qualification.',
  status: 'running',
  stages: [],
  startedAt: new Date().toISOString(),
};
const save = () =>
  writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
save();
let frozen;
try {
  console.log('Fingerprinting current sources and installed dependency bytes');
  frozen = currentIdentity(root);
  writeFileSync(join(output, 'inputs.json.gz'), gzipSync(canonical(frozen) + '\n'));
  assert(!controller.signal.aborted, 'Cancelled before checkout');
  execFileSync('git', ['clone', '--shared', '--no-checkout', '--quiet', root, checkout], {
    timeout: 60000,
    stdio: 'pipe',
  });
  execFileSync('git', ['-C', checkout, 'reset', '--mixed', '--quiet', frozen.revision], {
    timeout: 60000,
    stdio: 'pipe',
  });
  const copy = (pins, from, to) => {
    for (const p of pins) {
      if (p.absent) continue;
      const dest = join(to, p.path);
      mkdirSync(dirname(dest), { recursive: true });
      if (p.link) symlinkSync(p.link, dest);
      else {
        copyFileSync(join(from, p.path), dest);
        chmodSync(dest, p.executable ? 0o755 : 0o644);
      }
    }
  };
  // No hard links or shared dependency directory: checks may write only this disposable copy.
  copy(frozen.sources, root, checkout);
  copy(frozen.dependencies, join(root, 'node_modules'), join(checkout, 'node_modules'));
  assert.equal(
    identityKey(currentIdentity(root)),
    identityKey(frozen),
    'Inputs changed while copying',
  );
  assert.equal(
    identityKey(currentIdentity(checkout)),
    identityKey(frozen),
    'Disposable copy does not match frozen inputs',
  );
  summary.input = identityKey(frozen);
  const run = createStageRunner({
    root: checkout,
    output: join(output, 'stages'),
    fingerprint: () => currentIdentity(checkout),
    heartbeat: ({ stage, elapsedMs }) =>
      console.log(stage + ' running ' + Math.floor(elapsedMs / 1000) + 's'),
  });
  const receipts = new Map();
  for (const stage of stages) {
    console.log('Starting ' + stage.id);
    const receipt = await run(stage, {
      signal: controller.signal,
      dependencies: stage.dependsOn.map((id) => receipts.get(id)),
    });
    receipts.set(stage.id, receipt);
    summary.stages.push({
      id: stage.id,
      key: receipt.key,
      status: receipt.status,
      elapsedMs: receipt.result.elapsedMs,
      cases: receipt.result.cases?.length ?? null,
      reason: receipt.result.reason,
      groupDrained: receipt.result.groupDrained,
    });
    save();
    assert.equal(
      receipt.status,
      'passed',
      'Stage failed: ' + stage.id + ': ' + receipt.result.reason,
    );
  }
  assert.equal(
    identityKey(currentIdentity(root)),
    identityKey(frozen),
    'Original input changed during selection',
  );
  summary.status = 'passed';
} catch (e) {
  summary.status = 'failed';
  summary.error = String(e);
  process.exitCode = 1;
} finally {
  // The runner records drain failure explicitly; preserve the checkout for diagnosis if it
  // cannot prove its process group drained. No native server/profile is used by this selection.
  if (summary.stages.every((s) => s.groupDrained))
    rmSync(workspace, { recursive: true, force: true });
  else summary.retainedWorkspace = workspace;
  summary.completedAt = new Date().toISOString();
  save();
  process.off('SIGINT', cancel);
  process.off('SIGTERM', cancel);
  console.log(summary.status + ': ' + output);
}
