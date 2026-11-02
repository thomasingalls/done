# Phase287 — four-entry deep outcome, gate remains failed

2026-10-30. Exact phase286 inputs run once; production flags/profile unset/warm default,
16/session64/process, original joined sender-closed actor1, unchanged30s wait/180s case.
**Failed at30s**, receivedThrough747, native receive failures0. Before279failed at451; this is
better deadline progress, not a passing completion or precise full-duration speedup. Before did
not record the exact wait start; do not claim a matched elapsed ratio. Marker/Undo/cold assertions
were not reached. Do not credit those downstream guards because unit/native legacy checks pass.

Complete bounded Node trace:349HTTP,331read requests, all331status200.147limit1, one limit3,
183limit4. No dropped/malformed rows. Width4header wall p50=18.172ms/p95=30.457ms; limit1
p50=13.229ms/p95=19.154ms. These are wall spans, not exclusive server/CPU attribution. No429
in this run: raising rate limits would not explain or repair this failure. Full at/headersAt,
publisher/after/limit traffic is retained, without tokens, signatures, response bodies or writing.

Own isolated service/browser lifetime closed by the existing finally owner. No favorable rerun.
Next: bounded eight-entry download with an unverified tail and at most four verified positions per
publisher turn, plus valid oversized-range fallback that settles the Worker preparation cleanly.
The latter needs care: throwing a range size failure through the prepared Worker queue closes its
owner; narrowing afterward cannot be assumed to keep it live. Test that boundary before claiming
large-entry fallback. No caps, authority/history/commit/readback checks, flushing, backoff or gates
change. All v2 writes remain development-only. Actual8fairness/deep, Page64, fixture recipe,
withheld/normal gates, stale-tab and rollback remain. Normal Page/Worker comparison and release
work held. No preview, deploy, signing, push, computer use or real profiles.
