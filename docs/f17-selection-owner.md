# F-17: private selection-snapshot owner

Unmounted component phase, September 15, 2026, following the
[ownership contract and baseline controls](./f17-selection-snapshots.md). This implements metadata
ownership only. No application factory, history fork, workspace command or transport imports it.
The existing editor therefore retains its current metadata representation and copying behavior.

## Component boundary

`createSelectionSnapshots()` provides capture, restore, metadata fork and idempotent close.
Capture clones the complete selection map once and validates that detached value. A token is a
fresh frozen object with null prototype and no payload fields. Only its issuing owner's private
WeakMap recognizes it. Restore clones the private value each time; metadata fork allocates a new
Map while reusing recognized `before`/`after` tokens. Unknown keys, foreign/forged/cloned tokens
and terminal-owner operations refuse. Generic history metadata continues using native cloning.

Supported payloads are Maps keyed by `master` or a nonempty `card:` target. Selections contain a
nonempty dense array of anchor/head pairs and a valid main-range index. Relative positions retain
the four pinned Yjs fields: exactly one root-name/type-ID anchor, nullable item ID and a safe integer
association. IDs contain nonnegative safe integer client/clock fields. Native cloning preserves
within-snapshot aliases. Shape validation does not establish that a position resolves in a given
document; the workspace retains that responsibility at integration.

The owner has no strong token inventory, shared registry, per-branch release or application
callback. Dropping or clearing a metadata Map cannot revoke another branch's token. Closing the
owner releases its registry and invalidates retained tokens. GC timing and forensic erasure are
not claimed. Native capture can invoke source getters, so liveness is checked again after cloning
and validation; reentrant close prevents issuance. A failed capture leaves existing tokens usable
unless the source itself closed the owner. Fork reads native Map entries rather than a subclass's
overridden iterator.

History-to-owner binding and workspace shutdown ordering remain integration obligations. The
component exposes no Y.Doc, canonical state, storage bytes or admission authority. It must not be
used as a shortcut around the existing revision/job/slice/writer and complete-comparison checks.

## Validation scope

The component suite checks real root/nested Yjs selections; 200 generated alias/isolation graphs
(seed 150903); invalid payloads and metadata; opaque, foreign, forged and cloned tokens; failed and
reentrant capture; and 160 generated group/branch lifetimes against an independent value ledger
(seed 150904). The ledger exercises before/after replacement, sibling forks, clear/discard, foreign
owners and terminal close. Payloads returned by restore are mutated and reread after every step.

A new 80-history property (seed 150905) supplies sparse range arrays whose extra enumerable
properties disguise their missing indexes. It exposed an initial validator defect: key count and
`Array.every` together missed the holes. The retained minimal counterexample is one missing range
plus one extra property. Validation now requires consecutive array indexes as well as key count.
Preserve the original source/test, failed run and repaired pass.

Four isolated source faults must be detected: borrowed capture input, lent restore payload, a
registry shared across owners, and token invalidation during a branch fork. Exact transforms and
assertion failures are retained. These tests target the real unmounted component; existing generic
and workspace baseline suites remain separate regression evidence.

Register the new test file explicitly with the owned runner, preserving every earlier case,
deadline, exclusion and wrapper obligation. Review the new source-census entry without changing
crypto domains or classifications. Run affected owned suites, runner denominator/registration
controls, types, scoped source style, authority/census and preservation checks. This phase does
not run native or performance aggregates because the editor has no integration change.

## Following bounded phase

Integrate the owner into an explicit private Local variant. Bind histories to the live workspace
owner and convert every metadata capture, history fork, undo/redo transfer and restore together.
Keep the generic reference and existing private Local handoff available for comparison. Verify
failed-write retry/discard, grouped/sliced commands, remote delivery, reentrant observers and close
with generated and native admission/delivery evidence. Dispose histories before closing their
metadata owner at the correct lifecycle boundary.

Performance comparison and the unchanged application gate follow functional integration. No
speedup or default activation follows from component tests. F-17 remains partial; the earlier
candidate application gate is still 12.9/63.5 ms desktop/CPU-4x Android card p95, with Android over
the <16 ms bound. Emulation stays the reference and the Pixel's roughly 1.5× card estimate stays
planning context. The 96 command / 63 campaign obligations and immutable qualification remain.


## Observed component outcome

All **nine component cases** pass. Seven affected owned suites pass **127 cases** without skips,
retries or undrained processes. All four source mutations fail at their intended assertions.
The sparse-input property initially fails with counterexample `[1]`; the preserved original
validator is missing exactly the new consecutive-index check, and the repaired suite passes.

All **17 selected runner checks**, TypeScript, scoped format/lint, inventory/manifest, source
census and authority checks pass. Registration adds one nine-case suite; all prior contracts,
deadlines and exclusions are preserved except the exact denominator-test title change. The source
census adds only this component, with previous source hashes and crypto classifications intact.
General integration is now **262 files / 2,086 dispositions (11 not applicable)**. Five earlier
packets, 52 personal/vector pins, append-only record prefixes and the L-2 suffix are preserved.

The first style check flagged a throwing generator fixture with no yield; it now uses an ordinary
throwing iterator method. The inventory guard refused the resulting unrecorded test-byte change
before any stage ran; refreshing the reviewed inventory allowed the owned run. No assertion,
deadline or exclusion was relaxed. [Full retained evidence](./account-conformance-runs/2026-09-15-f17-selection-owner/README.md).

Existing runtime files are unchanged and only the new suite imports the owner. The next bounded
phase is the explicit private Local integration described above. No application speedup, default
activation, full-suite pass or native qualification follows from this component result.


## Subsequent integration checkpoint

The later [explicit private Local integration](./f17-selection-integration.md) now connects this
owner through all selection metadata sites. The unmounted descriptions above record this earlier
component phase. Default Local and Account still use the reference; performance validation is next.
