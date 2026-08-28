# Action tree from the pinned state

## Repairs already applied on this branch

Eight findings were repaired directly on the pinned tip before any `P-` decision was taken, because none of them
needed one. They are recorded here so the actions below do not overstate what remains; **no finding file's
`status:` was touched**, since `S0-10` reserves disposition changes for the separately authorized
validation/remediation workflow. The population in
[`end-state-materiality.md`](./end-state-materiality.md) is likewise unchanged and still reads 19/9/5/4.

| Finding | Owning action | State | What remains |
| --- | --- | --- | --- |
| `f-9b49b74-wasm-glue-key-nonce-lengths` | `S0-3` | **Closed, falsifier in place.** Exact 32/24 widths enforced before any byte reaches WASM memory; 7 negatives, each mutation-tested. | Nothing. |
| `f-9860a0b-journal-rotated-vector-reuses-key` | `S0-3` | **Closed, falsifier in place.** Generation 2 has its own root; `wrong-generation-key` opens the gen-2 record with gen-1's subkey under gen-2's correct AAD. | Nothing. |
| `f-992bc91-network-carrier-registry-stale` | `S0-4` | **Closed, falsifier in place.** Carrier filled in from row 4 with three acceptance rows; `checkCarriers` now reads the owning row's own status line. | Nothing. |
| `f-tip-prd-stale-selection-status` | `S0-1` | **Closed by document repair.** All three PRD subsections report the selection; row 14's confirmation UX is still open and still says so. | No executable cross-document oracle. That is `S0-1`'s bidirectional coverage work and still needs `P-5`. |
| `f-dbfd01f-record-nonce-ceiling-omitted` | `S0-3` | **Closed by document repair.** TRD §6.1 and §15 row 3 carry SP 800-38D §8.3's 2^32 and rotate-before-write, equality first disallowed. | The build-failing boundary test the finding asks for. It cannot be written until `P-3` selects the per-generation count the comparison reads — which the TRD now says explicitly rather than implying the rule is complete. |
| `f-b997cdb-checkpoint-key-retention-inverted` | `S0-2` | **Closed by document repair.** Subject corrected to the generation in row 7 twice and TRD §7.6 once. | Which objects constitute an opener — local key envelope, retained recovery wrap, reader wrap. That is `RC-2` generation-reference accounting, gated on `P-1`/`P-2`. |
| `f-bd87655-x25519-support-floor-omitted` | `S0-1` | **Partially closed.** §10.11 gains the fourth statement with the four exact `SubtleCrypto` operations and the absence behaviour — a refusal at the capability check, so no ceremony consumes a credential, nonce or transition id on its way to failing. | The dated evidence table. Left empty deliberately: §10.11's own rule is a floor *with evidence and a date*, and an asserted version row would be worse than the omission. Required before `S0-10`. |
| `f-66a7c6a-journal-benchmark-overwrites-one-slot` | `S0-3` / `L-4` | **Partially closed, and probed.** Each write now takes its own slot, bounded to a production-shaped occupancy; quota is reported with the write count. The probe was then run — [`probes/journal-append-probe.md`](./probes/journal-append-probe.md) — and found **no material difference** between append and hot-key overwrite, with an identical 60 µs p95 at 4096 B. The Stage 0 premise survives; this no longer threatens the row-2 selection. | An immutable append burst on a **declared device population**, still owed at `L-4`. The probe's unbounded arm also measured a hard `localStorage` quota wall at ~92k entries, which is an input to `P-3`/`S0-3` rather than to this finding. |

**One incidental defect, found while applying these and not in the finding population.** The pinned tip does not
pass its own gate: `pnpm check` fails at `9edd930` on both `lint` and `format`, on files unrelated to any repair.
Worse, the documented remedy is harmful — `pnpm format:fix` reformats four markdown documents and breaks the TRD
§15.1 register parser, which silently takes `scripts/generate-suite-vectors.mjs` down with it. Every document diff
on this branch is therefore surgical and the formatter was not run. This belongs with `RC-9`'s gate governance and
`L-4`'s CI evidence: a tip asserting Stage 0 is ready to close while failing its own check script is the same
class of defect as a green oracle that cannot see what it claims to check.

## Dependency graph

```text
P-1, P-2, P-6 -> S0-2 recipient + generation authority
P-3            -> S0-3 local write machine
P-5            -> S0-1 closure authority
S0-1, S0-2     -> S0-4 exact-byte outbound spool/refusal
S0-2, P-8      -> S0-5 checkpoint semantics + creation authority
S0-2, S0-5, P-6 -> S0-6 package/portable authority
S0-2, S0-6, P-4 -> S0-7 lifecycle/deletion design
S0-1..S0-7      -> S0-8 regenerated evidence
S0-8 -> S0-9 independent challenge -> S0-10 corrected Stage 0 closure

Later implementation / release
  S0-10 -> L-1 encrypted local store and legacy cutover
        -> L-2 account/acceptance/outbound/transition services
        -> L-3 checkpoint/package/recovery/lifecycle/continuity execution
        -> L-4 platform, performance, toolchain, and external-review release gates

Non-blocking history
  H-1 append-only historical ledger corrections
```

The graph is ordered by authority rather than file-edit convenience. `S0-1`, `S0-2`, and `S0-3` can begin after
their decisions; `S0-4` waits for `S0-1/2`; `S0-5` waits for `S0-2` and `P-8`; `S0-6` waits for `S0-2/5`; and `S0-7`
waits for `S0-2/6`. Schema prototyping may run in parallel, but those interfaces converge before their consuming
action closes.

**The `P-` nodes are not peers, and the numbering does not say so.** The longest chain is
`P-1 → P-2 → S0-2 → S0-5 → S0-6 → S0-7 → S0-8 → S0-9 → S0-10`, with `P-8` entering at `S0-5`. `P-3` and `P-5` sit
off that chain entirely — `P-3` gates only `S0-3` and `P-5` only `S0-1`, and neither is consumed again before
`S0-8`. `P-4` gated only `S0-7`, the last action before evidence regeneration. **Every `P-` node is now
decided**, so the ordering advice above is history: what remains is `S0-1`, `S0-3` and `S0-4`, and then `S0-8`
onward. `S0-1` and `S0-3` are startable now and are independent of each other; `S0-4` needs `S0-1` plus `S0-2`,
which is done. A reader working the list in
number order will therefore spend the critical path's slack on decisions nothing is waiting for. Taken one at a
time, the order is **`P-1` first**, because it constrains `P-2` by its own prerequisites, reaches rows 5/9/11/15,
and shares its quorum question with `P-8` — answering it first stops that question being decided twice.

**`P-1` is decided, and that changes what comes next.** Before it was taken, `P-8` was second precisely because of
the shared quorum question. That coupling is now discharged — `P-1` answered single-owner and `P-8` adopts or
diverges — so `P-8` reverts to its natural slack: it is not needed until `S0-5`, which cannot begin until `S0-2`
finishes. The binding constraint was therefore `P-2` and `P-6`, which together with the decided `P-1` are the three
inputs `S0-2` waits on, and `S0-2` is the widest action on the path.

**`P-1`, `P-2`, `P-6` and `P-8` are decided, so `S0-2` is unblocked and is the next thing to build.** It is the
widest action on the path and three further actions wait on it; `S0-5` now waits on `S0-2` alone. `P-3`, `P-5`
and `P-4` remain off the path entirely — nothing waits on them until `S0-8`, so they can run in parallel with
`S0-2` or after it.

Remaining decisions: `P-3` and `P-5`. Neither blocks any action now started; `P-3` gates `S0-3` and `P-5`
gates `S0-1`, and both feed `S0-8`.

### Exact artifact key

Every “row N” reference below expands to the exact pinned-tip paths in this table; “generator/vector” means the two
paths on the same row. This keeps each action readable without leaving affected artifacts ambiguous.

