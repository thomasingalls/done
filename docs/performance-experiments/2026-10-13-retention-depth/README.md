# Authenticated local retention: measured history depth

Signed runtime: **`354c9c59`**, baseline-aware warm/incremental reuse. This is a measurement-only
continuation: no runtime changes, publication, personal-profile conversion or release qualification.
The [prospective protocol and amendments](./protocol.md) distinguish the native own-history series
from the packaged received-history check. Both keep the complete authority/lifetime, authenticated
storage, journal and undo paths enabled.

## Result

Retiring authenticated protocol history materially reduces opening, retained memory and warm
publication cost on these fixtures. **The first conversion is expensive and can block the foreground
for seconds.** It needs separate responsiveness work before everyday activation. No automatic
retention cadence or public writer is enabled by these results.

Native owner opens, three matched pairs per depth on one desktop (CPU-1x):

| Accepted own positions | Complete cold open, median (range) | Reduced cold open, median (range) | Post-GC heap, complete → reduced | Warm publication, complete → reduced |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 127 ms (125–147) | 198 ms (196–204) | 10.38 → 10.50 MB | 56 → 80 ms |
| 129 | 529 ms (517–543) | 170 ms (163–192) | 12.47 → 10.45 MB | 124 → 94 ms |
| 601 | 1,892 ms (1,892–1,934) | 176 ms (153–179) | 18.52 → 10.45 MB | 321 → 83 ms |
| 1,201 | 3,594 ms (3,592–3,643) | 141 ms (140–150) | 26.21 → 10.45 MB | 557 → 68 ms |

These are **owner-operation times**, not the packaged application's unlock-to-editor latency.
The repeated native workspace has two cards and 12,559 Goals characters. Each pair starts from
identical closed storage except for a real atomic retention cut. Across depths the visible text
is equal, but Yjs snapshot bytes grow from 13,456 to 13,581. This is not evidence that CRDT history
or arbitrary workspace growth has constant cost.

The one-position baseline is larger (82,697 encrypted chunk bytes, versus 31,665–32,694 later).
The focused boundary check confirms **16 source entries allocated, zero unallocated**. An earlier
chat inference that unpublished sources explained that size was incorrect. The baseline also
carries its terminal accepted envelope: the initial publication has 12,974 ciphertext bytes,
including the large text replacement, whereas later publications replace one character. Holding
only visible workspace size fixed does not hold terminal proof size fixed.

Median warm status cost rises from 1.3 to 15.5 ms with complete history; the reduced cases remain
2.6–3.8 ms. The reduced cases make **no full baseline replays** during the five status reads,
fixed edit/flush/undo/redo suffix, or its publication. Their cold opens still run full authenticated
baseline replay. Complete cold physical-row loads increase from 117 to 25,317 over three loads;
reduced physical-prefix loads are zero. That means the removed content/heads/outbound prefix is
absent, **not** that metadata, encrypted baseline chunks or authority records are skipped.

All 26 native observations (24 depth/arm observations plus two drift anchors) passed snapshot,
local journal-before-apply, undo/redo, later publication, repeated-cut and cold-recovery checks.
Final shallow anchors were 5.2% and 12.1% faster than their initial complete/reduced medians, below
the prospective 20% drift trigger. This does not establish that the host was quiet.

## Packaged received-history check

The retained joined-device fixture has 120 cards, about 60 KB of writing, 600+ received positions
and later edits. Its complete Markdown archive is 54,211 bytes, SHA-256
`c0263df4e70124412d913f42b98161cc87d1bcd261ee39acc5d96d7626b2d994`.
Every measured open reproduced that archive. A real private cut removed 937 physical rows.

| Same packaged build and fixture | Complete history | Reduced baseline |
| --- | ---: | ---: |
| Offline unlock to first completed editor frame, median (range) | 2.340 s (2.328–2.346) | 0.902 s (0.893–0.912) |
| Post-GC heap | 15.85–15.86 MB | 11.36–11.37 MB |
| Cold physical rows loaded, cumulative | 2,811 | 0 |
| Cold record bytes copied, cumulative | 22.15 MB | 0.49 MB |
| Native verify calls, observed through opening | 5,428 | 371 |

There are three observations per arm, with fresh browser contexts and restored service state each
time. The ~61% shorter opening is a desktop fixture result, not a release or phone qualification.
Reduced cold opening executes three baseline replays across the existing ownership boundaries;
those boundaries were not removed. Fewer individual historical proofs are read because the reduced
format uses its authenticated baseline and terminal proofs, not because checks were disabled.

After each cold open, the real online scheduler ran with a silent peer while 120 card keystrokes
were entered at 150 ms gaps and CPU-4x. Complete-history runs saw 16–18 long tasks (largest 62–67 ms);
reduced runs saw 0–1 (largest 0–55 ms). Both arms had zero full baseline replays in that interval.
The small handler-to-next-frame measure did **not** materially improve: medians were 15.5–15.6 ms
complete and 15.9–16.1 ms reduced; p95 was 18.8–19.2 versus 19.3–20.0 ms. That observer neither
measures hardware-input delay nor guarantees the edited text appeared in the frame. Do not compare
it to the product's input-latency budget. All six sessions passed text, undo/redo and offline reopen.

This check supports fewer background stalls; it does not establish lower per-key latency, live
peer convergence, typing while catching up a backlog, or phone performance.

