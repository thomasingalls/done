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

test('D8 requires live claim evidence and cannot relabel it as inherited migration scope', () => {
  const evidence = [];
  for (const obligation of [
    'native-claim-owner',
    'initial-custody-authentication',
    'retained-import-cleanup',
    'shrinking-claim-histories',
  ]) {
    const o = baseline(),
      r = o.document.constructions.find((r) => r.id === 'local-claim-progress');
    r.requirements = r.requirements.filter((x) => x !== obligation);
    assert(
      checkConstructionRegistry(root, o).failures.some(
        (f) => f.includes('missing evidence obligation') && f.includes(obligation),
      ),
    );
    evidence.push({ obligation, caught: true });
  }
  for (const [name, change, expected] of [
    [
      'hide live claim',
      (o) =>
        Object.assign(
          o.document.constructions.find((r) => r.id === 'local-claim-progress'),
          {
            status: 'inherited',
            phase: 'Local',
            scope: 'outside-account-acceptance',
            reason: 'migration',
            mapEntries: [],
            vectorCases: [],
          },
        ),
      'invalid inherited scope',
    ],
    [
      'historical evidence',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'inherited-local-clear').evidencePins = []),
      'incomplete inherited evidence',
    ],
    [
      'native barrier',
      (o) => {
        const r = o.document.constructions.find((r) => r.id === 'inherited-preactive-import');
        r.requirements = r.requirements.filter((x) => x !== 'native-exclusion-barriers');
      },
      'missing inherited obligation',
    ],
    [
      'stale evidence',
      (o) =>
        (o.document.constructions.find(
          (r) => r.id === 'inherited-legacy-observation',
        ).evidencePins[0].sha256 = '0'.repeat(64)),
      'stale inherited evidence',
    ],
    [
      'primitive erasure',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'inherited-cleanup-fingerprints').roles = [
          'name',
        ]),
      'inherited primitive roles changed',
    ],
    [
      'noncrypto disguise',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'inherited-cleanup-fingerprints').status =
          'excluded'),
      'invalid non-cryptographic exclusion',
    ],
  ]) {
    const o = baseline();
    change(o);
    assert(
      checkConstructionRegistry(root, o).failures.some((f) => f.includes(expected)),
      name,
    );
    evidence.push({ name, caught: true });
  }
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'local-provenance-registry-controls.json'),
      JSON.stringify(evidence, null, 2) + '\n',
    );
  }
});

test('D7 cannot discard native startup, genesis scope, shrinking or inherited cipher evidence', () => {
  const evidence = [];
  for (const obligation of [
    'native-checkpoint-owner',
    'genesis-scope-disposition',
    'shrinking-replay-histories',
    'inherited-byte-agreement',
    'encoded-field-omissions',
  ]) {
    const o = baseline(),
      r = o.document.constructions.find((r) => r.id === 'genesis-checkpoint-seal');
    r.requirements = r.requirements.filter((x) => x !== obligation);
    assert(
      checkConstructionRegistry(root, o).failures.some(
        (f) => f.includes('missing evidence obligation') && f.includes(obligation),
      ),
    );
    evidence.push({ obligation, caught: true });
  }
  const o = baseline(),
    c = o.document.additionalCorpora.find((c) => c.phase === 'D7'),
    v = JSON.parse(read(c.vectorFile));
  v.vectors.find((v) => v.id === 'checkpoint-seal-genesis').encodedBindingControls = [];
  const changed = JSON.stringify(v);
  c.vectorSha256 = digest(changed);
  o.read = (p) => (p === c.vectorFile ? changed : read(p));
  assert(checkConstructionRegistry(root, o).failures.some((f) => f.includes('omission corpus')));
  evidence.push({ obligation: 'omission vectors', caught: true, aggregatePinUpdated: true });
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'checkpoint-registry-controls.json'),
      JSON.stringify(evidence, null, 2) + '\n',
    );
  }
});

