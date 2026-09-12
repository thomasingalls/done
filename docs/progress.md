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


## Active slice: Storage and responsiveness (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: in flight
blocks_on: none; user authorizes unsigned phase commits through recovery and storage/responsiveness
debts: consult docs/review/remediation/debts.json
updated: 2026-09-12
```

**Roadmap position.** Personal Local cutover, cleanup and packaged offline upgrades are exercised.
Account remains the private creating-member ciphertext round trip at Stage 4 §3.5 item 5; it is not
mounted in the personal app and no real Account receipt exists. Signed baseline `1372c39` precedes
five unsigned sync-liveness commits ending `f42b4a7`. The privacy extension is the commit containing
this checkpoint. The active reminder enumerates all unsigned descendants of that signed baseline.

**Closed boundary.** The [privacy extension](./account-conformance-runs/2026-09-12-privacy-extended/README.md)
passes nine stages, 23 Node cases, 60 generated container and 24 R1 histories, and 899 source pins.
It covers packaged UI/worker/export/offline restart, synthetic migration/restart/cleanup/clear and
observable profile/service files. The generated ZIP-prefix instrument defect is repaired with retained
evidence. Logical cleanup passes; a legacy writing sentinel remains in physical LevelDB after deletion.
F-21.4 remains partial for supported-platform/C13 opener/opaque-format/fragmentation qualification.
No forensic-erasure claim follows from a logical clean scan. No production code changed in this phase.

**Now.** F-10/N-08/P-07 diagnostics are committed as `8ebccfd`. F-09 current-format Local salvage
is complete in the commit containing this checkpoint. The [eight-stage campaign](./account-conformance-runs/2026-09-12-local-recovery/README.md)
passes 1,007 unit tests, 30 generated damage/journal histories, packaged UI refusal/cancellation/export,
custody/trim controls and packaged migration/privacy regressions. Original carriers remain unchanged;
every ZIP is partial. Account, custody-loss and unsupported-schema recovery remain separate.

F-16's owned idle content scheduler is complete in the commit containing this checkpoint. Its
[nine-stage campaign](./account-conformance-runs/2026-09-12-content-maintenance/README.md) passes
1,011 units, 24 generated idle/flush schedules, 35 native cases and full trim controls. The ordinary
packaged editor compacts 140 edits to one state and cold-replays exact writing. Pending originals and
Account proof history remain; thresholds are advisory. An incomplete grouped-deadline attempt is
preserved and repaired with separate passing Account stages.

F-17's equivalent full-byte comparison fast path and bounded derived archive memo are complete in
this checkpoint. The [eleven-stage campaign](./account-conformance-runs/2026-09-12-editor-projection/README.md)
passes 1,015 units, 150 differential/100 archive properties, 100 native pending and 100 native delivery
histories and guard-removal controls. At 100k items, controlled command median is 190.2 → 121.2 ms;
large-history/fallback/fork and supported-device input-to-paint qualification remain open.

Continue F-19 versioned retained candidate representation and direct byte comparison, preserving
exact signed/MACed bytes, current authentication and native commit guards. Then recap these categories
and advance to release-validation prep. Give an unsigned commit and chat summary at the boundary.
The signing reminder stays active.

**After these categories.** Aggregate release validation F-20/N-06/P-05 and P-06 prose, with explicit
supported-platform and formal review gates. Private Account cutover and second-device adoption remain
separate from public shipping. Stage 4 enrollment, membership/revocation/rotation/finalization/recovery,
platform custody and deployment obligations are not closed by the creating-member trial.

**Preservation.** Intermediate Account v8 will not ship; F-08/N-04/N-09 are disposed by non-shipment.
All 21 personal package files in `dist/` and `.dev/releases/17d87c2/app`, all 31 prior vectors, archived
review annotations and L-2 remain unchanged. Personal preview/relay stay stopped. No personal browser,
profile, recovery files, Account, factor, operator key, pin, origin or routing changed. The unrelated
root `done ` remains untouched. The old second device will adopt the first workspace with fresh
custody/store/counters/credentials, without importing its earlier writing.

The completed outcome was appended before this rewrite; L-2 is unchanged.

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
