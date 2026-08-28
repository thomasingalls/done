# S0-9 independent challenge — storage, crash/retry, and concurrency

**Standing:** record — speaks of `5923f510fd9ac3c1cd809e9bec352a7f73751492`, the challenged tip; pinned in
`census.json`, so edits land only as dated addenda under a re-pin.

**Challenger:** independent non-author review

**Reviewed tip:** detached `5923f510fd9ac3c1cd809e9bec352a7f73751492`

**Disposition:** **FAIL — Stage 0 must not close.** Seven unresolved design/spec/model-consistency defects remain: two high and five medium. All seven are Stage 0 blockers. The generated artifacts are current and the existing test suite passes; the failures are missing composition states or a model that asserts the opposite of the required invariant.

This review stayed inside the assigned worktree and consulted no other ref, checkout, worktree, report, network repository, or later object. Exact commands and results are in [`challenge-storage-commands.md`](./challenge-storage-commands.md).

## Baseline and independence result

- `pnpm vectors:check`: exit 0 on the approved rerun; all 16 vector artifacts current and 190 AAD fields isolated.
- `pnpm test`: exit 0 on the approved rerun; 36 files and 371 tests passed.
- `pnpm trace:check`: exit 0; 85 claims, 27 of 28 current defects marked falsified, 2 declared owed.
- Targeted storage/state artifacts: transition, journal, record, checkpoint, package and anti-replay generators all exit 0; retention, update-limit and WASM checks all exit 0; 66 targeted tests pass.
- `pnpm check`: exit 1 at the already-known lint failure after typecheck passed. The first error is `scripts/generate-head-discovery-vectors.mjs:496:32`, `eslint(no-shadow)`. This is not treated as a remediation failure.
- Every causal hash named below was proved to be an ancestor of this HEAD with `git merge-base --is-ancestor`; every check exited 0.

The important result is therefore not stale bytes or a generally broken suite. It is that several green models omit the state needed to express the named falsifier, and two models positively bless unsafe terminal states.

## New Stage 0 blockers

### ST-01 — Local archive factor authenticates an archive HPKE identity, but not the package manifest/content root

**Severity:** high

**RC/finding:** `RC-6`; `f-745e332-local-archive-portable-wrap-undefined` and the Local form of `f-745e332-package-root-rewrap-substitution`

**Stage 0 blocker:** yes

**Earliest action to reopen:** `S0-6` Stages A/B/D (the direction in `P-6` can remain)

`S0-6/A-schemas.md:49-59` factor-seals `archive_priv || RootCommitment`, where the commitment ends at `(workspace, "", archive_pub)`. The clean restore model at `scripts/generate-package-vectors.mjs:880-923` checks that commitment and then opens any HPKE base-mode wrap made to the public `archive_pub`. It does not verify the package manifest, parts digest, checkpoint or generation content on this path. The separately verified never-established manifest at `scripts/generate-package-vectors.mjs:1112-1123` instead names and verifies `KEYS.laptop.public_key`; that key is not authenticated by the archive factor. The published vector nevertheless says “what authenticates it is the code” at lines 1290-1303.

Reproduction/isolation: immediately after the honest clean restore, mint a fresh generation wrap to the published `ARCHIVE_PUB`, using the genuine public context and an independently chosen generation key, then call the existing `restoreArchive`. The returned key is the newly chosen key. A temporary assertion that rejected that result made `node scripts/generate-package-vectors.mjs --check` fail exactly with:

```
Error: S0-9: a freshly minted Local archive generation under attacker bytes was accepted
    at verify (.../scripts/generate-package-vectors.mjs:942:11)
```

The mutation was removed with `apply_patch`; the unmodified generator then passed and the file had no diff.

**Violated invariant.** `P-6:27-36` requires the factor-sealed commitment to make the fresh-rewrap case fail for Local archives; `P-6:80-91` explicitly requires a paired fresh rewrap negative. `S0-6/A-schemas.md:125-138` also requires one integrated importer: commitment, manifest/parts, wraps, semantic checkpoint, card identities, and staged install. The executable Local positive proves only envelope-to-wrap opening, not that the factor authenticates the package being installed.

**Actor authority.** The factor holder is the Local trust root. The current factor authenticates the archive encryption public key, while a different, unauthenticated device key authenticates the manifest. No rule joins those authorities.

**Preserved theorem / simpler repair.** Preserve the archive code derivation, clean-device opener, workspace/generation `info` binding, and common package framing. The narrow repair is to bind the never-established manifest authority and package root (or the exact manifest digest) into the factor-authenticated ArchiveIdentity and exercise the full importer. A new package format or new external authority is unnecessary. Adding another old-ciphertext mutation would not repair the causal defect.

