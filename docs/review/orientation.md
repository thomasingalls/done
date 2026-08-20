# Stage 0 lineage review — seeded orientation

This file prevents every new task from repeating repository discovery. It contains navigation facts and claims
made by the project documents. It does **not** establish that those claims are correct.

## The question

Review the complete lineage after branching from `main` and determine:

- whether the project reached well-considered and appropriate conclusions;
- whether its algorithms, state machines, implications and consequences were understood;
- whether nuance in the original planning material was lost, altered or over-generalized and then propagated;
- where every claimed guarantee actually stops;
- which conclusions are sound, qualified, unresolved, or should be reopened.

This is not a generic style review, a repository-wide vulnerability scan, or permission to redesign unrelated
parts of the product.

## Repository boundary

The branch point is `c6116669030eedeea3d599bca0da3547114e6930`. The intended end state is
`9edd9300adebcec3abd2234c946f1dcccdc17eef`. Git reports a linear range of 35 commits with no merge commits.

The worktree used to create this workspace was detached at `dbfd01f`, eight commits after the base and 27 before
the tip. The tip remains available as a Git object and can be read with `git show`. Do not infer end-state content
from files beside this orientation document. Branch names, unrelated `t3` checkpoints, and side tips such as
`d7ad4f1` are outside the pinned range.

The full base-to-tip diff touches 112 files, with roughly 27,000 additions. Much of it is specification,
generators, vectors, measurement harnesses and a small WASM module rather than shipped application behavior.
Application changes in this phase include boot marks and the `recovery` to `unfiled` terminology migration.

## What the original plan said

At `c611666`, `docs/progress.md` described **Stage 0 — select, measure, book** as not started. Its four work
areas were:

1. Select storage-review rows 1–3 with constructions and vectors.
2. Draft the protocol-review scope: rows 4–12, 15–17, 20, and the network half of row 14.
3. Build latency harnesses and record plaintext baselines before encryption changes the store.
4. Book review 3a (storage/journal) and review 3b (protocol) early enough that calendar lead time does not become
   the critical path.

The storage review also included row 13 and the storage-facing half of row 14. Rows 18 and 19 were empirical and
outside both reviews. Row 21 was the cutover-attribution choice and gated Stage 2, not either review.

The plan explicitly called out:

- crash-safe nonce discipline for the synchronous journal;
- the lack of persistent-store coverage in the property-test fleet;
- the need for concrete constructions rather than “the TRD will decide”;
- the risk that independent review might require implementation rather than specification;
- a deliberately missed cheap window for root-type day collections;
- loss of `id`, `author`, `origin`, and `createdAt` through the proposed cutover carrier.

These are signposts for `F-01`, not a complete contract ledger.

## What the end-state documents claim

At `9edd930`, TRD §15 says 18 rows are selected and four register rows remain open, with row 20 split:

| Row | Claimed selection, abbreviated |
| --- | --- |
| 1 | AES-256-GCM on asynchronous paths, XChaCha20-Poly1305 synchronously, HKDF-SHA-256, Ed25519, HPKE/X25519, SHA-256; suite versioning rather than per-field negotiation |
| 2 | XChaCha20-Poly1305 journal seal, random 24-byte nonces, synchronous RustCrypto-derived WASM |
| 3 | AES-GCM record and key-envelope formats with trusted clear fields bound; non-resetting sequence budget |
| 4 | Signed and sealed envelope format with one credential sequence serving outbound and accepted position |
| 5 | Per-credential accepted-link chains and service-signed heads |
| 6 | One `(seq, link)` mark per credential, definite-refusal-only re-minting, checkpoint-relative retention |
| 7 | Full signed checkpoints, two retained, with rotation ordering constraints |
| 8 | Per-card standing attribution claims in the encrypted content root |
| 9 | Enrollment/package-carried heads; nonce-bound signed assertion for total-loss recovery |
| 10 | One portable package at never-established, live, and retired lineage states |
| 11 | Commit-reveal short authentication string, typed from new device to existing device |
| 12 | Discoverable WebAuthn account credential and service-signed local public-key binding |
| 13 | Mandatory generated device-lock code, optional PRF as a second seal, content-key rotation on enrollment |
| 14 | 125-bit recovery code with no stretching; nonce-bound transition step-up challenge |
| 15 | One signed intent/outcome protocol for rotate, replace-recovery, and retire |
| 16 | Twelve months of hosted retention after synchronization stops |
| 17 | OWASP ASVS 5.0.0 L2 floor with pull-ups, addenda and a recorded deviation |
| 20 | Claimed closed for the selected rows through generated vectors or checked artifacts |

Substantively open:

- row 18: whether persistent encrypted search is needed;
- row 19: root-type day collections;
- row 21: first-deployment cutover attribution;
- row 20 for any construction still open.

The tip's `progress.md` claims both review scopes are closed, both reviews are booked for the week of 2026-08-24,
and Stage 0 is ready to close. The repository contains the booked-review claim, not the reviewers' results. At the
tip, `completed.md` is byte-identical to the base and does not yet record Stage 0 closure.

## Course-correction signposts

The lineage itself reports several cases where later work changed the interpretation of earlier work. These are
review targets, not proof that the final answer is right:

- paired negatives were found not to isolate AAD bindings, leading to field-elision coverage checks;
- throttled desktop emulation badly understated a real handset's 4 kB journal cost;
- the measured journal breach led from pure JavaScript to a synchronously instantiated WASM seal;
- later rows amended earlier selections, including the suite, enrollment transcript and recovery step-up;
- several apparent algorithm choices were reframed as threat-model or state-machine questions;
- stale register references and service-inventory cells motivated build checks against other documents.

The review must check whether each correction reached every downstream consumer and whether the new mechanism
addresses the original failure rather than only the observed test.

## High-risk seams to test, not presume broken

- primitive separation, suite agility and carrier versioning;
- journal nonce width, crash ordering, base64/storage costs and synchronous availability;
- clear structured-clone fields, AAD coverage and trim semantics;
- local key custody, stale profile copies, device-lock enrollment and generation rotation;
- envelope positions, admission marks, accepted heads and finalization;
- checkpoint fallback, outbound retention, rotation and old-generation deletion;
- attribution claims, body commitments, compaction and historical verification;
- enrollment authentication, brand-new-device rollback bounds and trust-root anchoring;
- recovery replacement, replay, transition idempotency and downgrade behavior;
- browser-origin assumptions, WebAuthn capability matrices, WASM/SIMD floor and ASVS coverage.
