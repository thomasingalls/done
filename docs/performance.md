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
lands is a number that can never be taken again. **Six of the latency rows were taken before it closed.**

**The seventh did not need the window and could not have used it.** The journal write measures a
construction the app does not contain, from its specification, because it gates a _selection_ rather than a
feature — a number that arrives after the construction is chosen cannot influence the choice. It is the only
row here taken that way, and it is the one that found a budget exceeded. The remaining six measure things
that do not exist yet and arrive with their features.

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
295 µs against 1 ms at 18 and 419 bytes; **1 930 µs at 4 kB.** This was recorded as a Stage 1 defect rather than
as a budget revision — see [decisions.md](./decisions.md). **It has since been resolved by a built and measured
WASM seal**, and the numbers are below; this table is left as the baseline the fix is measured against.

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

**All of the above is superseded by a built module, and the size estimate was wrong by 6×.** The proxy weighed a
package exposing only the 12-byte-nonce construction; the real 24-byte-nonce module, compiled purpose-made without
wasm-bindgen, is **6 465 bytes raw**. What follows measures it rather than estimating it.

---

### The WASM seal, built and measured

**Date:** 2026-08-19 · **Commit:** `9b49b74` · Crate: `wasm/journal-seal`, pinned
`chacha20poly1305` 0.10.1 / `chacha20` 0.9.1 / `poly1305` 0.8.0.

`no_std`, no allocator, no wasm-bindgen, fixed static buffers, one exported `seal`. It is checked against
draft-irtf-cfrg-xchacha-03 §A.3.1 and all four of row 2's composition vectors by `pnpm wasm:verify`, which runs
inside `pnpm check` — and it verifies the **generated module** rather than the crate's `target/` artifact, so the
thing checked is the thing that ships and no Rust toolchain is needed to check it.

#### The budget row

Journal write on a Pixel 9a, p95 of 4 000 single writes, against §12's 1 ms. Both columns come from the same
device session, so this is a paired comparison rather than two measurements:

| Payload  | JS today (`@noble`) | **WASM seal** | Speed-up | Against the budget |
| -------- | ------------------- | ------------- | -------- | ------------------ |
| 18 B     | 145 µs              | **35 µs**     | 4.1×     | 28.6× margin       |
| 419 B    | 295 µs              | **65 µs**     | 4.5×     | 15.4× margin       |
| **4 kB** | **1 915 µs** ✗      | **240 µs** ✓  | **8.0×** | **4.2× margin**    |

**The JS baseline reproduces the recorded breach to 0.8%** — 1 915 µs here against the 1 930 µs above — so this is
the same measurement re-taken, not a rerun that drifted. **The breach is closed at every payload measured.**

#### Which implementation, second run

Means on the Pixel 9a, same session. Every comparable candidate reproduces row 2's published vector before it is
measured, and the page refuses to run if one does not:

| Implementation                            | 18 B       | 419 B      | 4 kB        | vs noble   | Instantiation           |
| ----------------------------------------- | ---------- | ---------- | ----------- | ---------- | ----------------------- |
| `@noble/ciphers` (ships today)            | 86.3 µs    | 195.7 µs   | 1 258.1 µs  | 1.00×      | —                       |
| `@stablelib/xchacha20poly1305`            | 61.8 µs    | 169.4 µs   | 1 235.4 µs  | 1.02×      | —                       |
| libsodium (WASM)                          | 6.2 µs     | 11.3 µs    | 51.8 µs     | 24.27×     | 36.4 ms, **awaited**    |
| **`journal-seal` (Rust wasm, inlined)**   | **4.4 µs** | **9.6 µs** | **45.3 µs** | **27.79×** | **1.5 ms, synchronous** |
| `@noble` ChaCha20-Poly1305, 12-byte nonce | 53.8 µs    | 165.6 µs   | 1 274.6 µs  | 0.99×      | —                       |

**It beats the ceiling.** libsodium was measured to price what any WASM cipher could buy; the purpose-built module
is faster than it — 45.3 µs against 51.8 — at **1/34th of the bundle cost**.

**The two instantiation figures are different in kind, and the difference is the point.** libsodium's 36.4 ms is a
window in which the bundle has evaluated and the journal cannot seal. The 1.5 ms here is not a window at all: it is
paid synchronously inside bundle evaluation, so there is no interval in which the app can accept an edit that the
journal cannot write.

#### What it costs the bundle, measured through the bundler

Same method as the estimates above — one entry importing a single sealing function, minified, then gzipped:

| Implementation                          | minified   | gzipped    | against 43.7 kB of headroom                        |
| --------------------------------------- | ---------- | ---------- | -------------------------------------------------- |
| `@noble/ciphers` (ships today)          | 15.5 kB    | 5.2 kB     | fits                                               |
| `@stablelib/xchacha20poly1305`          | 17.7 kB    | 4.7 kB     | fits                                               |
| libsodium-wrappers                      | 458.2 kB   | 152.8 kB   | 3.5× the entire headroom                           |
| **`journal-seal` (Rust wasm, inlined)** | **9.4 kB** | **4.5 kB** | **fits, and is 0.7 kB less than what it replaces** |

**Adopting it reduces the bundle**, which is the result nobody predicted: the WASM question was framed throughout
as buying speed with bytes, and at 4.5 kB against `@noble`'s 5.2 kB there is no trade to make. The `@noble` and
libsodium rows reproduce the earlier measurement within a few percent, which is what says the method is the same.

**The initial-JS row in this file does not move yet**, because nothing in `src/` imports the module — the journal is
Stage 1's to build. The table above is what that integration will cost, and it is negative.

#### Two things that were asserted and are now checked

**§12 says compilation has a synchronous form. It does, with three orders of magnitude to spare.** This was worth
checking rather than trusting, because a cap on synchronous main-thread compilation would have invalidated the
argument entirely. **Chromium's cap is 8 MB**, reported by its own `RangeError`; the module is 6 465 bytes.
Synchronous instantiation succeeds and reproduces the published KAT in **Chromium (0.9 ms), Firefox (3.0 ms) and
WebKit (2.0 ms)**.

**`opt-level` was the whole difference, and optimising for size was spending the wrong currency.** The first build
used `opt-level = "z"` and reached only 1.17× over `@noble`. Sweeping the setting showed size barely responds while
speed doubles, so the crate is built at `opt-level = 3` with `+simd128`:

