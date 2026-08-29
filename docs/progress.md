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
the shape of the work. What is _not_ allowed is a second top-level slice: two active slices means the file
has stopped answering the question it exists to answer, and one of them is really next-up.

**Status vocabulary**, deliberately small: **not started** · **in flight** · **done** · **blocked** (which
must name what it is blocked on).

**Being wrong here is cheap.** This file is allowed to lag by a day. It is not allowed to describe a slice
that is no longer active.

---

## Active slice: Stage 1 — the encrypted local store and legacy cutover (`L-1`)

**Status:** in flight — the contract pass landed; the store-handle refactor is next ·
**Plan:** [sequencing.md](./sequencing.md) §3.2 ·
[action-tree.md](./review/remediation/action-tree.md) `L-1` · **Updated:** 2026-08-29

**Stage 0 closed 2026-08-29** on the corrected evidence at the recorded independence bar — author-independent
seven times, family-independent once, human-independent never. The entry is in
[completed.md](./completed.md); the bar's one home is
[`docs/review/remediation/S0-10/README.md`](./review/remediation/S0-10/README.md). Reviews 3a/3b remain
booked, not results; proceeding on the machine-adversarial bar was an explicit decision, recorded rather
than waived.

**What this slice is.** The production encrypted local store — store/key/journal adapters, startup, load,
trim, clear — and the old-origin plaintext cutover **as machinery**: export, import, active-store selection,
deletion, restart, as one resumable transaction, with its kill matrix executed against a seeded legacy
installation. The write-admission machine, the storage scheduler, and the §6.1 boundary tests it must
satisfy are Stage 0 artifacts, already in the gate.

**The live cutover is not this slice.** Building the state machine and running the one-way move on the
author's real development data are separate acts, and only the first is `L-1`'s. The second is Stage 2
([sequencing.md](./sequencing.md) §3.3), which waits on TRD §15 row 21's carrier choice (§5.4) and on review
3a's answer — 3a gates cutover, not Stage 1 (§5.2). The boundary is stated once, at
[action-tree.md](./review/remediation/action-tree.md) `L-1`'s scope-boundary bullet.

**It arrives against one registered debt.** The executed cutover kill matrix, with a residue scan at every
kill point — `node scripts/check-debts.mjs --gate L-1` names it, and design prose is refused as payment
(`docs/review/remediation/debts.json`). The entry's terminal-state rule is the finding's own validation
procedure: each kill's restart reaches a verified pre-cutover state with the legacy carrier preserved, or one
verified encrypted post-cutover state, and plaintext is absent from every carrier once cutover completes —
preserved plaintext *before* completion is the allowed recoverable state, not a residue failure. Nothing else
blocks starting.

**Not in this slice.** The live Stage 2 cutover, above. `L-2`–`L-4` — services, lifecycle execution, and the
platform/toolchain/external review gates, four more registered debts among them — and `H-1`'s append-only
historical ledger corrections (`docs/decisions.md`'s stale *eighteen rows are selected* belongs there).
`R3-4` (member-entry uniqueness, low) is owed to `S0-2`'s homes before `L-2` implements its verifier, not
here. The X25519 observation in TRD §10.11 expires 2027-02-28; the gate that consumes it refuses it from
that day.

**Running alongside, not blocking.** Review 3a's updated input pack is owed — `action-tree.md`'s external-review
coordination puts it after `S0-8`, which closed 2026-08-29, and it has not been produced. It does not block
Stage 1 and it does block Stage 2, which is exactly the failure [sequencing.md](./sequencing.md) §7 names for
this stage: *Review 3a has not been booked because Stage 1 "isn't waiting on it". It is not — Stage 2 is.*
