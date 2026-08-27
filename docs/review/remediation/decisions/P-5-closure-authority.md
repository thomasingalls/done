# `P-5` — policy semantics and closure-authority representation

**Decided:** 2026-08-27 · **Representation:** `RC-8C`, targeted repairs under one stated rule — no new registry
and no coverage manifest · **Suite separation:** the stronger primitive rule, with `path` an exhaustive
execution-path enum · **WebAuthn:** same-origin only · **Origin isolation:** allowlist by default, and the
claim narrowed to what the scan proves · **Status:** decided, not yet consolidated

Consolidation is [`S0-1`](../action-tree.md). This is the last decision in the plan.

## Five questions, and the fifth is the one that shapes the rest

`RC-8` is explicitly _an umbrella remediation surface, not one causal ancestor_: five independent divergences
that happen to converge at closure. Four are policy choices. The fifth — how closure is represented — is the one
the lineage says no evidence selects, and the one that decides how the other four are enforced. So it goes
first.

## The representation: neither branch, because the project already converged on a third

**Branch A** declares every closed row, carrier, capability and policy once in a `ClosureRegistry` and projects
it into the documents. **Branch B** leaves the documents authoritative and adds an independently maintained
`ClosureCoverage` manifest that CI checks in both directions.

Both are wrong for this repository, for opposite reasons.

**Branch A cannot hold what these documents are.** §15's register cell for row 15 is three sentences of
argument; row 16 §4 argues a number from the failure it protects against. The options record admits it — _cannot
encode all narrative nuance_ — and here the nuance **is** the artifact. A generated projection would either
throw the arguments away or become a schema with a free-text field, which is a registry in name only.

**Branch B is the defect it is meant to fix.** A coverage manifest is a second copy of every mapping, maintained
by a different owner from the artifact it describes. This project's recorded failure mode is _a generator
holding a string that describes a state somewhere else_ — row 1's suite file publishing a superseded library,
its deferral entries naming rows since answered, §16's four stale cells, row 4's carrier reading "unselected"
for the whole interval after row 4 closed. Every one of those is a second copy that drifted. Adding a canonical
second copy of everything is that failure mode with a maintainer attached.

**And the recorded fix has been the same every time: read the somewhere else.** `checkCoverage` reads TRD §15.1
instead of trusting an owner string. `check-retention.mjs` reads the PRD and §16 instead of restating the
number. `S0-7`'s cross-check reads the transition vector and the executable model instead of naming the kinds.
Each of those found something the moment it was written. That is not a branch anyone chose; it is a practice the
project arrived at four separate times, and what is missing is that nobody stated it as a rule.

> **`RC-8C`.** Every fact has exactly one home. Every consumer reads the home rather than restating it. Where
> two artifacts must agree, the agreement is checked **in both directions, by something that is neither of
> them** — so that neither endpoint is trusted to certify itself.

**The third clause is what makes it independent coverage**, which is the property the plan asked for and the
reason a domain owner marking their own work complete does not qualify. `check-retention.mjs` is neither the
TRD nor the model, and it fails whichever one is missing what the other has.

**Adopting a rule the code already follows is worth less than it sounds and more than nothing.** It costs
nothing to take, it makes the next check's shape a decision rather than a judgement call, and it gives `S0-8`'s
traceability matrix a criterion instead of a survey.

## 1. Suite separation: the stronger rule, and `path` becomes total

**The stronger rule is selected** — no primitive is used on both the asynchronous and synchronous paths — and
§13.2's narrower key-reuse rule is implied by it rather than standing beside it.

**The argument that decides it is not strength, it is checkability.** A suite table names primitives; it does
not name keys. _No primitive key reused across the two constructions_ cannot be asserted from this data at all
— it needs a derivation graph — so selecting the narrow rule means either building a different oracle or
admitting the check enforces nothing while the row claims it does. The strong rule is the one this artifact can
actually assert, and nothing in the suite violates it.

