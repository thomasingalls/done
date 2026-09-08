# Verified fresh Local genesis and scoped indexing

This bounded phase creates the **first Local workspace in a fresh slot**, without an Account binding.
It composes mandatory generated-code custody, the content carrier, the slot writer lifetime and owned
startup. The default application remains unchanged. Adding workspaces to an existing slot, Account
onboarding, promotion, migration/import, clear, retirement and real-data cutover remain later work.

## API and authority

`beginLocalGenesis(slotId)` returns a transient generated-code ceremony. It performs no storage work
before exact normalized confirmation. Explain that losing the last Local factor without a readable
replica/archive can be final loss; the host must keep this code outside application persistence.
Confirmation consumes the ceremony and acquires exclusive slot ownership. Principal and workspace IDs
are generated there, after a fresh scoped census; callers cannot supply them or an Account binding.
The receipt describes completed persistent genesis and exposes no key, editor, transport or writable doc.

`resumeLocalGenesis(slotId, code)` is an explicit action. It rereads the winning claim under exclusion,
authenticates the factor and progress, checks all retained stages, then completes only matching unfinished
work. `inspectLocalStartup` is read-only presentation, with no authentication claim. `openLocalWorkspace`
discovers the scope, then rereads/verifies it inside the actual shared writer lifetime before the existing
owned startup, replay and admitted initialization barrier. A picker calls `listLocalWorkspaces` with the
factor; it receives detached routes for that slot only. No production path enumerates database names.

## Durable plan

`done.custody/entries` holds `[slotId, "local-genesis-v1"]` and the ordinary scoped custody entry in
**one transaction using add**. The claim retains the signed initial `creating` custody record, including
its factor-sealed root, scope, store/root IDs and wrapping/signing credential IDs. This record is an
authentication anchor; it is never copied back over missing live custody or used to reset reservations.
The first content intent is the signed custody creation intent ID. The database name is derived from
the bound principal/workspace; expected content stores and generation remain the v1 carrier construction.

Claim progress is `custody` → `content` → `ready`. Its MAC uses HMAC-SHA-256 with the existing HKDF helper:
empty salt; info `fields("done/local-genesis-metadata/v1", slot, principal, workspace, rootId)`;
payload `fields("done/local-genesis-progress/v1", hex(initial.mac), stage)`. The initial record's own MAC
authenticates the entire immutable identity set. The factor-opened root authenticates both records; raw
root/factor byte buffers are erased in finally blocks. The added metadata construction needs independent
review; tests of its bindings do not substitute for that review.

The owner completes custody, commits `content` progress, initializes/authenticates the content witness
and virgin counter, commits `ready` progress, then adds the scoped index row. All stages share one
exclusive lifetime. Native transaction completion, rather than request success, advances the owner.
Interruption before the atomic claim leaves neither identity nor custody. Later interruption retains
the winning intent. After `ready`, missing content/witness/counter refuses even if the index also vanished.
Missing live custody always refuses. Unknown scoped rows, active legacy material, mismatched names,
conflicting counters, used content without its index, and an existing closed/different row also refuse.

The final index row has the existing v1 fields plus `local: { principalId, workspaceId, intentId }`.
It carries no fabricated service binding. Installation uses `add`; an existing row is never replaced.
The immutable claim remains as the Local identity verifier after completion. It is a required opener
reference for the future clear/retirement census, even though its sealed root duplicates existing bytes.

## Index ownership and limits

Earlier Account/legacy index methods now take scoped shared read or exclusive write permits, reread
after grant, and await transaction completion for slot effects. Creation uses add. They refuse Local
claims/rows, including a claim whose final index does not yet exist; they cannot reset, bind, close or
delete those slots. Their administrative plaintext reset is not an encrypted ClearIntent implementation.
Local close/reopen/delete and additional-workspace registration are intentionally absent from this API.
The default app and its earlier plaintext provider are not participants in the new protocol yet.

Locks protect cooperating callers, not arbitrary origin scripts. Scope discovery uses known names and
the custody prefix for the requested slot; it cannot rediscover orphan databases after destruction of
every naming/identity anchor. Raw profile clone/rollback remains outside supported writable recovery.
JavaScript code strings cannot be reliably zeroized. This phase adds no power-loss, forensic erasure,
supported-browser population, PRF, Account receive-authority or interaction-performance claim.

## Reproduction

`node scripts/local-genesis/run.mjs` freezes production sources and records input hashes. Set
`CHROMIUM_PATH` when using a non-default Chromium installation. Cases include two creators with different
factors, native abort after request success, cancellation during crypto, renderer death after each of
nine durable boundaries, offline acknowledged-edit recovery, damaged progress, missing completed state,
closed/independent slots and legacy index interference. Four deliberate regressions must be detected.
`test/localGenesis.test.ts` adds real-crypto/fake-IDB binding and refusal checks; its mock locks establish
unit wiring only. The startup and custody/content browser suites remain relevant regression evidence.
