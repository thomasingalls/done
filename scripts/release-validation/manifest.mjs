import { outboundCampaign, outboundCampaignStage } from './account-outbound-wrapper.mjs';
import { editingCampaign, editingCampaignStage } from './account-editing-wrapper.mjs';
import { handoffCampaign, handoffCampaignStage } from './account-handoff-wrapper.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flattenPackages } from './inventory.mjs';
import { catalogueCensus, directNodeCensus } from './census.mjs';
import { digest } from './identity.mjs';
import { validateStage } from './stage.mjs';
import { contentStage } from './content-adapter.mjs';
import { journalStage } from './journal-adapter.mjs';
import { admissionStage } from './admission-adapter.mjs';
import { editorAdmissionStage } from './editor-admission-adapter.mjs';
import { workspaceAdmissionStage } from './workspace-admission-adapter.mjs';
import { ownedStartupStage } from './owned-startup-adapter.mjs';
import { localGenesisStage } from './local-genesis-adapter.mjs';
import { writeSessionStage } from './write-session-adapter.mjs';
import { custodyStage } from './custody-adapter.mjs';
import { contentTrimStage } from './content-trim-adapter.mjs';
import { localClearStage } from './local-clear-adapter.mjs';
import { propertyFiles, vitestStage } from './vitest-adapter.mjs';
import { generatedFiles, generatedNodeStage } from './generated-tests.mjs';
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
  syncFixtureFiles,
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
} from './account-fixture-tests.mjs';
import {
  generalTestPolicy,
  assertGeneralTestPopulation,
  nodeProtocolStage,
} from './general-tests.mjs';

import {
  browserFiles,
  browserGroups,
  browserPolicy,
  playwrightStage,
} from './playwright-adapter.mjs';

import { otherNodeGroups, otherNodeFiles, otherNodeStage } from './other-node-tests.mjs';
import {
  exactCommand,
  preparationCampaign,
  preparationCampaignStage,
  preparationCommand,
  preparationReportStage,
} from './command-wrappers.mjs';
import { coreCampaign, coreCampaignStage } from './account-core-wrapper.mjs';
import { recoveryCampaign, recoveryCampaignStage } from './account-recovery-wrapper.mjs';
import { authorityCampaign, authorityCampaignStage } from './account-authority-wrapper.mjs';
import { promotionCampaign, promotionCampaignStage } from './account-promotion-wrapper.mjs';
import { genesisCampaign, genesisCampaignStage } from './account-genesis-wrapper.mjs';
import { admissionCampaign, admissionCampaignStage } from './account-admission-wrapper.mjs';

export const boundedStage = (id, argv, expect, extra = {}) => ({
  id,
  argv,
  env: {},
  variant: 'current',
  expect,
  deadlineMs: 60000,
  graceMs: 1000,
  maxLogBytes: 4 * 1024 * 1024,
  maxReportBytes: 1024 * 1024,
  processPolicy: 'inherited-group-v1',
  dependsOn: [],
  ...extra,
});

/** Reconcile against the inventory population, not the manifest's own selected row count. */
export function assertManifestCoverage(manifest, inventory) {
  const required = [
    ...inventory.tests.filter((t) => t.status === 'required').map((t) => 'test:' + t.path),
    ...inventory.catalogues
      .filter((c) => c.disposition === 'required')
      .map((c) => 'catalogue:' + c.path),
    ...inventory.vectors.map((v) => 'vector:' + v.path),
    ...inventory.constructions.map((c) => 'construction:' + c.id),
  ];
  const population = manifest.rows
    .filter((r) => ['test', 'catalogue', 'vector', 'construction'].includes(r.kind))
    .map((r) => r.id);
  assert.deepEqual(
    population.sort(),
    required.sort(),
    'Manifest lost an independently required obligation',
  );
  assert.equal(
    new Set(manifest.rows.map((r) => r.id)).size,
    manifest.rows.length,
    'Duplicate manifest row',
  );
  assert.deepEqual(
    [...manifest.selections.release].sort(),
    manifest.rows.map((r) => r.id).sort(),
    'Release selection omitted an obligation',
  );
  assert.deepEqual(
    [...manifest.unresolved].sort(),
    manifest.rows
      .filter((r) => r.blocked)
      .map((r) => r.id)
      .sort(),
    'Unresolved selection was hidden',
  );
  for (const row of manifest.rows)
    assert(
      row.stage || row.blocked || row.requires?.length > 0,
      'Obligation has no executable or blocked disposition: ' + row.id,
    );
}

