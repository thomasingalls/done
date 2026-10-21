# Ordinary catch-up: bounded batching with original receipts

**Outcome:** the frozen candidate passes the predeclared bounded comparison. Across three restored pairs with +75 ms per account request, median paired catch-up improvement is **33.7%** (59.389 → 39.233 seconds at the arm medians). Loopback changes 33.727 → 33.675 seconds, with unchanged numeric rates. All fourteen final journeys preserve complete export equality, two-way writing, Undo/Redo retaining remote writing, and locked offline document reopening. This is a local Chromium result, not phone/Firefox/WAN performance, service capacity, production adoption or release qualification.

## What changed

The ordinary receiver carries its already-owned two-to-four limit-one requests through the existing optional `/account/delivery/read-v2-batch` route. The service already has a request-local native authority lease for this route. Each inner read still takes a fresh native snapshot and performs its current issuer/custody, signature, scope, expiry, ledger, served-proof and transaction-time authorization checks. A byte-identical historical authority result can be reused only inside that batch. This patch changes no service source or authority cache.

Every returned page remains an original independently signed v2 single-entry reply, associated with the receiver's captured request by index. The unchanged verifier and group commit retain exact v1 request/page receipt bytes, signature/prefix/expiry/actor checks, atomic durable-before-visible promotion, journal-before-local acceptance, compatible cold readers and the existing four-page publisher turn. New native tests compare decrypted durable events against independently signed original request/page bytes.

The transport reserves a hard 4 MiB aggregate HTTP ceiling. Each individual page must still fit 1,057,280 bytes, and admitted framed pages must fit the existing queue bound. A successful binary aggregate that exceeds that ceiling is canceled and drained before the original individual prefetch collector retries the captured requests; an absent optional route (404) also selects that fallback. The downgrade is confined to the current receive owner. Error hints, malformed declarations/framing, denied authority and invalid evidence cannot select it. Batch plus fallback share one ten-second logical deadline, with close/cancellation draining before ownership is released. Genuine individual refusal remains refusal; superseded aggregate-size observations cannot turn a temporary fallback failure into a permanent rejection. Singleton/self reads retain individual transport.

No persistent format, schema, security promise, rate, burst, concurrency ceiling, maximum publisher turn, send/input scheduling policy or publication window changes. New regression obligations remain blocked from aggregate credit until adapter review. General qualification remains paused.

## Frozen comparison

- Signed branch baseline: `27dc7d78d973f2741a813d8d217f28e0c2f033a4`; preceding evidence-only patch 01/tree `37fa6fc1` is immutable. Exact source and build hashes identify the candidate; its controlled build label is not a signed release identity.
- Node 24.18.0, macOS arm64/M1 Pro, headless Chromium `151.0.7922.34`, same installed/frozen lock bytes. Lock agreement does not audit the complete package store.
- Same actual encrypted UI/API synthetic pair as the [attribution packet](../2026-10-21-live-sync-attribution/README.md): 121 cards, exactly 13,000-byte Goals, matching private browser/API snapshots. A=9/B=2 caught up, A=609/B=2 backlog: exactly 600 accepted missing positions. No fabricated received progress.
- Three paired restored catch-up journeys per delay, order reference/candidate, candidate/reference, reference/candidate; one foreground pair. One worker, no retries, no overlapping measurement/build/validator. New typing is independently offered 120 times at 150 ms while catching up, with a reverse-device sentinel. Initial local opening/unlock is outside catch-up timing.
- The whole restored journey is the analysis unit; individual keystrokes are not independent replicates. Percentiles are descriptive nearest-rank DOM observations, not physical paint measurements or population estimates. The 600-second catch-up ceiling and original functional assertions stay intact.
- Predeclared exit: +75 ms median paired improvement ≥20%, no pair regresses; zero-delay median ratio ≤1.10. Each catch-up pair preserves local p95 ≤max(16 ms, reference+3 ms), peer p95 ≤1.10×reference. Both isolated and continuous foreground p95 obey the same local/peer guards. These experiment guards do not replace TRD budgets.

| Catch-up measurement | Reference | Candidate |
| --- | ---: | ---: |
| +75 ms: median complete old backlog | 59.389 s | 39.233 s |
| Loopback: median complete old backlog | 33.727 s | 33.675 s |
| +75 ms: receiver HTTP reads, range over three journeys | 620–622 | 161–166 |
| Loopback: receiver HTTP reads, range | 618–621 | 171 |
| +75 ms: receiver signed inner requests, range | 620–622 | 616–623 |
| Loopback: all-device HTTP 429s, range | 1–4 | 6–8 |

