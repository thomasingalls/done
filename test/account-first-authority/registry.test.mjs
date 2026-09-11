import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkConstructionRegistry,
  mapEntries,
  digest,
} from '../../scripts/account-first-authority/registry.mjs';
const root = process.cwd(),
  read = (p) => readFileSync(join(root, p), 'utf8');
const baseline = () => ({
  document: JSON.parse(read('docs/account-crypto/constructions.json')),
  inventory: JSON.parse(read('docs/account-crypto/census.json')),
  entries: mapEntries(read('docs/review/remediation/S0-2/authority-map.md')),
});

test('registered Account source sites, exact homes and evidence join the existing map without closing unfinished groups', () => {
  const result = checkConstructionRegistry(root);
  assert.deepEqual(result.failures, []);
  assert.equal(result.specified, 23);
  assert.equal(result.open, 13);
  assert.equal(result.excluded, 1);
});

test('registration omission controls fail for the missing obligation, not just a stale aggregate hash', () => {
  const controls = [
    ['source construction', (o) => o.document.constructions.shift(), 'unregistered source label'],
    [
      'unlabelled digest construction',
      (o) =>
        (o.document.constructions = o.document.constructions.filter(
          (r) => r.id !== 'request-digest',
        )),
      'orphan executed vector',
    ],
    [
      'source occurrence',
      (o) => o.document.constructions[0].sourceSites.pop(),
      'source-site census changed',
    ],
    [
      'exported entrypoint',
      (o) => (o.document.constructions[0].entryPoints[0].name = 'missingExport'),
      'missing entrypoint',
    ],
    [
      'map edge',
      (o) => (o.document.constructions[0].mapEntries = ['missing-map-entry']),
      'dangling/unresolved map dependency',
    ],
    [
      'map home association',
      (o) => (o.entries.get('private-creating-device').pins = []),
      'byte home not pinned',
    ],
    [
      'byte home',
      (o) => (o.document.constructions[0].homePins[0].hash = '000000000000'),
      'stale/missing byte home',
    ],
    ['field schema', (o) => (o.document.schemaSha256 = '00'.repeat(32)), 'stale field schema pin'],
    [
      'required negatives',
      (o) => (o.document.constructions[0].requirements = []),
      'missing evidence obligation',
    ],
    ['tests', (o) => (o.document.constructions[0].tests = []), 'incomplete specified construction'],
    [
      'unknown status',
      (o) => (o.document.constructions[0].status = 'silently-complete'),
      'unknown status',
    ],
    [
      'signer guard',
      (o) => (o.entries.get('private-creating-device').guards = 'availability'),
      'signer/authority guard mismatch',
    ],
    [
      'signature classification',
      (o) => (o.document.constructions[0].roles = ['carrier']),
      'signature vector misclassified',
    ],
    [
      'unreviewed primitive change',
      (o) => (o.inventory.sources[0].sha256 = '00'.repeat(32)),
      'Runtime census changed',
    ],
    [
      'new runtime domain',
      (o) =>
        o.inventory.domains.push({
          label: 'done/omitted-construction/v1',
          kind: 'literal',
          sites: [{ path: 'account-protocol/admission.ts', line: 1 }],
        }),
      'unregistered source label',
    ],
    [
      'remaining blocker',
      (o) => (o.document.constructions.find((r) => r.status === 'open').blocker = null),
      'unfinished record lacks bounded disposition',
    ],
    [
      'vector reference',
      (o) => (o.document.constructions[0].vectorCases = ['missing-case']),
      'missing vector/negative corpus',
    ],
  ];
  const evidence = [];
  for (const [name, mutate, expected] of controls) {
    const o = baseline();
    mutate(o);
    const result = checkConstructionRegistry(root, o);
    assert.ok(
      result.failures.some((f) => f.includes(expected)),
      name + ': ' + result.failures.join('\n'),
    );
    evidence.push({ name, expected, caught: true });
  }
  for (const field of ['negatives', 'encodedBindingControls']) {
    const o = baseline(),
      path = o.document.vectorFile,
      vectors = JSON.parse(read(path));
    vectors.vectors[0][field] = [];
    const changed = JSON.stringify(vectors);
    o.document.vectorSha256 = digest(changed);
    o.read = (p) => (p === path ? changed : read(p));
    const result = checkConstructionRegistry(root, o),
      expected =
        field === 'negatives'
          ? 'missing vector/negative corpus'
          : 'missing signature/omission corpus';
    assert.ok(result.failures.some((f) => f.includes(expected)));
    assert.ok(!result.failures.some((f) => f.includes('stale vector file pin')));
    evidence.push({ name: field, expected, caught: true, aggregatePinUpdated: true });
  }
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'registry-controls.json'),
      JSON.stringify({ controls: evidence.length, evidence }, null, 2) + '\n',
    );
  }
});

test('recovery corpus cannot lose its phase, primitive role, negative corpus or factor authority under updated hashes', () => {
  const controls = [
    [
      'corpus',
      (o) => {
        o.document.additionalCorpora = [];
      },
      'specified phase/blocker mismatch',
    ],
    [
      'corpus pin',
      (o) => {
        o.document.additionalCorpora[0].vectorSha256 = '00'.repeat(32);
      },
      'stale additional vector file pin',
    ],
    [
      'duplicate phase',
      (o) => {
        o.document.additionalCorpora.push(o.document.additionalCorpora[0]);
      },
      'unknown/duplicate additional corpus phase',
    ],
    [
      'primitive role',
      (o) => {
        o.document.constructions.find((r) => r.id === 'recovery-factor-seal').roles = ['predicate'];
      },
      'primitive vector misclassified',
    ],
    [
      'factor guard',
      (o) => {
        o.entries.get('private-recovery-possession').guards = 'availability';
      },
      'signer/authority guard mismatch',
    ],
  ];
  for (const [name, change, expected] of controls) {
    const o = baseline();
    change(o);
    assert(
      checkConstructionRegistry(root, o).failures.some((f) => f.includes(expected)),
      name,
    );
  }
  for (const field of ['negatives', 'encodedBindingControls']) {
    const o = baseline(),
      corpus = o.document.additionalCorpora[0],
      path = corpus.vectorFile;
    const value = JSON.parse(read(path));
    value.vectors.find((v) => v.kind === 'signature')[field] = [];
    const changed = JSON.stringify(value);
    corpus.vectorSha256 = digest(changed);
    o.read = (p) => (p === path ? changed : read(p));
    const result = checkConstructionRegistry(root, o);
    assert(
      result.failures.some((f) =>
        f.includes(
          field === 'negatives'
            ? 'missing vector/negative corpus'
            : 'missing signature/omission corpus',
        ),
      ),
    );
    assert(!result.failures.some((f) => f.includes('stale additional vector file pin')));
  }
});