/** Finite obligations, with explicit blockers where an execution adapter is still owed.
 * A manifest can be inspected while blocked. It cannot authorize a complete selection.
 * Wrapper variants remain whole obligations: naming the same file never discharges one.
 */
export function compileManifest(root, inventory) {
  const rows = [],
    exclusions = [];
  const add = (row) => {
    assert(!rows.some((r) => r.id === row.id), 'Duplicate manifest obligation');
    rows.push(row);
  };
  const read = (path) => readFileSync(join(root, path), 'utf8');
  // Synthetic manifest fixtures need not implement these families. A real repository
  // with required Vitest files must carry its reviewed policy; removing it cannot hide credit.
  const general = existsSync(join(root, 'scripts/release-validation/general-tests.json'))
    ? generalTestPolicy(root)
    : { vitest: [], node: [] };
  assert(
    general.vitest.length ||
      !inventory.tests.some((t) => t.invocation?.argv?.includes('node_modules/vitest/vitest.mjs')),
    'Missing reviewed general test policy',
  );
  assertGeneralTestPopulation(general, inventory);
  const generated = general.vitest.length ? generatedFiles : { vitest: [], node: [] };
  assertGeneralTestPopulation(generated, inventory);
  const account = general.vitest.length ? accountFixtureFiles : { vitest: [], node: [] };
  assertGeneralTestPopulation(account, inventory);
  const other = general.vitest.length ? otherNodeFiles : [];
  assertGeneralTestPopulation({ node: other, vitest: [] }, inventory);
  const browsers = general.vitest.length ? browserFiles : [];
  for (const file of browsers) {
    const t = inventory.tests.find((t) => t.path === file);
    assert(t?.status === 'required', 'Reviewed browser fixture removed or excluded: ' + file);
    assert.equal(
      t.invocation.config,
      browserPolicy(file).config,
      'Reviewed browser changed configuration',
    );
  }
  const reviewed = [
    ...browsers,
    ...other,
    ...propertyFiles,
    ...general.vitest,
    ...general.node,
    ...generated.vitest,
    ...generated.node,
    ...account.vitest,
    ...account.node,
  ];
  assert.equal(new Set(reviewed).size, reviewed.length, 'Duplicate reviewed file disposition');
  const supportedTests = new Set([
    'test/release-validation/playwright.test.mjs',
    'test/release-validation/inventory.test.mjs',
    'test/release-validation/manifest.test.mjs',
    'test/release-validation/identity.test.mjs',
    'test/release-validation/content.test.mjs',
    'test/release-validation/journal.test.mjs',
    'test/release-validation/admission.test.mjs',
    'test/release-validation/editor-admission.test.mjs',
    'test/release-validation/workspace-admission.test.mjs',
    'test/release-validation/owned-startup.test.mjs',
    'test/release-validation/local-genesis.test.mjs',
    'test/release-validation/write-session.test.mjs',
    'test/release-validation/custody.test.mjs',
    'test/release-validation/content-trim.test.mjs',
    'test/release-validation/local-clear.test.mjs',
    'test/release-validation/vitest.test.mjs',
    'test/release-validation/general-tests.test.mjs',
    'test/release-validation/generated-tests.test.mjs',
    'test/release-validation/account-fixtures.test.mjs',
  ]);
  for (const t of inventory.tests) {
    if (t.status !== 'required') {
      exclusions.push({ id: 'test:' + t.path, reason: t.reason });
      continue;
    }
    const id = 'test:' + t.path;
    if (supportedTests.has(t.path)) {
      const cases = directNodeCensus(t.path, read(t.path));
      add({
        id,
        kind: 'test',
        path: t.path,
        stage: boundedStage(
          id,
          [
            'node',
            '--test',
            '--test-concurrency=1',
            '--test-reporter=./scripts/release-validation/node-reporter.mjs',
            t.path,
          ],
          { kind: 'cases', cases },
        ),
      });
    } else if (
      propertyFiles.includes(t.path) ||
      general.vitest.includes(t.path) ||
      generated.vitest.includes(t.path) ||
      account.vitest.includes(t.path)
    ) {
      add({ id, kind: 'test', path: t.path, stage: vitestStage(root, t.path) });
    } else if (general.node.includes(t.path)) {
      add({ id, kind: 'test', path: t.path, stage: nodeProtocolStage(root, t.path) });
    } else if (generated.node.includes(t.path)) {
      add({ id, kind: 'test', path: t.path, stage: generatedNodeStage(root, t.path) });
    } else if (account.node.includes(t.path)) {
      add({ id, kind: 'test', path: t.path, stage: accountFixtureNodeStage(root, t.path) });
    } else if (browsers.includes(t.path)) {
      add({ id, kind: 'test', path: t.path, stage: playwrightStage(root, t.path) });
    } else if (other.includes(t.path)) {
      add({ id, kind: 'test', path: t.path, stage: otherNodeStage(root, t.path) });
    } else
      add({
        id,
        kind: 'test',
        path: t.path,
        invocation: t.invocation,
        blocked: 'Review the exact runtime case denominator and fixture/process ownership adapter.',
      });
  }
  for (const catalogue of inventory.catalogues) {
    if (catalogue.disposition !== 'required') {
      exclusions.push({
        id: 'catalogue:' + catalogue.path,
        reason: 'Historical tournament catalogue.',
      });
      continue;
    }
    const census = catalogueCensus(read(catalogue.path));
    const factory = new Map([
      ['scripts/content/run.mjs', contentStage],
      ['scripts/journal/run.mjs', journalStage],
      ['scripts/admission/run.mjs', admissionStage],
      ['scripts/editor-admission/run.mjs', editorAdmissionStage],
      ['scripts/workspace-admission/run.mjs', workspaceAdmissionStage],
      ['scripts/owned-startup/run.mjs', ownedStartupStage],
      ['scripts/local-genesis/run.mjs', localGenesisStage],
      ['scripts/write-session/run.mjs', writeSessionStage],
      ['scripts/custody/run.mjs', custodyStage],
      ['scripts/content-trim/run.mjs', contentTrimStage],
      ['scripts/local-clear/run.mjs', localClearStage],
    ]).get(catalogue.runner);
    add({
      id: 'catalogue:' + catalogue.path,
      kind: 'catalogue',
      runner: catalogue.runner,
      ...census,
      ...(factory
        ? { stage: factory(root, [], 'catalogue:' + catalogue.path) }
        : {
            blocked:
              'Exact catalogue cases and discriminating mutation assertions are resolved; native report and process ownership adapters remain.',
          }),
    });
  }
  for (const v of inventory.vectors) {
    const id = 'vector:' + v.path;
    add({
      id,
      kind: 'vector',
      path: v.path,
      stage: boundedStage(id, v.argv, { kind: 'exit', exitCodes: [0] }),
    });
  }
  const rootCommands = inventory.packageDispositions.required.flatMap((id) =>
    flattenPackages(inventory.packageGraph, id).map((c, index) => ({ ...c, root: id, index })),
  );
  rootCommands.push(...inventory.extraRoots.map((r) => ({ ...r, root: r.id, env: {}, index: 0 })));
  const omitted = new Set([
    'scripts/account-driver/run.mjs',
    'scripts/account-transport/run.mjs',
    ...inventory.campaigns.filter((c) => c.disposition === 'reviewed-exclusion').map((c) => c.path),
  ]);
  const previous = new Map();
  for (const command of rootCommands) {
    const id = 'command:' + command.root + ':' + command.index;
    if (omitted.has(command.argv[1])) {
      exclusions.push({
        id,
        argv: command.argv,
        reason:
          'Reviewed retired product or historical campaign; shared direct tests remain required.',
      });
      continue;
    }
    const vector = inventory.vectors.find(
      (v) => digest(v.argv) === digest(command.argv) && Object.keys(command.env).length === 0,
    );
    const prerequisite = previous.get(command.root);
    const row = {
      id,
      kind: 'command',
      root: command.root,
      argv: command.argv,
      env: command.env,
      orderedAfter: prerequisite ? [prerequisite] : [],
    };
    const preparation = preparationCommand(root, command, id);
    if (preparation) Object.assign(row, preparation);
    else if (exactCommand(command, ['node', coreCampaign]))
      row.requires = ['campaign:' + coreCampaign];
    else if (exactCommand(command, ['node', recoveryCampaign]))
      row.requires = ['campaign:' + recoveryCampaign];
    else if (exactCommand(command, ['node', authorityCampaign]))
      row.requires = ['campaign:' + authorityCampaign];
    else if (exactCommand(command, ['node', promotionCampaign]))
      row.requires = ['campaign:' + promotionCampaign];
    else if (exactCommand(command, ['node', genesisCampaign]))
      row.requires = ['campaign:' + genesisCampaign];
    else if (exactCommand(command, ['node', outboundCampaign]))
      row.requires = ['campaign:' + outboundCampaign];
    else if (exactCommand(command, ['node', editingCampaign]))
      row.requires = ['campaign:' + editingCampaign];
    else if (exactCommand(command, ['node', handoffCampaign]))
      row.requires = ['campaign:' + handoffCampaign];
    else if (exactCommand(command, ['node', admissionCampaign]))
      row.requires = ['campaign:' + admissionCampaign];
    else if (vector) row.requires = ['vector:' + vector.path];
    else if (exactCommand(command, ['node', 'scripts/content/run.mjs']))
      row.requires = ['catalogue:scripts/content/catalog.mjs'];
    else if (exactCommand(command, ['node', 'scripts/journal/run.mjs']))
      row.requires = ['catalogue:scripts/journal/catalog.mjs'];
    else if (exactCommand(command, ['node', 'scripts/admission/run.mjs']))
      row.requires = ['catalogue:scripts/admission/catalog.mjs'];
    else if (exactCommand(command, ['node', 'scripts/editor-admission/run.mjs']))
      row.requires = ['catalogue:scripts/editor-admission/catalog.mjs'];
    else if (exactCommand(command, ['node', 'scripts/workspace-admission/run.mjs']))
      row.requires = ['catalogue:scripts/workspace-admission/catalog.mjs'];
    else if (exactCommand(command, ['node', 'scripts/owned-startup/run.mjs']))
      row.requires = ['catalogue:scripts/owned-startup/catalog.mjs'];
    else if (exactCommand(command, ['node', 'scripts/local-genesis/run.mjs']))
      row.requires = ['catalogue:scripts/local-genesis/catalog.mjs'];
    else if (exactCommand(command, ['node', 'scripts/local-clear/run.mjs']))
      row.requires = ['catalogue:scripts/local-clear/catalog.mjs'];
    else if (exactCommand(command, ['node', 'scripts/content-trim/run.mjs']))
      row.requires = ['catalogue:scripts/content-trim/catalog.mjs'];
    else if (exactCommand(command, ['node', 'scripts/custody/run.mjs']))
      row.requires = ['catalogue:scripts/custody/catalog.mjs'];
    else if (exactCommand(command, ['node', 'scripts/write-session/run.mjs']))
      row.requires = ['catalogue:scripts/write-session/catalog.mjs'];
    else if (exactCommand(command, ['node', 'scripts/release-validation/check.mjs']))
      row.stage = boundedStage(id, command.argv, { kind: 'exit', exitCodes: [0] });
    else if (exactCommand(command, ['node', 'scripts/check-authority-map.mjs']))
      row.stage = boundedStage(id, command.argv, { kind: 'exit', exitCodes: [0] });
    else
      row.blocked =
        'Preserve this exact command/environment variant and its nested selections/postconditions; execution adapter not certified.';
    add(row);
    previous.set(command.root, id);
  }
  for (const c of inventory.campaigns.filter((c) => c.disposition !== 'reviewed-exclusion')) {
    if (omitted.has(c.path)) continue;
    add({
      id: 'campaign:' + c.path,
      kind: 'campaign',
      path: c.path,
      ...(c.parent ? { parent: 'campaign:' + c.parent } : {}),
      callSites: c.runCallSites,
      ...(c.path === preparationCampaign
        ? { stage: preparationCampaignStage() }
        : c.path === coreCampaign
          ? { stage: coreCampaignStage(root) }
          : c.path === recoveryCampaign
            ? { stage: recoveryCampaignStage(root) }
            : c.path === authorityCampaign
              ? { stage: authorityCampaignStage(root) }
              : c.path === promotionCampaign
                ? { stage: promotionCampaignStage(root) }
                : c.path === genesisCampaign
                  ? { stage: genesisCampaignStage(root) }
                  : c.path === admissionCampaign
                    ? { stage: admissionCampaignStage(root) }
                    : c.path === handoffCampaign
                      ? { stage: handoffCampaignStage(root) }
                      : c.path === editingCampaign
                        ? { stage: editingCampaignStage(root) }
                        : c.path === outboundCampaign
                          ? { stage: outboundCampaignStage(root) }
                          : [
                                'scripts/content/run.mjs',
                                'scripts/journal/run.mjs',
                                'scripts/admission/run.mjs',
                                'scripts/editor-admission/run.mjs',
                                'scripts/workspace-admission/run.mjs',
                                'scripts/owned-startup/run.mjs',
                                'scripts/local-genesis/run.mjs',
                                'scripts/write-session/run.mjs',
                                'scripts/custody/run.mjs',
                                'scripts/content-trim/run.mjs',
                                'scripts/local-clear/run.mjs',
                              ].includes(c.path)
                            ? {
                                requires: [
                                  'catalogue:' + c.path.replace('/run.mjs', '/catalog.mjs'),
                                ],
                              }
                            : {
                                blocked:
                                  'Nested dynamic stages, selected controls and report postconditions need reviewed expansion; source mentions are not execution credit.',
                              }),
    });
  }
  for (const c of inventory.constructions) {
    const requires = [
      ...c.tests.map((p) => 'test:' + p),
      ...(c.vectorCases.length ? ['vector:' + c.vectorFile] : []),
    ];
    if (!requires.length && c.status === 'excluded') {
      const registryCheck = rows.find(
        (r) => r.argv?.join(' ') === 'node scripts/check-authority-map.mjs',
      );
      assert(registryCheck, 'Excluded non-crypto disposition needs the live registry check');
      requires.push(registryCheck.id);
    }
    add({
      id: 'construction:' + c.id,
      kind: 'construction',
      requires,
      ...(c.status ? { registryDisposition: c.status } : {}),
      ...(!requires.length
        ? { blocked: 'No registered execution dependency; disposition needs review.' }
        : {}),
      requirements: c.requirements,
      vectorCases: c.vectorCases,
    });
  }
  const contentId = 'catalogue:scripts/content/catalog.mjs';
  if (rows.some((row) => row.id === 'test:test/account-crypto-prep/contracts.test.mjs'))
    add({
      id: 'variant:preparation-reports',
      kind: 'variant',
      stage: preparationReportStage(root),
    });
  if (rows.some((r) => r.id === contentId))
    add({
      id: 'variant:content-unreadable',
      kind: 'variant',
      stage: contentStage(root, ['--case', 'C09.unreadable-load'], 'variant:content-unreadable'),
    });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const propertyIds = propertyFiles.map((file) => 'test:' + file);
  if (propertyIds.some((id) => byId.has(id)))
    assert(
      propertyIds.every((id) => byId.has(id)),
      'Reviewed property selection lost a test file',
    );
  for (const row of rows) {
    for (const id of [...(row.requires ?? []), ...(row.orderedAfter ?? [])])
      assert(byId.has(id), 'Missing manifest dependency: ' + id);
    if (row.stage) validateStage(row.stage);
  }
  const infrastructure = rows
    .filter(
      (r) =>
        supportedTests.has(r.path) ||
        r.argv?.join(' ') === 'node scripts/release-validation/check.mjs' ||
        r.argv?.join(' ') === 'node scripts/check-authority-map.mjs',
    )
    .map((r) => r.id);
  const unresolved = rows.filter((r) => r.blocked).map((r) => r.id);
  const manifest = {
    schema: 1,
    inventoryDigest: digest(inventory),
    status: unresolved.length ? 'blocked' : 'ready',
    claim:
      'Execution obligations and certified bounded selections. No aggregate result. Blocked obligations cannot be credited.',
    rows,
    exclusions,
    unresolved,
    selections: {
      infrastructure,
      'wrapper-account-authority': rows
        .filter(
          (r) =>
            r.id === 'campaign:' + authorityCampaign ||
            (r.kind === 'command' && exactCommand(r, ['node', authorityCampaign])),
        )
        .map((r) => r.id),
      'wrapper-account-promotion': rows
        .filter(
          (r) =>
            r.id === 'campaign:' + promotionCampaign ||
            (r.kind === 'command' && exactCommand(r, ['node', promotionCampaign])),
        )
        .map((r) => r.id),
      'wrapper-account-genesis': rows
        .filter(
          (r) =>
            r.id === 'campaign:' + genesisCampaign ||
            (r.kind === 'command' && exactCommand(r, ['node', genesisCampaign])),
        )
        .map((r) => r.id),
      'wrapper-account-admission': rows
        .filter(
          (r) =>
            r.id === 'campaign:' + admissionCampaign ||
            (r.kind === 'command' && exactCommand(r, ['node', admissionCampaign])),
        )
        .map((r) => r.id),
      'wrapper-account-handoff': rows
        .filter(
          (r) =>
            r.id === 'campaign:' + handoffCampaign ||
            (r.kind === 'command' && exactCommand(r, ['node', handoffCampaign])),
        )
        .map((r) => r.id),
      'wrapper-account-editing': rows
        .filter(
          (r) =>
            r.id === 'campaign:' + editingCampaign ||
            (r.kind === 'command' && exactCommand(r, ['node', editingCampaign])),
        )
        .map((r) => r.id),
      'wrapper-account-outbound': rows
        .filter(
          (r) =>
            r.id === 'campaign:' + outboundCampaign ||
            (r.kind === 'command' && exactCommand(r, ['node', outboundCampaign])),
        )
        .map((r) => r.id),
      'wrapper-account-recovery': rows
        .filter(
          (r) =>
            r.id === 'campaign:' + recoveryCampaign ||
            (r.kind === 'command' && exactCommand(r, ['node', recoveryCampaign])),
        )
        .map((r) => r.id),
      'wrapper-account-core': rows
        .filter(
          (r) =>
            r.id === 'campaign:' + coreCampaign ||
            (r.kind === 'command' && exactCommand(r, ['node', coreCampaign])),
        )
        .map((r) => r.id),
      'wrapper-file-output': [
        'test:test/release-validation/file-outputs.test.mjs',
        'variant:preparation-reports',
      ].filter((id) => byId.has(id)),
      'wrapper-preparation': rows
        .filter(
          (r) =>
            r.kind === 'command' &&
            (exactCommand(r, ['node', preparationCampaign]) ||
              exactCommand(r, ['node', '--test', 'test/account-crypto-prep/*.test.mjs']) ||
              r.requires?.some((id) => id.startsWith('vector:'))),
        )
        .map((r) => r.id),
      ...Object.fromEntries(
        Object.entries(browserGroups).map(([name, files]) => [
          name,
          rows.filter((r) => browsers.includes(r.path) && files.includes(r.path)).map((r) => r.id),
        ]),
      ),
      'browser-local-qualification': [
        ...rows
          .filter((r) => r.path === 'test/release-validation/playwright-native.test.mjs')
          .map((r) => r.id),
        ...rows
          .filter((r) => browserGroups['browser-local-fixtures'].includes(r.path))
          .map((r) => r.id),
      ],
      'browser-storage-qualification': [
        ...rows
          .filter((r) => r.path === 'test/release-validation/playwright-native.test.mjs')
          .map((r) => r.id),
        ...rows
          .filter((r) => browserGroups['browser-storage-fixtures'].includes(r.path))
          .map((r) => r.id),
      ],
      'browser-geometry-interaction-qualification': [
        ...rows
          .filter((r) => r.path === 'test/release-validation/playwright-native.test.mjs')
          .map((r) => r.id),
        ...rows
          .filter((r) => browserGroups['browser-geometry-interaction'].includes(r.path))
          .map((r) => r.id),
      ],
      'browser-journal-latency-qualification': [
        ...rows
          .filter((r) => r.path === 'test/release-validation/playwright-native.test.mjs')
          .map((r) => r.id),
        ...rows
          .filter((r) => browserGroups['browser-journal-latency'].includes(r.path))
          .map((r) => r.id),
      ],
      'browser-upgrade-qualification': [
        ...rows
          .filter((r) => r.path === 'test/release-validation/playwright-native.test.mjs')
          .map((r) => r.id),
        ...rows
          .filter((r) => browserGroups['browser-upgrade-fixtures'].includes(r.path))
          .map((r) => r.id),
      ],
      'runner-self-regression': rows
        .filter((r) =>
          [
            ...otherNodeGroups['runner-self-tests'],
            ...otherNodeGroups['other-harness-fixtures'],
          ].includes(r.path),
        )
        .map((r) => r.id),
      'other-native-regression': rows
        .filter(
          (r) =>
            otherNodeGroups['other-native-fixtures'].includes(r.path) ||
            r.path === 'test/account-residue/packaged.test.mjs',
        )
        .map((r) => r.id),
      ...Object.fromEntries(
        Object.entries(otherNodeGroups).map(([name, files]) => [
          name,
          rows.filter((r) => other.includes(r.path) && files.includes(r.path)).map((r) => r.id),
        ]),
      ),
      'vitest-properties': rows.filter((r) => propertyFiles.includes(r.path)).map((r) => r.id),
      'vitest-reviewed': rows
        .filter(
          (r) =>
            propertyFiles.includes(r.path) ||
            general.vitest.includes(r.path) ||
            generated.vitest.includes(r.path) ||
            account.vitest.includes(r.path),
        )
        .map((r) => r.id),
      'node-protocol': rows.filter((r) => general.node.includes(r.path)).map((r) => r.id),
      'generated-tests': rows
        .filter((r) => generated.vitest.includes(r.path) || generated.node.includes(r.path))
        .map((r) => r.id),
      'account-fixtures': rows
        .filter((r) => account.vitest.includes(r.path) || account.node.includes(r.path))
        .map((r) => r.id),
      'service-fixtures': rows
        .filter((r) => account.node.includes(r.path) && serviceFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'delivery-fixtures': rows
        .filter((r) => account.node.includes(r.path) && deliveryFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'isolation-fixtures': rows
        .filter((r) => account.node.includes(r.path) && isolationFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'ledger-fixtures': rows
        .filter((r) => account.node.includes(r.path) && ledgerFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'contract-fixtures': rows
        .filter((r) => account.node.includes(r.path) && contractFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'preparation-fixtures': rows
        .filter((r) => account.node.includes(r.path) && preparationFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'oracle-parser-fixtures': rows
        .filter((r) => account.node.includes(r.path) && oracleParserFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'residue-calibration-fixture': rows
        .filter(
          (r) => account.node.includes(r.path) && residueCalibrationFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'residue-lifecycle-fixtures': rows
        .filter(
          (r) => account.node.includes(r.path) && residueLifecycleFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'residue-generated-fixture': rows
        .filter(
          (r) => account.node.includes(r.path) && residueGeneratedFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'residue-packaged-fixture': rows
        .filter(
          (r) => account.node.includes(r.path) && residuePackagedFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'residue-node-fixtures': rows
        .filter((r) => account.node.includes(r.path) && residueNodeFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'liveness-growth-fixture': rows
        .filter((r) => account.node.includes(r.path) && livenessGrowthFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'liveness-workload-fixture': rows
        .filter(
          (r) => account.node.includes(r.path) && livenessWorkloadFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'liveness-browser-fixtures': rows
        .filter(
          (r) => account.node.includes(r.path) && livenessBrowserFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'liveness-node-fixtures': rows
        .filter((r) => account.node.includes(r.path) && livenessNodeFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'failure-fixtures': rows
        .filter((r) => account.node.includes(r.path) && failureFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'decision-history-fixtures': rows
        .filter(
          (r) => account.node.includes(r.path) && decisionHistoryFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'decision-directed-fixtures': rows
        .filter(
          (r) => account.node.includes(r.path) && decisionDirectedFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'outbound-native-fixture': rows
        .filter((r) => account.node.includes(r.path) && outboundNativeFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'reservation-durability-fixtures': rows
        .filter(
          (r) =>
            account.node.includes(r.path) && reservationDurabilityFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'admission-bounds-native-fixture': rows
        .filter(
          (r) =>
            account.node.includes(r.path) && admissionBoundsNativeFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'local-custody-native-fixture': rows
        .filter(
          (r) => account.node.includes(r.path) && localCustodyNativeFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'local-provenance-native-fixture': rows
        .filter(
          (r) =>
            account.node.includes(r.path) && localProvenanceNativeFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'store-contract-native-fixture': rows
        .filter(
          (r) => account.node.includes(r.path) && storeContractNativeFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'counter-contract-native-fixture': rows
        .filter(
          (r) =>
            account.node.includes(r.path) && counterContractNativeFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'checkpoint-contract-native-fixture': rows
        .filter(
          (r) =>
            account.node.includes(r.path) && checkpointContractNativeFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'promotion-contract-native-fixture': rows
        .filter(
          (r) =>
            account.node.includes(r.path) && promotionContractNativeFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'parser-conformance-native-fixture': rows
        .filter(
          (r) =>
            account.node.includes(r.path) && parserConformanceNativeFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'delivery-oracle-native-fixture': rows
        .filter(
          (r) => account.node.includes(r.path) && deliveryOracleNativeFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'service-inbound-native-fixture': rows
        .filter(
          (r) => account.node.includes(r.path) && serviceInboundNativeFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'activation-native-fixture': rows
        .filter(
          (r) => account.node.includes(r.path) && activationNativeFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'core-native-fixture': rows
        .filter((r) => account.node.includes(r.path) && coreNativeFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'recovery-native-fixture': rows
        .filter((r) => account.node.includes(r.path) && recoveryNativeFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'authority-native-fixture': rows
        .filter(
          (r) => account.node.includes(r.path) && authorityNativeFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'promotion-native-fixture': rows
        .filter(
          (r) => account.node.includes(r.path) && promotionNativeFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'genesis-native-fixture': rows
        .filter((r) => account.node.includes(r.path) && genesisNativeFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'admission-native-fixture': rows
        .filter(
          (r) => account.node.includes(r.path) && admissionNativeFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'handoff-native-fixture': rows
        .filter((r) => account.node.includes(r.path) && handoffNativeFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'editing-native-fixture': rows
        .filter((r) => account.node.includes(r.path) && editingNativeFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'capture-native-fixture': rows
        .filter((r) => account.node.includes(r.path) && captureNativeFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'decisions-native-fixture': rows
        .filter(
          (r) => account.node.includes(r.path) && decisionsNativeFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'delivery-native-fixture': rows
        .filter((r) => account.node.includes(r.path) && deliveryNativeFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'spool-fixture': rows
        .filter((r) => account.node.includes(r.path) && spoolFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'receive-editor-fixtures': rows
        .filter((r) => account.node.includes(r.path) && receiveEditorFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'sync-fixtures': rows
        .filter((r) => account.node.includes(r.path) && syncFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'receive-driver-fixtures': rows
        .filter((r) => account.node.includes(r.path) && receiveDriverFixtureFiles.includes(r.path))
        .map((r) => r.id),
      'receive-transport-fixtures': rows
        .filter(
          (r) => account.node.includes(r.path) && receiveTransportFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'transport-service-fixtures': rows
        .filter(
          (r) => account.node.includes(r.path) && transportServiceFixtureFiles.includes(r.path),
        )
        .map((r) => r.id),
      'general-tests': rows
        .filter(
          (r) =>
            r.stage?.expect.kind === 'vitest' ||
            r.stage?.expect.kind === 'playwright' ||
            general.node.includes(r.path) ||
            generated.node.includes(r.path) ||
            account.node.includes(r.path) ||
            other.includes(r.path),
        )
        .map((r) => r.id),
      vectors: rows.filter((r) => r.kind === 'vector').map((r) => r.id),
      ...(byId.has(contentId)
        ? { content: [contentId], 'content-control': ['variant:content-unreadable'] }
        : {}),
      ...(byId.has('catalogue:scripts/journal/catalog.mjs')
        ? { journal: ['catalogue:scripts/journal/catalog.mjs'] }
        : {}),
      ...(byId.has('catalogue:scripts/admission/catalog.mjs')
        ? { admission: ['catalogue:scripts/admission/catalog.mjs'] }
        : {}),
      ...(byId.has('catalogue:scripts/editor-admission/catalog.mjs')
        ? { 'editor-admission': ['catalogue:scripts/editor-admission/catalog.mjs'] }
        : {}),
      ...(byId.has('catalogue:scripts/workspace-admission/catalog.mjs')
        ? { 'workspace-admission': ['catalogue:scripts/workspace-admission/catalog.mjs'] }
        : {}),
      ...(byId.has('catalogue:scripts/owned-startup/catalog.mjs')
        ? { 'owned-startup': ['catalogue:scripts/owned-startup/catalog.mjs'] }
        : {}),
      ...(byId.has('catalogue:scripts/local-genesis/catalog.mjs')
        ? { 'local-genesis': ['catalogue:scripts/local-genesis/catalog.mjs'] }
        : {}),
      ...(byId.has('catalogue:scripts/local-clear/catalog.mjs')
        ? { 'local-clear': ['catalogue:scripts/local-clear/catalog.mjs'] }
        : {}),
      ...(byId.has('catalogue:scripts/content-trim/catalog.mjs')
        ? { 'content-trim': ['catalogue:scripts/content-trim/catalog.mjs'] }
        : {}),
      ...(byId.has('catalogue:scripts/custody/catalog.mjs')
        ? { custody: ['catalogue:scripts/custody/catalog.mjs'] }
        : {}),
      ...(byId.has('catalogue:scripts/write-session/catalog.mjs')
        ? { 'write-session': ['catalogue:scripts/write-session/catalog.mjs'] }
        : {}),
      release: rows.map((r) => r.id),
    },
  };
  assertManifestCoverage(manifest, inventory);
  return manifest;
}

export function selectStages(manifest, name) {
  assert(Object.hasOwn(manifest.selections, name), 'Unknown selection');
  const byId = new Map(manifest.rows.map((r) => [r.id, r])),
    terminals = new Map(),
    visiting = new Set(),
    stages = [];
  const visit = (id) => {
    assert(!visiting.has(id), 'Execution dependency cycle');
    if (terminals.has(id)) return terminals.get(id);
    const row = byId.get(id);
    assert(row, 'Missing execution obligation: ' + id);
    assert(!row.blocked, 'Unresolved execution obligation: ' + id + ': ' + row.blocked);
    assert(row.stage || row.requires?.length, 'Missing executable disposition: ' + id);
    visiting.add(id);
    // Aggregate ordering is mandatory. Bounded infrastructure checks are explicitly scoped
    // independent checks, not a traceability/whole-package-chain receipt.
    const prerequisites = [
      ...new Set(
        [...(row.requires ?? []), ...(name === 'release' ? (row.orderedAfter ?? []) : [])].flatMap(
          visit,
        ),
      ),
    ];
    if (row.stage) {
      const stage = {
        ...row.stage,
        dependsOn: [...new Set([...row.stage.dependsOn, ...prerequisites])],
      };
      validateStage(stage);
      stages.push(stage);
      terminals.set(id, [stage.id]);
    } else {
      terminals.set(id, prerequisites);
    }
    visiting.delete(id);
    return terminals.get(id);
  };
  for (const id of manifest.selections[name]) visit(id);
  assert(stages.length, 'Empty execution selection');
  return stages;
}