| Row | Selection | Generator/check | Checked vector |
| --- | --- | --- | --- |
| 1 | `docs/selections/row-1-algorithm-suite.md` | `scripts/generate-suite-vectors.mjs` | `test/vectors/algorithm-suite.json` |
| 2 | `docs/selections/row-2-journal-aead.md` | `scripts/generate-journal-vectors.mjs` | `test/vectors/journal-aead.json` |
| 3 | `docs/selections/row-3-record-format.md` | `scripts/generate-record-vectors.mjs` | `test/vectors/record-format.json` |
| 4 | `docs/selections/row-4-envelope-format.md` | `scripts/generate-envelope-vectors.mjs` | `test/vectors/envelope.json` |
| 5 | `docs/selections/row-5-finalization.md` | `scripts/generate-finalization-vectors.mjs` | `test/vectors/finalization.json` |
| 6 | `docs/selections/row-6-antireplay-retention.md` | `scripts/generate-antireplay-vectors.mjs` | `test/vectors/antireplay.json` |
| 7 | `docs/selections/row-7-checkpoint.md` | `scripts/generate-checkpoint-vectors.mjs` | `test/vectors/checkpoint.json` |
| 8 | `docs/selections/row-8-attribution-record.md` | `scripts/generate-attribution-vectors.mjs` | `test/vectors/attribution.json` |
| 9 | `docs/selections/row-9-chain-head-discovery.md` | `scripts/generate-head-discovery-vectors.mjs` | `test/vectors/head-discovery.json` |
| 10 | `docs/selections/row-10-portable-package.md` | `scripts/generate-package-vectors.mjs` | `test/vectors/package.json` |
| 11 | `docs/selections/row-11-enrollment-ceremony.md` | `scripts/generate-enrollment-vectors.mjs` | `test/vectors/enrollment-ceremony.json` |
| 12 | `docs/selections/row-12-account-credential.md` | `scripts/generate-account-credential-vectors.mjs` | `test/vectors/account-credential.json` |
| 13 | `docs/selections/row-13-device-lock.md` | `scripts/generate-device-lock-vectors.mjs` | `test/vectors/device-lock.json` |
| 14 | `docs/selections/row-14-recovery-code.md` | `scripts/generate-recovery-vectors.mjs` | `test/vectors/recovery-code.json` |
| 15 | `docs/selections/row-15-transitions.md` | `scripts/generate-transition-vectors.mjs` | `test/vectors/transition.json` |
| 16 | `docs/selections/row-16-hosted-retention.md` | `scripts/check-retention.mjs` | no standalone vector |
| 17 | `docs/selections/row-17-web-security-baseline.md` | `scripts/generate-baseline-vectors.mjs`; `scripts/check-origin-isolation.mjs` | `test/vectors/web-security-baseline.json` |

Shared exact artifacts used by several actions are `scripts/lib/webauthn.mjs`, `scripts/check-aad-coverage.mjs`,
`scripts/build-wasm-seal.mjs`, `scripts/check-wasm-seal.mjs`, `scripts/bench-journal-device.mjs`, and the exact PRD/TRD
sections named in each action. A future service/worker/schema named below is itself the required new artifact; its
repository path is a prerequisite output of the corresponding implementation action, not something present at the
pinned tip.

## External reviewer and product decisions

### `P-1` — choose the `RecipientAuthority` representation

> **Decided 2026-08-26: `RC-1B`, client-certified recipient set inside each authorization successor, with
> single-owner approval.** Record and reasoning:
> [`decisions/P-1-recipient-authority.md`](./decisions/P-1-recipient-authority.md). `S0-2` consolidates it;
> nothing is implemented yet. The eleven falsifiers `S0-2` must satisfy are in that record.

- **Prerequisites:** accept the common `RC-1` invariant; decide whether client approval of recipient changes is
  single-owner or quorum-like and how recovery works when no current device survives.
- **Affected artifacts:** `docs/PRD.md` §§6.3/7.3–7.4; `docs/TRD.md` §§7.3/13.2/13.5–13.8/15; selections rows
  5/9/11/14/15; enrollment/head/recovery/transition generators and vectors; authorization/device-list schema.
- **Type:** product work + design.
- **Safe parallel work:** threat-model and metadata/availability comparison of `RC-1A` versus `RC-1B`; no final row
  edits until the authority location is chosen.
- **Acceptance/falsifiers:** a future rotator that did not run the ceremony rejects a service-only reader and an
  `R_pub` substitution while retaining every legitimate installed reader; crash and last-device-loss paths are
  explicit.
- **Downstream invalidated if changed:** `S0-2`, recovery/package recipient rules, transition wrap maps, enrollment
  vectors, malicious-authorization review scope.
- **Rollback/reconsideration:** before any new epoch/certificate byte format is declared selected.
- **No-action consequence:** two high findings survive and the central authorization/decryption separation remains
  false under delayed delivery.

### `P-2` — choose locked-device future-generation gating

> **Decided 2026-08-26: `RC-2A`, replace the operational wrapping credential at lock enable**, with the old
> credential valid until the certified-set successor and generation winner are durably known. Record and
> reasoning: [`decisions/P-2-device-lock-gating.md`](./decisions/P-2-device-lock-gating.md). The factor-gated
> future-copy promise is **retained**, not narrowed. `S0-2` consolidates it; ten falsifiers are in that record.

- **Prerequisites:** `P-1` recipient authority — **satisfied**. Retain the factor-gated future-copy promise or
  explicitly reopen the product guarantee.
- **Affected artifacts:** PRD §7.2; TRD §§13.3–13.4/13.7; rows 13/15; device-lock and transition vectors; operational
  credential custody and device-list behavior.
- **Type:** product work + design.
- **Safe parallel work:** prototype/measure credential replacement (`RC-2A`) and nested factor-gated self-wrap
  (`RC-2B`) in disposable design artifacts.
- **Acceptance/falsifiers:** pre-lock no-PRF profile cannot open `g+1` after settled lock; `rotation_owed` copy is
  truthful; factor loss and another-device rotation behave as declared.
- **Downstream invalidated if changed:** `S0-2`, row-13 UX, authorization transitions, generation cleanup tests.
- **Rollback/reconsideration:** before locking recipient state or wrap formats into row 13/15 vectors.
- **No-action consequence:** successful rotation still admits the reader-key bypass and the current copy still
  overstates the pending interval.

### `P-3` — choose write-admission behavior for oversize/storage failure

> **Decided 2026-08-27: `RC-3C`, bound the operation rather than the write-ahead log.** Record and reasoning:
> [`decisions/P-3-write-admission.md`](./decisions/P-3-write-admission.md). **Neither branch's premise held.**
> The 64 KiB seal buffer is not the binding constraint — §12's 1 ms journal budget runs out at about **20 kB**
> on the measured handset, so the guard sits about **3.2× past** a budget the design calls a correctness
> property. And Branch B does not remove the cap: chunking seals the same bytes on the same thread, and the
> append probe measured this origin's real ceiling at ~5.3 M stored characters. So one update is always one
> entry, **no operation may produce an update above `MAX_UPDATE`** — paste, import, migration and bulk
> maintenance slice instead — remote updates leave the journal's contract because §6.1's accepted-head ordering
> already covers them, and quota plus unavailability collapse into the one not-durable state PRD §7.10 already
> governs. Allocation is **per batch, exactly sized**, and the 2^32 comparison reads sequences **reserved**
> under a generation rather than committed. Thirteen falsifiers are in that record.
>
> **Nothing is refused and the WASM module does not change.** The limit is on updates, not operations, so a
> large paste appears progressively rather than failing — which is the blocking progress state Branch B says
> large writes need, without the group-commit machinery. `MAX_UPDATE`'s exact value is derived from the budget
> on the declared support population and is therefore downstream of
> `f-bd87655-baseline-not-performance-floor`; 16 kB is an interim floor to build against.

- **Prerequisites:** decide whether the product permits a pre-mutation operation/update ceiling. Obtain feasibility
  measurements for staged arbitrary-size WAL and for per-write versus range allocation.