**`path` means where the primitive executes**, and that definition is load-bearing. HKDF-SHA-256 derives the
journal subkey — a key used synchronously — and is labelled `async` because the derivation runs at open. Row 1
already says so: _labels are what keep §13.2's separation real_. Without the definition written down, "it
produces something the sync path uses" is a live reading, and it is how a second `both` gets added.

**`both` is not a valid value, and rejecting it is the point.** Under the selected rule a primitive on both
paths is precisely the violation, so a label asserting it is a violation asserting itself. The enum is
`async | sync | none`, `none` means **this role selects no primitive** — and a `none` role whose primitive is
not literally none is refused, because otherwise `none` is a hatch for hiding a primitive from the check exactly
as `both` was.

**The general defect is the filter, not the value.** `bucket()` is
`filter(r => r.path === want)`, so **anything unrecognised silently enters no bucket** — `both` today, and
`'Async'`, `'sync '` or `'shared'` tomorrow. A classification that drops what it does not recognise cannot fail;
it can only pass. So the repair is a **total** classification over an exhaustive enum that throws on an unknown
value, and the same reading applies to every other check in that file.

**And the prose is already right**, which is the tell that the label is what is wrong: row 1 §3 lists SHA-256 in
the asynchronous set. Nothing on the synchronous path hashes — the seal is XChaCha20-Poly1305 and base64 — so
`hash` is `async`, the published set stops disagreeing with the document, and the intersection stays empty for a
reason rather than by accident.

## 2. WebAuthn: same-origin only

**`crossOrigin: true` is refused, and a present `topOrigin` is refused.** No allowlist.

There is no embedding partner to allow. The product is a standalone application whose §10.9 boundary _is_ the
origin, row 17's addendum already forbids third-party assets in it, and nothing in the PRD proposes running
inside somebody else's page. An allowlist would be a maintained list with no entries, and a mechanism with no
current use is a mechanism whose failure modes arrive before its benefits.

**Two checks and not one, because they can disagree.** The specification emits `topOrigin` only when
`crossOrigin` is true, so a ceremony carrying `crossOrigin: false` **and** a `topOrigin` is a client contradicting
itself, and a verifier that reads only the boolean accepts it. Each gets its own negative, and — the recurring
trap — the negatives are separated: `crossOrigin: true` with **no** `topOrigin`, and `topOrigin` present with
`crossOrigin: false`. A negative setting both proves neither check exists.

**The deployment control is real and does not replace this.** CSP `frame-ancestors 'none'` makes the framed
ceremony unreachable, and it is the same header §3 selects below — one artifact answering two findings. But it
is deployment state, verifiable only at a release gate, and §10.9's own argument is that the origin boundary is
defended in the build rather than assumed. The verifier is the half that can be tested now.

## 3. Origin isolation: allowlist by default, and the claim narrowed to what is proved

`check-origin-isolation.mjs` recognises seven literal fetch syntaxes and fails on those; **every other remote URL
is logged as a "mention" and passes**, while the script prints _the key-holding origin is first-party only_. The
finding is right that `fetch`, `WebSocket`, `EventSource`, `setAttribute`, worker constructors and evaluated
fetched code are all outside the failing set.

**`ALLOWED_ORIGINS` is already empty, which means the syntax list was never needed.** If no remote origin may be
referenced, the distinction between a fetching form and a mention has no policy behind it — and the script
already computes the set of every remote origin it sees. **So the default inverts: every remote origin in built
output is a violation unless it is allowlisted with a reason.**

**Measured before selecting, because "it will be noisy" is the objection that would kill it.** Scanning the
current build finds **one** remote origin: `http://www.w3.org`, and every occurrence is an XML namespace
identifier — the SVG, MathML, `xlink` and `xml` namespaces React passes to `setAttributeNS`. Those are names,
never fetches. **The inversion costs one allowlist entry, and it is a category rather than a party.**

**What remains after that is irreducible for a static scan, and the claim shrinks to match.** A URL assembled
from parts, or code fetched and evaluated, is invisible to any regex — the scanner's own `originOf` already
discards anything carrying JavaScript punctuation as a fragment. So:

