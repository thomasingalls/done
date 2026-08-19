# done — Performance budget history

**Append-only.** One entry per measurement, oldest first. Numbers are never edited after the fact — a
re-measurement is a new entry. The budgets themselves live in **TRD §12** and are normative there; this
file records what was actually measured against them.

**Why this is checked in.** `scripts/check-budget.mjs` enforces the initial-JS budget on every build and
exits non-zero when it is exceeded, which is the right enforcement and the wrong memory: it prints a number
and forgets it. A threshold that is only ever compared against itself tells you that something broke, never
when or by how much. [sequencing.md](./sequencing.md) §3.1 makes the sharper version of the argument for
latency: Stage 1's encrypted store adds a key-store read, an unseal and per-record decryption to cold
start, so **without a recorded plaintext baseline a regression from encryption is both invisible and
unattributable**, and the budget conversation afterwards has nothing to argue from.

**The window closes at Stage 1.** Every plaintext number that is not recorded before the encrypted store
lands is a number that can never be taken again. **Six of the latency rows were taken before it closed**;
the rest measure things that do not exist yet and arrive with their features.

## How to record a measurement

Two harnesses, two commands. The bundle is below; latency has its own section and its own pair.

```bash
pnpm build
```

The build prints the initial-JS figure and fails if it exceeds the budget. To get an append-ready row for
this file instead of reading it off the build log:

```bash
pnpm budget --record
```

Paste the row into the table below, with the commit it was measured at. **Recording is deliberately
manual.** Appending on every build would write a row for each local rebuild and turn the history into
noise; what is worth recording is a measurement someone chose to take.

**A measurement without a commit is not a measurement.** The hash is what makes a number attributable,
which is the entire purpose of the file.

---

## Initial JS bundle — budget < 350 kB gzipped

Enforced build-failing by `scripts/check-budget.mjs`; the budget covers the entry module plus everything
the HTML preloads, and excludes lazily-loaded chunks by design.

| Date       | Commit    | Measured | Budget   | Headroom           | Store     | Note                                                                                                                             |
| ---------- | --------- | -------- | -------- | ------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-18 | `e4969a0` | 306.2 kB | 350.0 kB | 43.8 kB (87% used) | plaintext | **Baseline.** First recorded measurement. `pnpm build` on Node 26, one chunk, css 4.7 kB informational                           |
| 2026-08-18 | `c611666` | 306.3 kB | 350.0 kB | 43.7 kB (88% used) | plaintext | The latency harness's boot marks: `src/lib/marks.ts` and four call sites, about 100 bytes. Measured on the branch that adds them |

**Context for the baseline.** The Phase 2 decision record put `temporal-polyfill` at about 21 kB gzipped
of this total — an estimate carried forward rather than re-measured here, and it deletes itself when the
platform ships Temporal (`src/lib/temporal.ts` is the only file permitted to import it). The remaining
headroom is what Stage 1's cryptography and Stage 4's envelope layer have to fit inside.

---

## Latency budgets

**Seven of TRD §12's thirteen latency rows now have numbers.** The other six measure things that do not
exist yet — search, the key store, the envelope layer, the in-memory index — and they arrive with their
features, where their first measurement _is_ their baseline. **The journal write is the exception and has
its own section below**: it is the one row that gates a _selection_ rather than a feature, so it is measured
before the code exists, from the specification.

Run it, then turn the run into rows:

```bash
pnpm test:latency
```

```bash
pnpm latency:record
```

**It is not part of `pnpm check`, on purpose.** These are measurements, not assertions, and two of them
running at once measure the contention rather than the app — hence one worker, no parallelism and no
retries, since a retried measurement is a second sample silently reported as the first. Recording stays a
deliberate act, for the same reason `--record` is opt-in for the bundle.

### What the harness measures, and how

The method is written down because a baseline is only worth having if the run compared against it did the
same thing.