| Build               | raw wasm    | gzipped     | 4 kB seal (Node) |
| ------------------- | ----------- | ----------- | ---------------- |
| `opt-level = "z"`   | 5 247 B     | 2 451 B     | 20.7 µs          |
| `opt-level = "s"`   | 5 257 B     | 2 709 B     | 12.9 µs          |
| `opt-level = 2`     | 6 595 B     | 3 037 B     | 11.7 µs          |
| `opt-level = 3`     | 6 903 B     | 3 146 B     | 11.7 µs          |
| **`3` + `simd128`** | **6 465 B** | **3 076 B** | **10.1 µs**      |

**`+simd128` is a support-floor commitment rather than an optimisation**, because a module compiled with it fails
to instantiate where SIMD is absent instead of running slowly. It is inside the floor §10.11 already states: wasm
SIMD is Baseline from Safari 16.4, where that floor's binding constraint is Ed25519 at Safari 17.0. Verified
rather than assumed — 73 SIMD-prefix bytes emitted against 1 without the flag, and all three engines instantiate it.

#### What the numbers say next

**The cipher has stopped being the dominant term, exactly as predicted.** At 4 kB the full write is 240 µs p95 of
which the seal is 70 µs, so base64 and `setItem` are now roughly 170 µs — **more than twice the cryptography.** The
earlier run called this inversion while the cipher still dominated; it is now the measured state, and further work
against this budget is base64 work rather than crypto work.

**The projection was slightly conservative, which is worth more than if it had been exact.** 274 µs was projected
for the 4 kB write from libsodium's ceiling; the actual is 240 µs p95. The reasoning that produced the estimate was
sound, which is the part that generalizes.

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


## 2026-09-14 — Current Local application latency integration (budget gate failed)

The source was based on signed `d8b8e00e` plus the reversible source patch and source pins in the
[retained execution packet](./account-conformance-runs/2026-09-14-browser-application-latency/README.md).
This is a dirty-source bounded validation run, not an immutable release qualification. All 12 project/cases
executed without skips or retries; all 30 measurements survive in the packet. The two project teardowns
fail because of three collected timing overruns. These failures are not treated as passing tests.

Both projects admitted 300 cards across 20 days and 400 Goals lines through the real Local UI, drained,
cold-reopened and verified the whole corpus. Mandatory factor entry is automated setup, excluded from
application latency: launch-to-prompt and confirmation-to-editor are recorded separately. The cold/warm
budgets apply to their sums. The new encrypted load/replay marks measure the factor-unlocked admission
carrier read/decryption and journal-inclusive Yjs replay plus owner initialization, not the old plaintext
marks. Missing marks now fail instead of supplying zero. The storage census reports encrypted payload
bytes and journal UTF-8 bytes, not physical disk allocation.

| Measurement (ms) | Desktop | Android emulation, CPU 4x | Bound |
| --- | ---: | ---: | ---: |
| Cold application work, excluding factor entry | 254.2 | 817.3 | <2500 |
| Warm application work, excluding factor entry | 229.0 | 737.2 | <1000 |
| Encrypted load and replay | 6.4 | 27.5 | <500 |
| Compose typing p95, 120 keystrokes | 2.5 | 11.1 | <16 |
| Card editor typing p95, 120 keystrokes | **18.3** | **84.2** | **<16 — failed** |
| Card focus to editable | 7.4 | **61.4** | **<50 — Android failed** |
| Peek navigation response / settled | 7.8 / 23.3 | 40.8 / 55.2 | <100 each |
| Keyboard navigation response | 0.7 | 26.7 | <100 |

Rounded display only; retained rows contain the original precision and actual viewport/CPU notes.
Seeded editor work uses a 1280×900 viewport. This is host/emulator evidence, not a handset measurement.
The keyboard transition's chosen animation is recorded separately and has no <100 ms settled assertion.
No numeric budget or test deadline was raised. Timing failures are delayed until project teardown to keep
later observations; functional failures remain immediate. The adapter independently enforces the same
nine numeric predicates and rejects threshold equality, omitted metrics and malformed measurements.

The earlier run is also retained: desktop card typing measured 16.7 ms, and the Android fixture timed out
before seeding because its Lock button was in a closed off-screen menu. That helper now opens the menu
normally. This correction explains the setup timeout, not the measured typing overruns. Timer calibration,
frame scheduling and editor/admission profiling are the next bounded investigation; the cause and a
performance repair are not established by this packet. The historical plaintext baselines remain unchanged.


## 2026-09-14 — Local latency diagnostic pilot (`dbc64150` application)

This separate pilot completes measurement calibration and CPU profiling; it does not repair or
pass the preceding application latency gate. [Prospective protocol](./latency-diagnosis.md) and
[retained evidence](./account-conformance-runs/2026-09-14-application-latency-diagnosis/README.md).
The application source and original nine budgets are unchanged. Two reverse-order blocks each
contain 120 trusted keys at 50 ms gaps. Both projects use 1280×900 and the same UI-seeded,
cold-verified 300-card/400-line corpus. CPU 4x remains emulation on this host, not a handset.

| Surface p95, ms | Desktop block 1 / 2 | CPU-4x Android block 1 / 2 |
| --- | --- | --- |
| Plain textarea | 1.6 / 1.4 | 7.0 / 6.0 |
| Bare CodeMirror | 1.9 / 15.5 | 8.6 / 19.0 |
| Admitted card | 17.2 / 18.3 | 92.9 / 93.7 |

All 1,440 raw timing samples and 12 aggregate rows are retained. The recorder is unchanged;
its frame-plus-task timestamp is a paint proxy, not proof of presentation of the particular
character. CodeMirror block variability makes scheduler/JIT/GC effects a live limitation.
These dependent samples do not support independent-sample confidence intervals or subtraction
of control p95 from card p95. Card text and history accumulate across blocks.

Separate CPU profiles cover 60 further card keys and ten focus/close cycles per project.
Sampling uses 1,000 µs intervals, and retains raw samples and mapped call locations. Typing
profiles attribute 647.2 / 3,106.6 ms inclusive to `prepareIntent`, including
371.3 / 1,775.5 ms in `forkWorkspaceHistory`; `sameDocState` projection verification accounts
for 237.1 / 1,104.3 ms, desktop / Android. The nested inclusive times overlap and must not be
added. These are sampled aggregates across the profiled workload, not per-key quantiles, exact
CPU timings or estimated causal speedups. Focus profiles place the largest identified application
stack at mounting the admitted editor (23.0 / 105.5 ms across ten cycles), but include closing,
automation waits and profiler overhead; this does not establish the cause of the prior focus tail.

