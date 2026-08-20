/**
 * The recorded web-security baseline profile (TRD §15 row 17, §10.9, §13.11).
 *
 * The construction is specified in docs/selections/row-17-web-security-baseline.md.
 * This script is the executable half of that document: it emits
 * test/vectors/web-security-baseline.json, which is the "recorded profile"
 * §13.11 level 2 asks for.
 *
 * **It is not a vector file in the sense the other twelve are**, and saying so
 * is better than letting a reviewer discover it. There is no construction here
 * and nothing to seal. What it shares with them is the property that makes them
 * worth having: it is generated, it checks itself, and it fails the build when
 * it stops agreeing with what it claims. A profile that has quietly drifted
 * from the standard it names is a specification that has stopped matching its
 * own generator, one document along.
 *
 * What it checks, on every run:
 *
 *   - Every chapter in the pinned ASVS index has a disposition, and every
 *     disposition names a chapter that exists. **Discovered from the index
 *     rather than from a hand-written list**, because a hand-maintained list is
 *     how the next version's new chapter would arrive undispositioned.
 *   - Every exclusion carries a reason, and every conditional exclusion carries
 *     a trigger — the shape §15's deferred rows already use.
 *   - Every pulled-up requirement exists, is genuinely L3, and belongs to a
 *     chapter that is in scope. A pull-up of something already inside the floor
 *     is noise; a pull-up out of an excluded chapter is a contradiction.
 *   - Every deviation names a requirement that IS inside the floor, a
 *     compensating control, and the §-reference that makes it true.
 *   - Every addendum control cites a section that exists in the TRD, and where
 *     it claims CI verification, **the named check exists on disk**.
 *   - The counts reconcile against the index.
 *
 * Usage: node scripts/generate-baseline-vectors.mjs [--check]
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';

import { reportAudit } from './lib/aad-coverage.mjs';

const OUT = new URL('../test/vectors/web-security-baseline.json', import.meta.url);
const INDEX = new URL('./lib/asvs-5.0.0-index.json', import.meta.url);
const TRD = new URL('../docs/TRD.md', import.meta.url);
const ROOT = new URL('../', import.meta.url);

/** The floor: cumulative L1 + L2. Everything at or below this level is in scope by default. */
const FLOOR = 2;

const DISPOSITIONS = new Set(['in-scope', 'not-applicable', 'conditional']);
const METHODS = new Set(['ci', 'review']);

/**
 * One disposition per ASVS chapter.
 *
 * `stage` is which stage's work the chapter covers, not when it is verified:
 * §13.11 level 2 is verified before Stage 4 ships, and a chapter about an
 * authorization service cannot be verified before there is one.
 */