test('D6 custody cannot drop correspondence, parser repair, native comparison or inherited byte obligations', () => {
  const controls = [
    ['native owner', 'custody-factor-v1', 'native-custody-owner'],
    ['inherited envelope', 'custody-generation-envelope', 'inherited-byte-agreement'],
    ['correspondence', 'custody-key-correspondence', 'credential-correspondence'],
    ['private format', 'custody-credential-v2', 'private-format-cleanup'],
    ['state counterexample', 'custody-metadata-v2', 'state-counterexample'],
    ['native comparison', 'custody-metadata-v2', 'native-mac-comparison'],
  ];
  const evidence = [];
  for (const [name, id, obligation] of controls) {
    const o = baseline(),
      r = o.document.constructions.find((r) => r.id === id);
    r.requirements = r.requirements.filter((v) => v !== obligation);
    assert(
      checkConstructionRegistry(root, o).failures.some(
        (f) => f.includes('missing evidence obligation') && f.includes(obligation),
      ),
    );
    evidence.push({ name, caught: true });
  }
  for (const field of ['negatives', 'encodedBindingControls']) {
    const o = baseline(),
      c = o.document.additionalCorpora.find((c) => c.phase === 'D6'),
      v = JSON.parse(read(c.vectorFile));
    v.vectors.find((v) => v.id === 'custody-metadata-protected')[field] = [];
    const changed = JSON.stringify(v);
    c.vectorSha256 = digest(changed);
    o.read = (p) => (p === c.vectorFile ? changed : read(p));
    const result = checkConstructionRegistry(root, o);
    assert(
      result.failures.some((f) =>
        f.includes(
          field === 'negatives' ? 'missing vector/negative corpus' : 'missing MAC/omission corpus',
        ),
      ),
    );
    assert(!result.failures.some((f) => f.includes('stale additional vector file pin')));
    evidence.push({ name: field, caught: true, aggregatePinUpdated: true });
  }
  const o = baseline();
  o.document.constructions.find((r) => r.id === 'custody-metadata-v2').mapEntries = [
    'private-local-custody-open',
  ];
  assert(
    checkConstructionRegistry(root, o).failures.some((f) =>
      f.includes('missing MAC custody authority entry'),
    ),
  );
  evidence.push({ name: 'metadata MAC owner', caught: true });
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'local-custody-registry-controls.json'),
      JSON.stringify({ controls: evidence.length, evidence }, null, 2) + '\n',
    );
  }
});

test('D5 bridges cannot lose native owners, inherited agreement, primitive roles or AEAD omission evidence', () => {
  const controls = [
    [
      'native owner',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'journal-carrier-aead').requirements = [
          'runtime-bytes',
          'input-mutations',
        ]),
      'missing evidence obligation',
    ],
    [
      'inherited agreement',
      (o) => {
        const r = o.document.constructions.find((r) => r.id === 'store-record-aead');
        r.requirements = r.requirements.filter((v) => v !== 'inherited-byte-agreement');
      },
      'missing evidence obligation',
    ],
    [
      'AEAD entry',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'store-record-aead').mapEntries = [
          'private-store-key',
        ]),
      'missing AEAD authority entry',
    ],
    [
      'digest role',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'store-name-digest').roles = ['predicate']),
      'digest vector misclassified',
    ],
    [
      'KDF source',
      (o) => (o.document.constructions.find((r) => r.id === 'journal-key').sourceSites = []),
      'source-site census changed',
    ],
    [
      'owner entrypoint',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'journal-carrier-aead').entryPoints[0].name =
          'missingOwner'),
      'missing entrypoint',
    ],
  ];
  const evidence = [];
  for (const [name, change, expected] of controls) {
    const o = baseline();
    change(o);
    assert(
      checkConstructionRegistry(root, o).failures.some((f) => f.includes(expected)),
      name,
    );
    evidence.push({ name, caught: true, expected });
  }
  for (const field of ['negatives', 'encodedBindingControls']) {
    const o = baseline(),
      c = o.document.additionalCorpora.find((c) => c.phase === 'D5'),
      v = JSON.parse(read(c.vectorFile));
    v.vectors.find((v) => v.id === 'journal-carrier-1')[field] = [];
    const changed = JSON.stringify(v);
    c.vectorSha256 = digest(changed);
    o.read = (p) => (p === c.vectorFile ? changed : read(p));
    const result = checkConstructionRegistry(root, o);
    assert(
      result.failures.some((f) =>
        f.includes(
          field === 'negatives'
            ? 'missing vector/negative corpus'
            : 'missing store/journal omission corpus',
        ),
      ),
    );
    assert(!result.failures.some((f) => f.includes('stale additional vector file pin')));
    evidence.push({ name: field, caught: true, aggregatePinUpdated: true });
  }
  if (process.env.ACCOUNT_REPORT_DIR) {
    mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'store-registry-controls.json'),
      JSON.stringify({ controls: evidence.length, evidence }, null, 2) + '\n',
    );
  }
});

