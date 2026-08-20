# Stage 0 lineage review — work-item briefs

These briefs bound the rows in `work-items.tsv`. The artifact template remains the required report shape. A brief
may narrow a task but may not change the pinned review boundary.

## `F-01` — original contract

**Purpose:** Recover what the project had actually committed itself to at `c611666`, before final-selection
rationales anchor the reading.

**Read first:** every `docs/` file at `c611666`, with PRD, TRD, sequencing and progress primary. Read historical
sessions only where a promoted requirement's wording needs provenance. Do not read tip selection records before
the first complete draft.

**Produce:** stable original-claim ids covering terminology, actors, threat boundaries, persistence assumptions,
security and continuity guarantees, algorithm constraints, open candidates, explicit non-goals, Stage 0 exit
criteria, early warnings, plan assumptions, and remaining product choices. Quote sparingly; cite `SHA:path` and
section. Record ambiguity rather than resolving it with later prose.

**Complete when:** every original TRD §15 row and every Stage 0 criterion maps to at least one claim id; the ledger
distinguishes requirement, candidate, assumption, risk, open choice and non-goal.

## `F-02` — independent end-state model

**Purpose:** Derive what `9edd930` actually specifies, without first arguing that the original plan warranted it.

**Read first:** tip PRD/TRD, all 17 selection records, tip decisions/progress/performance, generators and artifacts
named by those records, and relevant tip code read through Git objects.

**Produce:** actors and trust boundaries; key/credential hierarchy; persistent records; state machines for local
startup, journal, admission/finalization, checkpoint/restore, enrollment, recovery, transitions and migration;
claimed guarantees and explicit residuals; selected/open row map; evidence/oracle map. Assign stable end-state
claim ids. Do not label a construction correct or incorrect.

**Complete when:** every selected row, open row and claimed assurance gate has a consumer and evidence path, and
every state transition names its durable state and crash behavior or records that the documents do not.

## `B-01` — late protocol closure and amendments

**Commits:** lineage order 1–13, `9edd930` back through `b9ff071`.

**Focus:** recovery step-up nonce/binding; hosted-retention reasoning and inventory propagation; deferral checks;
published suite identity; ASVS profile and exclusions; transition intent/outcome protocol; account credential and
slot binding; the seven nearby traceability commits.

**Complete when:** 13 commit cards are complete in reverse order and the batch report reconciles cross-amendments,
especially where rows 12, 14, 15, 16 and 17 change earlier suite, recovery or service assumptions.

## `B-02` — protocol core and WASM seal

**Commits:** lineage order 14–19, `130757d` back through `a073574`.

**Focus:** the WASM seal and its auditability/support claims; mark versus log; package unification; attribution in
the content root; envelope encoding and chain-head discovery; accepted chains, finalization and enrollment.

**Complete when:** six cards and the batch report explain the accepted-state theorem, fork/equivocation bound,
retention dependencies, trust-root anchor and any conclusion made true only by a later commit.

## `B-03` — evidence and empirical course correction

**Commits:** lineage order 20–27, `f58e0de` back through `98f2a83`.

**Focus:** field-elision coverage; documentation catch-up; WASM/libsodium pricing; language-versus-library claim;
real-device breach; whole-write versus AEAD measurement; Baseline support floor; isolated negatives.

**Complete when:** eight cards and the batch report distinguish measurement from inference, reproduce arithmetic
where possible, name irreproducible device evidence, and assess whether each new check tests the intended isolated
property rather than the observed example.

## `B-04` — initial storage selections and baseline

**Commits:** lineage order 28–35, `dbfd01f` back through `caee157`.

**Focus:** propagation of the first five selections; device-lock factor and enrollment rotation; terminology
migration; recovery entropy; suite/record formats; journal construction; review booking; plaintext baseline.

**Complete when:** eight cards and the batch report state what was knowable at each decision, what later evidence
changed, and whether the first fold preserved caveats from the selection records.

## `X-01` — cryptography and key custody

Re-derive primitive-role separation, domain-separation labels, suite/carrier versioning, local/content/recovery
keys, credential roles, custody tiers, stale-copy threat, enrollment rotation, extractability and agility costs.
Check key compromise and substitution separately from guessing.

