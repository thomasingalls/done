# Baseline-aware lifecycle readers and replacement — 2026-10-13

The owned-reader phase is committed signed as **`3ba73cb3`** (`G`). This next private phase uses
`VITE_ACCOUNT_BASELINE_INSTALL=1` plus `VITE_ACCOUNT_BASELINE_READ=1`. It connects the remaining
lifecycle consumers and builds replacement baselines from an authenticated predecessor plus suffix.
It deletes **no physical history** and does not enable a product setting. The complete physical
history remains the independent comparison oracle. This implementation is committed signed as **`af5f0d87`** (`G`); its source
hashes and [focused evidence](./development-evidence/2026-10-13-local-baseline-lifecycle-readers/README.md)
identify the tested tree.

## Lifecycle adapters

- **Prospective authority.** `contentStore.verifyBaselineTransition` authenticates the current
  physical census and anchor, then verifies the proposed context using the old baseline's authority
  epoch/cuts hash and suffix event witness. It also compares full-history replay under that proposed
  context and checks send/receive consistency. It checks current custody again after verification.
  The proposal never becomes a retained view or installed authority. Successor/membership adoption
  still commits its freshly checked custody marker and performs the existing authenticated readback.
  Failure refuses; it cannot fall back to a complete replay after a bad retained-origin check.
- **Initial handoff.** The separate v9 owner recovers snapshot/carried originals/suffix and the
  current-era journal. Its prospective certified successor goes through the same transition adapter.
  Checkpoint construction and the custody transaction remain unchanged.
- **Membership/history local source.** The independently acquired owner uses its own authenticated
  logical result and source catalogue. Service-backed accepted-history reconstruction remains
  independent: unaccepted local writing is not evidence for a service checkpoint.
- **Rotation.** The separate rotation owner validates the retained origin under its authenticated
  prospective membership. Its journal deduplication uses exact carried/suffix capsule identities and
  bytes. The physical census, re-encryption and reservation transaction still handle actual rows only;
  no synthetic sequence-zero snapshot becomes a physical row. Old baseline openers and the journal
  era survive, including content-switched/custody-not-yet-activated restart.
- **Detached copies.** Original and joined startup call a separate retained-prefix verifier after
  the baseline replay. The in-memory result includes the authenticated origin epoch. An exact terminal
  cutoff must match the retained link; a later cutoff must be reached through signed suffix envelopes.
  A cutoff before that origin or beyond available positions refuses. No network authority or new
  retention is granted to a detached owner. Local editing/export and reopen remain available.

The four full-spool entry points retain their guards: `verifySpoolWitness`,
`verifyInstalledSuccessor`, `verifyInstalledMembership`, and `verifyDetachedPrefix`. Reduced
consumers use their explicit adapters. There is no new stored format, weaker full verifier, or silent
zero-origin interpretation. Logical reads still require an authenticated journal era; pre-era anchors
retain complete reads. The default application keeps its complete-history paths.

## Rebuilding a baseline

`rebaseLocalBaseline` takes only the authenticated predecessor, its pinned anchor, a detached
physical suffix and semantic counter, and a fresh owner context. It copies inputs before its first
await, verifies the predecessor and suffix, then summarizes that verified state. It never reads or
accepts hidden prefix rows. The common summarizer is also used by the initial full-history builder.

Replacement carries forward:

- the exact unconsumed/partial capsules and inherited consumed indexes;
- absolute accepted position, terminal signed proof/link and burned-attempt total;
- peer frontiers, terminal receipts, starting points and the latest checkpoint record even when no
  new checkpoint occurs in the suffix;
- current authority/cuts hash and extended witness, generation, reservation high-water marks and
  the predecessor's logical cut when the suffix is empty;
- the existing journal era, unless the separately fenced era transition explicitly advances it.

Settled eligibility compares acceptance with **origin position plus suffix positions**. Unaccepted
allocations, conflicts, missing dependencies and unrepresentable evidence still refuse. The candidate
must independently reopen with an empty suffix before it can be returned. The real installer then
compares it with complete physical history and performs the existing exact-census atomic metadata
exchange, fresh authority/journal checks and readback. Expected-revision retries retain their existing
idempotence and burned-reservation behavior. Superseded metadata chunks may be replaced; logical
history rows remain untouched.

No live document or UndoManager is swapped by these operations. Journal-before-apply, ordered final
application, the slot Web Lock and old-read/checkpoint/attempt fences remain in force.

## Boundary after this phase

This closes step 2 of the [reader inventory](./account-local-retention-readers.md) for the private
complete-physical-history experiment. It does **not** establish a working reduced physical carrier.
Next is the pure [exact deletion-plan dry run](./account-local-retention-deletion.md): compute exact
store/key/ciphertext inventory and compare projected replay/subsequent operations without calling
history deletion or writing the proposed reduced representation. Private atomic removal, reader-first
publication/rollback, unavailable-history/capacity behavior and performance measurements remain
separate. Release validation stays paused; `docs/progress.md` is untouched.
