---
schema: 1
kind: work-item
id: X-02
status: complete
owner: /root
started: 2026-08-21
updated: 2026-08-21
blocked_on: none
---

# `X-02` — crash and persistence

## Scope and exclusions

Independently reconstruct the pinned end state's startup and write ordering for local generation-key envelopes,
content records, the synchronous crash journal, accepted-head persistence where it shares the store, and trimming.
Challenge every durable boundary with process kills, nonce reuse and budget exhaustion, sequence reset/concurrency,
duplicate replay, stale plaintext stores, partial device-lock enrollment, generation changes, and synchronous-seal
unavailability.

Accepted-state, lifecycle, continuity, and broad platform/evidence questions belong to X-03 through X-06 except
where a joint invariant directly determines local crash safety. Production requirements, selections, generators,
vectors, tests, and application code remain read-only. The pinned tip is a specification/evidence snapshot: its app
still uses the predecessor plaintext store, so no selected encrypted-store behavior is credited as integrated.

## Exact sources inspected

- Original objects: `c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §§7.1–7.2, 7.10 and
  `c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §§6.1, 10.4–10.5, 10.10, 11.1, 13.2–13.3,
  13.7, 14.6, and 15; original claims `OC-023`–`OC-026`, `OC-029`, `OC-039`, and `OC-063`–`OC-065`.
- Pinned end state: `9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/PRD.md` §§7.1–7.2, 7.10 and
  `9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/TRD.md` §§6.1, 10.4–10.5, 10.10–10.11, 11.1,
  13.2–13.3, 13.7, 14.6, and 15; end-state claims `E-02`, `E-03`, `E-08`, and `E-20`.
- Exact tip selection records for rows 1–3, 6, 13, and 15; the journal, record, device-lock, anti-replay, and
  transition generators/vectors; `wasm/journal-seal/{src/lib.rs,seal.generated.ts}` and its exact checker.
- The predecessor write path and tests at both endpoints: `src/crdt/persistence.ts`, `src/crdt/index.ts`, and
  `test/store.test.ts`. The base-to-tip change is terminology-only on the relevant failure semantics: synchronous
  journal failure is reported while the mutation is still permitted to reach IndexedDB.
- Exact diffs/cards for `9860a0b`, `3bea0e6`, `f5def83`, `dbfd01f`, `66a7c6a`, `9b49b74`, and `4259822`; all
  completed foundation/batch analyses and the existing findings that touch this seam.
- Primary external sources, retrieved 2026-08-21: NIST SP 800-38D §8.3
  (`https://csrc.nist.gov/pubs/sp/800/38/d/final`) and `draft-irtf-cfrg-xchacha-03` §2.1 and Appendix A.3.1
  (`https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha-03`).
- Exact `9edd930` archive `/tmp/lineage-x01.sEWgob`: record and device-lock generator `--check` passed; the
  committed WASM seal passed its external KAT, four composition vectors, and both length boundaries. The archive's
  journal generator could not load its uninstalled `@noble/ciphers` dependency; no current-checkout dependency or
  vector was substituted as exact evidence.

## Method

Build the durable-object inventory, then derive startup, local-write, replay, trim, accepted-head, custody, and
generation-switch machines without assuming the future adapter. For each machine, stop before and after every
durable action and ask which copy is authoritative on restart. Challenge the resulting invariants with two tabs,
failed storage calls, abandoned encryption attempts, old/new generations, unknown carrier versions, and legacy
plaintext. Only then compare the exact selections, vectors, WASM artifact, and predecessor behavior.

