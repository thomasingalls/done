# Mandatory-factor custody — implementation phase two

**Status:** component implemented, 2026-09-08. [custody.ts](../src/crdt/custody.ts) attaches scoped
factor custody to the [write-session lifecycle](./write-session.md). The
[recorded execution](./storage-conformance-runs/2026-09-08-custody.md) exercises the production component
in Chromium. This checkpoint is not application onboarding or complete encrypted-store genesis.

## Entry points and ownership

`beginCustodyEnrollment(authority, options)` generates the selected 125-bit device-lock code: 25
independent random bytes masked into Crockford Base32, displayed in five groups of five. `confirm(code)`
normalizes and matches the transcription before any persistent custody write. There is no fresh-creation
API that accepts a user-chosen code. The ceremony is consumed before its first await; its redisplay
reference and comparison bytes are removed. `cancel()` also aborts an in-flight confirmation. An
interrupted durable creation resumes with the code the user saved; this module cannot redisplay it.
The eventual UI must explain factor loss and storage outside the copied-profile domain, and keep the
code out of persisted application state, diagnostics and telemetry.

The authority supplies `slotId`, `workspaceId`, and `resolvePrincipal(task)`. The resolver executes
**after acquiring the slot permit on every operation**. Its principal comes from verified Local identity
or an Account binding; there is no independent principal argument to override it. Verification itself
belongs to the startup/identity owner. The existing Account verifier and slot index have not been wired
to this component, and this component does not invent a service binding for Local workspaces.

Fresh creation and `resumeCustodyCreation` require `checkCreation(task, scope, intent, mode)`. The startup
owner must inspect every relevant identity/index/content/journal/clear/creation carrier under the held
exclusive permit, and throw unless they are absent for this identity or match this authenticated creation
intent. This callback has no permissive default. The browser fixture supplies a synthetic authority and
other-carrier check; the complete SC-06 census is still owed by owned startup. A missing custody entry
alone never licenses reminting through ordinary open.

`openCustodySession(authority, code)` acquires the shared lifetime permit, resolves current identity,
reads current custody, opens the factor seal, authenticates metadata, and opens every retained key.
It returns a new capability only after all of that succeeds. The public descriptor contains identities
and public keys. Roots, generation keys, store keys and private credentials never leave this owner.

`session.run(task => task.openRecord(record))` supplies a guarded, authenticated read of the selected
v1 record format for this store instance and generation 1. This is a useful handoff to the next phase's
load path, not a content database, admission receipt or replay-completeness guarantee. No encryption,
signing, receiver-wrap acceptance, rotation or export-of-private-key API is exposed. Those operations
need their respective allocation and authorization owners before they can be added safely.

## Persistence and interrupted creation

`done.custody`, version 1, contains an `entries` store keyed by the exact array
`[slotId, principalId, workspaceId]`. Each entry's payload is v2. Custody's store-instance identity,
root identity, generation envelope and credential identities are installed in this same database.
This is separate from the existing `done.slots` database; future multi-database startup must keep its
own durable genesis intent until identity, routing and content initialization have completed.

Under exclusive slot ownership, creation:

1. Checks the other carriers, generates a random root and immutable creation identity set, then commits
   a code-sealed root, authenticated `creating` intent and zero reservations.
2. Commits a reservation of three root AES-GCM invocations. Completion, not request success, is the
   boundary. The next batch refuses if its reservation would reach `2^32`.
3. Seals a new generation-1 key and fresh X25519 wrapping/Ed25519 signing credentials. All three
   encryptions use the counted root. It verifies that the results reopen and that private/public
   credentials correspond before committing them together with state `protected` and no custody intent.

The `protected` entry establishes completed **custody**. It is not a workspace-ready, saved-edit or
product protection-status receipt. Startup must additionally complete its cross-carrier genesis intent
before admitting persistent edits or reporting the whole workspace protected. The production app still
uses its earlier persistence path at this checkpoint.

A crash after reservation leaves the same root, store identity and creation/credential identities.
Resumption authenticates them, repeats the other-carrier check and reserves another three invocations;
it never subtracts abandoned invocations or infers the count from envelopes. Private key material that
never committed may be regenerated: no API exposed it or published its public key before completion.
A crash after completed custody can reopen with the saved factor even if the initiating call never
returned. Other creators report existing locked custody and cannot enroll their code over the winner.

Normal open refuses creating, missing, malformed, unsupported, partial and legacy/migrating custody.
All records remain present on refusal. A bad factor-seal tag cannot distinguish a wrong code from a
damaged seal; that outcome is `unlock-failed`, with no empty-store fallback. Metadata or retained-key
authentication failures after opening the root are `repair-required`. Migration is an explicit later
operation; v1 entries are never assigned an inferred zero reservation count.

