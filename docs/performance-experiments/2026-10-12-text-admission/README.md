# Account per-keystroke text admission — 2026-10-12

Base **`68ca241d`**, signed received-history cold-open repair. This packet measures a working-tree
candidate; no image publication or deployment occurred. Release validation remains paused.

## Result

On the retained synthetic 120-card / 600+ received-position workspace (54,211 exported Markdown
bytes), three fresh offline typing observations per arm, each 120 keys at requested 150 ms spacing:

| Run order | Input handler median / p95 / max (ms) | Key to visible frame median / p95 / max (ms) |
|---|---:|---:|
| Reference 1 (`reference-2`) | 7.5 / 11.8 / 28.8 | 11.4 / 16.4 / 32.6 |
| Direct 1 | 2.2 / 3.5 / 5.9 | 6.6 / 13.9 / 23.9 |
| Reference 2 (`reference-3`) | 8.2 / 11.2 / 12.8 | 11.9 / 16.3 / 71.3 |
| Direct 2 | 1.8 / 3.1 / 4.9 | 5.7 / 13.7 / 24.0 |
| Reference 3 (`reference-4`) | 7.6 / 11.2 / 13.0 | 11.1 / 15.5 / 19.3 |
| Direct 3 | 2.1 / 3.5 / 5.2 | 6.2 / 12.9 / 19.2 |

The median of run medians is **7.6→2.1 ms** for the handler (72% lower) and **11.4→6.2 ms** to a
visible frame (46% lower). Every direct run takes the direct path for all 120 keys with **zero**
full projection comparisons during typing; the reference performs 120 comparisons. No >=50 ms
main-thread task was reported in these unthrottled typing windows. A frame delay without a long
task is still retained; it is not silently discarded.

Each observation undoes all 120 keys, redoes them, then locks and reopens offline with the complete
target text intact. Undo history is not cleared within the typing block. The >30% median handler
improvement criterion and p95 guardrail are met. **Direct Account text is now the default in this
branch**; `VITE_ACCOUNT_TEXT_ADMISSION=reference` retains the previous Account snapshot path.
`VITE_ACCOUNT_LEDGER=reference` also retains the full reference workspace path. No format changes.

## Slower-CPU diagnostic

One additional observation per arm at Chromium CPU 4x (not physical-phone evidence):

| Arm | Handler median / p95 / max (ms) | Visible frame median / p95 / max (ms) | Long tasks / largest |
|---|---:|---:|---:|
| Reference | 27.1 / 30.9 / 52.9 | 39.4 / 128.2 / 348.7 | 16 / 170 ms |
| Direct | 6.2 / 8.2 / 25.2 | 18.0 / 57.1 / 76.1 | 9 / 176 ms |

The 16 ms visible-text budget remains unmet in this diagnostic. The largest background task did
not improve; this slice does not claim to solve all foreground stalls. Event arrival is synthetic:
a browser blocked before it dispatches the key can hide pre-dispatch waiting from the frame metric.

## What changed and what proved it

[Account text admission](../../account-text-admission.md) describes the private capability,
normalization/repair eligibility, pure pinned-Yjs encoder, exact human source frame and
journal-before-apply boundary. Canonical and projection receive identical bytes only after
persistence; selection and native undo metadata advance before publication. Single-range plain
text avoids workspace forks; unsupported cases and structural/undo commands keep the native
reference path. Full equality remains at opening, reference transitions, received pages and close.

The final focused run passes **244 tests**, with one intentionally inapplicable Local-style
private-fork lifecycle case skipped for direct mode and replaced by direct byte-lifecycle cases.
The pure encoder is compared with native Y.Text over 160 generated histories, true concurrent
insert/delete delivery orders, nested text, Unicode and pending-dependency refusal. Sixty paired
mixed-operation histories compare direct and reference workspace outcomes, selections, undo/redo,
sliced paste, remote edits, retry/discard and cold replay. The expanded workspace tests also run
both Account modes. Directed controls assert exact source bytes, no forks/comparisons on eligible
text, journal-before-visible/undo mutation, forced-write retry/discard/close, and refusal of a
projection changed between preparation and promotion.