### ST-02 — the retirement ceiling deliberately deletes every hosted survivor without a handoff

**Severity:** high

**RC/finding:** `RC-6`/`RC-7`; `f-4259822-retirement-safe-survivor-gate-undefined`

**Stage 0 blocker:** yes

**Earliest action to reopen:** `S0-7` Stage A/B/E and row 16's S0-7 amendment; return to the product choice before changing a vector

`S0-6/A-schemas.md:106-123` says a timer is never currentness evidence, only a durable `TerminalHandoff` authorizes deletion, and a lost acknowledgement retains bytes. `S0-7/A-schemas.md:113-127` reverses that theorem: the deadline is a ceiling for retirement and a lost acknowledgement retains bytes only until it. `test/hostedRetention.test.ts:441-455` positively asserts that a retirement with zero handoffs deletes all six classes and reaches `cleared` after the deadline.

Kill/loss schedule:

1. Retirement commits a terminal lineage.
2. Every potential receiver is absent, stale, or missing an exact catch-up/package; no `TerminalHandoff` is durable.
3. The acknowledgement/request path remains lost until the deadline.
4. `enforceCeiling` deletes primary, replicas, checkpoints, wraps, backups and recovery anchor and records `cleared` while `handoffComplete` is false.

This recreates the high-severity end state: there is no proved-current survivor and no retained hosted recovery path. An audit bit describing the loss does not make deletion recoverable.

**Actor authority.** `P-4` selected a retention-service signer and “retire wins”; it did not authorize elapsed time to impersonate the receiving client's evidence. The original row-16 duration was selected for **lapse**. `S0-7/README.md:40-52` introduced the cross-cause ceiling as its own resolution, and lines 152-160 explicitly ask S0-9 to challenge the unargued retirement duration. The receiving client remains the only actor able to attest current custody.

**Preserved theorem / simpler repair.** Preserve the one expiry clock, six-class ledger, expiry deletion, recovery-anchor distinction, and per-class idempotent progress. There is no honest superficial repair: product must choose between bounded service retention and the safe-survivor theorem, or select an independently safe escrow/export mechanism. Merely renaming `cleared` or keeping an audit record is not a repair.

### ST-03 — write-admission refusal is not crash-total after the authoritative Yjs mutation

**Severity:** medium

**RC/finding:** `RC-3`; `f-9b49b74-journal-seal-64k-gap`

**Stage 0 blocker:** yes

**Earliest action to reopen:** `P-3`/`S0-3` admission decision and Stage A/D model

`S0-3/A-schemas.md:30-49` concedes that exact update length is known only after the Yjs transaction commits, then places admission “before the seal.” `docs/TRD.md:711-726` states the original failure precisely: the document has changed and durable storage has not. For oversize/quota/unavailable it now says to force the async IndexedDB batch and withhold acknowledgement.

The executable model removes the crash window. `test/writeAdmission.test.ts:73-115` calls `journalWrite`, receives refusal, inserts a zero-cost pseudo-entry, and calls `commitBatch` synchronously in the same pure function. The test at lines 239-248 observes only the already-committed return state. It cannot schedule a kill after the Yjs mutation/localStorage refusal and before IndexedDB's `complete` event.

Kill schedule: produce/apply the authoritative Yjs update; synchronous journal refuses for any of the three causes; forced IndexedDB transaction is pending; page dies. There is neither a WAL entry nor a completed batch, so the update is not recoverable. “Not acknowledged” accurately describes the UI state but does not satisfy the selected WAL theorem or the S0-9 condition that the post-mutation case be fully recoverable.

**Preserved theorem / simpler repair.** Preserve bounded slicing, the derived 16 KiB interim limit, character-denominated backpressure, remote redelivery, and the synchronous AEAD. The smallest repair stages or derives the update before making it authoritative, or supplies a genuinely synchronous/staged fallback for the refusal state. A pure `commitBatch` call in the test is not a substitute for the async commit boundary.

### ST-04 — generation rotation and local writer selection have an unfenced TOCTOU window

**Severity:** medium

**RC/finding:** `RC-2`/`RC-3`; `f-4259822-generation-switch-local-durability-undefined` and `f-3bea0e6-store-sequence-allocation-undefined`

**Stage 0 blocker:** yes

**Earliest action to reopen:** the `S0-2`/`S0-3` interface, and `P-3` if its reserve/re-reserve transaction shape changes