The evidence supports targeting private document/history copying and projection verification
first. Preserve journal-before-publication, refusal isolation, undo and pending-dependency checks;
validate any optimization semantically and against the unchanged application gate. Further recorder
calibration and focus profiling remain separate.

The first diagnostic attempt was cancelled after inspecting only the owned disposable browser:
the app service worker intercepted the control URL and returned the unlock page. That attempt,
its exact source patch and drained-process receipt are retained. Controls now use their own
disposable context with service workers blocked, a dedicated asset prefix, and explicit title/input
assertions. The application context retains its normal service worker. The completed run has
four passed cases, no skips/retries, and preserves all added writing through lock and cold reopen.
The two native runner controls also pass. No personal browser, app package or deployment changed.


## 2026-09-14 — F-17 complete comparison repair (application budget still failed)

This bounded repair is based on signed `5ffce895`; its [construction](./f17-comparison.md) and
[retained evidence](./account-conformance-runs/2026-09-14-f17-comparison/README.md) preserve the
prospective protocol, final source patch/pins, every exploratory/intermediate/final profile,
correctness controls, native receipts and failed packaged gate. All integrated content is still
verified at every transition. Long values passed through the pinned V1 writer's `writeString`
method can remain exact ordered string fields during comparison; any difference reconstructs
ordinary bytes and uses the existing normalization fallback. No persistence or wire format changes.

The unchanged Node item-count profile uses 100,000 visible characters, one warmup and five measured
samples, baseline then candidate. Whole-command acceptance includes an in-memory durable carrier;
it is not a browser input-to-paint or physical-storage measurement. Final medians in milliseconds:

| Yjs items | Comparison before / after | Whole command before / after |
| --- | ---: | ---: |
| 1,000 | 1.700 / 0.492 | 16.233 / 13.735 |
| 10,000 | 3.730 / 3.986 | 22.907 / 23.473 |
| 100,000 | 24.705 / 25.501 | 141.388 / 127.044 |

The first exploratory implementation slowed dense histories, so the final candidate retains the
ordinary encoder for histories with no long text item among the first 64 structs. This probe only
selects the implementation; it never omits content. Final sequential results remain mixed. A
prospectively added comparison-only check uses ten warmups per variant and twenty alternating
AB/BA pairs, with separate baseline/candidate bundles and no concurrent tests or profiling:

| Yjs items | Comparison median before / after, ms |
| --- | ---: |
| 1,000 | 1.555 / 0.280 |
| 10,000 | 3.295 / 3.296 |
| 100,000 | 17.791 / 17.825 |

This supports a useful gain with longer text items and no consistent measured dense-history
regression in these checks. Samples share host/JIT/GC state and do not establish a population
estimate or a universal speedup. Whole-document and undo-history forks are unchanged. The earlier
control pilot remains the recorder calibration reference; no new recorder claim is made.

The unchanged packaged application gate ran alone against the current Local UI, seeded and
cold-verified with 300 cards and 400 Goals lines. All 12 project/cases execute without skips or
retries and all 30 aggregate measurements survive. Two project teardowns report the collected
card-typing overruns; the run is failed and its process group drained. Final values, rounded:

| Measurement (ms) | Desktop | Android emulation, CPU 4x | Bound |
| --- | ---: | ---: | ---: |
| Cold application work, excluding factor entry | 187.2 | 648.4 | <2500 |
| Warm application work, excluding factor entry | 225.9 | 690.0 | <1000 |
| Encrypted load and replay | 4.8 | 18.3 | <500 |
| Compose typing p95, 120 keys | 3.1 | 10.4 | <16 |
| Card typing p95, 120 keys | **16.2** | **77.2** | **<16 — failed** |
| Card focus to editable | 8.1 | 44.2 | <50 |
| Peek navigation response / settled | 8.7 / 21.6 | 40.6 / 55.3 | <100 each |
| Keyboard navigation response | 9.1 | 22.8 | <100 |

Earlier card typing was 18.3/84.2 ms and focus 7.4/61.4 ms. Those cross-run differences are not
controlled causal estimates. Both seeded editor workloads use 1280×900; CPU throttling remains
host emulation, not handset evidence. The frame-plus-task recorder remains a paint proxy. No
numeric budget or deadline changed. Passing focus in this run does not settle its previous tail.

The final full unit suite passes 96 files / 1,030 cases. Comparison agrees with the frozen full
normalization reference over 150 existing and 200 new histories, including unequal values at equal
clocks; the existing 500 fork histories remain. Ignoring retained string values fails two tests.
Native pending and original-order delivery each pass 100 generated histories plus their directed
crash/pressure cases; the old content/publication mutants are detected. Owned workspace admission
passes ten cases and four mutations. All 99 pure runner checks, type and scoped style gates pass.
The corrected test-generator setup and initial out-of-allow-list native invocation remain recorded.

F-17 remains partial. Next is a bounded document/history fork-cost repair preserving private
staging, refused-edit isolation, undo and pending delivery, followed by this unchanged application
gate. Dense-history and device capacity, focus, remaining command/campaign adapters and immutable
release qualification remain open. Personal browser, package and deployment are untouched.


## 2026-09-14 — F-17 detached-fork repair (Android typing budget still failed)

Based on signed `e2c93b05`, this [bounded experiment](./f17-forks.md) changes only the Yjs seam's
runtime document construction. Admission still has a detached canonical draft and a separate
private undo history, full verification on every transition, and unchanged publication ordering.
[Evidence](./account-conformance-runs/2026-09-14-f17-forks/README.md) retains the prospective protocol,
its refinement after semantic failures, final source patch/pins, every pilot/final sample, failed
controls, full native reports and the unchanged failed application gate.

The naïve public V2-codec swap was rejected. Directed tests demonstrate different legacy JSON
conversion and adjacent unpaired-surrogate behavior. A generated isolation check shrank a third
failure to a one-byte binary value: V2's decoder returned a view into the update, which the fork
then cleared. Paired private codecs now use V2 struct compression with V1 JSON stringify/parse,
independent string-edge replacement and detached binary buffers. Those temporary bytes never
become a persistence or transport representation.

