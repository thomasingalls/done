import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as fc from 'fast-check';
import {
  vitestCensus,
  vitestDeclarations,
} from '../../scripts/release-validation/vitest-census.mjs';
import {
  generatedNodeDeclarations,
  generatedNodeCensus,
  directNodeCensus,
} from '../../scripts/release-validation/census.mjs';
import {
  generatedFiles,
  generatedNodeStage,
} from '../../scripts/release-validation/generated-tests.mjs';
import { vitestStage } from '../../scripts/release-validation/vitest-adapter.mjs';
import { manifestSnapshot } from '../../scripts/release-validation/manifest-snapshot.mjs';
import { compileManifest, selectStages } from '../../scripts/release-validation/manifest.mjs';
import { buildInventory } from '../../scripts/release-validation/inventory.mjs';
import { hash } from '../../scripts/release-validation/identity.mjs';
const subject = 'test/subject.test.ts';
const source = (s) => "import {it,describe} from 'vitest';" + s;
const names = (cases) => cases.map((c) => JSON.parse(c.id.split('::')[1]));

function moduleFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'done-module-registration-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const consumer = 'test/account-delivery-oracle/controls.test.mjs';
  const path = 'test/account-delivery-oracle/helpers.mjs';
  mkdirSync(join(root, 'test/account-delivery-oracle'), { recursive: true });
  const text =
    "import test from 'node:test';import {controls as table} from './helpers.mjs';for(const name of Object.keys(table))test(name,()=>{});";
  return {
    root,
    consumer,
    path,
    text,
    write: (s) => writeFileSync(join(root, path), s),
    read: (s = text, file = consumer) => generatedNodeDeclarations(file, s, { root }),
  };
}

test('160 generated exported control tables preserve case order and pin all helper bytes without executing its imports or body', (t) => {
  const f = moduleFixture(t);
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 16 }),
      (ids) => {
        const entries = ids.map((n) => ['control' + n, ['from ' + n, 'to ' + n]]);
        const source =
          'import unavailable from "missing-package";throw Error("must not execute");export const controls=' +
          JSON.stringify(Object.fromEntries(entries)) +
          ';';
        f.write(source);
        const first = f.read();
        assert.deepEqual(
          first.cases,
          ids.map((n) => ({ id: f.consumer + '::control' + n, outcome: 'pass' })),
        );
        assert.deepEqual(first.dataInputs, [{ path: f.path, sha256: hash(source) }]);
        f.write(source + '\n// changed helper, same case names');
        const changed = f.read();
        assert.deepEqual(changed.cases, first.cases);
        assert.notDeepEqual(changed.dataInputs, first.dataInputs);
        f.write(
          'export const controls=' + JSON.stringify(Object.fromEntries(entries.slice(0, -1))) + ';',
        );
        if (ids.length > 1) assert.deepEqual(f.read().cases, first.cases.slice(0, -1));
        else assert.throws(() => f.read(), /Unresolved/);
      },
    ),
    { seed: 130925, numRuns: 160 },
  );
});

