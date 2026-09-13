/** Deliberately finite data/declaration readers. Never import a test or campaign to plan it. */
import assert from 'node:assert/strict';
import { parseSync } from '@babel/core';
import { registrationData } from './registration-data.mjs';

const parse = (text) =>
  parseSync(text, { configFile: false, babelrc: false, parserOpts: { sourceType: 'module' } })
    .program;

export function catalogueCensus(text, { patches = false, patchFile } = {}) {
  const scope = Object.create(null);
  const bind = (pattern, value, env) => {
    if (pattern.type === 'Identifier') env[pattern.name] = value;
    else if (pattern.type === 'ArrayPattern')
      pattern.elements.forEach((p, i) => bind(p, value[i], env));
    else throw Error('Unresolved catalogue binding: ' + pattern.type);
  };
  const evaluate = (n, env) => {
    if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(n.type)) return n.value;
    if (n.type === 'Identifier' && Object.hasOwn(env, n.name)) return env[n.name];
    if (n.type === 'ArrayExpression')
      return n.elements.flatMap((e) =>
        e.type === 'SpreadElement' ? evaluate(e.argument, env) : [evaluate(e, env)],
      );
    if (n.type === 'ObjectExpression')
      return Object.fromEntries(
        n.properties.map((p) => {
          assert(p.type === 'ObjectProperty' && !p.computed, 'Unresolved catalogue property');
          return [p.key.name ?? p.key.value, evaluate(p.value, env)];
        }),
      );
    if (n.type === 'TemplateLiteral')
      return n.quasis
        .map((q, i) => q.value.cooked + (n.expressions[i] ? evaluate(n.expressions[i], env) : ''))
        .join('');
    if (n.type === 'BinaryExpression' && n.operator === '+')
      return evaluate(n.left, env) + evaluate(n.right, env);
    if (n.type === 'CallExpression') {
      if (n.callee.type === 'Identifier' && n.callee.name === 'String' && n.arguments.length === 1)
        return String(evaluate(n.arguments[0], env));
      if (n.callee.type === 'MemberExpression' && !n.callee.computed) {
        const value = evaluate(n.callee.object, env),
          method = n.callee.property.name;
        if (method === 'padStart' && typeof value === 'string')
          return value.padStart(...n.arguments.map((a) => evaluate(a, env)));
        if (method === 'map' && Array.isArray(value) && n.arguments.length === 1) {
          const fn = n.arguments[0];
          assert(fn.type === 'ArrowFunctionExpression' && !fn.async, 'Unresolved catalogue map');
          return value.map((item, i) => {
            const inner = { ...env };
            fn.params.forEach((p, j) => bind(p, [item, i][j], inner));
            return evaluate(fn.body, inner);
          });
        }
      }
    }
    throw Error('Unresolved catalogue expression: ' + n.type);
  };
  for (const statement of parse(text).body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    assert(
      declaration?.type === 'VariableDeclaration' && declaration.kind === 'const',
      'Unresolved catalogue statement',
    );
    for (const d of declaration.declarations) bind(d.id, evaluate(d.init, scope), scope);
  }
  const cases = scope.cases?.map((c) => ({ id: c.id, outcome: 'pass' }));
  const mutants = scope.mutants?.map((m) => ({
    id: m.id,
    case: m.case,
    assertion: m.assertion,
    outcome: 'detected',
    ...(patches ? { patch: { file: m.file ?? patchFile, from: m.from, to: m.to } } : {}),
  }));
  assert(cases?.length && mutants?.length, 'Empty catalogue census');
  for (const rows of [cases, mutants]) {
    assert(
      rows.every((r) => typeof r.id === 'string' && r.id.length),
      'Invalid catalogue identity',
    );
    assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'Duplicate catalogue identity');
  }
  for (const m of mutants)
    assert(
      cases.some((c) => c.id === m.case) && typeof m.assertion === 'string' && m.assertion.length,
      'Unbound catalogue mutation',
    );
  if (patchFile !== undefined)
    assert(
      typeof patchFile === 'string' &&
        patchFile.length &&
        scope.mutants.every((m) => m.file === undefined || m.file === patchFile),
      'Catalogue conflicts with fixed mutation source',
    );
  if (patches)
    for (const m of mutants)
      assert(
        Object.values(m.patch).every((v) => typeof v === 'string' && v.length),
        'Missing catalogue patch',
      );
  return { cases, mutants };
}

/** Only direct, literal, top-level node:test declarations qualify for this first adapter.
 * Loops, nested tests, aliases used elsewhere and conditional registrations refuse. Other
 * families need a reviewed adapter, not a count learned from a supposedly passing run.
 */
export const directNodeCensus = (path, text) => nodeCensus(path, text, false);
export const generatedNodeCensus = (path, text) => nodeCensus(path, text, true);
function nodeCensus(path, text, generated) {
  const ast = parse(text),
    aliases = new Set(),
    declarations = new Set(),
    cases = [];
  for (const n of ast.body)
    if (n.type === 'ImportDeclaration' && n.source.value === 'node:test')
      for (const s of n.specifiers)
        if (s.type === 'ImportDefaultSpecifier' || s.imported?.name === 'test')
          aliases.add(s.local.name);
  assert(aliases.size, 'No supported node:test import: ' + path);
  const data = registrationData({ path, ast });
  const scan = (body, env, depth = 0) => {
    assert(depth < 32, 'Node registration nesting limit');
    for (const n of body) {
      if (generated && n.type === 'ForOfStatement') {
        assert(
          !n.await &&
            n.left.type === 'VariableDeclaration' &&
            n.left.kind === 'const' &&
            n.left.declarations.length === 1,
          'Unresolved Node loop',
        );
        const items = data.value(n.right, env);
        assert(
          Array.isArray(items) && items.length && items.length <= 10000,
          'Unresolved Node loop population',
        );
        for (const item of items) {
          const inner = data.scope(env),
            body = n.body.type === 'BlockStatement' ? n.body.body : [n.body];
          data.bind(n.left.declarations[0].id, item, inner);
          data.declarations(body, inner);
          scan(body, inner, depth + 1);
        }
        continue;
      }
      const call = n.type === 'ExpressionStatement' ? n.expression : null;
      if (call?.type === 'CallExpression' && aliases.has(call.callee.name)) {
        const title = generated ? data.value(call.arguments[0], env) : call.arguments[0]?.value;
        assert(
          typeof title === 'string' && (generated || call.arguments[0]?.type === 'StringLiteral'),
          'Dynamic test title: ' + path,
        );
        assert(cases.length < 10000, 'Node registration case limit');
        declarations.add(call.callee);
        cases.push({ id: path + '::' + title, outcome: 'pass' });
      }
    }
  };
  scan(ast.body, data.global);
  const visit = (n, parent) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'Identifier' && aliases.has(n.name))
      assert(
        declarations.has(n) || parent?.type?.startsWith('Import'),
        'Unresolved test registration: ' + path,
      );
    if (n.type === 'MemberExpression' && n.property.name === 'test')
      throw Error('Unresolved nested test registration: ' + path);
    for (const [key, value] of Object.entries(n)) {
      if (['loc', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key))
        continue;
      if (Array.isArray(value)) value.forEach((v) => visit(v, n));
      else if (value && typeof value === 'object') visit(value, n);
    }
  };
  visit(ast);
  assert(
    cases.length && new Set(cases.map((c) => c.id)).size === cases.length,
    'Empty or duplicate test census: ' + path,
  );
  return cases;
}
