# Minimally corrected end state

## Status and branch assumptions

This is a target architecture, not an implementation claim. It preserves the validated primitive, carrier-binding,
single-writer persistence, accepted-chain, immediate enrollment, transition-wire, and lifecycle-taxonomy theorems.
It applies the evidence-discriminated branches:

- `RC-4A`: encrypted exact-byte outbound spool plus a final-refusal/sole-successor attempt machine;
- `RC-6A`: factor-sealed historical-root commitment, explicit Local archive opener, full service-signed retired
  package, and durable terminal handoff.

For `RC-1`, `RC-2`, `RC-3`, `RC-5`, `RC-7`, `RC-8`, and `RC-9`, the evidence determines the invariant and durable
interface but not every representation. The mutually exclusive branch choices are identified at the end. Stage 0 is
not reviewably corrected until those choices are made; this document does not hide them behind generic
implementation work.

The target remains distinct from the pinned predecessor runtime. Nothing here asserts that the encrypted adapter,
authorization/acceptance services, restore path, transition worker, or deletion worker exists.

## Global invariants

1. **Authority is explicit.** Service authorization, client-authenticated recipient eligibility, content-key
   delivery, source authorship, accepted-state evidence, recovery authority, package historical authority, and
   destructive-deletion authority are separate records and signatures.
2. **No accepted local mutation lacks a crash copy.** The persistence authority either durably represents the exact
   update before authoritative Yjs mutation or refuses the operation before that mutation.
3. **Exact network objects remain exact.** An ordinary envelope or transition intent is persisted before first send;
   silence never licenses reconstruction or re-mint.
4. **One generation becomes active through one durable application transaction.** A verified remote outcome alone
   never changes the local active generation.
5. **Deletion follows object dependencies.** A key/opener, source envelope, checkpoint, package, local store, or
   hosted class is deleted only after a durable predicate proves every consumer has moved beyond it.
6. **Authentic bytes are not semantic proof.** Checkpoint coverage, first creation, package historical root, and
   terminal receipt each have their own independently verifiable authority.
7. **Lifecycle axes do not collapse.** Authorization lineage, hosted retention, device grant, local slot, content
   generation, recovery set, package state, and deletion progress change through separate named transitions.
8. **Deferred evidence blocks at its real gate.** Compatibility is not performance; audit history is not an exact-
   version review; a passing blob KAT is not source-to-binary freshness; a booking is not reviewer acceptance.

## Authority boundaries and durable records

