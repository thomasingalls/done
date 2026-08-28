# `P-5` — policy semantics and closure-authority representation

**Decided:** 2026-08-27 · **Reopened:** 2026-08-28, at the rule's own jurisdiction · **Representation:**
`RC-8C`, targeted repairs under one stated rule — no new registry and no coverage manifest · **Suite
separation:** the stronger primitive rule, with `path` an exhaustive execution-path enum · **WebAuthn:**
same-origin only · **Origin isolation:** allowlist by default, and the claim narrowed to what the scan proves ·
**Status:** reopened — question, options and falsifiers drafted below; ratification pending

Consolidation is [`S0-1`](../action-tree.md). This is the last decision in the plan. *[Annotated 2026-08-28:
`S0-1` ran to completion on 2026-08-27, so the header's earlier "not yet consolidated" was already stale when
`S0-9` round 2 read this corpus — this record's own instance of the `FU-13` shape, corrected here in place; the
reopening below returns the closure-authority question to `S0-1`. And "last decision" is superseded by the
sprint: `RC-9` never had a decision at all, and the queue in [`HANDOFF.md`](../HANDOFF.md) is the one home of
what remains and in what order.]*

**Read the reopening at the end of this record before consuming anything above as settled.** `RC-8C` stands —
both `S0-9` rounds convicted the remediation *by* it, which is the strongest standing a rule can earn from a
challenge — and the four policy answers stand with it. What failed is the rule's quiet scope: it was ratified
saying *every* and enforced over the corpus under review alone, so the remediation's own documents — one of
them an exact `S0-9` input — kept publishing decided-away content while every checker stayed green. The
reopened question, its floors, the options and falsifiers 15–22 are drafted below; ratification is the open
step.

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
Enforcement belongs at the gate that consumes it (`L-4`), not at every build. *[Superseded in part 2026-08-28,
`FU-15`: for the X25519 table the consuming gate is `S0-10` — TRD §10.11's own sentence makes the dated
readback a Stage 0 closure input, and the hygiene commit made the `OWED` declaration, the regenerated matrix
and the queue agree with [`action-tree.md`](../action-tree.md). The discipline stands; the parenthetical named
the wrong gate for this observation, and for as long as it did, two authority records disagreed about one
debt — the exact shape the reopening below is about.]*

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

---

## Reopened 2026-08-28 — the jurisdiction of the rule (round 1 pattern 3, round 2 `FU-07`)

**Everything above stands except the scope of one word.** `RC-8C` says *every* fact and *every* consumer, and
it was enforced as if it said *every fact in the corpus under review*. Both `S0-9` rounds convicted the
remediation by its own rule: round 1's third pattern — *one fact, two homes, and the cross-check reads one of
them* ([`DISPOSITION.md`](../S0-9/DISPOSITION.md)) — was built entirely from artifacts this remediation wrote,
and round 2 found the governing instance
([`A-07`](../S0-9/followup-authority/challenge-authority.md),
[`E2`](../S0-9/followup-evidence/challenge-evidence.md), reconciled as `FU-07` in
[`FOLLOWUP-DISPOSITION.md`](../S0-9/FOLLOWUP-DISPOSITION.md)), with a return that names this record rather
than any artifact: closure authority at `P-5`/`S0-1`, then `S0-8`. [`HANDOFF.md`](../HANDOFF.md) counts the
class at six blockers — `FU-05`, `FU-07`, `FU-13`, `FU-14`, `FU-15`, `FU-16` — and states what this record
owes: the class-3 rule the remaining homes follow.

**The instance: an exact challenge input that no checker reads, publishing what the process rejected.**
[`corrected-end-state.md`](../corrected-end-state.md) is named in `S0-9`'s exact affected artifacts — the
corrected end state the challenge exists to challenge — and it was written before any decision was taken and
never revisited. At lines 13–16 and 302–303 it says `RC-1`, `RC-2`, `RC-3`, `RC-5`, `RC-7`, `RC-8` and `RC-9`
remain unselected and Stage 0 is not reviewably corrected until they are — six of those seven are decided, in
records this file predates; the seventh, `RC-9`, is genuinely open, which the queue owns and this file cannot
speak for. At six further places (76–77, 151–154, 194–196, 220, 242, 269–280) it calls choices unresolved that
`P-1` through `P-8` recorded — the last of them this record's own: the closure-authority representation,
presented as an open three-way branch by the very file this decision's jurisdiction failed to reach. And one
passage is not stale status but a live wrong rule: lines 168–175 prescribe that a final refusal licenses
exactly attempt 1, which *"cannot fork or create a third"* — the sole-successor cap `S0-4` Stage D killed by
mutation, because two epoch changes exhaust it, and replaced with the unbounded refusal chain in which each
durable refusal licenses one successor at the same position. An implementer following the exact corrected end
state builds the availability defect the remediation deliberately retired; a reviewer mistakes selected
branches for open work. Every checker stays green throughout, because none of `status:check`,
`retention:check`, `limit:check`, `vectors:check` or `trace:check` reads this consumer — `E2`'s verdict:
*"This is the precise failure mode `P-5` tried to prevent."* The file `P-1`'s record quotes for the
two-sources-of-truth hazard is itself the second source that drifted.

