# Causal decision trees

**Standing:** record — speaks of `9edd9300adebcec3abd2234c946f1dcccdc17eef`, the reviewed tip whose surviving findings these trees cluster; pinned in
`census.json`, so edits land only as dated addenda under a re-pin.

## Scope and clustering rule

These trees cover the 33 findings that survive as current defects or explicit later gates. The four historical-only
corrections in [`end-state-materiality.md`](./end-state-materiality.md) have no surviving dependent decision and are
intentionally excluded. A cluster exists only where the findings share a missing authority, durable transition, or
closure decision; similarity of vocabulary alone is not enough.

| Root-cause cluster | Findings accounted for exactly once |
| --- | --- |
| `RC-1` client-authenticated recipient authority | `f-c611666-rotation-reader-eligibility-missing`, `f-a073574-enrollment-recovery-key-unbound` |
| `RC-2` composed generation application and capability retirement | `f-4259822-generation-switch-local-durability-undefined`, `f-4259822-recovery-replacement-no-forward-rotation`, `f-4259822-recovery-replacement-payload-bytes-unbound`, `f-b997cdb-checkpoint-key-retention-inverted`, `f-f5def83-device-lock-reader-key-bypass`, `f-dbfd01f-device-lock-rotation-caveat-lost` |
| `RC-3` total local-write admission and invocation accounting | `f-3bea0e6-store-sequence-allocation-undefined`, `f-9b49b74-journal-seal-64k-gap`, `f-dbfd01f-record-nonce-ceiling-omitted`, `f-9860a0b-journal-rotated-vector-reuses-key`, `f-9b49b74-wasm-glue-key-nonce-lengths`, `f-66a7c6a-journal-benchmark-overwrites-one-slot` |
| `RC-4` exact-byte outbound acceptance machine | `f-992bc91-outbound-envelope-spool-undefined`, `f-745e332-envelope-refusal-carrier-missing`, `f-992bc91-network-carrier-registry-stale` |
| `RC-5` semantic checkpoint and immutable history authority | `f-b997cdb-checkpoint-coverage-unchecked`, `f-b997cdb-attribution-self-replacement` |
| `RC-6` converged portable-root and deletion-handoff construction | `f-745e332-package-root-rewrap-substitution`, `f-745e332-local-archive-portable-wrap-undefined`, `f-745e332-live-retired-package-resigning-undefined`, `f-4259822-retirement-safe-survivor-gate-undefined` |
| `RC-7` durable lapse/expiry state | `f-4259822-lapse-transition-kind-missing` |
| `RC-8` closure-policy/evidence convergence package | `f-3bea0e6-suite-separation-ignores-both-path`, `f-5bd9552-origin-scan-static-forms`, `f-b9ff071-webauthn-cross-origin-policy`, `f-bd87655-x25519-support-floor-omitted`, `f-tip-prd-stale-selection-status` |
| `RC-9` cross-cutting later-gate governance | `f-bd87655-baseline-not-performance-floor`, `f-9860a0b-legacy-plaintext-repair-undefined`, `f-9b49b74-rustcrypto-audit-version-gap`, `f-9b49b74-wasm-source-artifact-drift-unchecked` |

`RC-2`, `RC-6`, `RC-8`, and `RC-9` are deliberately labelled compositions or convergence packages. They are the
smallest shared repair surfaces, not assertions that every member has one historical ancestor. Their independent
first-divergence lanes are retained below. The fifth later-gate finding—the journal benchmark—remains accounted in
its storage domain under `RC-3`; `RC-9` governs all five later gates without double-counting it.

## `RC-1` — client-authenticated recipient authority

**Causal chain**

