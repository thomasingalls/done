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

**Status:** in flight · **Plan:** [sequencing.md](./sequencing.md) §3.1 · **Updated:** 2026-08-18

Three bodies of work, almost none of which is application code, all of which get more expensive the later
they start. Stage 1 cannot begin without the first; the last is calendar time that working harder does not
compress. (The harness turned out to need four boot marks in the app — the one exception, and about 100
bytes of it.)

### 1. Select TRD §15's storage-review scope — in flight

What Stage 1 cannot begin without, and now also what review 3a reads in the week of **2026-08-24** (item 4).
Each row needs a construction and test vectors rather than an intention. Selections live in
[selections/](./selections/), one file per row.

- **Row 1 — the algorithm suite.** not started
- **Row 2 — the synchronous journal AEAD and its nonce discipline.** in flight — construction proposed with
  vectors, in [selections/row-2-journal-aead.md](./selections/row-2-journal-aead.md).
  - **XChaCha20-Poly1305; 24 random bytes per record; no counter, no durable state.** The width is the
    point: a 96-bit nonce would also hold at this journal's volumes, and that is the objection to it — the
    guarantee would become a claim about application behaviour that a later change can silently invalidate,
    and nonce-reuse faults are retroactive and silent.
  - **The vectors prove themselves.** `test/vectors/journal-aead.json` — the draft-irtf-cfrg-xchacha §A.3.1
    KAT, four composition vectors, six negatives. The generator round-trips every vector and asserts every
    negative fails, on each run, so a "must fail" list cannot quietly stop failing.
  - **Two things before it closes.** The `< 1 ms p95` budget is specified on a **low-end device** and has
    only been measured on a Mac — 7.8 µs p95 at the 18-byte common case, so about 128× of margin, which is a
    strong prior and not the measurement. And it is not yet folded into the TRD.
- **Row 3 — the encrypted record format.** not started
- **Row 13 — device-lock derivation, enrollment migration and copy**, and the storage-facing part of
  **row 14** — recovery-code entropy, generation, step-up authentication. not started. **In review 3a's
  scope but not in Stage 1's path**, so until now nothing put a date on them.

_Exit: rows 1–3 selected, with test vectors._ **The review's scope is the wider one** (TRD §15): 13 and the
storage-facing half of 14 have to be closed by the 24th as well, even though Stage 1 does not wait on them.

### 2. Draft TRD §15's protocol-review scope — not started

Rows 4–12, 15–17, 20, and the network-facing part of 14. **Blocks nothing in this stage**, and is what the
reviewer needs in order to be booked at all.

### 3. Build a latency harness and take the plaintext baseline — done

- **Harness for TRD §12's latency rows.** done. `pnpm test:latency` (`test/latency/`,
  `playwright.latency.config.ts`), with `pnpm latency:record` for append-ready rows. Two profiles: desktop,
  and a Pixel 7 under a 4× CPU throttle — emulation alone changes the viewport and the user agent and
  nothing else, so an unthrottled mobile project measures the development machine twice.
- **Record the baseline while the store is still plaintext.** done. **Six of TRD §12's thirteen latency
  rows now have numbers**, in [performance.md](./performance.md). The other seven measure things that do
  not exist yet and arrive with their features.
- **Four boot marks in the app** (`src/lib/marks.ts`), for the one row with no DOM signal — content-root
  load. **That seam is what Stage 1 extends**: the same marks will bracket a key-store read, an unseal and
  per-record decryption. About 100 bytes of initial JS; the bundle went 306.2 → 306.3 kB.

_Exit: a latency harness with recorded plaintext numbers._ **Met.**

**Two things it turned up that are not measurements.**

- **TRD §12's day-to-day navigation row is one row over two paths.** `goTo` (a peek, the menu, `t`) swaps
  the date immediately; `step` (a drag, Alt-Arrow) animates for `SNAP_MS` — 220 ms — and swaps underneath
  once it lands, so its settled figure **cannot be under 100 ms by construction**. §12 does not say which
  path it means, or whether "navigation" is the app responding or the day being in place. A definition to
  settle, not a budget to fail.
- **Headroom is large but not uniform.** On the throttled profile `card focus → editable` is 22.6 ms of
  50 ms and navigation settled is 40.8 ms of 100 ms, against a cold start using 9% of its budget.

### 4. Book both design reviews — in flight

**Lead time is the constraint, not readiness.** Two engagements, different scopes, different deadlines.

- **Review 3a — storage and journal.** **Booked for the week of 2026-08-24.** Answered before **Stage 2**.
- **Review 3b — protocol.** not started. Answered before **Stage 4**.

**Booking 3a dated item 1; it did not clear an item.** TRD §13.11 holds each review until its own scope is
closed, because booking a review of architecture alone buys an opinion about a sketch. So the 24th is now
the deadline on rows 1, 2, 3, 13 and the storage-facing part of 14 — none of which is started.

_Exit: both reviewers engaged, with the storage review's date inside Stage 1._ **Half met.** As booked, 3a
runs before Stage 1 rather than beside it, which is early rather than late and costs only that the reviewer
reads a specification — the shape [sequencing.md](./sequencing.md) §8 already flags as an assumption.

---

### Open, and gating a later stage

**§5.4 — what happens to attribution at the cutover.** Open. It gates **Stage 2** and neither review, so it
does not block anything in this slice — but it is the one item that can be decided at any time and will
otherwise be discovered at the cutover instead. Recorded as TRD §15 row 21 and PRD §11 question 10.

### The early warning signs for this slice

From [sequencing.md](./sequencing.md) §7 — the things that say it is going wrong before the exit criteria do:

- TRD §15 rows are being answered with "the TRD will decide" rather than a construction and a test vector.
- ~~The latency harness is being deferred to "when we need it".~~ **Closed** — the harness exists and the
  plaintext numbers are recorded.
- ~~Review 3a has not been booked because Stage 1 "isn't waiting on it".~~ **Closed** — booked for the week
  of 2026-08-24. What replaces it is the sign above, now with a date: the 24th arrives and rows 1–3 are
  answered as intentions rather than as constructions with test vectors.