- **Affected artifacts:** PRD authoring/import limits; TRD §§6.1/10.10/12; rows 2/3; WASM interface; journal/record
  vectors; local store API and performance plan.
- **Type:** product work + design.
- **Safe parallel work:** allocator and trim-watermark design can proceed independently of the oversize UX; benchmark
  work can compare both branches without selecting one.
- **Acceptance/falsifiers:** every 65,537-byte/quota/trap path is either refused before authoritative mutation or
  fully recoverable; two tabs never share `seq`; abandoned encryptions count; equality at `2^32` rotates/refuses.
- **Downstream invalidated if changed:** `S0-3`, row-2 carrier/WASM, import/system-operation semantics, performance and
  page-kill tests.
- **Rollback/reconsideration:** before changing the product operation limit or journal group framing.
- **No-action consequence:** Stage 1 cannot implement the unconditional WAL guarantee or safe concurrent trim.

### `P-4` — choose lapse authority

> **Decided 2026-08-27: `RC-7B`, a service-signed billing/retention machine** independent of the authorization
> lineage, with **retire winning the race in both orders**. Record and reasoning:
> [`decisions/P-4-lapse-authority.md`](./decisions/P-4-lapse-authority.md). The common invariants are selected
> now; the entitlement wire is gated on `D-31`, which the project defers on purpose. Ten falsifiers are in that
> record.

- **Prerequisites:** decide whether lapse is user-initiated, automatic billing-driven, or both; name the actor that
  wins lapse-versus-retire races.
- **Affected artifacts:** PRD §6.10; TRD §§13.8/14.4/16; rows 15/16; transition/retention artifacts; billing,
  authorization, hosted inventory, expiry/reseed behavior.
- **Type:** product work + design.
- **Safe parallel work:** common expiry deletion ledger and divergent-survivor reseed invariants can be designed
  independently of the initiator choice.
- **Acceptance/falsifiers:** one clock, live lineage on lapse, terminal lineage only on retire, replayable race
  winner, resume before/after partial deletion, replicas/backups, and two divergent survivors.
- **Downstream invalidated if changed:** `S0-7`, service topology, transition vectors, lifecycle copy/tests.
- **Rollback/reconsideration:** before a lapse wire/service state is selected.
- **No-action consequence:** row 15/16 closure remains false and expiry/reseed behavior remains ad hoc.

### `P-5` — choose policy semantics and closure-authority representation

> **Decided 2026-08-27: `RC-8C`, targeted repairs under one stated rule** — no new registry and no coverage
> manifest. Record and reasoning:
> [`decisions/P-5-closure-authority.md`](./decisions/P-5-closure-authority.md). **Branch A cannot hold what
> these documents are** — §15's row-15 cell is three sentences of argument — and **Branch B is the defect it
> means to fix**, since a canonical second copy of every mapping is *a generator holding a string that describes
> a state somewhere else* with a maintainer attached. The project already converged on a third pattern four
> separate times: **one home per fact, every consumer reads the home, and where two artifacts must agree the
> agreement is checked in both directions by something that is neither of them.** The third clause is the
> independent coverage the plan asked for.
>
> **The four policy questions.** Suite separation takes the **stronger primitive rule**, because the narrow
> key-reuse rule cannot be asserted from a table of primitives at all; `path` becomes an exhaustive
> execution-path enum, `both` is refused as a violation asserting itself, and the general defect is that
> `bucket()` is a filter — anything unrecognised silently enters no bucket. WebAuthn is **same-origin only**,
> with `crossOrigin` and `topOrigin` checked separately because a client can contradict itself. The origin
> scanner **inverts to allowlist-by-default** — measured first: the current build has exactly one remote origin
> and every occurrence is an XML namespace identifier — and its printed claim narrows to what it proves, with
> CSP named as the runtime control for constructed URLs. External observations carry a source, a date and an
> expiry. Fourteen falsifiers are in that record.

- **Prerequisites:** decide strong no-shared-primitive versus narrow key/domain separation; decide same-origin-only
  WebAuthn versus an approved `topOrigin` allowlist; decide runtime origin-graph enforcement versus a narrowly scoped
  literal-source claim; choose `RC-8A`, `RC-8B`, or targeted repairs with equivalent independent coverage.
- **Affected artifacts:** TRD §§10.9/10.11/13.2/13.9–13.10; rows 1/12/14/17; suite generator/vector; shared WebAuthn
  helper and two vectors; CSP/frame/Permissions Policy deployment profile.
- **Type:** design + product/security policy.
- **Safe parallel work:** X25519 exact-operation matrix; allowed origin/network graph or explicit static-claim
  exclusions; central-registry and distributed-coverage cost/prototype comparison.
- **Acceptance/falsifiers:** `both`/unknown paths fail according to selected semantics; unapproved framed assertions
  fail both verifiers; deployment readback matches the policy; X25519 absence follows declared behavior.
- **Downstream invalidated if changed:** `S0-1`, suite/provider review, account/recovery ceremonies, row-17 evidence.
- **Rollback/reconsideration:** before the selected closure-authority representation and regenerated vectors land.
- **No-action consequence:** the closure authority can encode statuses but not resolve contradictory semantics.

### `P-6` — choose Local archive factor/root UX

> **Decided 2026-08-26: `RC-6A` accepted; archive identity is per workspace; the factor is typed back once per
> workspace before any archive is called restorable; the Local identity is retired to legacy at promotion; and
> replacement is forward-only.** Record and reasoning:
> [`decisions/P-6-local-archive-factor.md`](./decisions/P-6-local-archive-factor.md). `S0-6` consolidates it;
> seven falsifiers are in that record.

- **Prerequisites:** accept `RC-6A` root commitment/full retired-package direction; decide whether the archive identity
  is per workspace or per archive and how factor confirmation/replacement is presented.
- **Affected artifacts:** PRD §§7.6–7.7/8.3; TRD §§9.3/13.8/14; rows 10/14; package/recovery vectors; archive/export UI
  and continuity tests.
- **Type:** product work + design.
- **Safe parallel work:** factor-sealed root/key construction and clean-device test harness; terminal handoff can
  proceed without final UX wording.
- **Acceptance/falsifiers:** archive plus saved factor, with all device/account/provider state absent, authenticates
  the root and restores exactly; wrong factor/root/state/generation fail independently.
- **Downstream invalidated if changed:** `S0-6`, row-21 early-archive option, package/migration/recovery evidence.
- **Rollback/reconsideration:** before the user is instructed to save a factor or archive bytes are called portable.
- **No-action consequence:** the high Local archive loss finding survives and the fidelity-archive cutover branch is
  not usable.

### `P-7` — keep unrelated product rows explicitly separate

- **Prerequisites:** none for Stage 0 remediation.
- **Affected artifacts:** row 18 search, row 19 root-type day collections, row 21 first-cutover attribution.
- **Type:** product work.
- **Safe parallel work:** rows 18/19 measurements; row-21 tradeoff analysis after `S0-5`/`S0-6` defines the corrected
  archive cost.
- **Acceptance/falsifiers:** each decision remains at its existing trigger/gate; no remediation artifact silently
  selects it.
- **Downstream invalidated if changed:** Stage 2 cutover for row 21; search/schema work for rows 18/19.
- **Rollback/reconsideration:** before their named implementation gates.
- **No-action consequence:** none for corrected Stage 0; row 21 still blocks irreversible cutover.

### `P-8` — choose checkpoint semantic authority and immutable creation authority

> **Decided 2026-08-26: `RC-5A` + `RC-5C`.** A producer proposes and an eligible client signs a
> `SemanticAdmission` before trim; snapshot-to-coverage consistency is re-derived locally by every restorer and
> is mandatory, while the accepted-head baseline trusts the admitting credential, with self-admission permitted
> and recorded where no second eligible client exists. Card ids commit to the creating credential. Record and
> reasoning: [`decisions/P-8-checkpoint-and-creation-authority.md`](./decisions/P-8-checkpoint-and-creation-authority.md).
> That record also keeps the portable-witness alternative explicitly open, with the two obstacles that would have
> to clear for it to reopen this decision at `S0-5`. Twelve falsifiers are in the record.

