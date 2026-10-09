/** Planning graph only. No test module or campaign is imported or executed. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { parseSync } from '@babel/core';

export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const unique = (values) => [...new Set(values)].sort();
export function walk(root, path) {
  return readdirSync(join(root, path), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(root, path + '/' + e.name) : [path + '/' + e.name]))
    .sort();
}
export function packageGraph(scripts) {
  const nodes = new Map();
  function expand(name, trail = []) {
    assert(Object.hasOwn(scripts, name), 'Missing package script: ' + name);
    assert(!trail.includes(name), 'Package cycle: ' + [...trail, name].join(' -> '));
    if (nodes.has(name)) return nodes.get(name);
    const commands = scripts[name].split(/\s+&&\s+/).map((text) => {
      // Deliberately refuse shell syntax this finite inventory cannot interpret.
      assert(!/[;|<>`$()'"\n]/.test(text), 'Unsupported package shell syntax: ' + name);
      const words = text.trim().split(/\s+/),
        env = {};
      while (/^[A-Z_][A-Z_0-9]*=/.test(words[0] ?? '')) {
        const [key, ...value] = words.shift().split('=');
        env[key] = value.join('=');
      }
      assert(words.length > 0 && words[0], 'Empty command: ' + name);
      const target = words[0] === 'pnpm' && !words[1]?.startsWith('-') ? words[1] : null;
      if (target) expand(target, [...trail, name]);
      return { argv: words, env, ...(target ? { package: target } : {}) };
    });
    const value = { id: name, commands };
    nodes.set(name, value);
    return value;
  }
  for (const name of Object.keys(scripts).sort()) expand(name);
  return [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
}
export function flattenPackages(nodes, root) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const result = [];
  const visit = (name, via, env = {}) => {
    for (const c of byId.get(name).commands) {
      const inherited = { ...env, ...c.env };
      if (c.package) visit(c.package, [...via, c.package], inherited);
      else result.push({ argv: c.argv, env: inherited, via });
    }
  };
  visit(root, [root]);
  return result;
}
/** AST locations are candidates, not runtime case counts or proof an assertion executes. */
export function sourceFacts(path, text) {
  const source = parseSync(text, {
    configFile: false,
    babelrc: false,
    parserOpts: {
      sourceType: 'module',
      plugins: path.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript'],
    },
  });
  const facts = { tests: [], properties: [], processCalls: [], runCalls: [], strings: [] };
  const snippet = (node) => text.slice(node.start, node.end);
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'StringLiteral') facts.strings.push(node.value);
    if (node.type === 'CallExpression') {
      const name = snippet(node.callee);
      const line = node.loc.start.line;
      if (
        /^(?:test|it|describe)(?:\.(?:skip|only|todo|each|concurrent|sequential|for))*$/.test(name)
      )
        facts.tests.push({
          line,
          form: name,
          title: node.arguments[0] ? snippet(node.arguments[0]).slice(0, 180) : '',
        });
      if (/^fc\.(?:asyncProperty|property|modelRun|asyncModelRun|scheduledModelRun)$/.test(name))
        facts.properties.push({ line, form: name });
      if (/^(?:spawn|spawnSync|execFile|execFileSync|execSync|exec|fork)$/.test(name))
        facts.processCalls.push({
          line,
          form: name,
          arguments: node.arguments.map((a) => snippet(a).slice(0, 160)),
        });
      if (name === 'run' || name === 'testArgs' || name === 'validationControlStages')
        facts.runCalls.push({
          line,
          form: name,
          arguments: node.arguments.map((a) => snippet(a).slice(0, 160)),
        });
    }
    for (const [key, value] of Object.entries(node)) {
      if (
        [
          'loc',
          'comments',
          'tokens',
          'leadingComments',
          'trailingComments',
          'innerComments',
        ].includes(key)
      )
        continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(source);
  return facts;
}

