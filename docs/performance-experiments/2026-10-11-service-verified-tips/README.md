# Verified service publisher tips

The service's ordinary submit, delivery-read, discovery and history-read paths now reuse a verified
publisher tip. They load/verify new rows and freshly check returned entries instead of replaying old
ciphertext on every request. The 512-row verification-cache cliff is removed from those paths.
This packet is focused implementation evidence, not release qualification or a deployment receipt.

## Result

Serial Node 26.11.1 / macOS arm64 measurements on this Mac. Disposable, genuinely signed epoch-1
ledgers, with general membership and sessions enabled. Five observations per warm cell; one cold
observation. Baseline `39914c69` versus the final working sources recorded in `sources.json`.
The fixture has small envelopes and a small genesis checkpoint. No browser typing, network,
mobile-device or large-checkpoint speedup is inferred from these numbers.

Median milliseconds, baseline → candidate:

| Retained positions | Warm one-entry read | Next-position submit | Catalogue read | First read |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 6.30 → 4.85 | 9.14 → 6.79 | 14.46 → 8.43 | 6.93 → 6.33 |
| 128 | 25.14 → 6.62 | 23.96 → 6.64 | 112.69 → 8.62 | 122.52 → 87.04 |
| 512 | 66.02 → 6.04 | 413.34 → 6.22 | 396.63 → 8.41 | 423.75 → 312.82 |
| 1,024 | 813.79 → 5.62 | 837.21 → 6.18 | 775.78 → 8.87 | 813.15 → 555.54 |
| 3,072 | 2,409.44 → 6.07 | 2,397.45 → 5.83 | 2,286.96 → 8.05 | 2,417.16 → 1,688.71 |

The 512-position submit group crosses the old 512-row bound on its first append. The fixture does
five appends after the read cells, so catalogue/audit extents are depth + 5. At depth 3,072, the
candidate's counters show **one full census and 3,077 total verified rows**, not one census per
request. Six read calls check twelve served/predecessor rows freshly. Serialized tip accounting is
1,674 bytes (not a V8 heap measurement), versus 1,650 bytes in the depth-zero cell. It retains no
old wire/response arrays, checkpoint content, or branded membership objects.

A full off-thread audit of 3,077 rows took **1,683.28 ms**. While it ran, 102 empty-tail requests
completed, median **5.73 ms**, p95 **6.32 ms**, maximum **10.15 ms**. The audit completed successfully;
no publisher was quarantined. This demonstrates main-loop progress, not absence of shared CPU/I/O
contention. Raw arrays are in `final-candidate.jsonl`; summaries are in `summary.json`.

The predeclared warm-read target (<100 ms and <25% of baseline at 3,072) passes. No increasing
ledger-length slope is resolved in these small warm samples. Indexed COUNT still scans index
entries, so this does **not** establish constant-time SQLite work or unlimited-scale performance.
Cold verification and full audits remain linear in ledger length. The receive-loop/custody work,
real two-device catch-up rate, accepted-position interval, and keystroke-to-peer delay are next.

## Safety and ownership

