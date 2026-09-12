# done — Active slice

**This file is disposable, and that is its function.** It holds the slice of work that is active right now
and nothing else. Nothing of record value lives here: decisions go to [decisions.md](./decisions.md), and
closed work goes to [completed.md](./completed.md).

## How this file works

**Everything below the rule is replaced wholesale when the active slice changes.** Not amended, not struck
through, not archived in place — deleted and rewritten. A working document that accretes is a working
document nobody reads, and the two files that _are_ records already exist.

**One thing must happen first.** When a slice closes, write its outcome into
[completed.md](./completed.md) _before_ rewriting this file. That ordering is the only thing protecting
the record, because after the rewrite the evidence is gone.

**It grows a tree when the slice deepens.** If work goes deeper without the slice changing — an item turns
out to have four parts, one of which has three — nest it. Nesting is free and says something true about
the shape of the work. What is _not_ allowed is a second top-level slice **inside one document**: two active
slices in one document means it has stopped answering the question it exists to answer, and one of them is
really next-up.

**The file is a stream of documents, one per seat, separated by `---` as YAML separates its own.** The
original rule assumed one slice because it assumed one worker, and that assumption broke the first time two
gates ran in parallel seats — `L-1` in its worktree and `L-2` in another, neither waiting on the other,
neither with anywhere honest to say so. A seat owns its own document and edits nothing below or above the
separator, which is what keeps the wholesale-replacement rule intact per document and keeps two live sessions
out of each other's paragraphs. Each document opens with its keys, because once there is more than one the
first question is always *whose is this, and where is it running* — gate, seat, branch, status, and what
blocks it.

**One document per seat is a ceiling, not a target.** A second document is a claim that two gates genuinely
do not block each other, checkable at `action-tree.md`'s prerequisites — not a place to park work that is
really next-up. When a seat's slice closes, its outcome goes to [completed.md](./completed.md) and **its
document is deleted**, separator and all.

**Status vocabulary**, deliberately small: **not started** · **in flight** · **done** · **blocked** (which
must name what it is blocked on).

**Being wrong here is cheap.** This file is allowed to lag by a day. It is not allowed to describe a slice
that is no longer active.

---


