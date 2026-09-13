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

test('Account fixture selection admits exactly 321 Node cases and 12 delivery cases while native and wrapper obligations stay blocked', () => {
  const stages = accountFixtureFiles.node.map((f) => accountFixtureNodeStage(process.cwd(), f));
  assert.deepEqual(
    stages.map((s) => s.expect.cases.length),
    [
      3, 2, 10, 4, 2, 1, 3, 12, 2, 5, 3, 11, 3, 1, 6, 6, 4, 14, 2, 5, 1, 5, 20, 1, 6, 8, 9, 1, 2, 3,
      8, 3, 2, 7, 2, 5, 7, 2, 1, 4, 8, 4, 5, 3, 9, 5, 1, 12, 3, 5, 12, 1, 3, 12, 7, 3, 8, 2, 1, 7,
      4, 1, 9,
    ],
  );
  for (const s of stages) {
    validateStage(s);
    assert.deepEqual(s.env, {});
    assert.equal(s.processPolicy, 'inherited-group-v1');
    const browser =
      admissionEvidenceFiles.includes(s.argv.at(-1)) ||
      receiveTransportFixtureFiles.includes(s.argv.at(-1));
    assert.equal(
      s.deadlineMs,
      {
        'test/account-receive-transport/controls.test.mjs': 90000,
        'test/account-receive-transport/generated.test.mjs': 330000,
        'test/account-receive-transport/native.test.mjs': 120000,
      }[s.argv.at(-1)] ?? (browser ? 360000 : 180000),
    );
    assert.deepEqual(s.fixture, browser ? { kind: 'chromium-cdp', startupMs: 15000 } : undefined);
    assert.equal(
      s.variant,
      browser ? 'node-account-browser-file-v1' : 'node-account-fixture-file-v1',
    );
  }
  const m = compileManifest(process.cwd(), inventory()),
    selected = selectStages(m, 'account-fixtures');
  assert.equal(selected.length, 64);
  assert.equal(
    selected.reduce((n, s) => n + s.expect.cases.length, 0),
    333,
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
  for (const file of [
    'test/account-receive/native.test.mjs',
    'test/account-receive-editor/native.test.mjs',
    'test/account-receive-driver/native.test.mjs',
  ]) {
    assert.throws(() => accountFixtureNodeStage(process.cwd(), file), /Unreviewed/);
    assert(m.rows.find((r) => r.path === file).blocked);
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
  for (const f of [
    'test/account-core/native.test.mjs',
    'test/account-authority/native.test.mjs',
    'test/account-admission/native.test.mjs',
    'test/account-recovery/native.test.mjs',
    'test/account-promotion/native.test.mjs',
    'test/account-activation/native.test.mjs',
    'test/account-handoff/native.test.mjs',
    'test/account-service-inbound/native.test.mjs',
    'test/account-delivery-oracle/native.test.mjs',
    'test/account-parser-conformance/native.test.mjs',
  ]) {
    assert.throws(() => accountFixtureNodeStage(process.cwd(), f), /Unreviewed/);
    assert(m.rows.find((r) => r.path === f).blocked);
  }
  for (const runner of [
    'account-core',
    'account-authority',
    'account-admission',
    'account-recovery',
    'account-promotion',
    'account-activation',
    'account-handoff',
    'account-service-delivery',
    'account-service-inbound',
    'account-isolation',
    'account-ledger-contract',
    'account-recovery-contract',
    'account-transport-contract',
    'account-service-custody',
    'account-admission-bounds',
    'account-admission-evidence',
    'account-crypto-prep',
    'account-first-authority',
    'account-genesis',
    'account-outbound',
    'account-delivery-oracle',
    'account-parser-conformance',
    'account-receive-transport',
  ])
    assert(m.rows.find((r) => r.id === `campaign:scripts/${runner}/run.mjs`).blocked);
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
