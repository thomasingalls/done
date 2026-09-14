# F-17: detached history selection metadata

Prospective implementation phase at signed `8c5fdaee`. The decision and timing rule in
[f17-history-profile.md](./f17-history-profile.md#next-bounded-implementation) govern.
No draft removal, persistent representation, admission order, history truncation, comparison or
application budget changes. The last application gate remains failed at 15.2/69.4 ms card typing.

Before editing production, add differential value/reference-graph and two-way isolation tests for
production-shaped before/after metadata, plus unusual structured-cloneable fallback values. Exercise
real master/card relative selections and undo/redo with restored selections against an unforked
reference. Retain the original per-item structuredClone as the baseline. A deliberate nested-reference
sharing mutation must fail the isolation assertion. Unsupported shapes must fall back as a whole;
shape inspection must not invoke accessors before native cloning. The seam retains its existing
structured-cloneable metadata precondition; this is not a validator for hostile JavaScript objects.

Prototype a private shape-specific copier inside the Yjs seam. Allocate fresh mutable nodes, preserve
aliases within each item using a per-copy memo, and never reuse that memo across stack items. Keep
ordinary structuredClone for unknown metadata. Preserve properties/iteration order and native plain
object output. If semantic tests fail, retain the failure and repair or discard the candidate.

Then bundle signed baseline and candidate separately and compare full history forks using the prior
nine strata (0/100/1,000 groups; 0/1/100 targets), fixed document within pairs, five warmups each and
twenty alternating baseline/candidate pairs. Check full document encoding, stack depth and metadata
outside timing. Retain all samples, bundle hashes, actual item/byte counts and ranges. A useful
candidate must improve both nonzero-metadata 1,000-group medians by >=20% without consistent >10%
regression in zero-metadata controls. Increasing stratum order and shared host/JIT/GC limit inference.
Run no other tests or profiles during timing, and do not resample a failed attempt for a desired result.

If useful and correct, run the full unit suite, pending/delivery native regressions, owned workspace
admission controls, runner/type/style/inventory/authority checks, then the unchanged packaged
application gate alone. Preserve failures, process receipts, all 30 application measurements and
cold-reopen verification. A local gain does not establish physical-device or release capacity.
Preserve prior evidence, all 52 personal/vector pins, L-2, append-only records and signed commits.
The personal browser/server/package/deployment and unrelated root files remain untouched.

## Disposition: both production candidates rejected

Both candidates passed the 15 focused cases, including 200 generated selection/reference graphs,
150 new undo/redo histories with restored master/card selections, and native-clone fallback cases.
The first used a recursive shape dispatcher; the second used direct constructors for each shape.
Both checked descriptors before reading properties and preserved a separate reference memo per item.
Deliberately sharing an ID failed the intended mutable-source isolation assertion in both candidates.

Each changed implementation received its own complete, fixed-count timing run. These are not repeated
samples of one candidate selected for a desired outcome. At 1,000 undo groups:

| Candidate | Targets | Baseline median, ms | Candidate median, ms | Improvement |
| --- | ---: | ---: | ---: | ---: |
| Recursive dispatcher | 1 | 8.552 | 8.118 | 5.1% |
| Recursive dispatcher | 100 | 576.683 | 460.767 | 20.1% |
| Direct constructors | 1 | 8.456 | 7.583 | 10.3% |
| Direct constructors | 100 | 571.345 | 396.992 | 30.5% |

Neither meets the predeclared >=20% rule in both nonzero-metadata deep-history strata. The first also
has a 12.5% slower median in one empty-history control, alongside two other empty-history controls
with smaller changes. The second's empty-history medians vary from 3.2% faster to 7.4% slower; its
100/1,000-group zero-metadata medians improve. All nine strata, all 720 measured forks across the two
attempts, ranges, source patches and bundle hashes are retained. Single-host order/JIT/GC limitations
still apply. The larger stress-stratum gains do not override the missed criterion.

The production seam is restored byte-for-byte to the signed baseline. The new tests remain, and a
shallow-copy mutation against that retained implementation also fails the intended source-isolation
assertion. This outcome adds regression coverage and rejects two insufficiently useful optimizations;
it is not a product speedup. With no runtime change, the conditional native/application campaign was
not run again. Earlier runtime native evidence and the failed 15.2/69.4 ms application typing gate
remain applicable observations, not newly executed passes. No budgets or acceptance rules changed.

## Next bounded phase: ownership and verification for preparation

The profile attributes 166.4/752.5 ms desktop/CPU-4x Android to the admission document fork over 60
keys, in addition to the workspace history's private fork. Before eliminating that duplicate, specify
and test the handoff contract between the workspace command adapter and the admission owner:

1. Keep the generic draft-based preparer supported. Define a private workspace-only capability that
   can prepare from its owned history without receiving the canonical document. Bind it to the exact
   accepted basis and writer identity; reject stale/reused capabilities after local or remote changes.
2. Keep canonical ownership in the admission queue. The workspace owns its prepared history until
   an admission outcome transfers or discards it. Define disposal and byte-buffer ownership on every
   success, refusal, exception, pressure retry, sliced command and close/cancellation path.
3. Preserve synchronous preparation and acknowledged-durability order. Refused edits must not change
   accepted history, visible selections, the canonical document, transport bytes or human undo groups.
4. Preserve source ordering and full Account source coverage, including system/human attribution,
   pending dependencies and delete sets. The Local optimization must not weaken Account verification
   or silently switch the generic preparation contract.
5. Retain full verification on every accepted transition before UI/transport exposure. Establish how
   the new basis binding remains valid across remote delivery, queued work and startup; do not trade
   removal of a draft for an unverified state-vector-only comparison.
6. Pin differential command/outcome/cold-replay oracles against the current two-draft implementation
   and mutations for stale basis, premature publication and leaked prepared state before production
   changes. Measure the actual removed work with the existing corpus and unchanged application gate.

This is preparation for a separate bounded implementation, not an approved shortcut around those
checks. Full comparison, UI publication, physical-device capacity and the remaining command/campaign
and immutable qualification work remain open.
