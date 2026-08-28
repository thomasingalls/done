/**
 * `S0-9`'s isolation battery — does each falsifier refuse the defect its finding describes?
 *
 * `S0-8` proves a falsifier **exists, names its finding, and still runs**, and
 * says plainly that it does not prove one **isolates**. That gap is where this
 * project's recurring defect lives: a negative that refuses for a second reason
 * satisfies every structural check and demonstrates nothing. `S0-2`, `S0-5` and
 * `S0-6` each met it once.
 *
 * So this attacks the gap directly, on the thinnest evidence first. For each of
 * the ten current defects that `traceability.md` reports as resting on a
 * **single named falsifier**, it reintroduces the defect the finding's own text
 * describes and requires that one falsifier to refuse it. A survivor means the
 * finding is not closed — it has a falsifier that runs and does not catch the
 * thing it is credited with catching.
 *
 * **This is a challenge artifact, not a gate.** It mutates the tree and restores
 * it, so it is run deliberately rather than from `pnpm check`. It restores from
 * an in-memory snapshot rather than from git, because a `git checkout --` would
 * revert uncommitted work along with the mutation — which is how `S0-8`'s first
 * battery destroyed four files.
 *
 * Usage:
 *   node docs/review/remediation/S0-9/isolation-battery.mjs <repo-root>
 *
 * Run `pnpm build` first if the origin-scanner case should run; it reads
 * `dist/`, and the case reports itself skipped rather than passing when there is
 * no build to scan.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const root = process.argv[2];
if (root === undefined) throw new Error('Usage: node isolation-battery.mjs <repo-root>');
const R = root.endsWith('/') ? root : root + '/';

const run = (args) => {
  try {
    return {
      ok: true,
      out: execFileSync(args[0], args.slice(1), {
        cwd: R,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64e6,
      }),
    };
  } catch (e) {
    return { ok: false, out: ((e.stdout ?? '') + (e.stderr ?? '')).toString() };
  }
};
const node = (s) => run([process.execPath, s]);
const vitest = (f) => run([R + 'node_modules/.bin/vitest', 'run', f]);

const patch = (f, from, to) => {
  const s = readFileSync(R + f, 'utf8');
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`anchor appears ${n}x in ${f}: ${from.slice(0, 55)}`);
  writeFileSync(R + f, s.replace(from, to));
};

/** The built file the origin scanner reads, when there is one. */
const built = () => {
  if (!existsSync(R + 'dist/assets')) return null;
  const js = readdirSync(R + 'dist/assets').filter((f) => f.endsWith('.js'));
  return js.length === 0 ? null : 'dist/assets/' + js[0];
};