See the [decision](../../decisions.md#2026-10-11--verified-service-publisher-tips-with-asynchronous-integrity-audits)
and [current service contract](../../account-service-delivery.md#current-verified-tip-integrity-policy-2026-10-11).

- One compact tip per publisher, at most 128 tips / 16 MiB accounted retention. Exact authority
  snapshot SHA-256, witness and indexed count fence reuse. External SQLite data_version changes,
  authority changes, pruning, close and detected races invalidate it. Eviction cold-verifies again.
- A returned row gets fresh wire/response signatures and binding checks; its signed predecessor
  provides the previous link. Compact pruned evidence is checked when used for a checkpoint cut.
  New links/witnesses extend the authenticated tip, never a recomputed unchecked disk prefix.
- Historical retries and unfinished refusal tails retain the full reference census, preserving
  exact decisions, issued parents and permanent closures without caching unbounded maps. Lifecycle
  mutations keep complete verification and honor the same publisher quarantine.
- Full audits run in one read-only SQLite worker snapshot, after 256 appended events and on backup
  cycles. Queueing coalesces by publisher. The worker gets a pin and expected header digest, enables
  the same membership readers, and reconstructs public authority itself. It receives no signing
  issuer or operator wrapping key. Completion uses a short coherent read and cannot reinstall a
  closed/stale view. Backup-triggered audits are independent of B2 upload success; backup payloads
  are not newly certified as semantically corruption-free by this change.
- A detected mismatch quarantines that publisher until restart plus full verification, emits fixed
  `ledger-integrity` to the operator, and performs no repair. Ordinary delivery/history reads expose
  that unsigned reason. Older closed lifecycle refusals keep their generic envelope, with the same
  fixed operator diagnostic and refusal interlock. No new authority/remint permission is implied.
- An unread old row changed without count/witness changes or SQLite change tracking can remain
  undetected until audit. Before detection, a new signature still commits to the previously verified
  prefix, not the changed bytes. Whole-store coordinated rollback remains outside this mechanism.

Canonical hex conversion also drops per-byte conversion callbacks/pair arrays, preserving the old
canonical language and detached-buffer failure. The probe measures the combined repair; it does
not isolate this helper's contribution.

## Checks and defects found during implementation

- `focused-regressions.log`: 118 passing delivery, inbound, restart, liveness, history, membership,
  discovery, HTTP and backup-worker checks on the first integrated candidate.
- `final-controls.log`: 38 affected integrity/history/pruning/cache cases pass after the fixes.
- `lifecycle-quarantine.log`: eight real-service rotation, replacement, recovery and history cases pass.
- `membership-audit-controls.log`: two cases prove worker audits across rotated membership and that
  checkpoint mutation cannot bypass a running publisher quarantine after its damaged byte is restored.
- `tip-controls-final.log`: 14 targeted cases pass, including canonical conversions, simultaneous
  requests, abort/lost reply, stale preliminary verification, served and unserved corruption,
  count/witness changes, external writer, audit/close, and automatic audit scheduling after 256 rows.
- Full TypeScript build, production Vite build, Yjs patch check, asset budget and origin-isolation
  check pass (`build.log`). No generalized conformance, mutation, inventory or release campaign ran.

Retained counterexamples/corrections:

1. Empty approved publisher streams initially used a fabricated snapshot; the final guard could not
   match it. Two existing multi-device history cases failed, then passed after capturing real empty
   streams. See `history-read-before-fix.log.gz` and `history-read-after-fix.log`.
2. The first audit completion read lacked a transaction required by the general membership reader.
   The large audit overlap probe exposed an uncaught exception. Completion now owns a short read
   transaction and handles failures. `audit-before-fence-fix.*` and the compressed pre-fix owner source
   preserve the attempt.
3. Review found that branded membership objects cannot be structured-cloned into a worker as trusted
   authority. The worker now independently verifies public authority. The rotated-membership audit
   then exposed a second process-local setting: the readonly connection needed the membership-reader
   opt-in. `membership-audit-before-flag.log` retains that failure; the final control passes.
4. Prior pruning/cache tests expected restored bytes to clear an in-memory corruption refusal. They
   now require operator restart/full verification, and repeated corruptions are independently
   exercised rather than merely hitting an earlier quarantine.

The early `baseline`/`candidate` pair used the original epoch-1 fixture without general membership;
`membership-baseline`/`membership-candidate` added the supported configuration and catalogue reads.
Keep these exploratory samples separate from the final comparison. Intermediate candidates are
working-tree diagnostics, not immutable build identities; only the final runtime sources have the
complete final hash manifest. `audit-before-membership-flag.*` passed its epoch-1 overlap check but
predates the rotated-membership worker repair; do not substitute it for the final evidence.
`candidate-before-full-scan-query.*` is a passing intermediate repeat before restoring the exact
reference SQL query for full censuses (no ordinal filter). The final repeat measures that final code.

A restricted run of the history suite encountered the expected localhost-listener EPERM and the
then-unfixed quarantine-test expectation. Both are retained in `initial-history-tests.log`; the
focused run with disposable listeners allowed passed. The package-manager wrapper could not verify
its registry identity under restricted networking; installed repository compiler/formatter/build
binaries were used directly, not reinstalled. No production service or user database was touched.

## Reproduction

Probe: `scripts/performance/service-verified-tips.mjs --membership --audit` under Node. It creates
and destroys disposable real-account fixtures, constructs independently framed signed submissions,
uses fixed-purpose service signing to seed rows in one transaction, and validates the entire seed
with the reference census before measuring. The archived `initial-probe.mjs` is a source copy of the
original script at that path, not a standalone executable from this documentation directory.

For the baseline, archive `39914c69`'s `account-service`, `account-protocol`, `src`, `test`, package and
lock files into an isolated directory, supply the existing pinned dependencies, copy the final probe
to `scripts/performance/`, and omit `--audit` (the old owner has no worker). Run serially, without
other heavy work. The final candidate adds its audit only after every matched timing cell finishes.
Commands and source/artifact hashes are retained alongside the logs.
