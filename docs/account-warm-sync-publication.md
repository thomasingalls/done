# Warm Account storage and foreground sync — publication handoff

Prepared 2026-10-13 from signed source `f516a958e88b17d17f7dc5cb65b1fa386dbec45f`
on `codex/warm-ledger-loads`. Application main at preparation is
`24481b8210f6e04aae153198b871b8329fb81ed5` (PR #51). This collects all fifteen signed
commits through that candidate, followed by a documentation-only handoff commit.
It is an ordinary application update; release qualification remains paused.

## What this candidate changes

- **Warm storage and isolated answers** (`e88c19a5`, `f4f01228`, `7b088f80`, `9bf9f3c6`).
  Exclusive Account owners retain verified history across their own appends and sequence
  reservations, and return detached selections without repeatedly copying the whole history.
  Each warm load authenticates its counter, checks store counts and first/last keys, and checks
  a rolling slice of old rows. Cold open, resumption, unknown transitions and compaction retain
  their full checks. See the [warm-load contract](account-warm-ledger-loads.md),
  [ownership evidence](performance-experiments/2026-10-12-owned-verification/README.md),
  [selection evidence](performance-experiments/2026-10-12-storage-selection/README.md) and
  [reservation evidence](performance-experiments/2026-10-12-owned-reservations/README.md).
- **Journalled input during background work** (`9ba0ae63`, `02829405`). Automatic flushes
  and ordinary remote preparation no longer hold the editor queue throughout storage work.
  Local edits are still synchronously journalled before application. A remote page becomes
  durable and is read back before exposure; its original frames apply to the current document
  and undo state. Structural/authority transitions retain their fences. See the
  [flush evidence](performance-experiments/2026-10-12-journal-flush-admission/README.md) and
  [prepared handoff contract](account-prepared-remote-handoff-design.md).
- **Less repeated authentication and cooperative proof work** (`08a82089`, `b60d535d`).
  Every local authority check still reads and compares the complete fresh custody inventory.
  Exactly unchanged inventories can reuse authentication, with lifetime/invalidation guards.
  Membership proof work yields at owned boundaries and transfers a verified result within one
  discovery/adoption operation, without dropping the fresh authority checks. See the
  [authentication contract](account-authority-authentication-reuse.md) and
  [membership evidence](performance-experiments/2026-10-12-membership-work/README.md).
- **Status updates without content rerenders** (`5c7ba18a`). Queue status has separate
  subscriptions. Warnings and blocked-state actions still update promptly. The
  [status packet](performance-experiments/2026-10-12-status-subscriptions/README.md)
  records controls and independently scheduled input measurements.
- **Immediate final application after fresh checking** (`742e1c14`, `f516a958`). The full
  final authority read can run outside the editor FIFO. A private, single-use permission is
  consumed synchronously only when owner and queue remain eligible. Other storage requests
  invalidate before enqueue; lifecycle and authority changes invalidate too. A scheduling miss
  uses the original full queue-head check once. A real verification failure still refuses/closes.
  See the [contract](account-final-apply-authority-design.md) and
  [implementation, controls and measurement](performance-experiments/2026-10-13-immediate-authority/README.md).

The remaining commits retain measurements/design. In particular `b656553a` keeps the bulk custody
reader **opt-in** after it missed its target; it is not enabled in this image. Local retained-baseline
work remains design-only. No accepted history is newly deleted by this update.

## Integrity and evidence limits

Warm history reuse deliberately changes detection timing for old, same-shape interior corruption:
it may wait for a rolling audit or reopen. The live owner uses its already authenticated memory,
not unchecked disk rows. Changes in row counts, key bounds and counters retain the documented
immediate checks. After 256 appends or five minutes, budgeted audit slices run even during activity;
browser suspension and native scheduling prevent a hard wall-clock completion guarantee. The
operator explicitly accepted this tradeoff. It does **not** extend to reusing an old custody inventory
without a fresh read, or to arbitrary script/database writes bypassing exclusive ownership.

The operator subsequently reported heavy VM use during recent testing. Its overlap and resource
load were not recorded. Historical timing comparisons may be confounded; none are pooled, summed
or presented as an isolated estimate of this publication's benefit. The final-apply packet already
has mixed input-p95 results. Its shorter queue-held operation and passing correctness controls do
not establish that typing latency is solved. The 16 ms target, physical account-phone performance,
large-history retention and remaining synchronous editor work remain open. The Pixel account
comparison is still pending by the operator's choice.

## Immutable image and bounded publication checks

[Evidence and artifact hashes](development-evidence/2026-10-13-warm-sync-publication/evidence.json)
pin the clean signed-source archive and exact candidate:

- Image: `done-public:f516a958`, `linux/arm64`, Node 24.18.0.
- Index: `sha256:5bb003b0a49cb61f0a2734beceabf86799d8f5dc841db9cdd391e93d5af58b1e`.
- Runtime manifest: `sha256:f89b7c4a50c150d0c785fac33a7402a7328258dbf4af38ed52c64048caef80e7`.
- Signed-source build, pinned Yjs, TypeScript, origin isolation and initial bundle budget pass:
  137.1 kB gzip against the unchanged 350 kB cap. All 31 existing Node 24 container runtime,
  gateway, backup, restore and maintenance tests pass.
- 349 focused unit tests pass, one existing skip. These cover private ownership, detached
  answers, warm-load integrity, authority reuse, queue/undo, status subscriptions and the
  immediate permission's invalidation/native-settlement rules.
- Disposable container smoke passes non-root packaging, scoped APIs, exclusive store ownership,
  all 34 service-worker precache URLs, accepted state/identity after SIGKILL and restart, and
  graceful shutdown. All its disposable resources were removed.
- Two focused packaged journeys pass: original/joined custody with interrupted progress, and
  both-way editing with undo/redo, reconnect and journal-only offline reopening.
- The retained 120-card, 600-position journey passes with 75 ms added per request: backlog
  catch-up while both devices write, subsequent two-way bursts, equal complete 54,211-byte
  Markdown exports and cold offline replay. Its single observed catch-up is 57.717 seconds;
  cold opening is 2.672 seconds, still above the 2.5-second target. These are functional-check
  observations, not a matched performance comparison or a claim that either budget is resolved.

The browser checks use the exact frontend extracted from this image with disposable Node 26.11.1 host services
from the same archive. Container API behavior is checked separately above; this is not an exhaustive
mixed-version or release-validation campaign. No production state or real credentials are used.

## Compatibility, publication and rollback

Account schema 26, authority schema 1, signed wire formats and stored receipt formats remain
unchanged. No initialization, migration, restore, re-enrollment or browser-storage reset is needed.
Shared protocol changes add optional scheduling checkpoints; service callers retain their ordinary
verification. Cached older clients retain the previous behavior until accepting the waiting-worker
update. This compatibility assessment combines source inspection and bounded checks, not exhaustive
mixed-version qualification.

1. Merge the application PR with a merge commit, preserving the signed source/evidence history.
   The operator retains the merge button. Ordinary application CI runs; full qualification stays paused.
2. Publish this exact tested local image as `ghcr.io/thomasingalls/done:f516a958`. Verify the remote
   index, ARM64 manifest, private visibility and authenticated pull. Rebuilding creates a different
   artifact that requires its own identity and checks. The candidate is currently local only.
3. Prepare the ol-infra PR changing the immutable image pin in
   `infra/apps/done/components/runtime/kustomization.yaml`. Retain PVC, keys, identity, routes and
   backup configuration; use its established offline checks.
4. After the operator merges, reconcile using the infrastructure Justfile and verify readiness,
   public build/assets and backup health. On actual devices, accept build `f516a958`, check edits
   in both directions, undo with received changes, lock/reopen and offline persistence. Preserve storage.

The deployed source is `9465fb04`, index
`sha256:15a11309fd43a3a01d4d377a598dc3e1152734e309664d3d258b600e05ed9963`.
Reverting that pin is an ordinary image rollback, with clients accepting the older application;
it restores prior performance, not prior data. No data restore is part of rollback. Diagnostic Vite
switches remain documented in the linked contracts and require a separately built/tested frontend;
they are not runtime environment toggles. No registry push, infrastructure change or rollout is part
of this preparation.
