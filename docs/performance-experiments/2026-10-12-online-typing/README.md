# Online typing and individual Goals size

Measured **signed `9ba0ae63`**, which commits the timed journal-flush repair. This packet
adds measurement tooling and records; it makes **no runtime change**. Release validation
remains paused. Nothing was pushed, published or run against personal writing.

**The next priority is repeated verification during online sync.** At CPU-4x, adding real
two-way delivery raises keydown-to-visible-frame p95 from 20–30 ms to 431–510 ms across all
four text cases. Roughly 90–94% of summed online input queue waiting overlaps owned remote
admission jobs. Larger Goals also costs more synchronously, but does not explain these tails.

## Comparison

[Protocol](./protocol.md), [every session](./sessions.md), [numeric summary](./summary.json),
and [source trace / possible repair boundaries](./trace.md).

Two fresh restored sessions per condition, first offline/online and then online/offline in
reverse target order. One browser benchmark at a time, no concurrent builds or test suites.
Both disposable devices start converged. The typing device has roughly 120 cards and 600+
received positions. Chromium applies CPU-4x to that device only. Every session types 120
characters at requested 150 ms spacing; online adds 75 ms per account request and ten edits
from the unthrottled peer, two seconds apart, to a different card. The 615-character target
card is the established fixture card, not a 400-character approximation.

The user reports current Goals of about 3,000 characters and earlier Goals several times
larger. These synthetic ASCII Markdown fixtures use 3,000 / 12,000 / 64,000 characters.
64 KB is a stress case, not an estimate of the user's current writing.

| Target | Offline frame p95, two sessions ms | Online frame p95, two sessions ms | Offline / online median handler ms |
| --- | --- | --- | --- |
| Card, 615 characters; 12 KB Goals | 20.1 / 20.1 | 431.4 / 510.4 | 5.6 / 5.8 |
| Goals, 3 KB | 22.9 / 21.7 | 491.2 / 488.0 | 7.6 / 7.8 |
| Goals, 12 KB | 22.2 / 23.6 | 496.0 / 432.2 | 8.6 / 8.9 |
| Goals, 64 KB | 29.8 / 28.2 | 493.1 / 431.8 | 13.1 / 13.4 |

Handler columns are medians of the two session medians, rounded to one decimal. All 16
sessions have 120 resolved frame observations and pass admitted text, one-step undo/redo,
peer-content preservation, full exported-writing convergence and cold offline reopen checks.
All account requests initiated during online timing return HTTP 200. Both lanes make numeric
progress and end converged without a refusal reason; these are not secretly offline observations.

A queued input handler can return before its admission/projection runs. Handler duration is
therefore not total per-key CPU or latency; the separate plan/projection spans also capture
that later work. Do not read the slightly lower 64 KB online p95 than some smaller cases as
a text-size benefit: sync scheduling and grouping vary, with only two sessions per condition.

Online sessions record **129–145 long tasks**, maxima **138–180 ms**, and **3.81–4.91 seconds**
of summed per-input queue wait. Worst online visible frame is **833.4 ms**. Offline has 0–1
long tasks per session and **1.8–5.8 ms** of summed wait. A queue wait can include async I/O
and earlier inputs, and several inputs may wait during the same remote job: these sums are
neither wall-clock stalls nor additive CPU totals. The 16 ms p95 budget remains unmet offline too.

## Where the online work goes

Three separate online CPU profiles are diagnostic only; they are not pooled into the comparison.
In the card diagnostic's 24.0-second sampled window:

- **3.66 s** is `sameBytes` outside custody comparison, predominantly ledger prefix / stored-row
  equality. The complete same-byte self total is 3.81 s; custody equality contributes only
  about 0.15 s of that. The existing direct-byte custody comparison repair is active.
- **3.35 s** is inside custody-record payload encoding for authentication, including **2.62 s**
  of hex conversion. This is a different path from the repaired equality helper.
- The longest recorded task is **147 ms**. Its samples include 59.1 ms of non-custody byte
  comparison, 20.6 ms in a verified projection/read and 20.4 ms of GC. Another 144 ms task
  contains custody payload encoding, native verification and protocol parsing.

The 12 KB and 64 KB diagnostic profiles repeat the same two leading application costs:
non-custody byte comparison **4.01 / 4.14 s**, custody payload encoding **3.46 / 3.29 s**.
Source-mapped trees, clipped long-task samples and their clock-alignment uncertainty are retained.
Sampling establishes active call paths; it does not promise an equal reduction in input latency
if one component is removed. Native/async boundaries and browser scheduling remain.

The unprofiled card pair records **104 / 106 loads** and **84 / 87 authority checks** during
120 keys, versus nine loads and zero sync authority checks offline. It materializes **82.6 /
86.2 MB** of plaintext payload through full loads, and records **154.4 / 158.1 MB** through
the instrumented record-copy helper. Those counters do not include every allocation or the
separate rolling audit, and are not a direct measure of physical disk traffic. Across the
offline cases, instrumented copies remain only tens of KB.