| Relevant claims/rows/commits | Reconstructed invariant | Actors and durable state | Scenario or counterexample | Evidence | Conclusion |
| --- | --- | --- | --- | --- | --- |
| `OC-024`, `E-02`; row 3; `3bea0e6`, `dbfd01f` | Key store precedes journal; journal precedes records; complete local load precedes transport | Slot/workspace opener; custody record, generation envelopes, encrypted journal and records | Kill at each open/replay/load step; offer an old-generation journal entry and an unknown carrier | Exact TRD §6.1, row-2/3 framing and predecessor open path | `qualified` — dependency order is coherent, but multi-generation lookup and corrupt-entry blocking need integrated policy. Strongest challenge: old-gen replay with only current `K_g`; existing vector does not test it. |
| `OC-025`; row 2; `9860a0b`, `9b49b74` | Each accepted update has an immutable authenticated synchronous journal copy before handler return; record commit precedes its removal | Page, `localStorage`, pending batch, IndexedDB | Kill after mutation, seal, `setItem`, encryption, transaction complete, and each clear; refuse a 65,537-byte update | Exact row-2 selection, WASM checker, predecessor failure test | `reopen` — ordinary commit/clear ordering is sound, but oversize and storage/seal failure have no state that preserves the unconditional contract. Strongest challenge: the exact selected seal intentionally throws above 64 KiB. |
| `OC-024`, `OC-065`; row 3, later row 6; `3bea0e6` | One authenticated monotonic sequence orders trim and spans content/heads while bounding AES-GCM invocations per generation | Two tabs, content and heads stores, active generation | Concurrently allocate `max+1`; kill after reserve/encrypt; rotate at the `2^32` boundary | Row-3 selection, tip TRD §6.1, NIST SP 800-38D §8.3 | `reopen` — the bytes are well bound, but no durable allocator/generation watermark makes the sequence claims jointly executable. Strongest challenge: two tabs need `seq` before async encryption. |
| `OC-024`; row 3; `3bea0e6` | Commit a covering current-generation state record, then delete only covered content in a second transaction; never sweep heads | Trimmer, concurrent writer; update/state/heads records and generation envelopes | Kill before/after state commit and during delete; race a new update at the watermark | Exact TRD §6.1 and row-3 AAD/trim rules | `affirmed` abstractly, `qualified` under concurrency — every single-trimmer kill leaves old coverage or duplicate coverage. Strongest challenge: a second tab's update at the snapshot boundary requires the missing allocator/coverage protocol. |
| `OC-026`, `E-03`; row 13; `f5def83`, `dbfd01f` | Stage factors/envelopes while `L_local` remains; atomically swap/delete/lock; persist owed forward rotation | Device owner; custody record, seals, staged/live envelopes, local opener | Kill at every enrollment step and during post-lock rotation | Exact row-13 transition table and device-lock vectors | `qualified` — no local crash state loses all openers; post-swap state is recoverable but weaker until rotation settles. Strongest challenge: service loss after the custody transaction; existing pending-rotation finding survives. |
| `OC-023`; rows 1–3; `9860a0b`, `3bea0e6`, `dbfd01f` | Unsupported old carriers are never interpreted as current content, and migration completes with no plaintext carrier left | Development installation, cutover client; `1:` journal, `done` DB, new encrypted store | Kill before/after verified import, active-store selection, and deletion of each legacy carrier | Row-2/3 Stage-1 obligations and TRD §14.6 | `reopen` — refusing plaintext is correct, but preserve/report conflicts with whole-profile ciphertext until an unselected repair transition runs. Strongest challenge: an update exists only in `1:` at cutover. |

## Analysis

### Durable objects and authority

The end state has four local durability domains and one intentionally transient layer:

| Domain | Durable objects | Authority after restart |
| --- | --- | --- |
| Key store | Custody record; `L_local` handle or factor seals for `L_lock`; live/staged `KeyEnvelope`s; pending transition material | Determines whether and how each retained generation can open. Presence alone must not infer custody state. |
| Synchronous journal | One immutable `2:` entry per page/store/update, with clear authenticated `gen` and storage key | Authoritative for an update until a covering content record transaction completes. It is not cleared merely because replay succeeded. |
| Content database | Independently decryptable `update`/`state` records; separate `heads` object store; shared clear authenticated `seq` | State plus unsuperseded updates materialize local content; heads is only the anti-replay mark, never Yjs content. |
| Legacy carriers | Predecessor `1:` plaintext journal and plaintext `done` database | Cutover input/repair state only. The encrypted runtime must not interpret either as a supported encrypted carrier. |
| Live slot memory | Brief `K_g`, derived `K_store`/`K_journal`, Yjs document, pending batch, synchronous WASM instance | Never the only intended crash copy after a write handler returns. Cleared at lock/sign-out; loss is expected on page kill. |

This inventory exposes two distinct meanings of “generation.” A journal entry's clear `gen` chooses the `K_g` from
which replay derives `K_journal`; a later content record may be encrypted under the generation active when its batch
is materialized. The requirements forbid target-generation content before a verified transition and previous-
generation content after local application of it, so a generation switch must either flush/quiesce the old batch or
re-encrypt its still-journalled deltas under the new current store key. The exact choice is not selected and is
routed to X-03 with the accepted-state transition boundary; it does not invalidate the journal because its own old-
generation key remains retained until the delta is covered.

