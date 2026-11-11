# Phase 543 — a parked reduction says which limit or condition stopped it

The text under Menu, "History on this device", is the only diagnostic the affected devices offer; they are not development machines. Every `capacity` park showed one sentence, "History maintenance reached a preparation or snapshot size limit…". Four different causes reached it: the baseline candidate's capacity refusal, a preparation-checkpoint refusal, phase 541's uncached pass cut short by routine queued work (not a size limit), and, from phase 542, a candidate past the 8 MiB write ceiling.

**Causes and where they are raised.** Each park now carries a `detail`, taken from a closed set of named causes, beside the unchanged `capacity` reason. Where the owner knows sizes, the detail gives what was needed and what this build allows, as plain byte counts or counts.

- `snapshot-size`: `encodeLocalBaseline`, when a new candidate's encoded record exceeds the write ceiling, or its snapshot alone already does. The needed figure is the exact encoded size the record would have had; in the second case it is computed without hex-encoding the snapshot. The complete-history writer raises the same cause at its 4 MiB bound, off the reduction path.
- `snapshot-sources` and `snapshot-publishers`: the same encoder, with counts against 4,096 carried capsules and 128 publishers.
- `resume-progress`: saving a preparation slice. Byte sizes are reported when the 32 MiB total is the bound that fired; none are reported when a slice-count bound fired.
- `resume-index`: the preparation checkpoint's index outgrew its record (256 KiB less 16 bytes).
- `resume-history`: the saved-row list a checkpoint binds passed 64 MiB. The count stops at the first row over the bound, so the needed figure is a floor and the sentence states only the limit.
- `interrupted`: `prepareHistoryRemoval`, when an uncached pass is cut short by routine queued work. It carries no sizes.

The detail travels on the skipped outcome from the planner or the content store, or on the `PreparationCapacity` error, to the automatic scheduler. The scheduler publishes it beside `capacity` and drops it on any other outcome. The session bridge copies it through a closed check, and the page renders it. The cause list and its check live in a new import-free module, `src/crdt/localRetentionDetail.ts`, which the page bundle also loads.

**Parking is unchanged.** The reason stays `capacity`, and the park, the hold spending and the 60-second retry clock read only the reason. Every timing assertion in the phase 539 to 541 tests passes unchanged. Six existing assertions on the shape of a capacity outcome or status are restated to include the detail now present: one in `localBaseline.test.ts`, two in `localBaselineLargeCarrier.test.ts`, two in `preparationCapacitySites.test.ts` (one inside a loop over three sites) and one in `retentionPreparationOwner.test.ts`. Each now names the cause expected at that site.

**The sentences.** Each is followed by "Your existing history is still in place." and, except the last, "It will check again after new writing or sync changes this device’s history." Sizes are in MiB to one decimal.

- `snapshot-size`: "The smaller history snapshot would need 9.4 MiB, and this version saves snapshots of up to 8.0 MiB." Without sizes: "The smaller history snapshot is larger than this version saves."
- `snapshot-sources`: "More writing is waiting to be sent from this device than a smaller history snapshot can hold (4100 batches; up to 4096)."
- `snapshot-publishers`: "This workspace has more writing devices than a smaller history snapshot can record (130; up to 128)."
- `resume-progress`: "The progress this device saves to resume history maintenance is full (33.0 MiB; up to 32.0 MiB)."
- `resume-index`: "The list of saved history maintenance progress is full (0.3 MiB; up to 0.2 MiB)."
- `resume-history`: "Saved history on this device is too large to mark a point where maintenance can resume (more than 64.0 MiB)."
- `interrupted`: "History maintenance was interrupted by other work on this device and had no saved progress to resume from. Your existing history is still in place. It will try again after new writing or sync changes this device’s history, or when you choose Check again."

Every sized sentence except `resume-history` also has a form without sizes, used when the detail lacks them. A status without a detail, or with an unknown cause, shows the earlier sentence unchanged. Every cause keeps the existing attention notice and the "Check again" action.

