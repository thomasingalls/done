# Remediation options

## Reading rule

Each branch is a target construction, not implementation authorization. “Preserves” names challenged component
conclusions that remain usable. “Invalidates” identifies artifacts that must be reopened if that branch is selected;
none is modified by this package. A recommendation is made only where the completed evidence distinguishes the
branches. Otherwise the section ends in a bounded product/architecture decision packet.
Row, generator, and vector references expand to the exact pinned-tip paths in the
[`action-tree.md` artifact key](./action-tree.md#exact-artifact-key).

## `RC-1` — client-authenticated recipient authority

### Branch A — transferable enrollment certificate

- **Corrected invariant:** a future rotator wraps only to a recipient whose successful human-mediated installation
  is represented by a client-authenticated certificate; authentic recovery material is part of the same result.
- **Durable state:** `ReaderEligibility(workspace, lineage, epoch/head, credential, W_pub, R_pub_digest,
  recovery_envelope_digest, transcript_hash, installer, installed_by, status)`. The existing delivering credential
  signs; the new credential countersigns successful install. A later accepted envelope/head anchors the certificate
  in shared history. `spent`, `revoked`, and superseding states are append-only. A distinct
  `RecoveryBootstrap(current_head, recovered_generation/root, prior_recovery_set_digest, new_credential,
  new_recovery_state, conflict_parent, recovering_signature)` licenses the no-surviving-device case. The prior
  `RecoverySet` commits a recovery-bootstrap verification key whose signer is sealed beside `R_priv` under the same
  content factor; this adds no fifth independently held recovery object.
- **Actors:** an existing eligible client creates/signs ordinary enrollment; a new device authenticates and
  countersigns install. When no eligible device survives, possession of the factor-opened, previously
  client-authenticated recovery state and recovered content root authenticates `RecoveryBootstrap`; the
  recovery-bootstrap signer authenticates the transition; the authorization service only checks the current head
  and serializes conflicting parents. Any client reads/verifies;
  the service cannot create or silently replace eligibility. Deletion waits for all dependent history/packages.
- **Crash/retry/concurrency:** admission, SAS completion, wrap install, counter-signature, and shared acceptance are
  distinct durable states. Replays are idempotent by transcript/certificate id. Rotation may exclude a pending or
  spent enrollment and must reject two certificates for one credential/key unless one is a signed successor.
  Recovery bootstrap binds the exact nonce-confirmed current head, complete new credential/recovery state, and one
  conflict parent; a stale first contact retains the hostile-service freshness bound and cannot silently win.
- **Tradeoffs/new failures:** adds a client-authenticated ledger and privacy-visible recipient metadata; a lost final
  acknowledgement can leave an installed device pending until it replays the same certificate. The installer key's
  authorization at the bound epoch becomes load-bearing.
- **Preserves:** typed committed-nonce SAS, immediate `W_pub` authentication, current-head binding, service/content
  authority separation, opaque service storage, and existing HPKE carrier shape.
- **Invalidates:** row 11 selection/schema/vector; enrollment portions of rows 9/10/14/15; credential/epoch and
  service inventory requirements; malicious-authority and concurrent-enrollment vectors; future enrollment tests.
- **Closure falsifiers:** service-only admitted reader later rotation; `R_pub` substitution with genuine `W_pub`;
  installer revocation between SAS and acceptance; crash at every certificate state; future rotator that did not run
  the ceremony; duplicate/cross-lineage certificate replay; four-object recovery with no existing eligible client,
  followed by a future rotation to the recovered credential; stale/forked bootstrap head.

### Branch B — client-certified recipient set inside each authorization successor

- **Corrected invariant:** a service-signed epoch is usable for key distribution only when its recipient set is
  covered by a client signature/quorum over exact credential-to-`W_pub` bindings and the exact recovery recipient.
- **Durable state:** `CertifiedRecipientSet(parent_epoch, next_epoch, members[], recovery_state_digest,
  client_approvals[])`; an enrollment completion proposes the next set, and each rotation consumes the latest
  certified set rather than a service roster. The existing set also names a one-use recovery-bootstrap verification
  key whose signer is factor-sealed beside `R_priv`;
  its successor proof binds the nonce-confirmed current head, recovered content root, exact replacement credential
  and recovery state, and the parent set.
- **Actors:** eligible owner clients approve set changes; the service serializes epochs but cannot add a recipient
  without client approval. If none survives, proof of possession of the client-authenticated recovery capability and
  recovered content authority signs the recovery successor; the service checks/serializes but cannot synthesize it.
  New clients read and verify the chain; removal is a new successor, never mutation.
- **Crash/retry/concurrency:** conflicting set proposals serialize under the same parent; losers rebuild against the
  signed winner like row 15. An authorized-but-unkeyed credential remains outside the certified set. Key delivery
  and set activation must either commit together or retain a resumable pending certificate. Recovery bootstrap is
  one-use, exact-head-bound, and conflict-serialized; a stale hostile-service first contact remains detectable only
  within the already validated nonce/head observation boundary.
- **Tradeoffs/new failures:** couples authorization evolution to content-authority availability and may block
  enrollment/rotation when no approving client survives; quorum policy is a new product/security choice. It reduces
  a separate ledger but expands epoch payloads and fork handling.
- **Preserves:** current epoch/head and transition winner machinery, immediate SAS, client-generated generations,
  and the service's serialization role.
- **Invalidates:** epoch schema/signatures, rows 5/9/11/15, transition and enrollment vectors, device-list semantics,
  and hostile-service/fork tests.
- **Closure falsifiers:** unauthorized set insertion; stale-set replay; two parents with incomparable approvals;
  successful four-object last-device-loss bootstrap and subsequent rotation; recovery-created replacement-set
  conflict; service omitting a legitimate installed reader; service-only forged recovery successor.

### Decision packet

Evidence requires a durable, transferable, non-service-forgeable fact and authentic `R_pub`; it does not determine
whether that fact lives beside content/acceptance state or inside the authorization lineage, nor whether one owner
signature or a quorum is required. Both branches must include the exact recovery bootstrap above so they preserve
the validated four-object theorem rather than silently requiring a fifth surviving device. Choose A or B by deciding
metadata exposure and who may approve ordinary recipient-set changes. Stage 0 cannot close `RC-1` while this choice
is absent.

## `RC-2` — composed generation application and capability retirement

Both branches share a mandatory core:

- every transition intent commits the canonical complete payload, including exact recovery envelope/wrap bytes;
- exposed recovery replacement produces a fresh successor generation unless the product explicitly abandons the
  exposed-factor guarantee;
- a durable `GenerationApply` record orders verified outcome, successor opener, active marker, old work, checkpoint,
  trim, and cleanup;
- an object-reference ledger prevents deletion of an opener while any journal, outbound envelope, retained
  checkpoint/suffix, package, or pending transition needs it; and
- UI completion is derived from durable state (`rotation_owed`, `applying`, `settled`), not the request or factor
  swap alone.

### Branch A — rotate the operational wrapping credential with factor lock

- **Corrected invariant:** enabling device lock replaces both the promptless local opener and every promptless
  credential capable of receiving future generations; successor wraps name only the replacement credential.
- **Durable state:** staged `L_lock` seals/envelopes, staged operational signing/wrapping credentials as applicable,
  a certified recipient-set update, canonical transition payload, successor self-wrap, `GenerationApply`, and
  per-generation object references.
- **Actors:** the local user/factor creates the new credential; client authority from `RC-1` certifies it; service
  serializes replacement/rotation; local key store reads/deletes; remote store never learns factors/keys.
- **Crash/retry/concurrency:** old local and operational credentials remain valid until the replacement set and
  generation winner are durably known. After the winner, no new write uses `g`; old exact envelopes retry unchanged;
  unminted deltas are covered under `g+1`; cleanup is reference-counted. Competing winners rebuild.
- **Tradeoffs/new failures:** larger authorization event and temporary duplicate credentials; interruption can leave
  a visibly pending lock state. Credential replacement must not accidentally revoke signing/reader authority on
  other devices.
- **Preserves:** stage-then-atomic-swap opener safety, signed mine/other/silence, observation-relative revocation,
  no history erasure, existing generation/key-envelope carrier shapes, and checkpoint-before-disposal direction.
- **Invalidates:** rows 3/7/13/14/15; device-lock, recovery, transition, record/checkpoint vectors; credential and key
  inventories; UI copy; tests 5/6/11 and stale-profile/fallback scenarios.
- **Closure falsifiers:** kill at every `GenerationApply` step; old journal/unflushed batch/accepted-but-unmarked
  envelope; copied no-PRF credential after settled lock; old recovery material after replacement; newest checkpoint
  loss after two rotations; premature opener deletion.

### Branch B — retain the operational credential but factor-gate its future-generation unwrap path

- **Corrected invariant:** the device credential may remain stable, but every self-recipient generation wrap after
  lock is additionally sealed to `L_lock` (or an equivalent factor-derived capability) before that credential can
  recover `K_g`; a pre-lock copy therefore lacks one required opener.
- **Durable state:** stable operational key; factor-gated self-wrap envelope with lock-state/version binding; the
  same complete `GenerationApply` and reference ledger; canonical recovery replacement plus successor generation.
- **Actors:** eligible rotator creates an inner reader wrap and an outer lock-bound wrap; locked device factor opens
  the outer layer; service stores opaque bytes; other devices retain ordinary reader wraps.
- **Crash/retry/concurrency:** staged locked self-wrap must precede active `g+1`; rollback leaves `g` and old custody
  intact. Loss of the lock factor makes that device's future self-wrap unusable, which is already an accepted device-
  lock loss boundary. Rotation on another device must know this recipient's lock-wrapping public state.
- **Tradeoffs/new failures:** avoids credential churn but adds a new nested carrier and recipient-state propagation;
  inconsistent lock metadata can deny the device future generations. Same-origin code after factor entry remains in
  scope.
- **Preserves:** operational credential identity, current authorization shape, immediate SAS, local atomic custody
  swap, transition wire theorem, and no remote wipe/history-erasure claims.
- **Invalidates:** row 13/15 wrap formats and vectors, recipient-state schema, key inventory, generation deletion
  tests, and UI copy; fewer epoch/credential changes than Branch A.
- **Closure falsifiers:** old profile retrieves inner/outer wraps; substituted lock state; lock disable/re-enable;
  factor loss; another device rotates with stale lock metadata; crash before/after outer-wrap install.

### Decision packet

The evidence discriminates the mandatory core from the weak “narrow the copy” alternative: the original contract
explicitly promises factor-gated future custody and exposed-code replacement, so merely weakening copy would reopen
product requirements. It does not discriminate operational-key replacement (A) from factor-gated self-wraps (B).
Choose based on authorization churn versus new nested-carrier complexity.

## `RC-3` — total local-write admission and invocation accounting

### Branch A — bounded staged single-record WAL plus per-write sequence reservation

- **Corrected invariant:** an operation outside the supported synchronous WAL size/storage envelope is rejected
  before mutating authoritative Yjs state; an accepted operation's exact update is successfully sealed and written
  as the actual WAL before authoritative apply; every async AEAD attempt consumes one durable unique sequence first.
- **Durable state:** explicit maximum update size; one exact staged update and successfully written bounded
  single-record WAL; one short IndexedDB `SeqReservation(seq, generation, consumed=true)` per attempted record across
  content/heads; generation-start attempt count; trim coverage watermark/lease. A capacity estimate may improve UX
  but is never admission evidence.
- **Actors:** editor/system operation derives exact bytes in a staging document/operation; the local persistence
  authority seals and writes the actual WAL, then promotes the update to authoritative Yjs state. One IndexedDB
  allocator creates reservations; tabs never mint counters independently; trimmer checks the watermark.
- **Crash/retry/concurrency:** reservation precedes encryption; gaps never reuse and conservatively count. A failed
  seal or WAL write performs no authoritative mutation; a completed WAL licenses exactly one idempotent apply. Two
  tabs serialize reservations. Rotation starts a new invocation budget while global order continues. Trim excludes
  records/reservations after its snapshot watermark.
- **Tradeoffs/new failures:** simplest bounded machine and keeps one journal entry, but creates a product-visible
  operation-size/storage refusal and an IndexedDB transaction per record. Staging/live divergence and duplicate
  promotion become new failure modes; no storage preflight can substitute for the successful WAL write.
- **Preserves:** XChaCha random-nonce choice, journal→record→compare-remove, state-before-delete, AES-GCM record
  format/AAD, content-before-head, and current correct-width KATs.
- **Invalidates:** product no-size-cap assumptions, rows 2/3, normative `2^32` algorithm, journal/record/WASM vectors,
  store adapter, import/bulk behavior, and performance requirements.
- **Closure falsifiers:** 65,536/65,537 boundaries; quota/unavailable storage; staged/live divergence; kill after
  reservation, seal, WAL write, apply, and record commit; duplicate apply; two tabs; equality at `2^32`; trim race;
  wrong-width key/nonce; a bounded feasibility run separate from the later population performance gate.

### Branch B — staged operation plus segmented or larger synchronous WAL and range allocation

- **Corrected invariant:** every product-permitted update is first materialized in a staging document/operation,
  synchronously durably represented, and only then applied to authoritative state; no product size cap is inferred
  from the WASM buffer.
- **Durable state:** `WalGroup(id, gen, chunk_count, total_digest, chunks[], committed)` or a bounded larger single
  carrier; pre-reserved per-tab sequence ranges with durable high-water marks; a per-generation attempts-used value;
  trim lease/watermark.
- **Actors:** local operation stager derives exact update bytes before authoritative apply; synchronous WAL writer
  seals the complete group; allocator grants ranges atomically; each tab consumes without coordination inside its
  range; trimmer verifies coverage.
- **Crash/retry/concurrency:** no authoritative mutation until the complete WAL group is durable. Partially written
  groups are ignored/cleaned because they never licensed the mutation. Range gaps are never reused and count toward
  the active generation budget. Restart replays complete groups exactly once by id/digest.
- **Tradeoffs/new failures:** preserves arbitrary operations and lowers allocator contention, but staging a CRDT
  operation and atomic complete-group semantics are substantially more complex; range exhaustion/abandonment and
  localStorage multi-key partial writes require explicit cleanup. Large writes may breach latency unless the product
  shows a blocking progress state before authoritative apply.
- **Preserves:** all narrow cryptographic/persistence theorems plus the original absence of a 64-KiB authoring cap.
- **Invalidates:** row-2 journal framing, generator/vector/WASM buffer, local update integration, batching and replay,
  row-3 allocation assumptions, performance harness, and page-kill tests.
- **Closure falsifiers:** partial chunk/group kills; digest/order/count substitution; staging/live divergence;
  duplicate apply; abandoned ranges; concurrent trim; huge import/system operation; cold and burst performance.

### Decision packet

Existing evidence favors Branch B only if the product retains arbitrary/bulk updates: Branch A requires an explicit
product limit and changes the original no-ceiling behavior. It does not discriminate single-record enlargement from
segmented WAL, or one-by-one reservations from leased ranges. Stage 0 may run bounded feasibility work to reject an
impossible branch; product-shaped support-population performance remains the explicit later release gate.

## `RC-4` — exact-byte outbound acceptance machine

### Branch A — encrypted local spool plus signed refusal

- **Corrected invariant:** exact `E_n` is durably local before first send; silence resubmits identical bytes; only a
  signed final refusal that forever closes that exact envelope licenses one same-position successor attempt. A
  delayed refused envelope can never become accepted after its successor is licensed.
- **Durable state:** `OutboundEnvelope(credential,n,epoch,gen,digest,bytes,state)`, durable next-position reservation,
  accepted mark, `PositionDecision(workspace,credential,n,attempt_id,digest,state,parent_refusal_id,signature)`, and
  checkpoint retention floor. Attempt 0 is the original; one refusal may atomically create the sole attempt-1 slot.
- **Actors:** source client reserves/mints/persists/reads; the acceptance service atomically records one active
  attempt, permanently rejected digests, the optional single successor, and at most one accepted digest per position.
  It signs acceptance or final refusal from that same decision domain. Relay transports only; local cleanup waits
  for resolution and the checkpoint floor.
- **Crash/retry/concurrency:** kill before send leaves queued exact bytes; after send/lost reply retries same bytes;
  duplicate service request returns the same decision; forged/unsigned refusal is silence. Final refusal of attempt
  0 and creation of attempt 1 are one idempotent transition keyed by refusal id; delayed attempt 0 thereafter returns
  the same refusal. Attempt 1 binds its parent refusal and cannot fork or create attempt 2. One credential has one
  serial position owner; multiple tabs coordinate through the spool.
- **Tradeoffs/new failures:** adds local storage and a negative service receipt; withholding can still stall
  availability. Refusal-key compromise can induce re-mint, so its authority/scope must match acceptance state.
- **Preserves:** row-4 random-nonce/signature encoding, client-owned position, accepted-link theorem, one local mark,
  second-newest suffix retention, and transition exact-retry precedent.
- **Invalidates:** rows 1/4/5/6; suite registry; local record kinds/store; service acceptance schema; envelope,
  finalization, antireplay vectors; migration and retry tests.
- **Closure falsifiers:** lost first request; accepted/lost reply; forged refusal; genuine refusal; delayed original
  after successor licensing; two successor digests; successor without/bad parent refusal; cross-field refusal replay;
  concurrent tabs; old provider unavailable; checkpoint cleanup boundary; service accepting a second digest.

### Branch B — reconstructible deterministic envelope carrier

- **Corrected invariant:** the durable source batch plus credential position deterministically reconstructs the one
  permissible envelope; authenticated service state still decides acceptance/refusal.
- **Durable state:** canonical outbound batch, credential position lease, deterministic per-credential encryption
  key/nonce derivation or a misuse-resistant carrier, deterministic signature input, and authenticated service
  `PositionDecision` with the same final-refusal/sole-attempt-1 rule as Branch A. A small state record replaces full
  exact-byte spooling.
- **Actors:** client persists canonical batch/position and reconstructs; service enforces one digest; relay transports;
  cleanup remains checkpoint-relative.
- **Crash/retry/concurrency:** reconstruction after any crash yields byte-identical `E_n`; batch canonicalization and
  position reservation precede first send. Final refusal permanently closes attempt 0; the one deterministic
  same-position replacement binds that refusal and cannot fork or produce attempt 2.
- **Tradeoffs/new failures:** reduces spool size but changes nonce/key discipline and makes canonical serialization
  and deterministic derivation load-bearing. Cross-credential position reuse must not reuse nonce/key; suite
  migration becomes larger. Signed refusal or an equivalent authenticated position decision is still required.
- **Preserves:** source signatures, actor sealing, accepted-chain arithmetic, and hostile-relay evidence rule.
- **Invalidates:** row-1 suite, row-4 carrier/vector, row-6 re-mint semantics, AAD inventories, KAT/composition tests,
  service idempotency, and migration suffix encoding.
- **Closure falsifiers:** same batch/position across restart and implementations; different credential same position;
  canonicalization ambiguity; nonce/key collision; refusal retry; suite migration; malicious source equivocation.

### Recommendation

Recommend Branch A. It directly follows the already validated row-15 persist-exact-bytes pattern and preserves the
selected row-4 cryptographic carrier. Branch B reopens primitive/carrier decisions without evidence of a spool-size
problem. The recommendation includes the final-refusal/sole-successor attempt machine above; it does not choose the
local database schema or refusal signing-key deployment.

## `RC-5` — semantic checkpoint and immutable history authority

Two independent choices are required. A checkpoint must retain either proof inputs or a named semantic authority
after pre-checkpoint envelopes are trimmed; an accepted head authenticates positions, not the snapshot's meaning.
Separately, “first creator” must be derivable from immutable state rather than a mutable-map convention. The choices
below may be combined only with an explicit interface between their order/identity domains.

### Checkpoint Branch A — retained replay witness plus client/quorum semantic admission

- **Corrected invariant:** an accepted checkpoint is not the producer's signed assertion. One or more independently
  authorized eligible clients replay the exact accepted inputs, derive the real snapshot, `{sv,ds}`, head baseline,
  and suffix, and authenticate one immutable admission before those inputs may be trimmed.
- **Durable state:** `SemanticAdmission(checkpoint_digest, accepted_heads, derivation_version, witness_digest,
  verifier_set/policy, decision_parent, signatures)` plus the real encrypted snapshot, derived coverage, suffix, and
  opener reference. Exact replay inputs remain retained until the selected verifier policy has signed; if the product
  requires any future client to recompute head equivalence rather than trust those signers, the replay witness or a
  separately reviewed succinct proof must remain portable with the checkpoint.
- **Actors:** producer proposes but cannot admit alone; eligible verifier clients replay and sign under the selected
  one-client/quorum policy; the service serializes incomparable admission parents and stores opaque records but
  cannot manufacture semantic approval; a fresh restorer verifies signer authority and locally re-derives snapshot
  coverage. Trimming/deletion consumes the admitted witness-retention predicate.
- **Crash/retry/concurrency:** proposal, witness replay, admission, install, and trim are distinct idempotent states.
  Incomparable accepted-head vectors remain separate until the selected admission rule serializes or retains them.
  Failed newest install activates neither content nor heads and falls back to the second newest.
- **Tradeoffs/new failures:** preserves the current carrier and avoids a service-visible content log, but client/quorum
  availability becomes load-bearing and a fresh restorer trusts the historical verifier for head equivalence unless
  proof inputs travel. Colluding producer/verifiers or a shared semantic bug remain new explicit threats.
- **Preserves:** full encrypted snapshot, two fallbacks, signed manifest-field bindings, `{sv,ds}`, current accepted-
  chain theorem, opaque service storage, and own-source migration.
- **Invalidates:** rows 5/7/10/15; checkpoint generator/vector; suffix/trim/package/migration formats; verifier,
  admission, retention, and fallback tests.
- **Closure falsifiers:** producer-only admission; trim before verifier policy; omitted insertion/deletion; head beyond
  replay; extra operation; incomparable candidates; verifier loss/collusion; fresh restore with and without portable
  witness; partial install; newest loss.

### Checkpoint Branch B — content-aware accepted-event log/root

- **Corrected invariant:** the checkpoint commits an authenticated ordered accepted-event domain; snapshot is a
  cache proven equivalent to replay through the committed root. The construction must expose enough authenticated
  post-decryption event identity/order to prove semantics—an opaque Merkle root alone is insufficient.
- **Durable state:** append-only accepted event log/root per authorization view; exact encrypted events or portable
  replay/proof witnesses; checkpoint event root and snapshot-equivalence proof; retained suffix and opener mapping.
- **Actors:** acceptance authority orders signed source events without claiming plaintext meaning; authorized clients
  decrypt/replay and produce the content-aware proof; restorers verify; the store retains required witnesses. A
  malicious service can still fork roots within the existing split-view bound until evidence meets.
- **Crash/retry/concurrency:** checkpoint admission names an event-root decision; equal roots produce equivalent
  caches, different roots remain ordered or forked by authenticated evidence. Proof-preserving compaction and opener
  deletion occur only after a successor root/checkpoint is durable; install/fallback remains staged.
- **Tradeoffs/new failures:** strongest replayability, but adds retained history/proof, service/storage/privacy cost,
  fork handling, and proof compaction that the current design avoided. Encrypted events make absence/first-event proofs
  impossible unless stable privacy-sensitive identifiers or client-produced semantic witnesses are selected.
- **Preserves:** source signatures, per-view accepted integrity, full snapshot/fallback, and migration provenance; it
  reopens the “one mark is enough” checkpoint-scope storage conclusion.
- **Invalidates:** rows 5–8/10 and their vectors; service inventory; accepted-head/checkpoint/package/migration
  formats; suffix/retention rules; hostile-service and proof-compaction tests.
- **Closure falsifiers:** two roots per position; opaque inclusion without semantic replay; snapshot inequivalence;
  proof/event truncation; privacy/size bound; malicious cache; service fork; cross-service migration.

### Creation Branch C — creator-committed card identity

- **Corrected invariant:** a card's stable identifier cryptographically commits to its creating credential and
  signed creation certificate, so another credential cannot produce a valid replacement creator for the same id.
- **Durable state/actors:** creator generates nonce and `CreationCertificate`, derives the card id from the exact
  workspace/lineage/creator/certificate commitment, and signs both; all readers recompute. Editors may change body
  and produce “verified but edited,” but cannot change creator/id. Card+certificate deletion is one acknowledged
  operation; no service creates identity.
- **Crash/retry/concurrency:** creation is admitted atomically as one card/id/certificate tuple. Competing creations
  have different ids; retries are byte-identical. Deleting the old card and creating a new one remains visible as a
  new identity rather than forged continuity.
- **Tradeoffs/preservation:** simplest anti-replacement repair and preserves standing claims/body commitments, but
  changes card ids/references and does not by itself prove checkpoint/head equivalence or stop authorized deletion.
- **Invalidates/falsifiers:** row 8, card/reference schema, attribution/checkpoint/package vectors, import/migration;
  whole valid self-claim replacement, id/certificate substitution, delete-and-recreate UX, collision/cross-lineage
  replay, and compaction must be tested.

### Creation Branch D — append-only first-write certificate/order authority

- **Corrected invariant:** one authenticated ordering domain selects the first accepted create for a card id; later
  values cannot supersede that certificate even after content compaction.
- **Durable state/actors:** `FirstCreation(card, accepted_domain, order, event_digest, creator_tuple, signature,
  order_proof)` is created by the source and finalized by the selected client/quorum or content-aware event authority;
  fresh restorers verify it. The authority—not wall clock—resolves incomparable per-credential chains.
- **Crash/retry/concurrency:** competing first writes remain pending until the authority selects or preserves a
  conflict; finalization is idempotent. Certificate deletion is coupled to acknowledged card destruction.
- **Tradeoffs/preservation:** keeps existing card ids and standing body commitments but introduces ordering authority,
  metadata and availability cost; it composes naturally with either checkpoint branch only if both use the same
  accepted-order domain.
- **Invalidates/falsifiers:** rows 5/7/8/10, service/client authority and vectors; valid later self-claim, two firsts,
  forked order, authority loss, trim then fresh restore, deletion/compaction, and migration must be tested.

### Decision packet

The evidence preserves full snapshots, two fallbacks, signed carrier fields, body commitments, and accepted-chain
integrity, but it does not select a semantic-admission trust model, acceptable replay retention/privacy cost, or a
first-write ordering domain. Evaluate `A+C`, `A+D`, `B+C`, and `B+D`; reject combinations whose authorities conflict.
No RC-5 branch is recommended until a packet names who authenticates semantics, what survives trim, how a fresh
restorer verifies it, and how incomparable chains resolve “first.” That packet is `P-8` in
[`action-tree.md`](./action-tree.md), which also records its dependency on `P-1`: `RC-5A`'s quorum question and
`P-1`'s single-owner-versus-quorum question are the same question, and answering them separately is how two
authorities end up disagreeing.

## `RC-6` — converged portable-root and deletion-handoff construction

Both branches require a durable `TerminalHandoff` acknowledgement naming a verified-current survivor or independent
export, complete terminal package digest, catch-up result/known absences, and the deletion classes it authorizes.
Hosted deletion progresses through an idempotent per-class ledger and never consumes a UI request or merely prepared
package as proof. “Verified-current” means the receiver either proves it already holds the terminal accepted head or
verifies a signed catch-up transcript from its authenticated prior head to that terminal head, including exact known
absences; opening some package bytes or reporting a recent wall-clock time is insufficient.

### Branch A — factor-sealed root commitment and full retired-package replacement

- **Corrected invariant:** the user's independently saved factor protects a non-rewrappable `(workspace,lineage,
  auth_root)` commitment and an opener; retirement is learned by importing a complete service-signed retired package,
  not by mutating a live manifest locally.
- **Durable state:** account recovery seal contains `R_priv` plus root/lineage commitment; Local archive has its own
  generated factor and archive keypair/seal plus the same commitment; every generation wrap binds that commitment;
  a full retired manifest/package; `TerminalHandoff`; deletion-progress ledger.
- **Actors:** client generates factor/key/root commitment; authorized client signs live package; service/trust root
  signs full retired package; importer verifies/opens; recipient client signs acknowledgement; deletion worker reads
  only acknowledged state; store cannot create root or receipt.
- **Crash/retry/concurrency:** archive creation is incomplete until factor confirmation and package verification;
  clean restore stages and verifies before install. Retirement remains `retired-with-bytes` until full-package receipt
  and catch-up acknowledgement; retries are digest-idempotent; partial deletion resumes by class. Offline devices
  remain stale until they receive full evidence.
- **Tradeoffs/new failures:** adds saved Local factor and requires the old service to assemble/sign the final package
  before deletion. Loss of the factor remains honest permanent loss; loss of acknowledgement preserves hosted bytes
  indefinitely. Full replacement may be large.
- **Preserves:** common manifest/part framing, HPKE confidentiality, four-object recovery, full service-signed retired
  positive, terminal-before-delete, detached Local replicas, new-lineage migration, and own-source suffix rule.
- **Invalidates:** row 10 package/recovery parts and vectors; rows 14/15 retirement; Local archive UX; service
  inventory; continuity/migration/deletion tests; package root negative.
- **Closure falsifiers:** paired fresh rewrap under attacker root; wrong factor/root; clean Local restore with no
  account; incomplete retired package; lost download/reply; stale-only survivor; partial deletion/backups; full
  provider disappearance; newest checkpoint loss.

### Branch B — factor-pinned archive signing identity and signed terminal transform

- **Corrected invariant:** the user factor opens or authenticates an archive identity whose public verifier pins the
  historical root; a terminal record carries a signed deterministic transformation from a named live manifest to a
  retired manifest.
- **Durable state:** factor-sealed archive signing/private or MAC root, public archive verifier/root commitment,
  live manifest digest, `TerminalTransform(from_digest,to_fields,to_parts_digest,service_signature)`, locally derived
  retired manifest/proof, `TerminalHandoff`, deletion ledger.
- **Actors:** client creates archive identity; package assembler signs/authenticates package root with it; service
  signs terminal transform; offline importer deterministically applies; recipient acknowledges; deletion worker
  gates on acknowledgement.
- **Crash/retry/concurrency:** transform applies only to the exact live digest and is idempotent; conflicting terminal
  transforms are evidence of service equivocation. Archive identity/key rotation and recovery replacement must
  preserve verifier continuity. Deletion remains resumable.
- **Tradeoffs/new failures:** permits smaller terminal delivery and offline in-place upgrade, but introduces a new
  long-lived signing/MAC authority and key-rotation/compromise story. If normal clients hold signing power, a
  compromised client may forge historical roots unless authority is carefully limited.
- **Preserves:** common package format, terminal-record-only product goal, opaque service storage, recovery-factor
  independence, terminal-before-delete, and migration separation.
- **Invalidates:** row 10 trust/signature model, recovery and package vectors, key hierarchy, row-15 terminal payload,
  service keys/inventory, restore/migration/deletion tests.
- **Closure falsifiers:** archive-identity substitution; compromised normal client; transform replay to another live
  digest; two transforms; factor replacement; Local clean restore; lost acknowledgement; partial deletion.

### Recommendation

Recommend Branch A for the retired-package transition: the existing full service-signed retired positive survived
challenge, while the transform is wholly new. A factor-sealed root commitment is also the narrowest evidenced repair
for package substitution. The exact Local archive factor/key UX remains a product decision, but it must instantiate
the same saved-factor-to-root-and-generation invariant before Stage 0 closes.

## `RC-7` — durable lapse/expiry state

### Branch A — fourth signed client transition

- **Corrected invariant:** `lapse` is a distinct signed/idempotent transition with a live lineage, exact sync-stop
  event, retention deadline, resume successor, and deterministic race with retire.
- **Durable state:** `Intent(kind=lapse,parent,target,payload)`, signed outcome, `HostedRetentionState(lapsed_at,
  deadline,status)`, per-class expiry deletion ledger, resume/reseed state.
- **Actors:** authorized user/client requests lapse where product policy permits; service serializes/signs; billing
  authorizes but cannot rewrite kind/time; devices read; deletion worker consumes settled expiry state.
- **Crash/retry/concurrency:** identical retry/mine-other-silence follows row 15; one parent serializes lapse versus
  retire; sync stop and clock creation are one service transaction; resume before deletion cancels/advances state;
  partial deletion cannot restore normal hosted sync without explicit reseed.
- **Tradeoffs/new failures:** strong user-visible auditability but makes billing change dependent on a client-signed
  operation and expands the authorization protocol. Automatic non-payment lapse needs a delegated/system actor rule.
- **Preserves:** row-15 wire theorem, live-versus-terminal taxonomy, twelve-month policy, local writability, and
  terminal-before-delete.
- **Invalidates:** row 15/16 schemas/vectors/checker, billing/authorization requirements, inventory, lifecycle tests.
- **Closure falsifiers:** lapse/retire race; lost outcome; automatic billing lapse; duplicate clock; resume at
  deadline; partial primary/replica/backup deletion; two divergent survivor reseed.

### Branch B — separate service-signed billing/retention machine

- **Corrected invariant:** entitlement/hosted-retention state is independent of authorization lineage; only a signed
  service record can stop sync/start expiry, and retirement remains the only terminal lineage event.
- **Durable state:** `EntitlementEvent`, `HostedRetentionState(live|grace|lapsed|expiring|expired, stopped_at,
  deadline, revision)`, deletion ledger, `ReseedSession` that references the still-live lineage.
- **Actors:** billing creates entitlement fact; retention service signs/serializes state; clients verify/read; hosted
  stores/delete workers consume; authorization service only arbitrates retire races through an explicit joint rule.
- **Crash/retry/concurrency:** monotonic revision/idempotency makes clock start once; retirement atomically supersedes
  or joins retention state; resume before destructive progress reactivates, after progress requires verified reseed;
  multiple survivors contribute branches rather than genesis.
- **Tradeoffs/new failures:** matches automatic billing better and keeps row 15 narrow, but introduces another trusted
  service signer/state machine and a cross-service transaction with retirement. Billing compromise can deny hosting
  but must not create terminal lineage or delete before deadline.
- **Preserves:** current three transition kinds, row-15 wire theorem, state taxonomy, twelve-month policy, local
  operation, and four-object recovery.
- **Invalidates:** the claim that row 15 closes lapse; row 16 and inventory; service architecture; resume/expiry/
  retirement tests and user copy.
- **Closure falsifiers:** forged/stale entitlement event; clock restart; billing/auth partition; retirement race;
  resume during partial deletion; backups; divergent survivors; no-survivor permanent loss copy.

### Decision packet

The evidence proves the common invariants and that both architectures are viable; it does not determine whether
lapse is a user transition or a billing fact. Product must decide who initiates lapse and whether automatic
non-payment exists. Stage 0 cannot credit row-15/16 closure until one exact machine and race rule is selected.

## `RC-8` — closure-policy/evidence convergence package

Both branches require explicit choices currently hidden by the green artifacts:

1. suite separation is either the stronger no-shared-primitive rule (where `both` fails) or the narrower
   no-shared-key/domain rule;
2. WebAuthn is either same-origin-only (`crossOrigin !== true`) or uses a ceremony-specific `topOrigin` allowlist;
3. origin isolation either has an allowed runtime network/resource graph enforced/read back at deployment, or the
   claim is explicitly narrowed to the literal static source forms the checker actually covers;
4. X25519/HPKE exact operations and absence behavior belong to the browser matrix; and
5. current PRD/TRD/register selection status has one authority.

### Branch A — canonical closure registry with generated projections

- **Corrected invariant:** every closed row, carrier, role, capability, policy, evidence claim, and normative status
  is declared once and projected into documents/checkers; runtime-only controls link to separately read-back evidence.
- **Durable state:** machine-readable `ClosureRegistry` with exhaustive enums, owning row, selected/open state,
  semantic policy, consumer list, evidence ids, stage gate, and normative projections; deployment evidence manifest
  for CSP/frame/egress/browser results.
- **Actors:** architecture owner approves semantics; generators consume but cannot redefine inventories; docs build
  renders/checks status; release system attaches runtime evidence; reviewers read exact registry version.
- **Crash/retry/concurrency:** repository updates are transactional at commit/CI scope: no projection can land stale;
  external browser/deployment observations are dated and expire/recheck by policy. Parallel row work edits distinct
  entries but merge-time totality rejects conflicts.
- **Tradeoffs/new failures:** structural repair removes several drift classes but central schema becomes critical and
  cannot encode all narrative nuance. A generated projection may look authoritative while runtime readback is stale,
  so evidence expiry remains explicit.
- **Preserves:** current precise row-4 carrier, correct-width KATs, ASVS profile structure, default Permissions Policy
  as defense-in-depth, and all narrow artifact theorems.
- **Invalidates:** row-1/17 registries and generators, PRD/TRD selection tables, WebAuthn vectors/helper, browser
  baseline inventory, origin checker, package scripts consuming status, review scopes.
- **Closure falsifiers:** add unknown/`both` enum; close row without projection; omit a carrier/capability; dynamic
  remote fetch under green source scan; cross-origin assertion under each policy; expired browser evidence;
  PRD/TRD status mutation.

### Branch B — distributed authorities with an independent coverage manifest

- **Corrected invariant:** existing prose/selections/generators remain authoritative for their domains, while an
  independently maintained coverage manifest enumerates every cross-artifact mapping and CI verifies both directions.
- **Durable state:** `ClosureCoverage` rows `(requirement, selection, carrier/capability/policy, generator/vector,
  runtime/review gate)` plus explicit semantic policy records and dated deployment/browser results.
- **Actors:** domain owners maintain local artifacts; an independent closure/review owner maintains coverage;
  CI compares; reviewers approve divergences. No generator supplies its own completeness list.
- **Crash/retry/concurrency:** partial changes fail until both local artifact and coverage row land; temporary branch
  work may be open but merge cannot claim closed. Dated external evidence expires independently.
- **Tradeoffs/new failures:** less migration and preserves human-authored documents, but duplicated data can drift and
  demands disciplined ownership. The coverage maintainer can become a bottleneck.
- **Preserves:** all existing artifact formats and narrow checks after targeted fixes; avoids making a new registry
  the single semantic authority.
- **Invalidates:** affected checkers and status prose; adds rather than replaces selection/register machinery;
  WebAuthn/origin/browser vectors still change.
- **Closure falsifiers:** delete either side of a mapping; stale PRD status; unknown capability; policy disagreement;
  green local checker with missing coverage row; runtime egress outside declared graph.

### Decision packet

The five findings converge at closure but do not establish one common inventory cause. Branch A is a structural
option, not an evidence-selected result; Branch B or targeted local repairs plus independent bidirectional coverage
may be smaller. Choose the representation only after fixing the suite and WebAuthn semantic policies, selecting
runtime origin enforcement versus an honestly narrow static claim, and deciding the ownership cost of generated
projections. Test the one selected WebAuthn policy, including its opposite/failure cases; do not require two mutually
exclusive policies to be simultaneously valid. No `RC-8` branch is recommended by the completed lineage evidence.

## `RC-9` — cross-cutting later-gate governance

### Branch A — central stage/release evidence manifest

- **Corrected invariant:** an explicitly deferred property has a machine-readable owner, deadline, required artifact,
  falsifier, expiry, and blocking stage; absence or stale evidence stops progression.
- **Durable state:** `GateManifest` entries for legacy cutover, product-shaped journal performance/device population,
  exact audit-source delta/external review, source/toolchain/blob attestation, browser conformance, and integrated
  Stage 1/4 scenarios; immutable results reference commit/build hashes.
- **Actors:** stage owner produces; CI/release system verifies; external reviewer signs/read-backs review scope;
  product owner approves population/cutover policy; release owner cannot waive without a recorded decision.
- **Crash/retry/concurrency:** gate runs are content-addressed and resumable; failed/expired evidence remains blocking;
  parallel gates do not overwrite results. Cutover itself has a durable pre/encrypted-active/legacy-deleted state.
- **Tradeoffs/new failures:** strongest mechanical stop but adds governance/schema work and can encourage checkbox
  compliance if falsifiers are weak. External-review availability may block schedules honestly.
- **Preserves:** Stage 0's design-versus-implementation distinction, Pixel microbenchmark as bounded evidence,
  Baseline as compatibility, audit history, WASM KAT behavior, and clean export/import strategy.
- **Invalidates:** release/sequencing/progress gate descriptions, CI scripts, performance ledger use, Stage 1 cutover
  plan, WASM build pipeline, external-review scope records.
- **Closure falsifiers:** stale blob with green KAT; source/toolchain mismatch; legacy journal-only edit across every
  cutover kill; supported slower device; fixed-slot versus immutable append; audit scope omits dependency delta;
  missing reviewer identity/readback.

### Branch B — stage-local signed completion receipts

- **Corrected invariant:** each stage owns a small completion packet signed/approved by its responsible engineering,
  product, and review actors; release requires the chain of receipts rather than one central registry.
- **Durable state:** Stage 1 cutover receipt; storage performance/support receipt; crypto source/artifact review
  receipt; Stage 4 protocol/integration receipt; release readback linking exact artifacts and falsifier results.
- **Actors:** stage owners prepare; product/external reviewers approve their domain; release verifies receipt chain.
- **Crash/retry/concurrency:** receipts are append-only and superseded by explicit later receipts; changed inputs
  invalidate dependent receipts through hashes. Cutover retains its own resumable transaction state.
- **Tradeoffs/new failures:** easier domain ownership and richer judgment, but weaker automatic totality and higher
  risk of inconsistent formats/waivers. A missing approver stalls honestly.
- **Preserves:** same bounded evidence and stage separation as Branch A with less central schema.
- **Invalidates:** stage checklists/progress/sequencing and release process; fewer existing generator changes than A.
- **Closure falsifiers:** change a hashed input; omit one gate; ambiguous waiver; reviewer scope mismatch; cutover/
  performance/toolchain counterexamples from Branch A.

### Decision packet

No lineage evidence compares central manifests with signed stage receipts. Whichever is chosen must be mechanically
release-blocking, hash its inputs, name expiry/waiver authority, and carry the exact legacy-cutover, device-
population, audit-scope, and source/blob falsifiers. This governance packet covers all five later gates; the journal
benchmark remains causally/remedially in `RC-3` and is referenced here rather than counted twice. Deferral remains
legitimate only under that authority.