A new test also fails against the signed V1 baseline: a binary leaf nested inside an arbitrary
object/array aliases the temporary update and becomes zero when that update is cleared. The new
fork detaches these leaves too. This is a demonstrated runtime-fork defect for that content shape;
this evidence does not establish that personal writing used the shape or lost data. The baseline
counterexample remains distinct from the three defects in the rejected candidate.

Final sequential Node medians use 100k visible characters at the declared item counts, one warmup
and five measured forks/comparisons, and six admitted commands with the first excluded. Whole
commands use a controlled in-memory durable carrier, not physical browser storage:

| Yjs items | Fork before / after, ms | Whole command before / after, ms |
| --- | ---: | ---: |
| 1,000 | 1.385 / 0.849 | 13.585 / 15.210 |
| 10,000 | 4.971 / 3.498 | 26.115 / 23.815 |
| 100,000 | 42.866 / 28.577 | 130.601 / 116.110 |

Whole-command observations remain mixed. A predeclared alternating fork-only check uses ten
warmups per variant and twenty AB/BA pairs with separate bundles. Correctness checks and disposal
occur outside timing. No tests or other profiles ran concurrently with these measurements:

| Yjs items | Fork median before / after, ms |
| --- | ---: |
| 1,000 | 0.695 / 0.415 |
| 10,000 | 3.119 / 1.779 |
| 100,000 | 36.897 / 22.252 |

This meets the prospective rule: at least a 20% fork gain in a declared stratum with no consistent
>10% fork regression in another. Samples share host/JIT/GC state; they establish neither a
population estimate nor a universal speedup. The initial plain-V2 pilot is retained separately
and is not used as evidence for the revised paired codec. Undo-stack copying remains unchanged.

The unchanged packaged application gate ran alone against the UI-seeded, cold-verified 300-card /
400-line corpus. All 12 project/cases execute without skips/retries and all 30 metrics survive.
One project teardown reports Android card typing over budget; the run is failed and drained.
Rounded values in milliseconds:

| Measurement | Desktop | Android emulation, CPU 4x | Bound |
| --- | ---: | ---: | ---: |
| Cold application work, excluding factor entry | 223.7 | 704.0 | <2500 |
| Warm application work, excluding factor entry | 208.0 | 627.4 | <1000 |
| Encrypted load and replay | 5.2 | 23.2 | <500 |
| Compose typing p95, 120 keys | 5.9 | 9.8 | <16 |
| Card typing p95, 120 keys | 15.2 | **69.4** | **<16 — Android failed** |
| Card focus to editable | 7.4 | 35.7 | <50 |
| Peek navigation response / settled | 8.1 / 23.1 | 36.6 / 62.4 | <100 each |
| Keyboard navigation response | 0.5 | 13.9 | <100 |

Previous typing was 16.2/77.2 ms and focus 8.1/44.2 ms. These cross-run differences are descriptive,
not controlled causal estimates. Both seeded editor workloads use 1280x900. CPU throttling is host
emulation, not a handset, and the frame-plus-task recorder remains a paint proxy. Desktop meets its
typing bound in this observation; this does not close the complete gate or the earlier focus tail.
No numeric budget, deadline, recorder, personal app or deployment changed.

The final unit suite passes 96 files / 1,035 cases. Two hundred generated Unicode/nested-content
cases compare with a frozen V1 reference and exercise isolation in both directions; 150 generated
undo/redo histories compare repeated forks against an unforked history and check selection metadata.
Existing 500 fork and 350 comparison histories remain. Pending-map aliasing and omission of redone
links each fail their intended control. Native pending and original-order delivery each pass 100
histories plus directed crash/pressure cases. Owned admission passes ten cases and four mutations;
all 99 pure runner, type, scoped style, inventory and authority checks pass.

F-17 remains partial. Next isolate remaining undo-history and duplicate-preparation costs on the
revised runtime before choosing an ownership or history-copy change. Private staging, refused-edit
isolation, undo, pending delivery and full verification remain hard constraints. Dense-history,
physical-device capacity, focus, command/campaign integration and immutable qualification remain open.


## 2026-09-14 — Residual preparation and undo-history profile

At signed `1fd04afa`, the unchanged browser diagnostic passes four cases with cold reopen, no retries
and process drain. This evidence-only phase changes no runtime, test contract or budget. The last
independent application gate remains failed at 15.2/69.4 ms desktop/CPU-4x Android card typing.
[Protocol, full tables and next design](./f17-history-profile.md).
[Evidence and retained analysis](./account-conformance-runs/2026-09-14-f17-history-profile/README.md).

Twelve diagnostic p95 rows retain 1,440 raw timings. Over the two reverse-order blocks, desktop
textarea/bare-CodeMirror/card values are 2.5/1.8, 2.4/17.9 and 15.0/16.4 ms; Android CPU-4x values
are 5.1/5.4, 7.3/18.0 and 73.0/73.9 ms. Later bare-CodeMirror tails preserve the recorder/scheduler
uncertainty. Do not subtract these controls or interpret the diagnostic as a new budget pass.

Separate 60-key profiles attribute the following inclusive sampled milliseconds:

| Work | Desktop | Android CPU 4x |
| --- | ---: | ---: |
| Private preparation | 542.9 | 2555.5 |
| Admission document fork | 166.4 | 752.5 |
| History document fork | 148.2 | 730.9 |
| Undo/redo stack copying | 157.8 | 738.2 |
| Full comparison after admission | 186.4 | 774.4 |
| Publication listeners | 64.4 | 522.9 |

Preparation includes both forks and stack copying; do not sum nested totals. The stack-item callback
has 137.9/645.9 ms own sampled time, which cannot isolate native structuredClone from other inline
work. Separate ten-cycle focus profiles attribute 19.3/100.6 ms to mounting; these are not per-event
quantiles. Raw CPU profiles and complete resolved node mappings survive in the packet. Full generated
source maps remain in the raw run with retained hashes, not duplicated into the bounded packet.

The Node probe retains 360 measured document/history forks across nine declared strata, with five
warmups per variant and twenty alternating pairs. At 1,000 human groups and 100,000 visible characters
(3,000 integrated items), history medians with zero/one/100 targets per before/after selection are
1.848/8.802/559.527 ms; corresponding document medians are 1.153/1.180/1.348 ms. All medians/ranges,
state hashes and samples survive, including a 12.721 ms document-fork tail in another stratum.
The document is fixed within each metadata comparison, but cross-depth item complexity grows.
Synthetic target keys share the master-text basis; redo and redone counts are zero. These dependent,
increasing-stratum-order host observations do not estimate a customer distribution or a causal
application speedup. They do support metadata copying as a bounded next target alongside the browser
stack attribution.