### Reconstructed startup machine

| State | Required action | Failure / kill result |
| --- | --- | --- |
| `module-unavailable` → `module-ready` | Instantiate the selected inlined WASM synchronously when its module evaluates | If integrated as selected, compile/instantiate failure prevents app evaluation and therefore accepts no edit. There is no async “editing before seal” window. Integration is absent at the pinned tip. |
| `slot-selected` | Enumerate only the chosen slot/workspace through the local slot index | Failure leaves every workspace closed; database-name enumeration is forbidden. |
| `key-store-open` | Read explicit custody state and the clear generation inventory needed by journal/content/current lineage | Missing/unknown custody or carrier version must be retained, refused, and reported rather than guessed. The current documents do not choose whether one corrupt entry blocks the whole workspace or permits a visibly partial open. |
| `opener-ready` | `promptless`/recoverable `enrolling`: use `L_local`; `locked`: open one factor seal to recover `L_lock` | Wrong/lost factor leaves the locked workspace closed. `enrolling` remains rollbackable because `L_local` and live envelopes still exist. |
| `generation-keys-open` | Authenticate each needed `KeyEnvelope`, recover its `K_g`, derive role subkeys | An old-generation journal/record cannot be opened with the current key. Existing `f-9860a0b-journal-rotated-vector-reuses-key` survives because the published rotated fixture reuses one `K_g` and cannot catch this lookup defect. |
| `journal-replayed` | Authenticate each journal entry with the subkey selected by its own generation and apply its idempotent Yjs delta | Kill leaves the entry intact, so next open repeats safely. Authentication/version failure leaves it intact and reported. |
| `content-loaded` | Authenticate and apply state/update records in any order; never send `heads` through the Yjs load path | Duplicate journal/content coverage converges. A failure before this state must not create transport against a near-empty document. |
| `transport-eligible` | Only after all required local state is loaded may sync be constructed | The predecessor already enforces load-before-connect. The new extra prefix—keys then journal—is specified but not integrated. |

“Unseal `K_g`” in the displayed TRD startup arrow must be read as the set of locally required generations, not
only the current epoch. Row 2 makes that unavoidable by putting `gen` in every journal entry specifically to select
the input key. The old generation can be dropped only after its data is covered under the successor; any remaining
unreadable journal garbage then needs explicit repair rather than silent deletion.

### Local write, batch, and replay kill matrix

The ordinary successful path is:

```
Yjs delta → choose current gen and immutable journal key → random nonce → synchronous seal
  → synchronous localStorage setItem → queue delta → reserve/assign store seq → async AES-GCM record(s)
  → one IndexedDB transaction complete → compare-and-remove the corresponding journal entries
```

The future sequence reservation is shown where it must logically exist; it is not a selected artifact.

| Kill / failure point | Surviving copy | Restart result | Assessment |
| --- | --- | --- | --- |
| Before the Yjs mutation | Prior state only | Nothing to recover | Safe null. |
| After mutation/update emission but before successful journal `setItem` | Live memory only | Update can be lost | Forbidden by the contract, but reachable on seal/size/quota/storage failure unless the operation is refused before mutation. The predecessor reports and continues. |
| After journal `setItem`, before queueing or async work | Journal | Authenticate/replay and requeue | Safe. |
| After a durable sequence reservation, before encryption | Journal plus reserved gap | Replay uses a later sequence; never reuse the gap | Safe only under the missing reservation protocol. Over-counting is conservative. |
| After AES-GCM invocation, before record transaction | Journal; possibly reserved sequence | Replay and encrypt again | Content survives. NIST invocation accounting is safe only if the abandoned attempt was durably counted. |
| During the batched record transaction | Journal; IndexedDB transaction aborts atomically | Replay/retry all affected entries | Safe. |
| After transaction `complete`, before any clear | Content records and all journal duplicates | Replay is idempotent; re-persisting duplicates is harmless | Safe. |
| During per-entry clear | Content records and a suffix/subset of journal duplicates | Remaining entries replay; removed ones already have committed records | Safe. |
| After all compare-and-removes | Content records | Normal load | Safe for the stated page-kill boundary. |

