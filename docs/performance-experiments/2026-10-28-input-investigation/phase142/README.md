# Phase142 — retained-history verification-cache work is the next repair target

One separately frozen profile completes30,000.003ms in the middle of typing, with maintenance idle
at both boundaries, unchanged attempt2 and no intervening running event. All120keys/3markers,
whole archives, real peer edit/undo, maintenance completion, both offline cold/no-reinjection,
worker/binary/resource/noOOM and independent native signature/ciphertext/prefix/old-wire/isolation
guards pass. This is source attribution, not timing acceptance or a new passing run.

The full20,272sample profile has17,405.175ms idle and12,593.260ms non-idle time-delta weight.
**Weighted samples include scheduling/preemption/runtime; they are not exclusive CPU time.**
Self attribution gives `../../src/crdt/verifiedRecords.ts` 6656.036ms / 52.85%
of non-idle weight, and `verificationOwnership.ts` 909.068ms / 7.22%.
The complete function table, runtime/GC categories and raw denominator are retained. Inclusive
ancestor weights overlap; recursive functions can appear repeatedly, so use source-self totals
or the independently derived once-per-stack inclusive values, never a sum of inclusive rows.

Concrete generated-code/source-map checks match the repository bytes for both hot helper files.
`sameByteSpan`/`sameBytes` do exact record-byte checks; `read` and `readIfMatches` compare whole
record sets before detached `structuredClone` projections; verification adoption/erasure traverses
retained buffer graphs. These are existing verification-cache operations under ordinary live
editing. The word comparator is already optimized; this is not evidence that replacing it again
is the best first repair. Some caller mappings land at generated/EOF positions; concrete source
review, not those uncertain line pins, identifies candidate consumers.

The earlier controlled run retains20.6ms local,17.6ms browser-stamp→handler,0.7ms mutation and~2ms
driver lateness; its static bookend drift remains flagged. Together with the paused profile, the
evidence selects repeated whole-history view matching/projection/ownership work after pruning
yields. It does not isolate each caller's frequency or prove a particular repair will pass.
See `next-repair.md` for the bounded existing-lease adoption proposal and its falsifiers.

Independent review reconstructs the complete sample/self denominator, rejects unknown-sample and
missing-weight controls, verifies both actual helper source-map contents and minified code, and
checks every input/data/native/resource result. A separate native auditor verifies the stopped
service store. No heap/credential capture. Browser profile directories, fixture keys and databases stay outsideGit; CPU samples are retained.
Runtime and old test trees are exactly135's; previous full unit/native evidence is reused without
repeating unrelated campaigns. The accompanying ordinary-results.json records final bookkeeping
checks before freezing this patch. General qualification stays paused:932obligations/386unresolved retained.

**No activation:** phase134's19.3/20.4ms failures and phase138's2578ms withheld marker remain.
Keep16ms local/2.5s peer/marker gates, original fresh authority/counter/witness/final-commit and
independent verification checks, resume/service default0, and today's phone deferral. No runtime/
old-test change, signing, push, preview update, release image publication or deployment.
