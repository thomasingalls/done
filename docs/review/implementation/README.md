# Implementation reviews

These reviews cover encrypted-store and Account implementation after the original Stage 0 lineage
review. The same source continued the original F identifiers in two addenda, adding N and P identifiers.
Preserve those namespaces; they are unrelated to the older `docs/review/work-items.tsv` IDs.

**Start with the [current findings and remediation index](./findings.md).** It reconciles all 47 leaf
IDs, links duplicate/extended findings to one work item, and preserves separate completion criteria.
Current priority is measured Account sync liveness (F-07/N-01/N-02/P-01, with N-03/P-02/P-03), followed
by the remaining residue-evidence work. This is a priority change from the 2026-09-12 addendum intake,
not a claim that those implementations are repaired.

- [F packet: af8941e..96a2040](./af8941e-96a2040.md): supplied review and 45 historical responses
  assessed at `f6e4cf4`, archived after editor integration `19586b6`; preserved byte-for-byte.
- [N addendum: 96a2040..1ceb88d](./96a2040-1ceb88d.md): nine new findings plus prior status rows;
  40 current `resposnse` blocks assessed at signed `27e5b6f`.
- [P addendum: 1ceb88d..393ef43](./1ceb88d-393ef43.md): seven new findings plus F/N status updates;
  27 current `resposnse` blocks assessed at signed `27e5b6f`.
- [Intake record](./addenda-2026-09-12.json): original/annotated hashes, assessed revision, source pins
  and one current disposition per leaf ID. Removing marked additions recovers each original addendum.

The addenda's original prose and measurements are preserved; current annotations distinguish resolved,
partial, open and overstated claims. A statement of intent is not completed remediation. Current
closure records are linked from the index, including the bounded F-05/F-06 aggregate and subsequent
F-15/F-21 evidence. F-21.4 remains partly open after R1. Broader release, platform and formal gate debts
are not silently closed by this review set.

Completed work belongs in `docs/completed.md`; only the active L-1 slice belongs in `docs/progress.md`.
The new annotations and organization are left unstaged/uncommitted for review.