| Durable record | Minimum authenticated content | Creator / authenticator | Readers | Deletion condition |
| --- | --- | --- | --- | --- |
| `RecipientAuthority` / `RecoveryBootstrap` | workspace/lineage/current head, credential, `W_pub`, authentic recovery-state digest, enrollment transcript or prior recovery-set/bootstrap key, success/supersession/conflict parent | Existing eligible client plus installing credential; or factor-opened recovery-bootstrap signer plus recovered client; service only serializes | Every future rotator/recovery/package producer | Credential and all dependent history/packages retired under an accepted successor |
| `RecoverySet` | counter, `R_pub`, exact code-sealed `R_priv` and bootstrap signer envelope/digests, exact wrap map/digests, historical-root commitment | Content-holding client; replacement step-up binds complete canonical bytes | Recovery client, rotators, package producer | Signed replacement and, for exposure, successor generation active; retention/dependency rules satisfied |
| `GenerationIntent` / `Outcome` | kind, parent/target, complete canonical payload digest, winner id | Client signs intent; authorization service signs unique outcome | All participating clients | Only after local `GenerationApply` settles and result remains reconstructible from successor state |
| `GenerationApply` | outcome, successor self-wrap/opener, old-object classifications, active marker, checkpoint/trim obligations | Local transition worker after signature verification | Local startup/repair | After active marker, every old object is resolved, and no restart needs the record |
| `GenerationReferences` | generation → journals, batches, outbound envelopes, checkpoints/suffixes, packages, local/reader/recovery openers | Local/service storage workers under authenticated object ids | Cleanup/deletion workers | Generation opener deletion only when reference set is empty and required fallback/export rules agree |
| `WalAdmission` / `SeqReservation` | exact update or complete group, generation, storage key, global sequence/range, per-generation attempt count, coverage id | Local persistence authority | Startup/replay/trimmer | Matching content record committed and compare-remove proves the same WAL identity |
| `OutboundEnvelope` | credential position and exact row-4 bytes, send state, accepted/refused evidence, retention floor | Source client before send | Source retry/migration | Authenticated resolution plus second-newest-checkpoint retention floor |
| `PositionDecision` | workspace, credential, position, attempt id, exact digest, accepted/final-refused state, parent refusal, sole-successor authorization | Acceptance service in the same atomic domain as accepted positions | Source client/receivers/auditors | Retained with both attempts/position decision through the relevant checkpoint floor |
| `CheckpointTuple` / selected semantic authority | real encrypted snapshot, derived `{sv,ds}`, exact accepted-head baseline, suffix, producer, opener, plus retained replay witness/admission certificate or content-aware event-root proof | Producer proposes; selected independent client/quorum or event/proof authority authenticates semantics | Fresh restorers/retention workers | Tuple and required proof/witness leave retained set only when no fallback/package/migration depends on them |
| `CreationAuthority` | creator-bound card identity/certificate, or append-only first-write order certificate with fork rule | Creating credential plus selected identity/order authority; never mutable map convention alone | Fresh/returning clients, checkpoints, packages | Acknowledged card+claim destruction/compaction under the chosen product policy |
| `ArchiveRootSeal` | workspace/lineage/auth-root commitment plus recovery/archive opener | Client under saved recovery or Local archive factor | Clean-device importer | Explicit factor/identity replacement after new packages are confirmed; never package writer alone |
| `RetiredPackage` / `TerminalHandoff` | full service-signed retired manifest; terminal accepted head and checkpoint/suffix/recovery/root; receiver prior/current head; exact package digest; signed catch-up/known-absence result | Service signs package; receiver proves terminal head or verifies catch-up, then acknowledges | Importers and deletion worker | Handoff retained as terminal evidence; hosted bytes delete only after it is durable |
| `HostedRetentionState` | live/grace/lapsed/expiring/expired, one sync-stop time/deadline, revision, retirement relation, deletion progress | Chosen `RC-7` authority | Clients, billing, stores, deletion/reseed workers | Lineage retirement/migration policy and audit retention, not silent reset |
| `ClosureAuthority` | selected/open row, exact carrier/role/capability/policy, honest evidence scope, consumer/evidence/gate mappings | Selected central registry owner or independent coverage owner plus domain owners | Documents, generators, reviewers, release gates | Append/supersede only; prior review inputs stay reconstructible |

## State transitions

### Enrollment and future reader eligibility

`service-admitted`
→ `ceremony-committed`
→ `SAS-confirmed`
→ `key-and-recovery-state-delivered`
→ `installed-and-client-authenticated`
→ `reader-eligible`

- Service admission alone is never `reader-eligible`.
- The immediate typed-SAS transcript continues to bind workspace, epoch/head, both credentials, and `W_pub`.
- The authenticated result additionally binds the genuine recovery recipient/state installed on the new device.
- A future rotator consumes only `RecipientAuthority`, never a service boolean or roster entry.
- Mismatch spends the credential; a crash resumes the same transcript/state or restarts with a fresh credential.
- The unresolved upstream choice is whether `RecipientAuthority` is a transferable certificate (`RC-1A`) or a
  client-certified recipient set embedded in the successor authorization lineage (`RC-1B`).
- Both representations include a no-surviving-device path. The prior `RecoverySet` commits a bootstrap verification
  key whose signer is factor-sealed beside `R_priv`; possession of account access, nonce-confirmed authorization/head,
  the factor-opened recovery object, and ciphertext licenses a one-use, conflict-serialized successor binding the
  exact recovered root, new credential, and new recovery state. The service cannot forge this transition, and a
  stale first contact retains the already documented hostile-service freshness bound.

### Recovery and recovery replacement

Total-loss recovery retains the validated four independent objects: account access, service authorization/head,
content factor, and ciphertext. The nonce-bound first-contact head remains a replay defense against the relay, not a
claim that a malicious authorization service supplies global freshness.

`four objects recovered`
→ `current head nonce-confirmed`
→ `content/recovery/bootstrap signer opened`
→ `RecoveryBootstrap` conflict-serialized and countersigned by the new credential
→ `RecipientAuthority` active
→ future rotation consumes that authority.

This path requires no pre-existing eligible client and introduces no fifth independently held object; the bootstrap
signer is inside the factor-protected recovery object.

Replacement transitions:

`old-set-live`
→ `complete-new-set-pending`
→ `signed-replacement-winner`
→ `successor-generation-applying` when exposure is possible
→ `new-set-and-generation-live`
→ `old-set/reference cleanup`

- The signed intent covers exact `R_pub`, exact sealed envelope, every generation wrap, counter, and root
  commitment through one canonical encoding/digest.
