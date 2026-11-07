# Phase303 — matched yield-only withheld passes

2026-10-30. Frozen301Y248case on the same pinned browser/fresh fixture/default16/64/production
flags as302S0; the only runtime difference is the immutable248two-file yield patch. All120trusted
keys/3markers, actual reader-hint withholding, full native archives and both same-profile offline
cold guards pass. Functional/gate exits0; no retry or concurrent heavy work.

Input upper-bound p95=12.728ms/max43.867ms, peerp95=2181.561ms/max2454.006ms; markers617.339/
1534.184/1793.272ms. Backlog143973.157ms. All original16ms/2.5s p95/every-marker/30s final/600s
backlog/native/archive/cold gates pass. Baseline302inputp9518.749ms misses, peer2269.683ms passes,
backlog184013.117ms. Backlog ratio0.7824; one journey per source, fixed source order. This is a
descriptive matched pair, not a powered population improvement/causal-size estimate. Retain input
max43.867ms despite passing p95; no absence-of-pause claim. Old-browser300S0also passed and is
retained separately, never paired across browser change.

This fills the requested missing withheld comparison. Next fixed current291normal then genuine
multi-account fairness; no current-range acceptance from this older yield-only source. Preserve
all deep30s failures and v2development-only/stale-tab/rollback holds. No normal Page/WorkerABBA,
release prep, production/preview, service automation, signing/push/deploy or computer use.
