import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ROOTS,
  labelsIn,
  census,
  checkRegistry,
  checkSnapshot,
} from '../../scripts/account-crypto-prep/census.mjs';

const registry = (labels) => ({
  groups: [{ id: 'test', kind: 'test', authority: 'test', home: 'test', next: 'test', labels }],
  templates: [],
});
test('runtime strings, escapes, JSX and templates are distinct from comments and literal types', () => {
  const source = [
    '// "done/comment/v1"',
    'type V = "done/type/v1";',
    'const a = "done/a/v1\\0";',
    'const b = `done/b/v${version}`;',
    'const c = <div title="done/jsx/v1" />;',
    'const d = `done/literal/v1`;',
    'const e = `\\u0064one/escaped/v1`;',
  ].join('\n');
  assert.deepEqual(labelsIn('a.tsx', source), [
    { label: 'done/a/v1\0', kind: 'literal', line: 3 },
    { label: 'done/b/v${version}', kind: 'template', line: 4 },
    { label: 'done/jsx/v1', kind: 'literal', line: 5 },
    { label: 'done/literal/v1', kind: 'literal', line: 6 },
    { label: 'done/escaped/v1', kind: 'literal', line: 7 },
  ]);
});

test('300 generated quoted labels are discovered; comments/types cannot pay classification', () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom('a', 'Z', '0', '/', '\\', '"', "'", '\0', '\n'), {
        minLength: 1,
        maxLength: 32,
      }),
      (chars) => {
        const label = 'done/' + chars.join('');
        const literal = JSON.stringify(label);
        const source = `// ${literal}\ntype V = ${literal};\nconst value = ${literal};`;
        const domains = labelsIn('a.ts', source);
        assert.deepEqual(domains, [{ label, kind: 'literal', line: 3 }]);
        assert.deepEqual(checkRegistry({ domains }, registry([label])), []);
        assert.match(checkRegistry({ domains }, registry([]))[0], /Unclassified runtime label/);
      },
    ),
    { seed: 5110911, numRuns: 300 },
  );
});

test('effective controls: missing, duplicate, stale and unresolved classifications refuse', () => {
  const domains = [
    { label: 'done/a/v1', kind: 'literal' },
    { label: 'done/b/v${v}', kind: 'template' },
  ];
  const r = registry(domains.map((d) => d.label));
  r.templates = [{ pattern: domains[1].label, values: ['done/b/v1'], source: 'a.ts' }];
  assert.deepEqual(checkRegistry({ domains }, r), []);
  const missing = structuredClone(r);
  missing.groups[0].labels.pop();
  assert.ok(checkRegistry({ domains }, missing).some((f) => f.startsWith('Unclassified')));
  const duplicate = structuredClone(r);
  duplicate.groups.push(duplicate.groups[0]);
  assert.ok(checkRegistry({ domains }, duplicate).some((f) => f.startsWith('Duplicate')));
  const stale = structuredClone(r);
  stale.groups[0].labels.push('done/stale/v1');
  assert.ok(checkRegistry({ domains }, stale).some((f) => f.startsWith('Stale')));
  const unresolved = structuredClone(r);
  unresolved.templates = [];
  assert.ok(checkRegistry({ domains }, unresolved).some((f) => f.startsWith('Unresolved')));
});

test('new source files and unlabelled byte changes invalidate pinned source coverage', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'done-crypto-census-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ROOTS) mkdirSync(join(root, dir));
  const path = join(root, 'account-protocol', 'a.ts');
  writeFileSync(path, 'const algorithm = "SHA-256";');
  const initial = census(root);
  assert.deepEqual(checkSnapshot(census(root), initial), []);
  writeFileSync(path, 'const algorithm = "SHA-512";');
  assert.equal(census(root).domains.length, 0);
  assert.equal(checkSnapshot(census(root), initial).length, 1);
  writeFileSync(path, 'const algorithm = "SHA-256";');
  writeFileSync(join(root, 'src', 'new.ts'), 'const label = "done/new/v1";');
  assert.equal(checkSnapshot(census(root), initial).length, 1);
  assert.ok(checkRegistry(census(root), registry([])).some((f) => f.includes('done/new/v1')));
  writeFileSync(join(root, 'src', 'new.test.ts'), 'const label = "done/test/v1";');
  assert.equal(census(root).sources.length, 2);
  assert.equal(census(root).domains.length, 1);
});

test('prefix scan limit is explicit: arbitrary constructed domains require manual review', () => {
  assert.deepEqual(labelsIn('a.ts', 'const label = ["do", "ne/", purpose].join("");'), []);
});