Next prototype a specialized fully detached selection-metadata copy with structuredClone fallback,
preserving within-item graph identity and separate clones across items. Pin generated value/alias,
undo/redo and restoration oracles plus a deliberate sharing fault control before production edits.
Keep both drafts, deletion sets, redone links, admission order and full verification unchanged. The
prospective timing rule requires >=20% median improvement in both nonzero-metadata 1,000-group strata
without consistent >10% regression in zero-metadata controls; then run semantic/native controls and
the unchanged application gate alone. This optimization is not expected to close Android typing by
itself. Duplicate preparation, full comparison, publication and device-capacity work remain open.

All 99 pure runner checks, TypeScript, scoped style, inventory and authority checks pass. All 260
prior general contracts, exclusions, 52 personal/vector pins and L-2 are unchanged. This phase adds
no product correctness claim and no immutable release qualification.


## 2026-09-14 — Metadata-copy attempts rejected under the prospective rule

At signed `8c5fdaee`, two private selection-metadata copiers were tested and then discarded. The
production seam is byte-for-byte restored. [Prospective protocol and disposition](./f17-metadata.md).
[Candidates, all timings and regression evidence](./account-conformance-runs/2026-09-14-f17-metadata/README.md).

Both candidates preserve deep values/reference graphs in 200 generated cases, pass 150 generated
undo/redo histories with restored master/card selections, and pass directed fallback/cycle/accessor
checks. A nested-ID sharing mutation fails the intended source-isolation assertion for each. The
first uses a recursive shape dispatcher; the second uses direct constructors with the same descriptor,
shape and per-item memo safeguards. Each distinct source gets one full fixed-count measurement run:
nine strata, five warmups each and twenty alternating baseline/candidate pairs. No tests or other
profiles ran concurrently with timing. At 1,000 human undo groups:

| Candidate | Targets per before/after map | Baseline / candidate median, ms | Gain |
| --- | ---: | ---: | ---: |
| Recursive dispatcher | 1 | 8.552 / 8.118 | 5.1% |
| Recursive dispatcher | 100 | 576.683 / 460.767 | 20.1% |
| Direct constructors | 1 | 8.456 / 7.583 | 10.3% |
| Direct constructors | 100 | 571.345 / 396.992 | 30.5% |

The rule required >=20% improvement in both nonzero-metadata 1,000-group strata, without consistent
>10% regression in zero-metadata controls. Neither candidate meets the first requirement. The first
has one 12.5% slower empty-history median among its three equivalent empty controls; the second's
empty controls vary from 3.2% faster to 7.4% slower. All 720 measurements, all nine strata per attempt,
ranges, complete candidate sources/patches and bundle hashes remain. The second implementation's
larger stress-stratum gain does not justify lowering the rule after observation. These dependent
single-host observations retain increasing-order/JIT/GC and synthetic-target-layout limitations;
no measured application improvement follows.

Three new regression cases remain against the original production implementation. A shallow metadata
copy in that retained implementation fails the intended source-isolation assertion. The final full
unit suite passes 96 files / 1,038 tests; owned execution of the changed suite passes all 15 cases
with process drain. All 99 pure runner checks, TypeScript, scoped style, inventory and authority gates
pass. The planning inventory and two fixed-denominator fixtures now account for 2,018 general cases.
The initial planning refusal and stale 2,015 denominator assertions are retained; none was bypassed.

Because the production candidates were rejected, the conditional runtime-native/application campaign
was not reached. The last application typing gate remains failed at 15.2/69.4 ms desktop/CPU-4x
Android; no new budget or native pass is claimed. F-17 stays partial. Next define an owned preparation
handoff, its accepted-basis/writer binding, refusal/disposal behavior and Account source coverage
before removing a duplicate draft. Keep full per-transition verification and use the existing two-draft
implementation as the differential reference. Full comparison, publication, physical-device capacity,
command/campaign integration and immutable qualification remain open.


## 2026-09-14 — Preparation ownership contract and reference controls

At signed `213ada08`, define the [private preparation contract](./f17-preparation-contract.md) before
attempting to remove the first canonical-derived draft. The proposed context binds owner identity,
accepted revision, writer, job and slice. A failed storage attempt retains its already consumed
handoff for exact retry; a new preparation requires a fresh context. Keep canonical state private,
full post-promotion comparison and the independent Account source-coverage probe. The generic path
remains a reference. The actual private component, its rejection/cleanup controls and subsequent
Local/Account integration have not been implemented in this phase.

Four added cases exercise the current production path: 80 generated admission histories with an
independent accepted-state/cold-carrier ledger; no-op revision and remote-writer collision behavior;
discard/close history ownership; and 160 generated complete pending-state source checks. Stale draft,
premature promotion, missing disposal and omitted source verification each fail the intended control.
All 1,042 unit tests, 99 runner self-tests and 57 owned cases across the affected suites pass. Initial
fixture mistakes and final control outputs are retained in the
[evidence packet](./account-conformance-runs/2026-09-14-f17-preparation-contract/README.md).

Production bytes are unchanged, so this phase performs no new application/native timing and makes
no speedup claim. Last application typing is still 15.2/69.4 ms desktop/CPU-4x Android, with Android
failing <16 ms. F-17 remains partial; all budgets, recorder limitations and handset/immutable
qualification requirements remain. Next build the actual private handoff with rejection and disposal
tests, then qualify Local integration against the reference before timing; Account source activation
needs a separate gate.


## 2026-09-14 — Private preparation ownership component, not yet integrated

At signed `6c5502fd`, implement the [private handoff component](./f17-handoff.md) without wiring it
into admission or the editor. Context identity binds verified local head, job, slice, revision and
writer. Storage retry retains exact prepared bytes/history. Close revokes new authority while leases
keep in-flight writes' references alive until release. Full verification is required before source
capture and again after the matching durable canonical promotion, before history transfer. These
callbacks must preserve the existing canonical/source checks when the component is integrated.

Twenty component cases include 120 generated independent text/revision/undo/cold-replay histories;
eight deliberate faults fail the intended assertions. Two new cleanup tests first reproduced gaps in
late async-result erasure and collection of a closing command's returned buffers; both are fixed.
The first revision-binding control was masked by its fixture retaining an unexpected borrow through
cleanup. It now releases on that failure path. All first failures, code variants and final evidence
are retained in the [packet](./account-conformance-runs/2026-09-14-f17-handoff/README.md).

