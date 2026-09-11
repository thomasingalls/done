# Private Account submission transport and readback

Current exact byte formats and their authority limits are pinned in the
[group C transport contract](./account-crypto/transport.md). This document retains its phase context.

This bounded phase composes the v8 lifecycle with the private loopback HTTP service. It does not
mount routes in the personal application, provision an Account, apply inbound content, or advance
the immutable first epoch. Existing v8 records and schema 4 are unchanged.

## Requests and authority

The private adapter retains its exact Host/Origin and operator Bearer-token gate. The token permits
use of a development service; it is not device membership or ciphertext-read authority. The owner
uses its authenticated, independently pinned origin, with redirects and ambient credentials disabled.

`POST /account/delivery/submit` uses `application/octet-stream` and canonical UTF-8 JSON
`["done/private-submit/v1",1,workspaceId,hex(exactPersistedSubmission)]`. The body is bounded to
`2 * SUBMISSION_LIMIT + 256` bytes. The service resolves membership and lineage from its retained
certification and receipt, verifies the existing wrapper and envelope, and executes the schema-4
owner's atomic decision. Status 200 carries only the original canonical position response (4096
bytes maximum). Every other status, malformed response or network failure is unknown. Only an
already persisted earliest pending submission can be sent; dispatch never allocates or seals.

`POST /account/delivery/read` has a canonical UTF-8 JSON array containing the read domain/version,
service ID, exact origin, workspace, credential, lineage, epoch head, epoch number, after-position,
count limit, nonce, expiry and device signature. Its maximum is 4096 bytes. The signature covers the
same fields (except signature), with its own domain. Workspace and credential are lookup selectors;
the verification key comes only from authenticated current retained membership. A receipt, head,
operator token or request-supplied key cannot authorize the read.

The nonce is 32 random bytes. Expiry is Unix milliseconds, strictly in the future and at most 60
seconds ahead at service verification and immediately before return. The browser requests 30 seconds.
A captured signed request can be replayed during that window, but only for that exact bounded page;
this is not a one-use challenge protocol. Each replay rechecks current membership. Requests are
read-only and add no durable server nonce state. Transport confidentiality depends on loopback for
this private adapter; any future remote adapter requires HTTPS and explicit deployment work.

## Pages and verification

An after-position of zero starts at the first accepted envelope. A limit is 1–8 entries. The response
is canonical UTF-8 JSON containing a page domain/version, SHA-256 of the exact signed request,
accepted-through position, next position, pairs of exact envelope/proof hex bytes, and an acceptance-key
signature over the unsigned page array. The body is at most 10 MiB; the service may return fewer than
the count limit to fit. An individual maximum-size envelope fits. Refused submissions are excluded.
Each page covers contiguous accepted positions after the cursor. Next is after plus returned count;
next below accepted-through means another page exists. A cursor past accepted-through is refused.
An empty page is permitted only at accepted-through. Each request takes a new snapshot, so append-only
advancement between pages is allowed. No global snapshot, pruning cursor or rollback guarantee is added.

The service reauthenticates the complete witnessed ledger, then compares membership and the complete
snapshot again in a synchronous transaction before signing the page. No await holds that transaction.
The page signature authenticates the nonce/request binding, extent, ciphertexts, proofs and empty/end
claims. The browser checks its own retained authority, signature, exact request binding, cursor/count
semantics, each envelope's member signature and each accepted head against locally reconstructed
predecessors. This one-device readback requires each envelope to equal its retained spool bytes and
refuses a service prefix behind already retained acceptance evidence. A head never supplies its own
baseline. Readback is detached ciphertext/proof inspection: it does not record acceptance, decrypt,
apply updates, advance a durable receive cursor or grant new minting authority.

## Lifetime and failure

Submit and readback run inside the same exclusive capture task queue. Transport streams have byte
bounds and a ten-second deadline. Close/abort invalidates authority, aborts fetch, drains the task and
releases custody only after settlement. Before dispatch and before any response persistence/return,
the owner rechecks retained promotion and custody. Failed or late results leave persisted submissions
available for exact retry. A service commit can survive a lost reply; a browser retry recovers that
original decision. The existing v8 response persistence supplies the witness and native commit barrier.
