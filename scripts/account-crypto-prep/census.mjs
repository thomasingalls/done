/** Prep inventory, not a cryptographic soundness or whole-program discovery claim. */
import { parseSync } from '@babel/core';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
export const ROOTS = ['account-protocol', 'account-service', 'src'];
const walk = (root, relative) =>
  readdirSync(join(root, relative), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(root, join(relative, e.name)) : [join(relative, e.name)],
  );
export function labelsIn(path, source) {
  const ast = parseSync(source, {
    filename: path,
    configFile: false,
    babelrc: false,
    parserOpts: { plugins: ['typescript', ...(path.endsWith('.tsx') ? ['jsx'] : [])] },
  });
  const sites = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object' || node.type === 'TSLiteralType') return;
    let label, kind;
    if (node.type === 'StringLiteral' && node.value.startsWith('done/')) {
      label = node.value;
      kind = 'literal';
    }
    if (
      node.type === 'TemplateLiteral' &&
      (node.quasis[0].value.cooked ?? node.quasis[0].value.raw).startsWith('done/')
    ) {
      label = node.expressions.length
        ? source.slice(node.start + 1, node.end - 1)
        : node.quasis[0].value.cooked;
      kind = node.expressions.length ? 'template' : 'literal';
    }
    if (label) sites.push({ label, kind, line: node.loc.start.line });
    for (const [key, value] of Object.entries(node)) {
      if (
        [
          'loc',
          'start',
          'end',
          'leadingComments',
          'innerComments',
          'trailingComments',
          'comments',
          'tokens',
          'extra',
        ].includes(key)
      )
        continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast.program);
  return sites;
}
export function census(root) {
  const files = ROOTS.flatMap((p) => walk(root, p))
    .filter((p) => /\.tsx?$/.test(p) && !/(?:\.test|\.spec|\.d)\.tsx?$/.test(p))
    .sort();
  const domains = new Map();
  const sources = files.map((path) => {
    const source = readFileSync(join(root, path), 'utf8');
    for (const { label, kind, line } of labelsIn(path, source)) {
      const id = kind + ':' + label;
      if (!domains.has(id)) domains.set(id, { label, kind, sites: [] });
      domains.get(id).sites.push({ path, line });
    }
    return { path, sha256: createHash('sha256').update(source).digest('hex') };
  });
  return {
    v: 1,
    scope: ROOTS,
    exclusions: [
      '*.test.ts(x)',
      '*.spec.ts(x)',
      '*.d.ts(x)',
      'comments',
      'TypeScript literal types',
      'non-TS dependencies/WASM',
      'constructed strings without a done/ literal prefix',
    ],
    sources,
    domains: [...domains.values()].sort((a, b) =>
      a.label < b.label ? -1 : a.label > b.label ? 1 : 0,
    ),
  };
}
export function checkRegistry(inventory, registry) {
  const failures = [],
    assigned = new Map();
  for (const group of registry.groups) {
    for (const key of ['id', 'kind', 'authority', 'home', 'next'])
      if (typeof group[key] !== 'string' || !group[key])
        failures.push('Incomplete group ' + group.id + ': ' + key);
    for (const label of group.labels) {
      if (assigned.has(label)) failures.push('Duplicate classification ' + label);
      assigned.set(label, group.id);
    }
  }
  const found = new Set(inventory.domains.map((d) => d.label));
  for (const label of found)
    if (!assigned.has(label)) failures.push('Unclassified runtime label ' + label);
  for (const label of assigned.keys())
    if (!found.has(label)) failures.push('Stale classified label ' + label);
  for (const entry of inventory.domains.filter((d) => d.kind === 'template')) {
    const expansion = registry.templates.find((t) => t.pattern === entry.label);
    if (!expansion?.values.length || !expansion.source)
      failures.push('Unresolved template ' + entry.label);
  }
  for (const expansion of registry.templates)
    if (!inventory.domains.some((d) => d.kind === 'template' && d.label === expansion.pattern))
      failures.push('Stale template ' + expansion.pattern);
  return failures;
}

export function checkSnapshot(inventory, saved) {
  return JSON.stringify(inventory) === JSON.stringify(saved)
    ? []
    : [
        'Runtime census changed. Review source changes and classification, then explicitly run --record.',
      ];
}
