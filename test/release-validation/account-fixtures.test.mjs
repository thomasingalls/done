import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as fc from 'fast-check';
import {
  accountFixtureFiles,
  accountFixtureNodeStage,
  serviceFixtureFiles,
  deliveryFixtureFiles,
  isolationFixtureFiles,
  ledgerFixtureFiles,
  contractFixtureFiles,
  preparationFixtureFiles,
  oracleParserFixtureFiles,
  transportServiceFixtureFiles,
  receiveTransportFixtureFiles,
  receiveDriverFixtureFiles,
  receiveDriverBrowserFiles,
  syncFixtureFiles,
  syncBrowserFiles,
  receiveEditorFixtureFiles,
  spoolFixtureFiles,
  deliveryNativeFixtureFiles,
  decisionsNativeFixtureFiles,
  captureNativeFixtureFiles,
  editingNativeFixtureFiles,
  handoffNativeFixtureFiles,
  admissionNativeFixtureFiles,
  genesisNativeFixtureFiles,
  promotionNativeFixtureFiles,
  authorityNativeFixtureFiles,
  recoveryNativeFixtureFiles,
  coreNativeFixtureFiles,
  activationNativeFixtureFiles,
  serviceInboundNativeFixtureFiles,
  deliveryOracleNativeFixtureFiles,
  parserConformanceNativeFixtureFiles,
  promotionContractNativeFixtureFiles,
  checkpointContractNativeFixtureFiles,
  counterContractNativeFixtureFiles,
  storeContractNativeFixtureFiles,
  localProvenanceNativeFixtureFiles,
  localCustodyNativeFixtureFiles,
  admissionBoundsNativeFixtureFiles,
  reservationDurabilityFixtureFiles,
  reservationDurabilityBrowserFiles,
  outboundNativeFixtureFiles,
  decisionDirectedFixtureFiles,
  decisionHistoryFixtureFiles,
  failureFixtureFiles,
  livenessNodeFixtureFiles,
  livenessBrowserFixtureFiles,
  livenessWorkloadFixtureFiles,
  livenessGrowthFixtureFiles,
  residueNodeFixtureFiles,
  residuePackagedFixtureFiles,
  residueGeneratedFixtureFiles,
  residueLifecycleFixtureFiles,
  residueCalibrationFixtureFiles,
  failureBrowserFixtureFiles,
  admissionEvidenceFiles,
} from '../../scripts/release-validation/account-fixture-tests.mjs';
import { assertGeneralTestPopulation } from '../../scripts/release-validation/general-tests.mjs';
import { buildInventory } from '../../scripts/release-validation/inventory.mjs';
import { compileManifest, selectStages } from '../../scripts/release-validation/manifest.mjs';
import { vitestStage } from '../../scripts/release-validation/vitest-adapter.mjs';
import { vitestCensus } from '../../scripts/release-validation/vitest-census.mjs';
import { validateStage } from '../../scripts/release-validation/stage.mjs';

import { openFixtureBrowser } from '../account-promotion/browser-owner.mjs';

const inventory = () =>
  buildInventory(process.cwd(), JSON.parse(readFileSync('scripts/release-validation/policy.json')));

