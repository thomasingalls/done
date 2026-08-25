---
schema: 1
kind: work-item
id: X-05
status: complete
owner: root
started: 2026-08-25
updated: 2026-08-25
blocked_on: none
---

# `X-05` — continuity

## Scope and exclusions

Re-derive attribution, retention, portability, migration, and continuity guarantees across the pinned lineage. The seam includes card-creation claims and edits; compaction and checkpointing; never-established, live, and retired packages; service migration; lapse/expiry; retirement; total-device-loss restore; preservation of detached replicas; and first-deployment cutover loss.

Production code, requirements, selections, vectors, and tests are read-only. Platform-support and general evidence-quality questions remain `X-06`; propagation across every original claim remains `P-01`; full adversarial scenario replay remains `S-01`; and no candidate is promoted beyond `candidate` before `V-01`.

## Exact sources inspected

- Original boundary: `c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md`, `:docs/TRD.md`, `:docs/sequencing.md`, `:docs/progress.md`, and `:docs/decisions.md`, especially original-contract claims `OC-003`, `OC-011`, `OC-014`, `OC-020`–`OC-022`, `OC-030`, `OC-033`, `OC-043`–`OC-046`, `OC-053`, `OC-059`, `OC-069`, `OC-070`, `OC-072`, `OC-077`, and `OC-078`.
- End boundary: `9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/PRD.md`, `:docs/TRD.md`, `:docs/sequencing.md`, `:docs/progress.md`, and `:docs/decisions.md`, including PRD §§5.3, 6.9–6.11, 7.6–7.10, and 8; TRD §§4.5, 4.8, 7.4–7.6, 9.1–9.3, 10.4, 11.3, 13.5, 13.7–13.8, 14, 15, and 16.
- Exact-tip selections: rows 6–10 and 14–16, with emphasis on `row-7-checkpoint.md`, `row-8-attribution-record.md`, `row-10-portable-package.md`, `row-15-transitions.md`, and `row-16-hosted-retention.md`.
- Exact-tip executable evidence: `scripts/generate-attribution-vectors.mjs`, `generate-checkpoint-vectors.mjs`, `generate-package-vectors.mjs`, `generate-transition-vectors.mjs`, `check-retention.mjs`, and their checked artifacts.
- Introduction commits and diffs: `b997cdb6bfaabc0e73cbecbb444dc0df84044d71`, `745e332b061e0e964ae655e853f2f3b393667c66`, `4259822828060fe2b9592fa525cd9a17170af285`, and `cdd206952b7cc0c6511fc1ee6ccc740c1b129407`.
- Completed review artifacts: F-01/F-02, B-01–B-04, X-01–X-04, the corresponding commit cards, and every existing finding touching attribution, checkpoints, packages, recovery replacement, generation switching, retirement, or continuity.
- Disposable exact-tip archive `/tmp/lineage-x05.iHdJvj`, Node `v26.7.0`: attribution, checkpoint, package, and transition generators passed `--check`; the retention checker found twelve months consistently across five anchors and every §16 `unselected` cell bounded.

## Method

I reconstructed four independent ledgers and then joined them only at their explicit handoffs:

1. **Authenticated history:** source envelope → accepted mutation → standing card claim → edit/compaction → checkpoint → migrated archival evidence.
2. **Data recovery:** content key/factor → ciphertext source → checkpoint/suffix → clean local install, separate from whether history is authentic.
3. **Lineage/package state:** never-established → live → retired, including which actor signs each state and whether a state can be upgraded without the old service.
4. **Custody/service continuity:** surviving local replica, hosted copy, independent archive, and independently runnable software, treated as four different assets rather than one “backup” promise.

For each row I named the actors and durable objects, replayed the strongest failure case, located the evidence that should reject it, and classified the result `affirmed`, `qualified`, `reopen`, or `unresolved`. A generator passing its own checks was treated as carrier/encoding evidence only. I separately challenged complete-package substitution, Local archive restore, live-to-retired upgrade, two checkpoint producers, edited bodies, attribution replacement, lapse versus retirement, expiry with divergent devices, terminal deletion without acknowledgement, vanished-service migration, and both first-cutover carriers.

## Analysis

### Trace table