These checks caught a real normalization difference: native history forks normalize malformed
Unicode even in unrelated metadata. Direct admission now falls back when that could change the
basis. Another failed assertion incorrectly expected the Local buffer lease lifetime for Account
byte preparation; Account carriers copy synchronously, allowing immediate pending-byte erasure
on close. The corrected check still requires drained settlement and no late publication.

The packaged default-build two-device test passes actual source capture, encrypted journal,
signed delivery, remote-preserving local undo/redo, offline lock/reopen and subsequent delivery.
TypeScript, normal production build, pinned Yjs, initial bundle (136.7 KiB gzip), origin isolation,
and targeted lint/format checks pass. This is focused evidence, not a reopened release campaign.

## Separate profile

One isolated direct profile covers the same 120-key window, separately from timing observations.
The input wrapper accounts for ~274 ms sampled inclusive CPU (~2.28 ms/key). Overlapping subtrees
include ~58 ms in CodeMirror command planning, ~108 ms in workspace publication/subscribers,
~60 ms in editor projection, and ~48 ms in the UI workspace snapshot. These are inclusive and
**must not be added together**. Background work remains visible: nine dirty flushes, nine loads,
~33 MB of loaded records and ~92 MB of copied records. The largest named self-time entries are
record byte comparisons (~94 ms), content validation (~69 ms), verified-record processing
(~56 ms), and card rendering (~49 ms). This profile does not establish which causes every 4x tail.

## Measurement and provenance

The [prospective protocol](./protocol.md), original timing build plugin, corrected profile-map
plugin, browser probe and analysis/retention scripts are included. The handler probe wraps only
the existing synchronous `input` function with a clock and numeric append. Frame observation
waits until the target contains the additional character. Metrics contain no writing or identity.
A handler can only enqueue when another job owns admission; one direct sample rounds to 0 ms,
while its separate frame observation retains the waiting time. Reported quantiles use sorted element `floor(n * p)`; keys in a run are dependent, so no
independent-key confidence claim is made. CPU throttling, host scheduling, target size and
background work limit generalization; this session ran no parallel test/build campaign during timing/profile.

The first reference attempt (`reference-1`) completed typing and undo/redo but the probe reloaded
the lock route and could not find the splash button. It is retained as a failed harness log and
excluded from timing: that version did not save its partial sample. Reopening now navigates to
`/`, as the existing cold-open probe does. The first retained baseline preceded the candidate's
additional text/clock/pending-result guard; that guard only executes on the direct path. Both
arms' exact bundled source digests are retained. The profile build additionally selects direct
by default and generates proper instrumentation source maps. Original timing-build source-map
warnings do not affect clock samples; only the corrected-map build is used for attribution.

Synthetic credential/profile/SQLite fixtures stay outside Git. The input fixture SHA-256 is
`426a1199ecc320e6df8caa77264efc9ae08255a88f39db1a1c89cd65632be868`. Numeric samples, CPU profile,
analysis and logs **are included** as compressed files and listed in `manifest.json`; no external
log archive is needed to reproduce the tables. `identity/source.json` binds current runtime/test
inputs; `identity/repair.patch` applies to the signed base. Per-build file and bundled-source
hashes distinguish the reference, direct, profile and ordinary default builds. Scratch Vite builds
retain some older hashed assets; `activeScripts` follows the current HTML/import graph, and
`bundledSources` covers only that active graph. All files, including inactive assets, are hashed.

Run against a private copy of that fixture, with `TYPING_REPEATS=1`, using:

```sh
DONE_PERF_SOURCE="$PWD" \
DONE_PERF_DIST=/tmp/done-text-admission-20261012/direct-dist \
DONE_REOPEN_FIXTURE=/tmp/done-foreground-stall-20261012/diagnostic-before-2/deep-received-fixture.json \
DONE_PERF_RESULTS=/tmp/done-text-admission-20261012/new-observation \
node node_modules/@playwright/test/cli.js test \
  --config docs/performance-experiments/2026-10-12-text-admission/probe/typing.config.ts
```

`TYPING_CPU=4` selects the diagnostic, `TYPING_PROFILE=1` the separate profile. The private fixture
is deliberately not sufficient for a public reproduction without synthetic account provisioning;
the committed unit/native tests do provision their own state. Nothing here measures the user's
personal data, a physical phone, huge individual target texts, or retention independent of total
history. Publication remains the next handoff after this bounded phase is reviewed/committed.
