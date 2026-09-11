# Private authorization root and Local promotion preflight

This bounded slice follows signed `0f1a073` (recovery sealing/confirmation). It establishes a private
service root owner, verification against an independently supplied pin, and a **read-only** Local
promotion preflight. It does not issue an epoch, slot binding, account activation or recipient grant.
The proposed promotion writes are specified below and belong to the next owner phase. No personal
service or browser is provisioned by this work; the personal preview and legacy relay remain stopped.

## Service root ownership and bootstrap trust

`PrivateAuthority.initialize(path, policy, operatorKey)` explicitly creates a new owned regular file
with mode 0600 using exclusive creation. Existing files, including interrupted empty files, refuse
initialization. It generates one Ed25519 authorization key and a random 16-byte service ID. SQLite
WAL/FULL commits the one encrypted root record and authority schema version 1 together. The public pin
is returned only after commit. Failure before commit leaves an unusable initialization artifact;
failure after commit is recoverable using `recoverPin(path, operatorKey)`. Neither case silently rekeys.

The **operator wrapping key** is a caller-supplied, independently generated random 32-byte secret. It is
not a device-lock code, account passkey, recovery code or user-content key. The operator must supply it
from outside this database and own the private parent directory. This library does not write or log it.
No live operator key, database, deployment configuration or secret-management system is created here.

The clear descriptor is `AuthorityPin = {v:1, serviceId, origin, rpId, authRoot}`. `authRoot` is the raw
32-byte Ed25519 public key. Origin/RP are exact HTTPS origin and matching hostname; HTTP localhost is
allowed for disposable tests. Binary descriptor/envelope fields are canonical lowercase hex. The
private seed is encrypted as:

```
K_seal = HKDF-SHA256(operatorKey[32], fresh salt[16],
         LP("done/service-authority-seal/v1") || LP(serviceId) || LP(origin)
         || LP(rpId) || LP(hex authRoot), 32 bytes)
AAD = LP("done/service-authority-pin/v1") || LP("1") || LP(serviceId)
      || LP(origin) || LP(rpId) || LP(hex authRoot)
ct = AES-256-GCM(K_seal, fresh nonce[12], seed[32], AAD), including tag[16]
```

`open(path, expectedPin, operatorKey)` is a cold, read-only open. It verifies file ownership/permissions,
known schema and one root, exact pin, AEAD and private/public correspondence. Missing, wrong-factor,
tampered, substituted or unknown-version state refuses without creating a replacement. `close()`
releases the signing handle; owned raw byte buffers are overwritten in finally blocks. Runtime/crypto
engine copies cannot be promised physical erasure. File-race resistance assumes an operator-controlled
parent directory; this is not a hostile-filesystem or concurrent-administrator protocol.

A cold operator can recover the public pin from a committed initialization only by authenticating its
seal with the operator key. The **application's expected pin must then come from trusted operator/build
configuration independently of the runtime response**. `recoverPin` is not an HTTP trust-discovery API.
Reading a key out of an unverified slot binding, response, profile row or default trust-on-first-use
cache does not establish this pin. Before personal enrollment, a guided provisioning step must distribute
this public descriptor through the trusted application configuration; no actual pin is selected yet.

The owner exposes only the fixed bootstrap proof, not a general byte-signing function:

```
Bootstrap = LP("done/service-authority-bootstrap/v1") || LP("1") || LP(serviceId)
            || LP(origin) || LP(rpId) || LP(hex authRoot) || LP(hex clientNonce[32])
Proof = {v:1, pin, nonce, signature: Ed25519(K_auth, Bootstrap)}
```

The client copies/validates its independent expected pin, requires an exact matching descriptor and
requested nonce, and verifies using **that expected key**. Each preflight generates a fresh nonce;
this proves possession at this request boundary, not the current authorization epoch or account state.
There is no freshness clock or server consumption ledger for this public liveness proof. Reusing a
caller nonce would permit replay of its old response; ordinary preflight never reuses one.

The private loopback adapter optionally takes an explicitly provisioned authority factory and checks
its origin/RP against the account service. `/account/authority/prove` accepts only `{nonce}` through the
existing exact Host/Origin/token/size gate; without an owner it is unavailable. Closing the adapter
closes its transferred authority handle. Existing registration/recovery behavior and service schema 2
remain unchanged. The separate authority database receives no content or account private credential.
No epoch signing, key rotation, root replacement, signing-key export or activation endpoint is added.

## Verified Local preflight

`inspectLocalPromotion` takes the selected slot, its device code, a pending-account ID supplied by its
calling registration owner, the independently trusted pin and a proof transport. The account ID is
only a proposal namespace here: this API does **not** authenticate or activate that account. The later
service commit must resolve current account/credential/recovery eligibility itself.

Under the existing exclusive slot lifetime and application-upgrade interlock it:

1. Reads and factor-authenticates a ready Local claim, including imported-claim provenance when present.
2. Verifies live custody, content witness/counter and the one active Local route. An Account binding,
   unknown scoped carrier, incomplete genesis, clear/import intent or incompatible upgrade refuses.
3. Refuses any retained `heads` or `outbound` rows; the genesis shortcut cannot reinterpret admitted state.
4. Cold-opens and authenticates content plus the synchronous encrypted journal, replays both into a new
   private Y.Doc and refuses pending dependencies. No key, plaintext snapshot or document escapes.
5. Only after those local checks, requests and verifies the pinned authority's fresh-nonce proof.
6. Rereads/authenticates the Local identity and route after the network wait, and returns detached source
   identity and context observations. Cancellation holds exclusion until outstanding work settles.

