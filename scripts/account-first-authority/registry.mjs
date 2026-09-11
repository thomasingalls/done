import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { census, checkRegistry, checkSnapshot } from '../account-crypto-prep/census.mjs';
export const digest = (text) => createHash('sha256').update(text).digest('hex');
export function section(text, number) {
  const lines = text.split('\n'),
    escaped = number.replaceAll('.', '\\.');
  const start = lines.findIndex((l) => new RegExp('^#{2,3} ' + escaped + '[. ]').test(l));
  if (start < 0) return null;
  const level = /^(#+)/.exec(lines[start])[1].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{2,3}) /.exec(lines[i]);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}
export function mapEntries(text) {
  return new Map(
    [...text.matchAll(/^```authority\n([\s\S]*?)\n```/gm)].map(([, body]) => {
      const value = (k) => new RegExp('^' + k + ': (.+)$', 'm').exec(body)?.[1];
      return [
        value('entry'),
        {
          id: value('entry'),
          kind: value('kind'),
          guards: value('guards'),
          status: value('status'),
          pins: [...body.matchAll(/^pin: (\S+) §(\S+) ([0-9a-f]{12})$/gm)].map(
            ([, path, section, hash]) => ({ path, section, hash }),
          ),
        },
      ];
    }),
  );
}
export function checkConstructionRegistry(root, options = {}) {
  const read = options.read ?? ((p) => readFileSync(join(root, p), 'utf8'));
  const document = options.document ?? JSON.parse(read('docs/account-crypto/constructions.json'));
  const current = options.inventory ?? census(root),
    saved = JSON.parse(read('docs/account-crypto/census.json'));
  const groups = JSON.parse(read('docs/account-crypto/registry.json'));
  const failures = [...checkSnapshot(current, saved), ...checkRegistry(current, groups)],
    fail = (m) => failures.push('Account constructions: ' + m);
  const entries =
    options.entries ?? mapEntries(read('docs/review/remediation/S0-2/authority-map.md'));
  const vectors = JSON.parse(read(document.vectorFile));
  const additional = document.additionalCorpora ?? [];
  const executed = vectors.vectors.map((v) => ({ ...v, phase: 'A' }));
  const corpusPhases = new Set(['A']);
  for (const corpus of additional) {
    if (
      !['B', 'C', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'].includes(corpus.phase) ||
      corpusPhases.has(corpus.phase)
    )
      fail('unknown/duplicate additional corpus phase');
    corpusPhases.add(corpus.phase);
    if (digest(read(corpus.vectorFile)) !== corpus.vectorSha256)
      fail('stale additional vector file pin');
    const value = JSON.parse(read(corpus.vectorFile));
    if (value.v !== 1 || !value.vectors?.length) fail('invalid additional vector corpus');
    executed.push(...value.vectors.map((v) => ({ ...v, phase: corpus.phase })));
  }
  if (document.v !== 1) fail('unsupported registry version');
  if (document.schemaSha256 !== digest(read('docs/account-crypto/first-authority.json')))
    fail('stale field schema pin');
  if (document.vectorSha256 !== digest(read(document.vectorFile))) fail('stale vector file pin');
  if (vectors.schemaSha256 !== document.schemaSha256) fail('vectors use a different field schema');
  const records = document.constructions,
    ids = new Set(),
    owners = new Map(),
    vectorOwners = new Map();
  for (const r of records) {
    if (ids.has(r.id)) fail('duplicate construction ' + r.id);
    ids.add(r.id);
    if (!['specified', 'open', 'excluded', 'inherited'].includes(r.status))
      fail('unknown status ' + r.id);
    if (
      ![
        'A',
        'B',
        'C',
        'D',
        'D1',
        'D2',
        'D3',
        'D4',
        'D5',
        'D6',
        'D7',
        'D8',
        'Local',
        'non-crypto',
      ].includes(r.phase)
    )
      fail('unknown phase ' + r.id);
    if (
      !r.roles.length ||
      r.roles.some(
        (k) =>
          !['signature', 'digest', 'kdf', 'aead', 'mac', 'carrier', 'predicate', 'name'].includes(
            k,
          ),
      )
    )
      fail('unknown or missing role ' + r.id);
    for (const label of r.labels) {
      if (owners.has(label)) fail('duplicate source-label ownership ' + label);
      owners.set(label, r.id);
      if (!current.domains.some((d) => d.label === label)) fail('stale source label ' + label);
    }
    const expected = current.domains
      .filter((d) => r.labels.includes(d.label))
      .flatMap((d) => d.sites.map((s) => ({ ...s, label: d.label, kind: d.kind })));
    if (JSON.stringify(r.sourceSites) !== JSON.stringify(expected))
      fail('source-site census changed ' + r.id);
    if (!r.labels.length && !r.entryPoints.length) fail('no executable source ' + r.id);
    for (const e of r.entryPoints) {
      if (!current.sources.some((s) => s.path === e.path))
        fail('entrypoint outside reviewed source census ' + r.id);
      else if (
        !new RegExp('export (?:async )?(?:function|const|class) ' + e.name + '\\b').test(
          read(e.path),
        )
      )
        fail('missing entrypoint ' + e.path + '::' + e.name);
    }
    if (r.status === 'open') {
      if (!r.blocker || !r.next || r.phase === 'A')
        fail('unfinished record lacks bounded disposition ' + r.id);
      continue;
    }
    if (r.status === 'inherited') {
      const permitted = {
        'inherited-local-clear': [
          'done/local-clear-authentication/v1',
          'done/local-clear-progress/v1',
          'done/local-import-clear/v1',
        ],
        'inherited-preactive-import': [
          'done/legacy-import-metadata/v1',
          'done/legacy-import-progress/v1',
        ],
        'inherited-legacy-observation': ['done/legacy-source-observation/v1'],
        'inherited-cleanup-fingerprints': [
          'done/legacy-cleanup-fingerprint/v${version}',
          'done/legacy-cleanup-entry',
        ],
      }[r.id];
      const inheritedRoles = {
        'inherited-local-clear': ['kdf', 'mac'],
        'inherited-preactive-import': ['kdf', 'mac'],
        'inherited-legacy-observation': ['digest'],
        'inherited-cleanup-fingerprints': ['kdf', 'mac'],
      }[r.id];
      if (
        inheritedRoles &&
        JSON.stringify([...r.roles].sort()) !== JSON.stringify([...inheritedRoles].sort())
      )
        fail('inherited primitive roles changed ' + r.id);
      if (
        !permitted ||
        JSON.stringify([...r.labels].sort()) !== JSON.stringify([...permitted].sort()) ||
        r.phase !== 'Local' ||
        r.scope !== 'outside-account-acceptance' ||
        !r.reason ||
        r.mapEntries.length ||
        r.vectorCases?.length ||
        r.blocker !== null
      )
        fail('invalid inherited scope disposition ' + r.id);
      if (
        !r.homePins?.length ||
        !r.evidencePins?.length ||
        !r.entryPoints.length ||
        !r.tests?.length
      )
        fail('incomplete inherited evidence ' + r.id);
      for (const pin of r.homePins ?? []) {
        const body = section(read(pin.path), pin.section);
        if (body === null || digest(body).slice(0, 12) !== pin.hash)
          fail('stale inherited scope home ' + r.id);
      }
      for (const pin of r.evidencePins ?? [])
        if (digest(read(pin.path)) !== pin.sha256) fail('stale inherited evidence ' + r.id);
      for (const name of [
        'outside-account-acceptance',
        'native-exclusion-barriers',
        'historical-evidence-only',
      ])
        if (!r.requirements?.includes(name))
          fail('missing inherited obligation ' + r.id + ': ' + name);
      for (const path of r.tests ?? [])
        if (!read(path).includes('test(')) fail('missing inherited boundary test ' + r.id);
      continue;
    }
    if (r.status === 'excluded') {
      if (r.phase !== 'non-crypto' || r.roles.join() !== 'name' || !r.reason || r.mapEntries.length)
        fail('invalid non-cryptographic exclusion ' + r.id);
      continue;
    }
    if (!corpusPhases.has(r.phase) || r.blocker !== null)
      fail('specified phase/blocker mismatch ' + r.id);
    if (!r.homePins.length || !r.mapEntries.length || !r.vectorCases.length || !r.tests.length)
      fail('incomplete specified construction ' + r.id);
    for (const pin of r.homePins) {
      const body = section(read(pin.path), pin.section);
      if (body === null || digest(body).slice(0, 12) !== pin.hash)
        fail('stale/missing byte home ' + r.id + ' ' + pin.path + ' §' + pin.section);
      if (
        !r.mapEntries.some((id) =>
          entries
            .get(id)
            ?.pins.some(
              (p) => p.path === pin.path && p.section === pin.section && p.hash === pin.hash,
            ),
        )
      )
        fail('byte home not pinned by declared authority entries ' + r.id);
    }
    for (const id of r.mapEntries)
      if (!entries.has(id) || entries.get(id).status !== 'resolved')
        fail('dangling/unresolved map dependency ' + r.id + ' -> ' + id);
    if (r.roles.includes('aead') && !r.mapEntries.some((id) => entries.get(id)?.kind === 'aead'))
      fail('missing AEAD authority entry ' + r.id);
    if (
      r.roles.includes('mac') &&
      !r.mapEntries.some(
        (id) => entries.get(id)?.kind === 'verification' && entries.get(id)?.guards === 'custody',
      )
    )
      fail('missing MAC custody authority entry ' + r.id);
    const signerEntry = {
      authority: ['private-first-service', 'availability'],
      device: ['private-creating-device', 'attribution'],
      bootstrap: ['private-first-origin', 'keys'],
      'recovery-bootstrap': ['private-recovery-possession', 'custody'],
      'transport-member': ['private-transport-member', 'attribution'],
      'transport-reader': ['private-transport-member', 'attribution'],
      'transport-acceptance': ['private-transport-acceptance', 'availability'],
    }[r.signer];
    if (
      r.roles.includes('signature') &&
      (!signerEntry ||
        !r.mapEntries.includes(signerEntry[0]) ||
        entries.get(signerEntry[0])?.guards !== signerEntry[1])
    )
      fail('signer/authority guard mismatch ' + r.id);
    if (
      r.id === 'account-ledger-chain' &&
      !r.mapEntries.includes('private-account-ledger-completeness')
    )
      fail('missing counter witness dependency ' + r.id);
    if (
      r.id === 'content-counter-v2' &&
      (!r.mapEntries.includes('private-content-counter-order') ||
        !r.mapEntries.includes('private-account-ledger-completeness'))
    )
      fail('missing native counter/ledger dependency ' + r.id);
    const required = [
      ...(r.phase === 'D8'
        ? [
            'native-claim-owner',
            'initial-custody-authentication',
            'retained-import-cleanup',
            'shrinking-claim-histories',
          ]
        : []),
      ...(r.phase === 'D7'
        ? [
            'inherited-byte-agreement',
            'native-checkpoint-owner',
            'genesis-scope-disposition',
            'shrinking-replay-histories',
            ...(r.roles.includes('aead') ? ['encoded-field-omissions'] : []),
          ]
        : []),
      ...(r.phase === 'D6'
        ? ['native-custody-owner', ...(r.roles.includes('aead') ? ['encoded-field-omissions'] : [])]
        : []),
      ...(['custody-factor-v1', 'custody-generation-envelope'].includes(r.id)
        ? ['inherited-byte-agreement']
        : []),
      ...(['custody-credential-v2', 'custody-key-correspondence'].includes(r.id)
        ? ['credential-correspondence']
        : []),
      ...(r.id === 'custody-credential-v2' ? ['private-format-cleanup'] : []),
      ...(r.id === 'custody-metadata-v2'
        ? ['structured-clone-negatives', 'state-counterexample', 'native-mac-comparison']
        : []),
      'runtime-bytes',
      'input-mutations',
      ...(r.phase === 'D5'
        ? [
            'inherited-byte-agreement',
            'native-carrier-owner',
            ...(r.roles.includes('aead') ? ['encoded-field-omissions'] : []),
          ]
        : []),
      ...(r.phase === 'D4'
        ? [
            'native-metadata-owner',
            ...(r.roles.includes('mac') ? ['structured-clone-negatives'] : []),
          ]
        : []),
      ...(r.id === 'account-ledger-chain' ? ['counter-witness-coupling'] : []),
      ...(r.phase === 'D3' && r.roles.includes('carrier')
        ? ['canonical-carrier-negatives', 'encoded-field-omissions']
        : []),
      ...(r.roles.includes('signature') || r.roles.includes('mac')
        ? ['encoded-field-omissions']
        : []),
    ];
    for (const obligation of required)
      if (!r.requirements.includes(obligation))
        fail('missing evidence obligation ' + r.id + ': ' + obligation);
    for (const path of r.tests)
      if (!read(path).includes('test(')) fail('missing executable tests ' + r.id);
    for (const id of r.vectorCases) {
      if (vectorOwners.has(id)) fail('vector assigned twice ' + id);
      vectorOwners.set(id, r.id);
      const v = executed.find((v) => v.id === id);
      if (v && v.phase !== r.phase) fail('vector phase mismatch ' + r.id);
      if (v && v.signer !== (r.signer ?? null)) fail('vector signer mismatch ' + r.id);
      if (v?.kind === 'signature' && !r.roles.includes('signature'))
        fail('signature vector misclassified as non-signature ' + r.id);
      if (['kdf', 'aead', 'mac'].includes(v?.kind) && !r.roles.includes(v.kind))
        fail('primitive vector misclassified ' + r.id);
      if (v?.kind === 'carrier' && !r.roles.includes('carrier'))
        fail('carrier vector misclassified ' + r.id);
      if (v?.kind === 'digest' && !r.roles.includes('digest'))
        fail('digest vector misclassified ' + r.id);
      if (r.phase === 'D3' && v?.kind === 'carrier' && !v.encodedBindingControls?.length)
        fail('missing carrier omission corpus ' + r.id);
      if (
        ['D5', 'D6', 'D7'].includes(r.phase) &&
        v?.kind === 'aead' &&
        !v.encodedBindingControls?.length
      )
        fail('missing store/journal omission corpus ' + r.id);
      if (!v?.expected.messageHex || !v.expected.resultHex || !v.negatives?.length)
        fail('missing vector/negative corpus ' + r.id + ' -> ' + id);
      if (
        v?.kind === 'mac' &&
        (!v.encodedBindingControls?.length || v.expected.resultHex?.length !== 64)
      )
        fail('missing MAC/omission corpus ' + r.id);
      if (
        r.roles.includes('signature') &&
        (!v?.expected.signature || !v.encodedBindingControls?.length)
      )
        fail('missing signature/omission corpus ' + r.id);
    }
  }
  for (const d of current.domains)
    if (!owners.has(d.label)) fail('unregistered source label ' + d.label);
  for (const v of executed) if (!vectorOwners.has(v.id)) fail('orphan executed vector ' + v.id);
  return {
    failures,
    specified: records.filter((r) => r.status === 'specified').length,
    open: records.filter((r) => r.status === 'open').length,
    excluded: records.filter((r) => r.status === 'excluded').length,
    inherited: records.filter((r) => r.status === 'inherited').length,
  };
}