The +75 ms gain repeats in every pair (32.3–33.9%); reference duration drift is 4.45%, below the predeclared 15% investigation threshold. Loopback median paired change is only 0.15% faster, including one 25 ms regression. Candidate loopback runs record 6–8 HTTP 429s versus 1–4 for reference. This supports investigating the unchanged work budget as a remaining constraint; it does not establish safe capacity or the full causal contribution of rate limiting. Requested inner bodies include refused/retried predictions, not counts of actual native executions. No +75 ms arm records a 429.

All original inner queries still sign limit=1. Fewer HTTP calls alone are not progress evidence; complete exports, client prefixes, independently observed DOM curves and native receipt comparisons are separate checks. Some CDP bodies are unavailable after HTTP 200 because the application cancels a completed reader. These are neither proof of data loss nor silently counted as readable pages.

[Acceptance](./acceptance.json) independently reconstructs the reported DOM percentiles from raw observations and checks every matched complete export. [Analysis](./analysis.json), [raw numeric runs](./runs/primary/), [prospective protocol and chronological amendments](./protocol.md), [source/build identities](./identity.json) and [runner plan](./matched-plan.json) preserve the chosen denominator. Reference drift and all per-pair guard values are retained.

## Challenge and regression evidence

All 34 new regressions pass (17 unit and 17 actual encrypted receiver cases), including the production prepared-receive variant. Final checks also pass 114 focused unit cases in total, 28 existing receipt/group native cases (including twelve generated histories), six original prefetch cases, four effective omission controls, seven prepared-editor cases, nine HTTP lifetime cases, 28 service batch/authority-reuse/work-budget cases and 85 planning tests. TypeScript, targeted normal lint/format, frozen 232.5 kB initial-JS budget and origin scan pass. No full-suite or aggregate qualification credit follows.

Keep the [attempt record](./attempts.md), [failed/successful check logs](./checks/), [unsuccessful prototype sources](./prototypes/) and [exploratory observations](./runs/exploratory/). The three-page V1 prototype worsens catch-up to 70.691 s; V2's scheduling change reaches 48.788 s but misses the frozen target and is restored out of the final patch. V3 exposes an oversized-error-hint classifier defect, then an aggregate-overflow/fallback diagnostic leak. The final comparison restarts only after their actual native falsifiers pass. No earlier pilot or interrupted comparison is counted in final acceptance.

Older individual-prefetch tests now explicitly serve 404 for the optional route, retaining all six old cases. Two pre-existing omission-control defects reproduce on the signed baseline: a stale queue-statement anchor and eager stream prefill that signals before the HTTP reader waits. Narrow fixture repairs restore all four effective baseline/mutant distinctions. Every old assertion, deadline, uniqueness check, release block and construction contract remains. [Check accounting](./test-results.json) distinguishes final executions, earlier unchanged-path evidence, failed invocation/fixture attempts and planning-only checks.

The release manifest retains every old obligation unchanged and adds two blocked test files: 878 obligations / 334 unresolved, versus 876 / 332. No old obligation gains credit or loses its block. Planning snapshots are not aggregate execution or release readiness. Frozen budget/origin checks pass; standalone archive runs cannot write Git-bound execution receipts, so exact source/build evidence is recorded separately.

## Reproduction and boundary

[Reproduction sources](./reproduction/) contain the exact journey/proxy/analyzers, runner, identity and preservation programs. Use the preceding packet's disposable seed constructor and these updated probes in isolated baseline/candidate archives. Build with the recorded environment, create fresh virtual credentials and matching encrypted storage/API state, then execute the serial plan. Ports 53781/53782/53784 are disposable loopback endpoints. Private snapshot JSON, keys, codes and API state are excluded from Git by an explicit whitelist; the [privacy audit](./privacy-audit.json) scans exact known fixture values and is not a general secret detector. Artifact provenance and `SHA256SUMS` bind retained bytes.

This phase implements and measures ordinary catch-up grouping. It leaves foreground publication timing and remaining fresh authority/ledger work for separate investigation. The loopback refusals motivate a bounded capacity/rate experiment before any policy change. No signing, commit, push, preview restart, merge, deployment or generalized qualification resumption occurs. `docs/progress.md`, preceding packet bytes and the deferred formatting artifact remain untouched.