This node was previously the only Stage-0-blocking decision left inside its consuming action rather than hoisted
here. It is two choices, not one, and four combinations are viable: `A+C`, `A+D`, `B+C`, `B+D`.

- **Prerequisites:** `P-1`, because `RC-5A` asks whether a quorum of clients admits checkpoint semantics and `P-1`
  already asks whether client approval is single-owner or quorum-like — the same question in two places, and it
  must be answered once. **`P-1` answered it single-owner**, so this node adopts that or explicitly diverges from
  it, with reasons; it does not decide independently. Then decide **who authenticates that a checkpoint means the accepted snapshot it claims**
  — a retained replay witness plus client/quorum `SemanticAdmission` (`RC-5A`), or a content-aware accepted-event
  root with a portable replay/equivalence proof (`RC-5B`) — and **what makes first creation immutable** — a
  creator-committed card identity (`RC-5C`), or an append-only first-write/order certificate (`RC-5D`).
- **Affected artifacts:** PRD provenance/continuity; TRD §§4.5/4.8/7.6/10.4/13.7/14; rows 5/7/8/10/15;
  `scripts/generate-checkpoint-vectors.mjs` and `scripts/generate-attribution-vectors.mjs` with their vectors;
  suffix/trim/compaction requirements; restore and migration tests.
- **Type:** design + product/architecture.
- **Safe parallel work:** real Yjs `{sv,ds}` derivation from a materialised snapshot, staged checkpoint
  install/fallback, and opener-reference accounting all proceed against the common tuple without selecting a
  branch. Admission/proof and creation-authority schemas stay branch prototypes until the shared accepted-order
  interface is fixed.
- **Acceptance/falsifiers:** a checkpoint omitting an accepted insertion or deletion fails admission; a head vector
  beyond the snapshot fails; a whole valid self-replacement of another source's creation claim fails; a fresh
  restorer verifies the selected authority after the pre-checkpoint envelopes are trimmed; incomparable producers
  and incomparable first writes resolve without wall-clock ordering.
- **Downstream invalidated if changed:** `S0-5` in full, then `S0-6`'s package format and `S0-7`'s terminal
  payload, Stage 4 first sync/restore, migration, generation cleanup, and row 21's archive cost.
- **Rollback/reconsideration:** before package vectors depend on the chosen authority or order domain. After that a
  branch switch is a format migration, not a decision.
- **No-action consequence:** `S0-5` cannot start, and with it `S0-6` and `S0-7` — three of the seven Stage 0
  actions, on the critical path. Authentic checkpoint bytes can still omit accepted content, and a later credential
  can still replace the recorded creator of a card once the original event has been trimmed.

## Actions required before Stage 0 may close

### `S0-1` — establish the selected closure authority and reconcile current policy/status

> **Started and completed 2026-08-27.** Plan and status: [`S0-1/README.md`](./S0-1/README.md); the policy
> objects are in [`S0-1/A-policies.md`](./S0-1/A-policies.md) with sixteen falsifiers. **Every artifact in this
> action was already passing** — three oracles reported green while enforcing less than they claimed, and the
> work was making the claim and the enforcement the same size. TRD §§10.9/10.11/13.2/13.9–13.10, rows 1/12/14/17,
> PRD §7.12. **Stage D: four checks, twenty mutations**, all caught but the one that is the stated limit.
>
> **Three defects were found by writing the checks rather than by the review.** Row 1 §3's separation set listed
> four asynchronous primitives against the suite's six — ES256 and HPKE arrived with later rows and never came
> back to the sentence that publishes the argument. **§15's own arithmetic was wrong three times from one
> mistake**: *eighteen rows are selected* against a table of seventeen, propagated into row 20's cell as
> *sixteen carry a vector file* where fifteen do. And a mutation found the inverted origin scanner still blind
> to `wss://`, because the pattern knew only `http`.
>
> **One mutation deliberately survives**: a URL assembled from parts. No static scan can see it, which is why
> row 17 A1's claim narrowed to what it proves and CSP is named for the rest rather than the check being tuned
> until the old sentence came true.

- **Prerequisite decisions:** `P-5`; use its selected central, distributed, or targeted bidirectional closure
  authority without treating that representation as evidence-selected.
- **Exact affected artifacts:** `docs/PRD.md`; `docs/TRD.md`; `docs/selections/row-1-algorithm-suite.md`, rows 4, 5,
  11, 12, 14, 17; `scripts/generate-suite-vectors.mjs`; `test/vectors/algorithm-suite.json`; WebAuthn shared helper
  and account/recovery generators/vectors; `scripts/check-origin-isolation.mjs`; browser-baseline/profile artifacts;
  progress/review scope projections.
- **Type:** design + documentation + executable evidence.
- **Safe parallel work:** selected registry/coverage implementation, X25519 matrix, chosen origin evidence/scope, and
  PRD/TRD status reconciliation can run on separate files once `P-5` fixes semantics.
- **Acceptance/falsifiers:** exhaustive owner/enum mutation tests; selected row 4 cannot remain null; PRD/TRD/register
  agree; origin claims fail outside their selected evidence scope; the one selected WebAuthn policy accepts its
  allowed case and rejects its opposite/unapproved case; exact X25519/HPKE absence behavior is tested.
- **Downstream invalidated if action changes:** every regenerated vector/review scope that consumes suite or policy;
  `S0-8` and external review intake.
- **Rollback/reconsideration:** if the selected representation hides narrative exceptions, duplicates authority, or
  cannot prove both mapping directions, return to `P-5` before declaring projections authoritative.
- **Consequence of no action:** three of the five `RC-8` closure defects remain; the PRD/TRD status contradiction
  and the X25519 support floor are already repaired above, the latter still owing its dated evidence table. Other
  closure defects stay owned by their domain actions, and green cross-artifact status/coverage remains unreliable.

### `S0-2` — select recipient authority and the complete generation/custody transition

> **Started 2026-08-27.** Staged, because a single pass over eight rows, two normative documents and five
> generator/vector pairs cannot be reviewed. Plan and status: [`S0-2/README.md`](./S0-2/README.md). **Stage A
> (durable record schemas) is done** — [`S0-2/A-schemas.md`](./S0-2/A-schemas.md) — with fourteen falsifiers
> mapped to the records they test. **Stage B (normative construction) is done**: TRD §§13.2/13.4/13.5/13.6/13.7/
> 13.8 now carry the certified recipient set, its production at enrollment, the durable `applying` record, the
> four-clause generation-drop gate, the byte-exact replacement payload, and the locked-slot custody tier.
> **Stage C (selection rows) is done**: rows 3/5/7/9/11/13/14/15 amended under the project's existing
> `**Amended by:**` convention. After C the rows and the generators disagree on purpose, and `vectors:check`
> cannot see it — it compares a generator to its vector, never a document to its generator. **Stage D is done: all 14 falsifiers are
> executable and mutation-tested**, all three Stage C drifts are closed, and the AAD coverage audit proves 169
> fields each isolated by a published negative. Falsifier 10 is an executable model in `vitest` rather than a
> vector, since a kill at each `GenerationApply` step is a property of a sequence rather than of bytes.
> **Stage E is done, and with it `S0-2`**: the PRD now states that admission is not enrollment, that the lock's
> promise begins when the rotation lands, that rotation wraps to the certified set rather than a roster, and
> that replacing an exposed code rotates forward. The two authority tables match.
>
> **`S0-2` is complete pending `S0-8` regeneration and `S0-9` challenge.** Its eight findings are repaired in
> design, normative text, selection records, executable evidence and product copy.