- **The build-time claim becomes exactly what it proves:** _no literal remote URL appears in built output, and
  the one allowed namespace identifier is not a fetch._ Strictly stronger than today's check and strictly weaker
  than today's sentence.
- **CSP is the runtime control for the residual**, selected now: `default-src 'self'`, `connect-src 'self'`,
  `frame-ancestors 'none'`. §10.9 already calls for CSP and row 17's addendum already carries it; what is added
  is that the _static claim depends on it_ rather than standing alone.
- **The readback is a release gate.** A deployment-served header cannot be verified from the repository, so
  row 17's A1 keeps its CI verification for the narrowed claim and gains an as-built check for the rest.

## 4. External observations are dated and expire

X25519's absence behaviour and row 17's runtime controls are claims about the outside world. They have no home
in the repository to read, so `RC-8C`'s rule does not reach them and they need their own discipline:
**every external observation carries its source, its date, and an expiry — and an observation with no expiry is
the same defect as an unbounded retention** (§16.6's instinct, at a different object).

This is why §10.11's evidence table is **correctly empty** rather than incomplete: its own rule is a floor _with
evidence and a date_, and an asserted version row would be worse than the omission. What `P-5` adds is that
emptiness is the right state until a dated source exists, and that the expiry is declared when it is filled.
Enforcement belongs at the gate that consumes it (`L-4`), not at every build.

## 5. Current selection status has one authority, and it is §15.1

The register is already the home and `checkCoverage` already reads it. What is missing is the **other**
direction: nothing checks that the PRD's own status statements agree with it, which is how
`f-tip-prd-stale-selection-status` survived. Under `RC-8C` that is a both-directions check, in neither document.

## What `S0-1` builds

1. `checkSeparation()` as a **total** classification: exhaustive enum, throw on an unknown `path`, reject
   `both` naming the rule it violates, reject a `none` role whose primitive is not none. `hash` becomes `async`.
   The same reading applied to `checkCarriers` and `checkCoverage`.
2. `crossOrigin` and `topOrigin` verification in `scripts/lib/webauthn.mjs`, consumed by both ceremonies, with
   the two negatives kept separable.
3. The scanner inverted to allowlist-by-default, one documented namespace entry, the printed claim narrowed to
   what it proves, and the CSP profile named as the residual's control.
4. The PRD↔§15.1 status check, both directions, in neither document.
5. The dated-observation discipline written where §10.11's table lives.

## Falsifiers

1. A role labelled `both` fails the build, and the message names the rule rather than the enum.
2. An unknown `path` value — a typo, a new word — fails rather than entering no bucket.
3. A `none` role whose primitive is a real primitive fails.
4. Two roles sharing a primitive across `async` and `sync` still fail, as they do today.
5. The published async/sync sets equal what row 1 §3 lists, and a divergence fails.
6. A ceremony with `crossOrigin: true` and **no** `topOrigin` is refused, for that reason.
7. A ceremony with `crossOrigin: false` and a `topOrigin` present is refused, for that reason.
8. The ordinary same-origin ceremony still verifies, and both existing vectors still pass.
9. A built file containing `fetch("https://x.example")` fails, which it does not today.
10. A built file containing a remote URL in **any** position fails unless allowlisted.
11. The allowlisted namespace identifier passes, and adding a second origin without a reason fails.
12. The printed conclusion states only what was checked; a mutation restoring the old sentence fails a check.
13. A PRD subsection calling a selected row open fails, and a §15.1 row marked open with no PRD statement fails.
14. An external observation without a date or an expiry fails at the gate that reads it.

## What this does **not** decide

- **The CSP profile's exact bytes** and its as-built readback, which are row 17 and `L-4`.
- **Whether `ALLOWED_ORIGINS` should distinguish namespace identifiers from fetchable origins structurally.**
  One entry with a reason is enough; a second category is worth building when there is a second member.
- **The X25519 evidence table's contents**, which need a dated external source `S0-1` may not have.
- **Whether `S0-8`'s traceability matrix is generated or written.** `RC-8C` gives it a criterion — one home,
  read not restated, checked in both directions by a third party — and leaves the form to that action.