| Relevant claims/rows/commits | Reconstructed invariant | Actors and durable state | Scenario or counterexample | Evidence | Conclusion |
| --- | --- | --- | --- | --- | --- |
| `OC-011`, `OC-014`, row 8, `b997cdb` | A card-creation claim is minted by the writing credential, travels as content, and remains attributable without later re-signing | Writing/later credentials and fresh restorer; card, claim map, accepted envelopes, checkpoint | A later admitted credential replaces the whole tuple with a self-signed claim, then trim hides the prior value | Row-8 fields and exact vector; existing replacement candidate | `reopen` — tuple authenticity is sound, but mutable CRDT residence does not prove first creation to a fresh restorer. |
| `OC-014`, row 8, `b997cdb` | Signature validity and creation-body exactness are separate | Creator, editor, verifier; signed tuple, current card body, body commitment | Edit the card wholesale, including the ordinary create-empty-then-type path | Positive `verified && !exact` case and body-commitment negative | `affirmed` — “verified but edited” is the correct bounded reading; it is not current-body authorship. |
| `OC-030`, row 8, TRD §§4.5/10.4 | A claim retires only with its card; current-generation trim carries live claims forward and permits older attribution generations to retire | Replica set; content root, claim, current state record, old generations | Delete a claim independently; compact while an offline nested edit exists; retain card but drop its claim | Compaction is safety-paused; claim lives beside card; no acknowledgement protocol exists yet | `qualified` — residence closes the generation-retention floor, but CRDT replacement survives and future compaction still needs one acknowledged atomic card+claim deletion. |
| `OC-033`, `OC-069`, row 7, `b997cdb` | A checkpoint is a full snapshot whose `{sv,ds}` and accepted-head baseline semantically cover exactly the state it replaces | Producer, store, restorer; encrypted snapshot, manifest, head vector, suffix, generation opener | Sign unrelated snapshot/coverage/head constants; choose incomparable concurrent producers; lose newest | Carrier bindings/fallback depth pass; existing semantic-coverage and key-retention candidates | `reopen` for semantic coverage/key interlock; `unresolved` for admission/order and atomic install. |
| `OC-046`, rows 6–10, `b997cdb`/`745e332` | Migration makes old authority archival, creates a fresh lineage/generation, and re-envelops only each returning credential's own suffix | Restoring and returning devices, old/new services; package, old checkpoint/head, new origin, new generation | Replay old envelopes as new; make one device sign a third credential's residue; old service returns | TRD §14 and continuity tests 5–7 state the exclusions precisely | `qualified` — architecture is sound and honestly loses unarchived work from a credential that never returns, but inherits checkpoint, attribution, package-root, and local generation-switch gaps. |
| `OC-044`–`OC-046`, row 10, `745e332` | A user-held factor authenticates the old authorization root and then opens content/history without the vanished service | Package writer, code holder, restorer; `R_priv`, generation wraps, root, epochs, claims | Keep genuine recovery keypair but rewrap attacker content to `R_pub` under an attacker root | Existing paired rewrap argument versus the published changed-`info` negative | `reopen` — HPKE context binding is not sender/root authentication. |
| `OC-044`, row 10, `745e332` | A never-established Local archive has an explicit portable opener independent of an account recovery identity | Local user and clean importer; archive checkpoint, Local factor/wrap, generation key | Lose the only profile and restore with archive plus saved Local factor | Never-established vector verifies only a device-signed manifest and opaque part digests | `reopen` — new `f-745e332-local-archive-portable-wrap-undefined`. |
| `OC-020`, `OC-072`, row 10, `745e332` | Importing terminal evidence upgrades an existing live package to retired while preserving manifest authenticity | Offline package holder and former service; live manifest, terminal record, retired manifest | Replace the head part and state without the former service's signing private key | Exact vector signs live and retired manifests independently under different actors and five changed fields | `reopen` for record-only upgrade; importing a complete service-signed retired package remains a valid narrower path. |
| `OC-021`, row 16, `cdd206` | After grace, hosted sync stops; one disclosed duration covers resume and total-loss recovery; expiry deletes hosted ciphertext/wraps but not lineage/local replicas | Billing/account service, store, devices; stop time, expiry, ciphertext, wraps, sealed recovery object | Resume before/after expiry; delete wraps early; apply 12 months as a minimum but leave longer plan unbounded | Five-anchor consistency check; no deployed deletion execution | `qualified` — policy separation is coherent; twelve months is judgment, each longer plan needs its own ceiling, and deletion/reseed atomicity is unproved. |
| `OC-021`, `OC-077`, rows 15–16, `4259822`/`cdd206` | Deliberate lapse and retirement are durably distinguishable and replayable after interruption | User, billing/transition service; lapse request/settlement, live head, terminal record, retention clock | Try to encode lapse using the selected `rotate`/`replace-recovery`/`retire` grammar | Transition vector contains no lapse kind; retention adds no carrier | `reopen` — new `f-4259822-lapse-transition-kind-missing`. |
| `OC-020`, rows 10/15, `745e332`/`4259822` | Retirement commits terminal state, proves a current survivor/export and catch-up condition, distributes evidence, then deletes hosted copies | Retiring/stale devices, auth service, store; terminal record, package ack, deletion gate | Lose package reply or retire when every reachable replica is stale | Terminal-before-delete order is explicit; no durable survivor/catch-up acknowledgement exists | `reopen` — existing safe-survivor candidate; the order is right but the deletion predicate is absent. |
| `OC-003`, `OC-020`–`OC-021`, PRD §§6.9–6.10 | Lapse, expiry, migration, and retirement never delete or freeze surviving local replicas; replica completeness is never inferred | Local devices and service; each device's last ciphertext replica and live/terminal head | Device stays offline across lapse/retirement and later edits/merges | Normative copy repeatedly says “last replica”, no remote wipe, and local writes do not await service | `affirmed` at the requirements layer; destructive local clear and reseed remain separate implementation transactions. |
| `OC-034`, rows 9/10/14/15 | Total-loss recovery requires four independent objects: account access, authorization state, content factor, and ciphertext | Recovering user/device, services/archive; credential, signed head, code-sealed key, wraps, ciphertext | Remove any one object; replay a stale head; replace root; recover after exposed-code replacement | Recovery/head/package/transition vectors plus X-04 findings | `qualified` — separation is sound, but package root, Local opener, replacement forward rotation/payload coverage, and hostile-service first contact limit the guarantee. |
| `OC-043`, `OC-053`, `OC-059`, row 21 | First deployment selects either Markdown with permanent system re-attribution/identity loss or early fidelity archive; cutover cannot discover the choice | Cutover owner and existing development installation; old store, Markdown/package carrier, new encrypted store | Call Markdown “lossless”; start Stage 2 without recording the product choice | Tip TRD row 21 and sequencing §5.4 remain explicitly open and gate cutover | `unresolved`, correctly — known loss is preserved rather than silently closed; no finding unless cutover proceeds first. |
| `OC-045`, TRD §11.3 | Service independence requires material and software already outside the original provider account, plus tested clean restore/migration | User, independent operator; source/releases, client/service/store, archive, factor | Run continuity tests inside another resource owned by the same provider account | Nine staged tests, especially test 9 | `qualified` — the test boundary is excellent, but the repository contains design artifacts rather than completed tests 4–9 or an independently runnable service/recovery stack. |

