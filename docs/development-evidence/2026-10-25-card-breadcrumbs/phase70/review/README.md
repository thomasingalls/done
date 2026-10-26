# Phase70 read-only challenge

No application, repository test or documentation file was edited by this reviewer. These tests and
their runner live outside the checkout. They use fictional in-memory writing and the existing unit
harness; they are not browser, encryption, durability-service or receiving-authority qualification.

Run the three focused cases from the application checkout:

```sh
node node_modules/vitest/vitest.mjs run --config /private/tmp/done-goals-implementation-2026-10-25/review-card-context/review.config.mts
```

The initial `run.log` and `result.json` record two failing counterexamples and one passing older-client
behavior demonstration. Preserve these initial outputs before rerunning against repaired code.

1. Selecting the second physical title line in a multiline Setext heading inherited that same heading.
   Expected captured path `Work`; actual path `Work > First title second title`. The selected heading
   must be excluded on all its physical title lines, not only the line at its starting offset.
2. A day containing both retained archive text and a live Scheduled collection exported the archive
   through the existing readDayContent rule, while the new sidecar indexed live cards. That assigned
   the live card's context to different archived writing. The optional sidecar must follow the actual
   Markdown projection, without silently changing this phase's existing export/body semantics.
3. The exact prior mergeCardBackwards function was extracted from pinned HEAD (identity in
   historical-merge.json), had only its TypeScript annotations stripped, and executed with injected
   current unchanged CRDT accessors plus equivalent transaction/writability helpers. It retained the
   first card's Work path after merging Home writing. This is a mixed-version advisory-metadata limit;
   the new implementation's clearing rule cannot retrofit older writer code. It is not evidence of a
   complete historical client runtime, old-reader campaign or authority failure.

`source-observation.json` records reviewed source snapshots after the initial run; parent repairs
may proceed in the shared checkout independently. It is intentionally bounded accordingly.

The new inline-JSON cache relies on the application convention that an installed value is replaced,
never mutated in place. New writers freeze their raw metadata, and returned normalized snapshots are
owned/frozen. Yjs does not automatically deep-freeze decoded plain JSON. Current owners were not found
mutating such raw values; weak-key ownership does not retain a closed document by itself.

Export sidecar files preserve readable metadata without rewriting Markdown, but no sidecar import
reader is introduced here. Do not claim metadata roundtrip restoration or faithful lifecycle behavior
for every older writer. Same-card moves are narrower than older splits/duplicates/merges.

## Post-repair reruns

`run-after-repair.log` / `result-after-repair.json` preserve the first rerun: Setext ancestry was repaired,
and the unsafe sidecar was absent. The original external export assertion assumed the sidecar must
exist, so that assertion itself threw on the now-correct omission. The original test source remains
in `counterexamples-initial.test.ts.txt`.

The external assertion was adjusted to accept omission while requiring existing archived Markdown to
stay unchanged and requiring any emitted sidecar index to point at the correct writing. No repository
test was edited. `run-after-repair-final.log` / `result-after-repair-final.json` record all three focused
cases passing. The older merge case continues to demonstrate advisory degradation, not its repair.

Read-only review of the repaired source found no material remaining defect in these boundaries. The
new cache comment accurately names replacement-only ownership rather than implying Yjs deep-freezes
decoded values. The metadata remains ordinary workspace content and does not participate in authority
decisions. Existing security/admission owners remain responsible for encryption and acceptance.
