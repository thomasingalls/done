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

## Active slice: Stage 0 — select, measure, book

**Status:** not started · **Plan:** [sequencing.md](./sequencing.md) §3.1 · **Updated:** 2026-08-18

Three bodies of work, none of which is application code, all of which get more expensive the later they
start. Stage 1 cannot begin without the first; the third is calendar time that working harder does not
compress.

### 1. Select TRD §15's storage-review scope — not started

What Stage 1 cannot begin without. TRD §15 rows 1–3, each needing a construction and test vectors rather
than an intention.

- **Row 1 — the algorithm suite.** not started
- **Row 2 — the synchronous journal AEAD and its nonce discipline.** not started
  - **This is the one to spend real thought on.** A counter-based nonce whose last value was not durably
    recorded can repeat after exactly the crash the journal exists to survive.
  - It is the only new primitive in the plan (TRD §10.10), and it ships in Stage 1.
- **Row 3 — the encrypted record format.** not started

_Exit: rows 1–3 selected, with test vectors._

### 2. Draft TRD §15's protocol-review scope — not started

Rows 4–12, 15–17, 20, and the network-facing part of 14. **Blocks nothing in this stage**, and is what the
reviewer needs in order to be booked at all.

### 3. Build a latency harness and take the plaintext baseline — not started

Today `scripts/check-budget.mjs` enforces initial JS and nothing else. Keystroke → paint, cold start, warm
start and content-root load have no harness.

- **Harness for TRD §12's latency rows.** not started
- **Record the baseline while the store is still plaintext.** not started
  - The window closes at Stage 1. Cold start will absorb a key-store read, an unseal and per-record
    decryption; without a before-number the regression is invisible and unattributable.
  - Numbers land in [performance.md](./performance.md), which is seeded with the one row that has a
    harness today.

_Exit: a latency harness with recorded plaintext numbers._

### 4. Book both design reviews — not started

**Lead time is the constraint, not readiness.** Two engagements, different scopes, different deadlines.

- **Review 3a — storage and journal.** not started. Answered before **Stage 2**. Can be booked now and run
  while Stage 1 is implemented.
- **Review 3b — protocol.** not started. Answered before **Stage 4**.

_Exit: both reviewers engaged, with the storage review's date inside Stage 1._

---

### Open, and gating a later stage

**§5.4 — what happens to attribution at the cutover.** Open. It gates **Stage 2** and neither review, so it
does not block anything in this slice — but it is the one item that can be decided at any time and will
otherwise be discovered at the cutover instead. Recorded as TRD §15 row 21 and PRD §11 question 10.

### The early warning signs for this slice

From [sequencing.md](./sequencing.md) §7 — the things that say it is going wrong before the exit criteria do:

- TRD §15 rows are being answered with "the TRD will decide" rather than a construction and a test vector.
- The latency harness is being deferred to "when we need it".
- Review 3a has not been booked because Stage 1 "isn't waiting on it". It is not — **Stage 2 is**, and by
  then the lead time is unrecoverable.