`S0-2/A-schemas.md:123-139` says step 5 advances the active marker only once no new write can select the old generation. `docs/TRD.md:676-683` separately says a batch reserves under the current generation and re-reserves if it finds a newer one. No selected record supplies a generation lease/fence or atomic commit validation, and `GenerationReferences` at `S0-2/A-schemas.md:145-163` contains committed object classes but no in-flight reservation/encryption.

Concurrency schedule:

1. Writer W reserves a sequence range under generation `g` and observes `g` active.
2. `GenerationApply` classifies the currently durable old-generation objects.
3. Step 5 atomically changes the marker to `g+1`.
4. W encrypts and commits a record under `g` after the marker, using its already granted reservation.
5. Step 7 may retire the last `g` opener because the late record was absent from classification.

The sequential test at `test/writeAdmission.test.ts:356-364` rotates and only then re-reserves. `test/generationApply.test.ts:36-68` uses immutable static `journal`, `batch`, and `outbound` arrays and has no concurrent writer. Thus both tests pass while the composition fails.

**Preserved theorem / simpler repair.** Preserve the global allocator, per-generation invocation counts, GenerationApply's commit point, and opener reference predicate. The narrow repair is one durable active-generation fence/lease: serialize reserve plus commit eligibility with marker advance, or validate/abort the record commit under the same compare-and-set. No cryptographic format change is needed.

### ST-05 — an abandoned outbound position has no durable resolution state

**Severity:** medium

**RC/finding:** `RC-4`; `f-992bc91-outbound-envelope-spool-undefined`

**Stage 0 blocker:** yes

**Earliest action to reopen:** `S0-4` Stage A/D

`S0-4/A-schemas.md:45-63` defines `PositionCounter` with only `next_position` and `reserved[gen]`, then asserts that a reservation lost before mint is occupied by a successor “binding the reservation” or closed by a refusal. Neither branch has a carrier: no reservation id/row/digest is durable, and `Refuse` at lines 75-85 requires the exact `refused_digest` of an envelope that was never minted.

The claimed falsifier is not executed. `test/outboundSpool.test.ts:269-281` proves only that the abandoned reservation is counted; lines 283-291 reserve the next number and prove the gap remains. No test occupies or closes the abandoned position, and the model's envelopes do not contain the accepted-chain link whose progress is supposed to depend on closing it.

Crash/concurrency schedule: tab A reserves `n` and dies before spool insertion; tab B serially reserves `n+1`; recovery sees a counter and possibly later spool bytes, but no durable record identifies what `n` was reserved for or supplies exact bytes/digest that can receive a decision. The chain cannot advance under the stated “no skip” rule without inventing a recovery algorithm outside the selected records.

**Preserved theorem / simpler repair.** Preserve exact-byte spool retention, identical retry after lost request/reply, permanent signed refusal, and unbounded same-position refusal chain. Make reservation itself durable and recoverable, or atomically combine reservation with a staged spool record. This does not require deterministic envelopes or a new service authority.

### ST-06 — checkpoint authority and install/fallback obligations are absent from the executable model

**Severity:** medium

**RC/finding:** `RC-5`; `f-b997cdb-checkpoint-coverage-unchecked` and its checkpoint install/fallback machine

**Stage 0 blocker:** yes

**Earliest action to reopen:** `S0-5` Stage A/D (the selected `P-8` branch can remain)

`P-8:111-128` requires: producer-only admission fails where a second eligible exists, self-admission succeeds only where none exists, trim waits for admission, incomparable candidates serialize, and partial install activates neither content nor heads while newest loss falls back to the second-newest.

The generator's verifier at `scripts/generate-checkpoint-vectors.mjs:594-643` imports one fixture verifier directly. It has no certified-recipient set, eligibility input, producer identity comparison, or cardinality. The self-admission block at lines 650-678 unconditionally verifies and accepts a producer signature; it never constructs the “second eligible exists” state. A valid signature by an ineligible credential is likewise outside the model.

Install is also missing. Repository search finds no checkpoint partial-install state machine in tests or generators. `test/generationApply.test.ts:94-105` represents step 6 as a single array prepend, atomically conflating content installation, head activation, semantic admission and retention. Its second-newest check proves opener-set arithmetic, not that a partial newest install leaves neither content nor heads active or that restore actually retries the older complete tuple.

**Actor authority.** The normative actor rule is sound: a certified eligible client, second party when available, producer only when necessary. The evidence accepts keys, not eligibility, so it cannot distinguish the selected authority from any signer.

