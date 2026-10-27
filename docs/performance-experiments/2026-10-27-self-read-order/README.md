# Publisher-order-independent receiving — 2026-10-27

[100: self-read repair and regressions](phase100/README.md) →
[101: rebuilt clients and prospective protocol](phase101/README.md) →
[102: eight journeys and independent audits](phase102/README.md) →
[103: publisher-specific aggregate-size fallback](phase103/README.md) →
[104: complete local build and final checks](phase104/README.md).

Self-read attempts fall about87%; this local comparison observes about10% faster bulk catch-up.
Every original latency/preservation gate remains. The separate size-fallback repair passes focused
checks; its further whole-client effect is unmeasured. No release preparation or deployment.
