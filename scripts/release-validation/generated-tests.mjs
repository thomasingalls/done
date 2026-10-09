/** Reviewed finite registrations; not permission to run arbitrary test-file fixtures. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeCensus } from './census.mjs';
export const generatedFiles = {
  vitest: [
    'test/accountInboundControls.test.ts',
    'test/contentRecord.test.ts',
    'test/custodyCrypto.test.ts',
    'test/journalCodec.test.ts',
    'test/legacyExport.test.ts',
    'test/legacySource.test.ts',
    'test/localGenesis.test.ts',
    'test/networkEnvelope.test.ts',
    'test/ownedStartup.test.ts',
    'test/seam.test.ts',
    'test/storageProperties.test.ts',
    'test/storageSchedule.test.ts',
    'test/syncProperties.test.ts',
  ],
  node: ['test/account-core/core.test.mjs'],
};
export function generatedNodeStage(root, file) {
  assert(generatedFiles.node.includes(file), 'Unreviewed generated Node file');
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
    variant: 'node-generated-file-v1',
    expect: {
      kind: 'cases',
      cases: generatedNodeCensus(file, readFileSync(join(root, file), 'utf8')),
    },
    deadlineMs: 180000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
  };
}
