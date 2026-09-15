# Prep for the next bounded phase: membership-repair eligibility

Static preparation only; no candidate is implemented during the growth campaign.

The accepted plan puts membership repair and incremental publication in separate phases. A conservative first repair experiment can avoid a broad transaction-classification change:

1. Keep a private, owner-controlled fact that the accepted projection has completed membership repair. Bind it to that projection's lifetime. Initialization and existing completed repair paths can establish it.
2. Invalidate it before publishing any accepted remote change. Initially invalidate for every remote update; narrowing this to transactionAffectsMembership is optional later work. Merely queuing a repair cannot establish cleanliness.
3. A text command may skip its one pre-command full scan only when its exact accepted basis is known repaired. Otherwise run the existing repair before resolving editability/location/selection. Preserve any resulting system update and source capture. Non-text paths retain current repair behavior.
4. A prepared/pending candidate carries its own result; it cannot mark accepted state clean before promotion. Retry must preserve that candidate, and discard/close must not transfer its claim to another revision or owner. Received changes invalidate accepted cleanliness even when they wake previously pending dependencies.
5. Preserve the repaired-basis fact across a private history fork only through the trusted owner. No caller-provided metadata, state-vector-only inference or shared mutable global flag is an authority for skipping repair.

Tests should distinguish clean repeated text from a remote change with repair queued but not yet admitted. Include a subscriber that submits local input during remote publication, so scheduling does not accidentally make the test safe. Check orphan/location restoration, structural changes, undo/redo, pending dependencies, refused writes/retry/discard, no-op text and close. For Account, preserve transaction-derived system/human source coverage even if the initial experiment only activates privately for Local. A deliberate always-clean fault must fail the dirty-basis case; stale/unaccepted cleanliness must also be detected.

Measure the candidate against the same R3 combination with focused controls and the short browser screen. Do not infer a6ms saving from the older profile or a two-pass claim:the text case returns before the syntactic final pass. This is a safe-first candidate boundary, not a completed proof or performance result. Broader incremental publication, persistent histories and changed verification remain separate.
