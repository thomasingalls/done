# Private admission-only successor and discovery bytes

2026-09-16. Phase two, chunks A/B/C/D complete. **The bounded private admission-only path now includes both
owners, private HTTP, automatic reconnect discovery and cold reopen.** [Phase plan](../account-successor-admission-prep.md).

## 1. Construction boundary

`account-protocol/successor.ts` supports exactly one transition from the authenticated FirstEpoch to
epoch 2. `verifySuccessor` re-verifies the original request/receipt under the caller's independent pin,
verifies the historical preparation receipt, verifies the new root signature and checks continuity.
Its result proves a signed admission-only claim. It does **not** prove a preparation remains live,
has been transactionally consumed, or that its head vector matches the actual delivery ledger.
Those are service-owner and client-prefix obligations in chunks B/C.

The effective certified set is the original one-client certification, with its original 0-to-1
approval context. It is copied unchanged and hashed as ordered JSON, matching preparation's digest.
Neither the new root signature nor the pending roster entry authorizes a new recipient. The creating
member retains `read,write,admit,manage`; the pending entry has an empty capability list in this first
private format. Later certification must explicitly establish its capabilities rather than treating
the admission response as a latent content grant.

`generation` remains 1 and `acceptancePublicKey` remains the first epoch's key. The creating publisher's
head can be zero or a positive safe integer with its nonzero link; the pending credential has exactly
position zero/zero link. Both entries are mandatory even before any delivery. Stream and roster IDs
are sorted strictly ascending by lowercase hexadecimal ID, rejecting duplicates and permutations.
The original empty genesis vector and all existing first-authority bytes are unchanged.

## 2. Exact messages and ordering

`J` is compact JSON with property order reconstructed by the closed parsers. Nested properties are
reconstructed too; array order remains significant. Numbers are nonnegative safe integers; version,
epoch, generation and certification-context values below are exact literals. Existing canonical
hex, account base64url IDs, pin and preparation parsers are reused. No extension fields are allowed.
The exported first-certification parser is the original function, with its behavior unchanged.

`H` is SHA-256, encoded as 32-byte lowercase hex. `LP` is the existing u16-length-prefixed UTF-8
encoding. Hashing JSON before LP avoids introducing a 65,535-byte signed-body ambiguity.

| Object | Ordered fields |
| --- | --- |
| Epoch | `v:1, kind:"device-admission-epoch", pin, requestDigest, accountId, principalId, workspaceId, lineageId, epoch:2, parent, generation:1, acceptancePublicKey, preparation, certified, roster, heads` |
| Certified carry-forward | `parentEpoch:0, nextEpoch:1, digest, value` — `value` uses the existing first-certification order |
| Roster entry | `id, wPub, sPub, principalId, state, capabilities` — exactly one `certified` and the exact prepared `pending` candidate |
| Stream head | `credentialId, position, link` |
| Successor artifact | `v:1, kind:"device-admission-successor", epoch, head, signature` |
| Discovery request | `v:1, kind:"authority-discovery-request", pin, workspaceId, lineageId, credentialId, epoch, head, nonce, expiresAt, signature` |
| Discovery response | `v:1, kind:"authority-discovery-response", requestHash, successor, signature` — `successor` is null or the full artifact |

The epoch's `preparation` is the full recursively parsed
[preparation receipt](./enrollment-preparation.md), including its signature. The pin, request digest,
account/principal/workspace/lineage, parent head, unchanged acceptance key, original certification,
preparation context and exact roster must agree with the verified first authority. The preparation's
passkey ID must match the original activation; multiple account passkeys are not introduced here.

| Purpose | Message | Signer / commitment |
| --- | --- | --- |
| `done/admission-successor/v1` | `LP(purpose, H(J(epoch)))` | Pinned `K_auth`; successor `head = H(message)` |
| `done/authority-discovery-request/v1` | `LP(purpose, H(J(request without signature)))` | Creating member's certified Ed25519 key |
| `done/authority-discovery-response/v1` | `LP(purpose, H(J(response without signature)))` | Pinned `K_auth` |

