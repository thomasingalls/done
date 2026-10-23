# Sustained admission versus useful native work

Six completed runs, three restored alternating pairs, follow exact-accounting phase A. The comparator is cumulative authority-reuse tree `7e020ea4`; the repaired adapter is frozen tree `0e9f74e9`. Each run restores identical private SQLite/key/session inputs. New access/grants are issued before timing without changing expiry. Both numeric rate policies remain identical.

The native API workload reads 1,024 independently signed accepted positions, four limit-one requests per batch, while a writer uses the same session every 500 ms and a second account reads its own stream every 250 ms. API CPU/RSS come from a separate server process; client framing/oracle work is outside that process. One cold census can return a shorter batch, so exact prefix completion requires 257–261 requests rather than always 256. Every retrieved entry is independently verified. This is a content-blind first-epoch service fixture, not a browser/deep-membership reconstruction.

| Observation across three runs | Old accounting | Exact accounting |
| --- | --- | --- |
| Replay elapsed | 68.299–70.403 s; median 69.226 s | 66.672–67.526 s; median 67.065 s |
| Replay 429s | 59–62 | 56–59 |
| Explicit replay backoff | 61.103–63.124 s | 56.110–59.113 s |
| Maximum interactive write latency | 3.018–3.023 s | 1.021–1.029 s |
| Accepted interactive writes | 102–110 | 112–122 |
| Second-account 429s | 0 | 0 |
| API process CPU | 10.640–10.993 s | 13.427–17.068 s |
| Sampled API RSS peaks | 232.260–241.517 MB | 270.975–306.987 MB |

All writes complete with HTTP 200 after the retained bounded retries. A separate read-only cold SQL audit verifies every authored seed and interactive submission byte and every stored accepted proof (1,126–1,146 accepted positions per run). Live write response bytes were status-checked but not retained or independently verified; the cold audit supplies stored evidence, not a claim about captured live reply bytes. The second account's returned pages are independently verified live.

## Decision

The rate policy demonstrably dominates this workload. The accounting repair improves coexistence and avoids phantom spending; it does **not** make long limit-one replay fast. It also permits more overlap and shows higher process CPU/RSS in this workload; those costs are retained. RSS is sampled every 20 ms, not a whole-heap upper bound, and these results do not establish safe production-wide capacity. Keep numeric rate/burst ceilings. Next test fewer, denser pages under the same policy and preserved checks rather than select a global rate increase from this first-epoch fixture.

The prospective protocol names units, outcomes, writer/second-account guardrails and limits before measurement. Per-request samples are dependent; no population CI or phone/WAN extrapolation. The Host-header and sandbox fixture attempts belong to phase A. The initial API pilot had an unacknowledged child shutdown that masked an asynchronous grant-result capture error; both failures are retained, followed by a successful 32-position pilot. They are not mixed into the six ordinary measurements. No concurrent build/validator ran during these measurements.

Numeric statuses/timings/probe source and source/fixture hashes are retained; raw private keys, session tokens, service databases and wire payloads remain outside Git. No code/rate change in this evidence phase, no commit, preview restart, push, merge, rollout or qualification resumption. All previous blocks remain; docs/progress.md and immutable earlier patches are untouched.