const CHAPTERS = {
  V1: {
    disposition: 'in-scope',
    stage: 1,
    method: 'ci',
    why: 'The client renders user-authored markdown into the DOM. §10.9 makes this the chapter that matters most: same-origin code is inside the end-to-end boundary, so an injection here is key exfiltration rather than defacement.',
  },
  V2: {
    disposition: 'in-scope',
    stage: 1,
    method: 'review',
    why: 'Thin — the CRDT merges and there is little business logic to subvert — but import parses a file the user supplies (§9.2), and that is the untrusted input this product actually has.',
  },
  V3: {
    disposition: 'in-scope',
    stage: 1,
    method: 'ci',
    why: "Where §10.9's named controls live. Four of this chapter's L3 requirements are pulled up, because a product whose origin holds the keys should not take frontend hardening at the level a brochure site takes it.",
  },
  V4: {
    disposition: 'in-scope',
    stage: 4,
    method: 'review',
    why: 'The account service and the relay. Nothing to verify until they exist; the relay is content-blind (§7.2), so most of this chapter lands on a component that cannot read what it carries.',
  },
  V5: {
    disposition: 'in-scope',
    stage: 1,
    method: 'review',
    why: 'Import and export are file handling (§9.1, §9.2). There is no upload and no server-side file storage, so the chapter applies at its client-side edge only.',
  },
  V6: {
    disposition: 'in-scope',
    stage: 4,
    method: 'review',
    why: "The largest applicability question in the profile, and it is not answered by 'the feature is absent'. §15 row 12 selected a passkey-only account credential and rows 13 and 14 rejected stretching, so this chapter's password, lockout and credential-recovery requirements are inapplicable because the design chose a shape they do not contemplate. Each has to be recorded with that reason at verification, or the chapter reads as cherry-picked.",
  },
  V7: {
    disposition: 'in-scope',
    stage: 4,
    method: 'review',
    why: 'Partially, and the boundary is already drawn: §13.9 says a local slot is not a session and reopening one grants no relay token and no account session. Session requirements bind the account session; they do not bind the slot.',
  },
  V8: {
    disposition: 'in-scope',
    stage: 4,
    method: 'review',
    why: 'The authorization lineage (§13.5). Service-authoritative by construction, which is what most of this chapter asks for.',
  },
  V9: {
    disposition: 'conditional',
    stage: 4,
    method: 'review',
    why: 'Self-contained tokens apply only if the relay admission token turns out to be one. §13.2 fixes what the token may do and not its shape.',
    trigger:
      'The relay admission token being selected as a self-contained token rather than an opaque handle.',
  },
  V10: {
    disposition: 'not-applicable',
    stage: null,
    method: null,
    why: 'There is no OAuth and no OIDC anywhere in the design. The account service authenticates its own credential (§13.9) and issues its own admission tokens (§13.2); no third-party identity provider is contemplated, and adding one would be a product decision with its own document. **This is 36 of 345 requirements — over a tenth of the standard — excluded on one sentence**, which is exactly why the sentence is here.',
  },
  V11: {
    disposition: 'in-scope',
    stage: 1,
    method: 'review',
    why: "Applicable, and the one chapter where the floor sits below what is already selected: §13.10's suite and §15's fifteen constructions are more specific than this chapter asks for, each with generated vectors, and reviews 3a and 3b are a stronger control than a checklist. That is worth stating plainly rather than as a boast — it means V11 is where a *conflict* would surface if the profile and the design disagreed.",
  },
  V12: {
    disposition: 'in-scope',
    stage: 4,
    method: 'review',
    why: "TLS to the relay and the account service, and §10.9's origin checks on the transport upgrade. The development relay does not satisfy this chapter and is not meant to (§7.2).",
  },
  V13: {
    disposition: 'in-scope',
    stage: 1,
    method: 'ci',
    why: 'Build and deployment configuration: dependency integrity, what reaches the built artifact, and what the deployment exposes. Most of it is checkable from the build rather than by inspection.',
  },
  V14: {
    disposition: 'in-scope',
    stage: 1,
    method: 'ci',
    why: "Data protection, and it holds the profile's one deviation: V14.3.3 forbids sensitive data in browser storage, and this product's entire content lives in IndexedDB. See `deviations`.",
  },
  V15: {
    disposition: 'in-scope',
    stage: 1,
    method: 'ci',
    why: 'Dependencies and coding practice. Four of its L3 requirements are pulled up, because a dependency in the key-holding origin is a party inside the end-to-end boundary (§10.9) rather than a supply-chain abstraction.',
  },
  V16: {
    disposition: 'in-scope',
    stage: 4,
    method: 'review',
    why: "Service-side logging, and it is a real cost of choosing L2: the chapter has no L1 requirements and sixteen at L2, so the level choice pulls the whole of it in. PRD §7.11's allowlist and §16.4's inventory rows are what it will be verified against.",
  },
  V17: {
    disposition: 'conditional',
    stage: null,
    method: null,
    why: 'There is no WebRTC. Peer-to-peer is deferred, and PRD §2.3 gates it on four measured conditions rather than on intent.',
    trigger: "PRD §2.3's four conditions all being met and peer-to-peer being built.",
  },
};

/**
 * L3 requirements pulled into scope, each because §10.9's threat model puts it
 * above the level the standard assigns it. Every one is checked against the
 * index for existence and level, so a renumbering in a later ASVS fails the
 * build rather than silently dropping a control.
 */