test('module registration refuses unreviewed consumers, imports, dynamic tables, mutable exports, invalid keys and symlinks', (t) => {
  const f = moduleFixture(t);
  for (const s of [
    'export let controls={a:["x","y"]};',
    'export {controls} from "./elsewhere.mjs";',
    'export const controls=unknown();',
    'export const controls={...other};',
    'export const controls={["a"]:["x","y"]};',
    'export const controls={a:["x","y"],a:["x","z"]};',
    'export const controls={constructor:["x","y"]};',
    'export const controls={__proto__:["x","y"]};',
    'export const controls={a:["x",]};',
    'export const controls={a:["x",unknown()]};',
    'export const controls={a:["x",()=>"y"]};',
    'export const controls={a:["x",""]};',
  ]) {
    f.write(s);
    assert.throws(() => f.read(), /Unresolved|Invalid|Duplicate/);
  }
  f.write('export const controls={a:["x","y"]};');
  for (const text of [
    f.text.replace("'./helpers.mjs'", "'../account-delivery-oracle/helpers.mjs'"),
    f.text.replace('controls as table', 'other as table'),
    f.text.replace('{controls as table}', 'table'),
    f.text.replace('{controls as table}', '* as table'),
  ])
    assert.throws(() => f.read(text), /Unreviewed/);
  assert.throws(() => f.read(f.text, 'test/other.test.mjs'), /Unreviewed/);
  assert.throws(() => generatedNodeCensus(f.consumer, f.text), /Unreviewed/);
  rmSync(join(f.root, f.path));
  writeFileSync(join(f.root, 'other.mjs'), 'export const controls={a:["x","y"]};');
  symlinkSync(join(f.root, 'other.mjs'), join(f.root, f.path));
  assert.throws(() => f.read(), /symlink/);
});

test('finite nested suite tables, literal loops, tuples, nullable scalars and object titles have independently computed identities', () => {
  assert.deepEqual(
    names(
      vitestCensus(
        subject,
        source(`
    const rows = {left:[1,2],right:[3]};
    describe.each(Object.entries(rows))('suite %s',(label, ids)=>{
      for(const id of ids) it(label + ':' + id,()=>{});
      it.each([undefined,null])('nullable %s',()=>{});
    });
    it.each([{a:1,b:'x'},{a:2,b:'y'}])('object %j',()=>{});
    for(const [name, metadata] of [['declared',{build:()=>{throw Error('not executed')}}]]) it(name,()=>metadata.build());
  `),
      ),
    ),
    [
      ['suite left', 'left:1'],
      ['suite left', 'left:2'],
      ['suite left', 'nullable undefined'],
      ['suite left', 'nullable null'],
      ['suite right', 'right:3'],
      ['suite right', 'nullable undefined'],
      ['suite right', 'nullable null'],
      ['object {"a":1,"b":"x"}'],
      ['object {"a":2,"b":"y"}'],
      ['declared'],
    ],
  );
});

test('JSON imports and explicit UTF-8 reads bind exact vector bytes, filters and input order without importing a module', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'done-registration-data-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'test/vectors'), { recursive: true });
  const file = join(root, 'test/vectors/a.json');
  const content = {
    vectors: [
      { name: 'one', expected: { stored: true } },
      { name: 'omit', expected: {} },
      { name: 'two', expected: { stored: true } },
    ],
  };
  writeFileSync(file, JSON.stringify(content));
  const text = source(`import v from './vectors/a.json';
    import {readFileSync as read} from 'node:fs';const w=JSON.parse(read('test/vectors/a.json','utf8'));
    for(const c of v.vectors.filter(c=>'stored' in c.expected)) it(c.name,()=>{});
    for(const c of [...w.vectors]) it('full '+c.name,()=>{});`);
  const first = vitestDeclarations(subject, text, { root });
  assert.deepEqual(names(first.cases), [
    ['one'],
    ['two'],
    ['full one'],
    ['full omit'],
    ['full two'],
  ]);
  assert.equal(first.dataInputs.length, 1);
  content.vectors[0].expected.stored = false;
  writeFileSync(file, JSON.stringify(content));
  const changed = vitestDeclarations(subject, text, { root });
  assert.deepEqual(changed.cases, first.cases);
  assert.notDeepEqual(changed.dataInputs, first.dataInputs);
  content.vectors.shift();
  writeFileSync(file, JSON.stringify(content));
  assert.equal(vitestDeclarations(subject, text, { root }).cases.length, first.cases.length - 2);
  symlinkSync(file, join(root, 'test/vectors/link.json'));
  assert.throws(
    () => vitestDeclarations(subject, text.replaceAll('a.json', 'link.json'), { root }),
    /symlink/,
  );
});