`authorization never causes key delivery`
→ the base contract simultaneously makes the service-signed epoch the reader roster and requires a rotator to wrap
to every remaining reader
→ row 11 at `a073574` authenticates one immediate `W_pub`, but creates no transferable success record and omits
`R_pub`/recovery-envelope bytes
→ the selection closes on a typed-SAS vector proving the immediate transcript and first wrap
→ rows 9, 10, 14, and 15 later consume service-visible reader/recovery state as if its client authentication were
durable
→ no later commit adds an independently verifiable eligibility/recovery-recipient object
→ at the tip, a service-only reader can receive an unrelated future rotation and a genuine newly enrolled reader can
be induced to wrap later generations to a substituted recovery key.

| Required reconstruction element | Evidence-backed result |
| --- | --- |
| Original invariant | Account/service authorization, person-mediated key delivery, and recovery authority are separate. A service may admit but must not select a content recipient. |
| First divergence and decision | Ordinary-reader eligibility is latent at base `c611666`; `a073574` is the first closed construction that authenticates only immediate `W_pub` and leaves delayed eligibility plus `R_pub` outside the durable result. |
| Alternatives considered or omitted | QR versus typed SAS and commit/reveal grinding were considered. A client-signed enrollment certificate, accepted delivery event, co-signed recipient ledger, or transcript-bound recovery payload was omitted. |
| Closure assumption/evidence | Exact transcript bytes, nonce commitments, a five-symbol typed SAS, and transcript-bound HPKE were treated as sufficient evidence for the enrollment joint. They prove the direct target, not a fact a different future device can consume. |
| Downstream inheritance | Every-reader rotation, recovery wrapping, device revocation, recovery replacement, packages, migration, and malicious-authorization claims. |
| Later changes | `992bc91` binds the current head; `4259822` makes the wrap map and transition outcome exact. Neither states why a recipient is eligible or authenticates the workspace recovery recipient. |
| Exact surviving failure | Delayed authorization-only delivery of `K_(g+1)` and delayed recovery-key substitution. |
| Affected guarantees and machines | E-04/E-08/E-10; enrollment, rotation, recovery distribution, and migration enrollment. |

**Decision diagnosis:** the typed-SAS selection is a sound local decision. The defect is a composition failure: an
ephemeral two-device ceremony was later used as though it had created portable shared authority. Any repair must
also bootstrap that authority from the existing four recovery objects when no eligible device survives; requiring an
old installer would repair rotation by breaking the validated total-loss theorem.

## `RC-2` — composed generation application and capability retirement

**Causal chain**

`a committed capability change must make one successor generation reopenable, preserve all old work, and retire every
old access path only after its last dependent object`
→ **custody lane:** row 13 at `f5def83` correctly separates a crash-safe local custody swap from later forward
rotation but leaves the promptless operational wrapping credential unchanged; `dbfd01f` later drops the explicit
`rotation_owed` caveat
→ **fallback lane:** row 7 at `b997cdb` retains two checkpoints but states the opener rule with the wrong subject
→ **transition/recovery lane:** row 15 at `4259822` selects a correct signed mine/other/silence verdict and an
abstract `applying` state, while its replacement branch binds an incomplete set and does not rotate after exposure
→ the three lanes converge on the same missing `GenerationApply` and object-reference machinery
→ closure relies on exact wire signatures and endpoint conditions without composing local key installation,
old-carrier discharge, or capability removal
→ the tip can report a committed/locked/replaced state while a crash loses work, an old opener remains effective,
or a required fallback opener has already been deleted.