const PULL_UPS = [
  {
    req: 'V3.2.3',
    why: 'DOM clobbering. L3 for an ordinary application; here the thing clobbered code reaches is a key handle.',
  },
  {
    req: 'V3.4.7',
    why: 'A CSP violation-reporting location. Without it the policy is enforced and unobserved, and the first thing it blocks is also the first thing nobody hears about.',
  },
  {
    req: 'V3.4.8',
    why: 'Cross-Origin-Opener-Policy. A key-holding origin should not share a browsing-context group with anything.',
  },
  {
    req: 'V3.6.1',
    why: "§10.9's first named control, at L3 in the standard: external assets only with Subresource Integrity. The profile goes further — the addendum forbids remote subresources outright — so this is pulled up to be superseded rather than skipped.",
  },
  {
    req: 'V15.1.4',
    why: 'Documenting risky components. L3 because most applications can treat a dependency as a supply-chain abstraction; one inside the end-to-end boundary is a party to it.',
  },
  {
    req: 'V15.1.5',
    why: 'The same for dangerous functionality, and §10.10 already names the one instance.',
  },
  {
    req: 'V15.2.4',
    why: "Transitive dependencies from the expected repository, and no dependency-confusion exposure. This is §10.9's 'dependency integrity' in the standard's own words.",
  },
  {
    req: 'V15.2.5',
    why: 'Additional protections around what the two documentation requirements above identify. Pulled up with them, because documenting a risk and doing nothing about it is the failure mode of documenting it.',
  },
];

/**
 * In-scope requirements the product does not meet as written, each with the
 * control that makes the requirement's *intent* true by another route.
 *
 * There is one, and it is the most important line in the profile: it is the
 * single requirement ASVS 5.0.0 has about the thing this product structurally
 * is.
 */
const DEVIATIONS = [
  {
    req: 'V14.3.3',
    what: 'Forbids sensitive data in browser storage, excepting session tokens.',
    position:
      'Not met as written, and cannot be: the entire content of the application is user data in IndexedDB. That is what a local-first application is.',
    compensating_control:
      'Every record is sealed under a content-key generation before it is written, with the key material held as a non-extractable handle and never present in a store (§6.1, §13.2, §13.3). §11.1s no-plaintext-at-rest test inspects a profile snapshot at genesis, at Local, at Account and after deletion, retention expiry and migration, so the claim is exercised rather than asserted.',
    trd: '§6.1',
    note: 'ASVS 5.0.0 has **one** requirement mentioning browser storage and **none** mentioning Trusted Types, service workers or offline operation. The standard does not model an application of this shape, and the honest response is a recorded deviation plus the addendum below — not a level chosen high enough to look thorough.',
  },
];

/**
 * Controls the standard does not carry, each already required by the TRD.
 *
 * §10.9 wrote this list before the row existed, which is most of the argument
 * for it: the addendum is not an invention, it is the part of §10.9 that ASVS
 * has no requirement for.
 */
const ADDENDUM = [
  {
    id: 'A1',
    control: 'No remote subresource in the key-holding origin. Not "with SRI" — none.',
    why: 'Same-origin code is inside the end-to-end boundary, so a third-party asset is a party added to it. SRI pins a byte string and does not remove the party.',
    trd: '§10.9',
    method: 'ci',
    check: 'scripts/check-origin-isolation.mjs',
    stage: 1,
  },
  {
    id: 'A2',
    control: 'Trusted Types enforced where the platform supports it.',
    why: 'ASVS 5.0.0 has no requirement mentioning Trusted Types. §10.9 names it, and it is the one control that turns DOM-sink injection from a review obligation into an enforcement.',
    trd: '§10.9',
    method: 'ci',
    check: null,
    planned_check: 'The web application is verified as part of the cryptographic boundary',
    stage: 4,
  },
  {
    id: 'A3',
    control:
      'Service-worker update integrity: the worker that can serve every future load is replaced only from the origin, over a checked artifact.',
    why: 'ASVS 5.0.0 has no requirement mentioning service workers. A PWA that caches its own shell has a persistent code path the standard does not model.',
    trd: '§10.9',
    method: 'review',
    check: null,
    stage: 4,
  },
  {
    id: 'A4',
    control: 'Everything an app-managed store holds is ciphertext, from genesis, on every device.',
    why: 'The compensating control for V14.3.3, stated as a requirement in its own right so the profile does not depend on a deviation entry to carry it.',
    trd: '§6.1',
    method: 'ci',
    check: null,
    planned_check: 'No plaintext at rest',
    stage: 1,
  },
  {
    id: 'A5',
    control:
      'No control may be weakened by being offline, and no control may require the network to hold.',
    why: 'The product is offline-first (§7.1), so a control that only holds while connected is not a control. ASVS assumes a server is reachable; here it frequently is not, and §13.9 already turns on that distinction.',
    trd: '§7.1',
    method: 'review',
    check: null,
    stage: 4,
  },
];