test('Account fixture selection admits exactly 666 Node cases and 12 delivery cases while remaining native and wrapper obligations stay blocked', () => {
  const stages = accountFixtureFiles.node.map((f) => accountFixtureNodeStage(process.cwd(), f));
  assert.deepEqual(
    stages.map((s) => s.expect.cases.length),
    [
      3, 2, 10, 4, 2, 1, 3, 12, 2, 5, 3, 11, 3, 1, 6, 6, 4, 14, 2, 5, 1, 5, 20, 1, 6, 8, 9, 1, 2, 3,
      8, 3, 2, 7, 2, 5, 7, 2, 1, 4, 8, 4, 5, 3, 9, 5, 1, 12, 3, 5, 12, 1, 3, 12, 7, 3, 8, 2, 1, 7,
      4, 1, 9, 5, 1, 2, 9, 5, 7, 1, 4, 12, 17, 12, 24, 19, 6, 15, 16, 15, 15, 14, 12, 4, 1, 2, 5, 1,
      6, 1, 3, 4, 5, 3, 4, 5, 6, 3, 15, 2, 2, 3, 9, 1, 3, 8, 1, 3, 1, 2, 4, 1, 1, 1, 1, 4, 10, 2, 3,
      1, 1, 2,
    ],
  );
  for (const s of stages) {
    validateStage(s);
    assert.deepEqual(s.env, {});
    assert.equal(s.processPolicy, 'inherited-group-v1');
    const browser =
      residuePackagedFixtureFiles.includes(s.argv.at(-1)) ||
      residueGeneratedFixtureFiles.includes(s.argv.at(-1)) ||
      residueLifecycleFixtureFiles.includes(s.argv.at(-1)) ||
      residueCalibrationFixtureFiles.includes(s.argv.at(-1)) ||
      admissionEvidenceFiles.includes(s.argv.at(-1)) ||
      receiveTransportFixtureFiles.includes(s.argv.at(-1)) ||
      receiveDriverBrowserFiles.includes(s.argv.at(-1)) ||
      syncBrowserFiles.includes(s.argv.at(-1)) ||
      receiveEditorFixtureFiles.includes(s.argv.at(-1)) ||
      spoolFixtureFiles.includes(s.argv.at(-1)) ||
      deliveryNativeFixtureFiles.includes(s.argv.at(-1)) ||
      decisionsNativeFixtureFiles.includes(s.argv.at(-1)) ||
      captureNativeFixtureFiles.includes(s.argv.at(-1)) ||
      editingNativeFixtureFiles.includes(s.argv.at(-1)) ||
      handoffNativeFixtureFiles.includes(s.argv.at(-1)) ||
      admissionNativeFixtureFiles.includes(s.argv.at(-1)) ||
      genesisNativeFixtureFiles.includes(s.argv.at(-1)) ||
      promotionNativeFixtureFiles.includes(s.argv.at(-1)) ||
      authorityNativeFixtureFiles.includes(s.argv.at(-1)) ||
      recoveryNativeFixtureFiles.includes(s.argv.at(-1)) ||
      coreNativeFixtureFiles.includes(s.argv.at(-1)) ||
      activationNativeFixtureFiles.includes(s.argv.at(-1)) ||
      serviceInboundNativeFixtureFiles.includes(s.argv.at(-1)) ||
      deliveryOracleNativeFixtureFiles.includes(s.argv.at(-1)) ||
      parserConformanceNativeFixtureFiles.includes(s.argv.at(-1)) ||
      promotionContractNativeFixtureFiles.includes(s.argv.at(-1)) ||
      checkpointContractNativeFixtureFiles.includes(s.argv.at(-1)) ||
      counterContractNativeFixtureFiles.includes(s.argv.at(-1)) ||
      storeContractNativeFixtureFiles.includes(s.argv.at(-1)) ||
      localProvenanceNativeFixtureFiles.includes(s.argv.at(-1)) ||
      localCustodyNativeFixtureFiles.includes(s.argv.at(-1)) ||
      admissionBoundsNativeFixtureFiles.includes(s.argv.at(-1)) ||
      reservationDurabilityBrowserFiles.includes(s.argv.at(-1)) ||
      outboundNativeFixtureFiles.includes(s.argv.at(-1)) ||
      decisionDirectedFixtureFiles.includes(s.argv.at(-1)) ||
      decisionHistoryFixtureFiles.includes(s.argv.at(-1)) ||
      failureBrowserFixtureFiles.includes(s.argv.at(-1)) ||
      livenessBrowserFixtureFiles.includes(s.argv.at(-1)) ||
      livenessWorkloadFixtureFiles.includes(s.argv.at(-1)) ||
      livenessGrowthFixtureFiles.includes(s.argv.at(-1));
    assert.equal(
      s.deadlineMs,
      {
        'test/account-receive-transport/controls.test.mjs': 90000,
        'test/account-receive-transport/generated.test.mjs': 330000,
        'test/account-receive-transport/native.test.mjs': 120000,
        'test/account-decisions/native.test.mjs': 120000,
        'test/account-capture/native.test.mjs': 180000,
        'test/account-editing/native.test.mjs': 300000,
        'test/account-handoff/native.test.mjs': 180000,
        'test/account-admission/native.test.mjs': 180000,
        'test/account-genesis/native.test.mjs': 180000,
        'test/account-promotion/native.test.mjs': 120000,
        'test/account-authority/native.test.mjs': 120000,
        'test/account-recovery/native.test.mjs': 120000,
        'test/account-core/native.test.mjs': 120000,
        'test/account-activation/native.test.mjs': 180000,
        'test/account-service-inbound/native.test.mjs': 90000,
        'test/account-delivery-oracle/native.test.mjs': 120000,
        'test/account-parser-conformance/native.test.mjs': 120000,
        'test/account-promotion-contract/native.test.mjs': 180000,
        'test/account-checkpoint-contract/native.test.mjs': 300000,
        'test/account-counter-contract/native.test.mjs': 300000,
        'test/account-store-contract/native.test.mjs': 300000,
        'test/account-local-provenance/native.test.mjs': 300000,
        'test/account-local-custody/native.test.mjs': 300000,
        'test/account-admission-bounds/native.test.mjs': 180000,
        'test/account-outbound/native.test.mjs': 60000,
        'test/account-decision-composition/controls.test.mjs': 300000,
        'test/account-decision-composition/native.test.mjs': 300000,
        'test/account-decision-composition/restart.test.mjs': 300000,
        'test/account-failures/http.test.mjs': 120000,
        'test/account-failures/native.test.mjs': 120000,
        'test/account-failures/service.test.mjs': 120000,
        'test/account-liveness/instrument.test.mjs': 60000,
        'test/account-liveness/service-cache.test.mjs': 60000,
        'test/account-liveness/controlled.test.mjs': 200000,
        'test/account-liveness/view.test.mjs': 180000,
        'test/account-liveness/native.test.mjs': 930000,
        'test/account-residue/extended.test.mjs': 60000,
        'test/account-residue/packaged.test.mjs': 240000,
        'test/account-residue/generated.test.mjs': 330000,
        'test/account-residue/lifecycle.test.mjs': 240000,
        'test/account-residue/service-files.test.mjs': 240000,
        'test/account-residue/calibration.test.mjs': 150000,
        'test/account-residue/matcher.test.mjs': 60000,
        'test/account-liveness/workload.test.mjs': 750000,
        'test/account-decision-composition/order.test.mjs': 300000,
        'test/account-decision-composition/generated.test.mjs': 300000,
        'test/account-reservation-durability/model.test.mjs': 300000,
        'test/account-reservation-durability/native.test.mjs': 300000,
        'test/account-reservation-durability/network.test.mjs': 300000,
        'test/account-delivery/native.test.mjs': 480000,
        'test/account-spool/native.test.mjs': 240000,
        'test/account-receive/native.test.mjs': 300000,
        'test/account-receive-editor/native.test.mjs': 480000,
        'test/account-sync/batch.test.mjs': 300000,
        'test/account-sync/controls.test.mjs': 90000,
        'test/account-sync/generated.test.mjs': 450000,
        'test/account-sync/native-controls.test.mjs': 150000,
        'test/account-sync/native.test.mjs': 600000,
        'test/account-receive-driver/controls.test.mjs': 90000,
        'test/account-receive-driver/generated.test.mjs': 270000,
        'test/account-receive-driver/native-controls.test.mjs': 90000,
        'test/account-receive-driver/native.test.mjs': 180000,
      }[s.argv.at(-1)] ?? (browser ? 360000 : 180000),
    );
    assert.deepEqual(
      s.fixture,
      browser
        ? {
            kind: residuePackagedFixtureFiles.includes(s.argv.at(-1))
              ? 'chromium-inherited-profiles'
              : 'chromium-cdp',
            startupMs: 15000,
          }
        : undefined,
    );
    assert.equal(
      s.variant,
      residuePackagedFixtureFiles.includes(s.argv.at(-1))
        ? 'node-inherited-chromium-v1'
        : browser
          ? 'node-account-browser-file-v1'
          : 'node-account-fixture-file-v1',
    );
  }
  const m = compileManifest(process.cwd(), inventory()),
    selected = selectStages(m, 'account-fixtures');
  assert.equal(selected.length, 123);
  assert.equal(
    selected.reduce((n, s) => n + s.expect.cases.length, 0),
    678,
  );
  const service = selectStages(m, 'service-fixtures');
  assert.deepEqual(service.map((s) => s.argv.at(-1)).sort(), [...serviceFixtureFiles].sort());
  assert.equal(service.length, 11);
  assert.equal(
    service.reduce((n, s) => n + s.expect.cases.length, 0),
    56,
  );
  const delivery = selectStages(m, 'delivery-fixtures');
  assert.deepEqual(delivery.map((s) => s.argv.at(-1)).sort(), [...deliveryFixtureFiles].sort());
  assert.equal(delivery.length, 8);
  assert.equal(
    delivery.reduce((n, s) => n + s.expect.cases.length, 0),
    52,
  );
  const historical = delivery.filter((s) => s.expect.historyInputs);
  assert.equal(historical.length, 2);
  for (const s of historical) {
    const [pin] = s.expect.historyInputs;
    assert(readFileSync(s.argv.at(-1), 'utf8').includes(pin.reference + ':' + pin.path));
  }
  const retired = 'test/account-service-delivery/native.test.mjs';
  assert.throws(() => accountFixtureNodeStage(process.cwd(), retired), /Unreviewed/);
  assert(m.exclusions.some((r) => r.id === 'test:' + retired));
  assert(!m.rows.some((r) => r.path === retired));
  const isolation = selectStages(m, 'isolation-fixtures');
  assert.deepEqual(isolation.map((s) => s.argv.at(-1)).sort(), [...isolationFixtureFiles].sort());
  assert.equal(isolation.length, 5);
  assert.equal(
    isolation.reduce((n, s) => n + s.expect.cases.length, 0),
    23,
  );
  const ledger = selectStages(m, 'ledger-fixtures');
  assert.deepEqual(ledger.map((s) => s.argv.at(-1)).sort(), [...ledgerFixtureFiles].sort());
  assert.equal(ledger.length, 3);
  assert.equal(
    ledger.reduce((n, s) => n + s.expect.cases.length, 0),
    14,
  );
  const contracts = selectStages(m, 'contract-fixtures');
  assert.deepEqual(contracts.map((s) => s.argv.at(-1)).sort(), [...contractFixtureFiles].sort());
  assert.equal(contracts.length, 5);
  assert.equal(
    contracts.reduce((n, s) => n + s.expect.cases.length, 0),
    19,
  );
  const preparation = selectStages(m, 'preparation-fixtures');
  assert.deepEqual(
    preparation.map((s) => s.argv.at(-1)).sort(),
    [...preparationFixtureFiles].sort(),
  );
  assert.equal(preparation.length, 8);
  assert.equal(
    preparation.reduce((n, s) => n + s.expect.cases.length, 0),
    43,
  );
  const bounds = preparation.find(
    (s) => s.argv.at(-1) === 'test/account-admission-bounds/protocol.test.mjs',
  );
  assert.deepEqual(
    bounds.expect.historyInputs.map((p) => p.path),
    ['account-protocol/admission.ts', 'account-service/authority.ts'],
  );
  for (const pin of bounds.expect.historyInputs) {
    assert.equal(pin.reference, '6398e33');
    assert(readFileSync(bounds.argv.at(-1), 'utf8').includes(pin.reference + ':' + pin.path));
  }
  assert.deepEqual(
    preparation
      .filter((s) => s.fixture)
      .map((s) => s.argv.at(-1))
      .sort(),
    [...admissionEvidenceFiles].sort(),
  );
  const parser = selectStages(m, 'oracle-parser-fixtures');
  assert.deepEqual(parser.map((s) => s.argv.at(-1)).sort(), [...oracleParserFixtureFiles].sort());
  assert.equal(parser.length, 7);
  assert.equal(
    parser.reduce((n, s) => n + s.expect.cases.length, 0),
    46,
  );
  assert(parser.every((s) => !s.fixture));
  const oracle = parser.find((s) => s.argv.at(-1).endsWith('delivery-oracle/controls.test.mjs'));
  assert.deepEqual(
    oracle.expect.historyInputs.map((p) => [p.reference, p.path]),
    [['77b0bb6239f7b7a48c4a52c74d3e3f39e39994a3', 'test/accountDelivery.test.ts']],
  );
  assert(
    readFileSync(oracle.argv.at(-1), 'utf8').includes(oracle.expect.historyInputs[0].reference),
  );
  assert.deepEqual(
    oracle.expect.dataInputs.map((p) => p.path),
    ['test/account-delivery-oracle/helpers.mjs'],
  );
  for (const change of [
    (s) => {
      s.variant = 'other';
    },
    (s) => {
      s.argv[s.argv.length - 1] = 'test/other.test.mjs';
    },
    (s) => {
      s.expect.dataInputs = [];
    },
    (s) => {
      s.expect.dataInputs.push(s.expect.dataInputs[0]);
    },
    (s) => {
      s.expect.dataInputs[0].path = 'test/account-parser-conformance/helpers.mjs';
    },
    (s) => {
      s.expect.dataInputs[0].path = 'test/vectors/envelope.json';
    },
    (s) => {
      s.expect.dataInputs[0].sha256 = 'bad';
    },
    (s) => {
      s.expect.dataInputs[0].extra = true;
    },
  ]) {
    const changed = structuredClone(oracle);
    change(changed);
    assert.throws(() => validateStage(changed));
  }
  const baseline = parser.find((s) => s.argv.at(-1).endsWith('/baseline.test.mjs'));
  assert.deepEqual(
    baseline.expect.historyInputs.map((p) => p.path),
    [
      'src/crdt/promotionRecord.ts',
      'src/crdt/spoolRecord.ts',
      'src/crdt/startupClassification.ts',
      'account-protocol/genesis.ts',
    ],
  );
  const helper = readFileSync('test/account-parser-conformance/helpers.mjs', 'utf8');
  for (const pin of baseline.expect.historyInputs) {
    assert.equal(pin.reference, 'f0b6acd2e624d89034c88706d4053a830ab50cc6');
    assert(helper.includes(pin.reference) && helper.includes(pin.path));
  }
  assert.equal(parser.filter((s) => s.expect.historyInputs).length, 2);
  assert.equal(parser.filter((s) => s.expect.dataInputs).length, 1);
  const transport = selectStages(m, 'transport-service-fixtures');
  assert.deepEqual(
    transport.map((s) => s.argv.at(-1)).sort(),
    [...transportServiceFixtureFiles].sort(),
  );
  assert.deepEqual(
    transport.map((s) => s.expect.cases.length),
    [2, 1, 7],
  );
  assert(transport.every((s) => !s.fixture && !s.expect.dataInputs));
  const transportHistory = transport.filter((s) => s.expect.historyInputs);
  assert.equal(transportHistory.length, 1);
  assert.equal(transportHistory[0].argv.at(-1), 'test/account-transport/service.test.mjs');
  const [transportPin] = transportHistory[0].expect.historyInputs;
  assert.equal(transportPin.reference, '4bb09042f37f68ec31f0d82587af608f599eb096');
  assert.equal(transportPin.path, 'account-service/delivery.ts');
  assert(
    readFileSync('test/account-transport/historical.mjs', 'utf8').includes(
      transportPin.reference + ':' + transportPin.path,
    ),
  );
  // Shared service readback remains required; retired v8 browser callers remain excluded.
  for (const file of [
    'test/account-transport/native.test.mjs',
    'test/account-transport/native-controls.test.mjs',
  ]) {
    assert.throws(() => accountFixtureNodeStage(process.cwd(), file), /Unreviewed/);
    assert(m.exclusions.some((r) => r.id === 'test:' + file));
    assert(!m.rows.some((r) => r.path === file));
  }
  assert(!m.rows.some((r) => r.id === 'campaign:scripts/account-transport/run.mjs'));
  assert(m.exclusions.some((r) => r.argv?.[1] === 'scripts/account-transport/run.mjs'));
  const receive = selectStages(m, 'receive-transport-fixtures');
  assert.deepEqual(
    receive.map((s) => s.argv.at(-1)).sort(),
    [...receiveTransportFixtureFiles].sort(),
  );
  assert.deepEqual(
    receive.map((s) => s.expect.cases.length),
    [4, 1, 9],
  );
  assert.deepEqual(
    receive.map((s) => s.deadlineMs),
    [90000, 330000, 120000],
  );
  assert(receive.every((s) => s.fixture && !s.expect.historyInputs && !s.expect.dataInputs));
  const driver = selectStages(m, 'receive-driver-fixtures');
  assert.deepEqual(driver.map((s) => s.argv.at(-1)).sort(), [...receiveDriverFixtureFiles].sort());
  assert.deepEqual(
    driver.map((s) => s.expect.cases.length),
    [5, 1, 2, 9],
  );
  assert.deepEqual(
    driver.map((s) => s.deadlineMs),
    [90000, 270000, 90000, 180000],
  );
  assert.deepEqual(
    driver
      .filter((s) => s.fixture)
      .map((s) => s.argv.at(-1))
      .sort(),
    [...receiveDriverBrowserFiles].sort(),
  );
  assert(driver.every((s) => !s.expect.historyInputs && !s.expect.dataInputs));
  const scheduler = driver.find((s) => s.argv.at(-1).endsWith('/controls.test.mjs'));
  assert.equal(scheduler.fixture, undefined);
  assert.equal(scheduler.variant, 'node-account-fixture-file-v1');
  const sync = selectStages(m, 'sync-fixtures');
  assert.deepEqual(sync.map((s) => s.argv.at(-1)).sort(), [...syncFixtureFiles].sort());
  assert.deepEqual(
    sync.map((s) => s.expect.cases.length),
    [7, 5, 1, 4, 12],
  );
  assert.deepEqual(
    sync.map((s) => s.deadlineMs),
    [300000, 90000, 450000, 150000, 600000],
  );
  assert.deepEqual(
    sync
      .filter((s) => s.fixture)
      .map((s) => s.argv.at(-1))
      .sort(),
    [...syncBrowserFiles].sort(),
  );
  assert(sync.every((s) => !s.expect.dataInputs));
  const syncHistory = sync.filter((s) => s.expect.historyInputs);
  assert.equal(syncHistory.length, 1);
  assert.equal(syncHistory[0].argv.at(-1), 'test/account-sync/native.test.mjs');
  assert.deepEqual(
    syncHistory[0].expect.historyInputs.map((p) => [p.reference, p.path]),
    [
      ['4bb09042f37f68ec31f0d82587af608f599eb096', 'src/crdt/accountEnvelopePreparation.ts'],
      ['4bb09042f37f68ec31f0d82587af608f599eb096', 'src/crdt/accountDelivery.ts'],
    ],
  );
  const syncHelper = readFileSync('test/account-sync/fixtures.mjs', 'utf8');
  for (const pin of syncHistory[0].expect.historyInputs)
    assert(syncHelper.includes(pin.reference) && syncHelper.includes(pin.path));
  const syncScheduler = sync.find((s) => s.argv.at(-1).endsWith('/controls.test.mjs'));
  assert.equal(syncScheduler.fixture, undefined);
  assert.equal(syncScheduler.variant, 'node-account-fixture-file-v1');
  const receiving = selectStages(m, 'receive-editor-fixtures');
  assert.deepEqual(
    receiving.map((s) => s.argv.at(-1)).sort(),
    [...receiveEditorFixtureFiles].sort(),
  );
  assert.deepEqual(
    receiving.map((s) => s.expect.cases.length),
    [12, 17],
  );
  assert.deepEqual(
    receiving.map((s) => s.deadlineMs),
    [480000, 300000],
  );
  assert(receiving.every((s) => s.fixture && !s.expect.dataInputs));
  const oldReader = receiving.filter((s) => s.expect.historyInputs);
  assert.equal(oldReader.length, 1);
  assert.equal(oldReader[0].argv.at(-1), 'test/account-receive/native.test.mjs');
  assert.deepEqual(
    oldReader[0].expect.historyInputs.map((p) => [p.reference, p.path]),
    [['8378596', 'src/crdt/promotionRecord.ts']],
  );
  const readerPin = oldReader[0].expect.historyInputs[0];
  assert(
    readFileSync('test/account-receive/fixtures.mjs', 'utf8').includes(
      readerPin.reference + ':' + readerPin.path,
    ),
  );
  const spool = selectStages(m, 'spool-fixture');
  assert.deepEqual(
    spool.map((s) => s.argv.at(-1)),
    spoolFixtureFiles,
  );
  assert.equal(spool[0].expect.cases.length, 24);
  assert.equal(spool[0].deadlineMs, 240000);
  assert.deepEqual(spool[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(spool[0].expect.dataInputs, undefined);
  assert.deepEqual(
    spool[0].expect.historyInputs.map((p) => [p.reference, p.path]),
    [['7210b7d', 'src/crdt/promotionRecord.ts']],
  );
  const spoolPin = spool[0].expect.historyInputs[0];
  assert(
    readFileSync('test/account-spool/fixtures.mjs', 'utf8').includes(
      spoolPin.reference + ':' + spoolPin.path,
    ),
  );
  const nativeDelivery = selectStages(m, 'delivery-native-fixture');
  assert.deepEqual(
    nativeDelivery.map((s) => s.argv.at(-1)),
    deliveryNativeFixtureFiles,
  );
  assert.equal(nativeDelivery[0].expect.cases.length, 19);
  assert.equal(nativeDelivery[0].deadlineMs, 480000);
  assert.deepEqual(nativeDelivery[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(nativeDelivery[0].expect.dataInputs, undefined);
  assert.deepEqual(
    nativeDelivery[0].expect.historyInputs.map((p) => [p.reference, p.path]),
    [['81a4655', 'src/crdt/promotionRecord.ts']],
  );
  const deliveryPin = nativeDelivery[0].expect.historyInputs[0];
  assert(
    readFileSync('test/account-delivery/fixtures.mjs', 'utf8').includes(
      deliveryPin.reference + ':' + deliveryPin.path,
    ),
  );
  const decisions = selectStages(m, 'decisions-native-fixture');
  assert.deepEqual(
    decisions.map((s) => s.argv.at(-1)),
    decisionsNativeFixtureFiles,
  );
  assert.equal(decisions[0].expect.cases.length, 6);
  assert.equal(decisions[0].deadlineMs, 120000);
  assert.deepEqual(decisions[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(decisions[0].expect.dataInputs, undefined);
  assert.equal(decisions[0].expect.historyInputs, undefined);
  const capture = selectStages(m, 'capture-native-fixture');
  assert.deepEqual(
    capture.map((s) => s.argv.at(-1)),
    captureNativeFixtureFiles,
  );
  assert.equal(capture[0].expect.cases.length, 15);
  assert.equal(capture[0].deadlineMs, 180000);
  assert.deepEqual(capture[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(capture[0].expect.dataInputs, undefined);
  assert.deepEqual(
    capture[0].expect.historyInputs.map((p) => [p.reference, p.path]),
    [['18ceb40', 'src/crdt/promotionRecord.ts']],
  );
  const capturePin = capture[0].expect.historyInputs[0];
  assert(
    readFileSync('test/account-capture/fixtures.mjs', 'utf8').includes(
      capturePin.reference + ':' + capturePin.path,
    ),
  );
  const editing = selectStages(m, 'editing-native-fixture');
  assert.deepEqual(
    editing.map((s) => s.argv.at(-1)),
    editingNativeFixtureFiles,
  );
  assert.equal(editing[0].expect.cases.length, 16);
  assert.equal(editing[0].deadlineMs, 300000);
  assert.deepEqual(editing[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(editing[0].expect.dataInputs, undefined);
  assert.deepEqual(
    editing[0].expect.historyInputs.map((p) => [p.reference, p.path]),
    [['649925f', 'src/crdt/promotionRecord.ts']],
  );
  const editingPin = editing[0].expect.historyInputs[0];
  assert(
    readFileSync('test/account-editing/fixtures.mjs', 'utf8').includes(
      editingPin.reference + ':' + editingPin.path,
    ),
  );
  const handoff = selectStages(m, 'handoff-native-fixture');
  assert.deepEqual(
    handoff.map((s) => s.argv.at(-1)),
    handoffNativeFixtureFiles,
  );
  assert.equal(handoff[0].expect.cases.length, 15);
  assert.equal(handoff[0].deadlineMs, 180000);
  assert.deepEqual(handoff[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(handoff[0].expect.dataInputs, undefined);
  assert.deepEqual(
    handoff[0].expect.historyInputs.map((p) => [p.reference, p.path]),
    [['beed8cf', 'src/crdt/promotionRecord.ts']],
  );
  const handoffPin = handoff[0].expect.historyInputs[0];
  assert(
    readFileSync('test/account-handoff/fixtures.mjs', 'utf8').includes(
      handoffPin.reference + ':' + handoffPin.path,
    ),
  );
  const admission = selectStages(m, 'admission-native-fixture');
  assert.deepEqual(
    admission.map((s) => s.argv.at(-1)),
    admissionNativeFixtureFiles,
  );
  assert.equal(admission[0].expect.cases.length, 15);
  assert.equal(admission[0].deadlineMs, 180000);
  assert.deepEqual(admission[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(admission[0].expect.dataInputs, undefined);
  assert.deepEqual(
    admission[0].expect.historyInputs.map((p) => [p.reference, p.path]),
    [['280f616', 'src/crdt/promotionRecord.ts']],
  );
  const admissionPin = admission[0].expect.historyInputs[0];
  assert(
    readFileSync('test/account-admission/fixtures.mjs', 'utf8').includes(
      admissionPin.reference + ':' + admissionPin.path,
    ),
  );
  const genesis = selectStages(m, 'genesis-native-fixture');
  assert.deepEqual(
    genesis.map((s) => s.argv.at(-1)),
    genesisNativeFixtureFiles,
  );
  assert.equal(genesis[0].expect.cases.length, 14);
  assert.equal(genesis[0].deadlineMs, 180000);
  assert.deepEqual(genesis[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(genesis[0].expect.dataInputs, undefined);
  assert.deepEqual(
    genesis[0].expect.historyInputs.map((p) => [p.reference, p.path]),
    [['a4e1c15', 'src/crdt/promotionRecord.ts']],
  );
  const genesisPin = genesis[0].expect.historyInputs[0];
  assert(
    readFileSync('test/account-genesis/fixtures.mjs', 'utf8').includes(
      genesisPin.reference + ':' + genesisPin.path,
    ),
  );
  const promotion = selectStages(m, 'promotion-native-fixture');
  assert.deepEqual(
    promotion.map((s) => s.argv.at(-1)),
    promotionNativeFixtureFiles,
  );
  assert.equal(promotion[0].expect.cases.length, 12);
  assert.equal(promotion[0].deadlineMs, 120000);
  assert.deepEqual(promotion[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(promotion[0].expect.dataInputs, undefined);
  assert.equal(promotion[0].expect.historyInputs, undefined);
  const authority = selectStages(m, 'authority-native-fixture');
  assert.deepEqual(
    authority.map((s) => s.argv.at(-1)),
    authorityNativeFixtureFiles,
  );
  assert.equal(authority[0].expect.cases.length, 4);
  assert.equal(authority[0].deadlineMs, 120000);
  assert.deepEqual(authority[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(authority[0].expect.dataInputs, undefined);
  assert.equal(authority[0].expect.historyInputs, undefined);
  const recovery = selectStages(m, 'recovery-native-fixture');
  assert.deepEqual(
    recovery.map((s) => s.argv.at(-1)),
    recoveryNativeFixtureFiles,
  );
  assert.equal(recovery[0].expect.cases.length, 1);
  assert.equal(recovery[0].deadlineMs, 120000);
  assert.deepEqual(recovery[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(recovery[0].expect.dataInputs, undefined);
  assert.equal(recovery[0].expect.historyInputs, undefined);
  const core = selectStages(m, 'core-native-fixture');
  assert.deepEqual(
    core.map((s) => s.argv.at(-1)),
    coreNativeFixtureFiles,
  );
  assert.equal(core[0].expect.cases.length, 2);
  assert.equal(core[0].deadlineMs, 120000);
  assert.deepEqual(core[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(core[0].expect.dataInputs, undefined);
  assert.equal(core[0].expect.historyInputs, undefined);
  const activation = selectStages(m, 'activation-native-fixture');
  assert.deepEqual(
    activation.map((s) => s.argv.at(-1)),
    activationNativeFixtureFiles,
  );
  assert.equal(activation[0].expect.cases.length, 5);
  assert.equal(activation[0].deadlineMs, 180000);
  assert.deepEqual(activation[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(activation[0].expect.dataInputs, undefined);
  assert.equal(activation[0].expect.historyInputs, undefined);
  const serviceInbound = selectStages(m, 'service-inbound-native-fixture');
  assert.deepEqual(
    serviceInbound.map((s) => s.argv.at(-1)),
    serviceInboundNativeFixtureFiles,
  );
  assert.equal(serviceInbound[0].expect.cases.length, 1);
  assert.equal(serviceInbound[0].deadlineMs, 90000);
  assert.deepEqual(serviceInbound[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(serviceInbound[0].expect.dataInputs, undefined);
  assert.equal(serviceInbound[0].expect.historyInputs, undefined);
  const deliveryOracle = selectStages(m, 'delivery-oracle-native-fixture');
  assert.deepEqual(
    deliveryOracle.map((s) => s.argv.at(-1)),
    deliveryOracleNativeFixtureFiles,
  );
  assert.deepEqual(
    deliveryOracle[0].expect.cases.map((c) => c.id),
    [
      'refusals retain exact first evidence and proof bytes through compaction/restart; reversed=false',
      'refusals retain exact first evidence and proof bytes through compaction/restart; reversed=true',
      'finals retain exact first evidence and proof bytes through compaction/restart; reversed=false',
      'finals retain exact first evidence and proof bytes through compaction/restart; reversed=true',
      'native refusalId control preserves old status but fails full retained-state assertions',
      'native finalCutoff control preserves old status but fails full retained-state assertions',
    ].map((name) => 'test/account-delivery-oracle/native.test.mjs::' + name),
  );
  assert.equal(deliveryOracle[0].deadlineMs, 120000);
  assert.deepEqual(deliveryOracle[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(deliveryOracle[0].expect.dataInputs, undefined);
  assert.equal(deliveryOracle[0].expect.historyInputs, undefined);
  const parserConformance = selectStages(m, 'parser-conformance-native-fixture');
  assert.deepEqual(
    parserConformance.map((s) => s.argv.at(-1)),
    parserConformanceNativeFixtureFiles,
  );
  assert.equal(parserConformance[0].expect.cases.length, 1);
  assert.equal(parserConformance[0].deadlineMs, 120000);
  assert.deepEqual(parserConformance[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(parserConformance[0].expect.dataInputs, undefined);
  assert.equal(parserConformance[0].expect.historyInputs, undefined);
  const promotionContract = selectStages(m, 'promotion-contract-native-fixture');
  assert.deepEqual(
    promotionContract.map((s) => s.argv.at(-1)),
    promotionContractNativeFixtureFiles,
  );
  assert.equal(promotionContract[0].expect.cases.length, 3);
  assert.equal(promotionContract[0].deadlineMs, 180000);
  assert.deepEqual(promotionContract[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(promotionContract[0].expect.dataInputs, undefined);
  assert.equal(promotionContract[0].expect.historyInputs, undefined);
  const checkpointContract = selectStages(m, 'checkpoint-contract-native-fixture');
  assert.deepEqual(
    checkpointContract.map((s) => s.argv.at(-1)),
    checkpointContractNativeFixtureFiles,
  );
  assert.equal(checkpointContract[0].expect.cases.length, 4);
  assert.equal(checkpointContract[0].deadlineMs, 300000);
  assert.deepEqual(checkpointContract[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(checkpointContract[0].expect.dataInputs, undefined);
  assert.equal(checkpointContract[0].expect.historyInputs, undefined);
  const counterContract = selectStages(m, 'counter-contract-native-fixture');
  assert.deepEqual(
    counterContract.map((s) => s.argv.at(-1)),
    counterContractNativeFixtureFiles,
  );
  assert.equal(counterContract[0].expect.cases.length, 5);
  assert.equal(counterContract[0].deadlineMs, 300000);
  assert.deepEqual(counterContract[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(counterContract[0].expect.dataInputs, undefined);
  assert.equal(counterContract[0].expect.historyInputs, undefined);
  const storeContract = selectStages(m, 'store-contract-native-fixture');
  assert.deepEqual(
    storeContract.map((s) => s.argv.at(-1)),
    storeContractNativeFixtureFiles,
  );
  assert.equal(storeContract[0].expect.cases.length, 3);
  assert.equal(storeContract[0].deadlineMs, 300000);
  assert.deepEqual(storeContract[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(storeContract[0].expect.dataInputs, undefined);
  assert.equal(storeContract[0].expect.historyInputs, undefined);
  const localProvenance = selectStages(m, 'local-provenance-native-fixture');
  assert.deepEqual(
    localProvenance.map((s) => s.argv.at(-1)),
    localProvenanceNativeFixtureFiles,
  );
  assert.equal(localProvenance[0].expect.cases.length, 4);
  assert.equal(localProvenance[0].deadlineMs, 300000);
  assert.deepEqual(localProvenance[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(localProvenance[0].expect.dataInputs, undefined);
  assert.equal(localProvenance[0].expect.historyInputs, undefined);
  const localCustody = selectStages(m, 'local-custody-native-fixture');
  assert.deepEqual(
    localCustody.map((s) => s.argv.at(-1)),
    localCustodyNativeFixtureFiles,
  );
  assert.equal(localCustody[0].expect.cases.length, 5);
  assert.equal(localCustody[0].deadlineMs, 300000);
  assert.deepEqual(localCustody[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(localCustody[0].expect.dataInputs, undefined);
  assert.equal(localCustody[0].expect.historyInputs, undefined);
  const nativeBounds = selectStages(m, 'admission-bounds-native-fixture');
  assert.deepEqual(
    nativeBounds.map((s) => s.argv.at(-1)),
    admissionBoundsNativeFixtureFiles,
  );
  assert.equal(nativeBounds[0].expect.cases.length, 6);
  assert.equal(nativeBounds[0].deadlineMs, 180000);
  assert.deepEqual(nativeBounds[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(nativeBounds[0].expect.dataInputs, undefined);
  assert.deepEqual(
    nativeBounds[0].expect.historyInputs.map((p) => [p.reference, p.path]),
    [
      ['6398e33', 'account-protocol/admission.ts'],
      ['6398e33', 'src/crdt/promotionAdmission.ts'],
    ],
  );
  for (const pin of nativeBounds[0].expect.historyInputs) {
    assert.equal(pin.revision, bounds.expect.historyInputs[0].revision);
    assert(readFileSync('test/account-admission-bounds/fixtures.mjs', 'utf8').includes(pin.path));
  }
  const durability = selectStages(m, 'reservation-durability-fixtures');
  assert.deepEqual(
    durability.map((s) => s.argv.at(-1)),
    reservationDurabilityFixtureFiles,
  );
  assert.deepEqual(
    durability.map((s) => s.expect.cases.length),
    [3, 15, 2],
  );
  for (const s of durability) {
    assert.equal(s.deadlineMs, 300000);
    assert.deepEqual(
      s.fixture,
      reservationDurabilityBrowserFiles.includes(s.argv.at(-1))
        ? { kind: 'chromium-cdp', startupMs: 15000 }
        : undefined,
    );
    assert.equal(s.expect.historyInputs, undefined);
    assert.equal(s.expect.dataInputs, undefined);
  }
  const outbound = selectStages(m, 'outbound-native-fixture');
  assert.deepEqual(
    outbound.map((s) => s.argv.at(-1)),
    outboundNativeFixtureFiles,
  );
  assert.equal(outbound[0].expect.cases.length, 2);
  assert.equal(outbound[0].deadlineMs, 60000);
  assert.deepEqual(outbound[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(outbound[0].expect.historyInputs, undefined);
  assert.equal(outbound[0].expect.dataInputs, undefined);
  const directed = selectStages(m, 'decision-directed-fixtures');
  assert.deepEqual(
    directed.map((s) => s.argv.at(-1)),
    decisionDirectedFixtureFiles,
  );
  assert.deepEqual(
    directed.map((s) => s.expect.cases.length),
    [3, 9],
  );
  for (const s of directed) {
    assert.equal(s.deadlineMs, 300000);
    assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
    assert.equal(s.expect.historyInputs, undefined);
    assert.equal(s.expect.dataInputs, undefined);
  }
  const histories = selectStages(m, 'decision-history-fixtures');
  assert.deepEqual(
    histories.map((s) => s.argv.at(-1)),
    decisionHistoryFixtureFiles,
  );
  assert.deepEqual(
    histories.map((s) => s.expect.cases.length),
    [1, 3, 8],
  );
  for (const s of histories) {
    assert.equal(s.deadlineMs, 300000);
    assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
    assert.equal(s.expect.historyInputs, undefined);
    assert.equal(s.expect.dataInputs, undefined);
  }
  const failures = selectStages(m, 'failure-fixtures');
  assert.deepEqual(
    failures.map((s) => s.argv.at(-1)),
    failureFixtureFiles,
  );
  assert.deepEqual(
    failures.map((s) => s.expect.cases.length),
    [1, 3, 1],
  );
  for (const s of failures) {
    assert.equal(s.deadlineMs, 120000);
    assert.deepEqual(
      s.fixture,
      failureBrowserFixtureFiles.includes(s.argv.at(-1))
        ? { kind: 'chromium-cdp', startupMs: 15000 }
        : undefined,
    );
    assert.equal(s.expect.historyInputs, undefined);
    assert.equal(s.expect.dataInputs, undefined);
  }
  const liveness = selectStages(m, 'liveness-node-fixtures');
  assert.deepEqual(
    liveness.map((s) => s.argv.at(-1)),
    livenessNodeFixtureFiles,
  );
  assert.deepEqual(
    liveness.map((s) => s.expect.cases.length),
    [2, 4],
  );
  for (const s of liveness) {
    assert.equal(s.deadlineMs, 60000);
    assert.equal(s.fixture, undefined);
    assert.equal(s.expect.historyInputs, undefined);
    assert.equal(s.expect.dataInputs, undefined);
  }
  const browserLiveness = selectStages(m, 'liveness-browser-fixtures');
  assert.deepEqual(
    browserLiveness.map((s) => s.argv.at(-1)),
    livenessBrowserFixtureFiles,
  );
  assert.deepEqual(
    browserLiveness.map((s) => s.expect.cases.length),
    [1, 1],
  );
  assert.deepEqual(
    browserLiveness.map((s) => s.deadlineMs),
    [200000, 180000],
  );
  for (const s of browserLiveness) {
    assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
    assert.equal(s.expect.historyInputs, undefined);
    assert.equal(s.expect.dataInputs, undefined);
  }
  const workload = selectStages(m, 'liveness-workload-fixture');
  assert.deepEqual(
    workload.map((s) => s.argv.at(-1)),
    livenessWorkloadFixtureFiles,
  );
  assert.equal(workload[0].expect.cases.length, 1);
  assert.equal(workload[0].deadlineMs, 750000);
  assert.deepEqual(workload[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(workload[0].expect.historyInputs, undefined);
  assert.equal(workload[0].expect.dataInputs, undefined);
  const growth = selectStages(m, 'liveness-growth-fixture');
  assert.deepEqual(
    growth.map((s) => s.argv.at(-1)),
    livenessGrowthFixtureFiles,
  );
  assert.equal(growth[0].expect.cases.length, 1);
  assert.equal(growth[0].deadlineMs, 930000);
  assert.deepEqual(growth[0].fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(growth[0].expect.historyInputs, undefined);
  assert.equal(growth[0].expect.dataInputs, undefined);
  const residue = selectStages(m, 'residue-node-fixtures');
  assert.deepEqual(
    residue.map((s) => s.argv.at(-1)),
    residueNodeFixtureFiles,
  );
  assert.deepEqual(
    residue.map((s) => s.expect.cases.length),
    [4, 10],
  );
  for (const s of residue) {
    assert.equal(s.deadlineMs, 60000);
    assert.equal(s.fixture, undefined);
    assert.equal(s.expect.historyInputs, undefined);
    assert.equal(s.expect.dataInputs, undefined);
  }
  const current = selectStages(m, 'residue-calibration-fixture');
  assert.deepEqual(
    current.map((s) => s.argv.at(-1)),
    residueCalibrationFixtureFiles,
  );
  assert.deepEqual(
    current.map((s) => s.expect.cases.length),
    [2],
  );
  for (const s of current) {
    assert.equal(s.deadlineMs, 150000);
    assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
    assert.equal(s.expect.historyInputs, undefined);
    assert.equal(s.expect.dataInputs, undefined);
  }
  const addedresidueLifecycleFixtureFiles = selectStages(m, 'residue-lifecycle-fixtures');
  assert.deepEqual(
    addedresidueLifecycleFixtureFiles.map((s) => s.argv.at(-1)),
    residueLifecycleFixtureFiles,
  );
  assert.deepEqual(
    addedresidueLifecycleFixtureFiles.map((s) => s.expect.cases.length),
    [3, 1],
  );
  for (const s of addedresidueLifecycleFixtureFiles) {
    assert.equal(s.deadlineMs, 240000);
    assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
    assert.equal(s.expect.historyInputs, undefined);
    assert.equal(s.expect.dataInputs, undefined);
  }
  const addedresidueGeneratedFixtureFiles = selectStages(m, 'residue-generated-fixture');
  assert.deepEqual(
    addedresidueGeneratedFixtureFiles.map((s) => s.argv.at(-1)),
    residueGeneratedFixtureFiles,
  );
  assert.deepEqual(
    addedresidueGeneratedFixtureFiles.map((s) => s.expect.cases.length),
    [1],
  );
  for (const s of addedresidueGeneratedFixtureFiles) {
    assert.equal(s.deadlineMs, 330000);
    assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
    assert.equal(s.expect.historyInputs, undefined);
    assert.equal(s.expect.dataInputs, undefined);
  }
  const addedresiduePackagedFixtureFiles = selectStages(m, 'residue-packaged-fixture');
  assert.deepEqual(
    addedresiduePackagedFixtureFiles.map((s) => s.argv.at(-1)),
    residuePackagedFixtureFiles,
  );
  assert.deepEqual(
    addedresiduePackagedFixtureFiles.map((s) => s.expect.cases.length),
    [2],
  );
  for (const s of addedresiduePackagedFixtureFiles) {
    assert.equal(s.deadlineMs, 240000);
    assert.deepEqual(s.fixture, { kind: 'chromium-inherited-profiles', startupMs: 15000 });
    assert.equal(s.expect.historyInputs, undefined);
    assert.equal(s.expect.dataInputs, undefined);
    for (const patch of [
      { fixture: undefined },
      { fixture: { kind: 'chromium-cdp', startupMs: 15000 } },
      { fixture: { kind: 'chromium-inherited-profiles', startupMs: 20000 } },
      { variant: 'node-account-browser-file-v1' },
    ])
      assert.throws(() => validateStage({ ...s, ...patch }));
  }
  const oldBatch = ledger.filter((s) => s.expect.historyInputs);
  assert.deepEqual(
    oldBatch.map((s) => s.argv.at(-1)),
    ['test/account-ledger-contract/batch.test.mjs'],
  );
  const [pin] = oldBatch[0].expect.historyInputs;
  assert.equal(pin.path, 'src/crdt/spoolRecord.ts');
  assert.equal(pin.revision, '284a97a27dc3344fcb7c55a8757a2a41c74fe0b9');
  assert(
    readFileSync('test/account-ledger-contract/runtime.mjs', 'utf8').includes(
      pin.reference + ':' + pin.path,
    ),
  );
  for (const f of ['test/release-validation/content-native.test.mjs']) {
    assert.throws(() => accountFixtureNodeStage(process.cwd(), f), /Unreviewed/);
    assert(m.selections['runner-self-tests'].includes('test:' + f));
    assert(!m.selections['account-fixtures'].includes('test:' + f));
  }
  for (const runner of [
    'account-activation',
    'account-service-delivery',
    'account-service-inbound',
    'account-isolation',
    'account-ledger-contract',
    'account-recovery-contract',
    'account-transport-contract',
    'account-service-custody',
    'account-admission-bounds',
    'account-admission-evidence',
    'account-first-authority',
    'account-outbound',
    'account-delivery-oracle',
    'account-parser-conformance',
    'account-receive-transport',
    'account-receive-driver',
    'account-receive',
    'account-receive-editor',
    'account-decisions',
    'account-capture',
    'account-editing',
    'account-delivery',
    'account-spool',
    'account-sync',
    'account-liveness',
    'account-residue',
    'private-release',
  ])
    assert(m.rows.find((r) => r.id === `campaign:scripts/${runner}/run.mjs`).blocked);
  for (const [runner, kind] of [
    ['account-core', 'account-core'],
    ['account-recovery', 'account-recovery'],
    ['account-authority', 'account-authority'],
    ['account-promotion', 'account-promotion'],
    ['account-genesis', 'account-genesis'],
    ['account-admission', 'account-admission'],
    ['account-handoff', 'account-handoff'],
    ['account-crypto-prep', 'exit'],
  ]) {
    const row = m.rows.find((r) => r.id === `campaign:scripts/${runner}/run.mjs`);
    assert.equal(row.blocked, undefined);
    assert.equal(row.stage.expect.kind, kind);
  }
  assert.throws(() => selectStages(m, 'release'), /Unresolved/);
});

test('delivery scenarios have six distinct identities without evaluating their history builders during planning', () => {
  const file = accountFixtureFiles.vitest[0],
    stage = vitestStage(process.cwd(), file),
    source = readFileSync(file, 'utf8');
  assert.equal(stage.expect.cases.length, 12);
  const titles = stage.expect.cases.map((c) => JSON.parse(c.id.split('::')[1])[0]);
  assert.equal(titles.filter((t) => t.startsWith('contradictory claims')).length, 6);
  const names = ['one', 'two'];
  const specimen = `import {it} from 'vitest';it.each([
    ['one',()=>{throw Error('planning invoked a builder')}],
    ['two',()=>unknownHelper()]
  ])('case %s',(_name,build)=>build());`;
  assert.deepEqual(
    vitestCensus('test/subject.test.ts', specimen).map((c) => JSON.parse(c.id.split('::')[1])[0]),
    names.map((n) => 'case ' + n),
  );
  assert.throws(
    () => vitestCensus('test/subject.test.ts', specimen.replace("['two',", "['one',")),
    /duplicate/,
  );
  // Keep the real generated history gate in the file's ordinary required census.
  assert(
    titles.includes(
      '500 generated histories compare full state at every forward, reverse and shuffled prefix',
    ),
  );
  assert.match(source, /seed: 1121060, numRuns: 500/);
});

test('160 generated policy changes cannot silently remove, retire or filter a reviewed Account fixture', () => {
  const all = inventory().tests;
  const tests = all.filter((t) =>
    [...accountFixtureFiles.node, ...accountFixtureFiles.vitest].includes(t.path),
  );
  assertGeneralTestPopulation(accountFixtureFiles, { tests });
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: tests.length - 1 }),
      fc.integer({ min: 0, max: 2 }),
      (index, mode) => {
        const changed = structuredClone(tests);
        if (mode === 0) changed.splice(index, 1);
        if (mode === 1) changed[index].status = 'excluded';
        if (mode === 2) changed[index].invocation.argv.push('--test-name-pattern=only-one');
        assert.throws(
          () => assertGeneralTestPopulation(accountFixtureFiles, { tests: changed }),
          /removed|excluded|changed runner/,
        );
      },
    ),
    { seed: 130922, numRuns: 160 },
  );
});

test('Account browser fixtures require the owned endpoint and never fall back after connection refusal', async () => {
  const calls = [];
  const chromium = {
    connectOverCDP: async (...args) => {
      calls.push(['connect', ...args]);
      throw Error('closed endpoint');
    },
    launch: async (options) => {
      calls.push(['launch', options]);
      return 'standalone';
    },
  };
  for (const endpoint of [
    undefined,
    '',
    'ws://example.invalid:1234/devtools/browser/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'ws://127.0.0.1:1234/devtools/browser/a',
  ]) {
    assert.throws(
      () =>
        openFixtureBrowser(chromium, {
          RELEASE_PROCESS_GUARD: 'owned',
          RELEASE_BROWSER_ENDPOINT: endpoint,
        }),
      /endpoint/,
    );
  }
  assert.deepEqual(calls, []);
  const endpoint = 'ws://127.0.0.1:1234/devtools/browser/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  await assert.rejects(
    openFixtureBrowser(chromium, {
      RELEASE_PROCESS_GUARD: 'owned',
      RELEASE_BROWSER_ENDPOINT: endpoint,
      CHROMIUM_PATH: '/must-not-launch',
    }),
    /closed endpoint/,
  );
  assert.deepEqual(calls, [['connect', endpoint, { timeout: 15000 }]]);
  assert.equal(await openFixtureBrowser(chromium, { CHROMIUM_PATH: '/standalone' }), 'standalone');
  assert.deepEqual(calls.at(-1), ['launch', { headless: true, executablePath: '/standalone' }]);
});