| Convention     | What it means                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Painted**    | One frame _plus a task_. `requestAnimationFrame` runs before the frame is committed, so the callback alone is too early; a task queued from inside it runs after the paint. This over-measures by whatever a `setTimeout(0)` costs, identically every time                                                                                                       |
| **Started**    | The browser's own event timestamp, never a clock on the test side. Timing a click from the driver would fold the CDP round trip into every number and attribute it to the app                                                                                                                                                                                    |
| **p95**        | Nearest-rank over 120 samples, so a reported p95 is always a sample that actually happened                                                                                                                                                                                                                                                                       |
| **Keystrokes** | One per 50 ms. Pressing keys as fast as the driver allows measures throughput under a firehose — it reports about 120 ms p95 in a plain textarea, which is a fact about the harness. "Keystroke → paint" is a per-keystroke latency and each keystroke needs its own frame                                                                                       |
| **The corpus** | 20 days × 15 cards and a 400-line master list: **650 update records, 283.9 kB on disk.** Fixed rather than realistic, so the encrypted run can reproduce it exactly. An earlier six-day version produced a 60 ms cold start, which sounds like good news and is useless — per-record decryption would vanish into the noise, and catching it is the entire point |
| **`android`**  | Pixel 7 emulation **plus a 4× CPU throttle**. Emulation on its own changes the viewport and the user agent and nothing else, so an unthrottled mobile project measures the development machine twice and reports it as two devices. 4× is Lighthouse's convention for a mid-tier phone, not a handset                                                            |

Four of the marks are emitted by the app itself (`src/lib/marks.ts`), because content-root load has no DOM
signal: `done:boot`, `done:store-open`, `done:content-root`, `done:store-ready`. **That seam is the one
Stage 1 extends** — the same marks will bracket a key-store read, an unseal and per-record decryption, so a
number that moves has one place to have moved. Everything else is observed from outside the app and costs
the bundle nothing.

### Measurements

| Date       | Commit    | Metric                                   | android      | desktop     | Budget          | Store     |
| ---------- | --------- | ---------------------------------------- | ------------ | ----------- | --------------- | --------- |
| 2026-08-18 | `c611666` | first run → Today editable               | 369.5 ms     | 131.3 ms    | —               | plaintext |
| 2026-08-18 | `c611666` | **cold start → Today editable**          | **235.4 ms** | **72.4 ms** | **< 2.5 s**     | plaintext |
| 2026-08-18 | `c611666` | warm start → Today editable              | 228.9 ms     | 69.2 ms     | < 1.0 s         | plaintext |
| 2026-08-18 | `c611666` | **content-root load (encoded state)**    | **54.3 ms**  | **10.2 ms** | **< 500 ms**    | plaintext |
| 2026-08-18 | `c611666` | boot: module graph evaluated             | 68.2 ms      | 29.5 ms     | —               | plaintext |
| 2026-08-18 | `c611666` | keystroke → paint, compose field         | 6.4 ms       | 5.0 ms      | < 16 ms p95     | plaintext |
| 2026-08-18 | `c611666` | keystroke → paint, card editor           | 9.9 ms       | 6.2 ms      | < 16 ms p95     | plaintext |
| 2026-08-18 | `c611666` | card focus → editable                    | 22.6 ms      | 8.1 ms      | < 50 ms         | plaintext |
| 2026-08-18 | `c611666` | day-to-day navigation, `goTo` (response) | 27.3 ms      | 8.4 ms      | < 100 ms        | plaintext |
| 2026-08-18 | `c611666` | day-to-day navigation, `goTo` (settled)  | 40.8 ms      | 23.3 ms     | < 100 ms        | plaintext |
| 2026-08-18 | `c611666` | day-to-day navigation, `step` (response) | 46.9 ms      | 5.2 ms      | < 100 ms        | plaintext |
| 2026-08-18 | `c611666` | day-to-day navigation, `step` (settled)  | 276.9 ms     | 288.7 ms    | n/a — see below | plaintext |