test('registered Account source sites, exact homes and evidence join the existing map without closing unfinished groups', () => {
  const result = checkConstructionRegistry(root);
  assert.deepEqual(result.failures, []);
  assert.equal(result.specified, 78);
  assert.equal(result.open, 3);
  assert.deepEqual(
    baseline()
      .document.constructions.filter((r) => r.status === 'open')
      .map((r) => r.id),
    ['enrollment-preparation', 'admission-successor', 'enrollment-ceremony'],
  );
  assert.equal(result.excluded, 1);
  assert.equal(result.inherited, 4);
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
      (o) =>
        Object.assign(
          o.document.constructions.find((r) => r.status === 'inherited'),
          { status: 'open', blocker: null, next: 'Requalify changed owner' },
        ),
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

test('transport coverage refuses missing bytes, misclassified carriers/hashes and service authority over content', () => {
  const controls = [
    [
      'missing C corpus',
      (o) => {
        o.document.additionalCorpora = o.document.additionalCorpora.filter((c) => c.phase !== 'C');
      },
      'specified phase/blocker mismatch',
    ],
    [
      'duplicate C corpus',
      (o) => {
        o.document.additionalCorpora.push(
          o.document.additionalCorpora.find((c) => c.phase === 'C'),
        );
      },
      'unknown/duplicate additional corpus phase',
    ],
    [
      'carrier role',
      (o) => {
        o.document.constructions.find((r) => r.id === 'transport-response-wire').roles = [
          'predicate',
        ];
      },
      'carrier vector misclassified',
    ],
    [
      'digest role',
      (o) => {
        o.document.constructions.find((r) => r.id === 'transport-request-hash').roles = [
          'predicate',
        ];
      },
      'digest vector misclassified',
    ],
    [
      'service guard',
      (o) => {
        o.entries.get('private-transport-acceptance').guards = 'content';
      },
      'signer/authority guard mismatch',
    ],
    [
      'read namespace signer',
      (o) => {
        o.document.constructions.find((r) => r.id === 'transport-read-v2-signature').signer =
          'transport-acceptance';
      },
      'vector signer mismatch',
    ],
    [
      'exact service byte home',
      (o) => {
        o.document.constructions.find((r) => r.id === 'transport-service-witness').homePins = [];
      },
      'incomplete specified construction',
    ],
    [
      'unlabelled request hash',
      (o) => {
        o.document.constructions = o.document.constructions.filter(
          (r) => r.id !== 'transport-request-hash',
        );
      },
      'orphan executed vector',
    ],
  ];
  const evidence = [];
  for (const [name, change, expected] of controls) {
    const o = baseline();
    change(o);
    assert(
      checkConstructionRegistry(root, o).failures.some((f) => f.includes(expected)),
      name,
    );
    evidence.push({ name, expected, caught: true });
  }
  for (const field of ['negatives', 'encodedBindingControls']) {
    const o = baseline(),
      corpus = o.document.additionalCorpora.find((c) => c.phase === 'C');
    const path = corpus.vectorFile,
      vectors = JSON.parse(read(path));
    vectors.vectors.find((v) => v.id === 'transport-service-witness')[field] = [];
    const changed = JSON.stringify(vectors);
    corpus.vectorSha256 = digest(changed);
    o.read = (p) => (p === path ? changed : read(p));
    const expected =
      field === 'negatives'
        ? 'missing vector/negative corpus'
        : 'missing signature/omission corpus';
    const result = checkConstructionRegistry(root, o);
    assert(result.failures.some((f) => f.includes(expected)));
    assert(!result.failures.some((f) => f.includes('stale additional vector file pin')));
    evidence.push({ name: field, expected, caught: true, aggregatePinUpdated: true });
  }
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'transport-registry-controls.json'),
      JSON.stringify({ controls: evidence.length, evidence }, null, 2) + '\n',
    );
});

