# Account cold opening: one source parse per census

The follow-up improves the **already repaired** deep-history opening from **4.07s to 3.44s** (15.4%, 625ms), in five alternating pairs. It does not meet the 2.5s budget. The baseline here includes the preceding linear-prefix and shared-census repairs; this is an additional improvement, not a comparison against the old 11.6s result.

## Change and boundaries

`inspectSpool` previously decoded every source for its catalogue, decoded it again for sequence numbers, then decoded each allocated source to check epoch, actor, kind and size. The new shared scanner validates each physical capsule once, captures those scalar fields, and erases decoded update buffers in `finally`. Identical duplicate identities still use their earliest sequence; conflicting bytes still refuse. The descriptions exist only for that synchronous census and are not installed in the returned ledger view or persisted.

Source canonicality and duplicate equality now compare bytes directly, avoiding hexadecimal strings used only for comparison. Canonical re-encoding, route checks and Yjs update validation remain. Envelope/source equality, allocation bounds/order, hashes, signatures, counter witnesses and full verification passes are unchanged. There is no reuse between calls or across owner lifetimes.

## Matched observations

| Saved fixture | Pairs | Previous median (range) | Candidate median (range) |
| --- | ---: | ---: | ---: |
| 2,320 edits / 295 positions / 2,354 source capsules | 5 | 4,069ms (4,017–4,118) | 3,444ms (3,420–3,503) |
| Receiving device: 48 delivered bursts, 51 inbound head records | 3 | 1,157ms (1,146–1,176) | 1,160ms (1,155–1,166) |
| Fresh first-device account | 3 | 261ms (254–262) | 257ms (253–266) |

All 22 timed opens passed, including a first locally accepted edit. For deep history:

- Source parses: **44,733 → 25,897** (18,836 fewer; predicted approximately 18,800).
- Delivery/inbound verification: **3 / 3 → 3 / 3**. Census constructions: **4 → 4**. Prefix links: **885 → 885**.
- Physical loads: **5 → 5**; rows read **19,150 → 19,150**. Native cryptographic operation counts are unchanged.
- Median first-card time after forced GC: **26ms → 26ms**.
- Median heap after GC: **17.23MB → 17.51MB**, with overlapping ranges (17.22–17.53 vs 17.22–17.52MB). This is retained heap, not peak allocation or a leak measurement. The receive/fresh heaps stay about 9.67/8.29MB.

The predeclared 0.5–1.0s predicted saving fits the observed 625ms. Each complete open is a sample; individual parses are not independent timing observations. Offline primary runs use byte-identical private test storage and virtual credentials, install assets before measurement, and include virtual unlock but exclude human factor entry. A single separately profiled open and ordinary-build functional checks are not pooled into the paired results. These small desktop samples do not establish phone performance, larger receiving histories, or network catch-up latency. Other sessions on the same host remain a possible load confound; alternating order and exact work counts help bound that uncertainty.

## Remaining cost and next slice

The separate candidate profile records 3.55s wall time and 3.19s sampled active CPU. Inclusive stacks overlap: the live receive-owner full check accounts for about 955ms, census work about 738ms, self-receive advancement/coverage about 689ms, and source parsing about 474ms. Hexadecimal conversion self time falls to about 296ms, versus 641ms in the preceding packet's profile; these separate profiles are directional attribution, not another matched timing estimate.

Preliminary recovery still validates the entire store twice before the live owner performs its own full check. The next bounded candidate is reuse **within that preliminary owner**, with a fresh authenticated storage read and invalidation on any changed bytes/counter or lifecycle cancellation. Measure that before attempting a handoff across ownership boundaries. Coverage rebuilding is the other substantial measured cost. Neither is implemented in this slice.

No deployment, service change or release-validation resumption occurred. The earlier cold-open work and this follow-up remain uncommitted at the time of recording.

## Evidence and reproduction

- [Protocol and predictions](protocol.md), [numeric summary](summary.json), and [verification](verification.md).
- `observations/`: every timed open, separate profile open and ordinary functional opens; numeric diagnostics only.
- `profile/`: compressed CPU profile and source-mapped aggregation. The aggregation helper's `msPerKey` fields mean per **one open** here.
- [Source manifest](source.json), complete parent-relative [candidate patch](candidate.patch), and this slice's [delta](census.patch). The baseline is parent `4bcac419` plus the preceding packet's candidate patch, not its old quadratic baseline.
- The unchanged browser probe is `../2026-10-11-account-cold-open/probe/cold.spec.ts`; the runner is `probe/run-pairs.mjs`. Build separate archived source directories with the recorded patches and build variables, then run `node probe/run-pairs.mjs <private-fixture.json> <label> <pairs>` from the repository root. The runner uses `/tmp/done-account-cold-census/{baseline,candidate}` and serial ports 53771/53772. Fixtures contain disposable credentials and stay outside Git; their construction is documented in the preceding packets.