The source identity includes slot, principal, workspace, store, custody-root and genesis-intent IDs plus
current generation. Proposed `lineageId` is deterministic across retries for that same source/account:

```
SHA256(LP("done/promotion-lineage/v1") || LP(serviceId) || LP(hex authRoot) || LP(accountId)
       || LP(slotId) || LP(principalId) || LP(workspaceId) || LP(storeId)
       || LP(rootId) || LP(genesisIntentId))
```

The returned recovery context uses that lineage, the existing principal/workspace and pinned root, and
can be supplied to the recovery-sealing component. Nothing is reserved at the service, frozen for later
snapshot coverage or written to a local carrier. Later edits do not change this proposed identity, but
the promotion owner must reread/replay all then-current content at its own commit boundary. This result
is not a capability to skip that work. Local admission remains exclusively owned by the existing runtime.
Cooperating writers/clears are excluded; arbitrary same-origin scripts and profile rollback remain outside
the writer-lock guarantee. No new opener reference or persisted client format is introduced in this slice.

## Promotion writes: the next bounded owner

**First bounded write phase: durable promotion intent and prepared device custody.** Build this before
activation, epoch issuance or index switching. The following plan fixes the ownership boundaries; its
exact versioned MAC/signature schemas and conformance cases must accompany that implementation.

- Obtain slot exclusion and revalidate the source and trusted pin. Resolve the registration/recovery
  result against current service state; a historical receipt alone grants no current authority. Require
  the exact account, draft digest, recovery-state digest, principal/workspace/lineage/root and generation.
- Before adding any carrier that older code cannot classify, retain the existing application-upgrade
  interlock. The new migration-aware owner must authenticate its intent before proceeding; the old
  reader must keep refusing it. A raw `ready` flag cannot be taught to authorize promotion or rollback.
- Retain a factor-authenticated immutable intent binding the original Local claim, existing scope,
  store/root IDs, generation and service/pending-recovery context. Preserve the existing `K_g` and
  reservation counters. A stale or missing completed counter never becomes permission to recreate it.
- Generate fresh device signing/wrapping credentials once and seal them under mandatory device custody,
  with durable nonce/seal-budget reservation. Do not overwrite the Local credentials or immutable
  genesis claim while preparation can still fail. Retries resolve the winning prepared credentials.
- Inventory every new key/metadata carrier and its opener references for cancellation, clear and
  restart. Keep the imported Local selection/source-cleanup provenance authenticated. A service root
  is not a client custody root, and a recovery envelope is not permission to deliver a generation key.

This phase's first durable result should still be **Local, with authenticated promotion preparation**.
A crash before its commit leaves existing Local intact; after commit it resumes the exact prepared
identity/keys. Abandonment is explicit and cannot reset counters or erase accepted work. It must also
own the preceding recovery ceremony's terminal/unsaved-code cleanup before any ordinary account UI.

**Following phase: genesis, service admission and index handoff.** Reacquire exclusion and cold-replay the
then-current database plus journal. Produce the authenticated genesis checkpoint, preserving the
never-admitted workspace's pre-account human/system attribution under the new credential (TRD §13.6),
and wrap all required generation keys to the exact device and confirmed recovery recipient. The server
receives only public keys, sealed/wrapped material, ciphertext and signed evidence. S0-2 recipient
approval and S0-5 checkpoint semantics are separate checks; a signed hash is not semantic replay proof.

The first service commit must atomically bind current account/recovery eligibility, certified recipients,
first authorization head, acceptance key, exact checkpoint/wrap bytes and one idempotent promotion result.
It needs a fixed-purpose account assertion and client credential proof; this root owner must not become
a generic signing oracle. Service/database restart and lost replies must resolve exactly that result.

Only after verifying and retaining the complete signed result may the local owner atomically switch the
existing slot's index from Local classification to its verified Account binding, retaining the same
principal, workspace, content database and generation. No duplicate Local workspace or copied profile
is created. The custody/genesis/upgrade records must make interruption classify as prepared Local or
completed Account; raw index replacement is insufficient. Missing completed authority/custody is repair,
never silent Local genesis. Old clients must remain excluded from the new persisted format.

The first slot binding must be verified with the existing offline slot verifier and the independently
pinned authorization chain before reopening Account state. Broader account UI, full recovery, encrypted
relay, ciphertext storage, device enrollment and second-device adoption follow these owners. The actual
second pre-encryption device will adopt this workspace with fresh custody/store/counters/credentials,
without importing or merging its old writing.

## Evidence and limits

`pnpm account:authority` runs independent proof reconstruction, malformed/substituted roots, wrong
factors, competing setup, actual process deaths, generated histories and deliberate acceptance controls.
Native Chromium exercises real Local custody, journal, replay, upgrade/slot lifetime and the proof route.
It uses a disposable app test page permitting the existing journal WASM; the inert account API adapter
keeps its original restrictive CSP. No personal browser profile, origin data or server is used.

The bounded result does not certify filesystem power loss, malicious restore/rollback, a hostile
administrator, production secret distribution, service-key rotation, the full device matrix or complete
promotion. It adds no dependency, changes no ordinary app path and pays no whole-protocol debt.

## Current first-activation assertion

The later [first-activation contract](./account-activation.md) binds a fresh service-verified passkey
assertion to the exact retained completion. The service signs the fixed-purpose challenge and receipt v2;
challenge consumption and activation share one FULL-synchronous account transaction. These operations
extend this earlier read/preparation phase; they do not add generic signing authority or real provisioning.
