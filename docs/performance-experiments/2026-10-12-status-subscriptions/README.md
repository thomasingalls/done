# Status subscriptions and input waiting

2026-10-12 · Base: signed `e730ac57`. Release validation remains paused.

The intervention separates queue-status updates from the workspace content/actions context.
`WorkspaceStatus` owns the full warning subscription and the existing persistence request; Goals
subscribes to admission state only. Content, command feedback, pending warnings and blocked controls
continue to update. The context value remains stable for feedback-only changes. Owner replacement
detaches subscriptions and ignores delayed persistence replies from the previous owner.

No admission, custody, authority, journal, sync, protocol or undo implementation changes. The final
application still waits for its complete fresh authority read at the FIFO head. The baseline build
loads only the two old UI modules from the signed base; all other code and flags match the candidate.
No runtime feature flag or stored-format change is introduced.

## Measurement boundaries

The [prospective protocol](protocol.md) fixes reversed-order restored-session comparisons. Each desktop
session types 600 keys without reopening, through an external CDP driver that does not wait for the
renderer to finish each key before dispatching the next. The primary metric starts at the supplied
input event timestamp; legacy handler-to-rAF remains recorded separately. Both end at a callback
observing the expected text before paint: neither is a physical display latency measurement.

The desktop calibration deliberately blocks the main thread for 200 ms. It retains all 12 keys,
including four events timestamped inside the stall, with up to 181.3 ms of pre-handler delay. It
independently observes the 200 ms long task. The initial sandboxed browser launch failed before
measurement; the authorized native launch passed. No failed timing is replaced as favorable evidence.

A silent-peer baseline illustrates the distinction: handler-to-frame p95 is 20.4 ms, while input-to-frame
p95 is 55.2 ms. The old metric missed that pre-handler waiting. The independent host cadence, browser
event times, command completions, clock bounds and long tasks are retained, not inferred from averages.

Two sessions per arm/condition give descriptive within-block contrasts, not independent-key confidence
intervals or a powered 20% effect claim. The fixed current anchor is present in every block. Actual
backlog/peer work completed is reported because a faster receiver changes its own exposure. Physical
and historical companions remain separate from this primary comparison.

## Correctness and evidence

Focused UI tests cover queue-only render isolation, live warning/control updates, Retry/Discard,
command errors/dismissal, content publication, editor-consumer mount preservation, owner replacement,
subscription cleanup and late persistence replies. Existing sync-notice and admitted-editor projection
checks pass with them (15 tests across three files). Every timing session also checks exact local
writing, last-key undo/redo, peer writing, full export convergence and cold offline replay.

## Desktop results

All 12 restored sessions passed, retaining 7,200 keys. Input-to-observed-text p95 (ms), with the
signed reference/anchor in every block:

| Condition | Block 1 reference | Block 1 candidate | Block 2 reference | Block 2 candidate |
|---|---:|---:|---:|---:|
| Silent peer | 55.2 | 48.6 | 40.3 | 52.5 |
| Active peer | 71.0 | 63.3 | 71.0 | 60.7 |
| 600-position backlog | 73.7 | 60.7 | 64.0 | 55.8 |

The candidate improves active-peer p95 by 11%/15% and backlog p95 by 18%/13%, in both run orders.
Only the first backlog contrast exceeds 10 ms; none exceeds 20%. This is a modest improvement,
not a resolution of the input target. Silent-peer results reverse direction: no everyday-typing
latency benefit is established. Medians remain around 19–23 ms. The 16 ms target is not met, nor
is the 50 ms working p95 target consistently met under receive load.

The long tail is mixed too. Active-peer p99 falls 104.2→86.3 and 94.5→80.2 ms, but backlog p99
rises 97.7→99.0 and 85.2→102.5 ms. Keys above 100 ms are 8→2 / 4→5 for active peer and 3→6 /
4→7 for backlog. Silent-peer block 1 includes a candidate maximum of 230.4 ms (four keys above
100 ms); its reversed-order session has none. Independent long-task maxima remain 64–87 ms in
the receive conditions, with no general reduction in blocking excess. Isolating React status work
does not remove the remaining queue waits or protocol work.

The complete fresh final-read median improves from 25–26 ms to 18–20 ms under receive load.
Its opening span falls roughly 14→8 ms; cursor-transaction medians remain 9–10 ms. Active-peer
final apply/publication remains 6.7→6.4 ms. This supports the status-contention hypothesis; the
elapsed opening span includes dispatch/scheduling and is not a measurement of disk latency.
Authority checks still run in full after acquiring the final FIFO job. No security freshness
tradeoff was made. The silent condition has only one final job per session, so its read timing
is not treated as representative.

Exposure differs slightly: active sessions complete 43–50 final jobs; backlog sessions 71–74.
The backlog fixture has 1,000-character Goals, while silent/active use 12,000; compare arms within
a condition, not their raw condition totals. Full per-session medians/p95/p99/max, work counts,
clock bounds, cadence, long tasks, sync progress and guardrails are in [summary.json](summary.json).
All completed account requests in the typing windows returned HTTP 200; no page errors occurred.

## Historical comparison

