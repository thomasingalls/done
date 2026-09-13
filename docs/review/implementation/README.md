# Implementation reviews

These reviews cover encrypted-store and Account implementation after the original Stage 0 lineage
review. The same source continued the F identifiers through N, P and Q addenda. Preserve those
namespaces; they are unrelated to the older `docs/review/work-items.tsv` IDs.

**Start with the [current findings and remediation index](./findings.md).** It reconciles all 55 leaf
IDs, routes duplicates/extensions to shared work and retains separate completion criteria. Current
priority is the [release-validation work package](../../private-release-validation-prep.md): graph,
coverage/deadline work, current prose and an immutable aggregate. The
[phase-1 inventory](../../release-validation-graph.md) and [bounded runner foundation](../../release-validation-execution.md)
and [content catalogue adapter](../../release-validation-execution.md#content-catalogue-adapter--phase-2b)
are complete, as is the [journal adapter](../../release-validation-execution.md#journal-catalogue-adapter--phase-2c).
The [admission adapter](../../release-validation-execution.md#admission-catalogue-adapter--phase-2d)
also passes its 15 baselines and six mutations. The [editor-admission adapter](../../release-validation-execution.md#editor-admission-catalogue-adapter--phase-2e)
passes 12 cases/three mutations and repairs shared runner defects found by its native campaign.
Workspace-admission is next; the full manifest remains blocked on 436 adapter obligations. The [Q-02/Q-03/Q-05 sequence](./liveness-followups.md)
and [validation prerequisites Q-01/Q-04](./validation-controls.md) pass within their bounded campaigns.
F-07's retained-history/workload limits and complete aggregate qualification remain open.
Prior bounded repairs and privacy/recovery/storage evidence keep their documented limits.

- [F packet: af8941e..96a2040](./af8941e-96a2040.md): supplied review and 45 historical responses
  assessed at `f6e4cf4`, archived after editor integration `19586b6`; preserved byte-for-byte.
- [N addendum: 96a2040..1ceb88d](./96a2040-1ceb88d.md): nine new findings plus prior status rows;
  40 `resposnse` blocks assessed at signed `27e5b6f`.
- [P addendum: 1ceb88d..393ef43](./1ceb88d-393ef43.md): seven new findings plus prior status rows;
  27 `resposnse` blocks assessed at signed `27e5b6f`.
- [N/P intake record](./addenda-2026-09-12.json): original/annotated hashes, source pins and the
  original 47-ID crosswalk. That intake and organization were committed in `1372c39`.
- [Q addendum: 393ef43..9ff48b5](./393ef43-9ff48b5.md): eight new findings and 30 prior status IDs;
  38 `resposnse` blocks assessed at `9ff48b5`.
- [Q intake record](./addendum-393ef43-9ff48b5.json): hashes, current routing/source pins, reproducible
  in-memory cache probe, read-only checks and the eleven unsigned commits with their tree IDs.

The original review prose and measurements are preserved. Removing marked additions recovers each
supplied addendum byte-for-byte. Current annotations distinguish confirmed mechanisms, attributed
measurements, partial closures and overstated claims. Intent is not completed implementation repair.
The Q intake reran no browser campaign or full validation aggregate. Its documentation corrections do
not alter historical phase receipts or previously annotated packets.

Completed work belongs in `docs/completed.md`; only the active L-1 slice belongs in `docs/progress.md`.
Broader privacy/platform, Account lifecycle and formal release debts remain explicit in the index.
