/**
 * `S0-9` round 3 — the different-family challenger's mutation battery.
 *
 * Fresh probes designed from reading the checkers, not copied from any Stage D
 * battery. Each probe snapshots the files it touches in memory, applies one
 * mutation, runs the narrowest check that should catch it, and restores in a
 * `finally` — never `git checkout --`, per the handoff's warning: the batteries
 * run against uncommitted work, and a git restore reverts the action's own
 * changes along with the mutation.
 *
 * expect: 'fail' — the gate must refuse the mutation (a caught probe).
 *
 * Result at `cfc6b70`, the challenged tip (2026-08-29): 19 of 19 expected-fail
 * probes caught with the right diagnosis, and the two probes then marked
 * expect: 'pass' passed — the disposition's `R3-1` (the per-decision option
 * drift, invisible to every document-reading check, run one at a time) and
 * `R3-2` (a sealed construction in `S0-3/A-schemas.md`, outside the sweep's
 * document set). **The round-3 return repaired both instruments the same day
 * and this file was inverted with it**, exactly as the scheduler
 * reproductions were: the two probes now expect 'fail' and assert the
 * repairs — the option comparison and the widened sweep — as permanent
 * negatives. 21 of 21 caught is the post-return expectation.
 *
 * Usage: node docs/review/remediation/S0-9/round-3-battery.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const at = (p) => `${ROOT}/${p}`;
const read = (p) => readFileSync(at(p), 'utf8');
const write = (p, t) => writeFileSync(at(p), t);

const run = (cmd, args) => {
  try {
    const out = execFileSync(cmd, args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}\n${e.stderr ?? ''}` };
  }
};
const node = (script, ...args) => run('node', [script, ...args]);

/** Replace exactly once; throw if the needle is absent or ambiguous. */
const subst = (text, needle, replacement) => {
  const first = text.indexOf(needle);
  if (first === -1) throw new Error(`needle not found: ${needle.slice(0, 60)}…`);
  if (text.indexOf(needle, first + 1) !== -1) throw new Error(`needle ambiguous: ${needle.slice(0, 60)}…`);
  return text.slice(0, first) + replacement + text.slice(first + needle.length);
};

const MAP = 'docs/review/remediation/S0-2/authority-map.md';
const HANDOFF = 'docs/review/remediation/HANDOFF.md';

