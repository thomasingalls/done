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

test('Account fixture selection admits exactly 251 Node cases and 12 delivery cases while native and wrapper obligations stay blocked', () => {
  const stages = accountFixtureFiles.node.map((f) => accountFixtureNodeStage(process.cwd(), f));
  assert.deepEqual(
    stages.map((s) => s.expect.cases.length),
    [
      3, 2, 10, 4, 2, 1, 3, 12, 2, 5, 3, 11, 3, 1, 6, 6, 4, 14, 2, 5, 1, 5, 20, 1, 6, 8, 9, 1, 2, 3,
      8, 3, 2, 7, 2, 5, 7, 2, 1, 4, 8, 4, 5, 3, 9, 5, 1, 12, 3, 5,
    ],
  );
  for (const s of stages) {
    validateStage(s);
    assert.deepEqual(s.env, {});
    assert.equal(s.processPolicy, 'inherited-group-v1');
    const browser = admissionEvidenceFiles.includes(s.argv.at(-1));
    assert.equal(s.deadlineMs, browser ? 360000 : 180000);
    assert.deepEqual(s.fixture, browser ? { kind: 'chromium-cdp', startupMs: 15000 } : undefined);
    assert.equal(
      s.variant,
      browser ? 'node-account-browser-file-v1' : 'node-account-fixture-file-v1',
    );
  }
  const m = compileManifest(process.cwd(), inventory()),
    selected = selectStages(m, 'account-fixtures');
  assert.equal(selected.length, 51);
  assert.equal(
    selected.reduce((n, s) => n + s.expect.cases.length, 0),
    263,
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