The compare-before-remove inherited from the predecessor is a useful extra: cleanup cannot delete a value that was
replaced under the same key. The selected design is even safer when storage keys are immutable and per-page.
`whenDurable()` must force every delta observed before the call through record-transaction completion; it need not
wait for best-effort duplicate cleanup because committed records already cover the journal.

The phrase “journal or batch failures remain observable and leave recoverable entries intact” is true for batch and
cleanup failures, but not for the first failed journal write: there is no entry to leave intact. A preflight that
observes `localStorage` and an already-instantiated WASM module narrows the problem but does not eliminate a
per-write quota exception, a WASM trap, bad fixed-width inputs, or the explicit 64 KiB guard. The contract therefore
needs a pre-mutation gate or a product state that truthfully treats the mutation as not crash-safe and prevents page
termination until another durable copy exists. Reporting alone is not the guarantee.

### Sequence allocation, nonce accounting, and exhaustion

The two nonce disciplines answer different crash problems:

- **Journal: affirmed.** `K_journal` is generation-specific and XChaCha uses 24 fresh random bytes. No counter or
  session registry can roll back. The IETF draft's stated 192-bit random-nonce bound supports the selected stateless
  shape. Fixed vector nonces are test inputs, not production policy.
- **Store records: construction reopened.** AES-GCM uses 12 fresh random bytes. NIST's relevant limit counts
  authenticated-encryption *invocations under a key*, not only records surviving IndexedDB commit. A `seq` recovered
  from committed records undercounts encryptions abandoned after WebCrypto returns unless it is reserved durably
  first.
- **Per-generation versus global order: construction reopened.** Tip TRD requires one monotonic store sequence
  across content and heads, while the budget resets with fresh `K_store` at a new `K_g`. The row-3 phrase “rotate
  before the next `seq` crosses `2^32`” cannot literally use the global absolute value after the first threshold;
  the fresh generation needs a generation-start watermark or a separate invocation count while global trim order
  continues upward.
- **Multi-tab allocation: construction reopened.** Random nonces avoid deterministic nonce collision, but do not
  allocate the authenticated `seq`. Because `seq` is needed before async encryption, an auto-increment key returned
  by the eventual `add()` is too late. A small reservation transaction or durable range allocator is viable and is
  the missing selected step.

Existing `f-dbfd01f-record-nonce-ceiling-omitted` remains distinct: it records that the normative fold lost the
numeric enforcement branch. New `f-3bea0e6-store-sequence-allocation-undefined` challenges the deeper premise that
the selected global sequence, without an allocator and generation metadata, can enforce that branch at all.

Local `KeyEnvelope`s also use random 96-bit AES-GCM nonces under `L_local`/`L_lock`. Their practical call count is
one seal per retained generation/reseal and is vastly smaller than content writes, but the selection supplies no
lifetime invocation counter or rekey rule for a custody key. This remains a remote unresolved boundary rather than a
separate candidate: the content-key generation sequence would have to approach the same enormous count first, and
ordinary lock enrollment replaces the opener.

### Trim and accepted-head persistence

A correct trim needs a state snapshot and a deletion watermark, even though the record carrier does not name the
watermark separately:

1. Materialize a Yjs state covering all content records through a known store sequence `h`.
2. Reserve a later sequence, seal `kind: state` under the current `K_store`, and commit it.
3. In a second transaction, delete only content records the state demonstrably covers; do not touch a `heads`
   record or a concurrent record beyond `h`.
4. Only after current-generation coverage and the other row-15 retention conditions may an older local generation
   envelope be discarded.

| Kill point | Result |
| --- | --- |
| Before state transaction completes | Old records remain the only authority. No deletion is licensed. |
| After state commit, before delete begins | Old records plus covering state are duplicate coverage; order-independent Yjs application is safe. |
| During delete transaction | IndexedDB commits or aborts the deletion atomically; either state alone or state plus duplicates remains. |
| After delete | The state record covers deleted content; later records beyond the watermark remain. |

This ordering is affirmative for a single coherent trimmer. The strongest challenge is concurrency, not a kill:
another tab can commit an update after the snapshot but at a colliding or misordered sequence. Unique durable
allocation plus an explicit coverage watermark/trim lease is needed so no trimmer deletes bytes absent from its
snapshot. The same missing allocator affects the `heads` store.