**The class: the rule was enforced over a jurisdiction smaller than its statement.** The remediation gave the
reviewed corpus homes, readbacks and third-party checks — and exempted its own corpus by silence. Round 1
found the shape inside the remediation three times: `DELETION_CLASSES` disagreeing with §14.7,
row 17's A1 vector byte-identical to the reviewed tip, §10.11's before-Stage-0 sentence against the `OWED`
list's `L-4`. Round 2 added the debt with two gates (`FU-15`), the ledger titled by a non-ancestor (`FU-16`),
this sprint's own records publishing retired claims (`FU-13` — and the status line at the top of this record,
annotated above), and the gate itself crediting command-text reachability as execution (`FU-14`, `E5`): at the
challenged tip `pnpm check` exited at lint, and traceability still said every artifact *runs through the
gate*. Inside the enforced jurisdiction, `E4` found the same disease in `S0-1`'s own instruments:
`status:check` scopes itself honestly in its docblock while the closure copy grants it more — a checker's
printed claim wider than its scan is `S0-1`'s founding defect, *green while enforcing less than they claimed*,
in the instrument built to end it.

`P-4` and `P-1` ratified class 1's pattern and `P-3` ratified class 2's. This record owes class 3's: **every
fact keeps one home; every other page that states it is a projection, a dated record, or superseded — and says
which; an input a gate or a challenge consumes is checked by something that executed, or it is not an input;
and a checker's printed claim is exactly its scope.**

### The reopened question

**Does `RC-8C`'s *every* reach the remediation's own documents — by what census does each of them take a
standing (a home something executed checks, a projection something regenerates, a dated record, a superseded
page that names its successors) — and which standing does `corrected-end-state.md`, an exact `S0-9` input
still publishing decided-away content, take?**

`RC-8C` itself is not reopened. Both rounds convicted the corpus *by* the rule — every class-3 blocker is
stated as a violation of it — and the four policy answers stand with it: round 1 verified `checkSeparation` as
*a genuine total classification*; the WebAuthn negatives held; the inverted scanner holds within its narrowed
claim, owing round 1's `originOf` correction at `S0-1` (any URL carrying `+` is discarded as a fragment — the
queue already carries it); the dated-observation discipline stands with its gate corrected in place above
(`FU-15`). What is reopened is the jurisdiction the ratification never wrote down, and the standing of the one
document whose drift both rounds priced.

### The floors that are not choices

**The instance floor: an artifact listed as a gate or challenge input is current under an executed check, or
it is not listed.** Whatever is ratified must refuse the reproduction: `corrected-end-state.md` cannot keep
both its `S0-9` input listing and its decided-away content while every checker passes. Round 3 (queue item 6)
does not begin against an input in that state.

**The reconstructibility floor.** The document's own `ClosureAuthority` row states the deletion condition this
program holds closure records to: *append/supersede only; prior review inputs stay reconstructible*. Rounds 1
and 2 read this file at `5923f51`, and their reports must keep their meaning — so no option repairs by making
the challenged bytes unreachable. Supersession, regeneration and in-place annotation all satisfy this; silent
rewriting and deletion do not.

**The execution floor: "checked" credits an execution, never reachability.** `RC-8C`'s third clause — checked
in both directions by something that is neither endpoint — gains the word the gate lesson paid for: the
something must have *run*. A claim backed by command text that could have run is the `FU-14` defect, whatever
the document. The receipt mechanism is `S0-8`'s design to own; the crediting rule binds every option here.

**And the jurisdiction has two existing regimes it must not disturb.** `docs/review/`'s own manifests are
hash-pinned in `config.json` and verified by `pnpm review:status` — that regime stands, untouched. Finding
dispositions under `docs/review/findings/` are `S0-10`'s separately authorized subject, and no checker
ratified here acquires authority over them. The jurisdiction that was never written down is
`docs/review/remediation/` itself — 44 markdown files, this record included.

### The options considered

Two joints: how the corpus enters the rule, and what the drifted input becomes.

**Joint 1 — the census that brings the corpus under the rule.**

