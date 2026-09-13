/** Finite declaration data only: no eval, module import or user-function invocation. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { hash } from './identity.mjs';
import { registrationModule } from './registration-modules.mjs';

export const untyped = (n) =>
  ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression'].includes(n?.type)
    ? untyped(n.expression)
    : n;
const opaqueFunction = Symbol('unexecuted declaration function');
const safeKey = (key) => {
  assert(!['__proto__', 'constructor', 'prototype'].includes(String(key)), 'Unresolved data key');
  return key;
};
export function registrationData({ root, path, ast }) {
  const inputs = new Map();
  const scope = (parent = null) => Object.create(parent);
  const global = scope();
  const define = (env, name, value) => {
    assert(!Object.hasOwn(env, name), 'Unresolved duplicate data binding: ' + name);
    Object.defineProperty(env, name, { value, enumerable: true });
  };
  const declarations = (body, env) => {
    for (const n of body) {
      if (n.type === 'VariableDeclaration')
        for (const d of n.declarations)
          if (d.id.type === 'Identifier')
            define(env, d.id.name, { node: d.init, kind: n.kind, env });
      if (n.type === 'ImportDeclaration')
        for (const s of n.specifiers)
          define(env, s.local.name, { import: n.source.value, specifier: s, env });
    }
  };
  declarations(ast.body, global);
  const json = (file) => {
    assert(
      root && /^test\/vectors\/[A-Za-z0-9_./-]+\.json$/.test(file),
      'Unreviewed JSON data path',
    );
    assert(!file.split('/').includes('..'), 'JSON data path escaped vectors');
    const absolute = resolve(root, file);
    assert.equal(
      realpathSync(absolute),
      resolve(realpathSync(root), file),
      'JSON data symlink refused',
    );
    const bytes = readFileSync(absolute);
    assert(bytes.length <= 4 * 1024 * 1024, 'Registration JSON data too large');
    inputs.set(file, { path: file, sha256: hash(bytes) });
    return JSON.parse(bytes);
  };
  const lookup = (name, env) => {
    assert(name in env, 'Unresolved registration data binding: ' + name);
    return env[name];
  };
  const value = (n, env = global, depth = 0) => {
    n = untyped(n);
    assert(n && depth < 64, 'Unresolved or recursive registration data');
    const next = (x, e = env) => value(x, e, depth + 1);
    if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(n.type)) {
      assert(
        n.type !== 'NumericLiteral' || Number.isFinite(n.value),
        'Nonfinite registration data',
      );
      return n.value;
    }
    if (n.type === 'NullLiteral') return null;
    if (n.type === 'Identifier') {
      if (n.name === 'undefined' && !(n.name in env)) return undefined;
      const binding = lookup(n.name, env);
      if ('value' in binding) return binding.value;
      if (binding.import) {
        if (!binding.import.endsWith('.json')) {
          const { value, pin } = registrationModule(root, path, binding.import, binding.specifier);
          inputs.set(pin.path, pin);
          return value;
        }
        assert(
          binding.specifier.type === 'ImportDefaultSpecifier' && binding.import.endsWith('.json'),
          'Unresolved data import',
        );
        return json(
          relative('.', resolve('.', dirname(path), binding.import)).replaceAll('\\', '/'),
        );
      }
      assert.equal(binding.kind, 'const', 'Mutable registration data');
      return next(binding.node, binding.env);
    }
    if (n.type === 'UnaryExpression' && ['-', '+'].includes(n.operator)) {
      const v = next(n.argument);
      assert(typeof v === 'number' && Number.isFinite(v), 'Unresolved numeric data');
      return n.operator === '-' ? -v : v;
    }
    if (n.type === 'ArrayExpression')
      return n.elements.flatMap((e) => {
        assert(e, 'Sparse registration data');
        if (e.type !== 'SpreadElement') return [next(e)];
        const v = next(e.argument);
        assert(Array.isArray(v), 'Unresolved array spread');
        return v;
      });
    if (n.type === 'ObjectExpression') {
      const out = Object.create(null);
      for (const p of n.properties) {
        assert(p.type === 'ObjectProperty' && !p.computed, 'Unresolved data property');
        const key = safeKey(p.key.name ?? p.key.value);
        assert(!Object.hasOwn(out, key), 'Duplicate data property');
        out[key] = next(p.value);
      }
      return out;
    }
    // Function-valued metadata can be carried, but never called, formatted or used as a title.
    if (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression')
      return opaqueFunction;
    if (n.type === 'MemberExpression') {
      const object = next(n.object),
        key = safeKey(n.computed ? next(n.property) : n.property.name);
      assert(
        object && typeof object === 'object' && Object.hasOwn(object, key),
        'Missing registration data field',
      );
      return object[key];
    }
    if (n.type === 'TemplateLiteral')
      return n.quasis
        .map((q, i) => q.value.cooked + (n.expressions[i] ? scalar(next(n.expressions[i])) : ''))
        .join('');
    if (n.type === 'BinaryExpression' && n.operator === '+') {
      const left = next(n.left),
        right = next(n.right);
      assert(
        ['string', 'number'].includes(typeof left) && ['string', 'number'].includes(typeof right),
        'Unresolved addition',
      );
      return left + right;
    }
    if (n.type === 'BinaryExpression' && n.operator === '>=') {
      const left = next(n.left),
        right = next(n.right);
      assert(
        typeof left === 'number' &&
          Number.isFinite(left) &&
          typeof right === 'number' &&
          Number.isFinite(right),
        'Unresolved numeric comparison',
      );
      return left >= right;
    }
    if (n.type === 'ConditionalExpression') {
      const condition = next(n.test);
      assert(typeof condition === 'boolean', 'Unresolved nonboolean data condition');
      return next(condition ? n.consequent : n.alternate);
    }
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed) {
      const c = n.callee,
        method = c.property.name;
      if (
        c.object.name === 'Object' &&
        !(c.object.name in env) &&
        ['keys', 'entries'].includes(method)
      ) {
        assert.equal(n.arguments.length, 1);
        const v = next(n.arguments[0]);
        assert(v && typeof v === 'object' && !Array.isArray(v), 'Unresolved Object data');
        return method === 'keys' ? Object.keys(v) : Object.entries(v);
      }
      if (c.object.name === 'JSON' && !('JSON' in env) && method === 'parse') {
        assert.equal(n.arguments.length, 1);
        const call = n.arguments[0];
        assert(
          call.type === 'CallExpression' && call.callee.type === 'Identifier',
          'Unresolved JSON source',
        );
        const b = lookup(call.callee.name, env);
        assert(
          b.import === 'node:fs' && b.specifier.imported?.name === 'readFileSync',
          'Unresolved JSON reader',
        );
        assert(
          call.arguments.length === 2 &&
            call.arguments[0].type === 'StringLiteral' &&
            call.arguments[1].value === 'utf8',
          'Unresolved JSON read options',
        );
        return json(call.arguments[0].value);
      }
      if (method === 'filter') {
        const list = next(c.object),
          fn = n.arguments[0];
        assert(
          Array.isArray(list) &&
            n.arguments.length === 1 &&
            fn?.type === 'ArrowFunctionExpression' &&
            !fn.async &&
            fn.params.length === 1 &&
            fn.params[0].type === 'Identifier',
          'Unresolved data filter',
        );
        const predicate = fn.body;
        assert(
          predicate.type === 'BinaryExpression' &&
            predicate.operator === 'in' &&
            predicate.left.type === 'StringLiteral' &&
            !Object.hasOwn(Object.prototype, predicate.left.value),
          'Unresolved data predicate',
        );
        return list.filter((item) => {
          const inner = scope(env);
          define(inner, fn.params[0].name, { value: item });
          const object = next(predicate.right, inner);
          assert(object && typeof object === 'object', 'Unresolved filter subject');
          return Object.hasOwn(object, safeKey(predicate.left.value));
        });
      }
    }
    throw Error('Unresolved registration data expression: ' + n.type);
  };
  const bind = (pattern, item, env) => {
    if (pattern.type === 'Identifier') define(env, pattern.name, { value: item });
    else if (pattern.type === 'ArrayPattern') {
      assert(Array.isArray(item), 'Unresolved tuple binding');
      pattern.elements.forEach((p, i) => {
        assert(p && i < item.length, 'Unresolved tuple element');
        bind(p, item[i], env);
      });
    } else throw Error('Unresolved registration binding: ' + pattern.type);
  };
  return { global, scope, declarations, value, bind, inputs };
}
export function scalar(value) {
  assert(
    !Object.is(value, -0) &&
      (typeof value !== 'number' || Number.isFinite(value)) &&
      (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)),
    'Unresolved scalar registration data',
  );
  return String(value);
}
export function tableTitle(title, row) {
  // Only the reviewed formatter subset. Extra tuple arguments remain callback inputs.
  assert((title.match(/%/g) ?? []).length === 1 && /%[sij]/.test(title), 'Unresolved table title');
  assert(!/\$[\w$]/.test(title), 'Unresolved interpolated table title');
  const first = Array.isArray(row) ? row[0] : row;
  return title.replace(/%([sij])/, (_, mode) => {
    if (mode === 's') return scalar(first);
    if (mode === 'i') {
      assert(
        typeof first === 'number' && Number.isSafeInteger(first) && !Object.is(first, -0),
        'Unresolved integer title',
      );
      return String(first);
    }
    const validate = (v) => {
      assert(v !== undefined && typeof v !== 'symbol', 'Unresolved JSON title value');
      if (v && typeof v === 'object') Object.values(v).forEach(validate);
    };
    validate(first);
    return JSON.stringify(first);
  });
}