test('D1 service custody cannot drop its corpus, owner, export predicate, AEAD discipline edge or negatives', () => {
  const controls = [
    [
      'D1 corpus',
      (o) =>
        (o.document.additionalCorpora = o.document.additionalCorpora.filter(
          (c) => c.phase !== 'D1',
        )),
      'specified phase/blocker mismatch',
    ],
    [
      'duplicate D1',
      (o) =>
        o.document.additionalCorpora.push(
          o.document.additionalCorpora.find((c) => c.phase === 'D1'),
        ),
      'unknown/duplicate additional corpus phase',
    ],
    [
      'owner export',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'service-root-custody').entryPoints[0].name =
          'MissingOwner'),
      'missing entrypoint',
    ],
    [
      'raw export predicate',
      (o) =>
        (o.document.constructions = o.document.constructions.filter(
          (r) => r.id !== 'service-key-exports',
        )),
      'orphan executed vector',
    ],
    [
      'AEAD authority edge',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'service-root-custody').mapEntries = [
          'private-service-custody-input',
        ]),
      'missing AEAD authority entry',
    ],
    [
      'carrier role',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'service-acceptance-carrier').roles = [
          'predicate',
        ]),
      'carrier vector misclassified',
    ],
  ];
  const evidence = [];
  for (const [name, change, expected] of controls) {
    const o = baseline();
    change(o);
    assert(
      checkConstructionRegistry(root, o).failures.some((f) => f.includes(expected)),
      name,
    );
    evidence.push({ name, expected, caught: true });
  }
  const o = baseline(),
    corpus = o.document.additionalCorpora.find((c) => c.phase === 'D1'),
    path = corpus.vectorFile,
    vectors = JSON.parse(read(path));
  vectors.vectors.find((v) => v.id === 'service-root-seal').negatives = [];
  const changed = JSON.stringify(vectors);
  corpus.vectorSha256 = digest(changed);
  o.read = (p) => (p === path ? changed : read(p));
  const result = checkConstructionRegistry(root, o);
  assert(result.failures.some((f) => f.includes('missing vector/negative corpus')));
  assert(!result.failures.some((f) => f.includes('stale additional vector file pin')));
  evidence.push({ name: 'negative corpus', caught: true, aggregatePinUpdated: true });
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'service-custody-registry-controls.json'),
      JSON.stringify({ controls: evidence.length, evidence }, null, 2) + '\n',
    );
});