## First-cut and replacement cost

Native first cuts at the four depths took **153 ms, 725 ms, 4.929 s and 14.090 s**. A subsequent cut
in each complete-history measurement (after its fixed local suffix) independently showed similar
cost: medians 111 ms, 755 ms, 4.785 s and 14.075 s. In already reduced copies, replacement after that
same suffix took medians **98, 77, 77 and 69 ms**. The longest observed native foreground task was
12.007 s in the deepest complete-history observation, which includes its cut; no such long task
was observed in the reduced observations. These maxima are not a populated tail estimate.

The packaged received fixture's first cut took 3.105 s. A separate, exploratory profile of that
cut, excluded from timing comparisons, attributes about 1.03 s inclusive sampled CPU to full
baseline replay and 0.76 s to the retention planner; these overlap other call-tree ancestors and
must not be summed. Hex/unhex helpers in `account-protocol/recovery.ts` account for about 542 ms
sampled self time, with additional receipt parsing, coverage/Yjs work, native crypto and garbage
collection. This profile is for received history, not an attribution of the 1,201-own-position
12-second task. The profile and mapped trees are retained in `evidence/cut.cpuprofile.gz` and
`evidence/cut-profile.json.gz`.

**Recommended next slice:** make initial retention preparation responsive, starting with a profile
of the deep own-history case and bounded preparation/yielding. Keep a fresh complete authority and
inventory recheck, journal-era/network-flight fences and the exact atomic row swap. Do not simply
let typing overtake an in-flight mutation. Then settle reader-first publication/rollback and the
explicit user-facing retention trigger/capacity/history-required behavior. Generic reduced content
compaction remains fenced. Larger workspace/tombstone and membership-proof growth remain separate
limits; public activation and general release validation remain paused.

## Evidence, corrections and limits

- Native series: one Node test containing 26 observations, completed in 591 seconds. It uses real
  owner admission/storage/crypto and a synthetic Node/OpenSSL acceptance-response oracle; it is
  not a service-throughput or automatic-sync-scheduling benchmark.
- Packaged series: one Playwright test containing six observations (three pairs), plus a separate one-cut
  diagnostic profile. Actual packaged service-worker pages, virtual passkeys and loopback service
  processes; snapshots/services are restored per replicate.
- Shallow source-boundary control: one final passing focused native test. The earlier passing
  boundary observation is retained too. Pilots are excluded from timing tables.
- Pilot 1 could not bind loopback in the sandbox; pilot 2 mishandled Vite's array build result;
  pilot 3 opened a manual owner without retention; pilot 4 correctly refused invented self history
  missing from its outbound ledger. Pilot 5, using legitimate own publication, passed. These were
  probe/setup corrections, not runtime fixes. The abandoned receive-only probe is archived.
- An analysis assertion initially treated `authorityChecks` as a census of every authority check.
  It only counts the receive owner's instrumented callback. The assertion was narrowed, not the
  runtime. See the protocol. Source boundaries and protocol checks stayed at signed `354c9c59`.
- Node 26.11.1, Chromium 151.0.7922.34, Apple M1 Pro / 32 GiB. Synthetic data, one machine, three
  repeats, no population confidence interval. Host load was recorded; VM/thermal/JIT effects are
  not independently controlled. No physical-phone, CPU-4x cold-open, pending-heavy or novel remote
  backlog-typing measurement. These remain explicit gaps rather than pass claims.

`native-summary.json` and `packaged-summary.json` contain derived values. `evidence/` contains
compressed numeric results, logs, the diagnostic profile and exact executed timing probes.
`source-identity.json` identifies the signed runtime, native observer bundle, packaged files and
external fixture hash. The readable probes were formatted after execution; the timing versions
are preserved in `executed-probes.tar.gz`. No credential-bearing state, lock codes, cookies or
service recovery keys are committed. The source fixture remains in `/tmp`; disposable runtime
processes have stopped. The packaged build, focused probe lint/format, JavaScript/Python syntax and document-link checks
pass; `evidence/checks.json` records their scope. No broad suite or release campaign was started.
`manifest.json` records SHA-256 and byte size for every other file in this packet.

## Reproduction

From the repository root, run the native series with:

```sh
DEPTH_OUT=/tmp/done-retention-depth-new \
ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 ACCOUNT_RETENTION=1 ACCOUNT_AUTHORITY_REUSE=1 \
node --test docs/performance-experiments/2026-10-13-retention-depth/probe/depth.mjs
```

Build the instrumented packaged application with `DONE_PERF_DIST=<new-directory>` and
`node node_modules/vite/bin/vite.js build --config docs/performance-experiments/2026-10-13-retention-depth/probe/build.config.ts`.
Run `node node_modules/@playwright/test/cli.js test --config docs/performance-experiments/2026-10-13-retention-depth/probe/packaged.config.ts`
with `DONE_PERF_SOURCE` set to the repository, `DONE_PERF_DIST` to that build,
`DONE_PERF_RESULTS` to a new directory and `DONE_REOPEN_FIXTURE` to the retained synthetic fixture.
Ports 53771/53772/53774 must be free. `CUT_PROFILE=1` performs only the exploratory first cut.
`probe/summarize.py <native-results.json>` regenerates the native table; `probe/profile.mjs <profile-dir> <dist>` maps the cut profile.
