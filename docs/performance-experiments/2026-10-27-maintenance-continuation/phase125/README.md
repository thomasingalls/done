# Phase125 — durable preparation and fixed-cut design

Parent124. Design only; no runtime bytes, stored-format allocation, reader, writer or scheduling
change. [Contract](../../../account-local-retention-resumption-design.md) separates preparation-only
checkpoints from a later reader-first partial-retirement format. The source review pins the current
v5 allocation/cut equality, survivor requirement, retained-attempt pin and existing service rules.
Those observations constrain the design; they do not prove the proposed continuation sufficient.

Choose bounded authenticated verifier checkpoints, normal unlock/erasure, exact captured-prefix
validation and untouched originals. Reject generic persisted success/cursor caches and relaxing v5
in place. New appends should survive an eventual fixed cut; one strict exchange and independent
candidate/readback checks remain. Provisional 2s slices/8ms yielding and 250ms final fence are targets,
not measurements. One indivisible operation may need a worker or algorithm change.

The implementation plan specifies authority, interruption, nonce, compatibility, locked removal,
source/coverage, rollback and native crash falsifiers. No mirror-only test pretends the design exists.
No new required test file or crypto construction is registered until implementation. Prior916/371
obligations/blocks remain. Ordinary receipts will be refreshed against the final cumulative slice.
No phone/computer use, signing, push, release preparation or deployment. Qualification stays paused.
