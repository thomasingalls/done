# Local Account baseline transitions and reader boundaries — 2026-10-13

The preceding [owned shadow phase](./account-local-baseline-shadow.md) is committed signed as
**`962329a3`** (`G`). This phase extends the **explicit, opt-in, in-memory experiment**. The live
reader, startup, journal and stored formats remain unchanged. No baseline is installed, no history
is deleted, no release-validation campaign or deployment is started. This work is committed signed
as `43fe12aa`. The next [durable anchoring phase](./account-local-baseline-anchoring.md) implements
a private carrier and compatibility fences without enabling a product installer.

## Authority continuation

The private codec/authentication domain is now `done/account-local-baseline/draft-2` /
`done/account-local-baseline-auth/draft-2\0`. Draft 1 was never persisted, so this is not a migration
or reader rollout. It remains a closed, canonical, bounded tuple and uses the same metadata key
under its distinct domain. The independent expected revision/hash anchor is still required.

The draft separates immutable scope from evolving authority:

- The scope digest binds local custody identity, account baseline/starting heads, service,
  workspace/lineage/acceptance key, reader/publisher identity and installation kind/initial epoch.
- A new tuple retains the verified epoch/head, network generation and digest of the exact local
  installation cuts at construction. The event witness retains its independent count/hash.
- Replay requires the old epoch/head and generation to belong to the current **verified** protocol
  history. Earlier custody cuts must match the retained digest exactly. New cuts cannot precede the
  baseline witness or exceed the suffix. At each cut the extended witness must equal the installed
  count/hash; every suffix event must carry the exact epoch in effect there, not merely a monotonic
  epoch. Skipping an unseen epoch and multiple zero-work transitions remain valid.
- A later service boundary is proved from the accepted baseline position/link plus the suffix's
  signed envelopes. New boundaries cannot retreat behind that prefix. The protocol prefix verifier
  has an explicit trusted local origin; ordinary calls still begin at zero. This argument is usable
  only after baseline MAC/anchor/scope verification. It is not a wire cursor or a new service signature.
- Old/new envelopes, signed retry/refusal ancestry, generation keys and actual content coverage are
  still verified. A surviving owner's rotation/current-key retry can replay through the baseline.
  Missing old openers or a wrong new key still refuse.

Authority invalidation cancels an in-flight shadow comparison immediately. A completed, locally
authenticated candidate may survive an authority change **within the same unlocked lifetime**, but
its next comparison must prove the transition above and repeat the complete fresh custody checks.
Resume, close, failed comparison and invalidated work erase it. Real generation activation closes
the owner, so that native path creates a new shadow after reopen; continuity through rotation is
currently established by pure signed fixtures, not a retained native lifetime.

## Checkpoints and old operations

A later history-install record now replays through the normal checkpoint verifier from the retained
installed-history state. Signatures, historical eligibility, ciphertext opening, coverage, sequence,
immediate-parent and receive-cut checks remain in force. Own cuts at the baseline's accepted frontier
compare its authenticated link. Later own cuts reconstruct their exact pre-installation suffix attempt,
seeded with the retained position/link/invocation count. Peer cuts compare retained frontiers, receipts
or already verified starting points. The checkpoint snapshot is additive and never replaces live undo.

There is a deliberate refusal boundary: an own checkpoint cut below the retired prefix, or a peer
cut whose old link is no longer known, returns `history-required`. A signed checkpoint alone does not
prove that an unknown old link agrees with the retired local history. Before deletion, the installer
must retain the needed evidence or ensure future maintenance uses a sufficiently recent cut. The
current experiment falls back to intact history; this is **not yet a complete post-deletion policy**.
The later [retirement evidence decision](./account-local-retention-evidence.md) selects bounded exact
checkpoint pins and refetch/refusal behavior; its live enforcement remains a separate implementation.
Since phase 550 a needed checkpoint (one that moves a receive cursor forward) is verified instead,
by reading the accepted chain from its cut to the retained frontier, and its installation is folded
into the baseline at once.

An outstanding old read also cannot silently learn its previous link from its response. The reduced
state marks its retired frontier. A late response at the terminal retained receipt can be authenticated
normally, including detecting duplicates/conflicts. Older requests without independent evidence are
fenced before verification. Duplicates are never stored as new receive records: both readers still
reject that invalid durable event. A future installer must retire/refetch those old flights before
persisting results; the live full-history path is unchanged in this phase.

## Reader disposition

