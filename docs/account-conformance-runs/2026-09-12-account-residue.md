# R1 logical-carrier residue campaign — 2026-09-12

Baseline: signed `6a9c9c42d2d10a1d0dbfd3030497b5a3cb0fe248` (residue preparation).
Command: `node scripts/account-residue/run.mjs`, also exposed as `pnpm account:residue`.
UTC execution: `2026-09-12T00:36:59.829Z` through `2026-09-12T00:41:09.917Z`.
Node `v26.8.2`, Chromium `151.0.7922.34`, Darwin `25.5.0`, arm64.

**Passed: 7 stages, 16 Node test cases, 144 calibration cells, 26 directed checkpoints and 24 generated
histories.** All 871 source pins match. Types, scoped lint and formatting pass. No skips, cancellation
or stage timeout. No production code, protocol format, dependency or vector changed.

| Executable group | Node test cases | Result |
| --- | ---: | --- |
| Instrument | 10 | Encodings, budgets, raw key calibration, missing/legacy coverage, fence bytes and dependency independence |
| Native calibration | 2 | 144 applicable surface/representation cells; collector omissions and structured-clone controls |
| Directed lifecycle | 3 | P0–P7, 26 measured checkpoints including the intentional journal side-write leak |
| Generated lifecycle | 1 | 24 completed histories, seed `1121040`, 0 shrinks, no counterexample or interruption |

The [155 checkpoint records](./2026-09-12-account-residue/checkpoints.json) comprise 26 directed and
129 generated observations: 154 report no prohibited matches and complete acquisition; the deliberate
native journal side-write reports its expected W match. Calibration plants are separate from these
checkpoint counts. Cold readback checks the expected introduced writing independently of the scanner.
There are 678,338 acquired value observations and 13,882,814 bytes across repeated acquisitions; these
are not counts of distinct physical values, secrets or independent statistical samples.

## Evidence and interpretation

[Scope and limits](./2026-09-12-account-residue/scope.json),
[source pins](./2026-09-12-account-residue/sources.json),
[stage summary](./2026-09-12-account-residue/summary.json),
[calibration matrix](./2026-09-12-account-residue/calibration/calibration-matrix.json),
[collector controls](./2026-09-12-account-residue/calibration/collector-controls.json) and
[generated histories](./2026-09-12-account-residue/generated/generated-histories.json) are preserved
with the original logs. The [implementation description](../account-residue-r1.md) explains the owners,
collector boundaries, explicit flush hold and receive-retry action. Polling cadence is not measured.

The collector discovers unknown browser stores/keys and every current service/authority SQL table.
It scans raw values before hashing or redacting reports. Structured views, Blob/File data, JSON escapes,
hex and prefixed base64 are calibrated. Each required collector has an actual omission control; other
controls skip property keys, Blob or view bytes, truncate a file across the 64 KiB point, hash before
matching and omit base64 decoding. Every control breaks its passing detection assertion. Unsupported
clones and exhausted budgets yield incomplete coverage. CryptoKey contents remain explicitly opaque.

Actual owner paths include browser recovery generation and retained finalization, which the older
native `ready()` helper bypasses. The sensitive retry capability is observed at the documented
`retryKey` and `finalization.retryKey` fields. Those matches are reported separately; they are not
public metadata or a claim of universal secret absence. No W/F or unexpected T match occurs in normal
histories. No real Account, second device or personal data participates.

Service stdout/stderr are captured in a separate process. Observer IPC fence bytes remain in the raw
scan and archive; only the equality comparison of the two acquisitions ignores those known frames.
Page console arguments have a generic byte-preserving reader instead of relying on console summaries.
Unexpected workers or unreadable arguments prevent a clean result. No proxy/system/third-party logs
or physical browser log files are implicitly covered.

## Preservation and unsuccessful preliminary attempts

The [original artifact index](./2026-09-12-account-residue/original-files.json) pins all 482 original
files in `test-results/account-residue/2026-09-12T00-36-59.609Z`. The
[compressed synthetic observations](./2026-09-12-account-residue/synthetic-observations.tar.gz)
preserve all 472 JSON stage artifacts, including acquired raw values and controller-held synthetic
needle/factor manifests. Every member was read back and verified byte-for-byte against the original;
[archive metadata](./2026-09-12-account-residue/archive.json) records the digest. These are deliberately
separate test artifacts, not an app-managed carrier or a copied filesystem-profile sample.

[Focused-attempt notes](./2026-09-12-account-residue/focused-attempts.json) distinguish harness defects
and missing evidence from product failures. Early detector tests exposed nested JSON escape and
diagnostic-line gaps. Initial fixture assertions used the wrong initialization baseline and receipt
field, and omitted the real capture/spool/delivery preparation sequence. These were corrected.

The first focused generated attempt exhausted its unchanged 270-second budget without completing
24 histories; no per-history archive was enabled for that attempt and no runtime counterexample
surfaced in its output. It is incomplete evidence. Explicit receive retry after publication avoids
waiting solely for periodic polls; progress and raw evidence are now recorded per history. A subsequent
[passing run](./2026-09-12-account-residue/prior-run-summary.json) completed all 24 histories. The final
run above repeats the campaign after tightening raw diagnostic-fence treatment, testing a valid but
incorrect factor, recording runtime versions and enforcing nonzero test/point evidence. Its generated
stage completed in 223.7 seconds under the original budget. No production defect was found.

[Preservation](./2026-09-12-account-residue/preservation.json) verifies all 21 personal package files,
31 vectors, historical review and L-2. All seventeen recent signatures verify `G`. The preparation's
71 pins and the prior admission campaign's 898 pins match their committed sources; the only current
difference among those files is the new package command. New bundles stayed in memory. Personal
preview/relay remain stopped and the personal Local installation is unchanged.

The new R1 phase is complete, unstaged/uncommitted. Full Vitest, prior unrelated native campaigns,
aggregate crypto/vector execution, packaged UI/service-worker/export and migration/clear paths,
physical profile/SQLite/WAL/deleted-byte residue and other platforms were not tested here. Marker
fragmentation is a demonstrated limit; arbitrary transformations and key/opener confidentiality need
separate evidence. **F-21.4 remains open for those wider obligations.** See the
[current disposition](../review/implementation/account-residue-evidence.md).