The trace identifies a reason warm loading falls back: an owned reservation changes the
authenticated counter, then `beforeCommit` calls a state reader before rows commit. That
counter mismatch can force a full load. Even selective warm loads still reach validator
prefix byte comparisons. Separately, authority fences invoke the joined-account reader's
claim/custody authentication and parsing repeatedly. Neither repeating old-byte comparisons
nor rebuilding old authentication payloads is accounted for by the tiny synchronous text handler.

## What the Goals suggestion gets right, and what the measurement changes

Average summed synchronous span time per key, across the two offline sessions:

| Goals | Plan (includes state creation) ms | Entire editor projection ms | Projection read + string + diff substeps ms |
| --- | ---: | ---: | ---: |
| 3 KB | 2.32 | 1.88 | 0.21 |
| 12 KB | 2.31 | 2.74 | 0.39 |
| 64 KB | 2.68 | 6.98 | 1.65 |

Creating the temporary planning state consumes nearly all of `plan`, so reuse is worth
investigating. But its measured cost is almost flat from 3 KB to 12 KB, and only slightly
larger at 64 KB. The major size growth here is projection. Its string/read/diff substeps
explain only part: the rest includes CodeMirror transaction and live-preview work. The 64 KB
profile shows substantially more syntax-tree traversal. Therefore a persistent planner plus
avoiding whole-string comparisons should not be represented as eliminating the entire cost.

Whole projection and its substeps overlap; do not add them together. Totals include all
published projections on the measured page divided by 120 inputs, not only changed text.
At 12 KB, plan plus projection is about **5.05 ms/key offline / 5.40 ms online**, meeting the
prospective threshold for a separate text-state/projection slice. It remains a secondary
priority behind hundreds of milliseconds of online queuing.

## Recommended next bounded work

1. **Keep verified sync loads warm through owned reservations and projections.** Track the
   exact authenticated reservation predecessor and unchanged private-row identity so normal
   commit validation does not reload/compare all old bytes. Preserve public caller isolation,
   unexpected-counter fallback, physical shape checks, rolling audits and failure invalidation.
   Prove abort, abandoned reservation, changed-old-row and late completion cases. Re-measure
   this online workload, not only offline typing. This is a design proposal, not a completed proof.
2. **Reuse verified authority within the owner.** Preserve existing authority-check locations
   and exact current-row checks while avoiding repeated factor opening, parsing and MAC payload
   reconstruction for unchanged values. Do not substitute a MAC-only equality test. This is
   separate from the prior record-equality repair and merits a separate bounded change.
3. **Then address Goals planning/projection**, retaining undo, Markdown command semantics,
   remote-update invalidation and journal-before-apply. Include the view/live-preview work,
   rather than assuming all projection time is string scanning.

Keep received dependency durability and foreground ordering throughout. Moving a key ahead of
an uncommitted received update is not justified by this measurement. Shrink the work at the
existing boundary first; reconsider a prepared remote handoff only with a separate correctness
design if the remaining measured wait warrants it. Local retention stays design-only.

## Provenance and limits

An initial setup mixed an older writer browser snapshot with a later service/receiver snapshot
and stopped with an integrity reason **before timing**. It is retained as failed `seed-12000`,
excluded from timing. The replacement uses the original contemporaneous pair, catches up normally,
then derives the three Goals sizes. All three matched seeds pass. This is not the identical
browser state used in the preceding offline-only packet; compare within this packet.

The measured receiver's initial content / heads / outbound row counts are **4 / 613 / 19**
at 3 KB, **1 / 610 / 14** at 12 KB, and **65 / 616 / 82** at 64 KB. Changing Goals adds
different source records and can change compaction state. Across-size storage differences
are therefore confounded; within-size online/offline pairs share the exact same saved seed.

Two repeats estimate local magnitudes, not confidence intervals or a phone population.
Keys within a session are dependent. Keydown-to-frame omits pre-dispatch delay. CPU-4x is
emulation, and a fixed per-request delay is not a real mobile link. Both devices share a
desktop; only one is throttled. Warm browser caches, synthetic Markdown structure, deep
received history and the chosen peer workload constrain generalization. No prolonged outage,
same-text concurrent editing, IME, real phone or release qualification is claimed.

`source-identity.json` pins the source, bundle and external private fixture hashes. The retained
probes reuse earlier tracked build instrumentation, runtime and authenticator helpers.
`evidence.tar.gz` and `manifest.json` retain every numeric result, the failed setup result,
all run logs, diagnostic profiles/trees, original executed build/spec source and build log.
Browser storage, service databases, saved codes and authenticators are excluded. Fixtures
remain outside the repository for reuse. See [checks and reproduction](./checks.md).