const probes = [
  {
    id: 'map-open-without-blocker',
    what: 'authority map: flip destructive-boundary to open with no blocker/return',
    files: [MAP],
    apply: () => write(MAP, subst(read(MAP), '\nstatus: resolved\npin: docs/TRD.md §14.7 683f0f7679ef\npin: docs/review/remediation/S0-7/A-schemas.md §3', '\nstatus: open\npin: docs/TRD.md §14.7 683f0f7679ef\npin: docs/review/remediation/S0-7/A-schemas.md §3')),
    check: () => node('scripts/check-authority-map.mjs'),
    expect: 'fail',
  },
  {
    id: 'map-pinned-home-edit',
    what: 'TRD §14.7 edited without a re-pin',
    files: ['docs/TRD.md'],
    apply: () =>
      write('docs/TRD.md', subst(read('docs/TRD.md'),
        '### 14.7 Lapse, expiry and the hosted-retention machine',
        '### 14.7 Lapse, expiry and the hosted-retention machine\n\nA quietly inserted sentence.')),
    check: () => node('scripts/check-authority-map.mjs'),
    expect: 'fail',
  },
  {
    id: 'map-sweep-unpinned-construction',
    what: 'a new Ed25519( construction in unpinned TRD §14.2',
    files: ['docs/TRD.md'],
    apply: () =>
      write('docs/TRD.md', subst(read('docs/TRD.md'),
        '### 14.2 The cutover checkpoint',
        '### 14.2 The cutover checkpoint\n\nCutoverSeal = Ed25519( the migrating credential ; digest )')),
    check: () => node('scripts/check-authority-map.mjs'),
    expect: 'fail',
  },
  {
    id: 'map-guard-service-edge',
    what: 'terminal-handoff (guards: deletion) rerouted to root:service',
    files: [MAP],
    apply: () =>
      write(MAP, subst(read(MAP),
        'never the receiver -> root:trust-root',
        'never the receiver -> root:service')),
    check: () => node('scripts/check-authority-map.mjs'),
    expect: 'fail',
  },
  {
    id: 'map-sweep-blindspot-s0-3',
    what: 'a new AEAD( construction in S0-3/A-schemas.md — R3-2, inverted at the round-3 return',
    files: ['docs/review/remediation/S0-3/A-schemas.md'],
    apply: () => {
      const p = 'docs/review/remediation/S0-3/A-schemas.md';
      write(p, `${read(p)}\n\nProbeSeal = AEAD(K_probe; nonce, aad, plaintext) — a sealed construction the sweep should see.\n`);
    },
    check: () => node('scripts/check-authority-map.mjs'),
    // 'pass' at the challenged tip cfc6b70 — the sweep's document set omitted
    // S0-3's schema home. Inverted at the round-3 return: SWEPT closed over all
    // seven stage documents, and this probe is the permanent negative.
    expect: 'fail',
  },
  {
    id: 'map-bound-strike',
    what: 'retention-mark keeps root:service and loses its bound:',
    files: [MAP],
    apply: () => {
      const text = read(MAP);
      const start = text.indexOf('entry: retention-mark');
      const boundAt = text.indexOf('bound: §14.7 §6', start);
      const lineEnd = text.indexOf('\n', boundAt);
      write(MAP, text.slice(0, boundAt) + text.slice(lineEnd + 1));
    },
    check: () => node('scripts/check-authority-map.mjs'),
    expect: 'fail',
  },
  {
    id: 'map-aead-both-fields',
    what: 'k-store names counted-by AND discipline',
    files: [MAP],
    apply: () =>
      write(MAP, subst(read(MAP),
        'equality first disallowed\nstatus: resolved\npin: docs/TRD.md §6.1',
        'equality first disallowed\ndiscipline: also a fresh nonce per entry\nstatus: resolved\npin: docs/TRD.md §6.1')),
    check: () => node('scripts/check-authority-map.mjs'),
    expect: 'fail',
  },
  {
    id: 'census-standing-missing',
    what: 'a new remediation doc with no Standing line',
    files: [],
    extraFile: 'docs/review/remediation/S0-9/round3-probe.md',
    apply: () => write('docs/review/remediation/S0-9/round3-probe.md', '# A probe file\n\nNo standing declared.\n'),
    check: () => node('scripts/remediation-status.mjs', '--check'),
    expect: 'fail',
  },
  {
    id: 'census-record-edit',
    what: 'a pinned record (DISPOSITION.md) edited without a re-pin',
    files: ['docs/review/remediation/S0-9/DISPOSITION.md'],
    apply: () => {
      const p = 'docs/review/remediation/S0-9/DISPOSITION.md';
      write(p, `${read(p)}\nAn appended line.\n`);
    },
    check: () => node('scripts/remediation-status.mjs', '--check'),
    expect: 'fail',
  },
  {
    id: 'handoff-decision-claim-drift',
    what: 'HANDOFF claims P-4 ratified option A where the record says option B — R3-1, inverted at the round-3 return',
    files: [HANDOFF],
    apply: () =>
      write(HANDOFF, subst(read(HANDOFF),
        '**`P-4` is ratified (2026-08-28): option B, with intrinsic acceptance.**',
        '**`P-4` is ratified (2026-08-28): option A, with intrinsic acceptance.**')),
    check: () => node('scripts/remediation-status.mjs', '--check'),
    // 'pass' at the challenged tip cfc6b70 — only the ratification date was
    // compared, so the drifted option rode every gate check green. Inverted at
    // the round-3 return: the option letter is a compared facet, and this
    // probe is the permanent negative.
    expect: 'fail',
  },
  {
    id: 'debts-handoff-claim-drift',
    what: 'HANDOFF claims S0-10 — 2 where the manifest computes 1',
    files: [HANDOFF],
    apply: () =>
      write(HANDOFF, subst(read(HANDOFF),
        'registered debts block: `S0-10` — 1', 'registered debts block: `S0-10` — 2')),
    check: () => node('scripts/check-debts.mjs', '--check'),
    expect: 'fail',
  },
  {
    id: 'debts-two-gates',
    what: 'x25519 debt reassigned to L-4 against TRD §10.11 (the FU-15 shape)',
    files: ['docs/review/remediation/debts.json'],
    apply: () =>
      write('docs/review/remediation/debts.json', subst(read('docs/review/remediation/debts.json'),
        '"gate": "S0-10"', '"gate": "L-4"')),
    check: () => node('scripts/check-debts.mjs', '--check'),
    expect: 'fail',
  },
  {
    id: 'debts-paid-no-record',
    what: 'x25519 debt marked paid with no payment record',
    files: ['docs/review/remediation/debts.json'],
    apply: () => {
      const doc = JSON.parse(read('docs/review/remediation/debts.json'));
      doc.debts.find((d) => d.id === 'x25519-dated-readback').status = 'paid';
      write('docs/review/remediation/debts.json', `${JSON.stringify(doc, null, 2)}\n`);
    },
    check: () => node('scripts/check-debts.mjs', '--check'),
    expect: 'fail',
  },
  {
    id: 'gate-consult-S0-10-blocks',
    what: 'unmutated: --gate S0-10 must BLOCK on the open x25519 debt',
    files: [],
    apply: () => {},
    check: () => node('scripts/check-debts.mjs', '--gate', 'S0-10'),
    expect: 'fail',
  },
  {
    id: 'receipt-byte-binding',
    what: 'a check script edited; its stale receipt must not credit it',
    files: ['scripts/check-update-limit.mjs'],
    apply: () => {
      const p = 'scripts/check-update-limit.mjs';
      write(p, `${read(p)}\n// an appended comment\n`);
    },
    check: () => node('scripts/check-traceability.mjs', '--check'),
    expect: 'fail',
  },
  {
    id: 'script-claim-strike',
    what: 'the origin scanner loses its falsifies: line — a thin finding orphans',
    files: ['scripts/check-origin-isolation.mjs'],
    apply: () => {
      const p = 'scripts/check-origin-isolation.mjs';
      const text = read(p);
      const line = /^ \* falsifies: .+$\n/mu.exec(text);
      if (line === null) throw new Error('no falsifies line found');
      write(p, text.replace(line[0], ''));
    },
    check: () => node('scripts/check-traceability.mjs', '--check'),
    expect: 'fail',
  },
  {
    id: 'aad-identity-swap',
    what: 'two certified-set negatives swap isolates declarations (regenerated)',
    files: ['scripts/generate-transition-vectors.mjs', 'test/vectors/transition.json'],
    apply: () => {
      const p = 'scripts/generate-transition-vectors.mjs';
      let text = read(p);
      text = subst(text, "isolates: 'certified set.label'", "isolates: '@@TMP@@'");
      text = subst(text, "isolates: 'certified set.v'", "isolates: 'certified set.label'");
      text = subst(text, "isolates: '@@TMP@@'", "isolates: 'certified set.v'");
      write(p, text);
      const gen = node('scripts/generate-transition-vectors.mjs');
      if (gen.code !== 0) throw new Error(`regeneration failed: ${gen.out.slice(0, 400)}`);
    },
    check: () => node('scripts/check-aad-coverage.mjs'),
    expect: 'fail',
  },
  {
    id: 'deletion-class-drop',
    what: "recovery-anchor dropped from the package generator's domain copy",
    files: ['scripts/generate-package-vectors.mjs'],
    apply: () =>
      write('scripts/generate-package-vectors.mjs', subst(read('scripts/generate-package-vectors.mjs'),
        "'recovery-anchor',", '')),
    check: () => {
      const own = node('scripts/generate-package-vectors.mjs', '--check');
      if (own.code !== 0) return own;
      return node('scripts/check-retention.mjs');
    },
    expect: 'fail',
  },
  {
    id: 'boundary-inherited-clock',
    what: 'retention model: the boundary inherits the lapse clock again (the pre-return world)',
    files: ['test/hostedRetention.test.ts'],
    apply: () =>
      write('test/hostedRetention.test.ts', subst(read('test/hostedRetention.test.ts'),
        '      ? Math.max(stopped.deadline ?? 0, now + RETENTION)',
        '      ? (stopped.deadline ?? now + RETENTION)')),
    check: () => run('node_modules/.bin/vitest', ['run', 'test/hostedRetention.test.ts']),
    expect: 'fail',
  },
  {
    id: 'admission-byte-rule-restore',
    what: 'the retired watermark sentence restored into a consumable home',
    files: ['docs/review/remediation/S0-3/A-schemas.md'],
    apply: () => {
      const p = 'docs/review/remediation/S0-3/A-schemas.md';
      write(p, `${read(p)}\n\nThe allocator hands the trimmer an exact watermark.\n`);
    },
    check: () => node('scripts/check-write-admission.mjs'),
    expect: 'fail',
  },
  {
    id: 'wasm-source-drift',
    what: 'lib.rs edited without a rebuild — the round-1 mutation, now in-gate',
    files: ['wasm/journal-seal/src/lib.rs'],
    apply: () => {
      const p = 'wasm/journal-seal/src/lib.rs';
      write(p, `${read(p)}\n// an appended comment\n`);
    },
    check: () => node('scripts/check-wasm-seal.mjs'),
    expect: 'fail',
  },
];

