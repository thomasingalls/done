# Budgeted membership verification and one-operation proof reuse

2026-10-12 · base **signed `b656553a`** · branch `codex/warm-ledger-loads`.
The preceding bulk custody experiment is committed; this implementation and evidence are local and
unpublished. Release validation remains paused.

**Decision: keep the candidate enabled.** It meets the prospective mechanism and long-task criteria:
one complete unchanged discovery makes **214 → 108** generic signature checks (49.5% fewer), and
maximum long tasks fall **30–53%** in all four matched comparisons. Both arms still perform **three
fresh authority checks** per complete discovery. Typing p95 is mixed, including a 53% backlog
regression in the first pair that does not repeat in the reversed-order pair. This is a reduction in
membership-proof stalls, not a typing-budget pass or demonstrated catch-up throughput gain.

## What changed

An optional checkpoint follows asynchronous proof operations throughout the membership chain. The
client supplies its existing 8 ms cooperative budget with owner lifetime and captured-context checks.
Service callers omit it. Every signature, request-binding, ancestry and eligibility check remains;
one synchronous operation can still exceed the budget.

Within one private discovery/adoption operation, installation consumes the reply's already verified
history after a fresh complete authority inventory check, exact captured context/payload checks,
held-authority validation and expiry checks. Preparation uses an independent genesis-anchor clone
captured at authenticated startup instead of re-authenticating the entire unchanged custody record.
Public raw-proof adoption remains independently verified. Actual membership changes retain their
existing full authenticated custody reads, ledger checks and CAS/readback. There is no cross-request
proof cache. Normal and terminal-removal discovery share the private boundary.

The [contract](../../account-membership-proof-work.md) describes invalidation and ownership.
`VITE_ACCOUNT_MEMBERSHIP_WORK=0` restores the reference behavior. Bulk custody reads remain opt-in;
the ordinary cursor was used in both arms. No editor, undo, journal ordering, stored/wire format or
schema changes were made.

## Matched CPU-4x results

Eight serial restored sessions: same 120-card/~60 KB workspace, 12 KB Goals, ~400-character edited
card, 120 keys at requested 150 ms gaps, CPU-4x receiver, 75 ms artificial request delay. Active-peer
runs include ten peer edits; backlog runs start 600 positions behind. Repetition one runs reference
then candidate; repetition two reverses that order. Shared timing instrumentation, no CPU sampling.

| Condition | Frame p95, reference → candidate | Longest task, reference → candidate | Task reduction |
| --- | ---: | ---: | ---: |
| Active peer, 1 | 59.1 → 47.4 ms | 125 → 63 ms | 49.6% |
| Active peer, 2 | 50.3 → 51.9 ms | 137 → 64 ms | 53.3% |
| Backlog, 1 | 48.8 → 74.7 ms | 112 → 64 ms | 42.9% |
| Backlog, 2 | 89.8 → 87.2 ms | 118 → 83 ms | 29.7% |

All sessions preserve exact text, last-key undo/redo, peer writing, export convergence and cold
offline replay; completed account requests during typing are HTTP 200. Progress continues in both
arms. The eight sessions are the independent analysis units, not the 960 dependent keystrokes.
Two repetitions support only a directional comparison; they cannot establish rare-event rates or
physical-phone performance. Shared instrumentation overhead is unmeasured. Automated input can
undersample blocked intervals. Work completed during typing varies, so totals are not fixed-work
throughput estimates. Individual frame maxima still reach 132 ms on the candidate.

The [protocol](protocol.md) was written before implementation/measurement. Its activation rule was
at least 25% duplicate-work reduction and at least 25% maximum-task improvement in both modes and
repetitions, correctness/progress intact, and no **repeated** >20% p95 regression. All conditions are
met; the first backlog p95 regression remains part of the result. The 50 ms working target and 16 ms
TRD target are not met across conditions. No claim is made that every key becomes faster.

## One complete operation, counted separately

Typing-window HTTP reply counts can include work whose verification crosses the window boundary.
Consequently the signature-per-HTTP-discovery ratios in `summary.json` are only proxies. The named
mechanism diagnostic in the protocol drains a warm discovery and then measures one complete
unchanged discovery through private installation on each arm:

| Operation count | Reference | Candidate |
| --- | ---: | ---: |
| Generic signature checks | 214 | 108 |
| Receipt verifications | 20 | 10 |
| Certification-successor verifications | 4 | 2 |
| Extra full joined-custody authentications | 2 | 0 |
| Fresh authority checks | 3 | 3 |
| Private verified-history transfers | 0 | 1 |

This removes the second top-level chain verification, not every repeated sub-proof inside a chain.
Both diagnostic operations return unchanged. Test-only owner exposures/fault controls are absent
from ordinary and timing bundles.

## Remaining work and limits

The fresh final authority read remains inside the editor fence. Its median is **30–46 ms** in these
candidate sessions, versus **28–39 ms** in the reference; canonical apply/publication medians are
**7–8 ms**. The intervention does not improve those reads. A smaller longest CPU task can coexist
with a slow frame that waits for asynchronous authority IO. The previous bulk-reader experiment
did not improve that wait reliably either.

The next bounded investigation should separate database open/read/close and scheduling waits within
that fresh authority span before changing its lifecycle or the final fence. Retain the complete
fresh check; any queue redesign must avoid holding storage while waiting behind a forced local
write. Protocol sub-proof deduplication and authenticated local retention remain separate work.

## Checks, provenance and reproduction

[checks.md](checks.md) records focused passes and every harness correction. There are 230 passing
Vitest tests (one existing skip), 37 focused protocol tests, three prepared-receive native cases,
six disposable packaged fault controls and two complete-operation diagnostics. TypeScript, scoped
lint/format, ordinary build and JS budgets pass. An accidentally broad legacy selection was stopped;
a narrowed baseline/candidate comparison has the same 15 failures in 20 tests on each. Those are
not passing evidence and were not repaired in this phase.

[summary.json](summary.json) holds per-session results and completed-operation counts;
[source-identity.json](source-identity.json) pins runtime, probes, shared helpers, bundles and private
fixture hashes. [manifest.json](manifest.json) verifies each file in [evidence.tar.gz](evidence.tar.gz).
The archive includes the runtime patch (including the new helper), numeric results, diagnostic
controls and build/check logs. Private fixtures, browser/service snapshots and credentials are
excluded. Verbose legacy logs are external-only, with paths/sizes/hashes in the manifest.

Build the shared `probe/build.config.ts` with `VITE_ACCOUNT_LEDGER_PROFILE=1`, adding
`VITE_ACCOUNT_MEMBERSHIP_WORK=0` for reference, into the corresponding scratch directories recorded
by `probe/run.py`. With the private restored fixtures available, that runner executes the eight
sessions serially and refuses to overwrite results. `probe/summarize.py` regenerates the summary.
The `controls` and `operation` configs are separate diagnostic builds, never timing comparators.
`probe/record.py` retains only the explicit evidence allowlist and verifies its archive hashes.
