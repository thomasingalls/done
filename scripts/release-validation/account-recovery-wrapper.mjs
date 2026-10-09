import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';

export const recoveryCampaign = 'scripts/account-recovery/run.mjs';
export const recoveryFiles = ['core', 'crypto', 'properties', 'restart', 'controls', 'native'].map(
  (name) => `test/account-recovery/${name}.test.mjs`,
);
export const recoveryReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  'run.log',
  'control-root.json',
  'recovery-profiles.json',
  ...['recovery', 'passkey'].flatMap((name) =>
    ['baseline', 'mutant'].map((variant) => `control-${name}-${variant}.json`),
  ),
];
export const recoveryFilePolicy = {
  kind: 'account-reports-v1',
  required: recoveryReports,
  maxEntries: 32,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 1,
};

export function recoveryCampaignStage(root) {
  const cases = recoveryFiles.flatMap((file) => {
    const declarations = generatedNodeDeclarations(file, readFileSync(join(root, file), 'utf8'), {
      root,
    });
    assert.deepEqual(declarations.dataInputs, [], 'Review new recovery registration inputs');
    return declarations.cases;
  });
  return {
    id: 'campaign:' + recoveryCampaign,
    argv: ['node', recoveryCampaign],
    env: {},
    variant: 'account-recovery-campaign-v1',
    expect: { kind: 'account-recovery', cases },
    // Preserve the wrapper's 120-second campaign bound; the owner also drains descendants.
    deadlineMs: 120000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-inherited-profiles', startupMs: 15000 },
    fileOutputs: structuredClone(recoveryFilePolicy),
  };
}

export function validateRecoveryCampaign(stage) {
  assert.equal(
    stage.expect.kind,
    'account-recovery',
    'Recovery wrapper requires report postconditions',
  );
  assert.equal(stage.variant, 'account-recovery-campaign-v1');
  assert.deepEqual(stage.argv, ['node', recoveryCampaign]);
  assert.deepEqual(stage.env, {});
  assert.deepEqual(stage.fileOutputs, recoveryFilePolicy);
  assert.deepEqual(stage.fixture, { kind: 'chromium-inherited-profiles', startupMs: 15000 });
  assert.equal(stage.deadlineMs, 120000);
  assert.equal(stage.graceMs, 5000);
  assert.equal(stage.processPolicy, 'inherited-group-v1');
}

/** Called only after bounded inventory validation and producer drain. Node's owned
 * terminal census is the case authority; JUnit and run.log remain auxiliary evidence. */
export function reconcileRecoveryReports(directory, sources, owner) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Recovery campaign summary failed');
  assert.equal(summary.code, 0);
  assert.equal(summary.timedOut, false);
  assert.equal(summary.launchError, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
      'Invalid campaign time',
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  const selected = sources.filter(
    ({ path }) =>
      [
        'package.json',
        'pnpm-lock.yaml',
        'tsconfig.node.json',
        'tsconfig.app.json',
        'src/account/recovery.ts',
        'src/account/recoveryOwner.ts',
        'test/account-core/fixtures.mjs',
        'test/account-core/worker.mjs',
        recoveryCampaign,
        'docs/account-recovery.md',
      ].includes(path) ||
      /^(?:account-service|account-protocol|test\/account-recovery)\/[^/]+\.(?:ts|mjs)$/.test(path),
  );
  const sort = (rows) => [...rows].sort((a, b) => a.path.localeCompare(b.path));
  assert.deepEqual(
    sort(json('sources.json')),
    sort(selected.map(({ path, sha256 }) => ({ path, sha256 }))),
    'Recovery report source pins disagree with owned inputs',
  );
  for (const gate of ['recovery', 'passkey']) {
    assert.equal(
      json(`control-${gate}-baseline.json`).result.refusal,
      'invalid-proof',
      `${gate} baseline did not refuse`,
    );
    assert.equal(
      json(`control-${gate}-mutant.json`).result.stage,
      'recovery-confirmed',
      `${gate} control did not discriminate`,
    );
  }
  const root = json('control-root.json');
  assert.equal(root.result.stage, 'recovery-confirmed', 'Root control did not confirm');
  for (const field of ['authRoot', 'rootCommitment']) {
    for (const draft of [root.original, root.draft])
      assert(/^[a-f0-9]{64}$/.test(draft[field]), 'Invalid root control binding');
    assert.notEqual(
      root.original[field],
      root.draft[field],
      'Root control did not substitute binding',
    );
  }
  assert.deepEqual(
    root.original.envelope,
    root.draft.envelope,
    'Root control changed the sealed payload',
  );
  assert(
    root.original.envelope &&
      typeof root.original.envelope.ct === 'string' &&
      root.original.envelope.ct.length > 0,
  );
  reconcileRecoveryProfiles(json('recovery-profiles.json'), owner);
  // Presence/bytes are already bound by fileOutputs. Do not credit JUnit as an
  // independent oracle or discard counterexample/ledger diagnostics on failures.
  for (const file of ['run.log', 'results.xml'])
    assert(
      readFileSync(join(directory, file)).length > 0,
      'Empty recovery auxiliary report: ' + file,
    );
}

/** The native case owns these browser lifetimes inside its inherited process group.
 * The stage owner separately proves that the entire group has drained. */
export function reconcileRecoveryProfiles(records, { custodyOutput, browserExecutable }) {
  assert(Array.isArray(records) && records.length === 3, 'Recovery needs three browser lifetimes');
  assert.equal(new Set(records.map((r) => r.pid)).size, 3, 'Recovery browser PID reused');
  const workerPid = records[0].workerPid;
  assert(Number.isSafeInteger(workerPid) && workerPid > 0, 'Missing native worker identity');
  const profile = join(custodyOutput, 'recovery', 'profiles', 'source-false');
  records.forEach((r, i) => {
    assert.equal(r.workerPid, workerPid, 'Recovery worker changed');
    assert(
      Number.isSafeInteger(r.pid) && r.pid > 0 && r.pid !== workerPid,
      'Invalid recovery browser PID',
    );
    assert.equal(r.name, 'source-false');
    assert.equal(r.executable, browserExecutable, 'Unpinned recovery browser');
    assert.equal(r.profile, profile, 'Recovery profile changed or escaped owner');
    assert.equal(r.ownership, 'inherited-worker-group');
    assert.equal(r.closed, true, 'Recovery profile not closed');
    assert.equal(r.exit, 0, 'Recovery browser exit failed');
    assert.equal(r.signal, null);
    assert.equal(r.failure, undefined, 'Recovery browser failure');
    assert.equal(r.copy, undefined, 'Recovery unexpectedly copied a profile');
    assert.deepEqual(
      r.reopen,
      i ? { priorPid: records[i - 1].pid, ordinal: i } : undefined,
      'Recovery reopen chain broken',
    );
    for (const flag of [
      '--use-mock-keychain',
      '--password-store=basic',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profile,
    ])
      assert(r.argv.includes(flag), 'Recovery profile invocation changed');
    assert(
      /^ws:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/devtools\/browser\/[a-f0-9-]+$/i.test(r.endpoint) &&
        Number(new URL(r.endpoint).port) <= 65535,
      'Unowned recovery endpoint',
    );
  });
}
