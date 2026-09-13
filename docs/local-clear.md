# Journal-inclusive scoped Local clear

This checkpoint implements explicit deletion of the **first completed Local workspace in its Local slot**.
It does not implement Account removal/revocation, all-slot handoff, shared or multiple-workspace custody,
partial-genesis cleanup, migration/import, or default application cutover. The existing product deletion
decision remains the host's responsibility: prepare a target, explain its loss, and invoke clear only for
an explicit Local deletion request. No application UI or actual user-data deletion is part of this phase.

## API and ownership

`prepareLocalClear(slotId, code)` verifies Local genesis and returns a detached immutable target, including
the full scope, store/root IDs, genesis intent and recorded database name. It writes nothing. The host closes
its initiating workspace before `clearLocalWorkspace(target, code, options)`; there is no shared-to-exclusive
lock upgrade. Clear waits for all cooperating writers in the slot, rereads current state after exclusive
grant, and refuses a stale target, unknown references or an inconsistent Local route. An independently
valid slot remains usable. Initial authorization requires completed, active Local genesis metadata; it
does not construct an editor or decrypt content. Explicit deletion can remove damaged ciphertext or opaque
journal values within that verified namespace. Unsupported metadata/layout still refuses.

`resumeLocalClear(slotId, code, options)` rereads and authenticates the persisted intent under a fresh
exclusive permit. No earlier census is authority. Once an intent commits there is no rollback/cancel API;
cancellation stops further application effects and leaves authorized cleanup resumable. A completed call
returns `{ kind: "cleared", target }` only after a final absence census. Errors leave their durable stage.

`options.onProgress` reports the current stage and whether native content deletion is blocked. Observers
cannot alter protocol progress. A blocked `deleteDatabase` request is **still pending**, not failed or
successful. It cannot be cancelled; the owner retains its permit until the native request actually settles,
even after caller cancellation. Closing the blocking connection can therefore complete deletion after
cancellation. Journal, openers and index remain retained until a subsequent successful stage permits them
to be removed. No timeout, lease expiry or lock stealing makes a pending native request safe to abandon.

## Persistent state and order

`done.custody/entries` holds `[slotId, "local-clear-v1"]`. It contains v1 kind `local-clear`, a random
128-bit intent ID, the exact target, a random 128-bit salt, stage and MAC. The target cannot name arbitrary
databases: the owner rederives and checks its bound Local name and matches the selected index/claim.
The version fixes the carrier plan: one encrypted content database (including heads/outbound), its exact
journal namespace, scoped custody/content witness/genesis claim, and one Local slot index row. There is
no persistent derived search index in this implementation. Unknown scoped controls refuse cleanup.

| Stage | Allowed effect before advancement | Required retention |
| --- | --- | --- |
| `content` | Delete the bound content database; await native success | Journal, live custody, content witness, genesis factor seal and index |
| `journal` | Remove exact observed key/value pairs in that journal namespace; verify absence | Every opener and index |
| `custody` | Atomically remove scoped custody, witness and genesis claim **with** advancement to `index` | Index and clear record |
| `index` | Remove the matching index row; then commit `cleared` | Clear record remains throughout the cross-database gap |
| `cleared` | No deletion; verify no target residue before returning success | Only terminal non-content metadata |

Progress writes compare the exact scoped control snapshot in the mutating transaction. Index deletion
compares the exact row; undefined-valued or changed rows refuse. Journal deletion compares each observed
key/value, checks actual removal, and confirms namespace absence. A failed later removal retains the
remaining suffix and all openers. The key-removal stage commits with its progress in one database, so
an abort retains both the old stage and all keys. A crash after index deletion but before terminal progress
is recoverable with the external factor even though the content openers are gone. Later phases refuse
reappearing content, journal, custody or index rather than sweep newly observed state.

Every participating low-level custody opener/enroller, Local claim reader, retained startup classifier and
legacy index writer checks the fixed clear record after its permit is granted. Structural observation gives
`clearing` or `cleared` and blocks normal use; malformed records require repair. It is not cleanup authority.
The terminal marker also prevents automatic genesis in the cleared slot. Explicit creation of a new
identity is a later action; a caller cannot erase this marker to make the ordinary creator run.

## Authentication after key removal

Progress authentication deliberately uses **no content opener**. Normalize the confirmed generated code;
derive a non-extractable HMAC-SHA-256 key using HKDF-SHA-256, the record salt and
`fields("done/local-clear-authentication/v1", slotId, intentId)`. The MAC payload is
`fields("done/local-clear-progress/v1", intentId, slotId, principalId, workspaceId, storeId, rootId,
genesisIntentId, dbName, hex(salt), stage)`. Initial intent installation additionally requires the existing
factor-authenticated Local genesis claim and matching carrier census. The clear MAC alone never authorizes
initial deletion of an unclaimed target. Resumption verifies it before any destructive action.

Only metadata, salt and MAC survive terminal completion: no root seal, generation envelope, private
credential, journal key, code copy or persisted progress key. Raw factor bytes are erased and the transient
CryptoKey reference is dropped before releasing the owner. JavaScript code strings cannot be reliably
zeroized. This construction adds a verifier for the existing high-entropy generated factor, not support
for chosen passwords. Its domain/payload and post-key-removal behavior need independent review; tests
do not establish cryptographic soundness or forensic erasure.

The preparation also corrects legacy journal classification: the old `done` prefix includes the prefixes
of modern `done.<hash>` namespaces. Full modern key framing (database hash, store ID, writer ID, ordinal)
is excluded from the legacy-only census; ambiguous or legacy-shaped keys still refuse fresh creation.
This changes classification only, without renaming journals or deleting unrelated entries.

## Evidence and boundaries

`node scripts/local-clear/run.mjs` runs the actual production genesis, encrypted content/journal and clear
owners in disposable Chromium contexts under the shared release runner. The owner pins the installed
Playwright Chromium; `CHROMIUM_PATH` overrides refuse. The fixture
holds real native deletion open with a blocking connection, freezes a live writer, aborts native transactions
after request success, injects deletion/removal refusals, and kills renderers at seven durable boundaries.
Each schedule checks retained or removed scoped carriers. Inventory digests keep reports compact while
the frozen source and harness hashes identify the executed assertions. Mutation cases deliberately violate
blocked-request completion, cleanup ordering, opener cleanup, resumption authentication and key-access guards.

This evidence covers one Chromium/macOS host and explicit adapter fault points. It does not cover power
loss, raw clone/rollback, every browser/authenticator, old non-participating writers, Account authority,
unknown external packages/carriers, low-end performance or default UI acceptance. The origin's shared
metadata databases remain; other slots' records survive. Raw storage tampering can cause refusal. Clearing
the entire origin or deleting every naming/control anchor is outside this protocol's recovery claim.
