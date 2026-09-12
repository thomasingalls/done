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


## Active slice: Neutral logical-carrier plaintext scanner (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: not started
blocks_on: calibrated independent collectors before claiming a negative result
debts: consult docs/review/remediation/debts.json
updated: 2026-09-12
```

**Roadmap position.** Personal Local cutover, cleanup and packaged offline upgrades are exercised.
Account remains at [Stage 4 §3.5](./sequencing.md#35-stage-4--the-service), item 5's internal creating-member
ciphertext round trip. C/D1–D8, aggregate audit `ec889d9`, F-15 `c10dee3`, F-21.3 `2bbb4c6`, F-21.7
`f0b6acd`, F-21.1 `77b0bb6`, F-21.6 `3b0a1ba` and F-21.2 `f118127` are signed. All sixteen recent
signatures verify `G`. The signing reminder remains paused; the original unsigned chain remains under
the [recorded backup](./account-conformance-runs/2026-09-11-signed-contract-history.json).
No real Account receipt exists. F-21.4 preparation is complete, unstaged/uncommitted; the finding remains open.

**Completed boundary.** [F-05/F-06](./review/implementation/account-crypto-closure.md),
[F-15](./review/implementation/reservation-durability.md),
[F-21.3](./review/implementation/account-isolation.md),
[F-21.7](./review/implementation/account-decision-composition.md),
[F-21.1](./review/implementation/account-parser-conformance.md),
[F-21.6](./review/implementation/account-delivery-oracle.md) and
[F-21.2](./review/implementation/account-admission-evidence.md) retain their recorded scopes and limits.
The last admission campaign's 44 stages, 75 Node tests and 898 source pins remain preserved.

[F-21.4 preparation](./review/implementation/account-residue-evidence.md) credits existing known-opener
custody, legacy namespace cleanup and crypto/replay evidence without calling them neutral byte scans.
The [contract](./account-residue-testing.md) separates logical-carrier R1, physical-residue R2 and
copied-profile C13 claims. It defines W/F/T markers, explicit metadata and export treatment, matching
before redaction, calibrated representations, acquisition budgets and incomplete results. Current
actor/device labels use encrypted document metadata. Browser recovery preparation retains sensitive
retry capabilities and is bypassed by the ordinary native ready() helper; R1 must exercise that owner.
One stale PRD copied-profile sentence was corrected to match mandatory factor custody.

[Prep evidence](./account-conformance-runs/2026-09-12-account-residue-prep.md): 23 inventory entries,
83 lexical source matches, 71 source pins and static reference/preservation checks. No scanner, browser
campaign, root build or new confidentiality result. Production sources and vectors are unchanged.

**Next bounded phase — implement R1 from the contract.**

- Build an independent matcher and collectors for all discovered IndexedDB, localStorage, each live
  page's sessionStorage, CacheStorage, cookies, OPFS, current service/authority SQL and captured app/
  service diagnostics. No product openers, parsers, slot-prefix census or success flags in acquisition.
  Required unsupported/unreadable/truncated data is incomplete; opaque CryptoKey contents stay outside R1.
- Calibrate every applicable surface × representation cell with clean and planted controls, unknown
  keys/tables, nested/offset/binary/chunk cases, and source omissions in the collector. Add a test-bundle
  journal side-write of actual plaintext update bytes; require a native write and detected W marker.
- Run P0–P7 with synthetic inputs through actual Local, browser recovery, promotion/admission and
  selected Account owners. Hold journal-only/finalization/lost-reply points using explicit barriers.
  Observe active, locked and cold states; independently verify introduced content survives. Record
  exact known retry-capability locations separately; they are not public metadata or content factors.
- Add 24 recorded-seed variations after directed cases pass, retaining counterexamples and bounded
  timeout/heartbeat evidence. Passing means zero prohibited matches, complete mandatory coverage,
  effective controls and live/cold content recovery. No claimed general leak rate or broad key absence.
- Preserve synthetic evidence and source/runtime pins. Packaged UI/SW/export and migration/clear trials
  follow separately; filesystem profile/SQLite/WAL/deleted-byte scans and platform C13 remain later.
  This phase does not authorize personal-profile inspection, real enrollment, deployment or host VM work.

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
