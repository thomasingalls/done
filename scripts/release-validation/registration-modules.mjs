/** The single reviewed helper export used to declare Node case names. Never import it. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSync } from '@babel/core';
import { hash } from './identity.mjs';

export function registrationModulePath(consumer) {
  return consumer === 'test/account-delivery-oracle/controls.test.mjs'
    ? 'test/account-delivery-oracle/helpers.mjs'
    : undefined;
}

export function registrationModule(root, consumer, source, specifier) {
  const path = registrationModulePath(consumer);
  assert(
    root &&
      path &&
      source === './helpers.mjs' &&
      specifier.type === 'ImportSpecifier' &&
      specifier.imported.name === 'controls',
    'Unreviewed registration module import',
  );
  const absolute = resolve(root, path);
  assert.equal(
    realpathSync(absolute),
    resolve(realpathSync(root), path),
    'Registration module symlink refused',
  );
  const bytes = readFileSync(absolute);
  assert(bytes.length <= 256 * 1024, 'Registration module too large');
  const ast = parseSync(bytes.toString('utf8'), {
    configFile: false,
    babelrc: false,
    parserOpts: { sourceType: 'module' },
  }).program;
  const declarations = ast.body.flatMap((n) =>
    n.type === 'ExportNamedDeclaration' &&
    n.declaration?.type === 'VariableDeclaration' &&
    n.declaration.kind === 'const'
      ? n.declaration.declarations.filter((d) => d.id.name === 'controls')
      : [],
  );
  assert.equal(declarations.length, 1, 'Unresolved registration module export');
  const node = declarations[0].init;
  assert(node?.type === 'ObjectExpression' && node.properties.length, 'Unresolved control table');
  const value = Object.create(null);
  for (const p of node.properties) {
    assert(
      p.type === 'ObjectProperty' &&
        !p.computed &&
        ['Identifier', 'StringLiteral'].includes(p.key.type),
      'Unresolved control property',
    );
    const key = p.key.name ?? p.key.value;
    assert(
      key && !['__proto__', 'constructor', 'prototype'].includes(key) && !Object.hasOwn(value, key),
      'Invalid or duplicate control key',
    );
    assert(
      p.value.type === 'ArrayExpression' &&
        p.value.elements.length === 2 &&
        p.value.elements.every((n) => n?.type === 'StringLiteral' && n.value.length),
      'Unresolved control patch literals',
    );
    value[key] = p.value.elements.map((n) => n.value);
  }
  return { value, pin: { path, sha256: hash(bytes) } };
}