The outer successor kind/version are fixed. Its head is independently recomputed from the signed
epoch message; its signature is over that message, not the head text. Response `requestHash` hashes
the **complete** canonical request including its signature. A response cannot choose a request or
nonce for its verifier. Hashes are commitments within authenticated contexts, not independent grants.

Finite JSON input limits are 24 KiB for an epoch/artifact, 4 KiB for discovery requests and 32 KiB
for responses. Parsing checks size before walking the closed object. A transport must bound incoming
bytes before JSON parsing too. No new binary transport encoding is defined in this chunk.

## 3. Historical continuity and discovery

A caller supplies its independently retained `{epoch,head}`. From epoch 1 the successor must extend
that exact verified genesis head. At epoch 2 only the identical successor is accepted; a signed sibling
is still a fork. The helper cannot know whether the caller supplied an obsolete local anchor; the
eventual lifecycle owner must recheck the actual retained head before committing any result.

Discovery proves possession of the creating credential and binds its independently pinned service,
workspace/lineage, retained epoch/head, fresh 32-byte nonce and expiry. Its lifetime is at most 60 seconds:
`now < expiresAt <= now + 60000`. This private online read uses the caller's clock; it is not the
clock-independent lost-device recovery assertion. An empty signed response can preserve epoch 1 but
cannot roll back a request anchored at epoch 2. A request from epoch 1 may discover epoch 2; a request
at epoch 2 must match the verified current successor. Pending candidates cannot make these requests.

Both verifiers capture all caller-owned inputs before the first crypto await. Successful outputs are
detached and recursively frozen. Neither helper owns time after that captured verification instant,
storage, cancellation or a lifecycle permit. Service/client callers must recheck their live conditions
after asynchronous verification and at commit. A nonce-bound response supplies no progress through a
withholding relay and cannot detect an entirely rolled-back server when the client has no newer anchor.

## 4. Evidence and remaining qualification

`test/vectors/account-successor.json` contains public fixed test seeds, the independently generated
genesis context, preparation, successor, discovery request/response and every new purpose's ordered
JSON, hash and message bytes. `test/account-successor/oracle.mjs` uses Node crypto and independent
construction code, without production encoders. The focused command is `pnpm account:successor`.

Tests compare all intermediates and exercise every successor leaf, signed incompatible changes,
strict parsing/stream bounds, creating-device discovery, nonce/expiry, ancestor and sibling rejection,
input capture and immutable outputs. One hundred shrinking generated cases vary stream anchors and
recursive object ordering. Copied-production omission controls positively accept an independently
root-signed forbidden recipient change or fork only when the corresponding guard is removed.

The construction inventory records this extension as **open**. These fixed vectors and focused checks
do not close authority-map qualification, service commit races, accepted-prefix correspondence or
native client adoption. Historical release qualification remains historical; the aggregate campaign
and its frozen inventories remain paused.

## 5. Durable service consumption and delivery (chunk B)

`PrivateAuthority.admitPrepared(core, {retryKey,attemptId,receiptId})` is an internal, fixed-purpose
composition method. There is no HTTP route for it yet. Input is closed and bounded to 4 KiB. It returns
the exact signed successor artifact or a closed `SuccessorRefusal` value; only the signed artifact is
historical admission evidence. The caller's saved capability is still required for retries.

Schema 7 adds `promotions.successor_head` and `workspace_successors`, with unique workspace and
preparation identities. A null pointer plus no successor row denotes untouched genesis. Either half
missing or a mismatched artifact refuses; there is no fallback. The successor row carries its full
artifact and the prior delivery witness (null only for the empty ledger). Existing schema 6 requires
explicit `upgradeFromV6`; earlier explicit upgrade paths remain. The genesis preparation comparison
token preserves its schema-6 shape, so upgrading does not invalidate an otherwise live preparation.

