/** Bounded selections only; release refuses until every execution adapter is resolved. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
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

import { installedChromium } from './browser.mjs';

export async function executeStages({ root, stages, output, selection }) {
  assert(!existsSync(output), 'Refusing existing execution output: ' + output);
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
    selection,
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
    const browserRuntime = stages.some((s) => s.fixture) ? installedChromium() : undefined;
    const fingerprint = (path) => {
      const identity = currentIdentity(path);
      if (browserRuntime) identity.tools = { chromium: digest(installedChromium().snapshot) };
      return identity;
    };
    frozen = fingerprint(root);
    if (browserRuntime)
      writeFileSync(
        join(output, 'browser-inputs.json.gz'),
        gzipSync(canonical(browserRuntime.snapshot) + '\n'),
      );
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
      identityKey(fingerprint(root)),
      identityKey(frozen),
      'Inputs changed while copying',
    );
    assert.equal(
      identityKey(fingerprint(checkout)),
      identityKey(frozen),
      'Disposable copy does not match frozen inputs',
    );
    summary.input = identityKey(frozen);
    const run = createStageRunner({
      root: checkout,
      output: join(output, 'stages'),
      fingerprint: () => fingerprint(checkout),
      browserRuntime,
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
      identityKey(fingerprint(root)),
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
    // cannot prove its worker and any owned browser groups drained.
    if (summary.stages.every((s) => s.groupDrained))
      rmSync(workspace, { recursive: true, force: true });
    else summary.retainedWorkspace = workspace;
    summary.completedAt = new Date().toISOString();
    save();
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
    console.log(summary.status + ': ' + output);
  }

  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const args = process.argv.slice(2);
  assert(
    args.length === 2 && args[0] === '--selection',
    'Usage: node scripts/release-validation/execute.mjs --selection infrastructure|browser-geometry-layout|browser-upgrade-fixtures|browser-upgrade-qualification|browser-storage-fixtures|browser-storage-qualification|browser-local-fixtures|browser-local-qualification|browser-runner-controls|runner-self-tests|runner-self-regression|other-harness-fixtures|other-native-fixtures|other-native-regression|other-node-controls|vitest-properties|vitest-reviewed|node-protocol|general-tests|generated-tests|account-fixtures|service-fixtures|delivery-fixtures|isolation-fixtures|ledger-fixtures|contract-fixtures|preparation-fixtures|oracle-parser-fixtures|transport-service-fixtures|receive-transport-fixtures|receive-driver-fixtures|sync-fixtures|receive-editor-fixtures|spool-fixture|delivery-native-fixture|decisions-native-fixture|capture-native-fixture|editing-native-fixture|handoff-native-fixture|admission-native-fixture|genesis-native-fixture|promotion-native-fixture|authority-native-fixture|recovery-native-fixture|core-native-fixture|activation-native-fixture|service-inbound-native-fixture|delivery-oracle-native-fixture|parser-conformance-native-fixture|promotion-contract-native-fixture|checkpoint-contract-native-fixture|counter-contract-native-fixture|store-contract-native-fixture|local-provenance-native-fixture|local-custody-native-fixture|admission-bounds-native-fixture|reservation-durability-fixtures|outbound-native-fixture|decision-directed-fixtures|decision-history-fixtures|failure-fixtures|liveness-node-fixtures|liveness-browser-fixtures|liveness-workload-fixture|liveness-growth-fixture|residue-calibration-fixture|residue-lifecycle-fixtures|residue-generated-fixture|residue-packaged-fixture|residue-node-fixtures|vectors|content|content-control|journal|admission|editor-admission|workspace-admission|owned-startup|local-clear|content-trim|custody|write-session|local-genesis|release',
  );

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
  await executeStages({ root, stages, output, selection: args[1] });
}
