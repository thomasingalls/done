# Service-issued decision composition — F-21.7

2026-09-12 (Europe/Paris). Base: signed `2bbb4c6be75f93b3516b57605cf7b13770f5e3b6`, plus this
test/harness patch. The [historical review](./af8941e-96a2040.md#f-21-test-gaps-carried-forward)
and its original responses remain unchanged.

The missing composition evidence was real. The older service/browser case exercises acceptance;
older client refusal/conflict tests sign with `fixtureAcceptance`. Neither demonstrates actual service
issuance, retained service state and client handling together. Importance is medium authorization and
recovery evidence, without a demonstrated production failure from the missing test itself.

The new [contract and fixture scope](../../account-decision-composition.md) use the actual admitted
synthetic device and service. A signed generation-2 restamp of the original ciphertext causes the
first-epoch mismatch policy to close its subject. The original generation-1 browser submission then
receives that exact retained refusal. This requires the authorized device signer; it is not an attack
available to an unauthenticated relay. For conflict, a fresh valid encrypted envelope from a deliberately
branched synthetic device wins the same position. The original client receives the real winning head.
No acceptance key is extracted to mint the tested responses, and service policy/crypto checks are intact.

## What the new checks establish

- Actual HTTP submission handling passes issuer bytes into the retained v8 ledger, automatic sender
  and v9 shared scheduler. Fresh service/authority connections verify exact decision and witness
  retention. Lost HTTP replies leave the original pending submission available for byte-identical retry.
- Four service SIGKILL cases cover both sides of refused/competing-accepted decision commits. Four
  renderer deaths cover both sides of local response commits. Cold owners derive state only from the
  committed response/witness and preserve the original sources, submission and envelope.
- Later Local edits remain readable through halt, close and reopen. Compaction preserves exact source
  and proof rows. Invocation counts and spool positions remain fixed after fixture preparation; no
  browser retry performs new network encryption.
- Sixteen generated native histories vary response loss, invalid/duplicate answers, Local edits,
  compaction and restart. Twelve more permute a genuine refusal and an accepted successor carrying its
  service-issued parent. The oracle compares full retained proof sets and exact durable bytes, not
  merely the final status. Both campaigns shrink failures and preserve their seeds/histories.
- All three omission controls produce the expected bad outcome: reporting a recorded response without
  persisting it, retaining a refusal but remaining ready, or retaining a conflicting head but remaining
  ready. Real service issuance, parsers and cryptographic verification remain enabled in those controls.

Arrival order deliberately affects the retained proof set. Refusal-first retains the refusal and later
conflicting head. Conflict-first retains the head and declines a new refusal write because publication
is already conflicted. Both preserve Local content; equal final state alone would miss the difference.
The service still returns the original refusal for its permanently closed subject after accepting the
successor. The test-only successor author is not a new production successor-minting API.

Two initial expectations were harness errors, not production defects. The current editor can append
an empty `[0,0]` Yjs capture on reopen. Comparisons now require every old capsule exactly and allow only
that precise no-op with the same authenticated route/actor as an otherwise unexplained new capture.
Also, the automatic sender intentionally hides its raw pending-submission method; the test now checks
the retained ledger and read-only status rather than trying to call an absent capability.

The sync lanes are independent. A send refusal leaves receiving idle and available; it does not require
a shared closure. A competing self-stream is refused before inbound persistence, with an active Local
editor. The existing receive diagnostic is `operation-failed`, while the send lane reports retained
`conflict`. This result does not improve that diagnostic or claim a persisted inbound conflict where
the incoming candidate was refused. Tests verify those actual boundaries on cold restart as well.

## Execution and limits

**F-21.7 is closed for the current private first-epoch decision/owner composition.**
The [final campaign](../../account-conformance-runs/2026-09-12-account-decision-composition.md) passes
47 stages, 112 Node tests (24 new), 40 selected unit cases and 875 matching source pins.
Types, 30 vector commands, census/map/registry, lint and format pass; no skip or timeout occurred.
No production counterexample was found. Historical review bytes and earlier receipts remain unchanged.

No production source or valid protocol bytes have changed. This is bounded private first-epoch evidence,
not support for cloned credentials, general successors, enrollment, lineage evolution or arbitrary
concurrent writers. Fixture-only alternative encryption is outside production invocation accounting;
the no-reseal check begins after that deliberate setup. Native renderer/service death is not physical
power failure, and Chromium is not a platform matrix.

F-21.6's named unit oracle remains unchanged; these stronger composition checks do not close that
separate assessment. Remaining parser assurance, neutral residue scanning, diagnosis/salvage,
maintenance/performance and broader Account/release gates also retain their separate obligations.
