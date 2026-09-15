# F-17 membership-repair eligibility experiment

**Retain this incremental optimization in the experimental combination.** A private repair fact lets repeated text commands skip one whole-workspace scan while dirty remote states still repair before editing. The focused checks pass, and all six browser sessions favor the candidate on both median and p95. No application default or release gate changes.

2026-09-15, above signed and signature-verified `62b19f94`, which commits the [application growth diagnostic](./f17-growth-r1.md). [Protocol, patches, raw results and preservation audit](./performance-experiments/2026-09-15-f17-repair-r1/README.md).

## Change and ownership boundary

The incremental runtime patch changes only `workspaceCommands.ts` and `admittedWorkspace.ts` in a disposable candidate checkout. The comparator is the unchanged R3 preparation + bounded comparison pool + editor shortcut + primitive value-string combination. Optional UI indexing and publication patches are absent from both variants.

Each admission owner creates a private command runner. Its WeakSet binds completed repair to individual history objects. A successful command establishes the fact for that history; a trusted detached fork inherits it from the current accepted history. The runner clears the fact before executing and restores it only on success. A prepared history marks itself, and becomes authoritative only through the existing verified adoption. Refusal, retry, discard and teardown retain their current ownership rules; weak entries do not retain abandoned histories.

Every accepted remote update invalidates eligibility **before apply and publication**, including text-only updates and later delivery that wakes pending dependencies. This matters because a subscriber can submit input before the queued repair runs. Dirty text commands keep the pre-command repair, including its system transaction and source capture. All non-text commands retain their existing repair calls. Text actions on a repaired basis preserve membership, so repeated and no-op text can omit the scan. The unconditional command runner remains available as the differential reference.

The fact means that the existing repair policy completed, including its intentional treatment of unfiled and legacy-compacted cards. It does not assert that every card has a live collection. It depends on the existing sole-mutator owner boundary; future mutation paths must maintain or invalidate it. No intent flag, origin label, state vector or public workspace API authorizes the shortcut. [Source review](./performance-experiments/2026-09-15-f17-repair-r1/implementation-review.md).

## Correctness evidence

Nine affected files pass **176 tests**, including **18 new cases** and a new **60-history generated differential**. The new cases exercise reference preparation, Local handoff, Local selection snapshots and controlled Account source capture. The reference-preparation owner uses the candidate runner; the direct unconditional command adapter supplies the separate differential oracle.

Directed cases verify clean/no-op scan counts, preserved structural and undo/redo repair, dirty remote subscriber input, orphan location/array restoration, pending membership dependencies, refused storage, candidate reuse on retry, discard without transferring cleanliness, close and separate owner closures. Account source bytes retain system-before-human attribution and reconstruct the full accepted state from the dirty remote basis. Generated histories compare complete document state, command results, selections and undo/redo depths across forks, dirty bases, discard and exceptions. Existing affected suites add wider membership, source, selection and projection coverage.

Two deliberately broken variants are caught in all four owner modes: omitting remote invalidation, and marking the accepted source repaired when its candidate is still unaccepted. The source is restored and its identity checked before builds. TypeScript passes; the final 18 focused cases pass after fixture corrections. The initial missing-WASM sparse-checkout failure and fixture type errors remain in the packet. No candidate runtime correctness failure was observed. No full product suite or native Account campaign runs here.

## Fixed browser comparison

Both variants use the actual React Compiler build and identical build-only Local snapshot activation. The prior round's screen, measurement helper and recorder remain byte-identical. Each fresh Chromium 151 session uses Pixel 7 settings, 1280×900 viewport, 20 seeded days ×15 cards, 400 seeded Goals lines and an additional marked edited card. CPU4 applies after unthrottled setup. Eight warmups and 40 early measured keys precede 96 further warmups and 40 later keys; measured input requests 50 ms gaps.

The ordinary order is selected/candidate/candidate/selected, followed by a separate selected/candidate Unicode pair. All **480 measured keys and 624 warmups** are retained. Exact block text, bounded undo/redo roundtrip, existing cold-corpus checks, final edited-card reopen and browser/server/process-group drain pass. The corpus helper checks each day's count and card-15 marker plus seeded Goals line count; this is not a byte-for-byte whole-corpus replay assertion. The undo check requires text to change and redo to restore it, not a one-key depth assertion. The block labels do not establish verified history-depth strata.

An initial sandbox launch fails at loopback listen before creating a browser or collecting samples. Its log and drained parent record remain. The unchanged screen's server-close error prevents a child result file for that attempt. Native-prefixed identities then execute the fixed campaign with host permission for the isolated fixture. No personal server or browser profile is used. [Launch record](./performance-experiments/2026-09-15-f17-repair-r1/launch-note.md).

| Ordinary-text block | Selected median | Candidate median | Paired median improvement | Paired p95 improvement |
| --- | ---: | ---: | ---: | ---: |
| Early | 28.90 ms | 27.30 ms | 5.5% | 12.1% |
| Later | 30.75 ms | 27.55 ms | 10.1% | 9.4% |

Latency cells are medians of the two session statistics; percentages use median paired ratios. Individual ordinary median improvements are **6.25%/4.83% early** and **4.50%/15.64% later**. The later effect varies substantially between pairs. Unicode median gains are **4.86%/4.41%**, with p95 lower in both blocks. Every individual paired median and p95 favors the candidate.

This is descriptive engineering evidence from two ordinary pairs and one Unicode guard. Keys within sessions are dependent, p95 has only 40 samples per block, and order reversal cannot remove host/JIT/GC variation. There is no population confidence interval, stable percentage prediction or strict complexity proof. The recorder is a paint proxy, with no quantile subtraction. No profiling, forced GC, long-history growth campaign, phone run or unchanged application-gate rerun occurs. These absolute timings are not directly comparable with the preceding growth protocol or formal gate.

## Disposition and next phase

Add repair eligibility to the retained experimental combination. Keep the optional UI/publication patches and all prior outcomes. Its modest, consistent improvement is useful without being sufficient to close F-17. [Decision](./performance-experiments/2026-09-15-f17-repair-r1/decision.md).

**Next: incremental publication**, keeping detached public reads and full verification, with explicit handling of structural/remote changes and status/selection updates. Then persistent text-history buffers with full verification; incremental verification's proof, hidden scans and detection policy remain separate. Native ownership/memory/Account composition qualification and the unchanged application gate still precede RC entry.

Main runtime/tests/defaults remain unchanged. The last actual gate remains **12.2/75.1 ms desktop/CPU4 card p95**, with Android focus **54.2 ms**; F-17 stays partial. Counts remain **618 obligations; 263 files /2,121 dispositions (11 not applicable); 0 test-file /96 command /63 campaign unresolved**. These exploratory tests are preserved with the candidate and are not newly integrated release adapters or receipts.

The prior growth packet, 52 personal/package/vector pins, root perspective, signed append-only prefixes and L-2 remain unchanged. Complete source/bundle/helper identities, both patches, controls, all samples and the original launch failure are retained. Personal app/server, phone, relay and deployment remain untouched. This phase is signed and signature-verified as `e0a8726347b75d8c57a89afcbdf9ca34ed829b39`. The archived packet retains its original pre-commit identity.
