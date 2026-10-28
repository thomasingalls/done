# Phase109 — Per-publisher quiet scheduling budget

Composed receiving may defer an unchanged remote publisher for at most750ms after a verified
empty completion, and only while a fresh authenticated projection shows backlog elsewhere. No
new timer, concurrency, rate, refusal-floor, crypto/authority/history/witness/prefix/commit or stored
format changes. First/changed/conflicted/positive targets, own/pending reconciliation and idle
sweeps retain their existing reads. Compare cursor/link/frontier/starting-point values and the stable
public authority context; unrelated progress and detached map copies do not invalidate or slide a
fixed deadline. Resolve absent persisted peer entries through the existing certified baseline
resolver, lazily. Bound hints128, eviction safely re-probes. Legacy selection stays unchanged.

Capture an opaque single-use attempt token before signing/network awaits and carry it with the
owned group. Wake/resume/retry, authority/history/baseline and closure boundaries invalidate both
hints and attempt generation. A pre-wake completion cannot repopulate hints. Useful verified pages
still commit; invalidation neither aborts them nor resets own freshness/four-page fairness.

Evidence: original behavior regression fails before repair (7 quiet turns rather than1); the sparse
baseline regression also fails before its repair. All18 original selector test bodies remain byte
exact.40 selector +21 scheduler +6 projection cases pass; types/lint pass. Encrypted native/browser
checks:55 pass/6 conditional skips, authority mode3 pass, ledger-audit mode2 pass, hidden batching
mode1 pass (61 distinct cases exercised). The first hidden invocation used the wrong environment
variable and skipped; retained without credit.81 metadata cases pass. Crypto source-site coordinate
716→718 is repinned after moving selector construction; no contracts or release blocks removed.

Actual composed H1/H2 race holds a genuine signed empty H2 reply, publishes new H2 writing, observes
a genuine content notification, then releases the old reply. Correct build displays the new page
within the bounded2.5s wait even with the selector clock temporarily frozen. A one-line omission
preserving old attempt tokens instead hides the new page for the whole2.5s window; unfreezing then
recovers it. This is a regression sensitivity check, not latency credit. H2 receive is deliberately
blocked in this diagnostic; the timed comparison separately enables both receivers. Normal verifier
and all real signatures remain. No real account/provider/browser profile is used.

This phase implements the candidate, not its performance adoption. Freeze rebuilt R/C and run all
original whole-client/data gates and the real two-receiver late-writer guard next. General
qualification remains paused at912 obligations/367 unresolved. No release prep, signing, publication,
preview/API restart or deployment. Unsigned109 follows108.
