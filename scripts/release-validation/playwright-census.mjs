/** Translate only reviewed Playwright registrations into the finite static reader.
 * Neither test modules nor their hooks are imported or executed to learn the census.
 */
import assert from 'node:assert/strict';
import { parseSync, transformFromAstSync, traverse } from '@babel/core';
import { vitestDeclarations } from './vitest-census.mjs';

export const playwrightCaseId = (file, project, names) =>
  file + '::' + JSON.stringify([project, ...names]);
export function playwrightDeclarations(file, text, { root, projects = [''] } = {}) {
  assert(
    projects.length &&
      projects.every((p) => typeof p === 'string') &&
      new Set(projects).size === projects.length,
    'Invalid Playwright project census',
  );
  const ast = parseSync(text, {
    configFile: false,
    babelrc: false,
    parserOpts: { sourceType: 'module', plugins: ['typescript'] },
  });
  const imports = ast.program.body.filter(
    (n) =>
      n.type === 'ImportDeclaration' &&
      ['@playwright/test', '../release-validation/browser-fixture'].includes(n.source.value),
  );
  const names = imports.flatMap((n) =>
    n.specifiers
      .filter((s) => s.type === 'ImportSpecifier' && s.imported.name === 'test')
      .map((s) => s.local.name),
  );
  assert(names.length, 'No supported Playwright test import');
  const aliases = new Map();
  // Binding-aware names avoid mistaking RegExp.test properties for test registrations.
  traverse(ast, {
    Program(path) {
      for (const name of names) {
        const alias = path.scope.generateUidIdentifier('ownedTest').name;
        path.scope.rename(name, alias);
        aliases.set(alias, path.scope.generateUidIdentifier('ownedSuite').name);
      }
    },
  });
  for (const n of imports)
    n.specifiers = n.specifiers.filter(
      (s) => !(s.type === 'ImportSpecifier' && s.imported.name === 'test'),
    );
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'CallExpression') {
      let callee = n.callee;
      const parts = [];
      while (callee.type === 'MemberExpression' && !callee.computed) {
        parts.unshift(callee.property.name);
        callee = callee.object;
      }
      if (aliases.has(callee.name)) {
        const chain = parts.join('.');
        if (chain === 'describe') n.callee = { type: 'Identifier', name: aliases.get(callee.name) };
        else if (
          [
            'beforeEach',
            'afterEach',
            'beforeAll',
            'afterAll',
            'skip',
            'info',
            'setTimeout',
            'describe.configure',
          ].includes(chain)
        ) {
          if (chain === 'skip')
            assert(
              n.arguments.length === 2 &&
                n.arguments[0].type !== 'StringLiteral' &&
                n.arguments[1].type === 'StringLiteral',
              'Unreviewed Playwright skip registration',
            );
          // Keep arguments: nested registrations inside a hook still refuse.
          n.callee = { type: 'Identifier', name: '__ownedMetadata' };
        }
      }
    }
    for (const [key, value] of Object.entries(n)) {
      if (['loc', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key))
        continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast.program);
  for (const [alias, suite] of aliases)
    ast.program.body.unshift(
      ...parseSync(`import {test as ${alias}, describe as ${suite}} from 'vitest';`, {
        configFile: false,
        babelrc: false,
      }).program.body,
    );
  const declarations = vitestDeclarations(
    file,
    transformFromAstSync(ast, text, { configFile: false, babelrc: false }).code,
    { root },
  );
  assert.equal(declarations.dataInputs.length, 0, 'Playwright registration data requires review');
  return projects.flatMap((project) =>
    declarations.cases.map((c) => ({
      id: playwrightCaseId(file, project, JSON.parse(c.id.slice(file.length + 2))),
      outcome: 'pass',
    })),
  );
}