**A — a total standing classification.** Every document under `docs/review/remediation/` declares its standing
from an exhaustive enum — `home | projection | record | superseded` — and a recursive walker (round 1's
non-recursive-`readdirSync` lesson is a floor of the mechanism) refuses a missing standing, an unknown value,
and a per-standing obligation left unmet: a home names the readback that checks it, a projection names its
generator, a record names the SHA it speaks of — ancestry-verified, the `FU-16` shape made permanent — and
takes edits only as dated addenda under a pin, and a superseded page opens by naming its successors. The buy
is the argument this program has now bought five times: a classification that drops what it does not recognise
cannot fail, it can only pass — `checkSeparation`'s totality, applied to the corpus that kept generating the
class. The census is complete by construction, a new file cannot enter no bucket, and the standing header
doubles as the first thing a reader needs to know about any page. The costs, recorded: one header per file
across 44 files, once; one new walker in the gate; and the record pins need a home and a re-pin discipline —
the `config.json` shape the review workspace already uses, extended rather than invented.

**B — jurisdiction by declared consumption.** No headers; the census is the input lists the gates and
challenges already publish — `S0-9`'s exact affected artifacts, the gate's readbacks — and each listed path
must resolve to a checked-current document or leave the list. The buy is the smallest edit: no mass header
pass, and the rule binds exactly the consumption edges `RC-8C` is about. The costs: the census *is* the lists,
so an undeclared consumer escapes silently — the filter defect at corpus scale, and `FU-07` arose precisely at
a consumer nobody had declared a checker for; the lists multiply and must pairwise agree, which is `FU-15`'s
shape — two authority records disagreeing about one debt — made load-bearing; and a document outside every
list still reads as current to the next challenger, its standing unwritten exactly where this reopening
started.

**C — repair the instance and add no mechanism.** Fix or retire `corrected-end-state.md` now; let `S0-9`
round 3 and its successors catch the next drift. The buy is zero machinery. The costs: review-as-checker is
the defect class itself — both rounds ran with every checker green while an input published rejected content,
so the class's detection price is one full challenge round per instance; `RC-8C`'s third clause exists because
*neither endpoint is trusted to certify itself*, and C leaves the corpus certified by whoever happens to read
it; and it hands class 3 the concession `P-4` and `P-3` refused their classes — the smallest diff, ratifying
the pattern instead of closing it.

**Joint 2 — what `corrected-end-state.md` becomes.**

One sub-question separates the options: where the corrected end state lives now that every choice the document
deferred is taken or queued.

**A — superseded: the ratified records and the corrected corpus are the end state, and the file says so.** The
document closes with a supersession header naming its successors — the seven decision records for every branch
it calls open, `S0-4`'s refusal chain for the attempt cap, the stage returns' TRD and selection homes for the
invariants and the durable-record table as they land — and leaves `S0-9`'s input list, replaced there by the
ratified records and the regenerated corpus; its challenge-era content stays reconstructible at its SHAs,
which is the supersede half of its own `ClosureAuthority` row applied to itself. The buy: the second copy
stops existing as a current statement, so the failure mode is structurally gone on this file — no maintainer,
no checker, nothing left to drift; *read the somewhere else*, taken to its conclusion. The costs: the corpus
loses its one composed narrative as a current page, so round 3 reads decisions and returns instead of one
target document; the `S0-9` node's input list amends, an edit to the plan's own home; and a migration pass
must first verify nothing still consumes it as current — at this tip the consumers are the action tree's input
list and the queue's `P-5` bullet, plus `P-1`'s quotation of its two-sources hazard, which stays true as a
quotation of the challenge-era file.

**B — a generated projection.** The document is rebuilt by a generator that reads the decision records'
status and selections and the action tree, and a third script checks both directions. The buy: the narrative
page survives, and cannot drift where it is generated. The costs are this record's own Branch-A argument,
returned home: the decision records are prose, so generating from them means either giving them machine
frontmatter — reshaping the sprint's records to feed a document — or extracting free-text blocks the checker
cannot see, which is a registry in name only with the drift moved inside the blocks; and the nuance is the
artifact — the global invariants and the durable-record table are arguments, and a projection either carries
them opaquely or throws them away.

**C — a current home, hand-maintained, with a contradiction readback.** Update the document to the ratified
state now and add a checker that reads it against the decision records — selected/open agreement in both
directions, plus the known contradiction patterns. The buy: the composed page keeps authority where
composition genuinely lives, and the known defects become permanent negatives. The costs are this record's own
Branch-B argument, returned home: a maintained second copy of every decision, with a maintainer attached — and
the checker sees only what it was told to see, the list-matcher shape `S0-1` exists to refuse. The cap
sentence was not a status word (`E2`: *not merely stale wording*), so the readback that would have caught
yesterday's drift is blind to tomorrow's by construction; and the sprint has already paid this maintenance
twice inside its own records (`FU-13`; the status line annotated above), which is what keeping a wide copy
current actually costs.

### Awaiting ratification