## v2 local encodings

The selected **v1 LockSeal and v1 generation KeyEnvelope bytes remain unchanged**, covered against
the published vectors. A code seal uses the selected HKDF-SHA256 scope/factor derivation and AES-GCM
AAD. The code is the only enrolled factor supported by this checkpoint; extra/unknown representations
refuse until the corresponding versioned support is implemented. PRF ceremonies remain separate work.

Two concrete encodings complete v2 local custody. They use existing suite primitives and do not change
record, journal, factor-seal or network encodings:

- **Credential seal:** `{v: 2, nonce: bytes[12], ct: bytes[48]}`. AES-256-GCM under `L_lock`, over the
  32-byte X25519 scalar or Ed25519 seed, with AAD
  `LP("done/custody-credential/v2") || LP(principalId) || LP(workspaceId) || LP(role) || LP(id) || LP(hex publicKey)`.
  The fixed v2 label binds the carrier version; `role` is exactly `wrapping` or `signing`. Unlike the
  historical code-sealed wrapping-credential fixture, this carrier opens through the random root, so
  adding a future root factor need not reseal private credentials. A custody root is never labelled a
  WebAuthn PRF output. Runtime imports use fixed RFC 8410 PKCS#8 prefixes and are non-extractable.
- **Metadata MAC:** HMAC-SHA256 under a distinct 256-bit key derived with HKDF-SHA256, empty salt and
  info `LP("done/custody-metadata/v2") || LP(slotId) || LP(principalId) || LP(workspaceId) || LP(rootId)`.
  The payload is UTF-8 JSON of the closed ordered tuple in
  [`recordPayload`](../src/crdt/custodyRecord.ts), including version/state, identities, every sealed byte,
  reservation count, rotation flag, intent and credential public keys. It excludes only its own MAC.
  Unknown fields and invalid shapes refuse; object-property order is not authenticated accidentally.

The MAC prevents editing a reservation or creation identity while retaining the current seals. It does
not prevent replay of an older authentic record or detect profile cloning. SC-09's unrewound, unbranched
history remains necessary. The immutable read-and-compare transaction rejects record changes before a
reservation or completion write; it never overwrites an independently changed entry.

## Lifetime and limits

Every native crypto invocation inside a helper checks its owning task, including calls following another
crypto await. The outer tracked operation retains the permit until the helper settles. Closing invalidates
immediately, drains work, clears key references and closes owned database connections before release.
Raw temporary root/generation/private-key arrays are overwritten where owned; this is logical disposal,
not a claim of JavaScript-engine or OS memory zeroization. The public capability cannot bypass close or
reuse a completed task. Plaintext deliberately returned by a successful read belongs to the future
document owner, which must dispose of its own state on sign-out.

This component has one generation and two locally generated, sealed operational credentials. It neither
certifies/publishes them nor accepts future keys. Legacy conversion, PRF enrollment/factor replacement,
retained generations, slot-index integration, encrypted content writes, journal/admission and full startup
remain subsequent work. No ordinary disable-lock or remember-unlocked persistence is offered.

## Running and interpreting evidence

Run `pnpm storage:custody` or `node scripts/custody/run.mjs`; it is included in `pnpm check`. Chromium and
project dependencies must already be installed. The runner uses loopback port 5176, rejects an existing
listener and external browser requests, freezes source copies, and writes a fresh ignored
`test-results/custody/` directory. `--output`, `--case` and `--no-mutants` mirror the lifecycle runner.

The suite executes 13 browser cases and five isolated mutations. It includes real renderer death,
request-success/transaction-abort faults, concurrent creators, malformed carriers, counter tampering,
the seal ceiling and cancellation within crypto helpers. A mutant counts only when its baseline passes
and its named assertion fails; unrelated errors remain harness failures. Unit tests independently check
published factor/envelope bytes, field isolation, code normalization/entropy mapping and metadata parsing.

The profile case closes and copies entire synthetic Chromium directories. With the factor outside the
profile, it attempts persisted 32-byte values and CryptoKey handles as root openers for known encrypted
content and a test ECDH future-receiver probe. A planted non-extractable promptless root opens both;
the external-factor control opens the ordinary copied content through the production session. This is
stronger than merely observing a prompt, but is still a bounded component probe: it does not implement
the real reader-wrap verifier or exhaust all possible attacks. Copies only decrypt; none becomes a
second writable history. `--use-mock-keychain`/`--password-store=basic` make this a same-host test setup,
not evidence for native keychain, other browsers, authenticators or the full supported platform population.
All broader C10–C15 obligations and release debts remain open.