### Authenticated history through editing, trim, and compaction

The standing claim fixes a real retention problem. Signing the tuple at card creation avoids the forbidden checkpoint shape in which another producer copies an old envelope signature beside newly assembled state. Its body commitment also preserves an important nuance: a valid signature says who made the creation claim; equality with the current body says only whether the card is unchanged. The ordinary empty-card creation path therefore becomes `verified but edited` after typing, which is narrow but internally honest.

Moving the claim into the content root means trim re-seals it under the current generation with the card. That genuinely removes the former need to retain every historical envelope generation merely to display authorship. Destructive compaction remains paused because elapsed time is not replica acknowledgement; that is the right safety direction and prevents attribution retirement from outrunning unseen content.

The load-bearing mistake is calling a CRDT map write-once. The signature stops edits to Alice's tuple, but not Bob replacing the entire value with a valid Bob tuple. Acceptance authenticates Bob's replacement mutation, not the first creation event. A client that remembers Alice can reject it; a package/checkpoint restorer has no such state after trim. The existing attribution candidate therefore survives unchanged and propagates directly into package and migration history.

### Checkpoint and migration continuity

A migration restore needs both a content baseline and an old-history verifier. The selected design correctly refuses to replay old accepted envelopes under the replacement service: the new service admits the recovered checkpoint as a new origin, creates a fresh lineage/generation, and treats former evidence as archival. A returning credential may re-envelop only its own post-checkpoint residue. Work known only to a credential/device that never returns is honestly lost rather than re-attributed.