The owned runner passes all 20 cases with drain. Full units pass 97 files / 1,062 cases on the same
default command run alone, after a concurrent run timed out in two unchanged five-second tests
(Account liveness and position decisions). All 99 runner self-tests and type/style/authority checks
pass. The standalone pass does not resolve loaded-host headroom or establish concurrency as the
cause. No timeout or application budget changes, and no application/native timing is run here.

No existing runtime source changes. The new component has no editor/admission caller, so there is
no product speedup claim. The last typing observation is still 15.2/69.4 ms desktop/CPU-4x Android,
with Android failing <16 ms. Next integrate Local against the legacy reference through semantic and
native pressure/crash checks, then use a prospectively specified performance comparison and the
unchanged application gate. Account source integration, handset capacity and immutable qualification
remain separate; F-17 is partial.


## 2026-09-14 — Private Local handoff: functional integration before timing

At signed `0c84e5cc`, integrate the private preparation owner through an explicit Local constructor
selection. The candidate avoids the first canonical-derived draft while retaining a detached history,
actual transaction capture, exact retry, write leases, per-slice renewal and complete comparison
before publication. Default Local and Account factories retain the reference path. Sharing the
command helper does change internal code on that reference path, so the next performance comparison
must also retain the signed baseline; do not assume its timing stayed identical.

The 23 original workspace cases run against both strategies. Each additionally checks no-op/writer
renewal, reentrant submission and the same 80 generated text/revision/undo/redo/cold-replay histories
(seed 140925). Two Local-specific close/adoption cases bring the workspace total to 54. Eight owned
files pass 155 cases; full units pass alone at unchanged limits (97 files / 1,093 tests). The native
pending-state and original-order delivery campaigns each pass directed cases and 100 generated
histories. The final owned workspace catalogue passes ten cases and four mutations with drain.
All 99 runner self-tests and type/style/authority checks pass.

A directed native initialization test first exposed a new private-integration gap: an event labeled
remote after Local adoption was tolerated because the adopted document already matched canonical.
The workspace now checks source and revision; failure retains the projection-mismatch cause through
startup. The original source/report, directed repair and final campaign survive. Removing that check
reproduces the intended native failure. Separate unit controls detect omitted adoption comparison
and erasure of a leased write. [Implementation](./f17-local-handoff.md);
[evidence](./account-conformance-runs/2026-09-14-f17-local-handoff/README.md).

No performance measurement or application-budget change occurs. The last application gate remains
15.2/69.4 ms desktop/CPU-4x Android typing against <16 ms, with Android failing. Functional agreement
is not evidence of a speedup. Next specify a balanced comparison prospectively, run it and the
unchanged application gate, then decide Local default activation. Account source activation,
physical-device capacity and immutable qualification remain separate. After the F-17 disposition,
resume the 96 command / 63 campaign wrapper obligations and remaining qualification repairs.


## 2026-09-14 — Private Local performance comparison and activation disposition (`L-1`)

The prospectively frozen B/R/C comparison passes its relative criteria: 54 sessions, 3,456 measured
commands, six balanced orders, all semantic/replay assertions passing. The private candidate improves
paired medians by 10.2%/12.0% versus current reference/signed `0c84e5cc` at 10,000 items and
29.7%/29.0% at 100,000 items; the medium result is narrow. Tail and reference-baseline regression
rules pass, with all raw observations and warning output retained. This synthetic Node comparison
does not measure encrypted storage or paint.

The unchanged application gate on a disposable candidate activation variant fails Android card
typing: 63.5 ms p95 against <16 ms; desktop is 12.9 ms. Other budgeted metrics pass. All twelve
cases execute, all thirty measurements survive, no retry occurs, and processes drain normally.
The prospective document's seven-per-project count was a clerical error; the exact frozen stage
always contains six per project. The original protocol and this correction both remain.

Do not activate Local by default. Keep the candidate private and F-17 partial. The last reference
application observation is still 15.2/69.4 ms; do not treat the separate candidate run as a paired
browser speedup estimate. Next diagnose remaining candidate browser cost before choosing another
repair. General integration remains 261 files / 2,073 dispositions (11 N/A), with 96 command and
63 campaign obligations; no aggregate or physical-device qualification follows. No product source,
test, adapter, personal package or browser changes occur in this performance phase.
[Protocol and results](./f17-local-performance.md);
[evidence](./account-conformance-runs/2026-09-14-f17-local-performance/README.md).


## 2026-09-15 — Physical Pixel 9a R/C/C/R companion

The four-session companion completes on Android 17 / Chrome 152.0.7977.83, using the native narrow
viewport and no CPU/device emulation. Card-typing p95 is 107.9, 87.1, 86.9 and 108.3 ms (R/C/C/R):
19.3% and 19.8% lower for C within the two opposite-order pairs, still failing <16 ms in all four.
Compose p95 is 14.8, 14.4, 14.2 and 15.7 ms; all compose, focus, cold/warm startup and replay budgets
pass. All 960 trusted-key samples survive, and full-corpus plus exact edited-card cold-reopen checks
pass per session. The unchanged prior CPU-4x candidate gate remains failed at 63.5 ms; this companion
does not replace it or authorize default activation.

The measured typing viewport is 411.43×403.81 CSS pixels, DPR 2.625, with the phone keyboard open.
Separate frame-interval medians are 16.6–16.7 ms. Median delivered key intervals are 67.7–68.0 ms in
compose and 140.9–158.8 ms in cards, despite the same 50 ms driver pause after command completion;
this is not a fixed delivered-input-rate comparison. Battery temperature rises 34.6→37.6 °C while
charge stays 81%. Preserve these period/cadence limitations and all failed setup/diagnostic attempts.
No valid comparison session was rerun. Native on-screen keyboard/composition/undo testing remains
pending. Keep Local handoff private and profile the remaining card path after that manual check.
[Protocol](./f17-pixel9a.md); [raw evidence and independent recomputation](./account-conformance-runs/2026-09-15-f17-pixel9a/README.md).


## 2026-09-15 — Close the phone comparison and resume candidate diagnosis

