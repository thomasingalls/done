# Private Local promotion preparation

This bounded owner follows signed `e96107b` (private root and read-only preflight). It durably prepares
fresh device signing/wrapping credentials while retaining the existing Local identity, custody root,
content key, content store, generation, journal and index. It does not activate an account, issue an
epoch or binding, wrap content keys for recipients, or transport writing. No personal account or service
is provisioned. The personal preview and legacy relay remain stopped.

## Current service state and explicit abandonment

The private adapter adds `/account/preparation/inspect` and `/account/preparation/abandon`, behind its
existing exact Host/Origin, random bearer, JSON-size and no-store policy. Both require the registration
retry capability, exact account ID and a fresh client nonce. The capability authorizes management of this
pending registration; it is not an account session or recipient grant. The independently pinned service
root signs only a fixed-purpose state read from the live `AccountCore`, never caller-supplied state.

Inspection requires the current account row to be pending, registration attempt done, credential
confirmed, and recovery row done with its confirmation receipt. It returns the exact saved recovery
draft and confirmation, not the old receipt alone. Abandonment atomically sets the registration attempt
and any recovery row to cancelled under SQLite WAL/FULL. It accepts absent, unfinished, expired,
cancelled or completed recovery preparation, and repeats idempotently. Active accounts refuse. Audit,
credential and historical proof/receipt rows stay retained; the account row remains pending, but its
cancelled registration cannot become eligible. Existing receipt APIs may still return historical
success; neither this owner nor the future activation owner may treat that as current eligibility.
No service schema change or silent root/credential reset is introduced.

The closed response is `{v:1, pin, nonce, state, signature}`. `state` is a closed, ordered object:

```
{v:1, accountId, attemptId, status: "eligible" | "abandoned",
 draft: RecoveryDraft | null,
 confirmation: {recoveryId, receiptId, draftDigest, recoveryStateDigest} | null}
```

`parsePendingState` reconstructs that field order; `parseDraft` supplies its existing fixed nested order.
The signed bytes are:

```
LP("done/pending-account-observation/v1") || LP(hex(pinBytes(pin)))
  || LP(hex nonce[32]) || LP(JSON.stringify(parsePendingState(state)))
```

The signature is Ed25519 under the independently configured root. The client requires the exact pin and
requested nonce, verifies the signature and recovery root commitment, and recomputes both recovery
digests. The observation describes the service transaction at that request; it reserves nothing against
later cancellation or activation. Future admission must recheck eligibility in its own atomic commit.
The authority owner exposes no arbitrary signing operation. Trusted in-process ownership of the service
core/authority and trusted pin distribution remain assumptions.

## Slot lifetime and authenticated carrier inventory

`prepareLocalPromotion` takes the existing slot and mandatory device code, exact saved recovery draft,
registration account/retry capability, independent pin and bound transports. It acquires the existing
exclusive slot Web Lock. Ordinary shared and exclusive acquisitions still refuse every populated
`[slotId, "application-upgrade"]` marker, including null or an alleged ready flag.

Only `withPromotionSlot` can enter with this phase's marker: it authenticates the ready Local claim,
current custody and promotion MAC using the device factor. Unknown versions, layouts or markers refuse.
The promotion census additionally recognizes exactly this authenticated marker; arbitrary scoped rows
remain errors. The subsequent owner repeats the complete Local preflight, including encrypted database
and journal replay, pending-dependency/admission-material refusal and independent root liveness proof.
It compares the saved recovery draft to the deterministic Local/account lineage and the freshly signed
current service state. Wrong factors and unreadable Local carriers refuse before network requests.

The one new carrier is the stable interlock row in `done.custody/entries`. Its versioned record is:

```
{v:1, kind:"local-promotion", id:hex16, source:PromotionSource, claimMac:hex32,
 pin:AuthorityPin, account:PendingState(status="eligible"), retryHash:hex32,
 custodyMac:hex32, sealReserved:number, credentialIds:[wrappingId,signingId],
 stage:"reserved"|"prepared", credentials:null|[wrappingCredential,signingCredential], mac:bytes32}
```

The source includes slot/principal/workspace/store/root/genesis-intent IDs and generation (currently 1).
The claim MAC retains the authenticated original identity and any imported selection/source-cleanup
provenance. The retry capability itself is not copied to this carrier: `retryHash` is
`SHA256(LP("done/promotion-attempt/v1") || LP(retryKey))`. The caller retains the original recovery owner
record until preparation is either handed off by a later owner or explicitly abandoned.

The MAC key is HKDF-SHA256 of the existing custody root, empty salt and
`fields("done/local-promotion/v1", slotId, principalId, workspaceId, rootId)`, producing HMAC-SHA256.
`promotionPayload` encodes an ordered UTF-8 JSON array of every field except `mac`, with explicit ordered
source, pin and credential tuples, lowercase hex for binary fields, and `pendingBytes(account)` as a
string. Closed parsing happens before signing and on every open. The marker binds the exact current
custody MAC and seal budget. Missing/mismatched custody, stale reservation, changed claim or credential
material refuses; completed counters are never recreated. Keys do not escape the owner; its result
contains only source/account/intent identifiers and the prepared public credential descriptors.

