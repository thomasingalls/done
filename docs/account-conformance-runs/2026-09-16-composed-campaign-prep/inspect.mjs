/** Read-only preparation inventory. Never import or execute a campaign or test. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = process.cwd();
assert(
  process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--baseline'),
);
const { parseSync } = createRequire(resolve(root, 'package.json'))('@babel/core');
const read = (path) =>
  process.argv[2] === '--baseline'
    ? execFileSync('git', ['show', '3af765d3:' + path], {
        cwd: root,
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 8 * 1024 * 1024,
      })
    : readFileSync(resolve(root, path), 'utf8');
const sha = (text) => createHash('sha256').update(text).digest('hex');
const manifest = JSON.parse(read('docs/release-validation-manifest.json'));
const pkg = JSON.parse(read('package.json'));
const vectors = pkg.scripts['vectors:check']
  .replace('pnpm vectors:coverage', pkg.scripts['vectors:coverage'])
  .split(' && ')
  .map((command) => {
    const [exe, ...args] = command.split(' ');
    assert.equal(exe, 'node');
    assert(args.every((arg) => /^[A-Za-z0-9_./:-]+$/.test(arg)));
    return args;
  });
const bind = (pattern, value, env) => {
  if (pattern.type === 'Identifier') env[pattern.name] = value;
  else if (pattern.type === 'ArrayPattern')
    pattern.elements.forEach((p, i) => bind(p, value[i], env));
  else throw Error('Unreviewed binding: ' + pattern.type);
};
function evaluate(node, env) {
  if (['StringLiteral', 'NumericLiteral'].includes(node.type)) return node.value;
  if (node.type === 'Identifier' && Object.hasOwn(env, node.name)) return env[node.name];
  if (node.type === 'ArrayExpression')
    return node.elements.flatMap((n) =>
      n.type === 'SpreadElement' ? evaluate(n.argument, env) : [evaluate(n, env)],
    );
  if (node.type === 'BinaryExpression' && node.operator === '+')
    return evaluate(node.left, env) + evaluate(node.right, env);
  if (node.type === 'TemplateLiteral')
    return node.quasis
      .map(
        (q, i) => q.value.cooked + (node.expressions[i] ? evaluate(node.expressions[i], env) : ''),
      )
      .join('');
  if (node.type === 'CallExpression') {
    const args = () => node.arguments.map((arg) => evaluate(arg, env));
    if (node.callee.type === 'Identifier') {
      if (node.callee.name === 'testArgs') {
        const [name, paths] = args();
        return [
          '--test',
          '--test-concurrency=1',
          '--test-reporter=spec',
          '--test-reporter-destination=stdout',
          '--test-reporter=junit',
          '--test-reporter-destination=$REPORT/' + name + '.xml',
          ...paths,
        ];
      }
      if (node.callee.name === 'suite') {
        const [dir, names] = args();
        return names.map((n) => 'test/' + dir + '/' + n + '.test.mjs');
      }
      if (node.callee.name === 'String') return String(...args());
      if (node.callee.name === 'join') return args().join('/');
    }
    if (node.callee.type === 'MemberExpression' && !node.callee.computed) {
      const value = evaluate(node.callee.object, env),
        method = node.callee.property.name;
      if (method === 'padStart' && typeof value === 'string') return value.padStart(...args());
      if (method === 'map' && Array.isArray(value) && node.arguments.length === 1) {
        const fn = node.arguments[0];
        assert.equal(fn.type, 'ArrowFunctionExpression');
        assert(!fn.async);
        return value.map((item, i) => {
          const inner = { ...env };
          fn.params.forEach((p, j) => bind(p, [item, i][j], inner));
          return evaluate(fn.body, inner);
        });
      }
    }
  }
  throw Error('Unreviewed expression: ' + node.type);
}
// This is a deliberately selected expression reader, not a general campaign compiler.
// Function implementations and run-loop semantics are separately pinned and reviewed.
function inspect(path) {
  const source = read(path);
  const ast = parseSync(source, { configFile: false, babelrc: false }).program;
  const body = ast.body.find((n) => n.type === 'TryStatement').block.body;
  const declarations = body
    .filter((n) => n.type === 'VariableDeclaration')
    .flatMap((n) => n.declarations);
  const env = { output: '$REPORT', vectorCommands: vectors };
  for (const name of ['suites', 'changed', 'stages']) {
    const declaration = declarations.find((n) => n.id.name === name);
    assert(declaration, 'Missing reviewed declaration: ' + name);
    env[name] = evaluate(declaration.init, env);
  }
  assert.equal(new Set(env.stages.map(([name]) => name)).size, env.stages.length);
  assert(source.includes('if (!(await run(name, args, 300000)))'));
  assert(source.includes('env.ACCOUNT_REPORT_DIR = evidenceDir'));
  const steps = env.stages.map(([name, args]) => {
    const files = args.includes('--test')
      ? args.filter((arg) => arg.startsWith('test/') && arg.endsWith('.test.mjs'))
      : [];
    const required = [],
      retired = [];
    for (const file of files) {
      const row = manifest.rows.find((r) => r.id === 'test:' + file);
      const exclusion = manifest.exclusions.find((r) => r.id === 'test:' + file);
      assert(Boolean(row?.stage) !== Boolean(exclusion), 'Unknown/ambiguous child: ' + file);
      if (exclusion) retired.push({ path: file, reason: exclusion.reason });
      else
        required.push({
          path: file,
          sha256: sha(read(file)),
          cases: row.stage.expect.cases,
          ...(row.stage.fixture ? { fixture: row.stage.fixture } : {}),
          historyInputs: row.stage.expect.historyInputs ?? [],
          dataInputs: row.stage.expect.dataInputs ?? [],
        });
    }
    return {
      name,
      argv: ['node', ...args],
      deadlineMs: 300000,
      kind: args.includes('--test')
        ? 'node'
        : args[0] === 'node_modules/vitest/vitest.mjs'
          ? 'vitest'
          : 'exit',
      evidenceDirectory: name === 'unit' ? null : '$REPORT/' + name,
      files: required,
      retired,
      requiredCases: required.reduce((n, f) => n + f.cases.length, 0),
    };
  });
  return {
    path,
    sha256: sha(source),
    steps,
    requiredFiles: steps.reduce((n, s) => n + s.files.length, 0),
    requiredNodeCases: steps.reduce((n, s) => n + s.requiredCases, 0),
    note: 'Static current child inventory, not execution. Full Vitest and nested components require their own contracts.',
  };
}
const result = {
  schema: 1,
  base: '3af765d3',
  claim: 'Read-only composed campaign preparation; no resolved obligations or passing campaign.',
  inputs: ['package.json', 'docs/release-validation-manifest.json'].map((path) => ({
    path,
    sha256: sha(read(path)),
  })),
  unresolved: { total: manifest.unresolved.length, command: 70, campaign: 38, test: 0 },
  campaigns: ['account-isolation', 'account-reservation-durability'].map((name) =>
    inspect('scripts/' + name + '/run.mjs'),
  ),
};
assert.equal(result.unresolved.total, 108);
// Verify the finite reader itself fails closed; neither expression is evaluated as JavaScript.
for (const expression of ['process.exit(0)', 'unknown()']) {
  const ast = parseSync(expression, { configFile: false, babelrc: false }).program.body[0]
    .expression;
  assert.throws(() => evaluate(ast, {}), /Unreviewed expression/);
}
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
