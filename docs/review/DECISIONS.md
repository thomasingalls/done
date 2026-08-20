# Stage 0 lineage review — method decisions

This file is append-only. It records changes to the review boundary or method, not conclusions about the product.

## 2026-08-21 — pin the review to Git objects

**Decision:** Review the exact range `c6116669030eedeea3d599bca0da3547114e6930..9edd9300adebcec3abd2234c946f1dcccdc17eef`.
Do not use `HEAD`, branch names, or the checked-out files as boundary aliases.

**Reason:** The setup worktree is detached at an intermediate commit, while descendant stacked branches remain
available as Git objects. Full object ids make the intended lineage reproducible.

## 2026-08-21 — extract the two boundary models independently

**Decision:** `F-01` reads the original contract without later-selection anchoring; `F-02` models the end state
without judging it against the original. Compare them only after both are complete.

**Reason:** Reading a polished final rationale first makes an ambiguous original sentence look as though it always
carried the final interpretation. Reading only the original makes later interlocking state machines harder to see.

## 2026-08-21 — use a reverse primary walk and a short forward reconciliation

**Decision:** Review commits from tip to base in four ordered batches. Run a forward replay only after the reverse
and cross-cutting passes, to locate the first introduction and propagation of a discovered divergence.

**Reason:** The user's question is about conclusions visible at the end and nuance lost on the way there. Starting
from their downstream consumers exposes hidden dependencies; the forward pass then recovers causal introduction.

## 2026-08-21 — derive progress from independent artifacts

**Decision:** Keep immutable manifests, per-commit cards, per-work-item analyses, per-finding files and uniquely
named session logs. A coordinator-owned status summary may lag; the validator derives mechanical progress.

**Reason:** One shared log or checklist is a merge-conflict hotspot and makes competing analyses overwrite one
another. Independent files also preserve useful disagreement.

## 2026-08-21 — keep review and remediation separate

**Decision:** The lineage review does not edit production code, project requirements, selections, vectors or tests.

**Reason:** The request authorizes analysis and the machinery to continue it. Fixing a finding can destroy the exact
historical state being examined and requires its own scope and verification.
