---
schema: 1
kind: finding
id: f-745e332-envelope-refusal-carrier-missing
status: repaired
type: implementation-hazard
severity: medium
confidence: high
introduced_by: 745e332b061e0e964ae655e853f2f3b393667c66
work_item: X-03
created_by: /root
updated: 2026-08-29
challenged_by: root-v01-20260826
superseded_by: none
---

# Ordinary envelope re-minting depends on an authenticated refusal carrier that is never selected

## Affected requirement or guarantee

One sequence is both a credential's outbound and accepted position. A rejected envelope must therefore be re-minted
at that same position, while an accepted-but-unacknowledged envelope must never be re-minted: doing so creates two
links at one position and makes an honest credential indistinguishable from a compromised one. The tip correctly
states that only an authenticated definite refusal can distinguish those cases.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/TRD.md` §§7.4–7.5 and original claims `OC-032`, `OC-066`–
`OC-068` require service acceptance evidence, non-equivocation, a committed cutoff, and an exact anti-replay rule.
The concrete refusal/retry carrier was still open.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef`, `docs/selections/row-6-antireplay-retention.md` §3 and TRD
§7.4 require a definite refusal before re-minting and classify timeout/silence as non-refusal. TRD §7.4 further says
the refusal must be authenticated and points to row 15. But `docs/selections/row-15-transitions.md` selects only a
transition `Outcome` over `(kind, workspace, lineage, target, epoch, committed_id)`. It cannot name an ordinary
envelope's credential, position, digest, or assertion that those exact bytes were never accepted. No tip generator,
vector, service schema, or inventory row defines a signed ordinary-envelope refusal.

## First introduction and propagation

`745e332b061e0e964ae655e853f2f3b393667c66` makes definite refusal the only license to re-mint but leaves its
authority unspecified. `4259822828060fe2b9592fa525cd9a17170af285` correctly authenticates transition outcomes
and the fold generalizes that lesson to ordinary envelopes without adding a corresponding carrier. The missing
object survives in the tip TRD, row-6 selection, and antireplay vector prose.

## Reachable consequence

1. A service accepts envelope `E_n`, but a hostile relay withholds the acceptance reply/head from its sender.
2. The relay returns an unsigned stale-epoch or policy error and claims `E_n` was refused.
3. A client that treats that error as definite re-mints different bytes `E'_n`. The service may already have closed
   position `n` over `E_n`; other clients then reject `E'_n`, and the honest sender has framed itself as an
   equivocating credential and stalled its later writes.
4. A client that follows the stated authenticated-only rule avoids the integrity failure, but an envelope that was
   genuinely rejected has no selected authenticated refusal it can receive. Its credential chain can therefore stay
   unavailable indefinitely.

The impact is accepted-state integrity or per-credential write availability; the relay still learns no content key.

## Supporting evidence

An exact-tree search at the pinned tip finds ordinary “authenticated refusal” only as prose. The antireplay
generator demonstrates self-equivocation but publishes no refusal bytes or signature verifier. The transition
generator's `fabricated-refusal` negative authenticates a different state change whose outcome fields do not identify
an envelope. All five relevant exact-tip generators pass `--check`, so the gap is in the selected protocol model,
not stale generated output.

## Counterevidence and disconfirmation attempt

A final accepted head proves no later position will ever be accepted, but it applies to a revoked/finalized
credential and does not license useful same-position re-minting. A non-final head at `n-1` does not prove that
position `n` was never accepted later. A signed row-15 outcome identifies a transition, not an envelope. Treating all
other responses as silence is safe for integrity, but leaves the genuine-refusal liveness case unresolved rather
than disproving it.

## Validation procedure

1. Define a refusal statement that binds at least workspace, credential, position, the refused envelope digest,
   relevant epoch, and an unambiguous never-accepted verdict under an authorized service key.
2. Accept `E_n`, lose its reply, and present a forged/unsigned refusal; the client must retain/resubmit `E_n` and
   never produce `E'_n`.
3. Genuinely reject `E_n`, replay a valid signed refusal, and verify that one re-mint at the same position is allowed.
4. Replay or substitute the refusal across credentials, positions, digests, workspaces, and epochs; every case must
   fail without advancing or discarding local outbound state.

## Disposition

Reopen before Stage 4: select and vector the authenticated ordinary-envelope refusal carrier, its signing authority,
idempotency, and relationship to accepted/final heads.

**Repaired — 2026-08-29** under the authorized `S0-10` disposition workflow (`docs/review/README.md` §Finding lifecycle states the standard; `remediation/traceability.md` is the
generated finding→falsifier matrix). The defect's return is refused by the seven `refusal-*`
genuine-signature negatives (envelope vectors).