The ratifying edit selects one option per joint, argues each against the floors, names
`corrected-end-state.md`'s standing and its successors or readback explicitly, and instantiates falsifiers 15,
16, 17 and 18 against the selected mechanism. Until then the `S0-1` return does not begin, round 3 has no
valid input list, and nothing may cite `corrected-end-state.md` as a current statement of anything.

### Falsifiers 15–22

Continuing the fourteen above, under the floors. Each is a test, not a claim; 20, 21 and 22 bind every option,
15's *outcome* binds every option while its mechanism is ratification's to instantiate, and the rest read "the
ratified census" and "the ratified standing" as whatever ratification selects.

15. **The reproduction fails.** The two convicted passages cannot recur unread: *cannot fork or create a
    third* against `S0-4`'s refusal chain, and an *unselected/unresolved* claim against a ratified record,
    each either fails an executed check or is unreachable because the document is no longer a current input —
    demonstrated by putting either sentence back.
16. **The census is total.** Every document in the corpus resolves to exactly one standing; a new file with
    none, an unknown standing value, and a file in a subdirectory the walker missed each fail the checker
    rather than entering no bucket.
17. **A record names its subject, and the name verifies.** A `record`-standing document carries the SHA it
    speaks of and ancestry is checked — `end-state-materiality.md`, retitled by the `FU-16` hygiene, passes as
    the first instance — and a silent edit to a pinned record fails until a dated addendum re-pins it.
18. **Standing binds consumption.** Every path a gate or challenge lists as a current input resolves to a
    standing that admits current consumption, with its readback live; a superseded or record document in a
    current-input list fails; `S0-9` round 3's input list passes this before the round begins.
19. **Supersession is legible and loses nothing.** A superseded document opens with its successors before any
    old content, every named successor resolves, and the challenge-era bytes remain reconstructible at their
    SHAs — a reader landing mid-file cannot take it for current, and `git show 5923f51:…` still explains what
    rounds 1 and 2 read.
20. **A green gate attests exactly what ran.** The claim *runs through the gate* is credited only by an
    execution receipt; a check reachable in command text but skipped by an earlier exit fails the claim —
    `FU-14`'s reproduction, refused as a rule here and designed at `S0-8`.
21. **A checker's printed claim is its scope.** `status:check` and `trace:check` print conclusions no wider
    than what their docblocks scope (`E4`, `E5`); a mutation restoring the wider sentence fails — falsifier
    12's rule, pointed at the two oracles the rounds caught overclaiming.
22. **The homes agree.** [`HANDOFF.md`](../HANDOFF.md), `action-tree.md`'s `P-5`/`S0-1`/`S0-9` nodes and this
    record state the ratified census and the document's ratified standing, and a readback fails while any of
    them still lists `corrected-end-state.md` as a current challenge input or publishes the superseded
    jurisdiction — the `FU-07` shape, refused at the record that owns the shape.

### Consolidation owed at `S0-1`, regenerated at `S0-8`

- `corrected-end-state.md` disposed per the ratified joint-2 option — header, generator or readback — with the
  `S0-9` node's input list and the queue agreeing in the same commit (falsifier 22).
- The standing census per the ratified joint-1 mechanism, joining the gate; the record pins, with
  `end-state-materiality.md` and the two `S0-9` dispositions as first entries.
- Round 1's `originOf` correction — a URL carrying `+` is currently discarded as a fragment — with the
  republished claim narrowed or the pattern fixed, in the same return the queue already assigns it.
- The two claim-narrowings from `E4`/`E5`: `status:check`'s and `trace:check`'s printed conclusions restated
  to their scopes now; `trace:check`'s execution-receipt redesign stays at `S0-8` (`FU-14`).
- At `S0-8`: traceability consumes execution receipts, never shell text; the regenerated matrix's
  population-agreement step gains the standing census as an input; the five matrix limits repair as already
  queued.

### What this reopening does not decide

- **`FU-14`'s receipt mechanism** — `S0-8`'s design. The execution floor fixes what a claim may credit, not
  how receipts are produced.
- **`FU-13`'s remaining homes** — TRD §15 row 3 and the record vectors ride the `S0-3` return, exactly as
  `P-3` assigned them; `FU-05`'s republication rides `S0-2`'s regeneration.
- **The four policy answers** and `S0-1`'s four checks within their stated scopes — not reopened; round 1
  verified the separation check's totality by mutation.
- **`RC-9`** — next in the sprint, untouched here. Which gate owns `wasm:stale` and the `L-4` evidence set is
  its question, and the standing census does not answer it.
- **Finding dispositions** — `S0-10`'s separately authorized workflow, exactly as the boundary above states;
  the census classifies nothing under `docs/review/findings/`.
- **`docs/decisions.md`'s stale row count** — outside this jurisdiction and already assigned to `H-1`'s
  append-only ledger.
