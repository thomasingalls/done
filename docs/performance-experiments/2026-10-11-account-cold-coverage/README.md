# Cold-open coverage: encode the baseline once

The fourth bounded cold-open slice improves the deep fixture's median time to an editor frame from **2.577s to 2.341s (9.2%, 236ms)**. It follows the three uncommitted repairs on signed `4bcac419`; the comparison is against those repairs, not the original quadratic implementation.

## Change and retained proof

The live incremental owner's accepted-source coverage check prepares one encoded baseline for its synchronous call. Every previously unproved original still receives an independent `gc:false` fork, application and full state comparison. Integrated identity, deletions and content, exact pending bytes and missing-dependency bookkeeping are checked. Existing UTF-8 and GC/split-boundary normalization remains available. A missing source cannot be hidden by applying later sources to the same fork.

Prepared bytes and comparison scratch are cleared in `finally`. No baseline crosses calls, tasks or content changes. Existing exact-original and bounded positive caches are unchanged. The ordinary full verifier and isolated audit continue using the previous per-source fork/apply/compare path. Stored and wire formats, cryptographic checks, ownership boundaries and admission policy are unchanged.

## Matched observations

Same private 2,320-edit / 295-position fixture: 2,354 source capsules and 3,830 physical rows. Five alternating pairs, offline after assets are cached; virtual unlock included. The primary clock is the previous packet's in-page MutationObserver plus two animation frames, rather than Playwright's visibility polling. It approximates a rendered frame, not hardware scanout.

| Observation | Baseline median (range) | Candidate median (range) |
|---|---:|---:|
| Deep first editor frame | 2,577ms (2,551–2,595) | 2,341ms (2,302–2,356) |
| Accepted-source coverage | 615ms (604–624) | 376ms (374–379) |
| Live-owner opening | 1,446ms (1,434–1,450) | 1,205ms (1,192–1,218) |
| Preliminary recovery | 873ms (857–888) | 880ms (864–896) |
| Collected heap | 17.26MB (17.23–17.56) | 17.54MB (17.21–17.54) |
| First card edit after collection | 23ms (22–26) | 23ms (22–26) |
| Receiver frame, three pairs | 699ms (688–703) | 699ms (697–704) |
| Fresh frame, three pairs | 193ms (190–197) | 204ms (186–206) |

Coverage time falls **38.9%**; all **2,355 independent checks** remain. Candidate prepares exactly one baseline for the deep opening; receiver and fresh fixtures prepare none because their originals are covered by the unchanged byte index. Fresh median is 11.5ms higher, with overlapping ranges and essentially unchanged measured owner/recovery work. No fresh speedup is claimed. Deep collected-heap median is 0.29MB higher, with overlapping ranges; this does not establish identical memory use or bound peak temporary allocations.

Both deep arms retain one preliminary Account validation, two full delivery/inbound verification passes, three nested censuses, 590 prefix-link computations, five physical reads / 19,150 rows, and 21,188 source parses. Native operations remain 8,286 decryptions, 2,447 verifications, 11,012 digests, 1,320 imports and 660 derivations. Improvement comes from repeated Yjs serialization/comparison setup, not omitted history or authority checks.

All **22 matched opens** pass. Samples, numerical summaries and every run log are retained. One separate profiled open and two ordinary-build edit/reopen checks are excluded from the matched samples. No test/build ran concurrently with paired timing; unrelated host activity is not controlled.

## Scope and next opportunity

The predeclared adoption criteria are met. All five candidate deep samples are below 2.5 seconds on this desktop fixture. This is not a release qualification, a phone result, or a claim about arbitrarily large histories. Historical polling-based numbers must not be compared directly with these frame timestamps. Delayed second-device network catch-up remains a separate investigation.

The separate profile reports 2,356ms active CPU. Inclusive, overlapping costs include the nested inbound/delivery census at about 553/539ms, source decoding at 381ms, and remaining coverage at 365ms. Hex encoding is the largest individual sampled self cost at 208ms. Further cold-open work would now target canonical byte/text conversion and repeated census parsing; these are measurements of remaining work, not a forecast of removable time. The full cold verifiers still run independently at their ownership boundaries.

No commit, deployment, production configuration change or release-validation campaign occurred. All four cold-open slices remain in the working tree. The other seat's `docs/progress.md` remains untouched.

## Reproduction

- [Protocol](protocol.md) records hypotheses and thresholds before implementation.
- [Verification](verification.md) records focused checks and the fixture failure.
- `baseline.patch` and `candidate.patch` apply to signed `4bcac419`; `coverage.patch` isolates this slice on top of the baseline. `source.json` identifies tested source hashes.
- Build separate archives with `VITE_ACCOUNT_LEDGER_PROFILE=1`; build the ordinary archive without it. Symlink the repository's pinned dependencies. Use the full parent revision plus `-dirty` for `APP_BUILD_REVISION`.
- `probe/run-pairs.mjs <private-fixture> <deep|receiver|fresh> <pair-count>` alternates arms on private ports 53771/53772. Its fixed scratch root is `/tmp/done-account-cold-coverage`. Private fixtures contain disposable credentials and are deliberately not included.
- `probe/summarize.py <scratch-root>` produces `summary.json`. `observations/` contains all 22 opens. `profile/` contains the separate profile and summary; inherited `msPerKey` means milliseconds per one open here.

Ordinary online/deep and offline/receiver checks use `COLD_NO_DIAGNOSTICS=1 COLD_RECOVER=1`, with `COLD_ONLINE=1` only for the deep case. They verify a new edit through lock/reopen and assert that application diagnostic globals are absent.
