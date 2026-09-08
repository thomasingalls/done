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

## Active slice: Stage 1 — corrected encrypted-store implementation (`L-1`)

```yaml
gate: L-1
seat: /Users/thomasingalls/.codex/worktrees/c030/done
branch: codex/encrypted-store-contract-corrections
status: in flight # exact content compaction complete; legacy cutover and acceptance remain
plan: [sequencing.md §3.2, action-tree.md L-1, storage-conformance.md, content-trim.md]
prerequisites: corrected SC-01–09; historical S0-10 closure covers represented cases only
debts: consult docs/review/remediation/debts.json # component evidence does not pay whole obligations
updated: 2026-09-08
```

**Just completed.** Phase ten is committed as `d7c0f32`. Phase eleven adds [exact-coverage content
compaction](./content-trim.md) to the journal-capable session under its shared lifetime. It merges
validated authenticated disk updates, including unresolved structs/deletion sets, publishes a reserved
state and rechecks the exact current census in the deleting transaction. Only initially covered content
identities/bytes are removed. Journal, heads/outbound, late records, concurrent replacements, reservation
history and opener references survive. Known damage refuses the whole trim and closes ordinary use;
interruptions leave safe original/replacement carriers for a fresh invocation. This checkpoint is
uncommitted; default-app routing and application-day archival remain unchanged.

**Evidence.** [Recorded compaction execution](./storage-conformance-runs/2026-09-08-content-trim.md) passes
21 browser cases/128 assertions and detects eight mutants. Delayed reservation 2 survives the state-4
replacement of 1/3; concurrent compactors retain both snapshots. Exact byte replacement after audit,
new unreadable records, final journal checks, native aborts, three renderer deaths and lifetime/generation
fencing pass. Content regression passes 13/58/five mutants; journal 17/93/six; custody 13/73/five;
admission 15/64/six; Local clear 17/172/five; genesis 17/160/four; startup 15/96/three. Full Vitest passes
679 tests/55 files; applicable build/project checks pass. The record distinguishes the initial missing-row
mutant harness error and corrected intermediate unit assertions from the final successful executions.
No supported-population, memory/latency, forensic-erasure or independent-review claim follows.

**Next bounded integration.** Legacy migration/cutover preparation: explicit source inventory and authority,
old-writer fencing, a fresh encrypted key/counter scope, and seeded interruption schedules before any
default-app routing switch. Existing legacy material must not be reclassified as fresh, and imported data
must not restore writable keys or counters. Automatic maintenance scheduling and large-state chunking
remain additional work. Sequencing §3.2 items 3–6 remain one integrated landing unit developed in reviewable
checkpoints; these component passes do not authorize real-data cutover.

**Preparation/acceptance gate.** Workspace history retains deleted runtime content with gc:false and
copies Yjs Item.redone/delete-set state through version-sensitive internals, adding a second full clone.
History is runtime-only; no memory bound, zeroization or low-end input-to-paint budget pass is claimed.
Large structural/bulk/undo/deletion output still faces the 16 KiB guard and needs general bounded adapters.
Compaction reads/merges the full disk union in memory; its 4 MiB output bound does not bound input memory.
Native IME/preedit and complete interaction performance remain gates before default editor acceptance.

**Existing evidence.** Corrected contracts: `f87997d`; shared harness/lifecycle: `ccfcbf0`; mandatory-factor
custody: `a6d39a2`; content: `468cbe2`; synchronous journal: `9e60c6a`; admission/Goals editor: `0b5337a`;
workspace commands/history: `a48c090`; owned startup: `a916d61`; Local genesis/index: `ee60528`;
scoped Local clear: `d7c0f32`. The [shared candidate run](./storage-conformance-runs/2026-09-08.md) contains
57 candidate subcases; all three pinned candidates fail the corrected contract and none is merged.
Disk-union merge is now implemented with exact identity-and-byte deletion, without adopting a range watermark.

**Completion blockers.** L-1 still owes integrated genesis/index/clear/default-application conformance and
seeded legacy cutover kills. Scoped Local clear handles only the first completed active workspace;
shared/multiple-workspace custody, Account removal/service revocation, partial-genesis cleanup and explicit
cleared-slot reuse need subsequent owners. Additional Local workspaces, Account verifier/receive/checkpoint
authority and PRF remain incomplete. L-3 composes generation/custody references, lifetimes and interrupted
phases; these components do not implement retirement. L-4 carries independent storage/crypto review,
supported profiles/authenticators, low-end performance and platform acceptance. Only matrix evidence and
three pins advance; obligations/debt statuses are unchanged. No checkpoint pays old-writer cutover/release.

**Scope.** This seat owns L-1 implementation/evidence. The independent L-2 record below is unchanged.
The author's real-data cutover remains Stage 2 after carrier selection and review 3a. Historical Stage 0
records do not certify states their models omitted.

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
