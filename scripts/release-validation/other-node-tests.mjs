/** Explicit non-Account fixtures. Registration alone never qualifies a new runtime. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';

export const otherNodeGroups = {
  'other-harness-fixtures': [
    'test/legacy-cleanup/harness.node.mjs',
    'test/storage-harness/lifecycle.node.mjs',
  ],
  'other-native-fixtures': [
    'test/storage-capacity/marker-native.test.mjs',
    'test/storage-capacity/maintenance.test.mjs',
    'test/local-recovery/native.test.mjs',
  ],
  'other-node-controls': [
    'test/storage-capacity/marker.test.mjs',
    'test/validation-controls/origin.test.mjs',
    'test/legacy-host/harness.node.mjs',
    'test/legacy-host-cold/harness.node.mjs',
  ],
};
export const otherNodeFiles = Object.values(otherNodeGroups).flat();

export function otherNodeStage(root, file) {
  assert(otherNodeFiles.includes(file), 'Unreviewed other Node fixture');
  const declarations = generatedNodeDeclarations(file, readFileSync(join(root, file), 'utf8'), {
    root,
  });
  const registered = otherNodeGroups['other-harness-fixtures'].includes(file);
  const native =
    otherNodeGroups['other-native-fixtures'].includes(file) ||
    file === 'test/storage-harness/lifecycle.node.mjs';
  const profiles = native && !registered && file !== 'test/storage-capacity/marker-native.test.mjs';
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
    variant: registered
      ? 'node-registered-groups-v1'
      : profiles
        ? 'node-inherited-chromium-v1'
        : 'node-other-file-v1',
    ...(native
      ? {
          fixture: {
            kind: profiles ? 'chromium-inherited-profiles' : 'chromium-cdp',
            startupMs: 15000,
          },
        }
      : {}),
    expect: {
      kind: 'cases',
      cases: declarations.cases,
      ...(declarations.dataInputs.length ? { dataInputs: declarations.dataInputs } : {}),
    },
    deadlineMs: registered || native ? 120000 : 60000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: registered ? 'registered-groups-v1' : 'inherited-group-v1',
    dependsOn: [],
  };
}