That architecture inherits three independent qualifications. First, row 7 authenticates the bytes and the producer's attestation without proving the semantic equation among snapshot, `{sv,ds}`, accepted heads, and suffix. Second, retained fallback checkpoints require generation openers rather than the selection's inverted “never drop a checkpoint” mirror rule. Third, a migrated package's historical root can be substituted by rewrapping attacker content to genuine `R_pub`. These are different failures: content coverage, key availability, and historical authority must not be collapsed into “the checkpoint verifies”.

### One package at three states

The common manifest/parts format is a useful normalization: it prevents an importer from inferring lineage state from optional part shape, and its sorted part digest detects truncation/dropped parts. The three states nevertheless need different trust stories:

- **Never-established:** no lineage or external authority; an archive-specific saved factor must open a portable generation wrap. The selected vector never constructs that opener.
- **Live:** an authorized credential signs the manifest and the package carries a signed live head.
- **Retired:** the former service/trust root signs a manifest over terminal state.

The live→retired claim is stronger than the carrier. Adding a terminal record changes the signed part digest and four other manifest fields; it cannot be an in-place authenticated transformation by an offline importer. A complete service-signed retired package is coherent, but that is the narrower path the spec must name. This gap is separate from both package-root substitution and the durable safe-survivor acknowledgement required before deletion.

### Lapse, expiry, retirement, and replicas

The normative state separation is strong. A lapse stops hosted synchronization after grace while devices remain locally writable. Expiry deletes the hosted copy and wraps, not the live lineage or local ciphertext. Retirement first commits terminal lineage and only later deletes hosted material. None promises a complete remote copy, remote wipe, or convergence while disconnected. A stale device is exactly a detached last replica and may later merge with another survivor.

Twelve months is a disclosed product judgment rather than a measurement. One window for both resume and hosted total-loss recovery is coherent because ciphertext dominates storage and recovery additionally needs only small wraps/sealed key material. The fixed repository checker proves prose agreement, not expiry execution. A plan longer than twelve months also needs its disclosed duration to become that plan's deletion ceiling; the fixed-anchor check does not enforce deployment configuration, replicas, or backups.

The selected transition evidence does not actually contain the lapse it claims to bind. Comparing `rotate` with `retire` proves those messages differ, but rotation is not hosted read-only and has no retention-clock semantics. A separate billing state machine can solve this safely; until it is selected, row 15's product-downgrade closure is an overstatement.

Retirement has the correct fail-closed direction—terminal state with hosted bytes still present—but no selected durable gate proves that a verified-current replica or fresh export received the terminal evidence and catch-up state. Combined with the live-package re-signing gap, deletion must remain gated on an explicit full-package delivery/acknowledgement rather than a UI request or locally prepared bytes.

### First-deployment cutover

The lineage does not silently erase the Markdown carrier's losses. `id`, `author`, `origin`, and `createdAt` are deliberately absent; import is a system-actor write; byte-identical Markdown round trip is not workspace-preserving migration. Row 21 remains open between accepting permanent system attribution for the single-author development history and pulling the fidelity archive into Stage 2. That choice gates cutover, not review 3a/3b or the original Stage-0 exit. It is an unresolved product choice, not a retrospective finding while the gate remains explicit.

Using the fidelity archive at cutover is also not yet automatically safer: it would inherit the package/checkpoint/Local-opener candidates. The correct next decision must price those prerequisites rather than treat “encrypted archive” as a synonym for exact verified restore.

### Evidence boundary

All five exact-tip checks run for this seam were current. They establish deterministic carrier encodings, signature/AEAD field refusal, part-digest truncation sensitivity, and prose-anchor consistency under the project model. They do not execute Yjs semantic coverage, immutable-first attribution, a Local archive opener, record-only package upgrade, clean-device restore, an authorization/durable-store service, lapse/expiry, safe retirement deletion, independently controlled deployment, or migration with the original provider account unavailable.

## Affirmative conclusions

