# Phase 11 — Quarantine-aware generated model

Parent overlay: `1f1ca94ec411bb893292231904eef79e1639a9ad`. No production changes.

The original 60-history seed 9112031 fails on an append after detected corruption and byte restoration. Keep the sticky service quarantine: the independent model now tracks detection until explicit restart, requires exact `unknown/ledger-integrity` refusals with unchanged inventory, and retains every original prefix, replay, role, signature and read-only check. A final quarantined history explicitly proves both read and append refusal before restarting and verifying its full original prefix. All 60 original histories and one new direct restore/restart case pass at unchanged deadlines.

The independent report reader models that lifecycle separately, requires final recovery evidence when needed and rejects missing restart, altered refusal and inventory claims. Five existing service-inbound adapter tests pass, including 160 generated corruptions plus explicit same-owner and cold-recovery counterexamples. A separate diagnostic substitutes the actual 60-history report into otherwise synthetic report families and verifies it with the independent reader; this grants no whole-campaign or aggregate credit. Normal CI runs the seeded model and direct regression.

Original red and intermediate passing runs remain. Lint and diff checks pass. Planning retains 854 obligations/313 unresolved; the new file is required and blocked from aggregate credit. Local Node 26 only; qualification paused. No signing, commits, publication or preview update.
