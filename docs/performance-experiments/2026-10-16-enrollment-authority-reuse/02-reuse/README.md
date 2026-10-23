# One read group's verified authority evidence

Phase 2 follows the attribution and one-character fixture repair. The exact contract lives in [account-receive-transport.md](../../../account-receive-transport.md); the prospective selection and review amendment live in [protocol.md](../01-attribution/protocol.md).

## Change and security boundary

Reuse one fully verified historical workspace-authority result within a single sequential read batch, following the existing pattern of exact-input evidence reuse under a short-lived owner. Compare process-local serialized pin/header bytes from **each fresh native snapshot**; only decision rows are excluded because their independent ledger/served-row checks follow. A changed context or verifier, unsupported serialization, or context larger than 2 MiB uses full verification. Contexts are never persisted or networked. The size limit is retained context bytes, not a whole-heap/derived-graph bound.

A private runtime brand fences forged, concurrent and retired owners. Every hit repeats all captured native custody checks with the current issuer; close/input changes during verification or checks refuse. Failure clears the entry. Mutable result fields are detached, while immutable membership/history values retain their private protocol identities. The four-read, 250 ms completed-work, byte/inflight and HTTP deadline bounds remain. Per-request scope/signature/expiry, reader roles, grants/sessions, ledger/served proofs, fresh transaction-time comparison, signing, client replay and installation/certification remain unchanged. No storage format, key, factor or cryptographic construction changes.

## Ordinary matched comparison

Both arms use the exact signed frontend `2f1d0b0f`. The reference API is signed source; the candidate API is identified by `timed-candidate-identity.json`. No diagnostic timers, inspector, added network latency or simultaneous validators run during timing. Each owner slice restores one identical pending comparison/service fixture; three pairs alternate order within the unchanged ceremony lifetime. The fresh guardrail has one pair.

| Owner / edit bursts | Reference median | Candidate median | Median paired improvement |
| --- | ---: | ---: | ---: |
| Original / 96 | 8,859 ms | 5,488 ms | 38.06% |
| Joined / 96 | 8,872 ms | 5,893 ms | 33.50% |
| Original / fresh | 3,373 ms | 3,341 ms | 0.95% (one pair) |

All 14 connections pass certification, exact Goals, whole-export entry names/bytes, two-way writing and lock/reopen checks. All six 96-burst pairs improve; both owner slices meet the prespecified >=10% median paired target. `summary.json`, compressed observations and original Playwright reports retain every sample, foreground/DOM busy timing and certification timings. The foreground metric includes automation/actionability/assertion/UI delay, not solely cryptographic execution. These are small serial desktop/local-service engineering results, with no population, phone, WAN, long-history or sustained-capacity guarantee. Do not pool them with earlier delayed-transport experiments.

## Controls and preserved failures

- Thirteen new Node cases exercise genuine native authority, repeated native custody checks, mutable-result isolation, every header/pin/artifact/witness change, unknown fields, decision-row separation, forged/concurrent/retired owners, late close/input changes, failed verification, oversized/unsupported inputs, verifier identity, real SQL authority and served-ledger corruption, and no partial batch output. Together with preceding scoped/core/publisher checks, the final focused run passes **48 cases**.
- The first prototype used JSON equality. A new Map-valued-header counterexample failed, revealing a future-field collision. Its failure and exact helper are retained. Process-local V8 byte equality and unsupported-value fallback repair it. All ordinary matched measurements use the final helper; the frozen file hashes match the final working runtime sources.
- Nine packaged journeys pass on the earlier JSON prototype after the fixture repair, including old-server fallback, malformed replies, progress, delayed installation, lost publication/resumption and original/joined post-rotation behavior. Three targeted journeys (capacity and both rotation histories) pass again on the **final V8 helper**. Do not present the earlier nine as a final-source full suite.
- The new capacity regression holds a real history request, observes zero verified progress, injects an explicit 429 before execution, requires a byte-identical retry and finishes certification/writing. Existing retry delays and work limits remain unchanged; this is not a sustained-rate benchmark.
- Initial candidate failures, independent reference failures/passes, the JSON counterexample and the wrong-cwd attempt remain in the evidence. Passing reruns do not erase them.

TypeScript, changed-file normal lint/format, production build, 232.6 kB initial-JS budget (350 kB limit), origin isolation, and affected registry/adapter checks pass. Ordinary CI explicitly includes the new Node and browser cases. Planning metadata retains every prior obligation, stage outcome, assertion, deadline and release block: **869 obligations, 325 unresolved**; the two new test files remain blocked from aggregate credit pending adapter review. All 78 specified and 14 open construction statuses remain. Exact inventory/source-site changes grant no qualification credit.

## Operational limits

New API reuse is not running on port 8443: only the requested signed progress frontend was updated, preserving its existing older API. No new optimization commit, push, merge, production rollout or general qualification was requested/performed. No real user data or personal browser is used. Raw disposable keys/codes/state stay outside Git; text probes/configs and compressed numeric evidence are retained. Apply the two reviewed patches in order from signed `2f1d0b0f`; the current checkout already contains their cumulative changes. Remaining phone screen-lock behavior, incremental replay resume and the earlier missing desktop account remain separate.
