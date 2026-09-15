/** Reviewed wrapper semantics, not a pathname-to-leaf shortcut. */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { accountFixtureNodeStage } from './account-fixture-tests.mjs';

export const preparationCampaign = 'scripts/account-crypto-prep/run.mjs';
export const preparationFiles = [
  'test/account-crypto-prep/census.test.mjs',
  'test/account-crypto-prep/contracts.test.mjs',
];

export const exactCommand = (command, argv) =>
  Object.keys(command.env).length === 0 &&
  command.argv.length === argv.length &&
  command.argv.every((value, i) => value === argv[i]);

export function preparationCampaignStage(id = 'campaign:' + preparationCampaign) {
  // This wrapper has no children or file outputs in check mode. Execute the actual
  // registry/home/manual-entry/snapshot checks, retaining stdout/stderr and exit.
  return {
    id,
    argv: ['node', preparationCampaign],
    env: {},
    variant: 'crypto-preparation-check-v1',
    expect: { kind: 'exit', exitCodes: [0] },
    deadlineMs: 60000,
    graceMs: 1000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
  };
}

export function preparationTestStage(root, id) {
  const files = readdirSync(join(root, 'test/account-crypto-prep'))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => 'test/account-crypto-prep/' + name);
  assert.deepEqual(files, preparationFiles, 'Review changed crypto preparation command glob');
  const leaves = files.map((file) => accountFixtureNodeStage(root, file));
  for (const leaf of leaves) {
    assert.deepEqual(Object.keys(leaf.expect).sort(), ['cases', 'kind']);
    assert.equal(leaf.fixture, undefined, 'Review new preparation command fixture');
  }
  return {
    ...preparationCampaignStage(id),
    // Expand the exact reviewed shell glob. Preserve Node's default file concurrency;
    // serial leaf receipts cannot discharge this grouped invocation. Only reporting changes.
    argv: [
      'node',
      '--test',
      '--test-reporter=./scripts/release-validation/node-reporter.mjs',
      ...files,
    ],
    variant: 'crypto-preparation-tests-v1',
    expect: { kind: 'cases', cases: leaves.flatMap((leaf) => leaf.expect.cases) },
    deadlineMs: 180000,
    graceMs: 5000,
  };
}

export function preparationCommand(root, command, id) {
  const requires = ['campaign:' + preparationCampaign];
  if (exactCommand(command, ['node', preparationCampaign])) return { requires };
  if (exactCommand(command, ['node', '--test', 'test/account-crypto-prep/*.test.mjs']))
    return { requires, stage: preparationTestStage(root, id) };
  return null;
}

/** Report-writing qualification variant, separate from the unchanged package command. */
export function preparationReportStage(root) {
  return {
    ...accountFixtureNodeStage(root, 'test/account-crypto-prep/contracts.test.mjs'),
    id: 'variant:preparation-reports',
    variant: 'crypto-preparation-reports-v1',
    fileOutputs: {
      kind: 'account-reports-v1',
      required: ['contract-probes.json'],
      maxEntries: 16,
      maxBytes: 1024 * 1024,
      maxDepth: 2,
    },
  };
}
