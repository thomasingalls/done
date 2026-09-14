/** Explicit non-Account fixtures. Registration alone never qualifies a new runtime. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';

export const otherNodeGroups = {
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
    variant: 'node-other-file-v1',
    expect: {
      kind: 'cases',
      cases: declarations.cases,
      ...(declarations.dataInputs.length ? { dataInputs: declarations.dataInputs } : {}),
    },
    deadlineMs: 60000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
  };
}