test('unknown functions, mutable declarations, unsupported predicates, paths, duplicate names and nonliteral registration control flow refuse', () => {
  for (const body of [
    "const x=(()=>{throw Error('executed')})(); for(const n of x) it(n,()=>{});",
    "let x=['a']; for(const n of x) it(n,()=>{});",
    "const x=x;it.each(x)('case %s',()=>{});",
    "for(const n of ['x']) if(n) it(n,()=>{});",
    "for(const n of ['x','x']) it(n,()=>{});",
    "it.each([{build:()=>{}}])('case %j',()=>{});",
    "it.each([[1],2])('case %j',()=>{});",
    "it.each([1])('case %d',()=>{});",
    "it.each([-0])('case %s',()=>{});",
    "const x=[{name:'a'}];for(const n of x.filter(v=>true)) it(n.name,()=>{});",
    "describe.each([1])('%i',async()=>it('a',()=>{}));",
    "for(const n of ['a']) it(n,()=>it('nested',()=>{}));",
    "import v from '../secret.json';for(const n of v) it(n,()=>{});",
  ])
    assert.throws(
      () => vitestCensus(subject, source(body)),
      /Unresolved|Unreviewed|Mutable|recursive|duplicate/,
    );
});

test('generated Node declarations expand the reviewed algorithm loops and still refuse nested, conditional and modified registrations', () => {
  const body =
    "import test from 'node:test';for(const alg of [-8,-7]) {test(`algorithm ${alg}`,()=>{});}test('ordinary',()=>{});";
  assert.deepEqual(
    generatedNodeCensus('test/x.test.mjs', body).map((c) => c.id),
    ['test/x.test.mjs::algorithm -8', 'test/x.test.mjs::algorithm -7', 'test/x.test.mjs::ordinary'],
  );
  assert.throws(() => directNodeCensus('test/x.test.mjs', body), /Unresolved|Dynamic/);
  for (const code of [
    "if(true)test('x',()=>{});",
    "test.skip('x',()=>{});",
    'for(const x of values())test(x,()=>{});',
    "test('a',t=>t.test('b',()=>{}));",
  ])
    assert.throws(
      () => generatedNodeCensus('test/x.test.mjs', "import test from 'node:test';" + code),
      /Unresolved/,
    );
});

test('all reviewed generated files retain 222 cases and the compact manifest preserves every row, contract, selection and blocked obligation', () => {
  const counts = generatedFiles.vitest.map(
    (file) => vitestStage(process.cwd(), file).expect.cases.length,
  );
  assert.deepEqual(counts, [8, 13, 12, 9, 23, 18, 15, 22, 27, 5, 7, 33, 17]);
  assert.equal(generatedNodeStage(process.cwd(), generatedFiles.node[0]).expect.cases.length, 13);
  const inventory = buildInventory(
    process.cwd(),
    JSON.parse(readFileSync('scripts/release-validation/policy.json')),
  );
  const manifest = compileManifest(process.cwd(), inventory),
    serialized = manifestSnapshot(manifest),
    restored = JSON.parse(serialized);
  assert.deepEqual(restored, manifest);
  assert.deepEqual(
    selectStages(restored, 'generated-tests'),
    selectStages(manifest, 'generated-tests'),
  );
  assert.equal(selectStages(restored, 'generated-tests').length, 14);
  assert.equal(
    selectStages(restored, 'general-tests').reduce((n, s) => n + s.expect.cases.length, 0),
    1772,
  );
  assert(manifest.rows.find((r) => r.path === 'test/accountDelivery.test.ts').stage);
  assert.throws(() => selectStages(restored, 'release'), /Unresolved/);
  // Reviewed Account registrations exceed 700 kB; retain bounded headroom for remaining adapters.
  assert(Buffer.byteLength(serialized) < 750000);
});