- **Prerequisite decisions:** `P-1`, `P-2`, and package/root input from `P-6` — **all satisfied**; plus the common `RC-2` core, which is design work in this action rather than a further decision.
- **Exact affected artifacts:** PRD §§6.3–6.5/7.2–7.4/7.6; TRD §§6.1/7.3–7.6/13.2–13.8; rows 3/5/7/9/11/13/14/15;
  enrollment, recovery, transition, device-lock, record/checkpoint generators/vectors; credential/key/service
  inventories and UI copy.
- **Type:** design + documentation + executable evidence.
- **Safe parallel work:** recipient certificate/set schema and local `GenerationApply`/reference ledger can proceed
  in parallel with a fixed interface; recovery canonicalization/bootstrap can proceed independently of device-lock
  carrier.
- **Acceptance/falsifiers:** delayed malicious reader and `R_pub` substitution; complete replacement byte elision;
  four-object total-loss bootstrap with no eligible device followed by future rotation; stale/forked bootstrap head;
  exposed code after replacement; every `GenerationApply` kill; old journal/batch/spool; checkpoint fallback after
  two rotations; stale no-PRF profile; `rotation_owed` copy.
- **Downstream invalidated if action changes:** `S0-5`/`S0-6` opener/root use, `S0-7` retirement payload, `S0-8`, all
  Stage 4 service/device implementations.
- **Rollback/reconsideration:** before recipient/generation carrier bytes are frozen; after that, a branch switch is
  a protocol/version migration.
- **Consequence of no action:** three high and several medium authority/durability findings survive; no conforming
  implementation can derive safe rotation/replacement/lock behavior. The checkpoint fallback rule is already
  corrected above, but its opener set is exactly what this action must still enumerate.

### `S0-3` — select total local-write admission, allocator, and trim budget

> **Started and completed 2026-08-27.** Plan: [`S0-3/README.md`](./S0-3/README.md); schemas in
> [`S0-3/A-schemas.md`](./S0-3/A-schemas.md) with fifteen falsifiers. `RC-3C`, per `P-3`. **The seal's 64 KiB
> guard was never the constraint**: §12's budget runs out at 19.6 kB, so the guard sits about 3.2× past a budget
> the design calls a correctness property. The repair bounds what an *operation* produces — nothing is refused,
> because the limit is on updates — and the module does not change. **Stage D: `check-update-limit.mjs`
> recomputes §12's whole extrapolation from the published measurements (7 mutations), plus 18 model tests and
> 12 more.**
>
> **A mutation deleted a claim that was in three documents.** Stage A said the allocator *hands the trimmer an
> exact watermark*; swapping a covered-set trim for a range trim changed no result, because with unique
> sequences the two agree. What the allocator buys the trimmer is **uniqueness** — *what my state record
> covered* is expressible only because one `seq` is issued once — so the race is upstream of the trim's rule, in
> the numbering. TRD §6.1, row 3 and Stage A were all corrected. **Second time this session a mutation retired
> an unfalsifiable rule**, after `S0-4`'s sole-successor slot.
>
> **And it caught its own author**: §12's table said *~20 kB ≈ 1 000 µs* where the derivation gives 1 020 µs, a
> rounding the prose could carry and the table could not.
>
> With this, **`f-dbfd01f-record-nonce-ceiling-omitted`'s owed boundary test exists**: it was unwritable until
> `P-3` selected the count the comparison reads.

- **Prerequisite decisions:** `P-3`; suite policy from `P-5` only if the journal carrier changes.
- **Exact affected artifacts:** PRD persistence/operation limits; TRD §§6.1/10.10/12; rows 2/3; WASM Rust/glue/build;
  journal/record generators/vectors; local adapter contract; store/trim/page-kill/performance test specifications.
- **Type:** design + documentation + executable evidence.
- **Safe parallel work:** fixed key/nonce width repair; sequence allocator/`2^32` algorithm; oversize admission; real
  immutable append benchmark specification and bounded branch-feasibility probe.
- **Acceptance/falsifiers:** all `RC-3` boundary, quota, staged-WAL/apply kill, concurrency, trim, nonce-budget, and
  generation-key lookup cases; mutation tests remove each design gate independently. Stage 0 may reject an infeasible
  branch, but support-population p95 execution is accepted only at `L-1/L-4`.
- **Downstream invalidated if action changes:** Stage 1 adapter, accepted-head local store, generation cleanup,
  checkpoint watermarking, performance support policy, `S0-8`.
- **Rollback/reconsideration:** after feasibility/performance results but before row-2/3 vector format is re-frozen.
- **Consequence of no action:** the allocator and oversize-admission design defects remain, and later integration
  can lose local work or delete uncovered state. Three of this cluster's closure defects — the glue widths, the
  rotated-generation fixture and the missing nonce ceiling — are repaired above; the ceiling still owes its
  build-failing boundary test, which this action's selected count makes writable.

### `S0-4` — select exact-byte outbound spool and refusal protocol

> **Started and completed 2026-08-27.** Plan: [`S0-4/README.md`](./S0-4/README.md); schemas in
> [`S0-4/A-schemas.md`](./S0-4/A-schemas.md) with nineteen falsifiers. `RC-4A` taken as recommended. Two
> findings, **one position number**: row 4 made the exact bytes load-bearing without selecting anywhere to keep
> them, and row 6 made a definite refusal the only licence to re-mint while pointing at a transition `Outcome`
> that cannot name an envelope. **Stage D: 15 published negatives and 190 AAD fields, plus 17 model tests and
> 12 mutations.**
>
> **A mutation deleted a rule and nothing failed.** Stage A had kept `RC-4A`'s *sole successor slot* per
> refusal; removing it changed no result, because every attempt at a position competes for the one digest that
> position will ever accept and row 5's *at most one accepted digest per position* already permits only one to
> win. What replaced it does forbid something — **a refusal licenses its own position and no other** — and has
> a falsifier that isolates.
>
> **Three drifts surfaced from making the edits.** Row 3's own record format still published two kinds when the
> TRD has carried three since row 6 added `heads`; §7.4's nonce budget said *exactly as it does in §6.1* and so
> **inherited the defect `P-3` had just repaired there**; and §6.1's `seq` and §7.4's `seq` are different
> numbers with the same name, which nothing said.

- **Prerequisite decisions:** recipient/epoch fields from `S0-2`; suite registry shape from `S0-1`; use recommended
  `RC-4A` unless new evidence establishes a need for deterministic carrier redesign.
- **Exact affected artifacts:** TRD §§6.1/7.4–7.5/13.10; rows 1/4/5/6; suite/envelope/finalization/antireplay
  selections and generators/vectors; local record/store kinds; acceptance service position/refusal schema; migration
  suffix rules.
- **Type:** design + documentation + executable evidence.
- **Safe parallel work:** local spool/position machine and signed refusal/service idempotency schema can proceed
  independently against one exact object id.
- **Acceptance/falsifiers:** request lost before receipt; accepted reply lost; forged/genuine refusal; duplicate
  identical bytes; delayed refused original after sole-successor licensing; two successor digests or missing parent
  refusal; second accepted digest same position; two tabs; old provider unavailable; checkpoint-relative cleanup;
  suite-registry mutation.
- **Downstream invalidated if action changes:** Stage 4 relay/acceptance client, migration suffix, hostile-relay tests,
  `S0-8`.
- **Rollback/reconsideration:** before changing row-4 carrier bytes; spool schema may change without cryptographic
  migration while row 4 stays stable.
- **Consequence of no action:** ordinary sync has no safe crash/lost-reply path despite sound accepted-chain math.
  The stale carrier registry row is already repaired above and is not part of this.

### `S0-5` — select semantic checkpoint, admission/install, and immutable creation authority