const kinds = ['required', 'alias', 'optional-check', 'development', 'generator'];
export function validatePolicy(policy, scripts, files) {
  assert.equal(policy.schema, 1);
  assert.deepEqual(Object.keys(policy.packages).sort(), [...kinds].sort());
  const names = Object.values(policy.packages).flat();
  assert.equal(names.length, new Set(names).size, 'Duplicate package disposition');
  assert.deepEqual(
    [...names].sort(),
    Object.keys(scripts).sort(),
    'Every package script needs one disposition',
  );
  for (const [path, reason] of Object.entries({
    ...policy.campaignExceptions,
    ...policy.testExclusions,
  })) {
    assert(files.has(path), 'Stale exclusion: ' + path);
    assert(
      typeof reason === 'string' && reason.trim().length > 20,
      'Exclusion needs an explicit reason: ' + path,
    );
  }
  for (const [child, parent] of Object.entries(policy.campaignParents)) {
    assert(files.has(child) && files.has(parent), 'Stale campaign parent: ' + child);
    const seen = new Set([child]);
    let current = parent;
    while (current) {
      assert(!seen.has(current), 'Campaign parent cycle: ' + child);
      seen.add(current);
      current = policy.campaignParents[current];
    }
  }
  assert.equal(
    new Set(policy.extraRoots.map((r) => r.id)).size,
    policy.extraRoots.length,
    'Duplicate extra root',
  );
  for (const root of policy.extraRoots) {
    assert(root.argv[0] === 'node' && files.has(root.argv[1]), 'Invalid extra root: ' + root.id);
    assert(
      root.argv.every((x) => typeof x === 'string' && x.length),
      'Invalid arguments: ' + root.id,
    );
  }
}
export function buildInventory(root, policy) {
  const read = (path) => readFileSync(join(root, path), 'utf8');
  const scripts = JSON.parse(read('package.json')).scripts;
  const files = unique(['scripts', 'test', 'vite'].flatMap((p) => walk(root, p)));
  const fileSet = new Set(files);
  validatePolicy(policy, scripts, fileSet);
  const graph = packageGraph(scripts);
  const roots = policy.packages.required.map((id) => ({
    id,
    commands: flattenPackages(graph, id),
  }));
  const check = flattenPackages(graph, 'check');
  const leafKey = (c) => JSON.stringify([c.argv, c.env]);
  const checkSet = new Set(check.map(leafKey));
  const addedRoots = roots
    .filter((r) => r.id !== 'check')
    .map((r) => ({
      id: r.id,
      missingFromCheck: r.commands.filter((c) => !checkSet.has(leafKey(c))),
    }))
    .filter((r) => r.missingFromCheck.length);
  const allCommands = graph.flatMap((n) => flattenPackages(graph, n.id));
  const testPaths = files.filter((p) => /\.(?:test\.(?:ts|tsx|mjs)|node\.mjs|spec\.ts)$/.test(p));
  for (const path of files.filter((p) => /\.(?:test|spec|node)\./.test(p)))
    assert(testPaths.includes(path), 'Unrecognized test file kind: ' + path);
  const tests = testPaths.map((path) => {
    const facts = sourceFacts(path, read(path));
    const reason = policy.testExclusions[path];
    let invocation;
    if (/\.(?:test|node)\.mjs$/.test(path))
      invocation = { argv: ['node', '--test', '--test-concurrency=1', path] };
    else if (/\.spec\.ts$/.test(path)) {
      const config = policy.playwright[dirname(path)];
      assert(config, 'Unmapped Playwright family: ' + path);
      assert(existsSync(join(root, config[0])), 'Missing Playwright config: ' + config[0]);
      invocation = { config: config[0], packages: config.slice(1) };
      for (const p of invocation.packages)
        assert(Object.hasOwn(scripts, p), 'Missing browser invocation: ' + p);
    } else invocation = { argv: ['node', 'node_modules/vitest/vitest.mjs', 'run', path] };
    return {
      path,
      status: reason ? 'excluded-product' : 'required',
      ...(reason ? { reason } : {}),
      invocation,
      declarations: facts.tests.length,
      propertyFamilies: facts.properties,
      dynamicCaseCensus: 'Required at execution; static declarations are not a case denominator.',
    };
  });
  const campaigns = files
    .filter((p) => /^scripts\/[^/]+\/(?:run|campaign)\.mjs$/.test(p))
    .map((path) => {
      const facts = sourceFacts(path, read(path));
      const invocations = allCommands.filter((c) => c.argv[0] === 'node' && c.argv[1] === path);
      const extras = policy.extraRoots.filter((r) => r.argv[1] === path);
      const reason = policy.campaignExceptions[path];
      const parent = policy.campaignParents[path];
      if (parent) {
        assert(fileSet.has(parent) && parent !== path, 'Invalid campaign parent: ' + path);
        const ref = relative(dirname(parent), path);
        assert(
          sourceFacts(parent, read(parent)).strings.includes(
            ref.startsWith('.') ? ref : './' + ref,
          ),
          'Missing campaign reference: ' + path,
        );
      }
      assert(
        invocations.length || extras.length || reason || parent,
        'Unclassified campaign: ' + path,
      );
      return {
        path,
        ...(reason
          ? { disposition: 'reviewed-exclusion', reason }
          : { disposition: 'required-or-transitive' }),
        packageCommands: unique(invocations.map((c) => JSON.stringify([c.argv, c.env]))).map(
          JSON.parse,
        ),
        extraCommands: extras,
        ...(parent ? { parent } : {}),
        referencesVectorChain: facts.strings.includes('vectors:check'),
        runCallSites: facts.runCalls,
        processCallSites: facts.processCalls,
      };
    });
  const catalogues = files
    .filter((p) => /^scripts\/[^/]+\/catalog\.mjs$/.test(p))
    .map((path) => {
      const runner = dirname(path) + '/run.mjs';
      assert(
        campaigns.some((c) => c.path === runner),
        'Unmapped catalogue: ' + path,
      );
      const facts = sourceFacts(path, read(path));
      // Exact catalogue file is the family obligation, including dynamically generated cases/mutants.
      return {
        path,
        runner,
        disposition: policy.campaignExceptions[runner] ? 'historical' : 'required',
        staticIds: unique(facts.strings.filter((s) => /^[A-Z]\d{2}\.[a-z0-9-]+$/.test(s))),
        dynamicCaseCensus:
          'Expand cases and mutants from this exact catalogue at execution; ids here are static candidates only.',
      };
    });
  const allVectorPaths = files.filter((p) => /^test\/vectors\/.*\.json$/.test(p));
  assert.deepEqual(
    unique([...Object.keys(policy.vectorGenerators), ...Object.keys(policy.vectorExclusions)]),
    allVectorPaths,
    'Every nested vector corpus needs a disposition',
  );
  for (const [path, reason] of Object.entries(policy.vectorExclusions)) {
    assert(
      !Object.hasOwn(policy.vectorGenerators, path) && reason.length > 20,
      'Invalid vector exclusion: ' + path,
    );
  }
  const vectorPaths = allVectorPaths.filter((p) => !Object.hasOwn(policy.vectorExclusions, p));
  assert.deepEqual(
    Object.keys(policy.vectorGenerators).sort(),
    vectorPaths,
    'Every vector corpus needs a generator disposition',
  );
  const vectors = vectorPaths.map((path) => {
    const generator = policy.vectorGenerators[path];
    assert(fileSet.has(generator), 'Missing generator: ' + generator);
    const argv = ['node', generator, '--check'];
    assert(
      flattenPackages(graph, 'vectors:check').some(
        (c) => JSON.stringify(c.argv) === JSON.stringify(argv),
      ),
      'Generator missing from vectors:check: ' + generator,
    );
    return { path, generator, argv };
  });
  const registryPath = 'docs/account-crypto/constructions.json';
  const registry = JSON.parse(read(registryPath));
  const testMap = new Map(tests.map((t) => [t.path, t]));
  const corpora = [{ phase: 'A', vectorFile: registry.vectorFile }, ...registry.additionalCorpora];
  const corpusMap = new Map(
    corpora.map((c) => {
      assert(
        vectors.some((v) => v.path === c.vectorFile),
        'Uncovered registry corpus: ' + c.vectorFile,
      );
      return [
        c.phase,
        {
          path: c.vectorFile,
          ids: new Set(JSON.parse(read(c.vectorFile)).vectors.map((v) => v.id)),
        },
      ];
    }),
  );
  const constructions = registry.constructions.map((c) => {
    const requiredTests = c.tests ?? [];
    for (const path of requiredTests)
      assert(
        testMap.get(path)?.status === 'required',
        'Uncovered registered test: ' + c.id + ': ' + path,
      );
    const corpus = corpusMap.get(c.phase);
    for (const id of c.vectorCases ?? [])
      assert(corpus?.ids.has(id), 'Uncovered registered vector: ' + c.id + ': ' + id);
    return {
      id: c.id,
      status: c.status,
      tests: requiredTests,
      requirements: c.requirements ?? [],
      vectorFile: corpus?.path ?? null,
      vectorCases: c.vectorCases ?? [],
    };
  });
  const inputPaths = unique([
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.oxfmtrc.json',
    'vite.config.ts',
    registryPath,
    'scripts/release-validation/policy.json',
    ...readdirSync(root).filter((p) => /^(?:playwright.*\.config\.ts|tsconfig.*\.json)$/.test(p)),
    ...files.filter((p) => /\.(?:ts|tsx|mjs|mts|json)$/.test(p)),
  ]);
  // Full test/helper/runner inputs are pinned: a changed dynamic map or imported fixture invalidates inventory review.
  const inputs = inputPaths.map((path) => ({ path, sha256: hash(read(path)) }));
  return {
    schema: 1,
    claim: policy.scope,
    limits: policy.limits,
    counts: {
      packageScripts: graph.length,
      campaigns: campaigns.length,
      testFiles: tests.length,
      requiredTestFiles: tests.filter((t) => t.status === 'required').length,
      excludedProductTestFiles: tests.filter((t) => t.status !== 'required').length,
      catalogues: catalogues.length,
      vectorCorpora: vectors.length,
      constructions: constructions.length,
      vectorChainConsumers: campaigns.filter((c) => c.referencesVectorChain).length,
    },
    packageDispositions: policy.packages,
    packageGraph: graph,
    additionsToCheck: addedRoots,
    extraRoots: policy.extraRoots,
    campaigns,
    tests,
    catalogues,
    vectors,
    vectorExclusions: policy.vectorExclusions,
    constructions,
    inputs,
  };
}

export function assertSnapshot(inventory, expected) {
  const actual = JSON.stringify(inventory, null, 2) + '\n';
  assert.equal(
    hash(JSON.stringify(inventory)),
    hash(JSON.stringify(JSON.parse(expected))),
    'Planning inventory drifted; review changed inputs/dispositions before --record',
  );
  return actual;
}
