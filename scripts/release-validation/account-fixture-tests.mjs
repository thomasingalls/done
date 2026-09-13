/** Reviewed synthetic SQLite fixtures, in-process mutants and inherited crash workers.
 * No native browser fixture or wrapper evidence obligation is admitted by this list.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeCensus } from './census.mjs';
import { historicalInput } from './historical-inputs.mjs';

export const deliveryFixtureFiles = [
  'test/account-service-delivery/controls.test.mjs',
  'test/account-service-delivery/core.test.mjs',
  'test/account-service-delivery/generated.test.mjs',
  'test/account-service-delivery/restart.test.mjs',
  'test/account-service-inbound/controls.test.mjs',
  'test/account-service-inbound/core.test.mjs',
  'test/account-service-inbound/generated.test.mjs',
  'test/account-service-inbound/restart.test.mjs',
];

const history = {
  'test/account-service-delivery/controls.test.mjs': ['2cb42a2', 'account-service/core.ts'],
  'test/account-service-inbound/core.test.mjs': [
    '4bb09042f37f68ec31f0d82587af608f599eb096',
    'account-service/delivery.ts',
  ],
};

export const serviceFixtureFiles = [
  'test/account-recovery/controls.test.mjs',
  'test/account-recovery/core.test.mjs',
  'test/account-recovery/crypto.test.mjs',
  'test/account-recovery/properties.test.mjs',
  'test/account-recovery/restart.test.mjs',
  'test/account-promotion/core.test.mjs',
  'test/account-activation/controls.test.mjs',
  'test/account-activation/core.test.mjs',
  'test/account-activation/restart.test.mjs',
  'test/account-handoff/core.test.mjs',
  'test/account-handoff/es256.test.mjs',
];

export const accountFixtureFiles = {
  vitest: ['test/accountDelivery.test.ts'],
  node: [
    'test/account-core/controls.test.mjs',
    'test/account-core/properties.test.mjs',
    'test/account-core/restart.test.mjs',
    'test/account-authority/core.test.mjs',
    'test/account-authority/controls.test.mjs',
    'test/account-authority/properties.test.mjs',
    'test/account-authority/restart.test.mjs',
    'test/account-admission/core.test.mjs',
    'test/account-admission/controls.test.mjs',
    'test/account-admission/restart.test.mjs',
    ...serviceFixtureFiles,
    ...deliveryFixtureFiles,
  ],
};

export function accountFixtureNodeStage(root, file) {
  assert(accountFixtureFiles.node.includes(file), 'Unreviewed Account fixture file');
  return {
    id: 'test:' + file,
    argv: [
      'node',
      '--test',
      '--test-concurrency=1',
      '--test-reporter=./scripts/release-validation/node-reporter.mjs',
      file,
    ],
    env: {},
    variant: 'node-account-fixture-file-v1',
    expect: {
      kind: 'cases',
      cases: generatedNodeCensus(file, readFileSync(join(root, file), 'utf8')),
      ...(history[file] ? { historyInputs: [historicalInput(root, ...history[file])] } : {}),
    },
    deadlineMs: 180000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
  };
}
