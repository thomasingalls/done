# Phase 280 — multi-entry reader contract and indexed-receipt red evidence

2026-10-30. Archived protocol defines the reader-first boundary, all unchanged limits/security,
per-position cut compatibility, width-two evidence-duplication tradeoff and later separate planner.
New independent real-crypto regression has25cases:7fail/18pass against current single-entry code.
Positive range/short/empty behavior and v2 interior-cut replay fail at existing unsupported/codec
boundaries; prefix/lifetime/size discriminators cannot yet reach the new branch. Existing v1/API
and bad-wire controls pass. Initial aggregate-receipt sketch/red is preserved, superseded before
product edits because per-position history cuts require indexed evidence. Exact new test bytes are
held in this packet until the reader repair; no executable failing test or old-test edit is added.

The new range verifier will share the current mechanism, retain complete signed originals, produce
canonical selected-position receipts, and perform all fresh checks. No request-limit-only edit,
response-selected authority, cross-owner trust or persisted verification shortcut. Reader phase
must not enable live writes. New label remains an open qualification obligation; existing contracts
and release block remain. Planning/fairness/default-budget deep, then Page deep64, reproducible
fixture refresh and withheld/normal gates follow. Normal comparison held; no release preparation.