**A note on the commit.** `c611666` is the parent. These were taken on the branch that adds the harness,
against a working tree that also carried `src/lib/marks.ts` and its four call sites — about 100 bytes of
initial JS, which moved the bundle from 306.2 kB to 306.3 kB. **The hash wants correcting to the harness
commit when it lands**, because a measurement without a commit is not a measurement.

### What the numbers say

**Every budget with a harness is met, most of them by an order of magnitude.** The interesting content is
in the margins rather than the verdicts.

**Cold start has enormous headroom, and content-root load is where it will go.** 54.3 ms of a 500 ms budget
on the throttled profile, against 650 records. That row scaled roughly linearly with the corpus during
development — 166 records read in 10.5 ms, 650 in 54.3 ms on the same profile — which is exactly the
sensitivity the Stage 1 comparison needs, and exactly the row that absorbs per-record decryption.

**The `android` column is the one to read.** It is 3–5× the desktop figure on every start-up row, and the
gap is the throttle doing its job. Two rows are closer than they look on a slow device: `card focus →
editable` at 22.6 ms of 50 ms, and `day-to-day navigation` settled at 40.8 ms of 100 ms.

**Day-to-day navigation is two different paths, and TRD §12 has one row for them.** A peek, the menu and
`t` call `goTo`, which swaps the date immediately. A drag or Alt-Arrow calls `step`, which animates for
`SNAP_MS` — 220 ms in `src/ui/App.tsx` — and swaps the date underneath once the movement has landed. So
`step` settled is ~280 ms and **cannot be under 100 ms by construction**, while its response is 5–47 ms.
Both readings are recorded and only the unambiguous ones are asserted. **§12 does not say which path it
means, or whether "navigation" is the app responding or the day being in place.** That is a definition to
settle, not a budget to fail; asserting the settled `step` figure would be asserting `SNAP_MS`.

**Keystroke → paint is measured on two surfaces**, because the budget has one row and the app has two
paths: the compose field is a plain textarea with nothing to mount (PRD §4), and a card is CodeMirror with
the live-preview decoration path. The editor is the slower one and the sustained-typing surface, so it is
the number to watch; both are comfortably inside 16 ms even throttled.

### One journal record, and what encryption adds

**This is the only §12 row that gates a selection rather than a feature**, so it is measured before Stage 1
builds it — a number that arrives after the construction is chosen cannot influence the choice. The
benchmark therefore bundles the construction from row 2's specification rather than importing it from the
app, and **reproduces a published vector byte for byte before it measures anything**, because a benchmark of
the wrong construction produces numbers that look exactly like the right ones.

**Four cumulative levels, because the difference is the interesting quantity.** §12's row names the AEAD, but
what a keystroke waits for is the whole synchronous write, and today's journal already pays for base64 and a
`localStorage.setItem`. Batch means, taken on 2026-08-19 against `bd87655` plus this harness:

| Level                         | Payload | android      | desktop     |
| ----------------------------- | ------- | ------------ | ----------- |
| plaintext write, as today     | 18 B    | 9.4 µs       | 6.0 µs      |
| seal                          | 18 B    | 27.4 µs      | 7.6 µs      |
| seal + base64                 | 18 B    | 33.0 µs      | 9.2 µs      |
| **seal + base64 + `setItem`** | 18 B    | **48.2 µs**  | **12.2 µs** |
| plaintext write, as today     | 419 B   | 22.0 µs      | 8.7 µs      |
| seal                          | 419 B   | 38.9 µs      | 11.3 µs     |
| seal + base64                 | 419 B   | 54.1 µs      | 15.2 µs     |
| **seal + base64 + `setItem`** | 419 B   | **75.0 µs**  | **18.9 µs** |
| plaintext write, as today     | 4 kB    | 127.2 µs     | 30.7 µs     |
| seal                          | 4 kB    | 125.9 µs     | 29.1 µs     |
| seal + base64                 | 4 kB    | 230.2 µs     | 54.6 µs     |
| **seal + base64 + `setItem`** | 4 kB    | **266.1 µs** | **64.1 µs** |