- “Lost but not copied” may avoid an immediate rotation only if product copy explicitly distinguishes that state and
  can establish it; the current exposed-code promise therefore uses a fresh generation.
- The old code is not required for replacement, but the new code is confirmed before transition creation.
- Old recovery material and openers are deleted only after the successor generation is active and every retained
  historical object still has an authorized opener.

### Package-root authenticity and Local restore

- Account recovery seals protect both `R_priv` and the historical `(workspace,lineage,auth_root)` commitment. A
  package writer may create a fresh HPKE wrap to genuine `R_pub`, but it cannot change the factor-protected root.
- A never-established Local workspace creates an archive-specific generated factor and archive opener/identity;
  archive plus saved factor alone can open every required generation and checkpoint on a clean independent client.
- Archive/package validation completes before any content becomes the active workspace. Partial restores are
  staged and discarded or resumed; they never merge as a replica.
- Live packages remain credential-signed. Retirement is represented by a complete service-signed retired package;
  a terminal record may be displayed beside a stale live package but does not silently rewrite its manifest.
- Migration verifies factor/root/checkpoint/selected creation authority, creates a fresh lineage and generation, and
  allows each returning credential to re-envelop only its own suffix. It isolates rather than remotely revokes an
  unreachable old provider.

### Journal/record sequencing and oversize writes

The corrected writer has two non-negotiable phases:

`operation proposed`
→ `exact update durably admitted under current generation`
→ `authoritative Yjs mutation visible`
→ `global sequence consumed before each AES-GCM attempt`
→ `record transaction complete`
→ `compare-and-remove matching WAL`

- A 65,537-byte update, quota failure, unavailable synchronous storage, WASM trap, or wrong-width key/nonce cannot
  occur after authoritative mutation without a complete recoverable WAL representation.
- Keys are exactly 32 bytes and XChaCha nonces exactly 24 bytes before any shared-memory write.
- Global record order remains monotonic across content and heads; per-generation invocation accounting separately
  counts every reservation/attempt, including gaps and abandoned encryption.
- Before the first disallowed `2^32` invocation, the writer rotates/refuses; equality behavior is normative and
  build-failing.
- Two tabs cannot allocate the same sequence. Trim carries a proven coverage watermark and cannot delete a
  concurrent record beyond it.
- The unresolved upstream choice is a bounded staged single-record WAL/per-write allocator (`RC-3A`) versus an
  arbitrary-size grouped WAL/range allocator (`RC-3B`). Both derive exact bytes in staging and successfully write the
  actual WAL before authoritative mutation; the current no-size-cap contract points toward B unless product
  explicitly chooses a limit.
- The fixed-slot Pixel results remain component evidence. The release p95 consumes an immutable append/burst/
  cleanup benchmark on a declared hardware population.

### Outbound retry and authenticated refusal

`local covered delta`
→ `position reserved`
→ `exact E_n persisted`
→ `sent/unknown`
→ one of:

- `accepted`: verify the signed head against the locally recomputed link, persist the mark, retain through the
  checkpoint floor;
- `final refused`: verify the signed attempt-0 digest/position/epoch decision, persist it, and permit exactly one
  attempt-1 replacement that binds the refusal id; or
- `silence`: retain and resubmit byte-identical `E_n` indefinitely.

Relay/network errors are always silence. Final refusal permanently makes the old digest ineligible before attempt 1
exists; a delayed old envelope returns the same refusal. Attempt 1 is the sole successor, cannot fork or create a
third attempt, and the service still accepts at most one digest at the credential position. Duplicate exact bytes
return the same durable decision. The selected closure authority contains network envelope v1, its
suite/label/version binding, and accept/refuse behavior.

### Generation switching and old-opener deletion

The signed row-15 mine/other/silence verdict is preserved. A matching winner begins, rather than completes, local
application:

1. persist verified outcome while complete pending payload/self-wrap remains;
2. recover `K_(g+1)` and durably install its successor opener;
3. classify every old-generation object: unminted delta, record batch, exact outbound envelope, accepted mark,
   checkpoint/suffix, package, recovery wrap;
4. cover permissible local deltas under `g+1`, retain exact possibly accepted `g` envelopes until authenticated
   resolution, and keep `g` for any unread/retained object;
5. atomically advance active epoch/generation only when no new write can select `g` and `g+1` is reopenable;
6. admit a semantically verified `g+1` checkpoint and trim local content under `g+1`;
7. delete each old opener only when `GenerationReferences` proves no journal/outbound/fallback/package requires it;
8. settle/clean the pending application record last.

