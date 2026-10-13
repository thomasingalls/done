# Experimental local baseline codec and replay — 2026-10-13

Focused correctness evidence for the [phase contract](../../account-local-baseline-replay.md).
Parent commit: `466097f80852b2673e6b71c3aeff523b670d0101`. The implementation was checked as
uncommitted working-tree changes; `evidence.json` hashes the exact source and fixture files.

**No persisted baseline, application activation or history deletion.** These are synthetic, in-memory
fixtures using real protocol signatures, envelopes, membership, receipts and checkpoint proofs.
Counter/custody authentication and settled journal eligibility remain owner-adapter prerequisites,
not properties these pure fixtures establish. All original physical history remains available.
General release validation remains paused. Test durations and build times are not performance evidence;
the host is not controlled for comparative measurements.

## Checks

| Check | Result |
| --- | --- |
| Focused Vitest, eight files | 54 passing tests; 14 new baseline cases include 30 generated histories, fixed seed `13102026` |
| Existing signed current-key retry Node tests | Four passing tests |
| TypeScript | Pass |
| Changed-source lint and formatter | Pass |
| Yjs patch check | Pass |
| Ordinary Vite application build | Pass; 452 modules |
| Initial JavaScript size and origin isolation | Pass; 137.1 kB gzipped, 31 built files scanned |
| Diff whitespace | Pass |

`focused.log.gz` and `retry.log.gz` retain complete test summaries. `build.log.gz` is the build's
completion output, size report and origin report; its initial Yjs-check/transform lines were returned
in an earlier tool response rather than retained in that file. TypeScript and lint exited zero with no
stdout/stderr. The Node run reports the existing experimental localStorage warning; tests still pass.
Commands and file hashes are recorded in `evidence.json`. No failed final checks were omitted.

## What the new checks cover

- Full replay versus authenticated baseline plus suffix: exact Yjs structs/deletions, own acceptance,
  invocation burns, peer receive positions, signed refusal and the next source/position selection.
- Partial capsules, unallocated source bytes, empty cuts, open tail positions, physical reservation
  holes and late pre-reserved rows. Pending dependencies prohibit a new complete baseline, while a
  later pending suffix survives replay and resolves when its dependency arrives.
- Real certified-peer receipts, an accepted current-key retry across earlier membership changes,
  retained checkpoint admission and explicit full-history fallback for a new installation or old read.
- Malformed framing/bounds, altered MAC/proof/content, mismatched identity/authority/anchor, omitted
  events, caller-buffer mutation and a closed lifetime. A local MAC is not accepted as a replacement
  for retained service signatures.
- Equivalent replay after exact content compaction, followed by a new local edit, peer edit and
  actor-scoped undo/redo. This does not exercise an installer or an already-live undo stack.

One directed test initially failed: a retained partial capsule let the next-source selector choose
its accepted index again. The replay state now carries consumed indexes and the selector excludes
them; the test remains. The initial red output was observed in the tool session but was not saved as a
log. Matching visible content alone had not revealed this continuation defect.

The next bounded work is owned shadow construction and comparison with all history retained. Durable
encryption/anchoring, compatibility fences, authority-transition consumers and atomic installation
remain prerequisites to any deletion. No storage reduction or user-visible speedup is claimed here.