| Required reconstruction element | Evidence-backed result |
| --- | --- |
| Original invariant | Revocation/device lock/recovery replacement affect future access, not history; switching is crash-safe; no required object becomes unreadable. |
| First divergence and decision | `f5def83` first makes factor lock plus ordinary rotation concrete without gating the separate reader credential. `b997cdb` first misstates the fallback opener condition. `4259822` closes the generic transition while leaving local application and complete recovery payload abstract. |
| Alternatives considered or omitted | Staging versus delete-first was considered and correctly chose staging. Mine/other/silence versus timeout rebuild was considered and correctly chose signed evidence. Omitted: replacing/factor-gating operational reader credentials, an exact local application journal, exposed-factor rotation composition, and object-specific opener reference accounting. |
| Closure assumption/evidence | Local custody vectors prove the atomic swap; transition vectors prove signatures, deterministic payload ordering, and network verdicts; checkpoint prose names two retained tuples. None runs the combined local state. |
| Downstream inheritance | Device-lock copy, revocation, recovery replacement, migration, checkpoint fallback, trim, outbound retry, old-generation deletion, and UI claims. |
| Later changes | `ff0b48f` repairs step-up replay but signs the incomplete replacement intent. Later transition work leaves `rotation_owed`, self-reader wraps, and fallback openers unchanged. |
| Exact surviving failure | Unreadable or ambiguously active successor after a kill; lost old journal/batch work; future decryption by an exposed recovery key or copied reader credential; unusable fallback checkpoint; overstated lock completion. |
| Affected guarantees and machines | E-03/E-08/E-09/E-14; device-lock enrollment, rotate/revoke, replace-recovery, checkpoint fallback, local trim, and generation garbage collection. |

**Decision diagnosis:** this is a composed lifecycle joint, not one bad ancestral decision. The local swap and signed
wire verdict are sound local decisions; the fallback rule is independently wrong. The cross-system failure was
closing all three lanes without selecting the application and garbage-collection transaction that joins them.

## `RC-3` — total local-write admission and invocation accounting

**Causal chain**

`every accepted update is synchronously durable; every async encryption attempt is uniquely budgeted; trim deletes
only covered state`
→ row 2 at `9860a0b` chooses the sound random-nonce XChaCha journal but its rotation fixture changes `gen` without
changing the root
→ row 3 at `3bea0e6` puts `seq` in AAD before encryption and spans multiple tabs/stores without selecting reservation
or generation-start accounting
→ `dbfd01f` folds away the numeric `2^32` enforcement branch
→ `9b49b74` replaces the slow path with a small synchronous WASM seal, adding a 64-KiB hard boundary and fixed buffers
without caller-width enforcement
→ the Pixel/fixed-slot evidence demonstrates component latency but not immutable accumulating writes
→ the tip preserves the correct successful-write order but has no total state for oversize/storage failure,
concurrent allocation, or every invocation attempt.

| Required reconstruction element | Evidence-backed result |
| --- | --- |
| Original invariant | WAL before handler return, unique/bounded nonce use, monotonic trim order, and no deletion before coverage. |
| First divergence and decision | `9860a0b` leaves generation-key lookup untested; `3bea0e6` selects authenticated pre-encryption `seq` without its allocator; `9b49b74` makes oversize refusal and stale-buffer behavior concrete. |
| Alternatives considered or omitted | Random journal nonce was correctly preferred over crash-unsafe counters. Random record IV was selected over derived counters. Omitted: durable single/range reservation, per-generation attempt ledger, pre-mutation refusal versus chunk/reassembly, fixed-width API contracts, and a production-shaped append harness. |
| Closure assumption/evidence | KATs, field-isolating negatives, page-kill reasoning after successful `setItem`, fixed boundaries, and one-device timing. They do not totalize the writer's entry conditions or cross-tab state. |
| Downstream inheritance | Record/heads writes, trim watermarks, accepted-head persistence, generation deletion, Stage 1 store integration, and the p95 release promise. |
| Later changes | AAD isolation improves declared-field evidence and the WASM provider fixes measured latency; neither defines allocator, oversize semantics, width checks, or realistic storage occupancy. |
| Exact surviving failure | Two authenticated records can claim one sequence; an abandoned encryption is uncounted; trim can cross an uncovered concurrent write; a >64-KiB accepted mutation can die unjournalled; wrong-width glue can reuse prior key/nonce bytes. |
| Affected guarantees and machines | E-02 and E-20 evidence; local write/batch, journal replay, record allocation, accepted-head store, trim, rotation threshold, and performance gate. |

**Decision diagnosis:** the cryptographic formats and successful single-writer ordering are sound. The composition
mistake is treating a record format plus component benchmark as a total concurrent write-admission machine.