> **Started 2026-08-27.** Staged as `S0-2` was; plan and status: [`S0-5/README.md`](./S0-5/README.md).
> **`S0-5` is complete** across all five stages — schemas in [`S0-5/A-schemas.md`](./S0-5/A-schemas.md), TRD
> §§4.8/7.6/10.4, rows 5/7/8/10/15, 36 checkpoint negatives and 13 attribution ones with the suite at 181
> isolated AAD fields, and PRD §5.3. Its two findings are repaired in design, normative text, selection
> records, executable evidence and product copy, pending `S0-8` regeneration and `S0-9` challenge.

- **Prerequisite decisions:** `P-8` — **satisfied** — which carries the `RC-5A/B` and `RC-5C/D` choices, the
  verifier authority, what survives trim, and how incomparable chains resolve; plus accepted-head/recipient inputs
  from `S0-2`, which is now the only thing this action waits on.
- **Exact affected artifacts:** PRD provenance/continuity; TRD §§4.5/4.8/7.6/10.4/13.7/14; rows 5/7/8/10/15;
  checkpoint/attribution generators/vectors; suffix/trim/compaction requirements; restore/migration tests.
- **Type:** design + documentation + executable evidence.
- **Safe parallel work:** real Yjs derivation, staged checkpoint install/fallback, and opener references can proceed
  against the common tuple. Semantic-admission/proof and creation-authority schemas remain branch prototypes until
  their shared accepted-order interface is selected.
- **Acceptance/falsifiers:** omitted insertion/deletion, head beyond snapshot, extra snapshot op, whole valid claim
  replacement, trim then fresh restore, producer-only admission, missing replay witness/proof, incomparable producers
  and first writes, partial install, newest loss, opener deletion, compaction/card deletion.
- **Downstream invalidated if action changes:** `S0-6` package format, Stage 4 first sync/restore, migration, generation
  cleanup, row-21 archive cost, `S0-8`.
- **Rollback/reconsideration:** if client/quorum availability or replay retention is unacceptable, reopen the exact
  `RC-5A/B` or `RC-5C/D` axis before package vectors depend on its authority/order domain.
- **Consequence of no action:** authentic checkpoint bytes can still omit accepted content or rewrite first
  attribution after trim.

### `S0-6` — select package root, Local opener, full retired package, and handoff receipt

> **Started 2026-08-27.** Staged as `S0-2` and `S0-5` were; plan and status:
> [`S0-6/README.md`](./S0-6/README.md). **Stages A–C are done** — schemas in
> [`S0-6/A-schemas.md`](./S0-6/A-schemas.md) with sixteen falsifiers, TRD §§9.3/13.8/14 and the §15 row 10
> register cell, and rows 7/8/10/14/15. **Stage D is done: all 16 falsifiers**, plus one the writing
> found — the archive envelope's identity binding, which nothing was testing. 31 published negatives across the
> fresh-rewrap attack, a clean-device archive restore from the code alone, the retired package's signature in
> both directions, and the deletion gate at all five hosted classes. **`S0-6` is complete** across all five stages. Its four
> findings — three of them high — are repaired in design, normative text, selection records, executable evidence
> and product copy, pending `S0-8` regeneration and `S0-9` challenge.

- **Prerequisite decisions:** `P-6`; `S0-2` recovery/recipient state; `S0-5` checkpoint/creation state; recommended
  `RC-6A`.
- **Exact affected artifacts:** PRD §§6.9/7.6–7.7/8; TRD §§9.3/13.8/14/15; rows 7/8/10/14/15; package/recovery/
  transition generators/vectors; service inventory; archive UX; continuity/deletion/migration tests.
- **Type:** design + documentation + executable evidence + product work.
- **Safe parallel work:** factor-sealed root/Local opener, full retired package, and terminal handoff/deletion ledger
  can proceed on separate schemas linked by hashes.
- **Acceptance/falsifiers:** paired fresh rewrap substitution; clean Local restore without account/device/provider;
  wrong root/factor; terminal-record-only non-upgrade; lost package reply/ack; receiver behind terminal head; forged
  or incomplete catch-up/known-absence transcript; stale-only survivor; design-level partial deletion transitions;
  provider disappearance and migration.
- **Downstream invalidated if action changes:** `S0-7` destructive gate, Stage 2 row-21 archive branch, Stage 4/5
  recovery/migration/continuity, `S0-8`.
- **Rollback/reconsideration:** before user-facing archive factor ships or a terminal package signer/format is frozen.
- **Consequence of no action:** three high integrity/availability/deletion findings and one medium package-state
  finding survive.

### `S0-7` — select lapse/expiry and terminal destructive-deletion state machines

> **Started and completed 2026-08-27.** Staged as `S0-2`, `S0-5` and `S0-6` were; plan and status:
> [`S0-7/README.md`](./S0-7/README.md). Schemas in [`S0-7/A-schemas.md`](./S0-7/A-schemas.md) with eighteen
> falsifiers; **TRD §14.7 is new** and §§13.5/13.7/14.4/16 are joined to it; rows 15 and 16 amended — row 15's
> product-downgrade cell stops claiming a closure it never had, and row 16's clock gains the machine it was
> selected without. **Stage D:** `test/hostedRetention.test.ts`, 23 tests with all eighteen guards
> mutation-tested, plus the cross-check `RC-7` names as missing — `scripts/check-retention.mjs` now reads the
> transition kinds from the generator's own output and requires them to stay disjoint from §14.7's states and
> from §13.5's lineage words, with the executable model and the document cross-checked against each other.
> **`S0-7` is complete** across all five stages.
>
> **Two composition results are worth carrying forward.** The deadline is a **floor** on expiry deletion and a
> **ceiling on both causes** — which resolves a contradiction `S0-6` and row 16 only have once composed: a lost
> acknowledgement retained bytes forever under one rule and twelve months under the other. And **retirement wins
> the race with a lapse in both orders by one rule** rather than an arbitration table: `cause` is set once,
> retirement may overwrite an entitlement cause, and nothing overwrites retirement.
>
> **Scope, per `P-4`:** the entitlement record's exact wire and signer are gated on `D-31` and are not built.
> Everything that does not depend on who initiates is. PRD §11 question 1 now records what that leaves.

- **Prerequisite decisions:** `P-4`; terminal handoff from `S0-6`; generation/reference rules from `S0-2`.
- **Exact affected artifacts:** PRD §§6.9–6.10; TRD §§13.5/13.8/14.4–14.5/16; rows 10/15/16; transition/retention
  generators/checker; hosted inventory; billing/authorization/store contracts; lifecycle/deletion/reseed tests.
- **Type:** design + documentation + executable model evidence + product work. Hosted deletion/reseed/local-clear
  execution remains `L-3`.
- **Safe parallel work:** lapse authority-specific carrier, per-class deletion ledger, divergent survivor reseed, and
  destructive local-clear state/interface specifications can proceed separately after common states are fixed.
- **Acceptance/falsifiers:** the selected model defines one clock, lapse/retire arbitration, resume before/after
  destructive progress, per-class idempotency, no-survivor and divergent-survivor states, terminal-handoff gate, and
  local-clear/unconfirmed-revocation outcome. Executed primary/replica/backup kills, reseed, and local clearing are
  required at `L-3`, not for Stage 0 design closure.
- **Downstream invalidated if action changes:** Stage 4 billing/store workers, retention copy/inventory, continuity
  tests, `S0-8`.
- **Rollback/reconsideration:** before service actor/signing authority and deletion-state schema are selected.
- **Consequence of no action:** lapse remains unrepresented and irreversible deletion still lacks complete crash/
  receipt semantics.

### `S0-8` — regenerate selected evidence and the adversarial closure pack