Device-lock and recovery replacement use this same application machine. The unresolved lock subchoice is operational
credential replacement (`RC-2A`) versus factor-gated self-wraps (`RC-2B`); either must make every future-generation
path require the lock factor on the claimed tier.

### Checkpoint coverage, fallback, and attribution

- A producer proposal freezes one accepted-head vector, materializes that Yjs state, derives insertion/deletion
  coverage and suffix, and names the generation opener. The producer signature authenticates the proposal but never
  admits its semantics by itself.
- Before pre-checkpoint envelopes may be trimmed, the selected `RC-5` authority must persist one of: exact replay
  witness plus a client/quorum `SemanticAdmission`; or a content-aware accepted-event root with portable replay/
  equivalence proof. The record names the derivation version, exact head baseline, and incomparable-branch rule.
- A fresh restorer re-derives `{sv,ds}` from the snapshot and verifies the selected admission/proof. If replay inputs
  no longer travel, the target explicitly trusts the authenticated historical verifier for head equivalence; it does
  not pretend the head alone proves semantics. If that trust is unacceptable, proof/replay inputs remain portable.
- Incomparable head-vector candidates are never ordered by wall clock. The selected authority either retains viable
  branches or serializes a winner in its authenticated order domain.
- Local install is staged; content becomes active before heads, and failed newest install leaves no partial state
  before second-newest fallback begins.
- Every retained checkpoint has at least one authenticated authorized opener until that checkpoint leaves retention.
- Card attribution uses either creator-committed card identity (`RC-5C`) or an append-only first-write/order
  certificate (`RC-5D`) in the same accepted-order domain as checkpoint admission. A mutable-map “write once” rule
  never supplies this authority. Later edits still produce “verified but edited”; another credential cannot replace
  the creator of the same identity.
- Card and creation authority are destroyed only together under the future acknowledged compaction/deletion rule.

`RC-5A/B` and `RC-5C/D` are intentionally unresolved upstream decisions. The combinations are not interchangeable:
an admission certificate without a selected verifier policy, an opaque event root without semantic proof, or a
first-write certificate using a different fork/order domain does not meet this target.

### Device-lock custody

The validated local sequence remains:

`promptless`
→ stage factor seals and every retained local generation envelope while `L_local` survives
→ one transaction swaps staged envelopes, deletes `L_local`, and records `locked + rotation_owed`
→ run the common generation/recipient-capability transition
→ `locked + rotation settled`.

- No UI or requirement says future copy protection is active while `rotation_owed` is true.
- After settlement, the pre-lock copy cannot use either a local opener or a promptless operational/self-wrap path to
  recover future generations on the claimed assurance tier.
- Losing the mandatory generated factor can permanently lose the last Local copy; this remains explicit. Same-origin
  hostile code after factor entry remains inside the threat boundary.

### Lapse, expiry, retirement, migration, and destructive deletion

**Lapse/expiry:** the still-unselected `RC-7A` or `RC-7B` carrier creates exactly one live-dormant sync-stop time and
deadline. Lapse does not write a terminal record. Resume before destructive progress returns hosted sync; resume
after partial/complete expiry uses an explicit reseed session. Multiple divergent survivors contribute legitimate
branches and are never mistaken for never-established genesis. Hosted deletion is an idempotent ledger over primary
objects, replicas, wraps, checkpoints, and declared backups; the audit record preserves honest completion/limits.

**Retirement/account deletion:** `retire` first commits terminal lineage while hosted bytes remain. The service then
builds a complete service-signed retired package. A receiver is verified-current only if it proves it already holds
the terminal accepted head or verifies a signed catch-up transcript from its authenticated prior head to the terminal
head with exact known absences. It then durably stores and acknowledges the exact package and transcript. Only that
`TerminalHandoff` authorizes each hosted deletion class. A lost reply/ack retains bytes; a partial deletion resumes;
an offline device remains a stale detached Local replica until it receives terminal evidence.

**Migration:** migration never consumes hosted deletion authority for an unreachable old provider. It restores from
an authentic/openable package or surviving device, starts a fresh lineage/generation, admits the corrected
checkpoint, and replays only each returning credential's own suffix. Work known only to a never-returning credential
remains an explicit loss.

**Destructive local remove/reset:** revocation request and local clearing are separate. The local device records a
durable clear plan naming slot index, sessions, identity, credentials/keys, databases, journal/spool, caches, and
service-worker state. Each step is idempotent; restart resumes until all named classes are absent. If the service is
unreachable, local clear may finish only with an explicit unconfirmed-revocation result. This remains a Stage 1/4
implementation gate unless/until a selected construction is claimed for it; it is not inferred from terminal hosted
deletion.

