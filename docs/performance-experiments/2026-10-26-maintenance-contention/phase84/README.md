# Phase84 — defer automatic starting until foreground synchronization is quiet

Parent: sequential83. Automatic local retention previously observed durable/pending/visibility state,
not the composed sync lanes. A real receive can wait on network while the storage tail appears idle.
A new held-read native regression shows the old scheduler starting maintenance in that interval.

The owner now observes both lane statuses. Starting/working/retrying lanes defer **automatic** starting;
idle/offline/blocked lanes can proceed through the unchanged eligibility/proof path. Do not treat an
unresolved retry as spare capacity. Existing manual removal retains its guarded operation. Refresh
readiness on lane changes without restarting the ten-second user-quiet clock: normal five-second
polling must not starve maintenance. Input still restarts quiet; cooldown/backoff, unchanged refusal
parking, unexpected-error halt and release cleanup remain. Busy accounts may postpone discretionary
maintenance; foreground writing/sync takes priority. Statuses are scheduling hints, never authority.

## Discriminating evidence and repairs

The held receive reaches the existing ten-second HTTP deadline. The first guard excludes working but
allows retrying, and the new test still fails: maintenance starts during the retry gap and then yields.
The retained diagnostic traces distinguish that gap from the active request. The final guard also
excludes unresolved retrying. The final new assertion accepts either working or retrying at the
network-timeout boundary (never idle), keeping zero-attempt/exact-storage checks; its final rerun passes. The corrected case passes across the real timeout/retry, then completes
real removal after sync quiet, preserves writing and cold reopens. No network deadline changes.
The fixture lowers only the growth threshold to1 as in existing automatic tests; it keeps real quiet,
retry, proofs, crypto, IndexedDB exchange and readback. It is not a production-threshold latency study.

The final cumulative native run passes all25 automatic/removal cases with no skips/retries. Existing
abort, foreign-row, old-reader, stale-flight, lifecycle, journal, nonce, undo, exact storage/readback and
cold recovery assertions remain.16 desktop/Pixel-emulation context/breadcrumb browser cases pass
against the freshly built automatic-enabled frontend. TypeScript/lint pass. The full unit run passes
2,021 cases/one existing named skip across172 files; it precedes tightening only the retry predicate.
That final predicate has the fresh native regression/full native file and the existing unit readiness
logic. The31 focused cases pass before it, and a final focused run follows with this exact source.

## Bookkeeping and failures retained

The first broad adapter/registry invocation has22 failures: sandbox/browser-process apparatus failures,
a stale crypto source census and exact denominator fixtures. Serial execution with explicit permitted
Chrome removes apparatus failures; it has299/301 passes and two exact denominator failures. Independent
selection gives2,544 general cases (new context file adds8). The new automatic unit case remains in its
existing required/uncredited disposition, so adding it to that selected denominator was incorrect.
Restore that value, update the second stale2536 assertion to2544, and preserve all assertions/limits.
The affected inventory/manifest/generated/general/registry rerun passes109 cases. These are bounded
functional checks, not the paused aggregate qualification process.

The crypto census changes only four source hashes. An independent filesystem population/hash join
preserves all410 sources,197 domain labels/sites/classifications and every old qualification block.
The manifest has908 obligations/363 unresolved; new required context cases do not retire an obligation.
No security policy, byte contract, crypto construction or compatibility format changes.

## Limits and state

No production-account contents were read, and no real-device latency is inferred. The phase82 timing
probe's text mismatch and16ms gate remain unresolved; these repairs do not explain all production lag.
Final exchange/readback still has its existing cost and exclusive safety fences. Backup cap and exact
version readback are unchanged; diagnosis/retry-amplification follow-up live in infrastructure81.
No signing, push, preview8443 update, merge, image publication or deployment. General qualification
remains paused. Final static contract receipts and patch application identities follow separately.