Four restored active-peer sessions rebuild exact frontend sources from `08a82089` (authority reuse)
and `02829405` (prepared handoff), in authority/handoff/handoff/authority order. They use the common
online instrumentation, current disposable service and independent 600-key input driver. Package
lock/build config/runtime dependencies are unchanged across these revisions. The later fresh-read
probes are absent in both historical arms; do not pool them with the main table.

| Historical source | Block 1 input median / p95 | Block 2 input median / p95 |
|---|---:|---:|
| Authority reuse `08a82089` | 30.4 / 184.5 ms | 31.3 / 195.8 ms |
| Prepared handoff `02829405` | 24.7 / 79.0 ms | 24.2 / 72.9 ms |

All 2,400 keys and all correctness guards pass. Handoff improves p95 in both orders (57%/63%).
This contemporaneous comparison establishes a benefit on this workload, including waiting before
the key handler. It cannot prove what caused the previously reported machine drift. It does not
mean the remaining performance is adequate: the second handoff session still has a 249.7 ms maximum.
Every completed typing-window account request is HTTP 200. [companions.json](companions.json)
retains every session separately.

## Phone boundary

Pixel 9a / Android 17, native 411×785 layout pixels, DPR 2.625. The known-stall calibration passes:
12 keys retained, a 200 ms main-thread task observed, up to 179.5 ms pre-handler delay. Host/phone
epoch offset is measured and applied (about +2,977 ms, 1 ms minimum half-round-trip uncertainty).
This verifies the recorder, **not account performance**. No account typing run reaches measurement.

Seven setup attempts are retained, none counted as a timing result:

- `phone-reference-1`, `1b`, `1c`: adapter mistakes in loading the pinned Playwright storage codec
  under the application CSP (unsafe eval, duplicate binding, wrong exported constructor). Fixed
  without weakening CSP; the complete synthetic IndexedDB/localStorage round trip then passes.
- `1d`: this phone's CDP endpoint does not expose `WebAuthn.enable`.
- `1e`, `1f`: chooser adapter searched visible text instead of its accessible name. The saved
  device was present; the corrected selector matches the existing desktop fixture helper.
- `1g`: reopening reaches a real passkey/session challenge, which cannot use the fixture's
  desktop virtual credential. The user observed Bitwarden. Stop here; do not substitute an everyday
  credential, disable the password manager, or bypass application authentication.

The user chose to finish this bounded phase and leave the phone account comparison pending. A
separate physical credential fixture/walkthrough is needed. The retained phone probe is unfinished;
it must not be rerun against the current virtual-credential fixture as though that obstacle were
resolved. Only the owned localhost test tab/storage was used. The test tabs and its forwards were
closed/removed; the saved synthetic origin state remains available for diagnosis. Public/Tailscale
writing and credential-provider settings were not changed.

## Disposition

Keep the bounded UI isolation: its direct render/control tests pass, both receive-load contrasts
improve, and the silent condition does not show a consistent material regression. It removes a
known unnecessary subscription dependency without changing admission, authority, persistence or
undo semantics. Do not present the mixed silent or extreme-tail results as a performance win.

The next substantial queue-latency candidate is a bounded design for checking authority before
joining final application, with explicit lifetime/invalidation rules and a synchronous guarded apply.
That changes the meaning of freshness and is not implemented or authorized by these measurements.
Whole-context refresh on actual content changes, protocol work and extreme tails also remain.
Keep the historical handoff improvement; do not revert it based on the old cross-phase drift.

## Checks and retained artifacts

`test/workspaceUiStatus.test.tsx`, `test/syncNotice.test.tsx` and
`test/admittedEditorProjection.test.ts` pass (15 tests). TypeScript, scoped lint/format, ordinary build and JS budget
pass. Initial JS is 137.1 KiB of 350 KiB for both entry points. A lint failure for the intentional
owner-scoped cancellation object is retained with its correction. The only post-measurement runtime
source change is two lint comments; rebuilding produced byte-identical executable assets.

[Source/build identities](source-identity.json) pin runtime, common helper chain, historical refs,
fixture hashes and builds. [Manifest](manifest.json) verifies every file in the compact
[evidence archive](evidence.tar.gz), including all 16 completed desktop sessions, calibrations,
failed phone setups and checks. Synthetic setup button/message text is omitted from two phone
records (source hashes retained); no credential fixtures or service/browser snapshots are archived.
The failed fake-IndexedDB assertion dump remains outside the archive because it contains synthetic
fixture values; its corrected, sanitized round-trip log is included. Numeric raw key/job/task records
are retained so alternative tail summaries need not reconstruct numbers from this prose.

`probe/run.py` fixes the 12-session desktop order; `history-run.py` fixes the four historical sessions;
`analyze.py` and `companions.py` regenerate the tables from the retained raw results. Runs use the
locally retained fixtures pinned by hash and refuse output overwrite. The independent input driver
and known-stall calibration are in `probe/input.ts` and `calibration.spec.ts`.

This work is uncommitted and unpublished. Release validation stays paused; this is a focused
performance/correctness comparison, not qualification. The other seat's `docs/progress.md` is unchanged.
