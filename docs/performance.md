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
`localStorage.setItem`. Batch means, taken on 2026-08-19 against `66a7c6a` plus the device runner, with the
p95 of a single write in the last column — **that column is the budget's own statistic and only the Pixel 9a
supplies it honestly**, for the reason under the table:

| Level                         | Payload | desktop     | 4× throttle  | Pixel 9a      | 9a p95      |
| ----------------------------- | ------- | ----------- | ------------ | ------------- | ----------- |
| plaintext write, as today     | 18 B    | 5.9 µs      | 9.6 µs       | 4.9 µs        | 10 µs       |
| seal                          | 18 B    | 7.4 µs      | 26.4 µs      | 91.8 µs       | 120 µs      |
| seal + base64                 | 18 B    | 8.9 µs      | 29.9 µs      | 90.0 µs       | 125 µs      |
| **seal + base64 + `setItem`** | 18 B    | **12.8 µs** | **49.1 µs**  | **100.7 µs**  | **145 µs**  |
| plaintext write, as today     | 419 B   | 8.8 µs      | 21.6 µs      | 19.9 µs       | 30 µs       |
| seal                          | 419 B   | 10.5 µs     | 39.0 µs      | 203.0 µs      | 225 µs      |
| seal + base64                 | 419 B   | 13.9 µs     | 52.2 µs      | 220.8 µs      | 250 µs      |
| **seal + base64 + `setItem`** | 419 B   | **18.0 µs** | **72.4 µs**  | **235.5 µs**  | **295 µs**  |
| plaintext write, as today     | 4 kB    | 30.5 µs     | 125.9 µs     | 161.0 µs      | 175 µs      |
| seal                          | 4 kB    | 29.7 µs     | 120.0 µs     | 1275.6 µs     | 1515 µs     |
| seal + base64                 | 4 kB    | 53.6 µs     | 221.5 µs     | 1447.8 µs     | 1785 µs     |
| **seal + base64 + `setItem`** | 4 kB    | **63.8 µs** | **265.7 µs** | **1498.3 µs** | **1930 µs** |

**The budget is met at the payloads the journal actually sees and exceeded by about twice at 4 kB.** 145 µs and
295 µs against 1 ms at 18 and 419 bytes; **1 930 µs at 4 kB.** This is recorded as a Stage 1 defect rather than
as a budget revision — see [decisions.md](./decisions.md).

**Two runs, and the ordering was checked rather than assumed.** Every level reproduces within 1.4% across two
independent runs on the phone. Because sizes are measured smallest-first, the largest payload is also the
latest, so the device runner repeats the 18 B and 4 kB seals at the end: they came back 7% and 2% slower, well
inside the 15% threshold. **The 4 kB figure is a payload effect and not a warm phone.**

**The 4× CPU throttle was not conservative — it was wrong.** It predicted 265.7 µs at 4 kB against an actual
1 498.3 µs, understating by 5.6×, and it understates the common case by 2×. An emulated profile would have let
this breach ship. The reason is visible in the ratios: against desktop, the 9a runs the **cipher** 12×, 19×
and 43× slower as the payload grows, while the **base64-and-storage** path runs only 1.3×, 2.3× and 5.3×
slower. A phone is not uniformly N× slower, which is exactly what row 2's extrapolation assumed — the pure-JS
arithmetic degrades and the paths that reach native code do not.

**Why no faster path exists today.** The journal write is synchronous by construction, WebCrypto is async, so
there is no hardware-accelerated route to reach for. That is TRD §10.10's "one new primitive, and it is on the
crash path", now with a number against it.

**Row 2's Node figure survives contact with the browser.** It recorded 7.8 µs for an 18-byte seal in Node on
this machine; Chrome gives 7.4 µs. So the two caveats row 2 raised against its own number — Node's
`Buffer.from().toString('base64')`, and V8-in-Node — turn out not to have mattered _for the seal_. They matter
one level up, which is why base64 is a level here rather than an assumption.

**How it is measured, and the two things that had to be fixed.** Batches are sized from a probe to a target
duration rather than fixed at a count: a fixed 100 quantized every result to a whole microsecond on a 100 µs
clock, which made two adjacent levels report the same number and let noise put them in the wrong order. And
every runner serves the page cross-origin isolated, because Chrome coarsens `performance.now()` to 100 µs
without it and 5 µs with it, and a 12 µs write is invisible at the former. Both runners assert isolation rather
than hoping for it.

**The p95 column comes only from the phone, and that is structural.** CDP's CPU throttle stalls the thread
rather than simulating a slower core, so its stalls land _inside_ individually-timed operations and become the
tail — demonstrated rather than asserted, since on the throttled profile the plaintext level shows the same
five-fold tail inflation while performing no cryptography at all. So the throttled column is a mean and nothing
else, and §12's statistic needed hardware.

**Taking it needs no cable.** `node scripts/bench-journal-device.mjs` serves the same construction, from the
same module and the same constants as the Playwright suite, to any device that can reach a trustworthy origin —
`adb reverse`, or a Tailscale MagicDNS URL. Results post back into the same file.

### Which XChaCha20-Poly1305 implementation