- The body commitment correctly distinguishes `verified and exact` from `verified but edited`; the latter is not a signature failure and does not claim current-body authorship.
- Co-locating live attribution claims with cards lets ordinary trim re-seal both under the current generation and genuinely closes the old unbounded attribution-generation floor.
- Safety-pausing destructive compaction until replica acknowledgement is correct. Elapsed time and day freeze are not synchronization evidence.
- New-lineage/new-generation migration correctly isolates rather than claims to revoke an unreachable old service, and it forbids laundering old acceptance evidence into the replacement lineage.
- A returning device re-signing only its own suffix is the right provenance boundary; third-credential residue absent from the archive is lost rather than reassigned.
- Markdown export and encrypted fidelity archive have correctly different jobs: readable escape versus exact encrypted restore. The archive is explicitly not a recovery factor.
- One canonical package format and a bound lineage-state discriminator are useful; sorted part counts/digests make dropped or truncated parts detectable under an authentic manifest.
- Lapse, hosted expiry, and retirement preserve local writability/replicas and have distinct lineage effects. “Last replica” is maintained instead of the false “complete copy”.
- One disclosed hosted-retention window for resume and total-loss recovery is coherent; twelve months is explicitly a policy judgment and not represented as empirical optimum.
- Terminal-before-hosted-deletion is the correct fail-closed order. A retired lineage with bytes still retained is recoverable; live lineage with deletion already performed would not be.
- The continuity gate correctly requires material and execution outside the entire original provider account. Source availability or another bucket under the same operator is not treated as continuity proof.
- First-cutover attribution loss remains an explicit open row and gate. The lineage does not call Markdown workspace-preserving or silently decide the product tradeoff.

## Candidate or validated findings

New candidates:

- High/high: [`f-745e332-local-archive-portable-wrap-undefined`](../../findings/f-745e332-local-archive-portable-wrap-undefined.md). The never-established package vector has no Local-specific saved-factor-to-generation opener.
- Medium/high: [`f-745e332-live-retired-package-resigning-undefined`](../../findings/f-745e332-live-retired-package-resigning-undefined.md). Terminal-record-only upgrade changes five manifest inputs and signer without a re-signing rule.
- Medium/high: [`f-4259822-lapse-transition-kind-missing`](../../findings/f-4259822-lapse-transition-kind-missing.md). Row 15 claims to bind deliberate lapse but defines no lapse kind/state.

Existing candidates that survive direct X-05 challenge:

- [`f-b997cdb-attribution-self-replacement`](../../findings/f-b997cdb-attribution-self-replacement.md): a later admitted credential can replace the mutable claim with a new self-consistent creator tuple.
- [`f-b997cdb-checkpoint-coverage-unchecked`](../../findings/f-b997cdb-checkpoint-coverage-unchecked.md): signed opaque coverage fields are not semantic snapshot/head coverage.
- [`f-b997cdb-checkpoint-key-retention-inverted`](../../findings/f-b997cdb-checkpoint-key-retention-inverted.md): retained fallback checkpoints need generation openers; row 15's deletion gate repeats the omission.
- [`f-745e332-package-root-rewrap-substitution`](../../findings/f-745e332-package-root-rewrap-substitution.md): a package writer can rewrap attacker content to genuine `R_pub` under a substituted root.
- [`f-4259822-generation-switch-local-durability-undefined`](../../findings/f-4259822-generation-switch-local-durability-undefined.md): migration/rotation still lacks the exact local successor install and old-object cleanup order.
- [`f-a073574-enrollment-recovery-key-unbound`](../../findings/f-a073574-enrollment-recovery-key-unbound.md): enrollment does not authenticate the delayed recovery recipient later used by rotation/package continuity.
- [`f-4259822-recovery-replacement-no-forward-rotation`](../../findings/f-4259822-recovery-replacement-no-forward-rotation.md) and [`f-4259822-recovery-replacement-payload-bytes-unbound`](../../findings/f-4259822-recovery-replacement-payload-bytes-unbound.md): total-loss recovery after replacement inherits continuing old-generation exposure and incomplete replacement-set commitment.
- [`f-4259822-retirement-safe-survivor-gate-undefined`](../../findings/f-4259822-retirement-safe-survivor-gate-undefined.md): no durable acknowledgement joins terminal settlement to safe hosted deletion.

All remain `candidate`; this work item records cross-seam survival and does not pre-empt `V-01`.

## Disconfirmed hypotheses and null results