**Preserved theorem / simpler repair.** Preserve mandatory local `{sv,ds}` re-derivation, authenticated decision parent, creator-committed card ids, and two-checkpoint opener floor. Add an eligibility/cardinality input and a durable staged install record with separate content/head commit; do not replace `P-8` with quorum or portable proofs merely to make the test easier.

### ST-07 — the divergent-reseed test forks the input world instead of accepting both branches

**Severity:** medium

**RC/finding:** `RC-7`; `f-4259822-lapse-transition-kind-missing`'s required reseed machine

**Stage 0 blocker:** yes

**Earliest action to reopen:** `S0-7` Stage A/D

`P-4:82-93` requires two divergent survivors both reseed as branches. `S0-7/A-schemas.md:143-159` says each branch names the same live lineage/epoch and a stale retention revision is refused.

`test/hostedRetention.test.ts:550-571` creates two sessions at the same revision, then independently calls `resume(clearing, a)` and `resume(clearing, b)`. Neither result is passed to the other. In the selected compare-and-set machine, accepting A advances the revision, so B is stale. The model has no branch set, import set, merge state or convergence action; `resume` reconstructs the full `present` set and returns `hosted` for either isolated counterfactual.

Concurrent schedule: A and B derive sessions from revision `r`; A commits and advances to `r+1`; B arrives with `r`. The implemented guard refuses B, contradicting “both reseed.” Rebuilding B against `r+1` is mentioned in prose but no state says how its divergent content joins A without replacing it.

**Preserved theorem / simpler repair.** Preserve the live lineage, signed reseed identity, stale-revision guard, and no-genesis rule. Model a durable branch/import set and test A then B against the resulting world. The repair is local to reseed composition; it does not require putting lapse into the authorization transition grammar.

## RC-1 through RC-9 disposition

