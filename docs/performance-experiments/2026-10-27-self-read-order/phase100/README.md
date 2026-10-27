# Phase100 — Self-read suppression independent of publisher order

A current authenticated inbound-cursor projection supplies an eligible, unconflicted peer-backlog
boolean to the existing selector. A recent verified own check can then survive an intervening empty
peer. It remains bound to the same credential/time window; unresolved current self submissions,
expiry, rollback and reset still force reconciliation. A conflicted own state supplies no new hint.
No retained proof is reused through that boolean and no cursor advances from it. Every other peer's
original order/turn, four-useful-page bound, fresh authority/history/witness/nonce/signature/final
commit check, rate/burst/concurrency, backoff and format stays. No general idle-peer deferral.

Six new scheduling regressions first give13pass/3fail alongside the10 old cases. Implement the narrow
repair and add two projection-hint cases:45 focused unit cases pass, including870 complete3..6-
publisher permutations, every non-self turn, first/unverified self check, pending self, idle sweep,
clock expiry/rollback, reset, credential change, removed/conflicted peers and nonmutation. All10 old
selector test bodies/assertions remain byte-exact; only imports and appended cases change.

Affected encrypted/native checks cover24 distinct cases over proper configurations: default19pass/
5 conditional skips; required authority3 and audit2 pass. Final-source self-decision unknown/blocked
cases pass again after adding the conservative own-conflict hint guard. Do not present this as one
24-case execution. Atomic receipt/content, independent read reconciliation, cold continuation and
changed custody/clear/import refusal remain. TypeScript and81 metadata cases pass. Construction
registry is exactly unchanged; ordinary census/manifest are refreshed, still912 obligations/367
unresolved. No new aggregate credit or qualification resumption.

[Prospective comparison](protocol.md) retains every original gate. Rebuild both reference/candidate,
observe outgoing hashed read metadata equally without service instrumentation, and rerun fixed
R,C,C,R heavy/editing plus non-overlap journeys. Own-request reduction must be demonstrated in the
actual composed client; helper counts alone establish no wall speedup. The existing large Goals
seed shortfall is retained honestly. Results belong to later patches, not this repair checkpoint.

Unsigned sequential100 after99. No signing, push, preview restart, release preparation or deployment.