- **Editing a card should invalidate its attribution signature:** disconfirmed. The signature authenticates the creation claim; the body commitment independently marks the current card non-exact.
- **A standing claim still requires the original envelope generation forever:** disconfirmed for an honest immutable claim. Content-root trim re-seals the claim under the current generation.
- **A checkpoint producer must re-sign all authors:** disconfirmed in the intended model. Standing per-card claims travel inside the snapshot; the producer signs only the container.
- **A package/manifest signature alone supplies a recovery factor:** disconfirmed. It authenticates bytes and never unwraps a content key.
- **The fidelity archive is the readable escape format:** disconfirmed. Markdown is readable but loses workspace identity; the archive is exact ciphertext and needs an independent factor.
- **Migration remotely retires an unreachable old service:** disconfirmed. It creates a new lineage/generation and isolates the old copy; the old service may still consider its lineage live.
- **The migrating device may re-sign a missing third credential's work:** disconfirmed. Only the returning source credential may re-envelop its own suffix; absent residue is an explicit loss.
- **One retained checkpoint is enough:** disconfirmed by newest-unavailable fallback; two checkpoints and suffixes are necessary.
- **A full service-signed retired package is impossible:** disconfirmed. The exact retired positive is coherent; the surviving finding is specifically the claimed terminal-record-only upgrade and its delivery state.
- **No safe lapse implementation is possible without a signed client intent:** disconfirmed. A separate durable billing/service state machine can work, but it has not been selected and cannot justify the current row-15 closure claim.
- **Lapse or retirement should remove local copies:** disconfirmed. Local replicas stay writable/detached, and no remote wipe is promised.
- **Twelve months is empirically optimal:** no evidence supports the hypothesis; the selection correctly presents it as judgment. The unresolved question is policy calibration and per-plan ceiling execution.
- **Row 21 was silently closed by row 10:** disconfirmed. The tip explicitly keeps first-deployment attribution open and gates Stage 2 on it.
- **The relevant generated artifacts are stale:** disconfirmed. All exact-tip checks passed under Node `v26.7.0`; surviving concerns are model/coverage gaps.

## Unresolved questions

- What immutable accepted-creation object lets a fresh checkpoint/package restorer distinguish the first attribution claim from a later valid self-replacement?
- Which producer/restorer algorithm derives Yjs insertion/deletion coverage and the accepted-head baseline from one real snapshot, and how is it independently challenged?
- How are concurrent checkpoint head vectors admitted/ordered when incomparable, and which atomic local transaction installs one checkpoint or falls back cleanly?
- Which exact generation opener must survive for every retained checkpoint/suffix and package part, and what deletion predicate joins it to transition settlement?
- What user-held non-rewrappable value authenticates the historical package root against a package writer who keeps genuine `R_pub`?
- What exact Local archive factor, keypair, seal, generation wrap, confirmation, rotation, and clean-device restore path implements the explicit portable-wrap requirement?
- Is live→retired continuity terminal-record transformation or complete retired-package import? Which signature authorizes the final manifest, and what happens when only the terminal record reaches an offline holder?
- Which durable acknowledgement proves a verified-current survivor/export received a complete terminal package and catch-up result before each hosted deletion class?
- Is lapse a fourth row-15 kind or a separate service state machine? What durable event starts the retention clock exactly once and wins a race with retirement?
- How does a longer-than-twelve-month plan publish and enforce its own deletion ceiling across primary stores, replicas, backups, and support artifacts?
- How does expiry reseed from one or several divergent devices without mistaking missing hosted state for never-established genesis or discarding a legitimate branch?
- How do recovery replacement, delayed recovery-recipient authentication, and package export compose so every retained recovery artifact names the exact currently intended keyset?
- Which independently controlled distribution/deployment/recovery-tool artifacts satisfy continuity tests 4–9, and where are the recorded results?
- Before Stage 2, will row 21 accept permanent system attribution or require a corrected early fidelity archive? Which rollback/check verifies that the one-way cutover preserved every selected field?

## Completion criteria

- [x] Required cross-cutting trace table includes claims/rows/commits, invariant, actors/state, counterexample, evidence, and classified conclusion.
- [x] Attribution/body-edit/compaction/checkpoint/migration/package/lapse/retirement/cutover paths are reconstructed from exact pinned objects.
- [x] Data recovery, authenticated history, service independence, and local-replica preservation are separated explicitly.
- [x] Exact-tip relevant checks run in a disposable archive without moving the checkout.
- [x] Three new findings, inherited surviving candidates, affirmative conclusions, and null results are durable.
- [x] No production artifacts or other work-item artifacts were changed.
- [x] Session handoff and final validator are complete.

## Handoff

`X-05` is complete. Run `node scripts/review-status.mjs`, then claim first-ready `X-06` at `docs/review/analysis/seams/X-06-platform-evidence.md` with a fresh session. `S-01` is also dependency-ready after this completion, but first-ready ordering remains `X-06`. Carry the exact distinction between a passing construction checker and absent lifecycle/restore execution into X-06; leave propagation reconciliation for `P-01` and candidate disposition for `V-01`. There is no blocker.