## `X-02` — crash and persistence

Construct the exact startup and write ordering for key envelopes, records, journal and trim. Test kills between
every durable action, nonce reuse, sequence exhaustion/reset, replay idempotency, stale plaintext stores, partial
enrollment and synchronous-seal availability.

## `X-03` — accepted state

Re-derive envelope authentication, per-credential positions, link marks, signed heads, final cutoffs, checkpoint
coverage, fallback and outbound retention. Test refused writes, lost replies, two forks, two checkpoint producers,
old-generation deletion and a hostile relay separately from a hostile authorization service.

## `X-04` — lifecycle

Model enrollment, account unlock, device revocation, content rotation, recovery replacement, lapse, retirement and
account deletion. Test replay, operation substitution, duplicate intent, conflicting intent, lost signed outcome,
stale device return and total-device-loss recovery.

## `X-05` — continuity

Trace attribution claims, body commitments, editing after creation, compaction, checkpoint migration, package trust
root, live-to-retired upgrade, hosted retention and cutover loss. Separate data recovery, authenticated history,
service independence and preservation of local replicas.

## `X-06` — platform and evidence

Audit WebCrypto/WebAuthn/browser/WASM/SIMD availability at decision time and at the promised support floor; ASVS
coverage and addenda; official KAT provenance; generator/verifier independence; negative-test isolation; benchmark
method, bundle accounting and device generalization. Use primary sources with versions and retrieval dates.

**Every `X-*` artifact must include:**

| Relevant claims/rows/commits | Reconstructed invariant | Actors and durable state | Scenario or counterexample | Evidence | Conclusion |
| --- | --- | --- | --- | --- | --- |

It must also classify each conclusion `affirmed`, `qualified`, `reopen`, or `unresolved` and name the strongest
disconfirmation attempt.

## `P-01` — propagation audit

For every original and end-state claim id, trace original wording, introducing commit, selection reasoning,
then-current fold, final PRD/TRD, executable artifact and downstream consumers. Classify `preserved`, `qualified`,
`lost`, `contradicted`, `unimplemented`, or `not applicable`. Locate the first divergence commit with a short
forward replay.

Required row shape:

| Claim id | Original source | Introducing commit | Selection record | Final requirement | Executable evidence | Consumers | Disposition | First divergence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

## `S-01` — adversarial scenarios

Execute on paper, and dynamically only where justified: crash at every persistence boundary; relay refusal versus
silence; service equivocation; stale profile restore; simultaneous enrollment/rotation; newest-checkpoint loss;
old-generation deletion; total-device-loss recovery; lapse/expiry; migration; retirement; service disappearance;
compromised browser origin. Record initial state, event sequence, expected invariant, observed design outcome and
which evidence distinguishes them.

Required row shape:

| Scenario | Initial state | Ordered events | Expected invariant | Designed outcome | Evidence | Result | Residual |
| --- | --- | --- | --- | --- | --- | --- | --- |

## `V-01` — independent challenge

Challenge every candidate/validated finding and each load-bearing affirmative conclusion. Prefer an agent that did
not originate it. Attempt the strongest counterargument, check primary sources and state transitions again, merge
duplicates, preserve rejections, and recommend validated/qualified/inconclusive/rejected dispositions.

The `V-01` owner must differ from each finding's `created_by` owner. Record that owner in `challenged_by` on every finding it
disposes. Required row shape:

| Finding or conclusion | Origin owner | Strongest challenge | Independent evidence | Result | Final disposition |
| --- | --- | --- | --- | --- | --- |

## `Z-01` — synthesis

Reconcile all artifacts into the user's requested judgment. Separate sound conclusions, sound but bounded
tradeoffs, documentation/propagation defects, evidence gaps, design conclusions that should reopen, and product
choices that evidence cannot settle. Do not treat the number of findings as the answer. Confirm all 35 cards, all
claim ids, six seam audits, scenario results and independent challenges are accounted for before completion.

Required accounting table:

| Area | Artifact count expected | Count present | Unresolved | Synthesis disposition |
| --- | --- | --- | --- | --- |