test('160 generated literal populations preserve tuple binding, loop order and suite scope independently of runtime collection', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: -100, max: 100 }), { minLength: 1, maxLength: 12 }),
      (ids) => {
        const text = source(
          `describe.each([2,3])('suite %i',n=>{for(const [id,label] of ${JSON.stringify(ids.map((i) => [i, 'v' + i]))}) it(n+':'+label,()=>{});});`,
        );
        const actual = names(vitestCensus(subject, text));
        assert.deepEqual(
          actual,
          [2, 3].flatMap((n) => ids.map((i) => ['suite ' + n, n + ':v' + i])),
        );
        const removed = ids.slice(1);
        if (removed.length)
          assert.equal(
            vitestCensus(
              subject,
              text.replace(
                JSON.stringify(ids.map((i) => [i, 'v' + i])),
                JSON.stringify(removed.map((i) => [i, 'v' + i])),
              ),
            ).length,
            actual.length - 2,
          );
      },
    ),
    { seed: 130921, numRuns: 160 },
  );
});

test('registration data metadata cannot extend unreviewed Node stages, and inherited-key filters are outside the finite subset', async () => {
  const { validateStage } = await import('../../scripts/release-validation/stage.mjs');
  const node = generatedNodeStage(process.cwd(), generatedFiles.node[0]);
  assert.throws(
    () =>
      validateStage({
        ...node,
        expect: {
          ...node.expect,
          dataInputs: [{ path: '../outside.json', sha256: '0'.repeat(64) }],
        },
      }),
    /registration data/i,
  );
  assert.throws(
    () =>
      vitestCensus(
        subject,
        source(`
    const rows=[{name:'own',expected:{toString:'literal'}},{name:'inherited',expected:{}}];
    for(const row of rows.filter(r=>'toString' in r.expected)) it(row.name,()=>{});
  `),
      ),
    /Unresolved data predicate/,
  );
});

test('160 generated boolean title branches preserve Node and Vitest identities without truthiness coercion or helper execution', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 12 }),
      fc.boolean(),
      (ids, reverse) => {
        const branches = reverse ? [true, false] : [false, true];
        const body = `for(const id of ${JSON.stringify(ids)}) for(const changed of ${JSON.stringify(branches)}) test((changed ? 'different ' : 'same ')+id,()=>{});`;
        const titles = ids.flatMap((id) =>
          branches.map((changed) => (changed ? 'different ' : 'same ') + id),
        );
        assert.deepEqual(
          generatedNodeCensus('test/a.test.mjs', "import test from 'node:test';" + body).map(
            (c) => c.id,
          ),
          titles.map((t) => 'test/a.test.mjs::' + t),
        );
        assert.deepEqual(
          names(vitestCensus(subject, "import {test} from 'vitest';" + body)),
          titles.map((t) => [t]),
        );
      },
    ),
    { seed: 130923, numRuns: 160 },
  );
  for (const guard of [
    '0',
    '1',
    "''",
    "'false'",
    'null',
    'undefined',
    '[]',
    '{}',
    '(()=>true)',
    'unknown()',
  ]) {
    const body = `test(${guard} ? 'yes' : 'no',()=>{});`;
    assert.throws(
      () => generatedNodeCensus('test/a.test.mjs', "import test from 'node:test';" + body),
      /Unresolved/,
    );
    assert.throws(() => vitestCensus(subject, "import {test} from 'vitest';" + body), /Unresolved/);
  }
  for (const body of [
    "test(true ? unknown() : 'unused',()=>{});",
    "for(const b of [false,true]) test(b ? 'same' : 'same',()=>{});",
    "if(true)test('conditional registration',()=>{});",
  ]) {
    assert.throws(
      () => generatedNodeCensus('test/a.test.mjs', "import test from 'node:test';" + body),
      /Unresolved|duplicate/,
    );
    assert.throws(
      () => vitestCensus(subject, "import {test} from 'vitest';" + body),
      /Unresolved|duplicate/,
    );
  }
  assert.deepEqual(
    names(
      vitestCensus(
        subject,
        "import {test} from 'vitest';test(false ? unknown() : 'known',()=>{});",
      ),
    ),
    [['known']],
  );
});