## Active slice: Packaged and migration plaintext-residue evidence (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: not started
blocks_on: explicit packaged/export and synthetic migration/clear observation points before extending R1
debts: consult docs/review/remediation/debts.json
updated: 2026-09-12
```

**Roadmap position.** Personal Local cutover, cleanup and packaged offline upgrades are exercised.
Account remains at [Stage 4 §3.5](./sequencing.md#35-stage-4--the-service), item 5's internal creating-member
ciphertext round trip. C/D1–D8, aggregate audit `ec889d9`, F-15 `c10dee3`, F-21.3 `2bbb4c6`, F-21.7
`f0b6acd`, F-21.1 `77b0bb6`, F-21.6 `3b0a1ba`, F-21.2 `f118127` and residue preparation `6a9c9c4` are
signed. All seventeen recent signatures verify `G`. The signing reminder remains paused; the original
unsigned chain remains under the [recorded backup](./account-conformance-runs/2026-09-11-signed-contract-history.json).
No real Account receipt exists. R1 is complete, unstaged/uncommitted; F-21.4 remains open for wider scope.

**Completed boundary.** [F-05/F-06](./review/implementation/account-crypto-closure.md),
[F-15](./review/implementation/reservation-durability.md),
[F-21.3](./review/implementation/account-isolation.md),
[F-21.7](./review/implementation/account-decision-composition.md),
[F-21.1](./review/implementation/account-parser-conformance.md),
[F-21.6](./review/implementation/account-delivery-oracle.md) and
[F-21.2](./review/implementation/account-admission-evidence.md) retain their recorded scopes and limits.

[R1](./account-residue-r1.md) implements the [prepared contract](./account-residue-testing.md) with an
independent raw matcher and browser/SQL/diagnostic collectors. It enumerates unknown keys/stores,
calibrates encodings and omissions, records incomplete observations, and keeps policy classification
separate. Current actor/device labels are encrypted document metadata. The actual browser recovery
owner retains sensitive retry capabilities at two named fields; those matches are reported separately.
Known observer IPC fences remain in the scan. Opaque keys and physical backing files are not qualified.

[Final campaign](./account-conformance-runs/2026-09-12-account-residue.md): 7 stages, 16 Node cases,
144 calibration cells, 26 directed checkpoints and 24 generated histories; 871 source pins, types,
scoped lint and format pass. No skips/timeouts. Seed `1121040`, 0 shrinks, no counterexample. There are
155 checkpoint reports: 154 complete observations without prohibited matches and one detected deliberate
journal side-write. Real Local/recovery/promotion/capture/spool/delivery and Account owners preserve
introduced writing through cold readback. The real synchronous journal point, valid wrong factor,
cancelled open, failed journal storage and lost HTTP replies are exercised. The archive preserves
exact synthetic observations and needles. No runtime source changed or production defect was found.

The first focused generated run exhausted its budget without a per-history archive and is incomplete
evidence. Fixture receive retry now wakes the actual receiver after publication; the budget stays
270 seconds and the final generated stage completes in 223.7. Detector/fixture repairs and an earlier
passing run are recorded separately. Logical, physical and copied-profile claims remain distinct.

**Next bounded phase — extend R1 to actual packaged and migration flows, with prep first.**

- Map the actual packaged Local UI, generated service worker and export routes to explicit input and
  observation points. Reuse independent acquisition/matching. A planted cache proves the collector;
  a real installed worker and UI flow are still required. Build into disposable output roots only.
- Define exact intentional-export exceptions and a separately calibrated ZIP/container reader for
  those synthetic artifacts. Never exempt all files by extension or authorize a cache/log copy because
  an export was requested. Keep the pre-scan raw-value and completeness rules.
- Exercise synthetic legacy capture/import/selection, authenticated source cleanup and Local clear,
  including their interrupted/restarted states. Identify expected predecessor plaintext before cleanup
  and require its absence at the declared logical post-cleanup point. Preserve the encrypted destination
  and independently verify expected writing. Do not inspect personal exports or rerun personal cleanup.
- Credit existing packaged upgrade/private-migration/cleanup tests for their actual coverage; add
  meaningful missing leak controls and generated histories without relabelling namespace checks as
  forensic erasure. Declare each required surface and unreadable/unsupported representation.
- Keep physical profile/SQLite/WAL/deleted-byte and supported-platform C13 evidence separate. No real
  Account enrollment, personal-profile scanning, default-app cutover, deployment or host VM work.

**Personal checkpoint.** All 21 hashes in `dist/` and `.dev/releases/17d87c2/app`, 31 prior vector files,
historical review and L-2 are unchanged. Personal preview/relay remain stopped. No personal browser,
Account, factor, operator key, pin, origin or routing changed. Root `done `,
`reviewpacket96a20401ceb88d.md` and `review-packet-1ceb88d-393ef43.md` remain untouched.
The actual old second device will adopt the first workspace with fresh custody/store/counters/
credentials, without importing or merging its previous writing.

**Other gates.** Diagnostics/salvage, measured maintenance/performance and accepted review follow-ups
remain. General lineage, successor checkpoints, concurrent membership, pruning/backlog scale,
enrollment/device management, revocation/rotation, clear/delete, finalization/total-loss recovery,
PRF enrollment, supported platforms, deployment/restore and independent review remain separate.
L-2's historical ref `d24732b` has no further service work to integrate.

The outcome was appended to completed.md before this rewrite; L-2 is unchanged.

---

## Active slice: Stage 4's first pieces — authorization, acceptance and transition integration (`L-2`)

```yaml
gate: L-2
seat: .claude/worktrees/l2-onboarding-863db1
branch: claude/l2-onboarding-863db1 # forked from claude/l1-contract-pass at 1375ee6
status: in flight # R3-4 paid; the slot verifier landed; the account service is next
plan: [sequencing.md §3.5, action-tree.md L-2]
prerequisites: S0-10 (closed 2026-08-29), especially S0-2/S0-4 — not L-1
debts: none # node scripts/check-debts.mjs --gate L-2 lifts
updated: 2026-08-29
```

**Why this runs beside `L-1` rather than after it.** `L-2`'s prerequisites are `S0-10`, especially `S0-2` and
`S0-4` — [action-tree.md](./review/remediation/action-tree.md)'s node names them and does not name `L-1`. The
two rejoin at `L-3`, which lists both. The critical-path diagram in
[sequencing.md](./sequencing.md) §4 draws Stage 4 after Stage 2 because that is the order the *product* ships
in; §5.1 already settled that the service's construction does not wait, since *ships* means someone else's
data and the author synchronizing his own devices is development. So milestones 5 and 6 are reached while
review 3b is out, and what waits for 3b's answer is exposing another person to it.

**What this slice is.** Stage 4's internal order, taken in order (§3.5): the account service, the
authenticator and the device-local slot verifier; the recovery keypair and the code ceremony; the
authorization lineage, first signed head, genesis checkpoint and promotion; device signing and wrapping
credentials; the envelope layer, relay rewrite and content-blind durable store; enrollment's two gates; the
device list; rotation, revocation, acceptance evidence and the finalization boundary. **Mostly indivisible:**
a device list that cannot revoke is worse than no device list, so nothing ships until item 8.

**What has landed.**

- **`R3-4`, first, because it was owed first** (`fbdbfb4`). `S0-9` round 3 returned member-entry uniqueness to
  `S0-2`'s homes *before `L-2` implements a verifier*, and this is that moment. A certified set carrying two
  entries under one `credential_id` is now malformed at both homes, the four map entries pinning them are
  re-pinned with every entry held, and `pnpm recipient:check` carries the sentence as a byte rule — added
  beyond the named repair because the generator's object-keyed `members` cannot express a duplicate, so no
  published negative can ever cover it. Recorded at
  [`S0-2/README.md`](./review/remediation/S0-2/README.md) and as a dated addendum on the disposition.
  **This makes one line of the `L-1` document above stale** — its *not in this slice* paragraph still says
  `R3-4` is owed. Correct then, wrong now, and the `L-1` seat's line to drop rather than this one's to edit:
  the separator only means anything if it holds when crossing it would be convenient.
- **The device-local slot verifier** (`b8c267a`), `src/account/slotUnlock.ts` — TRD §13.9, §15 row 12, item 1's
  half that needs nothing from `L-1`. The service-signed binding is verified before the key it names is used;
  refusals are values rather than messages. Held to `test/vectors/account-credential.json`, with the negatives
  rebuilt against `src/` rather than replayed, and a fifteen-mutation battery run against it — eleven caught,
  four survivors all in the compiled-in encoding set, all closed by two tests that pin the check's *position*
  rather than its presence.

**What is next, in the plan's order.** The account service and the authenticator ceremony that mints these
credentials — the two halves of item 1 the verifier does not cover — then the recovery keypair and the code
ceremony, which §3.5 puts at account creation rather than later because there is no account without it.

**Two things `L-2` needs that it does not own.** §6.5's slot index is where a verified binding is *stored*,
and it is `L-1`'s item 2; the verifier is a pure function over published bytes and did not wait for it, but
the enrollment path will. And §11.2's hostile-relay tests need `relayNetwork()` in `test/replicas.ts` able to
withhold, reorder and deliver late — §3.5 names extending it as far cheaper than a second harness, and it is
worth building before item 5 rather than during it.

**Not in this slice.** `L-1`'s document above, which this seat does not edit. `L-3` and `L-4`, and the four
registered debts at `L-4`. The live Stage 2 cutover. Review 3b's answer gates exposure, not construction
(§5.1) — and reviewer answers that constrain implementation are `L-4` gates.
