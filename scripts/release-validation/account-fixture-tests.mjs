/** Reviewed synthetic fixtures, in-memory builds, mutants and inherited crash workers.
 * Browser fixtures need an explicit owned-CDP contract. Whole-wrapper credit remains separate.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
import { historicalInput } from './historical-inputs.mjs';

export const authorityNativeFixtureFiles = ['test/account-authority/native.test.mjs'];

export const promotionNativeFixtureFiles = ['test/account-promotion/native.test.mjs'];

export const genesisNativeFixtureFiles = ['test/account-genesis/native.test.mjs'];

export const admissionNativeFixtureFiles = ['test/account-admission/native.test.mjs'];

export const handoffNativeFixtureFiles = ['test/account-handoff/native.test.mjs'];

export const editingNativeFixtureFiles = ['test/account-editing/native.test.mjs'];

export const captureNativeFixtureFiles = ['test/account-capture/native.test.mjs'];

export const decisionsNativeFixtureFiles = ['test/account-decisions/native.test.mjs'];

export const deliveryNativeFixtureFiles = ['test/account-delivery/native.test.mjs'];

export const spoolFixtureFiles = ['test/account-spool/native.test.mjs'];

export const receiveEditorFixtureFiles = [
  'test/account-receive/native.test.mjs',
  'test/account-receive-editor/native.test.mjs',
];
const receiveEditorDeadlines = {
  'test/account-receive/native.test.mjs': 300000,
  'test/account-receive-editor/native.test.mjs': 480000,
};

export const syncBrowserFiles = [
  'test/account-sync/batch.test.mjs',
  'test/account-sync/generated.test.mjs',
  'test/account-sync/native-controls.test.mjs',
  'test/account-sync/native.test.mjs',
];
export const syncFixtureFiles = ['test/account-sync/controls.test.mjs', ...syncBrowserFiles];
const syncDeadlines = {
  // Batch previously shared the liveness wrapper's 300-second ownership stage.
  'test/account-sync/batch.test.mjs': 300000,
  'test/account-sync/controls.test.mjs': 90000,
  'test/account-sync/generated.test.mjs': 450000,
  'test/account-sync/native-controls.test.mjs': 150000,
  'test/account-sync/native.test.mjs': 600000,
};

export const receiveDriverBrowserFiles = [
  'test/account-receive-driver/generated.test.mjs',
  'test/account-receive-driver/native-controls.test.mjs',
  'test/account-receive-driver/native.test.mjs',
];
export const receiveDriverFixtureFiles = [
  'test/account-receive-driver/controls.test.mjs',
  ...receiveDriverBrowserFiles,
];
const receiveDriverDeadlines = {
  'test/account-receive-driver/controls.test.mjs': 90000,
  'test/account-receive-driver/generated.test.mjs': 270000,
  'test/account-receive-driver/native-controls.test.mjs': 90000,
  // Nine cases now include four R-01 size checks; keep the reviewed wrapper bound.
  'test/account-receive-driver/native.test.mjs': 180000,
};

export const receiveTransportFixtureFiles = [
  'test/account-receive-transport/controls.test.mjs',
  'test/account-receive-transport/generated.test.mjs',
  'test/account-receive-transport/native.test.mjs',
];

// Preserve each complete file's existing wrapper deadline, including its in-memory builds.
const receiveTransportDeadlines = {
  'test/account-receive-transport/controls.test.mjs': 90000,
  'test/account-receive-transport/generated.test.mjs': 330000,
  'test/account-receive-transport/native.test.mjs': 120000,
};

export const transportServiceFixtureFiles = [
  'test/account-transport/controls.test.mjs',
  'test/account-transport/generated.test.mjs',
  'test/account-transport/service.test.mjs',
];

export const oracleParserFixtureFiles = [
  'test/account-delivery-oracle/controls.test.mjs',
  'test/account-delivery-oracle/oracle.test.mjs',
  'test/account-parser-conformance/baseline.test.mjs',
  'test/account-parser-conformance/controls.test.mjs',
  'test/account-parser-conformance/objects.test.mjs',
  'test/account-parser-conformance/submission.test.mjs',
  'test/account-parser-conformance/wires.test.mjs',
];

export const preparationFixtureFiles = [
  'test/account-admission-bounds/protocol.test.mjs',
  'test/account-admission-evidence/receipt.test.mjs',
  'test/account-admission-evidence/size.test.mjs',
  'test/account-crypto-prep/census.test.mjs',
  'test/account-crypto-prep/contracts.test.mjs',
  'test/account-first-authority/registry.test.mjs',
  'test/account-genesis/crypto.test.mjs',
  'test/account-outbound/preparation.test.mjs',
];

// Preserve the six-minute wrapper bounds already declared for these complete native files.
export const admissionEvidenceFiles = [
  'test/account-admission-evidence/receipt.test.mjs',
  'test/account-admission-evidence/size.test.mjs',
];

export const contractFixtureFiles = [
  'test/account-recovery-contract/controls.test.mjs',
  'test/account-recovery-contract/exports.test.mjs',
  'test/account-transport-contract/controls.test.mjs',
  'test/account-service-custody/controls.test.mjs',
  'test/account-service-custody/exports.test.mjs',
];

export const ledgerFixtureFiles = [
  'test/account-ledger-contract/batch.test.mjs',
  'test/account-ledger-contract/controls.test.mjs',
  'test/account-ledger-contract/formats.test.mjs',
];

export const isolationFixtureFiles = [
  'test/account-isolation/controls.test.mjs',
  'test/account-isolation/core.test.mjs',
  'test/account-isolation/generated.test.mjs',
  'test/account-isolation/recovery.test.mjs',
  'test/account-isolation/restart.test.mjs',
];

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
  'test/account-genesis/native.test.mjs': [['a4e1c15', 'src/crdt/promotionRecord.ts']],
  'test/account-admission/native.test.mjs': [['280f616', 'src/crdt/promotionRecord.ts']],
  'test/account-handoff/native.test.mjs': [['beed8cf', 'src/crdt/promotionRecord.ts']],
  'test/account-editing/native.test.mjs': [['649925f', 'src/crdt/promotionRecord.ts']],
  'test/account-capture/native.test.mjs': [['18ceb40', 'src/crdt/promotionRecord.ts']],
  'test/account-delivery/native.test.mjs': [['81a4655', 'src/crdt/promotionRecord.ts']],
  'test/account-spool/native.test.mjs': [['7210b7d', 'src/crdt/promotionRecord.ts']],
  'test/account-receive/native.test.mjs': [['8378596', 'src/crdt/promotionRecord.ts']],
  'test/account-sync/native.test.mjs': [
    ['4bb09042f37f68ec31f0d82587af608f599eb096', 'src/crdt/accountEnvelopePreparation.ts'],
    ['4bb09042f37f68ec31f0d82587af608f599eb096', 'src/crdt/accountDelivery.ts'],
  ],
  'test/account-transport/service.test.mjs': [
    ['4bb09042f37f68ec31f0d82587af608f599eb096', 'account-service/delivery.ts'],
  ],
  'test/account-delivery-oracle/controls.test.mjs': [
    ['77b0bb6239f7b7a48c4a52c74d3e3f39e39994a3', 'test/accountDelivery.test.ts'],
  ],
  'test/account-parser-conformance/baseline.test.mjs': [
    ['f0b6acd2e624d89034c88706d4053a830ab50cc6', 'src/crdt/promotionRecord.ts'],
    ['f0b6acd2e624d89034c88706d4053a830ab50cc6', 'src/crdt/spoolRecord.ts'],
    ['f0b6acd2e624d89034c88706d4053a830ab50cc6', 'src/crdt/startupClassification.ts'],
    ['f0b6acd2e624d89034c88706d4053a830ab50cc6', 'account-protocol/genesis.ts'],
  ],
  'test/account-ledger-contract/batch.test.mjs': [
    ['284a97a27dc3344fcb7c55a8757a2a41c74fe0b9', 'src/crdt/spoolRecord.ts'],
  ],
  'test/account-service-delivery/controls.test.mjs': [['2cb42a2', 'account-service/core.ts']],
  'test/account-service-inbound/core.test.mjs': [
    ['4bb09042f37f68ec31f0d82587af608f599eb096', 'account-service/delivery.ts'],
  ],
  'test/account-admission-bounds/protocol.test.mjs': [
    ['6398e33', 'account-protocol/admission.ts'],
    ['6398e33', 'account-service/authority.ts'],
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
    ...isolationFixtureFiles,
    ...ledgerFixtureFiles,
    ...contractFixtureFiles,
    ...preparationFixtureFiles,
    ...oracleParserFixtureFiles,
    ...transportServiceFixtureFiles,
    ...receiveTransportFixtureFiles,
    ...receiveDriverFixtureFiles,
    ...syncFixtureFiles,
    ...receiveEditorFixtureFiles,
    ...spoolFixtureFiles,
    ...deliveryNativeFixtureFiles,
    ...decisionsNativeFixtureFiles,
    ...captureNativeFixtureFiles,
    ...editingNativeFixtureFiles,
    ...handoffNativeFixtureFiles,
    ...admissionNativeFixtureFiles,
    ...genesisNativeFixtureFiles,
    ...promotionNativeFixtureFiles,
    ...authorityNativeFixtureFiles,
  ],
};

export function accountFixtureNodeStage(root, file) {
  assert(accountFixtureFiles.node.includes(file), 'Unreviewed Account fixture file');
  const browser =
    admissionEvidenceFiles.includes(file) ||
    receiveTransportFixtureFiles.includes(file) ||
    receiveDriverBrowserFiles.includes(file) ||
    syncBrowserFiles.includes(file) ||
    receiveEditorFixtureFiles.includes(file) ||
    spoolFixtureFiles.includes(file) ||
    deliveryNativeFixtureFiles.includes(file) ||
    decisionsNativeFixtureFiles.includes(file) ||
    captureNativeFixtureFiles.includes(file) ||
    editingNativeFixtureFiles.includes(file) ||
    handoffNativeFixtureFiles.includes(file) ||
    admissionNativeFixtureFiles.includes(file) ||
    genesisNativeFixtureFiles.includes(file) ||
    promotionNativeFixtureFiles.includes(file) ||
    authorityNativeFixtureFiles.includes(file);
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
    variant: browser ? 'node-account-browser-file-v1' : 'node-account-fixture-file-v1',
    ...(browser ? { fixture: { kind: 'chromium-cdp', startupMs: 15000 } } : {}),
    expect: {
      kind: 'cases',
      cases: declarations.cases,
      ...(declarations.dataInputs.length ? { dataInputs: declarations.dataInputs } : {}),
      ...(history[file]
        ? { historyInputs: history[file].map((locator) => historicalInput(root, ...locator)) }
        : {}),
    },
    deadlineMs:
      (authorityNativeFixtureFiles.includes(file) ? 120000 : undefined) ??
      (promotionNativeFixtureFiles.includes(file) ? 120000 : undefined) ??
      (genesisNativeFixtureFiles.includes(file) ? 180000 : undefined) ??
      (admissionNativeFixtureFiles.includes(file) ? 180000 : undefined) ??
      (handoffNativeFixtureFiles.includes(file) ? 180000 : undefined) ??
      (editingNativeFixtureFiles.includes(file) ? 300000 : undefined) ??
      (captureNativeFixtureFiles.includes(file) ? 180000 : undefined) ??
      (decisionsNativeFixtureFiles.includes(file) ? 120000 : undefined) ??
      (deliveryNativeFixtureFiles.includes(file) ? 480000 : undefined) ??
      (spoolFixtureFiles.includes(file) ? 240000 : undefined) ??
      receiveEditorDeadlines[file] ??
      syncDeadlines[file] ??
      receiveDriverDeadlines[file] ??
      receiveTransportDeadlines[file] ??
      (browser ? 360000 : 180000),
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
  };
}
