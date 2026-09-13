import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flattenPackages } from './inventory.mjs';
import { catalogueCensus, directNodeCensus } from './census.mjs';
import { digest } from './identity.mjs';
import { validateStage } from './stage.mjs';

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
  const supportedTests = new Set([
    'test/release-validation/inventory.test.mjs',
    'test/release-validation/manifest.test.mjs',
    'test/release-validation/identity.test.mjs',
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
    add({
      id: 'catalogue:' + catalogue.path,
      kind: 'catalogue',
      runner: catalogue.runner,
      ...census,
      blocked:
        'Exact catalogue cases and discriminating mutation assertions are resolved; native report and process ownership adapters remain.',
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
    if (vector) row.requires = ['vector:' + vector.path];
    else if (command.argv.join(' ') === 'node scripts/release-validation/check.mjs')
      row.stage = boundedStage(id, command.argv, { kind: 'exit', exitCodes: [0] });
    else if (command.argv.join(' ') === 'node scripts/check-authority-map.mjs')
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
      blocked:
        'Nested dynamic stages, selected controls and report postconditions need reviewed expansion; source mentions are not execution credit.',
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
  const byId = new Map(rows.map((r) => [r.id, r]));
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
      vectors: rows.filter((r) => r.kind === 'vector').map((r) => r.id),
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
