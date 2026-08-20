# Commit review cards

One file per commit, named by the full 40-character commit id. Create it from
`docs/review/templates/commit-review.md`. Absence means pending. Never use a short id as a filename.

A batch work item is not complete until every commit assigned to it by `lineage.tsv` has a complete card and the
batch analysis reconciles their dependencies. Pointer or reference-only commits still get cards.