The owner verifies the original and current authority, historical challenge/receipt, exact preparation
row and full delivery census outside a write transaction. It constructs and signs the successor, then
rechecks the preparation row, passkey/authority token and complete delivery snapshot in `BEGIN
IMMEDIATE`. Ordinary delivery forces a fresh snapshot/vector, at most four attempts; it does not
expire the account proof. Changed parent, cancellation and expiry refuse. Expiry and open custody are
checked again immediately before commit, after synchronous witness signing and the commit hook.

The same transaction inserts the successor, changes the pointer and re-signs the full current delivery
witness under the new head scope. The saved old witness authenticates the exact ledger boundary,
including refusals that do not advance accepted position. Census checks the old witness and the
successor's accepted position/link at that boundary, verifies earlier accepted heads under epoch 1
and later heads under epoch 2, and checks the complete current witness. The root-signed stream vector
alone would not establish refusal-history completeness. Boundary-witness text is limited to 1 KiB.

The successor row is the consumption record. The preparation row remains immutable `prepared` history;
`resume`, exact `finish`/`begin` retries and post-consumption `cancel` report unsigned stage `admitted`.
They cannot undo admission. Repeating `admitPrepared` returns the identical artifact after its original
preparation deadline. A sibling preparation becomes stale and cannot consume the committed parent.

Only the original certified publisher/reader is resolved. Submission checks use the verified envelope's
mint epoch for its signature/refusal-parent relationship and current compatible eligibility for new
acceptance. Epoch-1 pending bytes, including an already-sealed refusal successor, remain exact. New
acceptances name epoch 2; old decision retries retain their original bytes. Both read transports use
the current head and return mixed historical proofs unchanged. Candidate read/write attempts refuse.

Chunk B alone did not install current authority in a browser. Chunk C2b below now owns adoption and
recovery; until chunk D, there is no private HTTP activation path.
Service tests use disposable SQLite databases and synthetic encrypted envelopes, not a browser/Yjs
convergence claim. A self-consistent rollback of all service state still needs a surviving client anchor
to detect it. Process SIGKILL evidence is not a claim about whole-machine power loss.


## 6. Client history foundation (chunk C1)

`account-protocol/admissionHistory.ts` derives an immutable, process-local history only after the pure
successor verifier authenticates its full first authority, inherited certification and retained anchor.
Copies or caller-fabricated history objects are refused. It binds exact first/current heads, unchanged
acceptance key, original creating publisher and the signed accepted-prefix boundary. It adds no wire
format or signature domain and confers no durable installation or dispatch capability.

A historical accepted head must name epoch 1 at or below the boundary; a new head must name epoch 2
above it, even if its envelope was sealed under epoch 1. At the exact boundary, the accepted link must
match the successor. Both still pass the existing signature/subject/link verifier. A current epoch-1
context cannot accept future epoch-2 evidence. Old permanent refusals can occur beyond the accepted
boundary and remain refusals; the accepted-position vector cannot classify their issue time.

The incremental prefix verifier consumes each epoch-1 envelope in order through the boundary and
checks its creator signature, ciphertext digest, route and acceptance link. Missing, duplicate,
reordered or changed history fails; zero position requires the zero link. It retains constant running
state and at most one codec-bounded envelope, captures input before awaiting and invalidates itself
on failure or overlapping operations. It does not decrypt or establish source/content coverage.
The future custody owner must establish that coverage and commit authority before dispatch.

[Focused evidence](../account-conformance-runs/2026-09-16-successor-history/README.md). Existing live v9
owners are unchanged at this checkpoint; their ledger adapters and native installation remain open.


## 7. Mixed-epoch replay adapters (chunk C2a)

