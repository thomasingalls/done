# Unchanged Account authority authentication

2026-10-12. Bounded v9 owner repair, enabled locally by default. Set
`VITE_ACCOUNT_AUTHORITY_REUSE=0` to retain full authentication on each authority check.
No stored format, wire format, key custody, login/session, or admission ordering change.
This memo does not cache network logins, access grants or service responses. Their expiration,
revocation, signature and dispatch checks remain independent of local custody authentication.

## What can be reused

The exclusive Account owner already fixes the expected promotion/joined marker payload and
custody record. Its ordinary `assertCurrent` previously read the slot inventory repeatedly,
opened the factor, authenticated the initial and current records, authenticated the marker,
and encoded the marker/record again on each call. The preceding online typing profiles sampled
3.71–4.86 seconds in custody payload encoding across a typing window.

The new private memo retains one detached structured snapshot of the **complete scoped custody
inventory**, including keys and every record field. It is captured before authentication. The
same snapshot's values pass the existing claim, custody, marker, key-binding and expected-authority
checks before reuse becomes eligible. The memo does not retain roots, factor bytes or crypto keys,
and returns no record buffers to callers. Its memory grows with the bounded custody inventory,
not with the number of calls; it is not a constant-size claim independent of checkpoint size.

Every check still rereads the bounded slot inventory under the session task. The normal database
layout, scope and 32-row cursor limit still apply. Exact key/value equality permits skipping only
the repeated parsing, factor opening, MAC authentication and expected-payload encoding. Byte arrays
are compared directly; no MAC-only shortcut or retained digest stands in for stored bytes. Plain
structured objects/arrays are compared with exact own field sets. Unsupported structures and deep
nesting do not qualify for reuse.

Clear and pre-active import interlocks live in this inventory. Adding or modifying either prevents
a cache hit; full checking refuses before claim use, with the existing disposition. First-device
and joined-device full readers retain their public behavior and share their authentication bodies
with the single-snapshot verifier. Full verification of a changed inventory does **not** authorize
adoption: its marker and record must still match the owner's expected state.

Unlike warm ledger reuse, this does not introduce a delayed-corruption window. Changed custody
bytes or keys are noticed on the next authority check, including changes retaining the same MAC.
The pre-existing exclusive-writer assumption still governs the interval between a read/check and
the effect it protects. This does not defend against arbitrary live script compromise or coherent
rollback beyond the original protocol's guarantees.

## Lifetime and invalidation

- Each owner starts empty, including after lock/reacquisition; startup remains fully authenticated.
- Visibility return, `resume` and `pageshow` clear reuse, even with warm ledger reads disabled.
- Explicit successor/membership adoption and history's permitted custody refresh clear reuse before
  installing the expected authority. They retain all existing full transition checks.
- A failed authority read/check clears the memo. There is no negative-result cache.
- Close/abort invalidates immediately; disposal erases retained byte arrays and drops the snapshot.
- Session task checks guard entry, native settlement and installation. An invalidation revision
  prevents an earlier asynchronous verification from reinstalling a snapshot after resume/close.
- The Account task queue remains serialized. The helper additionally refuses overlapping checks;
  a rejected second caller cannot erase the first caller's in-flight buffers.

The memo clones before verification, compares against the verifier's input afterward, and never
installs mutated input. Subsequent reads and verifier inputs are erased separately; no caller can
mutate or erase the retained snapshot. JavaScript strings are released, not claimed securely erased.

## Evidence and next boundary

See the [prospective protocol](performance-experiments/2026-10-12-authority-reuse/protocol.md)
and [results](performance-experiments/2026-10-12-authority-reuse/README.md). This repair keeps the
remote admission fence. The agreed decision threshold determines whether to proceed to the
[prepared remote handoff](account-prepared-remote-handoff-design.md); it does not authorize a
third general shrinking pass or a release-validation campaign.