**The 4 kB breach above had two candidate causes and they wanted different fixes.** Either pure-JS 32-bit
arithmetic is inherently slow on this hardware, or V8 on ARM handles one library's particular code shape
badly. The first needs a WASM dependency against 43.7 kB of bundle headroom; the second needs a different
import. A second pure-JS implementation is the cheap discriminator, and a WASM one is the ceiling.

**Every candidate reproduces row 2's published vector byte for byte before it is measured**, and the page
refuses to run if one does not — all of them are the same construction on the wire, so a swap would be an
implementation change with no format consequence, but that is a claim and the vector is what checks it.
Means on the Pixel 9a, 2026-08-19:

| Implementation                            | 18 B       | 419 B       | 4 kB        | vs noble at 4 kB |
| ----------------------------------------- | ---------- | ----------- | ----------- | ---------------- |
| `@noble/ciphers` (selected)               | 84.7 µs    | 190.6 µs    | 1 247.8 µs  | 1.00×            |
| `@stablelib/xchacha20poly1305`            | 62.3 µs    | 169.8 µs    | 1 237.5 µs  | **0.99×**        |
| **libsodium (WASM)**                      | **6.2 µs** | **11.3 µs** | **51.5 µs** | **0.04×**        |
| `@noble` ChaCha20-Poly1305, 12-byte nonce | 53.3 µs    | 166.0 µs    | 1 269.2 µs  | 1.02×            |

**The discriminator answered cleanly: it is not the library.** Two independent pure-JS implementations land
within 1% of each other at 4 kB. **Pure-JS arithmetic is the wall on this hardware**, so the cheap fix — swap
the import — does not exist.

**WASM buys 24× at 4 kB**, 14× at the common case, and would resolve the breach with room:

| Payload | full write today | with a WASM seal | margin |
| ------- | ---------------- | ---------------- | ------ |
| 18 B    | 101 µs           | **15 µs**        | 66×    |
| 419 B   | 235 µs           | **44 µs**        | 23×    |
| 4 kB    | 1 498 µs         | **274 µs**       | 3.6×   |

**The fix that works is not the fix that is available.** libsodium is 550 kB unpacked against 43.7 kB of
headroom, so it cannot ship — it is here as a ceiling, to price the option before anyone builds a small
module. What it establishes is that the ceiling is high enough to be worth the work.

**Its instantiation cost is 37 ms from bundle evaluation to callable**, measured from the module rather than
from the `await`, since an earlier version timed the await and reported 0.0 ms — true, useless, and hiding
the number that matters. **That window is one in which a crash journal cannot seal**, which is why an inlined
module compiled synchronously is the only shape worth considering (TRD §12). 37 ms is libsodium's whole
library; a minimal module would be far less.

**One result vindicates a selection rather than questioning it.** The 12-byte-nonce reference costs 0.63× at
18 B and **1.02× at 4 kB**, so XChaCha's extra HChaCha20 block is about a third of a small seal and nothing at
all where the budget actually breaks. Row 2 chose the 24-byte nonce on grounds that had nothing to do with
speed, and it turns out to cost nothing where speed matters.

### What a WASM seal would cost the bundle

**Measured rather than estimated, because the 550 kB figure quoted above is unpacked size and the budget
counts gzipped bytes.** Bundled with a single function imported, so the tree-shaker has every chance:

|                                        | minified | gzipped      | against 43.7 kB of headroom     |
| -------------------------------------- | -------- | ------------ | ------------------------------- |
| `@noble/ciphers` (selected today)      | 15.2 kB  | **5.1 kB**   | fits, and is what ships now     |
| libsodium-wrappers                     | 447.4 kB | **149.2 kB** | **3.4× the entire headroom**    |
| A Rust-compiled wasm ChaCha20-Poly1305 | 49.9 kB  | **17.5 kB**  | fits                            |
| …the same, base64-inlined              | 63.2 kB  | **24.3 kB**  | **fits, with 19.4 kB to spare** |

**A libsodium subset build is not the way through.** 149.2 kB is already its _standard_ build rather than the
sumo one, so the reduction has been applied; going further needs an emscripten toolchain, and emscripten's
runtime glue is a fixed cost that does not obviously fall under 43.7 kB. libsodium priced the option and is
not the option.

**A purpose-built module does fit, and the inlined figure is the one that matters.** Synchronous compilation
needs the bytes present rather than fetched (§12), which means base64 in the bundle and a third more raw size —
and it still lands at 24.3 kB, a little over half the headroom. **The 17.5 kB row is measured from an
off-the-shelf package that is not itself adoptable**: it exposes only the 12-byte-nonce construction, where row
2 selected the 24-byte nonce and the width is load-bearing. It is a proxy for what the category weighs, not a
candidate.

**Which changes the shape of the remaining objection rather than removing it.** The concern was that a small
module means shipping a hand-rolled primitive, against §13.10's criterion of _reviewed and widely implemented_.
But the RustCrypto `chacha20poly1305` crate is audited and carries `XChaCha20Poly1305`, and `rustc`, `cargo`
and `wasm-pack` are already on the development machine — so the question is whether compiling a reviewed
implementation through a second toolchain satisfies that criterion, which is a question for review 3a rather
than a fact this file can settle. **Nothing here has been built; these are sizes, not a working seal.**

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
