---
schema: 1
kind: finding
id: f-caee157-plaintext-baseline-points-to-parent
status: validated
type: evidence-weakness
severity: low
confidence: high
introduced_by: caee157305d3080ec870ca0959bd49c61a714f3b
work_item: B-04
created_by: /root
updated: 2026-08-26
challenged_by: root-v01-20260826
superseded_by: none
---

# `The plaintext latency baseline names a parent commit that does not contain its harness or boot marks`

## Affected requirement or guarantee

Stage 0 requires an attributable plaintext latency baseline before encryption changes the store. The performance
ledger itself states that a measurement without the exact commit is not a measurement because the hash is what makes
the before/after comparison reproducible.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/sequencing.md` §3.1 and `docs/progress.md` require the latency
harness and plaintext baseline before Stage 1 (`OC-050`, `OC-051`). `OC-062` requires each measurement's recorded
hardware and method to bound what the budget evidence proves.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef:docs/performance.md`, all plaintext latency rows still name
`c611666`, followed by a note saying that hash is the parent, the run used a working tree containing the new harness
and boot marks, and the hash “wants correcting to the harness commit when it lands.” No later commit corrects the
rows, so the only pinned object they name lacks the measured instrumentation.

## First introduction and propagation

`caee157305d3080ec870ca0959bd49c61a714f3b` adds the latency suite, four application marks, measurement method,
and recorded numbers in one commit. The rows nevertheless identify its parent
`c6116669030eedeea3d599bca0da3547114e6930`, which has none of those files or call sites. Later performance edits
append journal measurements and repair unrelated provenance but leave this explicit TODO unchanged through the
pinned tip.

## Reachable consequence

An engineer trying to reproduce the baseline at the recorded hash cannot run its harness or obtain its marked
content-root metric. The prose makes `caee157` the likely intended state, so the numbers remain useful as an
observation; however, it is impossible from Git alone to prove the dirty state measured before commit was byte-for-
byte identical to that commit. That weakens attribution if the encrypted-store comparison later regresses near a
budget or depends on a harness detail.

## Supporting evidence

The `caee157^..caee157` diff adds `playwright.latency.config.ts`, `test/latency/*`, `src/lib/marks.ts`, and all four
mark call sites. `c611666` therefore cannot produce the documented run. `docs/performance.md` explicitly recognizes
the mismatch and states both the repair and the reason it matters. `scripts/record-latency.mjs` would normally print
the checked-out `HEAD`, but the committed rows were manually attributed to the parent while the harness was still a
working-tree change.

## Counterevidence and disconfirmation attempt

The note is unusually transparent: it records the parent relationship, the added files, the approximate bundle
delta, corpus, browser profiles, CPU throttle, and all reported values. The `caee157` tree is therefore a strong
candidate for the intended reproducible state, and this is not evidence that the values are fabricated or budgets
failed. I checked later history for a corrected row or an immutable raw result tied to another object and found
neither.

## Validation procedure

1. Recover the original raw result artifact, if retained, and hash the exact source/build inputs used for the run.
2. If they match `caee157`, append a provenance correction that names the full commit without editing the historical
   observation.
3. Otherwise rerun the plaintext tree only if an exact pre-encryption environment can still be reconstructed, and
   append a separately dated replacement baseline.
4. Make future recording refuse `HEAD` when tracked files relevant to the harness/build are dirty, or record their
   diff hash alongside the commit.

## Disposition

Clarify the provenance. Preserve the original rows, but add an append-only correction naming the exact measured tree
or explicitly classify them as working-tree observations rather than commit-reproducible baselines.