// --- checks ----------------------------------------------------------------------

const index = JSON.parse(readFileSync(INDEX, 'utf8'));
const trd = readFileSync(TRD, 'utf8');

const fail = (message) => {
  throw new Error(message);
};

/** Chapters are discovered from the index, never from a list kept beside it. */
for (const id of Object.keys(index.chapters)) {
  const d = CHAPTERS[id];
  if (!d)
    fail(`ASVS ${index.version} chapter ${id} (${index.chapters[id].name}) has no disposition.`);
  if (!DISPOSITIONS.has(d.disposition)) fail(`${id}: unknown disposition "${d.disposition}".`);
  if (!d.why) fail(`${id}: every disposition needs a reason.`);
  if (d.disposition === 'conditional' && !d.trigger) {
    fail(`${id}: a conditional exclusion needs a trigger, the way §15's deferred rows do.`);
  }
  if (d.disposition === 'in-scope') {
    if (!METHODS.has(d.method)) fail(`${id}: in-scope chapters need a verification method.`);
    if (d.stage !== 1 && d.stage !== 4) fail(`${id}: in-scope chapters name the stage they cover.`);
  }
}
for (const id of Object.keys(CHAPTERS)) {
  if (!index.chapters[id])
    fail(`Disposition for ${id}, which ASVS ${index.version} does not have.`);
}

const inScope = (id) => CHAPTERS[id].disposition === 'in-scope';
const chapterOf = (req) => req.slice(0, req.indexOf('.'));

const seenReq = new Set();
for (const { req } of [...PULL_UPS, ...DEVIATIONS]) {
  if (seenReq.has(req)) fail(`${req} appears twice; a requirement has one disposition.`);
  seenReq.add(req);
}

for (const { req } of PULL_UPS) {
  const level = index.levels[req];
  if (level === undefined) fail(`Pulled-up ${req} is not in ASVS ${index.version}.`);
  if (level <= FLOOR) {
    fail(
      `Pulled-up ${req} is L${level}, already inside the L${FLOOR} floor. The entry says nothing.`,
    );
  }
  if (!inScope(chapterOf(req))) {
    fail(
      `Pulled-up ${req} is in ${chapterOf(req)}, which is not in scope. One of the two is wrong.`,
    );
  }
}

for (const d of DEVIATIONS) {
  const level = index.levels[d.req];
  if (level === undefined) fail(`Deviation ${d.req} is not in ASVS ${index.version}.`);
  if (level > FLOOR) {
    fail(`Deviation ${d.req} is L${level}, outside the floor — there is nothing to deviate from.`);
  }
  if (!d.compensating_control || !d.trd)
    fail(`${d.req}: a deviation needs a control and a reference.`);
  if (!trd.includes(d.trd.replace('§', '### '))) {
    // The reference is a section number; accept it if the document mentions it anywhere.
    if (!trd.includes(d.trd)) fail(`${d.req}: the TRD does not mention ${d.trd}.`);
  }
}

for (const a of ADDENDUM) {
  if (!METHODS.has(a.method)) fail(`${a.id}: unknown verification method "${a.method}".`);
  if (!trd.includes(a.trd))
    fail(`${a.id}: the TRD does not mention ${a.trd}, so the control is unanchored.`);
  // A control claiming CI verification names where that verification lives, and
  // the named thing has to exist. Where it cannot yet -- the check belongs to a
  // stage that has not run -- the honest field is the §11 test that will carry
  // it, and that test has to be one the TRD already owes. `check: null` with
  // nothing beside it is a claim with no address.
  if (a.method === 'ci') {
    if (a.check !== null && !existsSync(new URL(a.check, ROOT))) {
      fail(`${a.id} claims CI verification by ${a.check}, which does not exist.`);
    }
    if (a.check === null && !a.planned_check) {
      fail(
        `${a.id} claims CI verification and names neither a check nor the §11 test that will be one.`,
      );
    }
    if (a.check === null && !trd.includes(a.planned_check)) {
      fail(`${a.id} names a planned check the TRD does not owe: "${a.planned_check}".`);
    }
  }
}

// --- counts ----------------------------------------------------------------------