## Two durable boundaries

1. **Reservation.** A strict IndexedDB transaction compares the Local claim, current custody and
   prior/absent marker, increments the authenticated custody seal budget by two, and writes the
   authenticated reserved marker atomically. It retains the original Local credential tuple, factor
   seal and content-key envelope. No key generation/encryption starts before transaction completion.
2. **Prepared keys.** Generate a fresh X25519 wrapping credential and Ed25519 signing credential. Each
   uses the existing custody v2 credential seal: raw private seed encrypted under the custody root,
   fresh random 96-bit AES-GCM nonce, and scope/role/ID/public-key AAD. Public/private correspondence is
   checked. Recheck current service eligibility, then compare-and-write the authenticated prepared marker
   in a strict transaction. No content/index/counter write accompanies it.

Both direct root encryptions consume the reserved budget. An unfinished reservation may have already
invoked encryption, so retry burns another pair before regenerating unpublished keys. It retains the
intent/credential IDs; their public keys become stable only after the prepared commit. A committed
prepared marker is opened and checked, never regenerated or resealed. Lost replies/restarts recover
that exact result. No silent retry can reset the budget or replace a committed public key.

Before the reservation commit, interruption leaves ordinary Local unchanged. After reservation it is
**Local with an authenticated incomplete preparation**, and ordinary editing stays blocked. After the
prepared commit it is **Local with stable prepared device custody**, still blocked for ordinary editing
until an explicit abandonment or later account handoff. The source remains intact in both cases.
The lock is retained through tracked asynchronous work on cancellation and released on renderer death;
there are no leases or lock stealing. Browser transaction completion and strict durability requests are
observed boundaries, not proof of OS power-loss survival or protection against profile rollback.

## Abandonment and preceding recovery cleanup

`abandonLocalPromotion` authenticates the exact marker, owner capability hash, pin, source and scoped
inventory, obtains a fresh signed abandoned state for that same account/draft/receipt, then atomically
compares and deletes only the marker. This removes the two prepared credential references/seals if
present and restores the baseline Local format. It retains all consumed seal budget, original custody,
Local claim/provenance, accepted writing, journal and index. An absent marker is a local no-op; it does
not abandon an arbitrary supplied registration. Changed or unknown markers refuse cleanup.

Service commit before a lost response or aborted local deletion is safe to retry: the marker remains,
the service stays cancelled, and fresh abandonment resolves the same identity. This preparation has no
server-side publication of device credentials or content, so no recipient-key retirement is needed.
Once the future activation boundary exists, abandonment must continue refusing active accounts.

The preceding `withRecoveryOwner` now offers a detached public `draft()` and explicit `abandon()`.
Recovery cleanup requires the independently pinned abandonment transport and factor-authenticated Local
source/lineage. It refuses while a promotion marker is retained, preserving the retry capability needed
to remove that marker first. After fresh service abandonment it deletes its own exact pending recovery
row under its profile owner lock. Lost replies retain that row for retry. Unsaved codes and cancelled or
expired ceremonies can therefore be discarded without recycling the old registration; begin a fresh
registration and generate a new code afterward. No code or private seed is returned by reopening.
These remain private component APIs; no ordinary account UI is mounted.

## Validation and next boundary

The bounded campaign is `pnpm account:promotion`: independent proof reconstruction, service histories,
actual SQLite process death, real Chromium/IndexedDB/WebCrypto/HTTP, renderer death at committed
reservation/key boundaries, request-success/commit aborts, competing tabs, cancellation, journal survival,
imported-claim preservation, missing counters, exhausted budgets and lost abandonment replies.
Generated browser histories compare stable keys, consumed budget and refusal behavior to an independent
ledger. Fault controls must demonstrate actual substituted-intent or abandoned-account acceptance with
the corresponding production check disabled. Generated failures stop without an unbounded shrink.

The next bounded phase is **genesis checkpoint and exact device/recovery wraps under this owner**:
cold-replay the then-current database and journal, preserve never-admitted attribution, prepare the
checkpoint, and wrap the required generation keys to these exact device and confirmed recovery keys.
That artifact needs its own authenticated stage, reservation/census rules and interruption tests before
service activation/index handoff. Following work must atomically commit current eligibility, certified
recipients, first authorization/acceptance head and exact checkpoint/wrap evidence; verify and retain
the signed result before switching the existing Local index. No historical receipt or raw ready flag
can bypass that boundary. Full accounts/sync, second-device adoption, recovery, revocation, production
provisioning, broader device coverage and independent protocol review remain open.
