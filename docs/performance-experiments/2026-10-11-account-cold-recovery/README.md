# Account cold opening: reuse within preliminary recovery

The third bounded cold-open slice removes one redundant full verification inside preliminary recovery. Against the preceding census repair, five alternating deep-history pairs improve the original probe's median from **3.43s to 2.92s** (14.9%, 510ms). A supplemental in-page rendered-frame measurement gives **3.11s → 2.58s** in three pairs. The 2.5s budget remains unmet even with the more precise measurement.

## What changed

`withRecoveryUnderPermit` initializes a private content owner, reads the journal, then loads content again before invoking its recovery callback. Current first-device Accounts (v9) and joined Accounts now opt into the content owner's existing lifetime-local opened-record reuse. A small wrapper remembers successful semantic validation for its exact snapshot identity within that single recovery call.

The content owner still physically rereads the counter and all rows, verifies the counter MAC, checks placement and allocation, and compares the complete counter and every sealed row before supplying the same identity. A changed authenticated counter, changed/deleted row, or different nonce/ciphertext yields fresh validation. Corrupt metadata or ciphertext refuses. Successful validation is remembered only after the lifecycle guard confirms it remains current. No journal result is cached; journal reads remain fresh. Finally/dispose clears the identity, exposed buffers and the owner's existing plaintext cache.

The two opted-in validation closures have fixed verified route/key/authority context for this call. This is not a general cache for callbacks with mutable external dependencies. The live editor is a separate owner and still performs its own full validation. No cache crosses owners, no format changes, and other recovery callers retain their prior default behavior.

## Primary paired results

These use the preceding packet's unchanged browser probe and observation method.

| Fixture | Pairs | Previous median (range) | Candidate median (range) |
| --- | ---: | ---: | ---: |
| 2,320 edits / 295 positions / 3,830 physical rows | 5 | 3,432ms (3,403–3,454) | 2,922ms (2,913–2,942) |
| Received history: 48 delivered bursts, 51 inbound records | 3 | 1,157ms (1,155–1,161) | 1,177ms (1,177–1,183) |
| Fresh account | 3 | 257ms (252–261) | 261ms (258–262) |

Deep-history preliminary recovery falls from **1,387ms to 884ms** at the instrumented boundaries. Live-owner initialization stays **1,451ms / 1,442ms**. The mechanism matches the prediction:

| Work per deep open | Previous | Candidate |
| --- | ---: | ---: |
| Preliminary full validations | 2 | 1 |
| Full delivery / inbound verifications | 3 / 3 | 2 / 2 |
| Native decrypt calls | 12,411 | 8,286 |
| Native verify calls | 3,627 | 2,447 |
| Native digest calls | 16,317 | 11,012 |
| Physical reads / rows read | 5 / 19,150 | 5 / 19,150 |
| Source parses | 25,897 | 21,188 |
| Copied record bytes | 10.72MB | 15.00MB |

Reuse trades an extra temporary plaintext copy/cache for less decryption and semantic replay. Median collected heap is **17.51MB / 17.56MB**; peak heap was not measured. First-card medians after forced GC are **27ms / 25ms**. Receiver/fresh collected heaps do not grow materially. These observations do not establish a peak-memory bound for much larger histories.

## Why the receiver's final wait looked unchanged

Receiver preliminary recovery actually fell **402ms → 240ms**, and native verify calls fell **912 → 708**. The original probe uses Playwright visibility polling. Its observation time can lag a visible editor by hundreds of milliseconds, hiding gains that fit within the same poll interval.

After those results, we recorded a protocol addendum and added an in-page MutationObserver, asserting that no editor shell exists before unlocking. It records a timestamp two animation frames after a visible shell appears. This approximates a rendered editor frame, not hardware scanout. It avoids attributing the test runner's next poll to application work. The original observations remain untouched; the new samples are separate.

| Supplemental frame timing | Pairs | Previous median (range) | Candidate median (range) |
| --- | ---: | ---: | ---: |
| Deep history | 3 | 3,114ms (3,100–3,125) | 2,581ms (2,560–2,587) |
| Received history | 3 | 852ms (847–858) | 706ms (691–710) |

The fixed timer/observer delay is not an application optimization. Do not compare the new frame values directly with older packets' polling values or pool both methods into one estimate. Both matched methods support the improvement. Future cold-open comparisons should include the in-page timestamp.

## Verification and remaining work

Nine new native boundary cases and eight selected existing native regressions pass. The weakened-identity control delivers a missing-row snapshot to the helper's callback; the real implementation refuses it. All **34 measured opens** pass. A separate profile and ordinary-build online/deep plus offline/receiver checks preserve a newly accepted edit through lock/reopen; ordinary builds expose no application profiling globals. TypeScript, targeted formatting/lint, patched Yjs, ordinary build, bundle budget and origin checks pass. See [verification](verification.md).

The separate deep profile records 3.00s under the old observer and 2.64s sampled active CPU. Its largest relevant inclusive stack is the live-owner full check (~943ms); self-receive advancement includes ~681ms, of which coverage checking accounts for ~607ms. These overlap and must not be added. Source parsing is ~382ms. Coverage reconstruction is now the strongest measured candidate for another bounded cold-open investigation. Any change must preserve individual accepted-source coverage, including pending Yjs data; aggregate state-vector equality alone is insufficient. No coverage repair or ownership handoff is implemented here.

This is local performance work, not release qualification. No deployment occurred. All three cold-open slices remain uncommitted at recording. The samples use disposable desktop fixtures with virtual unlock, exclude human factor entry, and do not establish phone latency, network catch-up, large receiving-history scaling or rare failure rates. Other host activity remains a potential timing confound; work counts and alternating order help distinguish the mechanism from noise.

## Evidence

- [Protocol](protocol.md), [primary summary](summary.json), [supplemental frame summary](frame-summary.json), and [source manifest](source.json).
- `observations/` contains all 34 numeric opens and three separate functional/profile opens. Credentials and saved storage stay outside Git.
- `baseline.patch` and `candidate.patch` apply to signed parent `4bcac419`; `recovery.patch` contains only this slice's runtime delta. Baseline is the preceding census packet's candidate, verified byte-for-byte.
- `profile/` contains the compressed profile and mapped summary. Its inherited `msPerKey` fields mean per one open.
- `probe/run-pairs.mjs` uses the prior probe; `probe/run-frame-pairs.mjs` uses this packet's frame probe. Both run serially against `/tmp/done-account-cold-recovery/{baseline,candidate}` on ports 53771/53772. From the repository root, invoke the runner with `<private-fixture.json> <label> <pairs>` after building separate archives with the recorded patch and build variables. Do not run timing probes concurrently with other CPU-heavy work.