const results = [];
for (const probe of probes) {
  const snapshots = new Map(probe.files.map((f) => [f, read(f)]));
  let outcome;
  try {
    probe.apply();
    const { code, out } = probe.check();
    const failed = code !== 0;
    const asExpected = probe.expect === 'fail' ? failed : !failed;
    outcome = {
      id: probe.id,
      expect: probe.expect,
      got: failed ? 'fail' : 'pass',
      ok: asExpected,
      message: failed
        ? out.trim().split('\n').filter((l) => l.trim() !== '').slice(-3).join(' | ').slice(0, 300)
        : '',
    };
  } catch (e) {
    outcome = { id: probe.id, expect: probe.expect, got: 'error', ok: false, message: String(e.message).slice(0, 300) };
  } finally {
    for (const [f, text] of snapshots) write(f, text);
    if (probe.extraFile && existsSync(at(probe.extraFile))) unlinkSync(at(probe.extraFile));
  }
  results.push(outcome);
  console.log(`${outcome.ok ? 'OK  ' : 'MISS'} ${outcome.id} — expected ${outcome.expect}, got ${outcome.got}`);
  if (outcome.message) console.log(`      ${outcome.message}`);
}

const caught = results.filter((r) => r.ok && r.expect === 'fail').length;
const missed = results.filter((r) => !r.ok);
console.log(
  `\n${caught} caught of ${results.filter((r) => r.expect === 'fail').length} expected-fail probes; ` +
    `${missed.length} diverging from the post-return expectation.`,
);
if (missed.length > 0) for (const m of missed) console.log(`  DIVERGES: ${m.id} — got ${m.got}: ${m.message}`);