## `RC-4` — exact-byte outbound acceptance machine

**Causal chain**

`one credential position has one exact source envelope until acceptance or authenticated never-acceptance`
→ row 4 at `992bc91` selects a random-nonce signed envelope and client-owned position, but does not update the suite's
carrier registry or select a durable outbound record
→ row 6 at `745e332` correctly forbids re-mint after silence and deepens retention, but points to an authenticated
refusal object that does not exist
→ row 15 later demonstrates exact-byte persistence/idempotency only for transitions
→ local Yjs/journal state is assumed to be enough to recover ordinary outbound work
→ the tip cannot reproduce the random nonce, batch, digest, signature, and link after a crash and cannot distinguish
genuine refusal from lost acceptance.

| Required reconstruction element | Evidence-backed result |
| --- | --- |
| Original invariant | Source envelopes survive end to end; client/accepted positions do not fork; a hostile relay cannot induce re-mint; each device retains its own suffix independently. |
| First divergence and decision | `992bc91` makes exact bytes load-bearing without a spool and leaves the row-1 registry stale; `745e332` makes definite refusal load-bearing without a carrier. |
| Alternatives considered or omitted | Receipts versus chained accepted heads were considered at finalization. Omitted: local exact-byte spool, durable position reservation, service idempotency row, signed refusal, deterministic/reconstructible envelope alternative, and registry acceptance row. |
| Closure assumption/evidence | Envelope field/signature vectors, accepted-chain arithmetic, self-equivocation example, and narrative retention. No restart or request-loss state is exercised. |
| Downstream inheritance | Ordinary sync, anti-replay, revocation cutoff, migration suffix, provider-loss continuity, and suite migration. |
| Later changes | Transition exact-retry work supplies a good pattern but is not generalized. No later commit adds an outbound store, refusal schema, or carrier registry row. |
| Exact surviving failure | Indefinite write unavailability, self-equivocation, or loss of the independently held migration suffix after a request/reply crash; contradictory agility registry. |
| Affected guarantees and machines | E-05/E-06; outbound mint/send/retry/ack/refuse/cleanup, accepted head, and suite carrier selection. |

**Decision diagnosis:** one client-owned position and the accepted-chain theorem are sound. The failure is at their
durability/refusal composition, not in the link arithmetic.

## `RC-5` — semantic checkpoint and immutable history authority

**Causal chain**

`a bounded restore object must mean exactly the accepted snapshot it replaces and must preserve first creation`
→ row 7/8 at `b997cdb` replaces unbounded envelope retention with signed checkpoint fields and a “write-once” claim in
a mutable CRDT map
→ generators prove signatures, digests, sorting, and current-body equality while using independent snapshot,
`sv`, `ds`, and heads constants and never testing a valid whole-claim replacement
→ the producer signature and CRDT convention are treated as semantic and immutable authority
→ packages, trim, old-generation retirement, migration, and fresh restore inherit that assumption
→ the tip can accept a mismatched snapshot/head baseline or a later credential's valid self-claim after the original
event has been trimmed away.

| Required reconstruction element | Evidence-backed result |
| --- | --- |
| Original invariant | A state vector alone is not coverage; deletion coverage and accepted heads must correspond to the snapshot; no later writer/checkpoint producer re-signs or rewrites another source's creation. |
| First divergence and decision | `b997cdb` closes both rows with authentic containers but no semantic derivation or immutable creation-event position. |
| Alternatives considered or omitted | Full checkpoint versus unbounded envelope retention was considered. Standing claims versus retaining all old generations was considered. Omitted: retained replay witness, named client/quorum semantic admission, content-aware event proof, creator-committed card identity, append-only first-write order, and authenticated checkpoint admission/order. |
| Closure assumption/evidence | Project-owned vectors mutate signed fields and distinguish exact from edited bodies. They assume the tuple's meaning and residence rather than falsifying it. |
| Downstream inheritance | Suffix truncation, trim, fallback, first sync, total-loss restore, package integrity, attribution display, and migration. |
| Later changes | Package and transition work consume checkpoint/claim outputs without strengthening their semantic authority. Compaction remains safety-paused, which prevents a worse deletion but does not repair fresh restore. |
| Exact surviving failure | Omitted accepted content becomes unrecoverable after suffix/key cleanup, or a fresh restorer reports an attacker as verified creator. |
| Affected guarantees and machines | E-09/E-17; checkpoint produce/admit/install/fallback, attribution creation/edit/trim, package restore, and migration. |