const counted = Object.values(index.chapters).reduce(
  (n, c) => ({ total: n.total + c.total, L1: n.L1 + c.L1, L2: n.L2 + c.L2, L3: n.L3 + c.L3 }),
  { total: 0, L1: 0, L2: 0, L3: 0 },
);
if (
  counted.total !== index.totals.requirements ||
  counted.L1 !== index.totals.L1 ||
  counted.L2 !== index.totals.L2 ||
  counted.L3 !== index.totals.L3
) {
  fail('The pinned index does not add up. Rerun scripts/fetch-asvs-index.mjs.');
}

const floorInScope = Object.entries(index.chapters)
  .filter(([id]) => inScope(id))
  .reduce((n, [, c]) => n + c.L1 + c.L2, 0);
const excluded = Object.entries(index.chapters)
  .filter(([id]) => !inScope(id))
  .reduce((n, [, c]) => n + c.total, 0);

const scope = {
  floor_in_scope: floorInScope,
  pulled_up: PULL_UPS.length,
  total_in_scope: floorInScope + PULL_UPS.length,
  deviations: DEVIATIONS.length,
  addendum: ADDENDUM.length,
  excluded_requirements: excluded,
  standard_total: index.totals.requirements,
};

// No AAD composition lives here — the file records a profile rather than a
// construction — but it reports that emptiness rather than staying silent,
// because scripts/check-aad-coverage.mjs discovers generators instead of being
// given a list and cannot tell "no AAD" from "forgot to report".
reportAudit();

const doc = {
  $schema: 'https://done.invalid/vectors/web-security-baseline/1',
  generated_by: 'scripts/generate-baseline-vectors.mjs',
  selection: 'docs/selections/row-17-web-security-baseline.md',
  trd_row: 17,
  profile: {
    standard: 'OWASP Application Security Verification Standard',
    version: index.version,
    released: index.released,
    level: `L${FLOOR} (cumulative L1 + L2) as a floor, plus named L3 requirements`,
    pinned_index: {
      source_url: index.source_url,
      source_sha256: index.source_sha256,
      retrieved: index.retrieved,
      attribution: index.attribution,
    },
    shape:
      'A level is a floor rather than a target. The controls §10.9 names are scattered across L1, L2 and L3, so the profile is L2 plus named pull-ups plus an addendum for what the standard does not carry at any level.',
    applicability_rule:
      'A chapter is in scope unless it is excluded, and an exclusion carries a reason. A conditional exclusion carries a trigger, the way §15s deferred rows do. **The assurance value of a baseline is in the exclusions being recorded, not in the inclusions passing** — an unrecorded exclusion is how a profile becomes decoration.',
    what_the_standard_does_not_cover:
      'ASVS 5.0.0 has one requirement mentioning browser storage, and none mentioning Trusted Types, service workers or offline operation. That is a fact about what the standard is for rather than a criticism of it, and it is why the addendum exists.',
  },
  scope,
  chapters: Object.fromEntries(
    Object.entries(index.chapters).map(([id, c]) => [
      id,
      { name: c.name, requirements: c.total, in_floor: c.L1 + c.L2, ...CHAPTERS[id] },
    ]),
  ),
  pull_ups: PULL_UPS.map((p) => ({ ...p, level: `L${index.levels[p.req]}` })),
  deviations: DEVIATIONS,
  addendum: ADDENDUM,
  verification:
    'Selected in Stage 0; verified before Stage 4 ships (§13.11 level 2, sequencing §3.7). A1 is verified now, by scripts/check-origin-isolation.mjs inside `pnpm build`. The rest name their method here and acquire their check with the stage that makes them real.',
};

const json = JSON.stringify(doc, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const existing = readFileSync(OUT, 'utf8');
  if (existing !== json) {
    console.error(
      'test/vectors/web-security-baseline.json is stale. Run: node scripts/generate-baseline-vectors.mjs',
    );
    process.exit(1);
  }
  console.log(
    `web-security-baseline.json is current; ${Object.keys(index.chapters).length} ASVS ${index.version} chapters dispositioned.`,
  );
} else {
  writeFileSync(OUT, json);
  console.log(
    `Wrote a profile over ASVS ${index.version}: ${scope.total_in_scope} requirements in scope ` +
      `(${scope.floor_in_scope} at the floor + ${scope.pulled_up} pulled up), ${scope.excluded_requirements} excluded, ` +
      `${scope.deviations} deviation, ${scope.addendum} addendum controls.`,
  );
}
