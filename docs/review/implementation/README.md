# Implementation reviews

These reviews cover encrypted-store and Account implementation after the original Stage 0 lineage
review. The same source continued the F identifiers through N, P and Q addenda. Preserve those
namespaces; they are unrelated to the older `docs/review/work-items.tsv` IDs.

**Start with the [current findings and remediation index](./findings.md).** It reconciles all 55 leaf
IDs, routes duplicates/extensions to shared work and retains separate completion criteria. Current
priority is repairing remaining Account liveness costs (F-07/Q-03, then Q-02), with explicit expiry
diagnostics (Q-05), before release qualification. [Validation prerequisites Q-01/Q-04](./validation-controls.md)
are restored within the bounded campaign; complete aggregate validation remains open.
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