test('160 generated boolean concatenations preserve Node and Vitest titles while coercible objects and boolean arithmetic refuse', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 12 }),
      fc.boolean(),
      (ids, reverse) => {
        const flags = reverse ? [true, false] : [false, true];
        const body = `for(const id of ${JSON.stringify(ids)}) for(const flag of ${JSON.stringify(flags)}) {
          test('right '+id+':'+flag,()=>{});
          test(flag+':left '+id,()=>{});
          test('sum '+(id+1)+':'+flag,()=>{});
        }`;
        const titles = ids.flatMap((id) =>
          flags.flatMap((flag) => [
            `right ${id}:${flag}`,
            `${flag}:left ${id}`,
            `sum ${id + 1}:${flag}`,
          ]),
        );
        assert.deepEqual(
          generatedNodeCensus('test/a.test.mjs', "import test from 'node:test';" + body).map(
            (c) => c.id,
          ),
          titles.map((title) => 'test/a.test.mjs::' + title),
        );
        assert.deepEqual(
          names(vitestCensus(subject, "import {test} from 'vitest';" + body)),
          titles.map((title) => [title]),
        );
      },
    ),
    { seed: 140901, numRuns: 160 },
  );
  for (const value of [
    'null',
    'undefined',
    '[]',
    '{}',
    '()=>true',
    'unknown()',
    '1e400',
    '1n',
    'true+1',
    '1+false',
    'true+false',
  ])
    for (const expression of [`'title '+(${value})`, `(${value})+' title'`]) {
      const body = `test(${expression},()=>{});`;
      assert.throws(
        () => generatedNodeCensus('test/a.test.mjs', "import test from 'node:test';" + body),
        /Unresolved|Nonfinite/,
      );
      assert.throws(
        () => vitestCensus(subject, "import {test} from 'vitest';" + body),
        /Unresolved|Nonfinite/,
      );
    }
  assert.throws(
    () =>
      generatedNodeCensus(
        'test/a.test.mjs',
        "import test from 'node:test';for(const flag of [false,false]) test('flag '+flag,()=>{});",
      ),
    /duplicate/,
  );
});

test('160 finite numeric comparisons retain exact signed titles without coercion or evaluating unused branches', () => {
  fc.assert(
    fc.property(fc.integer({ min: -100000, max: 100000 }), (delta) => {
      const source = `import test from 'node:test';const delta=${delta};test(\`edge \${delta >= 0 ? '+' : ''}\${delta}\`,()=>{});`;
      assert.deepEqual(generatedNodeCensus('subject.test.mjs', source), [
        { id: 'subject.test.mjs::edge ' + (delta >= 0 ? '+' : '') + delta, outcome: 'pass' },
      ]);
    }),
    { seed: 130924, numRuns: 160 },
  );
  for (const value of ['"0"', 'null', 'true', '[]', '()=>0', '1e400', 'unknown()']) {
    assert.throws(
      () =>
        generatedNodeCensus(
          'subject.test.mjs',
          `import test from 'node:test';const x=${value};test(x >= 0 ? 'yes' : 'no',()=>{});`,
        ),
      /Unresolved|Nonfinite/,
    );
  }
  assert.deepEqual(
    generatedNodeCensus(
      'subject.test.mjs',
      "import test from 'node:test';test(1 >= 0 ? 'yes' : unknown(),()=>{});",
    ),
    [{ id: 'subject.test.mjs::yes', outcome: 'pass' }],
  );
  assert.throws(
    () =>
      generatedNodeCensus(
        'subject.test.mjs',
        "import test from 'node:test';if(1 >= 0) test('conditional registration',()=>{});",
      ),
    /Unresolved/,
  );
});