test('D2 promotion cannot drop its MAC edge, role, version cases, omission evidence or identity source', () => {
  const controls = [
    [
      'D2 corpus',
      (o) =>
        (o.document.additionalCorpora = o.document.additionalCorpora.filter(
          (c) => c.phase !== 'D2',
        )),
      'specified phase/blocker mismatch',
    ],
    [
      'MAC edge',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'local-promotion-mac').mapEntries = [
          'private-promotion-context',
        ]),
      'missing MAC custody authority entry',
    ],
    [
      'MAC guard',
      (o) => (o.entries.get('private-promotion-authentication').guards = 'availability'),
      'missing MAC custody authority entry',
    ],
    [
      'MAC role',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'local-promotion-mac').roles = [
          'kdf',
          'carrier',
        ]),
      'primitive vector misclassified',
    ],
    [
      'MAC omission obligation',
      (o) =>
        o.document.constructions.find((r) => r.id === 'local-promotion-mac').requirements.pop(),
      'missing evidence obligation',
    ],
    [
      'identity source',
      (o) =>
        o.document.constructions
          .find((r) => r.id === 'local-promotion-identities')
          .sourceSites.pop(),
      'source-site census changed',
    ],
    [
      'version case',
      (o) =>
        o.document.constructions.find((r) => r.id === 'local-promotion-mac').vectorCases.shift(),
      'orphan executed vector',
    ],
  ];
  const evidence = [];
  for (const [name, change, expected] of controls) {
    const o = baseline();
    change(o);
    assert(
      checkConstructionRegistry(root, o).failures.some((f) => f.includes(expected)),
      name,
    );
    evidence.push({ name, expected, caught: true });
  }
  for (const field of ['negatives', 'encodedBindingControls']) {
    const o = baseline(),
      corpus = o.document.additionalCorpora.find((c) => c.phase === 'D2'),
      path = corpus.vectorFile,
      vectors = JSON.parse(read(path));
    vectors.vectors.find((v) => v.id === 'promotion-account-receiving')[field] = [];
    const changed = JSON.stringify(vectors);
    corpus.vectorSha256 = digest(changed);
    o.read = (p) => (p === path ? changed : read(p));
    const result = checkConstructionRegistry(root, o),
      expected =
        field === 'negatives' ? 'missing vector/negative corpus' : 'missing MAC/omission corpus';
    assert(result.failures.some((f) => f.includes(expected)));
    assert(!result.failures.some((f) => f.includes('stale additional vector file pin')));
    evidence.push({ name: field, caught: true, aggregatePinUpdated: true });
  }
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'promotion-registry-controls.json'),
      JSON.stringify({ controls: evidence.length, evidence }, null, 2) + '\n',
    );
});

test('D3 ledger byte coverage cannot discard canonical negatives or its counter witness dependency', () => {
  const controls = [
    [
      'D3 corpus',
      (o) =>
        (o.document.additionalCorpora = o.document.additionalCorpora.filter(
          (c) => c.phase !== 'D3',
        )),
      'specified phase/blocker mismatch',
    ],
    [
      'witness edge',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'account-ledger-chain').mapEntries = [
          'private-account-capsule-input',
        ]),
      'missing counter witness dependency',
    ],
    [
      'witness obligation',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'account-ledger-chain').requirements = [
          'runtime-bytes',
          'input-mutations',
        ]),
      'missing evidence obligation',
    ],
    [
      'canonicality obligation',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'account-source-capsule').requirements = [
          'runtime-bytes',
          'input-mutations',
          'encoded-field-omissions',
        ]),
      'missing evidence obligation',
    ],
    [
      'unlabelled receipt hash',
      (o) =>
        (o.document.constructions = o.document.constructions.filter(
          (r) => r.id !== 'account-inbound-baseline',
        )),
      'orphan executed vector',
    ],
    [
      'nested source site',
      (o) =>
        o.document.constructions.find((r) => r.id === 'account-inbound-capsule').sourceSites.pop(),
      'source-site census changed',
    ],
    [
      'chain role',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'account-ledger-chain').roles = ['carrier']),
      'digest vector misclassified',
    ],
  ];
  const evidence = [];
  for (const [name, change, expected] of controls) {
    const o = baseline();
    change(o);
    assert(
      checkConstructionRegistry(root, o).failures.some((f) => f.includes(expected)),
      name,
    );
    evidence.push({ name, caught: true, expected });
  }
  for (const field of ['negatives', 'encodedBindingControls']) {
    const o = baseline(),
      corpus = o.document.additionalCorpora.find((c) => c.phase === 'D3'),
      path = corpus.vectorFile,
      v = JSON.parse(read(path));
    v.vectors.find((v) => v.id === 'inbound-received')[field] = [];
    const changed = JSON.stringify(v);
    corpus.vectorSha256 = digest(changed);
    o.read = (p) => (p === path ? changed : read(p));
    const result = checkConstructionRegistry(root, o);
    assert(
      result.failures.some((f) =>
        f.includes(
          field === 'negatives'
            ? 'missing vector/negative corpus'
            : 'missing carrier omission corpus',
        ),
      ),
    );
    assert(!result.failures.some((f) => f.includes('stale additional vector file pin')));
    evidence.push({ name: field, caught: true, aggregatePinUpdated: true });
  }
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'ledger-registry-controls.json'),
      JSON.stringify({ controls: evidence.length, evidence }, null, 2) + '\n',
    );
});

