---
schema: 1
kind: finding
id: f-9860a0b-legacy-plaintext-repair-undefined
status: candidate
type: contradiction
severity: low
confidence: high
introduced_by: 9860a0bc1611b01eac76abcc5584afc51f5ed959
work_item: X-02
created_by: /root
updated: 2026-08-21
challenged_by: none
superseded_by: none
---

# `Legacy plaintext is refused and preserved, but no selected repair transition removes it while preserving cutover data`

## Affected requirement or guarantee

No app-managed persistent store may contain recognizable plaintext at any lifecycle point, including migration, and
the first deployment must not lose the author's existing development data.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §7.1 and
`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §§6.1, 11.1 and 14.6 require ciphertext-only persistence,
a no-plaintext profile snapshot, and a clean export/import cutover instead of an in-place reader.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef`, `docs/selections/row-2-journal-aead.md` §7 recommends that a
plaintext `1:` journal entry be refused and reported, left intact rather than silently deleted, with removal as an
explicit repair action. `docs/selections/row-3-record-format.md` §7 separately says the old plaintext `done`
IndexedDB database must be deleted rather than orphaned. Neither selection orders export/import, encrypted-store
selection, journal/DB deletion, verification, and restart recovery as one cutover state machine.

## First introduction and propagation

`9860a0bc1611b01eac76abcc5584afc51f5ed959` first selects the `2:` encrypted journal and the preserve-on-refusal
rule for the predecessor's `1:` carrier. `3bea0e69469e47b790fe6214d7fbed42bcf84441` adds the separate old-database
deletion obligation. `dbfd01f54cdfcab994ac7df2298ba0da0bbe7da9` folds ciphertext-only persistence into the
normative documents, while the pinned tip still leaves the repair/cutover ordering to Stage 1/2.

## Reachable consequence

On the known development installation, refusing and preserving `1:` entries leaves recognizable plaintext in
localStorage after the encrypted build opens, so the required whole-profile snapshot fails. Deleting the journal and
old database before the clean import is verified can instead discard the only copy of edits that had not reached
the export. A kill between importing encrypted data and removing both legacy carriers needs an explicit resume
choice or it can repeat import, retain plaintext indefinitely, or delete too early.

## Supporting evidence

The row-2 selection calls a `1:` entry plaintext forbidden by §6.1 in the same paragraph that recommends leaving it
intact. Row 3 calls orphaning the `done` database a test failure and acknowledges deletion as a data-loss decision.
TRD §14.6 sketches the alternative in-place conversion ordering but deliberately avoids building it; it does not
replace the missing clean-cutover deletion/verification transaction.

## Counterevidence and disconfirmation attempt

The affected installation is explicitly unsupported development state with no external users, and a truly fresh
origin plus verified manual export/import can make both legacy carriers irrelevant. That substantially limits
severity and may justify deliberate deletion. It does not define what the build does when the known old origin is
opened or when deletion/import is interrupted, which is the stale-plaintext case X-02 is required to test.

## Validation procedure

1. Seed both the predecessor `done` database and one `1:` journal entry, including an update present only in the
   journal.
2. Exercise the chosen export/import cutover and kill before/after export verification, encrypted import commit,
   active-store selection, journal deletion, and database deletion.
3. On every restart, require either a recoverable pre-cutover state or one verified encrypted post-cutover state;
   after completion, inspect all IndexedDB/localStorage carriers for recognizable plaintext.
4. Assert the encrypted runtime never replays the plaintext carrier as application content.

## Disposition

Clarify the clean-cutover repair state before Stage 1/2 and encode the stale-carrier kill matrix in the
no-plaintext-at-rest test.
