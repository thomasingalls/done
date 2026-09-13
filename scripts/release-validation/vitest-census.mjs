/** Finite registrations, not an import or a count learned from a green run. */
import assert from 'node:assert/strict';
import { parseSync } from '@babel/core';
import { registrationData, tableTitle } from './registration-data.mjs';

export const vitestCaseId = (path, names) => path + '::' + JSON.stringify(names);
export function vitestCensus(path, text, options = {}) {
  return vitestDeclarations(path, text, options).cases;
}
export function vitestDeclarations(path, text, { root } = {}) {
  const ast = parseSync(text, {
    configFile: false,
    babelrc: false,
    parserOpts: {
      sourceType: 'module',
      plugins: ['typescript', ...(path.endsWith('.tsx') ? ['jsx'] : [])],
    },
  }).program;
  const aliases = new Map(),
    used = new Set(),
    cases = [];
  for (const n of ast.body) {
    if (n.type !== 'ImportDeclaration' || n.source.value !== 'vitest') continue;
    for (const s of n.specifiers) {
      assert(s.type === 'ImportSpecifier', 'Unresolved Vitest namespace/default import: ' + path);
      if (['test', 'it', 'describe', 'suite'].includes(s.imported.name))
        aliases.set(
          s.local.name,
          ['describe', 'suite'].includes(s.imported.name) ? 'suite' : 'test',
        );
    }
  }
  assert(aliases.size, 'No supported Vitest registrations: ' + path);
  const data = registrationData({ root, path, ast });
  const hasRegistration = (n) => {
    if (!n || typeof n !== 'object') return false;
    if (n.type === 'Identifier' && aliases.has(n.name)) return true;
    return Object.entries(n).some(
      ([k, v]) =>
        !['loc', 'comments'].includes(k) &&
        (Array.isArray(v) ? v.some(hasRegistration) : hasRegistration(v)),
    );
  };
  const statements = (body, names, env, depth = 0) => {
    assert(depth < 32, 'Registration nesting limit');
    for (const n of body) {
      if (n.type === 'ForOfStatement' && hasRegistration(n.body)) {
        assert(
          !n.await &&
            n.left.type === 'VariableDeclaration' &&
            n.left.kind === 'const' &&
            n.left.declarations.length === 1,
          'Unresolved registration loop',
        );
        const values = data.value(n.right, env);
        assert(
          Array.isArray(values) && values.length && values.length <= 10000,
          'Unresolved or empty registration loop',
        );
        for (const item of values) {
          const inner = data.scope(env),
            statementsBody = n.body.type === 'BlockStatement' ? n.body.body : [n.body];
          data.bind(n.left.declarations[0].id, item, inner);
          data.declarations(statementsBody, inner);
          statements(statementsBody, names, inner, depth + 1);
        }
        continue;
      }
      const call = n.type === 'ExpressionStatement' ? n.expression : null;
      if (call?.type !== 'CallExpression') continue;
      let callee = call.callee,
        values;
      if (
        callee.type === 'CallExpression' &&
        callee.callee.type === 'MemberExpression' &&
        !callee.callee.computed &&
        callee.callee.property.name === 'each' &&
        aliases.has(callee.callee.object.name)
      ) {
        assert.equal(callee.arguments.length, 1, 'Unresolved Vitest table');
        values = data.value(callee.arguments[0], env);
        assert(
          Array.isArray(values) && values.length && values.length <= 10000,
          'Unresolved or empty Vitest table',
        );
        assert(
          values.every(
            (v) => Array.isArray(v) === Array.isArray(values[0]) && (!Array.isArray(v) || v.length),
          ),
          'Unresolved mixed or empty table rows',
        );
        callee = callee.callee.object;
      }
      const kind = aliases.get(callee.name);
      if (!kind) continue;
      used.add(callee);
      const [title, fn, timeout] = call.arguments,
        name = data.value(title, env);
      assert(
        typeof name === 'string' &&
          ['ArrowFunctionExpression', 'FunctionExpression'].includes(fn?.type) &&
          !fn.generator,
        'Unresolved Vitest title/callback: ' + path,
      );
      assert(
        call.arguments.length === 2 ||
          (kind === 'test' &&
            call.arguments.length === 3 &&
            timeout.type === 'NumericLiteral' &&
            Number.isSafeInteger(timeout.value) &&
            timeout.value > 0),
        'Unresolved Vitest options: ' + path,
      );
      for (const item of values ?? [null]) {
        const full = [...names, values ? tableTitle(name, item) : name];
        if (kind === 'suite') {
          assert(!fn.async && fn.body.type === 'BlockStatement', 'Unresolved Vitest suite');
          const inner = data.scope(env);
          if (values)
            fn.params.forEach((p, i) =>
              data.bind(p, (Array.isArray(item) ? item : [item])[i], inner),
            );
          else assert.equal(fn.params.length, 0, 'Unresolved suite parameters');
          data.declarations(fn.body.body, inner);
          statements(fn.body.body, full, inner, depth + 1);
        } else {
          assert(cases.length < 10000, 'Registration case limit');
          cases.push({ id: vitestCaseId(path, full), outcome: 'pass' });
        }
      }
    }
  };
  statements(ast.body, [], data.global);
  const visit = (n, parent) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'Identifier' && aliases.has(n.name))
      assert(
        used.has(n) || parent?.type?.startsWith('Import'),
        'Unresolved Vitest registration (alias, conditional, loop, nested or modifier): ' + path,
      );
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
    'Empty or duplicate Vitest census: ' + path,
  );
  return {
    cases,
    dataInputs: [...data.inputs.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
}