**Decision diagnosis:** full snapshots, two fallbacks, body commitments, and standing per-source claims are sound
components. The bad decision was equating authentic bytes and an application convention with semantic/temporal
authority.

## `RC-6` — converged portable-root and deletion-handoff construction

**Causal chain**

`portable ciphertext must be independently authentic/openable, and destructive deletion begins only after complete
terminal evidence is independently held`
→ **portable-authenticity lane:** row 10 at `745e332` unifies never/live/retired package shapes, treats HPKE `info`
as a recovery-code-rooted trust anchor, leaves Local's opener opaque, and claims terminal-record-only upgrade across
differently signed manifests
→ **destructive-handoff lane:** row 15 at `4259822` commits terminal state but omits a survivor/export proven current
against the terminal accepted head, exact package receipt, and catch-up/known-absence evidence
→ both lanes converge only when the complete retired package becomes the independently held deletion receipt
→ carrier field/signature vectors are used to close that cross-actor delivery/deletion machine
→ the tip admits package-root substitution, cannot restore Local on a clean device, cannot authenticate the claimed
in-place retired upgrade, and cannot prove deletion is safe.

| Required reconstruction element | Evidence-backed result |
| --- | --- |
| Original invariant | The user factor authenticates historical authority; archive plus independent factor restores without the old operator; terminal state and complete evidence precede deletion; stale replicas are not called complete. |
| First divergence and decision | `745e332` first closes the common package without a non-rewrappable anchor or Local opener and with an impossible signer transition. `4259822` later closes retire without the deferred delivery/deletion gate. |
| Alternatives considered or omitted | One common manifest was chosen over state-specific packages. HPKE context binding was chosen as root anchor. Omitted: factor-sealed root commitment or archive identity, Local archive key/factor lifecycle, signed manifest transform versus full retired-package replacement, and a durable client acknowledgement/catch-up receipt. |
| Closure assumption/evidence | Sorted part digests, live/retired positive signatures, an old-ciphertext `info` mutation, transition idempotency, and terminal-before-delete prose. None tests a fresh attacker rewrap or delivery to independent custody. |
| Downstream inheritance | Total-loss recovery, archive fidelity, provider disappearance, migration, account deletion, terminal local rebinding, and continuity tests 4–9. |
| Later changes | Recovery step-up and retention duration improve other properties but do not authenticate the historical root, create a Local opener, authorize a manifest transform, or gate deletion. |
| Exact surviving failure | Attacker-chosen history restores under the genuine recovery key; Local archive is permanently unreadable; an offline live package cannot become authentically retired from only a terminal record; hosted bytes can be destroyed while every survivor is stale/incomplete. |
| Affected guarantees and machines | E-13/E-16/E-17/E-18; archive create/open, package state transition, total-loss restore, retirement handoff, migration, and hosted deletion. |

**Decision diagnosis:** the common framing, part digest, and full service-signed retired package are sound local
constructions. These are two causal roots joined by one narrow repair: recipient encryption/manifest signatures do
not prove user-held historical authority, while terminal settlement does not prove a current survivor has received
it. “Verified-current” therefore means the receiver proves its accepted head is the terminal head or presents a
signed catch-up transcript from its authenticated prior head with exact known absences before acknowledging.

## `RC-7` — durable lapse/expiry state

**Causal chain**