| Consumer | This phase | Before deletion |
| --- | --- | --- |
| `localBaselineReplay` / `localBaselineAuthority` | Continue authenticated local witness and exact authority cuts; compare with full reference | Add durable reader entry and independent active anchor |
| Spool/source selection and delivery | Retain invocation origin, consumed indexes and terminal receipt; extend position/link from the origin | Preserve unresolved positions and exact journal/source exclusion |
| Self receive projection | Resolve the retained self frontier envelope instead of requiring a retired position row | Keep old-flight fence aligned with installed baseline |
| Inbound replay / checkpoint cuts | Replay suffix installations; use retained receipts or explicitly require historical evidence | Set installer cut/evidence policy for outstanding old reads and old checkpoint heads |
| Warm semantic indexes | Seed acceptance links and consumed indexes; use absolute position offsets in append/retry/grant paths | Connect to the durable baseline-aware owner reader and audits |
| `verifySpoolWitness`, `verifyInstalledSuccessor`, `verifyInstalledMembership` | Explicitly reject a reduced spool; the experimental transition reader supplies the alternative | Adapt callers to the authenticated baseline entry, never a partial spool presented as full |
| Startup and joined startup (`accountStartup`, `joinedAccount`), reference audits (`accountReceive`) | Continue to read intact stores through the full verifiers | Durable pointer/fence validation followed by baseline plus suffix verification |
| Rotation/removed-copy (`accountRotation`, `rotationObservation.verifyDetachedPrefix`) | Continue full verification; detached-prefix verifier explicitly refuses a reduced spool | A tested baseline-aware removed/revoked-owner adapter; no automatic authority grant |
| Handoff/source readers (`membershipSource`, `accountCatchup`, Account spool/startup readers) | Keep complete physical census and full witness verification | Route through the same baseline-aware reader after durable format selection |

The explicit guards prevent silent zero-based interpretation if a reduced experimental view is
accidentally passed to a full-history consumer. They do not claim those runtime adapters are complete.
No other caller receives a shadow result, and no application timer or automatic baseline writer exists.

## Findings and focused evidence

The actual joined-owner journey exposed a draft assumption: local custody IDs on the joining device
are not the account's writing IDs. The existing authenticated installation bridges those scopes.
The reader now binds both instead of requiring equality; original-device scope equality remains.
A focused pure case uses different joined local IDs to keep this distinction covered.

[Retained evidence](./development-evidence/2026-10-13-local-baseline-transitions/README.md) covers:

- 99 Vitest cases across 11 files, including 22 baseline cases and the prior 30 generated cut histories.
  New cases cover nonzero prefix membership, original/joined cuts, signed fork/missing-boundary refusals,
  rotation/retry, repeated checkpoints, unavailable old links, live duplicates versus invalid stored
  duplicates, warm-index continuation and explicit full-reader fences.
- 26 existing protocol/checkpoint Node checks. Two old omission controls had stale anchors/expectations
  predating this phase (confirmed in `962329a3`); they now target both checks enforcing the current
  issuance/prefix policy. No generalized mutation campaign was introduced.
- A focused packaged Chromium journey: real original and joined custody, bidirectional suffix edits,
  checkpoint sequence 1, original-owner continuity across admission epoch 4 and cancellation epoch 5,
  then cold reopening both devices from full history. The test alone injects a private owner handle;
  it builds into its ignored output directory and runs isolated disposable accounts on loopback.
- The six prior opted-in native cases retain journal-before-apply/input/undo, empty-journal eligibility,
  exact disk/journal preservation, fresh final authority, native transaction settlement, close/lock
  drainage, resume and cold-open coverage. The ordinary-build absence check is also retained.

Native exploratory failures included the real joined-scope defect, a regression that preserved the
candidate on resume (fixed by distinguishing checked transitions from generic invalidation), stale cancellation text locators,
and a test navigation that left the editor whose lifetime the test intended to exercise. The final
journey keeps that editor open and stops its test servers in teardown. Timings on this busy host are
not comparative performance evidence. No personal account or writing was used.

## Next bounded work

Define the durable encrypted baseline carrier, independently authenticated active pointer, bounds /
chunking and reader/writer fence, then build a **non-deleting installer and cold reader**. Connect the
fenced startup/audit/transition consumers to that shared entry before enabling deletion. Historical
read/checkpoint evidence policy, exact journal/restore handling, crash/lost-reply tests and preservation
of a live undo stack through a future installer remain required. The native undo tests here exercise
ordinary editing during shadow work, not an installer that does not yet exist.