The later content-before-heads ordering is independently sound. If content commits and the process dies before the
accepted `(seq, link)` mark, the server can redeliver the already admitted envelope and Yjs applies it idempotently.
Writing the head first is the forbidden direction: the operation then appears below the local baseline forever.
Heads in a separate object store prevents the content load path from trying to apply them as Yjs updates, and AAD
binding of `kind` prevents reinterpretation as a trim-authorizing state record.

### Device-lock partial enrollment and generation rotation

| Durable state | On-disk opener/coverage | Kill behavior |
| --- | --- | --- |
| `promptless` | `L_local`; live envelopes under it; no seals | Enrollment has not begun; normal startup. |
| `enrolling`, factors sealed | `L_local` and live envelopes still authoritative; `L_lock` recoverable from staged seals | Roll back by deleting seals, or continue. No key is lost if the newly shown code was not recorded. |
| `enrolling`, some/all envelopes staged | Both live and staged envelope sets exist; old set still opens | Roll back or continue. Partial staging is not a brick state. |
| Atomic transaction committed: `locked`, `rotation_owed` | Live envelopes now under `L_lock`; `L_local` gone; factor seals remain | Restart requires factor and can read history. The slot is recoverable but a pre-enrollment copy still reads future old-generation writes until rotation settles. |
| `locked`, rotation settled | New writes use successor generation; old envelopes retained until trim/checkpoint rules permit disposal | Local enrollment transaction is complete; X-01's promptless operational reader-key bypass remains a separate custody concern. |

The single IndexedDB transaction for swap/delete/state is the load-bearing step and survives every local process
kill. “Securely delete old first” is correctly rejected because it creates the only state with neither opener. The
post-transaction rotation is intentionally not atomic with local custody. Persistent `rotation_owed` makes that
weaker intermediate state detectable and retryable; existing `f-dbfd01f-device-lock-rotation-caveat-lost` survives
because normative copy says “from now on” without waiting for that state to clear.

On an Account workspace the row-15 pending transition must survive before network submission. Its exact retry bytes
carry the wraps needed to recover the target key after a crash; before locally applying a winning outcome, the
client also needs a durable successor `KeyEnvelope`. The selections constrain the endpoints but do not spell out
whether the envelope is staged with the pending payload or recovered from the device's own reader wrap and sealed
during `applying`. X-03 should make that local transition explicit and decide how an already-journalled old-
generation batch is flushed or re-encrypted at the switch.

### Synchronous-seal availability and bounded input

Three availability cases must not be conflated:

| Case | Pinned evidence | Conclusion |
| --- | --- | --- |
| WASM cannot compile/instantiate | Wrapper instantiates synchronously at module evaluation and has no fallback | Fail-closed before edits if Stage 1 integrates it on the startup path. `affirmed` as selected shape, unintegrated at tip. |
| Wrong key/nonce width | Wrapper checks only AAD/plaintext maxima and can retain fixed-buffer bytes | Existing `f-9b49b74-wasm-glue-key-nonce-lengths` survives; a demonstrated repeated ciphertext/tag makes this more than defensive validation. |
| Plaintext above 65,536 bytes | Exact wrapper throws and exact checker asserts the refusal | New `f-9b49b74-journal-seal-64k-gap`: no chunk/refusal/pre-mutation state preserves the every-update WAL contract. |
| `localStorage` absent/quota/error | Predecessor reports and still permits asynchronous persistence; selected docs say observable | General fail-closed behavior remains unresolved. A later IDB commit can save the update, but a page kill before it does not. |

The 64 KiB limit is not a performance extrapolation: it is an exact carrier boundary. The measured 18-byte/419-byte/
4 kB cases establish useful bounded latency, while existing `f-66a7c6a-journal-benchmark-overwrites-one-slot`
qualifies how faithfully the storage workload matches immutable appends. Device-population and benchmark questions
remain X-06; the missing oversize state is X-02 because it changes whether a write is durable at all.

### Stale plaintext and cutover

The clean-cutover strategy is defensible only if “clean” is a durable state, not a verbal precondition:

| Legacy object | Selected read behavior | Required terminal behavior | Missing kill boundary |
| --- | --- | --- | --- |
| `1:` plaintext journal entry | Refuse and report; never replay through the encrypted runtime | Explicitly remove after its data-loss/cutover decision | Entry may hold the only last-250-ms update; preserve leaves forbidden plaintext, early delete loses it. |
| Plaintext `done` IndexedDB | Do not ship an in-place plaintext reader | Delete rather than orphan after clean export/import | Kill between verified encrypted import/active-store selection and old-DB deletion needs resumable state. |