**Compatibility.** An older owner sends no detail, and the page shows the earlier sentence. The session bridge accepts `detail` as an optional field. An unknown cause, sizes on `interrupted`, extra keys, negative or fractional numbers, or a detail beside any other reason are dropped rather than refused, so presentation falls back instead of failing. The page and its Worker load from the same build, because the Worker's URL is resolved from the page's own bundle. A newer Worker paired with an older page therefore does not arise within a page load. If it did, the older page's closed check would refuse the new field, as it already refuses any unknown field.

**`HistoryInstallSizeError` on this path.** Confirmed: it is not mapped. A probe made `verifyHistoryInstall` throw it during planning. `planLocalRetention` rejected with the error itself, raised from the full reference replay in `inboundLedger.ts` before candidate building, and the scheduler halted as `owner-error`. The page then shows the generic "Automatic maintenance stopped because a storage or verification check failed." It can also be raised by `replayLocalBaseline` for a baseline's history record, which `planLocalRetention` likewise rethrows. On a device it should not fire for a record this build installed. The receive path admits a record only under the same 4 MiB bound, and re-deriving the installed update is deterministic. It would surface if the bound or the encoding changed between install and reduction. It is left for the snapshot-guard phase, as asked. Reading the other catch sites on this path found no other designed limit that ends as the generic halt. The engine limit on spread arguments noted in phase 542 is separate.

**Tests and runs.** Five cases are added to existing files, and no file is new.

- `automaticLocalRetention.test.ts` (two cases): a detail is shown beside `capacity`, parks exactly as the plain refusal does, is frozen, and is dropped when malformed or when another outcome follows. A preparation refusal is named by its site, and a bare one stays general.
- `accountSessionBridge.test.ts` (one case): known causes pass, a status without a detail is unchanged, every malformed or misplaced detail is dropped, and unknown top-level fields still refuse.
- `localHistoryMaintenance.test.tsx` (one case): every sentence exactly, the fallbacks for an absent or unknown detail, and the notice and button kept.
- `localBaselineLargeCarrier.test.ts` (one case): exact encoded sizes on both size paths, and the two count limits. The complete-history writer case now also checks its detail.

The 27 neighbouring files pass 276 cases, typecheck passes, and format and lint pass on the changed files. On the finished tree the full unit suite passes with the CI command, `pnpm test --maxWorkers=1`: 340 files, 3,307 cases, one existing skip, 352.08 s, with the host load average near 9 and an unrelated Lean process from another worktree running alongside. A second full run during review, with the load average near 15, had two timeouts at 5,000 ms in `test/inboundMixedReplay.test.ts` (seeds 406 and 407); that file imports none of the changed modules and passed three of three runs alone, and no deadline was changed. `pnpm build` passes at 308.7 of 350 kB, and `pnpm trace:check` passes once the contract checks are rerun on the finished tree.

Bookkeeping follows [development.md](../../../development.md#release-bookkeeping). The ten CI contract checks pass. Only `localBaselineLargeCarrier.test.ts` is in the reviewed general selection, so the case denominator moves from 2,676 to 2,677. The planning inventory stays at 1,110 obligations with 552 unresolved, and the nine adapter files pass 178 cases. The runtime census gains `localRetentionDetail.ts` and records five registered sites moving, in `localBaselineRecord.ts` and `localRetentionPlan.ts`; the construction registry follows them. `pnpm account:crypto-prep` passes; `pnpm account:crypto-audit` stops at 16 open constructions, as on `main`. No `vite/` anchor or browser-spec transform anchor changed. Every anchor the test harnesses use in the edited files still occurs exactly once, including the capacity-fault injection points.

Limits. No browser suite, native suite or device run, so the sentences have been seen only in the unit test's DOM. The preparation `resume-progress` bytes branch is covered by its sentence and by mapping, not by a real 32 MiB save. `resume-history` reports a floor, not the full size. No commit or deployment.

[Identities and results](./evidence.json); [the HistoryInstallSizeError probe](./install-size-probe.ts.txt) and [its output](./install-size-output.json).