The operator cancels the remaining physical-device campaign, including the planned manual
keyboard exercise. Preserve its completed four-session evidence without claiming that exercise
passed. The fixture server exited cleanly after removing its five owned USB reverse forwards;
the dedicated ADB server on port 5047 is stopped. Keep the emulation reference values and use
roughly 1.5 times card-typing latency for planning only: C 87.0/63.5 = 1.37; R 108.1/69.4 = 1.56.
These separate sessions are not a controlled hardware calibration or evidence for other metrics.
Resume the [bounded private-candidate browser profile](./f17-local-profile.md) once, with unchanged
samples and source-mapped attribution before another repair. Default activation stays refused.


## 2026-09-15 — Attribute remaining private Local card work

The unchanged owned browser diagnostic passes once on the isolated Local handoff variant:
4 cases, no retries/skips, 1,440 raw timings, 4 CPU profiles, exact text/cold-reopen checks and
process drain (208.584-second stage). Full maps independently reproduce 2,168 mapped nodes;
79 mapped application source files match the activated candidate. Original workspace identity
is unchanged during execution. Card diagnostic p95 is 14.6/13.7 ms desktop and 80.5/68.7 ms
CPU-4x Android across the two blocks; these do not replace the prior 12.9/63.5 ms application
gate observation. The later bare-CodeMirror tail persists and limits timing interpretation.
Across separate 60-key profiles, full history copying takes 345.2/1,558.4 ms desktop/Android,
including document copying 170.3/770.1 and stack copying 172.4/778.8. Full comparison uses
190.2/804.8 ms and publication/listeners 61.4/489.9 ms. Nested totals overlap; callback self time
does not isolate structuredClone. Native/unmapped and GC samples are retained.

Next define and test an ownership contract for private immutable selection snapshots: detach
at capture, safely reuse only owned sealed values, detach on restore, and prove foreign/stale
reference, nested-alias, undo/redo and lifetime behavior. Keep generic history forks fully detached,
full verification and durable admission unchanged. Both rejected metadata copiers remain rejected;
no speedup or default activation follows from this diagnosis. F-17 is partial; adapter obligations
remain 0 test-file / 96 command / 63 campaign. [Protocol and next phase](./f17-local-profile.md);
[evidence](./account-conformance-runs/2026-09-15-f17-local-profile/README.md).


## 2026-09-15 — Selection-snapshot ownership contract and baseline controls

Define the [private selection-snapshot contract](./f17-selection-snapshots.md): capture a detached
payload once behind an owner-issued opaque token, reuse only same-owner tokens in explicitly owned
metadata, restore detached selections, and invalidate on owner close without erasing snapshots a
live sibling history still needs. Generic metadata forks remain fully detached. Weak-key lifetime
must not be replaced by a strong global registry; shallow freezing does not establish immutability.
The component and its owner/forgery/closed-token controls are the next phase, not implemented here.

Six owned suites pass 118 cases with no skips/retries and process drain. Four new registrations
cover 96 generated retained-branch histories, frozen/lookalike generic metadata, and 80 generated
master/card ledger histories under each current preparation strategy. The independent ledger
checks text, selections, undo/redo, revision, failed-write retry/discard, remote prefixes and cold
replay. Three faults are detected: shallow nested sharing, empty before capture and stale after
capture. The first sharing attempt failed earlier at prototype normalization; production-shaped
cloned fixture metadata makes the corrected control reach the intended alias assertion. Both
attempts remain. No production defect was identified and all runtime bytes remain unchanged.

All 17 selected runner/registration checks, TypeScript, scoped source style, inventory/manifest and
authority checks pass. Exactly four cases and one denominator-title update are reviewed; all other
contracts, deadlines and exclusions remain. General integration is 261 files / 2,077 dispositions
(11 not applicable). Wrapper obligations remain 0 test-file / 96 command / 63 campaign. Full unit,
native and timing aggregates are not rerun in this baseline-only phase. F-17 remains partial, the
application gate remains failed, and the rough 1.5× Pixel card estimate remains planning context.
[Retained evidence](./account-conformance-runs/2026-09-15-f17-selection-contract/README.md).


## 2026-09-15 — Unmounted private selection-snapshot owner

Implement [the private selection owner](./f17-selection-owner.md) without connecting it to the
editor. Capture detaches and validates a complete selection Map behind a fresh opaque token;
restore returns a fresh graph; metadata fork reuses recognized tokens in a new outer Map. Foreign,
forged, cloned and closed-owner tokens refuse. A private WeakMap supplies identity and lifetime,
with no strong inventory or per-branch revocation. Reentrant close during capture prevents issuance.
History-to-owner binding and workspace shutdown ordering remain explicit integration obligations.

Seven owned suites pass **127 cases**, including nine new component cases and the unchanged
adjacent history/admission/delivery regressions, with no skips/retries and process groups drained.
The component runs 200 generated graph/isolation examples (seed 150903), 160 independent branch/
group lifetime histories (150904), and 80 malformed sparse-array examples (150905). The last
property exposed a defect in the initial unmounted validator: extra properties could disguise
holes from a key-count/Array.every check. Requiring consecutive array indexes fixes the retained
minimal counterexample. Original source/test, failed run and repaired pass survive. Four deliberate
faults are detected: borrowed input, lent restore payload, shared owner registry and invalidation
of a token retained by a sibling branch. GC timing and forensic erasure are not claimed.

All 17 selected runner checks, TypeScript, scoped source format/lint, inventory/manifest, crypto
census and authority checks pass. One reviewed source and one nine-case adapter are added; prior
runtime files, contracts, deadlines, exclusions and crypto classifications are preserved apart from
the exact denominator-test title update. General integration is **262 files / 2,086 dispositions
(11 not applicable)**. The 96 command / 63 campaign obligations remain. Five prior phase packets,
52 personal/vector pins, append-only record prefixes and L-2 are preserved. No full unit, native
or performance aggregate is run in this unmounted phase; the application gate remains failed at
12.9/63.5 ms desktop/CPU-4x Android card p95. No default activation or speedup is claimed.

Next integrate an explicit private Local variant with workspace/history owner binding and all
metadata producers/consumers converted together. Retain the generic reference and current Local
handoff for comparison. Generated/native retry, discard, grouping, slicing, remote, reentrancy and
close checks precede a new prospective performance comparison and the unchanged application gate.
[Retained evidence](./account-conformance-runs/2026-09-15-f17-selection-owner/README.md).


## 2026-09-15 — Explicit private Local selection-snapshot integration