**The budget holds by about twenty times at the common payload size**, on the throttled profile, against
`< 1 ms p95`. That is the headline and it is not the interesting part.

**Encryption doubles an 18-byte journal write on desktop and quintuples it throttled** — 6.0 → 12.2 µs, and
9.4 → 48.2 µs. The asymmetry is the finding: the AEAD is CPU-bound and a CPU throttle hits it in full, while
`setItem` is not and does not scale the same way. Anything that reasons about this cost from the desktop
figure alone will understate it on a phone by more than a factor of two.

**At 4 kB the AEAD is no longer the biggest term.** base64 costs 25.5 µs on desktop against the seal's 29.1,
and 104.3 µs throttled — so the row's name points at the term that stops dominating exactly where the budget
would start to matter. Stage 1 should not optimize the cipher first.

**Row 2's Node figure survives contact with the browser.** It recorded 7.8 µs for an 18-byte seal in Node on
this machine; Chrome gives 7.6 µs. So the two caveats row 2 raised against its own number — Node's
`Buffer.from().toString('base64')`, and V8-in-Node — turn out not to have mattered _for the seal_. They
matter one level up, which is why base64 is a level here rather than an assumption.

**How it is measured, and the two things that had to be fixed.** Batches are sized from a probe to a target
duration rather than fixed at a count: a fixed 100 quantized every result to a whole microsecond on a 100 µs
clock, which made two adjacent levels report the same number and let noise put them in the wrong order. And
the page is served cross-origin isolated, because Chrome coarsens `performance.now()` to 100 µs without it
and 5 µs with it, and a 12 µs write is invisible at the former. The spec asserts isolation rather than hoping
for it.

**The tail is recorded but is only attributable unthrottled, and that is what still wants a real device.**
CDP's CPU throttle stalls the thread rather than simulating a slower core, so its stalls land _inside_
individually-timed operations and become the tail. This is demonstrated rather than asserted: on the
throttled profile the plaintext level, which performs no cryptography at all, shows the same five-fold
tail-to-mean ratio as the sealed levels. **§12's budget is a p95 of one write**, so a throttled profile
cannot produce the statistic the budget names — an unthrottled handset is the only place that number is both
slow enough to matter and honest.

### Still absent

| Metric (TRD §12)                         | Budget                           | Why there is no number  |
| ---------------------------------------- | -------------------------------- | ----------------------- |
| Search results (10k items)               | < 150 ms                         | No search yet — Stage 3 |
| Key store open → `K_g` unsealed          | < 100 ms                         | No key store — Stage 1  |
| Envelope sign (async, off the edit path) | < 5 ms p95                       | Stage 4                 |
| Envelope verify on receipt               | < 2 ms p95                       | Stage 4                 |
| First-sync checkpoint verify             | < 1.5 s                          | Stage 4                 |
| In-memory index first build              | < 1.5 s, off the cold-start path | Stage 3                 |

**These are not waiting on the harness.** They arrive with their features, and their first measurement is
their baseline — which is the one thing the six rows above could not have said if they had been left until
Stage 1 had landed.

---

## When a budget is revised rather than met

TRD §12 calls these "build-failing thresholds, not aspirations", and §3.2 of
[sequencing.md](./sequencing.md) allows one alternative to meeting a budget: **a number the budget has been
consciously revised to.** A revision is a decision, so it goes in [decisions.md](./decisions.md) with the
measurement that forced it, and the TRD is updated — the revised figure is normative there, not here. This
file records that the measurement happened and what it said.

For cold start specifically, TRD §12 names the honest responses in advance: fewer stored records through
more aggressive trimming (§6.1), or a revised budget — **not moving verification onto a lazy path where it
silently stops happening.**