TRD §14.6 correctly sketches the safe *in-place conversion* order—write/verify encrypted, atomically select it,
then delete plaintext—but deliberately avoids building it by choosing export/import before external users. That
does not by itself order deletion of the two known predecessor carriers. A fresh origin can avoid the problem, and
the one known installation is unsupported development state; those facts lower severity. They do not satisfy the
required stale-profile test or whole-profile plaintext scan if the known old origin opens the encrypted build.

New `f-9860a0b-legacy-plaintext-repair-undefined` therefore asks for one explicit repair/cutover state machine,
not a plaintext migration reader. A safe answer may be deliberate deletion after a separately verified export,
provided kills always resume to either the pre-cutover state or one selected encrypted state and import is not
silently repeated.

## Affirmative conclusions

- The central write-ahead ordering is correct: synchronous immutable journal first, IndexedDB transaction
  `complete` second, matching journal removal last. Every kill after a successful `setItem` leaves journal coverage,
  committed record coverage, or both.
- Replaying before content load is safe because Yjs updates are idempotent and order-independent; a duplicate left
  after transaction completion cannot erase state. Compare-and-remove cleanup further avoids deleting a replaced
  value.
- The selected XChaCha random-nonce discipline removes durable counter state from the crash path. A clear
  authenticated generation is necessary for replay key lookup and is not redundant with the generation-specific
  input key.
- State-before-delete trim ordering is sound. A kill between its two transactions leaves duplicate coverage, while
  the reverse order would be loss. Separating `heads` prevents the trim/content loader from confusing protocol marks
  with Yjs updates.
- Content-before-head persistence is the correct anti-replay direction: a crash causes safe redelivery rather than
  an applied operation falling permanently below the mark.
- The device-lock local migration never removes the last opener. Staging under `L_lock` while `L_local` survives and
  atomically swapping/deleting/locking is a genuine crash-safe transaction; `rotation_owed` honestly represents the
  weaker post-swap state.
- Load-before-connect survives the new crypto dependency: key store and journal are added before the already-correct
  requirement that the entire local document load before transport. Synchronous module instantiation, if integrated
  as selected, fails before editing rather than creating a seal-readiness race.
- Refusing unknown/authentication-failing carriers intact is preferable to silent deletion. The repair path is the
  unresolved part, not the refusal rule itself.

## Candidate or validated findings

- New, medium/high: [`f-3bea0e6-store-sequence-allocation-undefined`](../../findings/f-3bea0e6-store-sequence-allocation-undefined.md).
  The authenticated global sequence has no durable allocator across tabs/content/heads or metadata that turns it
  into a per-generation invocation budget.
- New, medium/high: [`f-9b49b74-journal-seal-64k-gap`](../../findings/f-9b49b74-journal-seal-64k-gap.md).
  The exact selected seal refuses 65,537-byte updates but no pre-mutation refusal, chunking, or alternate durable
  write state preserves journal-before-return.
- New, low/high: [`f-9860a0b-legacy-plaintext-repair-undefined`](../../findings/f-9860a0b-legacy-plaintext-repair-undefined.md).
  The encrypted reader preserves/reports forbidden legacy plaintext, while the clean-cutover deletion and restart
  ordering is not selected.
- Existing candidates that survive direct X-02 challenge:
  [`f-9860a0b-journal-rotated-vector-reuses-key`](../../findings/f-9860a0b-journal-rotated-vector-reuses-key.md),
  [`f-dbfd01f-record-nonce-ceiling-omitted`](../../findings/f-dbfd01f-record-nonce-ceiling-omitted.md),
  [`f-dbfd01f-device-lock-rotation-caveat-lost`](../../findings/f-dbfd01f-device-lock-rotation-caveat-lost.md), and
  [`f-9b49b74-wasm-glue-key-nonce-lengths`](../../findings/f-9b49b74-wasm-glue-key-nonce-lengths.md).
- Evidence candidates delegated rather than duplicated:
  `f-66a7c6a-journal-benchmark-overwrites-one-slot`, `f-9b49b74-rustcrypto-audit-version-gap`, and
  `f-caee157-plaintext-baseline-points-to-parent` remain relevant to X-06's assurance/provenance conclusion, not to
  the abstract crash ordering.

