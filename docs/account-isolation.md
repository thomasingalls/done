# Cross-account admission capability isolation (F-21.3)

Base: signed `c10dee3`. This phase tests the existing private service admission boundary with two valid
accounts in one database and one authority. It does not provision a real account or implement enrollment.
The older generated admission `wrong` command uses an unknown token; the older activation swap fixture
uses two databases, making the neighbor's credential unknown at the tested service.

## Boundaries and legitimate behavior

| Operation | Capability and target binding | Retained check / effect |
| --- | --- | --- |
| Pending inspection / abandonment | `retryKey` hashes to a registration attempt; its account must match the explicit account ID (`core.pendingPreparation`) | Exact pending registration/recovery; abandonment cancels only its attempt, recovery and proposed promotion. Active accounts cannot abandon. |
| Recovery begin / finish / resume | Token selects attempt and recovery; finish also requires its recovery ID, bootstrap proof and registration assertion | A fixed draft cannot be replaced. Confirmed exact receipts are historical readbacks, including after cancellation; they cannot authorize promotion without live eligibility. A lone valid token for B is a legitimate B request, not an A/B mismatch. |
| Offer | `#promotionCurrent` binds the registration token to candidate.accountId | Completed registration's account/attempt/passkey, confirmed recovery, exact fixed request, live state, root and client signatures are checked before proposal and again at commit. |
| Activation challenge / completion | Digest selects a retained request, then the same token/account check applies | Completion binds that request/offer. Challenge binds actual passkey, account, request, completion, nonce and expiry. Final proof/receipt/counter/activation commit is atomic. |
| Binding readback | Digest identifies admitted promotion and the same current capability check applies | Exact receipt, registered passkey, authority pin and workspace; a neighboring valid token must not retrieve a binding for A. |

The matrix supplies genuine A and B requests, completions, recovery proofs, challenges and assertions.
Mixed token/target combinations must refuse before issuing another account's authority or mutating either
account. Fully consistent A and B inputs must work, including exact retries. Refusals compare every logical
row in all service tables, not just a state label. A legal operation on A must leave B's rows unchanged.
No test may mistake a uniqueness collision from shared workspace IDs for capability isolation.

Both accounts have distinct principal/workspace/lineage/signing identities, independent recovery and
passkey keys, and a shared core/authority. They are synthetic content-blind admission fixtures; existing
native admission/activation campaigns separately exercise real ciphertext and client-owned persistence.

## Conformance plan and oracle

Directed tests cover pending, offered/challenged, active and cancelled accounts in both swap directions;
correct recovery readback and binding; concurrent legal operations; a neighboring cancellation during
asynchronous verification; and before/after-commit reply loss. Negative assertions require refusal plus
unchanged durable rows and no returned authority. Genuine proof substitutions retain cryptographic
verification; no crypto-success boolean is forced.

Generated histories interleave two per-account ledgers: pending, offered, challenged, active or cancelled.
The oracle records exact accepted offer/challenge/receipt and stable account-owned rows independently of
service result labels. It predicts durable outcomes from selected operations and commit-cut placement,
then checks them after close/reopen. Lost committed replies are not treated as rollbacks. Refused mixes
and operations on the other account cannot rewrite retained proof/counter/acceptance material.

Source omission controls must demonstrate that a valid-but-unbound capability is observable: resolving a
presented registration capability to the target account instead of its owner; dropping explicit pending
account comparison; and dropping the account predicate on abandonment updates. Unknown-token tests alone
must not stand in for these controls. Controls run in temporary source copies and retain real parsers,
signatures and database transactions. Generated failures must preserve seeds, shrink paths and histories.

Only a reproduced production defect warrants runtime changes. Passing this boundary does not close all
F-21 parser/service-composition/neutral-residue gaps, multi-device enrollment, general recovery, HTTP
transport limits, platform qualification or independent release review. Personal build, servers, origin,
operator keys, browser, vectors and historical review remain unchanged.