Integrate [owner-bound selection history](./f17-selection-integration.md) through the explicit
internal `local-snapshots` variant. Default Local/Account and the existing reference/Local-handoff
paths remain available. A workspace capability binds even empty histories to its live owner;
generic forks refuse owned histories. Group before/after capture, history fork, undo/redo metadata
transfer and detached restore now use recognized opaque tokens together. History documents, stacks,
ranges and restored selections stay detached. No token or history handle is exposed to the UI.
Private admission retains its complete comparison, revision/job/slice/writer binding, byte leases,
retry and source guards. Teardown disposes histories after write/preparation drain, then closes the
snapshot owner. A targeted startup check found a new cleanup gap: synchronous opener throws escaped
the initial Promise.catch. A surrounding try/catch repairs it; original source/test and red/green
runs are preserved. The defect preceded history allocation and is not evidence of content loss.

All **86 workspace cases** pass, including the same 27 shared cases under three variants, existing
Local controls, and new activation/startup/close checks. The new seam suite passes five cases,
including 120 generated retained-branch/cursor histories (seed 150906). Existing accepted-state
and independent master/card selection ledgers run 80 histories per variant (140925/150902).
Thirteen affected and timing-follow-up owned suites pass **215 cases** with no skips/retries and
process groups drained. Five deliberate faults fail their intended assertions: missing history
binding, cloned tokens, stale after capture, omitted undo transfer and premature owner close.

Native pending-state and original-order delivery campaigns each pass directed cases plus **100
generated histories** (seed 8941), explicitly selecting the new variant in disposable Chromium
profiles. The owned workspace catalogue passes **10 cases and all four mutations**, with browser
and process drain. The first native run passed all ten cases but its whole-state pending-history
mutation destroyed the active candidate and timed out before reaching the privacy assertion. The
replacement fault exposes the candidate undo stack without replacing the accepted document; the
original error run and both catalogue definitions remain, with the same assertion and limits. Full units initially pass 99 files / 1,141 tests before startup repair; the next
run times out in the same two unchanged five-second Account-liveness/position-decision cases noted
previously. Both pass in isolation, and one unchanged full repeat after repair passes **99 files /
1,141 tests**. All runs remain; the cause is not established and loaded-host qualification stays open.

All 21 selected runner checks, types, scoped source style, inventory/manifest, census and authority
checks pass. Registration adds five seam cases and thirty workspace cases while retaining every
previous case and contract except the denominator-title update and the reviewed pending-history
mutation target repair. General integration is **263 files /
2,121 dispositions (11 not applicable)**, with 0 test-file / 96 command / 63 campaign obligations
remaining. Only the Yjs seam, admitted workspace and the snapshot owner's descriptive comment change
runtime source bytes in this phase. Crypto classifications, six prior packets, 52 personal/vector
pins, append-only prefixes and L-2 remain intact. No performance measurement or default activation
occurs. F-17 remains partial and the application gate remains 12.9/63.5 ms desktop/CPU-4x Android
card p95, with Android failing <16 ms. Next specify and run a balanced comparison with the reference,
existing Local handoff and appropriate signed baseline before the unchanged application gate.
[Retained evidence](./account-conformance-runs/2026-09-15-f17-selection-integration/README.md).


## 2026-09-15 — Private Local selection-snapshot performance decision

The [prospective four-variant comparison](./f17-selection-performance.md) completes **64 fresh
sessions, 5,248 warmups and 4,096 measured insertions**, with all exact text/caret/revision/history
and canonical cold-replay checks passing. B is complete signed `0c84e5cc`; R/H/S share current
runtime/dependency bytes with explicit reference, Local-handoff and Local-snapshot selection.
Four balanced orders cover three 100,000-character document item-count strata plus a deeper
10,000-item history growing from 256 to 320 undo groups. The memory carrier excludes encryption,
IndexedDB and paint; this is a host engineering comparison, not fleet qualification.

The snapshot increment over H is **2.9%** at 10,000 items with shallow history and **10.3%** with
deeper history. The prospective rule requires >=10% in both, so the relative gate **fails**.
Cumulative S/R and S/B benefits and all median/p95 regression guardrails pass. At 100,000 items
S is 0.7% slower than H by median paired ratio; the substantial cumulative gain comes from the
existing handoff. Preserve the mixed result rather than declaring a broad snapshot speedup.

The unchanged application gate runs **once** on a disposable current-source build with exactly
one runtime patch selecting `local-snapshots` at the Local opener. All twelve cases execute and
all thirty measurement rows are retained; browser, process group and localhost server drain.
Card p95 is **12.2/75.1 ms desktop/CPU-4x Android** against <16 ms. Android focus is
**54.2 ms** against <50 ms; both Android budgets fail. The remaining budgeted metrics pass. The failure is reported through the deferred afterAll budget hook,
not a navigation correctness failure. The earlier H observation (12.9/63.5 ms) is a separate,
unpaired run; its difference from this run is not a controlled browser treatment effect.

Default Local and Account retain the reference. No runtime, adapter, manifest, census or registry
changes occur in this phase. F-17 stays partial; general integration remains **263 files / 2,121
dispositions (11 not applicable)** and unresolved obligations remain **0 test-file / 96 command /
63 campaign**. Seven preceding evidence packets, 52 personal/vector pins, append-only prefixes
and L-2 are preserved. The packet embeds all command observations, helper/protocol bytes,
application measurements/receipts and preservation data; large pinned inputs and bundles remain
under ignored local test-results with hashes. No personal app, phone, relay or deployment changes.

Next: Review and sign the accumulated bounded phases, then profile the snapshot application variant to separate remaining document/history fork, full comparison and publication costs before choosing another repair. Retain the unchanged budgets and failed measurements.
[Retained evidence](./account-conformance-runs/2026-09-15-f17-selection-performance/README.md).

| Seed items / history | Signed B | Current R | Handoff H | Snapshots S |
| --- | ---: | ---: | ---: | ---: |
| 1,000 / 24–88 groups | 12.41 | 12.57 | 12.26 | 11.84 |
| 10,000 / 24–88 groups | 21.06 | 21.21 | 18.53 | 18.06 |
| 100,000 / 24–88 groups | 92.34 | 94.57 | 63.85 | 64.48 |
| 10,000 / 256–320 groups | 22.74 | 22.81 | 20.51 | 18.48 |

Values are medians of four session medians, in milliseconds. Decisions use the retained paired
ratios, not ratios of this summary table. Raw within-session timings are dependent.