## Closure and release evidence

The selected `ClosureAuthority` is either a canonical generated registry, distributed authorities plus an independent
bidirectional coverage manifest, or targeted repairs with equivalent independent coverage. The evidence does not
select the representation. In every branch, one exact version owns selected/open status and checks carrier/role/
capability/policy mappings against PRD/TRD/register projections. It does not turn runtime claims into static evidence:

- suite separation must name the chosen primitive-versus-key rule and exhaust `both`/unknown values;
- WebAuthn must implement the one selected policy: reject cross-origin ceremonies, or validate an explicit
  `topOrigin` allowlist with matching frame and Permissions Policy readback;
- origin isolation either uses an allowed runtime network/resource graph with CSP/deployment/runtime readback, or
  narrows its assurance to literal static forms with the excluded runtime/dynamic channels named explicitly;
- the browser matrix exercises exact Ed25519 and X25519/HPKE operations, exact SIMD WASM, PRF discovery, and absence
  behavior on the declared release floor;
- normal CI performs both behavioral KAT verification and source/toolchain/blob freshness/attestation;
- audit copy names the exact source/version/compiler scope; and
- legacy plaintext cutover, immutable journal performance, integrated Stage 1/4 scenarios, and external reviewer
  readback are explicit blocking gates rather than Stage 0 design proof.

## Incompatible branches and upstream decisions that must reopen

| Decision | Why branches cannot be silently combined | Upstream decision/artifacts reopened |
| --- | --- | --- |
| `RC-1A` certificate vs `RC-1B` certified epoch set | Two sources of recipient truth create conflict unless one is merely a projection of the other. | Rows 5/9/11/15, authorization epoch schema, device-list semantics, enrollment/recovery requirements. |
| `RC-2A` operational credential replacement vs `RC-2B` factor-gated self-wrap | Both can coexist but add redundant credentials/carriers and competing cleanup rules; choose one authoritative future-generation gate per tier. | Rows 13/15, credential custody, reader-wrap format, device-lock copy. |
| `RC-3A` bounded staged single-record WAL vs `RC-3B` arbitrary-size grouped WAL | A product-visible update cap contradicts current unbounded authoring/import behavior; both require exact staged bytes and successful WAL before authoritative apply. | PRD operation limits, row 2/3, import/system-operation design, performance budgets. |
| `RC-5A` verifier admission vs `RC-5B` content-aware event proof | They assign semantic/head-equivalence trust, retained proof inputs, privacy, and availability to different actors. | Rows 5/7/10/15, accepted-event retention, service/client authority, restore/migration. |
| `RC-5C` creator-bound id vs `RC-5D` first-write order certificate | C changes identity/reference semantics; D requires a durable ordering authority. Combining them is redundant unless one is a projection. | Row 8, card ids/references, attribution/checkpoint/package/migration vectors. |
| `RC-7A` client lapse transition vs `RC-7B` billing state | They assign initiation/signing and race authority to different actors. One may project the other, but only one settles the state. | Rows 15/16, billing/authorization architecture, lifecycle copy and service inventory. |
| `RC-8A` canonical registry vs `RC-8B` distributed coverage/targeted repair | The evidence requires exact ownership and bidirectional coverage, but does not select a generated semantic source. | PRD/TRD/register projections, selection/evidence coverage, review workflow. |
| Strong no-shared-primitive vs narrow no-shared-key suite rule | SHA-256 `both` is either forbidden or acceptable; the oracle cannot honestly assert both. | Row 1/TRD §§13.2/13.10 and suite generator/vector. |
| Same-origin-only vs allowlisted cross-origin WebAuthn | Verifier, frame policy, Permissions Policy, and product embedding behavior differ. | Rows 12/14/17, deployment policy and vectors. |
| Full retired-package replacement vs terminal-record-only transform | The recommended full-package branch rejects the current in-place claim; retaining that product behavior requires reopening `RC-6B`. | Row 10 package state/signers, retirement delivery UX. |
| Row 21 system attribution vs early fidelity archive | The archive branch cannot proceed until corrected checkpoint/package/Local opener work closes; system attribution accepts known historical loss instead. | Row 21 and Stage 2 cutover, not Stage 0 review 3a/3b. |

Until those decisions are recorded, this document supplies the common corrected invariants and dependency edges but
does not claim a fully selected Stage 0 end state.
