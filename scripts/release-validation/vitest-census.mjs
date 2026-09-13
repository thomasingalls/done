/** Finite registrations, not an import or a count learned from a green run. */
import assert from 'node:assert/strict';
import { parseSync } from '@babel/core';

export const vitestCaseId = (path, names) => path + '::' + JSON.stringify(names);

export function vitestCensus(path, text) {
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
  const untyped = (n) => (n?.type === 'TSAsExpression' ? untyped(n.expression) : n);
  const statements = (body, names) => {
    for (const n of body) {
      const call = n.type === 'ExpressionStatement' ? n.expression : null;
      if (call?.type !== 'CallExpression') continue;
      let callee = call.callee,
        values;
      if (
        callee.type === 'CallExpression' &&
        callee.callee.type === 'MemberExpression' &&
        !callee.callee.computed &&
        callee.callee.property.name === 'each' &&
        aliases.get(callee.callee.object.name) === 'test'
      ) {
        assert.equal(callee.arguments.length, 1, 'Unresolved Vitest table');
        const table = untyped(callee.arguments[0]);
        assert(
          table?.type === 'ArrayExpression' && table.elements.length,
          'Unresolved Vitest table',
        );
        values = table.elements.map((e) => {
          assert(
            e && ['StringLiteral', 'BooleanLiteral', 'NumericLiteral'].includes(e.type),
            'Only literal scalar Vitest tables are certified',
          );
          return e.value;
        });
        callee = callee.callee.object;
      }
      const kind = aliases.get(callee.name);
      if (!kind) continue;
      used.add(callee);
      const [title, fn, timeout] = call.arguments;
      assert(
        title?.type === 'StringLiteral' &&
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
      if (kind === 'suite') {
        assert(
          !fn.async && !fn.generator && fn.body.type === 'BlockStatement',
          'Unresolved Vitest suite',
        );
        statements(fn.body.body, [...names, title.value]);
      } else {
        let titles = [title.value];
        if (values) {
          assert.equal((title.value.match(/%/g) ?? []).length, 1, 'Unresolved Vitest table title');
          assert(title.value.includes('%s'), 'Only scalar %s Vitest titles are certified');
          titles = values.map((value) => title.value.replace('%s', () => String(value)));
        }
        for (const name of titles)
          cases.push({ id: vitestCaseId(path, [...names, name]), outcome: 'pass' });
      }
    }
  };
  statements(ast.body, []);
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
  return cases;
}