`lapse is live-dormant, starts one retention clock, is resumable, and can never be confused with retirement`
→ row 15 at `4259822` claims authenticated `kind` closes deliberate downgrade but enumerates only rotate,
replace-recovery, and retire
→ row 16 at `cdd2069` consistently selects twelve months from sync stop and adds no carrier
→ two independent checkers each pass because neither cross-checks the policy state against a durable transition
→ the tip leaves implementations to invent billing/service state and its crash/race semantics.

| Required reconstruction element | Evidence-backed result |
| --- | --- |
| Original invariant | Lapse stops hosted sync without terminal lineage; local devices remain writable; expiry deletes hosted ciphertext/wraps only; resume and retirement races are deterministic. |
| First divergence and decision | `4259822` closes downgrade under a three-kind grammar with no lapse. `cdd2069` later selects duration without reopening the carrier. |
| Alternatives considered or omitted | A fourth client-signed transition and a separate durable billing/service machine are both viable; neither was selected. Partial deletion, backup/replica progress, and divergent reseed were deferred. |
| Closure assumption/evidence | Cross-kind rotate/retire vectors and a five-anchor retention text checker were treated as complementary closure. They do not share a state object. |
| Downstream inheritance | Billing, hosted read-only behavior, retention clock, total-loss recovery window, expiry deletion, resume/reseed, retirement race, and service inventory. |
| Later changes | No later commit adds lapse state, an exactly-once clock event, deletion progress, or survivor reseed. |
| Exact surviving failure | An implementation must misuse another kind or invent unaudited state; after a crash it can start multiple clocks, confuse live and terminal state, delete incompletely, or mishandle divergent survivors. |
| Affected guarantees and machines | E-15/E-16; lapse, resume, expiry deletion, backup purge, divergent reseed, and lapse-versus-retire arbitration. |

**Decision diagnosis:** the state taxonomy and twelve-month policy are sound. The closure claim is bad because it
assigns authority to a carrier that does not represent the state at all.

## `RC-8` — closure-policy/evidence convergence package

**Causal chain**

`a closed rule has explicit semantics and makes evidence claims no broader than the evidence`
→ **policy-semantics lane:** `3bea0e6` permits an unhandled `both` value and `b9ff071` centralizes WebAuthn framing
without choosing the RP's embedding policy
→ **claim/scope lane:** `5bd9552` presents a literal-form source scanner as universal runtime origin isolation,
while `bd87655` calls its capability list complete while omitting X25519
→ **document-authority lane:** `a073574` and `ff0b48f` close TRD rows without updating standalone PRD status
→ each local artifact passes at its declared scope, but the broader closure statements are unsupported or
contradictory
→ the tip needs explicit policy choices, accurately bounded claims, and bidirectional status/capability coverage;
the lineage does not establish that they must share one new registry.

| Required reconstruction element | Evidence-backed result |
| --- | --- |
| Original invariant | Current PRD/TRD agree; every selected carrier/capability/policy is inventoried; origin and WebAuthn policy match deployment; evidence claims only their actual coverage. |
| First divergence and decision | `3bea0e6`, `b9ff071`, `5bd9552`, `bd87655`, and `a073574`/`ff0b48f` are independent divergences that converge at closure. They do not have one demonstrated producer-inventory cause. |
| Alternatives considered or omitted | Strong versus narrow primitive separation, same-origin-only versus approved framing, static scanner versus CSP/runtime graph, browser feature inventory, and current-document synchronization all remained implicit or locally owned. |
| Closure assumption/evidence | Green self-checks, default browser policy, current compatibility observation, and detailed TRD rows were treated as enough despite missing cross-artifact coverage. |
| Downstream inheritance | Suite migration, origin threat boundary, slot/recovery WebAuthn, browser support, review scopes, implementer routing, and ASVS claims. |
| Later changes | AAD checks become stronger and shared WebAuthn serialization reduces byte drift, but neither creates policy ownership. Current external compatibility reduces immediate X25519 risk without closing the gate. |
| Exact surviving failure | CI can bless a shared primitive under undefined semantics, a reachable unapproved framed ceremony, a runtime remote channel, an unsupported HPKE operation, or contradictory current instructions. |
| Affected guarantees and machines | E-12/E-20 and OC-063/074/079; suite registry, WebAuthn verification, origin deployment, browser matrix, normative selection register. |

