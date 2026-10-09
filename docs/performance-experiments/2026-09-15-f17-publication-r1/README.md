# F-17 incremental publication experiment

Above signed and signature-verified `e0a8726347b75d8c57a89afcbdf9ca34ed829b39`.
The comparison keeps R3 + membership-repair eligibility as the selected baseline.
**Park this new publication implementation as an optional patch.** Correctness controls pass,
but the fixed browser screen does not justify selecting it. No main runtime/test/default or
release-adapter change occurs. [Assessment](../../f17-publication-r1.md).

## Inputs and reproduction

- `selected.patch` is byte-identical to the previous repair experiment's complete candidate.
  Apply it to a clean checkout of the signed base for the comparator.
- `incremental-publication.patch` applies on that comparator. It changes two runtime files and
  includes the new publication tests plus retained publication/editor controls.
- `candidate.patch` is the complete alternative patch above the signed base, including inherited
  test additions. Apply this alone, not after either other patch.
- `implementation/` preserves the final incremental runtime and affected publication/editor
  test files. The full patch contains inherited tests too. Deliberately broken `*-fault.ts`
  files are controls and must not be used as the candidate.
- `protocol.md` predates implementation and measurement. `setup.py`, `prepare-measurement.py`,
  `build.mjs`, `freeze.py`, `batch.mjs`, `screen.mjs`, `measure.mjs`, `recorder.mjs` and
  `analyze.mjs` preserve the setup and execution. `commands.json` records successful final checks.
  `implement.py` is an initial edit script, not the final reconstruction authority; use the patches.
- `builds/*-source.json`, bundle manifests, the activated source files and `frozen.json` pin 416
  source/bundle/helper identities, including the new runtime module. The source census includes
  tracked and untracked source files. The Local snapshot activation is build-only and identical
  for both variants. React Compiler uses the project's actual Vite build.

Scratch clones, dependencies and built assets remain at `/private/tmp/done-f17-publication-r1`;
binary bundles/maps are not archived here. Use a new scratch directory and output identities
for a repeat. The batch refuses existing output and checks frozen hashes before/after every
session. Local paths in scripts record this run's actual environment and need explicit relocation
when reproducing elsewhere. It uses the pinned repository dependencies, not fresh versions.
Host execution permits only disposable loopback servers and Chromium profiles.

## Outcomes and limitations

`analysis.json` and `results/*/result.json` retain all six fixed sessions: selected/candidate,
candidate/selected, then a separate Unicode selected/candidate guard. Every session passes exact
block text, bounded undo/redo, the existing corpus checks, exact edited-card cold reopen and
browser/server/process-group drain. There are 480 measured keys and 624 warmups; no session is
discarded or resampled. `comparison-batch.*` and `unicode-batch.*` record bounded ownership.

Ordinary early median effects reverse sign between pairs. The later candidate median/p95 is
slower in both pairs: median paired regressions 12.3%/18.2%. Unicode medians are slower by
8.2% early /1.3% later. These are two ordinary session pairs and one guard, with dependent keys
and only 40 samples per block. No population, GC/heap, long-session or budget result follows.
The existing corpus helper checks counts, a per-day marker and Goals line count, not every byte;
undo requires changed text then an exact redo roundtrip, not one-key history depth. The later
block is not a verified deep-history stratum. See `decision.md`.

Final controls pass 218 unique tests across 13 files, including nine new cases /60 generated
histories (seed 171509), TypeScript and scoped formatting. Three deliberate faults are caught
by designated assertions, and final runtime identities are restored before builds. The earlier
publication normalization regressions and editor/IME tests are retained. `fault-controls.json`
binds the exact fault commands, source/test identities and catching assertions.

`control-findings.md` distinguishes two initial observations. A split-pair fixture was already
normalized before its intended fork; its failed setup assertion, original test and correction
remain. A real candidate defect returned stale undo counts after the existing diagnostic cleared
history without a content revision; the before-repair source/test/failure and passing scalar-count
repair remain. Initial unused-import output and the repeated editor run after fault restoration
are retained too. No timing overlaps builds, tests or mutation controls.

`audit.py`/`audit.json` check final frozen identities, patch consistency, controls, all samples,
the prior packet, 52 personal/package/vector pins, original control inputs, root perspective,
main runtime/test invariance, signed record prefixes and L-2. `sha256.json` pins each archived
artifact other than itself. Historical packets remain unchanged. The audit needs the original
scratch source/builds, or faithfully reconstructed equivalents; checking archived hashes alone
does not rerun tests. No aggregate receipt or release obligation is added.
