# Native fixture repair and final functional checks

The two failures in phase C also reproduce on frozen phase-A code. Neither is suppressed:

* The pre-group reader previously spliced three historical files into current production dependencies and failed before meaningful compatibility validation (`loadAccount` missing). It now builds the entire production graph at `534252e1dde26a02020491b2f42e2481513abb98`, using the existing historical archive helper and its genuine reference switch. The old three-transform count is replaced by independent Git-byte pins and complete graph checks in a new regression. The native journey still compacts, cold reopens and checks all five exact receipts.
* The amortization probe counted content `getAll`, which warm reads no longer issue. It now counts actual content-counter `meta.get('counter')` operations on a database containing content. The assertion still requires the grouped count to be less than half the individual count, along with every original received-through/transaction assertion. Measured counts are 36→9 reads, 92→23 readonly transactions and 8→2 readwrite transactions. Only this case's descriptive title changes; no deadline or case disappears.

The historical helper accepts only the closed reference/incremental macro values, copies them before async work, includes them in cache identity and records them in source evidence. Two new cases cover rejecting unrelated source replacements, captured options, distinct caches/modes, pinned original production bytes and module closure. Both fail against the previous helper. The combined negative run lets the old helper start an unwanted async build before its missing-exception failure; a separate isolated second-case run confirms the actual missing definition/identity failure. Both results remain. The existing normal-CI historical-owner gate includes the new file without changing its timeout.

## Final checks on the cumulative checkout

* 14 native receive/service/closure cases pass (12 preceding, two new).
* Nine complete historical/emitted-bundle/unsigned-successor checks pass, including old-reader refusal without writes.
* 90 focused budget, batch, authenticated transport, history/handoff and native-ledger cases pass.
* 64 codec, actual mutation-control and dense-history unit cases pass.
* 37 affected registry/planning/adapter cases pass.
* TypeScript, changed-source lint and formatting pass. The correctly rooted frozen phase-C frontend passes its build byte budget and origin-isolation checks. Its earlier build and all 55 measured assets remain pinned. Explicit formatting of three generated JSON snapshots reports the same three files on signed HEAD; preserve both reports and leave their established generator layout alone. This is not a claim that the repository-wide formatter or full suite is green.
* Read-only crypto census and planning checks retain all 867 signed-base obligations, every old stage/expectation/deadline/block and all construction statuses. Seven new files remain blocked from aggregate credit: 874 obligations / 330 unresolved. Construction dependencies only gain tests; the two existing source-site line adjustments retain their exact homes/labels. No qualification credit is inferred from normal CI.

The final audit compares every production source in src/account-protocol/account-service with the frozen measured phase-C source and all 55 frontend asset hashes. It confirms that the deferred append-cache runtime is absent, durable single-entry inbound records are unchanged, the real index is empty, and prior patches/deferred formatting/docs/progress.md are untouched. The audit's first draft incorrectly expected delivery.ts unchanged from signed HEAD (it owns phase-2 authority reuse) and omitted the two reviewed import-induced source-site line shifts; its corrected assertions check the exact measured production graph and preserve every contract/status.

## Limits

The final runtime is exactly the measured phase-C candidate; these repairs change test machinery only. The 14 matched browser connections and nine unique packaged functional journeys from phase C remain its browser evidence. No Firefox/Bitwarden, phone/WAN, full-suite or release qualification claim is added here. All six fixed-offer concurrent-writing replays in phase D fail; that acceptance condition remains open and the unsuccessful extra cache mechanism stays deferred. Do not release this series on the strength of the passing functional checks.

No signing, push, preview restart, merge or deployment. Port 8443 remains the signed progress build. Source/patch application identities are verified separately in the operator's external patch manifest to avoid a self-referential tree hash.