**Decision diagnosis:** this is an umbrella remediation surface, not one causal ancestor. The local evidence is
mostly accurate at its narrow scope. The bad steps differ: two missing policy decisions, two overbroad completeness
claims, and one current-document drift. A central registry, distributed coverage manifest, or targeted repairs with
bidirectional coverage remain alternatives; completed evidence does not select among them.

## `RC-9` — cross-cutting later-gate governance

**Causal chain**

`a deferred property remains safe only when a named stage/release gate can block progression and consumes evidence at
the property's real scope`
→ `bd87655` substitutes Baseline compatibility for a hardware-performance population
→ row 2/3 clean-cutover obligations leave legacy plaintext repair to Stage 1/2 without a resumable transaction
→ `9b49b74` treats audit history as selected-version review and separates optional source/blob freshness from normal
checks
→ Stage 0 correctly does not require the integrated runtime, but the later obligations lack a selected executable
gate authority with owners, inputs, and stop conditions
→ the tip can preserve a sound design while later implementation/release advances on weak or missing evidence.

| Required reconstruction element | Evidence-backed result |
| --- | --- |
| Original invariant | Performance is measured on declared hardware; ciphertext cutover loses no data and leaves no plaintext; reviewed source and shipping artifact are linked; later integrated tests gate release. |
| First divergence and decision | `bd87655` makes the invalid population inference. `9860a0b`/`3bea0e6` defer but do not define legacy cutover. `9b49b74` introduces version-audit overstatement and optional freshness. The independent journal-benchmark scope error remains causally in `RC-3`. |
| Alternatives considered or omitted | Real-device testing was correctly chosen over desktop throttling, but population sampling was omitted. Clean export/import was chosen over in-place migration, but restart/deletion state was omitted. Behavioral KAT and freshness were split without making both mandatory. |
| Closure assumption/evidence | One Pixel, Baseline status, a known unsupported development installation, a related external audit, and a green blob verifier. Each is useful but narrower than its later gate. |
| Downstream inheritance | Stage 1/2 cutover, support policy, performance acceptance, review 3a, CI/release provenance, and public shipping. |
| Later changes | The exact small blob and KAT repair size/primitive evidence, not device population, cutover state, audit-version scope, or source-to-binary binding. |
| Exact surviving failure | Shipping can retain/delete legacy plaintext incorrectly, miss the latency budget on supported hardware, review the wrong source scope, or import stale WASM bytes despite green normal checks. |
| Affected guarantees and machines | E-02/E-20 later obligations; release evidence, legacy cutover, browser/device support, toolchain provenance, and external review. |

**Decision diagnosis:** this is a non-accounting governance node over five domain-specific later gates, not their
causal ancestor. Deferral beyond Stage 0 is sound. The failure would be allowing “later” to remain a prose promise
rather than a release-blocking state with evidence readback.

## Independence check

The clusters intentionally meet at explicit edges rather than merge:

- `RC-1` decides **who may receive** a generation; `RC-2` decides **how a committed generation is installed and old
  capability retired**.
- `RC-3` preserves local edits before transport; `RC-4` preserves the exact authenticated network object after
  local durability.
- `RC-5` proves checkpoint/history meaning; `RC-6` proves a portable package's user-held root, opener, and receipt.
- `RC-7` decides lifecycle authority; `RC-6` supplies the terminal export/deletion handoff once retirement wins.
- `RC-8` repairs current closure truth; `RC-9` makes explicitly deferred implementation/release evidence blocking.

Merging any of those pairs would obscure a distinct authority or crash boundary; splitting the mapped findings
further would mostly reproduce one tree per symptom.