> **Started and completed 2026-08-27.** Plan and status: [`S0-8/README.md`](./S0-8/README.md). It closes no
> finding of its own; what it owes is the property the other seven rest on — that the falsifier each one claims
> **exists, names the finding it refuses, and still runs**.
>
> **The matrix is generated, not written**, because a written one is `P-5`'s Branch B: a second copy of every
> mapping, which is exactly `f-992bc91-network-carrier-registry-stale`'s shape. Claims live at the evidence in
> four carriers — `must_fail[].falsifies` on a negative, a run-time `falsifies()` registration inside a
> generator guard, `// falsifies:` above a `describe`, and a `falsifies:` docblock line in a check script — and
> [`traceability.md`](./traceability.md) is read back out of them by
> [`check-traceability.mjs`](../../../scripts/check-traceability.mjs), which is neither the claim nor the matrix.
> Each carrier is paired with a liveness oracle that is not the checker: the generators' published-versus-asserted
> comparison, `pnpm vectors:check`'s regeneration diff, the tests `vitest list` collects, and the reachable
> closure of `pnpm check` and `pnpm build`.
>
> **The population is read three ways and must agree** before anything else is checked, because a matrix that
> decides its own population is always complete — the findings directory's own frontmatter, this file's classes
> in [`end-state-materiality.md`](./end-state-materiality.md), and the seven action READMEs plus the repairs row
> above. They agreed on the first run: **85 claims over 27 of the 28 current defects, and one declared owed**.
> `pnpm trace:check` joins `check`. Nineteen mutations, all caught — the last three added by re-checking the
> action after it was committed, which found the scanner silently dropping any claim it could not attach.
> That is `S0-1`'s own subject, in the file written to prove `S0-1`'s repairs.
>
> **Two results changed a claim rather than confirming one.** A mutation moving `falsifies()` out of a guard body
> changed no result, so the placement rule published in two docblocks was retired — what makes a guard claim live
> is that `claims()` emits only what registered during that run, not where the call sits. And the forward-rotation
> claim is now **partial by construction**: the vectors falsify the *binding* of `successor`, and that an exposed
> code opens nothing is a runtime property owed to `L-2`, which the artifact now says rather than a paragraph.

- **Prerequisite decisions:** `S0-1` through `S0-7` stable enough to version.
- **Exact affected artifacts:** all changed `docs/selections/row-*.md`; corresponding `scripts/generate-*-vectors.mjs`
  and `test/vectors/*.json`; suite/AAD/retention/origin/browser/WASM checks; TRD §11 scenario inventories; review 3a/3b
  input scopes; a new remediation traceability matrix from every repaired finding to a falsifier.
- **Type:** executable evidence + documentation.
- **Safe parallel work:** per-cluster generators/tests can run in parallel; one independent coverage owner reconciles
  the final population through the closure registry.
- **Acceptance/falsifiers:** every current design/closure finding has at least one isolated counterexample that fails
  before the repair and passes after; every preserved local theorem still passes; no shared producer inventory is the
  sole completeness oracle; exact artifact staleness and hashes are checked.
- **Downstream invalidated if action changes:** `S0-9`, review intake, Stage 1/4 implementation contracts.
- **Rollback/reconsideration:** any falsifier that forces a design change returns to the owning `S0-*` action rather
  than weakening the expected result.
- **Consequence of no action:** revised prose would not meet the original vector/reviewability requirement and Stage
  0 still could not close.

### `S0-9` — independent challenge of the repaired constructions

> **Run twice. The independent pass FAILED the challenge — see
> [`S0-9/DISPOSITION.md`](./S0-9/DISPOSITION.md).** Four challengers, none of whom authored any repair, ran from
> `5923f51` in isolated worktrees with no access to the author's pass, to later commits, or to each other.
> **Every root cause has at least one failing axis.** Two high findings reopen at their decisions rather than
> their artifacts — `f-4259822-retirement-safe-survivor-gate-undefined` (a retirement can be born with its
> ceiling already past, so the handoff gate never fires; all six classes delete with zero handoffs) and
> `f-c611666-rotation-reader-eligibility-missing` (the `CertifiedSet` names no approver, so nothing
> client-authenticated resolves its verification key). One live construction defect returns to `P-3`: `K_store`
> binds no principal, so a per-store invocation budget cannot bound a workspace-wide key.
>
> **Three patterns generated most of it.** A falsifier for a documentation finding that does not read the
> document (three clusters, independently). Evidence credited to a repair that predates the repair — six
> negatives ran unchanged at the reviewed tip. And one fact with two homes where the cross-check reads only one,
> which is `RC-8C` broken inside the remediation that wrote it.
>
> **`S0-10` is blocked.** The author's pass below is kept and marked superseded, because the six spellings it
> tested were the six its author thought of, and that is the argument for independence in one line.
>
> **The author's earlier self-challenge, superseded in part.** Report:
> [`S0-9/README.md`](./S0-9/README.md); log: [`S0-9/command-log.md`](./S0-9/command-log.md). Every repair on this
> branch has one author and that author ran this. **`S0-10` must not record the challenge bar as satisfied**; what
> is still owed is a non-author rerunning the battery and the gates, and a non-author attacking the four judgement
> axes.
>
> **What a self-challenge could still establish**, because none of it depends on who is asking: every gate reruns
> from a **fresh clone** with `--frozen-lockfile`, including `wasm:stale` rebuilding the blob from the Rust crate
> at 6,465 B; **no theorem was deleted** — 213 published negatives at the reviewed tip and 297 test titles, none
> removed, 292 and 363 now; and five sampled defects are confirmed present at `9edd930` by reading the tip, two of
> them worse than the finding's wording (the WebAuthn fixture *hardcoded* `crossOrigin: false`, so it could not
> express the attack at all).
>
> **The isolation battery is the part that found something.** For each of the ten current defects resting on a
> single named falsifier, [`isolation-battery.mjs`](./S0-9/isolation-battery.mjs) puts the finding's own defect
> back and requires that one falsifier to refuse it — attacking exactly what `S0-8` says it does not prove. **20
> of 20 caught, after one repair.** `check-selection-status.mjs` did not see `is **open**`: three of its five
> `OPEN` patterns are phrases, and this document's house style puts `**` between the words, so the check worked in
> the settled direction and failed in the direction `f-tip-prd-stale-selection-status` is about. **Fifth instance
> of one shape** — a check that classifies by matching a list silently passes whatever the list does not name.
>
> **`RC-4`'s simpler repair was raised and answered**: a deterministic nonce would make the nonce reproducible and
> leave the *ciphertext* exactly as unreproducible, because an envelope carries a time-windowed batch. The spool
> exists for the batch, not the nonce, and row 4 never says so. **No challenge returned a repair to its owning
> action.**

- **Prerequisite decisions:** `S0-8` complete; challenger independent of each repair author.
- **Exact affected artifacts:** corrected PRD/TRD/selections, all regenerated evidence, `corrected-end-state.md`,
  remediation traceability matrix, challenge report and exact command/result log.
- **Type:** external or independent review + executable evidence review.
- **Safe parallel work:** independent specialists may challenge storage, protocol, continuity, and platform clusters;
  final disposition must reconcile cross-cluster compositions.
- **Acceptance/falsifiers:** for every `RC-*`, challenge survival at tip, causal ancestor, preservation of local
  theorems, simpler repair, actor authority, crash/retry/concurrency, and every named adversarial scenario. At least
  one non-author reruns exact artifacts.
- **Downstream invalidated if action changes:** any challenged cluster and its dependent evidence; `S0-10`.
- **Rollback/reconsideration:** failed challenge returns to the earliest affected decision, not a superficial vector
  patch.
- **Consequence of no action:** the remediation repeats the original shared-model closure weakness.

### `S0-10` — record corrected Stage 0 closure

- **Prerequisite decisions:** `S0-1`–`S0-9` accepted; updated review 3a/3b scopes/bookings recorded without calling
  booking a result.
- **Exact affected artifacts:** `docs/progress.md`, `docs/completed.md`, current PRD/TRD/register status, selected-row
  evidence index, review scope/booking record, session/handoff. Finding dispositions change only under a separately
  authorized validation/remediation workflow.