A `CaptureRoute` may carry the immutable process-local `AdmissionHistory` returned by C1. It is never
serialized into a source capsule or accepted from stored data. Without it, the existing exact-epoch
readers remain strict. With it, old/current routes must retain the original workspace, credential,
principal and generation. Capsules keep their original epoch and bytes. New allocation groups do
not combine different capture epochs; a still-unsealed old capture can be sealed under epoch 2.
An interrupted old allocation can consume a new epoch-2 invocation; positions/attempts never reset.

Spool records retain their actual epoch and verify each envelope against that route plus its exact
original source bytes. Delivery records retain the epoch/head under which the owner recorded them;
this must be an exact known first/current context. Submission mint epoch and proof issuance are
resolved separately. A new current-context record may contain an unchanged old envelope or proof.
No ancestor-epoch permission is inferred without the verified admission-only history.

Stored inbound pages replay using their exact signed request head/epoch; current pages can contain
historical acceptance proofs. The receiver binds the creating publisher/reader keys and principal
to the verified history, checks issuance against the boundary, and preserves decryption, actor,
prefix, signature and content-coverage checks. A historical page cannot claim availability beyond
the old accepted boundary; a current page cannot claim less than that boundary. Once a retained
ledger event uses epoch 2, later events cannot regress to an old context. Old journal source capsules
are not ledger authority events and may still flush after adoption.

At the C2a checkpoint these were opt-in adapters without a live owner. C2b below binds
the exact existing ledger boundary, persists its new authority, invalidates old asynchronous contexts
and establishes source coverage before dispatch. [Evidence](../account-conformance-runs/2026-09-16-successor-replay/README.md).

## 8. Lifecycle-owned installation (chunk C2b)

The private composed v9 owner now exposes bounded `adoptSuccessor`. It captures the artifact before
queueing, rereads the authenticated promotion under its exclusive lifetime, and verifies ancestry
against the actually held head. Before writing, it checks the complete signed accepted prefix against
retained spool envelopes, decrypts and checks their original sources, and replays delivery/inbound
coverage in the proposed context. Missing history refuses adoption; it does not close an otherwise
valid editor or erase its pending writing. A different child cannot replace an installed child.

A v9 promotion may have the closed optional field `successor: {artifact, before: {events, hash}}`.
`artifact` is the complete parsed successor; `before` is the complete local spool/delivery/inbound
witness immediately before installation. Append this parsed object to the existing ordered promotion
MAC tuple **only when present**. Existing promotion payloads, original genesis/receipt/certification,
slot binding, custody, content and invocation counters are unchanged. Other promotion versions refuse
the field; old closed v9 parsers refuse it too. Removing the field without its MAC fails authentication.
No new domain is introduced. Compact retained encoding preserves the original genesis reference.

Installation uses the existing strict IndexedDB marker transaction, comparing the original marker,
claim and custody record. Only after that commit does the owner switch the capture route/current
request context, invalidate outstanding reads and clear verification caches. A failed precommit write
retains epoch 1; a successful commit followed by a failed publication/readback closes for cold replay.
The durable artifact and local witness cut are checked again on reopen before an editing owner escapes.
Ledger events before the cut must use epoch 1 and hash to the saved witness; events afterward use epoch 2.
Old journal source capsules may still flush afterward because they are sources, not authority events.
The full signed accepted prefix is rechecked; cache reuse is bound to its exact input bytes and head.

New captures, envelope seals and read requests use epoch 2. Already-sealed submissions keep their exact
bytes and positions. A late epoch-1 acceptance reply is verified against historical issuance and may
be persisted as evidence under the current context. A receive reply for the superseded owned request
is discarded as transient, and polling resumes under the new head. Current authority never comes from
an unsigned transport response. The owner retains the same lifecycle permit throughout adoption.

[Native evidence](../account-conformance-runs/2026-09-16-successor-owner/README.md) includes interrupted
installation, pending journal edits, old submissions, lost acceptance, late receive, compaction and
cold reopen. Effective prefix/cut omission controls establish why both checks matter. This is private
client installation; consumption/discovery HTTP and automatic reconnect discovery are chunk D.
Complete-profile rollback still requires a surviving newer client anchor to detect it.

