/** Explicit non-browser file dispositions. Successful parsing alone does not admit a file. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { directNodeCensus } from './census.mjs';
import { propertyFiles, vitestFilePattern } from './vitest-adapter.mjs';

export function generalTestPolicy(root) {
  const p = JSON.parse(readFileSync(join(root, 'scripts/release-validation/general-tests.json')));
  assert.equal(p.schema, 1);
  assert.deepEqual(Object.keys(p).sort(), ['node', 'schema', 'vitest']);
  for (const kind of ['node', 'vitest']) {
    assert(Array.isArray(p[kind]) && p[kind].length, 'Empty reviewed test family');
    const pattern =
      kind === 'vitest' ? vitestFilePattern : /^test\/account-[a-z-]+\/formats\.test\.mjs$/;
    assert(
      p[kind].every((file) => typeof file === 'string' && pattern.test(file)),
      'Unreviewed test path',
    );
  }
  const files = [...p.vitest, ...p.node, ...propertyFiles];
  assert.equal(new Set(files).size, files.length, 'Duplicate reviewed test file');
  return p;
}

export function nodeProtocolStage(root, file) {
  assert(/^test\/account-[a-z-]+\/formats\.test\.mjs$/.test(file), 'Unreviewed Node protocol path');
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
    variant: 'node-protocol-file-v1',
    expect: {
      kind: 'cases',
      cases: directNodeCensus(file, readFileSync(join(root, file), 'utf8')),
    },
    deadlineMs: 180000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
  };
}

export function assertGeneralTestPopulation(policy, inventory) {
  for (const kind of ['vitest', 'node'])
    for (const file of policy[kind]) {
      const t = inventory.tests.find((t) => t.path === file);
      assert(t?.status === 'required', 'Reviewed test removed or excluded: ' + file);
      assert.deepEqual(
        t.invocation.argv,
        kind === 'vitest'
          ? ['node', 'node_modules/vitest/vitest.mjs', 'run', file]
          : ['node', '--test', '--test-concurrency=1', file],
        'Reviewed test changed runner: ' + file,
      );
    }
}