## Disconfirmed hypotheses and null results

- **A crash after content commit but before journal clear loses or double-applies an edit:** disconfirmed. The record
  is durable and Yjs duplicate application is idempotent; partial cleanup only determines how much duplicate work is
  replayed.
- **Journal replay must wait until after content records:** disconfirmed. Either order converges, and replay-first is
  required so the journal closes the predecessor's pre-IDB window. The load-before-transport boundary is what must
  wait for both.
- **Trim needs a single atomic state-plus-delete transaction:** disconfirmed. Two transactions in the stated order
  deliberately make the crash state duplicate coverage; atomicity is required within each transaction, not across
  them.
- **A counter nonce can be recovered from store sequence after a page kill:** disconfirmed for the journal. Its
  synchronous path has no durable counter reservation; a random 192-bit nonce is the simpler correct answer.
- **The WASM choice creates an asynchronous startup interval with no seal:** disconfirmed by the exact wrapper. It
  compiles and instantiates synchronously during evaluation. Platform failure becomes startup failure, not a late
  promise rejection.
- **Device-lock enrollment must delete `L_local` before staging to avoid stale custody:** disconfirmed. That order is
  the one that can brick the only copy. The atomic swap/delete transaction plus forward rotation separates local
  opener safety from stale-profile confidentiality.
- **Rotation requires re-encrypting all historical records:** disconfirmed. Old generations remain until a current-
  generation state record covers local content; trim, not history rewrite at transition time, discharges them.
- **An IndexedDB `complete` event plus relaxed durability claims power-loss persistence:** not credited. The named
  contract closes browser page/navigation termination; no stronger OS power-loss guarantee was inferred.
- **The predecessor proves the encrypted design:** disconfirmed. Its page-kill/batch/compare-remove behavior is
  useful inherited evidence, but it intentionally writes plaintext and explicitly permits asynchronous recovery
  after a failed synchronous journal write.

## Unresolved questions

- Which durable sequence reservation/range protocol spans two tabs and both object stores, and what generation-start
  metadata counts every AES-GCM attempt without resetting global trim order?
- Does any authentication/version failure block the whole workspace, permit an explicitly partial local open, or
  open read-only pending repair? Silent deletion and silent partial success are both excluded, but the product state
  is not selected.
- At a verified generation transition, are already-journalled old-generation deltas flushed before local outcome
  application or re-encrypted into new-generation records? When is the successor `KeyEnvelope` durably installed?
- What synchronous state handles `localStorage.setItem` quota/unavailability or a WASM trap after a Yjs transaction
  emits its update? Reporting plus eventual IndexedDB is not page-kill safety.
- How does the trim obtain/prove a coverage watermark and mutual exclusion or cross-tab visibility so a concurrent
  writer cannot be swept?
- When current-generation state covers an old-generation journal delta but cleanup failed, does trim explicitly
  remove that now-redundant journal entry before dropping the old envelope, or retain/report unreadable garbage?
- What is the final clean-cutover marker ordering among verified export, encrypted import, active-store selection,
  `1:` journal deletion, and old database deletion?
- Does the local custody key need an explicit AES-GCM invocation/rekey lifetime bound for generation-envelope
  reseals, or is the reachable generation count accepted as the documented practical bound?

## Completion criteria

- [x] Exact startup, write, replay, trim, heads, and key-envelope ordering is reconstructed from pinned objects.
- [x] Kills between every durable action, nonce and sequence exhaustion/reset, replay, stale data, partial
  enrollment, generation switching, and synchronous-seal failure are explicitly challenged.
- [x] Every trace-table conclusion is classified `affirmed`, `qualified`, `reopen`, or `unresolved` and names its
  strongest disconfirmation attempt.
- [x] Three new findings, four surviving findings, affirmative conclusions, and disconfirmed hypotheses are
  persisted without changing production artifacts.
- [x] Session, status ledger, and final validator handoff are complete.

## Handoff

Analysis, status checkpoint, and session handoff are complete. Run `node scripts/review-status.mjs`, then claim
`X-03` by creating `docs/review/analysis/seams/X-03-accepted-state.md` and a fresh session. Carry the local
generation-switch/batch and successor-key-envelope questions into accepted-state reconstruction. X-04 through X-06
remain independently ready; there is no blocker.