## 9. Private service HTTP integration (chunk D1)

The private adapter exposes JSON POST `/account/enrollment/admit` and `/account/authority/discover`.
Both inherit exact Host/Origin/content-type and private token gates and reject ingress over 4 KiB
before JSON parsing. Admission consumes the existing exact retry-key/attempt/receipt capability;
receipts or operator tokens alone cannot consume it. Exact committed retries return the same artifact.

Discovery requires the certified creator's signed request from either the original or installed head.
It verifies the original authority, optional child, complete retained delivery census and request scope
before issuing the existing root-signed response. It then compares a fresh complete snapshot, rechecks
request expiry and acceptance custody, and returns without changing account state. At most four changed
snapshots are retried. Unavailable, ineligible, damaged or expired state yields a finite unsigned refusal;
it cannot be used by the client as replacement authority. No new signed message or key domain is added.

Candidate discovery/read/publication remain refused, and no content-key endpoint is introduced.
The client must still own its request, verify the signed response and install under C2b before current
dispatch. That reconnect integration is D2. [Evidence](../account-conformance-runs/2026-09-16-successor-discovery/README.md).

## 10. Owned reconnect discovery (chunk D2)

The private composed v9 owner's receive lane now performs discovery before its current read when due.
While still at epoch 1, successful unchanged discovery uses a five-second monotonic cadence; reconnect
invalidates that deadline. Concurrent refresh requests share one in-flight operation. The automatic
scheduler serializes discovery with send/read, retains offline/storage gates and uses existing retry
backoff for an unavailable reply. Once the one supported child is installed, this discovery stops.

The creator signs a fresh 32-byte nonce and 30-second wall-clock deadline inside its storage lifetime.
The bounded JSON adapter posts only to the pinned discovery endpoint, omits credentials/caches,
forbids redirects and limits declared/streamed replies to 32 KiB before strict UTF-8/JSON parsing.
Close aborts transport and drains cancellation. The owner verifies response root signature, complete
request hash, held anchor and full successor under the original first authority. It rechecks expiry
inside the native marker comparison transaction as well as after asynchronous verification. The
successor signature itself remains historical evidence; this deadline is for the online locator.

Only C2b installation may change current authority. Invalid/unavailable/expired replies leave pending
writing and the old durable state intact. Successful adoption expedites both sync lanes. A delayed
signed empty reply cannot erase a newer locally installed head; it supplies no replacement authority.
No custody key, ciphertext or certified-recipient status is returned to the admitted candidate.

[Focused end-to-end evidence](../account-conformance-runs/2026-09-16-successor-reconnect/README.md).
The defined admission-only phase is complete. The next gate is the committed-nonce/code-comparison
ceremony, followed by durable delivery/certification, new-device custody and encrypted bootstrap.
Full cryptographic qualification and production deployment remain separate work.

## 2026-10-16 — Authenticated checkpoint-stage amendment

The v9-only structural restriction described in C2b above was superseded by the
checkpoint transition implemented in `684f4f067e80a1be63c5e9842a569f1830e461a9`.
The closed promotion parser permits the successor field on v6, v7, v8 and v9.
Versions one through five still refuse it. Structural parsing grants no authority:
the ordered promotion MAC authenticates the version, stage and successor/catchup
fields, and the normal lifecycle verifies original authority, certification, retained
coverage and the checkpoint before allowing writing. No new crypto domain is introduced.

A genuine schema-five local-only Account can therefore upgrade, create a certified
checkpoint, commit v6 `account-capturing`, cold-unlock and resume v9 `account-receiving`.
The functional repair regressions exercise that producer with original pinned source
and unchanged credentials; unsigned rewrites to v6/v7/v8 and field removal each refuse
cold reopening without storage changes. They do not establish general release qualification.