test('D4 metadata cannot drop its scoped MAC owner, native coupling or negative corpus', () => {
  const controls = [
    [
      'D4 corpus',
      (o) =>
        (o.document.additionalCorpora = o.document.additionalCorpora.filter(
          (c) => c.phase !== 'D4',
        )),
      'specified phase/blocker mismatch',
    ],
    [
      'MAC owner',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'content-counter-v2').mapEntries = [
          'private-content-counter-order',
          'private-account-ledger-completeness',
        ]),
      'missing MAC custody authority entry',
    ],
    [
      'ledger edge',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'content-counter-v2').mapEntries = [
          'private-content-metadata',
          'private-content-counter-order',
        ]),
      'missing native counter/ledger dependency',
    ],
    [
      'native obligation',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'content-metadata-key').requirements = [
          'runtime-bytes',
          'input-mutations',
        ]),
      'missing evidence obligation',
    ],
    [
      'parser obligation',
      (o) => {
        const r = o.document.constructions.find((r) => r.id === 'content-counter-v1');
        r.requirements = r.requirements.filter((s) => s !== 'structured-clone-negatives');
      },
      'missing evidence obligation',
    ],
    [
      'witness source',
      (o) =>
        o.document.constructions
          .find((r) => r.id === 'content-initialization-witness')
          .sourceSites.pop(),
      'source-site census changed',
    ],
    [
      'KDF role',
      (o) =>
        (o.document.constructions.find((r) => r.id === 'content-metadata-key').roles = [
          'predicate',
        ]),
      'primitive vector misclassified',
    ],
  ];
  const evidence = [];
  for (const [name, change, expected] of controls) {
    const o = baseline();
    change(o);
    assert(
      checkConstructionRegistry(root, o).failures.some((f) => f.includes(expected)),
      name,
    );
    evidence.push({ name, caught: true, expected });
  }
  for (const field of ['negatives', 'encodedBindingControls']) {
    const o = baseline(),
      c = o.document.additionalCorpora.find((c) => c.phase === 'D4'),
      path = c.vectorFile,
      v = JSON.parse(read(path));
    v.vectors.find((v) => v.id === 'content-counter-v2-ledger')[field] = [];
    const changed = JSON.stringify(v);
    c.vectorSha256 = digest(changed);
    o.read = (p) => (p === path ? changed : read(p));
    const result = checkConstructionRegistry(root, o);
    assert(
      result.failures.some((f) =>
        f.includes(
          field === 'negatives' ? 'missing vector/negative corpus' : 'missing MAC/omission corpus',
        ),
      ),
    );
    assert(!result.failures.some((f) => f.includes('stale additional vector file pin')));
    evidence.push({ name: field, caught: true, aggregatePinUpdated: true });
  }
  if (process.env.ACCOUNT_REPORT_DIR)
    writeFileSync(
      join(process.env.ACCOUNT_REPORT_DIR, 'counter-registry-controls.json'),
      JSON.stringify({ controls: evidence.length, evidence }, null, 2) + '\n',
    );
});