- **Type:** documentation + review governance.
- **Safe parallel work:** final accounting and release-gate ownership readback.
- **Acceptance/falsifiers:** all selected rows implementably unambiguous; selected closure authority total and
  bidirectionally checked; regenerated artifacts current; independent challenge has no unresolved Stage 0 blocker;
  later gates are named and blocking;
  rows 18/19/21 remain correctly open.
- **Downstream invalidated if action changes:** every Stage 1/2/4 implementation plan consuming the corrected target.
- **Rollback/reconsideration:** do not mark complete; reopen the exact row/cluster on any failed acceptance item.
- **Consequence of no action:** the project remains correctly “targeted selections reopened,” even if useful repair
  work exists; this is safer than a false close.

## Explicit Stage 1/4 or release gates

### `L-1` — encrypted local store and legacy cutover

- **Prerequisites:** `S0-10`, with `S0-3` selected.
- **Exact affected artifacts:** production local store/key/journal adapter; old `1:` journal and `done` database
  cutover; startup/load/trim/clear code; Stage 1 persistence and no-plaintext tests; performance ledger.
- **Type:** implementation + executable evidence.
- **Safe parallel work:** new encrypted store, disposable old-origin cutover harness, device benchmark matrix.
- **Acceptance/falsifiers:** all writer/page-kill tests, immutable p95 population, exact export/import/active-store/
  delete/restart kills, whole-profile plaintext scan, destructive local clear.
- **Downstream invalidated if action changes:** Stage 4 sync client assumptions and release evidence.
- **Rollback/reconsideration:** before selecting encrypted store active or deleting any legacy carrier; keep a verified
  recoverable export.
- **Consequence of no action:** later gate remains open; not a reason to call the Stage 0 design wrong.

### `L-2` — authorization, acceptance, outbound, and transition integration

- **Prerequisites:** `S0-10`, especially `S0-2`/`S0-4`.
- **Exact affected artifacts:** account/authorization/acceptance services, content-blind relay/store, enrollment
  client, spool/refusal, transition worker, hostile-relay/service integration tests.
- **Type:** implementation + executable evidence.
- **Safe parallel work:** service idempotency/refusal and local generation application with shared exact schemas.
- **Acceptance/falsifiers:** TRD §11 protocol suite, all relay refusal/silence/fork scenarios, multi-device enrollment,
  revocation, recovery replacement, lost outcomes, stale profiles.
- **Downstream invalidated if action changes:** checkpoint/package service behavior and Stage 4 release review.
- **Rollback/reconsideration:** before enabling hosted sync or accepting production ciphertext.
- **Consequence of no action:** selected protocol remains specification-time only.

### `L-3` — checkpoint, recovery, package, lifecycle, migration, and continuity execution

- **Prerequisites:** `L-1`, `L-2`, `S0-5`–`S0-7`.
- **Exact affected artifacts:** checkpoint producer/admission/install, recovery restore, archive tool, retired package/
  handoff, deletion/reseed workers, destructive local-clear worker, replacement stack, continuity tests 4–9.
- **Type:** implementation + executable evidence.
- **Safe parallel work:** clean-device restore/tooling and hosted lifecycle workers after schemas stabilize.
- **Acceptance/falsifiers:** newest loss, provider disappearance, total loss, Local restore, migration, lapse/expiry,
  executed primary/replica/backup deletion kills, divergent-survivor reseed, local clear with service unreachable,
  terminal receipt, independent deployment outside provider account.
- **Downstream invalidated if action changes:** Stage 2 archive cutover and Stage 4/5 ship gates.
- **Rollback/reconsideration:** before destructive deletion or irreversible migration/cutover.
- **Consequence of no action:** portability/continuity remain design promises, not release evidence.

### `L-4` — platform, performance, toolchain, and external review release gates

- **Prerequisites:** appropriate integrated targets from `L-1`–`L-3`; choose `RC-9A` or `RC-9B` governance.
- **Exact affected artifacts:** release gate manifest/receipts; exact browser/OS/device matrix; immutable journal raw
  samples; RustCrypto source-delta review; pinned/attested Rust/toolchain/blob hashes; normal CI freshness plus KAT;
  ASVS requirement-by-requirement and runtime egress evidence; reviewers 3a/3b identity/scope/readback.
- **Type:** executable evidence + external review + release governance.
- **Safe parallel work:** performance, browser, toolchain, ASVS/egress, and external review tracks.
- **Acceptance/falsifiers:** Baseline never substitutes for hardware; slower supported devices sampled; stale blob
  fails normal CI; exact audit delta scoped; runtime remote channels checked; reviewer responses tied to exact input.
- **Downstream invalidated if action changes:** release approval and any public assurance copy.
- **Rollback/reconsideration:** fail the release gate and return to the affected implementation/design; waivers are
  explicit, scoped, expiring product/security decisions.
- **Consequence of no action:** the five later-gate findings remain honest blockers at their assigned stages.

## Historical ledger corrections

### `H-1` — append-only provenance corrections

- **Prerequisites:** none; do not block design repair.
- **Exact affected artifacts:** historical performance/decision/closure ledger entries corresponding to
  `f-138a5f8-libsodium-readiness-timing`, `f-6b021c4-wasm-size-proxy-unreproducible`,
  `f-caee157-plaintext-baseline-points-to-parent`, and `f-dbfd01f-row20-closes-unvectorized-hpke`.
- **Type:** documentation.
- **Safe parallel work:** all four corrections.
- **Acceptance/falsifiers:** corrections preserve original observations, name the exact limitation/later repair, and
  are not reused as operative tip evidence.
- **Downstream invalidated if action changes:** none if append-only; any attempt to rewrite history must be rejected.
- **Rollback/reconsideration:** omit a correction if provenance cannot be established; retain the validated finding.
- **Consequence of no action:** audit trail remains misleading, but corrected Stage 0 architecture is unaffected.

## External review coordination

- Updated 3a/3b review inputs should be produced after `S0-8`. Stage 0 requires honest scope/booking evidence, not an
  invented reviewer result.
- Reviewer answers that constrain implementation remain `L-4` gates before their original cutover/sync/release
  boundary. If a reviewer rejects a selected construction, return to the owning `P-*`/`S0-*` node.
- Row 21 is a separate Stage 2 product decision. Selecting early fidelity archive depends on `S0-5`, `S0-6`, and
  later `L-3` execution; selecting system attribution accepts the already documented first-cutover loss.

## Critical path and smallest coherent repair set

The critical path is:

`P-1/P-2/P-3/P-4/P-5/P-6/P-8`
→ `S0-1/S0-2/S0-3`
→ `S0-4` (needs `S0-1 + S0-2`) and `S0-5` (needs `S0-2 + P-8`), which run in parallel with each other
→ (`S0-2 + S0-5 + P-6`) `S0-6`
→ (`S0-2 + S0-6 + P-4`) `S0-7`
→ all `S0-1..S0-7`
→ `S0-8`
→ `S0-9`
→ `S0-10`.

The smallest coherent repair set is not 28 independent patches. It is seven joined Stage 0 constructions:

1. one selected closure authority with explicit suite, WebAuthn, origin-scope, capability, and status policy (`S0-1`);
2. client-authenticated enrollment/recovery bootstrap plus one generation-application/reference machine covering
   rotation, recovery replacement, device lock, and fallback (`S0-2`);
3. one total staged local-write admission/allocation machine (`S0-3`);
4. one exact-byte outbound spool/final-refusal/sole-successor machine (`S0-4`);
5. one selected semantic checkpoint and immutable-creation authority with proof retained through trim (`S0-5`);
6. one factor-rooted portable/retired package and terminal-handoff machine (`S0-6`); and
7. one selected lapse/expiry and terminal destructive-deletion state machine (`S0-7`).

That set eliminates the 19 current design defects and 9 current closure/evidence defects while preserving the
validated local theorems. `L-1`–`L-4` remain explicit later gates; `H-1` remains non-blocking history. Local patches
that do not join these state/authority boundaries are smaller in diff size but not a coherent corrected Stage 0.