const CASES = [
  {
    finding: 'f-4259822-generation-switch-local-durability-undefined',
    falsifier: 'GenerationApply — a kill at every step',
    defect: 'the signed winner is not composed with successor opener install',
    files: ['test/generationApply.test.ts'],
    apply: () =>
      patch(
        'test/generationApply.test.ts',
        'return { ...w, openers: new Set([...w.openers, targetGen]), apply: rec(2) };',
        'return { ...w, apply: rec(2) };',
      ),
    check: () => vitest('test/generationApply.test.ts'),
  },
  {
    finding: 'f-4259822-recovery-replacement-no-forward-rotation',
    falsifier: 'the replacement-payload variants',
    defect: 'exposed old recovery material still opens the active generation after replacement',
    files: ['scripts/generate-transition-vectors.mjs'],
    apply: () =>
      patch(
        'scripts/generate-transition-vectors.mjs',
        "  { name: 'successor-generation', value: String(successor) },\n",
        '',
      ),
    check: () => node('scripts/generate-transition-vectors.mjs'),
  },
  {
    finding: 'f-9860a0b-journal-rotated-vector-reuses-key',
    falsifier: 'wrong-generation-key',
    defect: 'the generation-2 fixture derives from the generation-1 root',
    files: ['scripts/generate-journal-vectors.mjs'],
    apply: () =>
      patch('scripts/generate-journal-vectors.mjs', '    gen: 2,\n    kg: KG2,', '    gen: 2,\n    kg: KG,'),
    check: () => node('scripts/generate-journal-vectors.mjs'),
  },
  {
    finding: 'f-992bc91-network-carrier-registry-stale',
    falsifier: 'checkCarriers',
    defect: 'the registry calls a selected carrier unselected',
    files: ['scripts/generate-suite-vectors.mjs'],
    apply: () =>
      patch(
        'scripts/generate-suite-vectors.mjs',
        "    suite: 1,\n    label: 'done/store/v1',\n    selected_by: 'row 3',",
        "    suite: null,\n    label: 'done/store/v1',\n    selected_by: 'row 3',",
      ),
    check: () => node('scripts/generate-suite-vectors.mjs'),
  },
  {
    finding: 'f-9b49b74-wasm-glue-key-nonce-lengths',
    falsifier: 'check-wasm-seal.mjs',
    defect: 'the glue accepts wrong widths and can reuse stale static-buffer bytes',
    files: ['wasm/journal-seal/seal.generated.ts'],
    apply: () =>
      patch(
        'wasm/journal-seal/seal.generated.ts',
        "throw new RangeError('journal seal: key must be exactly 32 bytes');",
        'void 0;',
      ),
    check: () => node('scripts/check-wasm-seal.mjs'),
  },
  {
    finding: 'f-b997cdb-checkpoint-key-retention-inverted',
    falsifier: 'the opener predicate',
    defect: 'old-generation deletion lacks an opener-for-every-retained-fallback predicate',
    files: ['scripts/generate-checkpoint-vectors.mjs'],
    apply: () =>
      patch(
        'scripts/generate-checkpoint-vectors.mjs',
        '  const mayRetireOpener = (gen, opener, retained, openers) =>\n    mayDropGeneration(gen, retained) || (openers[gen] ?? []).filter((o) => o !== opener).length > 0;',
        '  const mayRetireOpener = () => true;',
      ),
    check: () => node('scripts/generate-checkpoint-vectors.mjs'),
  },
  {
    finding: 'f-dbfd01f-device-lock-rotation-caveat-lost',
    falsifier: 'the rotation_owed derivation',
    defect: 'the interface claims copy protection during the window where there is none',
    files: ['scripts/generate-device-lock-vectors.mjs'],
    apply: () =>
      patch(
        'scripts/generate-device-lock-vectors.mjs',
        '  const rotationOwedAt = (step) => step < 8;',
        '  const rotationOwedAt = (step) => step < 5;',
      ),
    check: () => node('scripts/generate-device-lock-vectors.mjs'),
  },
  {
    finding: 'f-dbfd01f-record-nonce-ceiling-omitted',
    falsifier: '§6.1 — the allocator, and the count the budget reads',
    defect: 'the writer omits the exact 2^32 equality boundary',
    files: ['test/writeAdmission.test.ts'],
    apply: () =>
      patch(
        'test/writeAdmission.test.ts',
        '(s.reserved[s.gen] ?? 0) + k >= BUDGET;',
        '(s.reserved[s.gen] ?? 0) + k > BUDGET;',
      ),
    check: () => vitest('test/writeAdmission.test.ts'),
  },

  // Six spellings, because the one that survived was an emphasis away from the
  // one that did not. `is **open**` is how this document actually writes a
  // status claim, and three of the five OPEN patterns are phrases that a `**`
  // between their words defeats.
  ...['is **open**', 'still **open**', 'remains **open**', 'is _open_', 'is **unselected**', 'is open'].map(
    (form) => ({
      finding: 'f-tip-prd-stale-selection-status',
      falsifier: 'check-selection-status.mjs',
      defect: `the PRD says a selected row "${form}"`,
      files: ['docs/PRD.md'],
      apply: () =>
        patch(
          'docs/PRD.md',
          'The authenticated finalization boundary is **selected** (TRD §7.5, TRD §15 row 5)',
          `The authenticated finalization boundary ${form} (TRD §7.5, TRD §15 row 5)`,
        ),
      check: () => node('scripts/check-selection-status.mjs'),
    }),
  ),

  // Six forms the finding names as invisible to the pre-`S0-1` scanner, which
  // failed on seven literal syntaxes and logged everything else as a mention.
  ...[
    'new WebSocket("wss://third.example/sync")',
    'fetch("https://third.example/code")',
    'new EventSource("https://third.example/s")',
    'el.setAttribute("src","https://third.example/x.js")',
    'importScripts("https://third.example/w.js")',
    'new Worker("https://third.example/w.js")',
  ].map((form) => ({
    finding: 'f-5bd9552-origin-scan-static-forms',
    falsifier: 'check-origin-isolation.mjs',
    defect: `a remote origin reaches built output as ${form.slice(0, 34)}…`,
    files: () => {
      const f = built();
      return f === null ? null : [f];
    },
    apply: () => {
      const f = built();
      writeFileSync(R + f, readFileSync(R + f, 'utf8') + `\n;${form};\n`);
    },
    check: () => node('scripts/check-origin-isolation.mjs'),
    skip: 'no dist/ to scan — run `pnpm build` first',
  })),
];

let caught = 0;
let skipped = 0;
for (const c of CASES) {
  const files = typeof c.files === 'function' ? c.files() : c.files;
  if (files === null) {
    skipped++;
    console.log(`skipped  ${c.finding}\n           ${c.skip}\n`);
    continue;
  }
  const snap = new Map(files.map((f) => [f, readFileSync(R + f, 'utf8')]));
  try {
    c.apply();
    const r = c.check();
    if (!r.ok) caught++;
    const why = r.ok
      ? 'THE FALSIFIER DID NOT REFUSE IT'
      : (
          r.out
            .split('\n')
            .map((l) => l.trim())
            .find(
              (l) =>
                /^(Error:|×|AssertionError|.*FAILED|- )/u.test(l) ||
                /^origin isolation: \d/u.test(l),
            ) ?? ''
        ).slice(0, 150);
    console.log(`${r.ok ? 'SURVIVED ' : 'caught   '} ${c.finding}`);
    console.log(`           defect:    ${c.defect}`);
    console.log(`           falsifier: ${c.falsifier}`);
    console.log(`           ${why}\n`);
  } catch (e) {
    console.log(`ERROR    ${c.finding}: ${e.message}\n`);
  } finally {
    for (const [f, s] of snap) writeFileSync(R + f, s);
  }
}

const ran = CASES.length - skipped;
console.log(`${caught} of ${ran} reintroduced defects refused by the named falsifier` + (skipped > 0 ? `, ${skipped} skipped.` : '.'));
process.exit(caught === ran ? 0 : 1);