| RC     | Result                 | Causal ancestor(s), all proved ancestor of HEAD                  | Survival, authority, crash/retry/concurrency, and named scenarios                                                                                                                                                                                                                                                                                                                                                                                                                                        | Preserved local theorems and simplest sound repair                                                                                                                                  |
| ------ | ---------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RC-1` | **PASS**               | `c611666`, `a073574`                                             | Certified-set membership and recovery-state digest survive; stale set, unauthorized/unkeyed recipient, substituted recovery key, incomparable approval and four-object bootstrap negatives execute. Authority remains one eligible content-holding client; no crash counterexample found.                                                                                                                                                                                                                | Typed SAS and direct enrollment remain valid; single-owner authority preserves total-loss recovery without quorum. No repair indicated by this lens.                                |
| `RC-2` | **FAIL**               | `f5def83`, `b997cdb`, `4259822`, `dbfd01f`                       | Kill-at-each-step and static opener cleanup pass, as do exact replacement bytes and lock vectors. They do not compose with an in-flight writer (ST-04), and checkpoint install remains collapsed (ST-06). Exact runtime forward-rotation/application is truthfully later work, not a new Stage 0 failure by itself.                                                                                                                                                                                      | Preserve signed outcome, eight-step journal, exact payload, factor-gated replacement credential and opener predicate; add the write fence and real install state.                   |
| `RC-3` | **FAIL**               | `9860a0b`, `3bea0e6`, `dbfd01f`, `9b49b74`, `66a7c6a`            | Oversize boundary, 16 KiB budget, WASM widths, rotated journal root, nonce equality, abandoned invocation accounting, two-tab sequential allocator and covered-set trim pass. The refusal crash is unmodelled (ST-03), and allocator/rotation is not globally fenced (ST-04).                                                                                                                                                                                                                            | Preserve cipher choices, AAD, slicing, per-generation reservation and character watermark. Stage/refuse before authoritative mutation and fence generation selection.               |
| `RC-4` | **FAIL**               | `992bc91`, `745e332`                                             | Mint-before-send kill, lost reply/identical retry, unsigned/error silence, refusal binding/permanence, successor retries, equivocation and cleanup floor pass. Reserve-before-mint crash does not resolve the abandoned position (ST-05).                                                                                                                                                                                                                                                                | Preserve exact bytes and `K_accept` authority; make reservation a durable spool state or one atomic reserve/stage operation.                                                        |
| `RC-5` | **FAIL**               | `b997cdb`                                                        | Omitted insertion/deletion, ahead heads, extra operation, local re-derivation, derivation version, decision-parent signature and immutable creator-id negatives pass. Eligibility/self-admission authority, partial install and actual fallback do not execute (ST-06).                                                                                                                                                                                                                                  | Preserve semantic admission branch and creator-committed identity; add certified-set/cardinality checks and install transaction.                                                    |
| `RC-6` | **FAIL**               | `745e332`, `4259822`                                             | Account root commitment, pre-unwrap order, full retired replacement, catch-up/current handoff and per-class deletion gate locally pass. Local archive root is not joined to its manifest/content (ST-01), and S0-7 overrides lost-handoff safety at the deadline (ST-02).                                                                                                                                                                                                                                | Preserve common framing and client receipt. Bind Local package root to the factor; reopen the retirement ceiling product decision.                                                  |
| `RC-7` | **FAIL**               | `4259822`, `cdd2069`                                             | Separate vocabulary, exactly-once clock, entitlement replay, backdating, partial class deletion, resume-before/after deletion and retire-wins orderings pass. The ceiling violates the consumed handoff theorem (ST-02), and divergent reseed is two independent worlds (ST-07). `TerminalHandoff` has no class field while the retention model invents per-class handoff-set entries; treat the handoff as one durable fact applied by a per-class ledger unless a new class-bound receipt is selected. | Preserve the separate retention signer/state vocabulary, one clock, class ledger, expiry anchor and retire-wins rule. Revisit only ceiling authority and reseed branch composition. |
| `RC-8` | **PASS**               | `3bea0e6`, `5bd9552`, `b9ff071`, `bd87655`, `a073574`, `ff0b48f` | Strong suite separation, narrowed origin claim, same-origin WebAuthn policy, selected-status cross-check and current X25519 compatibility wording are internally consistent and exact artifacts pass. The dated X25519 browser table and runtime/deployment CSP graph remain correctly assigned later gates.                                                                                                                                                                                             | Preserve bounded claims and independent checkers; do not broaden static source scanning into a runtime claim.                                                                       |
| `RC-9` | **PASS (later-gated)** | `bd87655`, `9860a0b`, `3bea0e6`, `9b49b74`                       | The five later obligations remain named with owners/stages: declared-device append performance, legacy plaintext cutover/restart, exact RustCrypto source/version review, source-to-blob freshness, and integrated runtime checks. They were not executed or falsely credited at Stage 0.                                                                                                                                                                                                                | Deferral remains sound only while those gates block their named later stage/release. Historical evidence must not substitute for the exact scope.                                   |

## Cross-cluster conclusions

1. **Traceability is a map, not isolation evidence.** Its 27/28 count is accurate about the existence/currentness of claimed commands, but ST-03, ST-05, ST-06 and ST-07 show commands whose models cannot express the required state. ST-02 shows a command that executes the unsafe state as the expected result.
2. **The most important broken joints are cross-model.** `GenerationApply` and `writeAdmission` each pass sequentially but fail when one writer crosses the marker. `TerminalHandoff` and hosted retention each pass locally but state opposite lost-acknowledgement behavior. The Local opener and manifest checks are separate positives that do not authenticate one package.
3. **No simpler wholesale replacement is justified.** The repairs already contain useful local theorems: certified recipients, exact retry bytes, local checkpoint re-derivation, factor-derived openers, signed currentness receipts, one retention clock, and per-class ledgers. Reopen the earliest missing interface/authority rather than replacing those constructions or adding a negative that reaches an existing guard.

## Blockers, later gates, and historical-only items

**Stage 0 blockers:** ST-01 through ST-07 above. `S0-10` must not record corrected Stage 0 closure until these are resolved and independently rerun.

**Later gates, not present blockers:** product-shaped journal append sampling on declared devices; legacy plaintext cutover/restart/deletion; exact selected RustCrypto/toolchain review; mandatory source/blob freshness; integrated runtime/deployment checks including the dated X25519 support table. Their honest later status is preserved.

**Historical-only, not reopened:** `f-138a5f8-libsodium-readiness-timing`, `f-6b021c4-wasm-size-proxy-unreproducible`, `f-caee157-plaintext-baseline-points-to-parent`, and `f-dbfd01f-row20-closes-unvectorized-hpke`. They remain provenance corrections with no Stage 0 repair dependency.

## Final recommendation

Return to `S0-6` for the Local package root, `S0-7` for the retirement ceiling and reseed branches, the `S0-2`/`S0-3` interface for writer fencing, `P-3`/`S0-3` for crash-total refusal, `S0-4` for abandoned reservation recovery, and `S0-5` for eligibility plus install/fallback. Regenerate only after those state/authority decisions are corrected; patching the present vectors without changing the underlying models would repeat the closure error S0-9 exists to catch.
