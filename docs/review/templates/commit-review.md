---
schema: 1
kind: commit-review
commit: <full-sha>
parent: <full-parent-sha>
batch: <B-01|B-02|B-03|B-04>
classification: <substantive|traceability|evidence|measurement|maintenance|planning|propagation>
status: in-progress
owner: <task-or-agent-id>
started: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
verdict: <pending|supported|supported-with-qualifications|reopen|superseded|traceability-only>
blocked_on: none
superseded_by: none
---

# Commit `<short-sha>` — `<subject>`

## Scope and exact sources

<!-- Record SHA:path citations, inspected diff commands, and primary external sources with versions/dates. -->

## Change seen while moving backward

<!-- What proposition, construction, evidence or constraint disappears on returning to the parent? -->

## Original-contract trace

<!-- Which exact original requirement, open question, non-goal, risk or exit criterion does this address? -->

## Construction and state-machine effect

<!-- Name actors, trust boundaries, persistent state, orderings, algorithms and failure paths. -->

## Assumptions and guarantee boundaries

<!-- List changed assumptions. Classify guarantees as cryptographic, operational, platform, product or absent. -->

## Evidence and oracle independence

<!-- Which exact property is tested, and could producer and checker share the same mistake? -->

## Downstream propagation

<!-- Which later rows, requirements, code paths or claims inherit this conclusion? -->

## Consequences and residual failures

<!-- Include confidentiality, integrity, availability, durability, portability, UX and migration effects. -->

## Falsification attempt and counterevidence

<!-- State the strongest attempted counterexample, its result, and counterevidence. Preserve null findings. -->

## Nuance preservation

<!-- Was reasoning faithfully propagated? Identify the first known divergence if not. -->

## Verdict

<!-- Justify the front-matter verdict. A supported decision may still have bounded residual risk. -->

## Findings and unresolved checks

<!-- Link findings or state none survived. Name the next discriminating check for unresolved points. -->
