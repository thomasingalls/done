# Account genesis checkpoint and persisted startup — D7

This home pins the current private implementation at generation 1 / epoch 1. It bridges the
[row-7 construction](../selections/row-7-checkpoint.md) to actual promotion and Account startup;
it does not implement row 7's future successor, fallback, rotation or checkpoint installation machine.
The signature/receipt encodings remain owned by [A](../account-first-authority.md), and generation
recipient wraps by [B](./recovery-layout.md). No valid format changes in this phase.

## 1. Exact checkpoint key and ciphertext bytes

`K_cp = HKDF-SHA256(K_g, salt=decodeHex(cp.salt), info=LP("done/checkpoint/v1") || LP(workspaceId), L=32)`.
The generation key is 32 bytes, salt is 16 bytes. Promotion's private `checkpointKey` derives a
non-extractable AES-256-GCM key with encrypt/decrypt usages; persisted startup repeats the same inputs
with decrypt-only usage. Both use `custodyCrypto.fields`. There is no principal, slot, store, root,
lineage or epoch in this KDF; those are not silently added here. Its workspace field is the held Local
claim's workspace at both production call sites, checked against the retained promotion context.

`AAD = LP("done/cp/v1") || LP("1") || LP(workspaceId) || LP(decimal generation) || LP(decimal proposedEpoch)`.
`checkpointAAD` is the shared protocol encoder. `LP` uses a two-byte big-endian byte length followed by
UTF-8 bytes, with no terminator or trailing data. Current protocol identifiers are canonical ASCII;
`recovery.lp` refuses non-ASCII, while the underlying custody KDF encoder can frame well-formed UTF-8.
That helper-domain difference does not expand the current genesis identity domain.

AES-GCM seals one full `Y.encodeStateAsUpdate` update under this key and a separate fresh 12-byte nonce.
The ciphertext is encrypted bytes followed by the 16-byte tag, stored as lowercase hex. Promotion
passes tagLength 128 explicitly; startup's omitted tagLength has the same WebCrypto default, exercised
by native readback. Salt/nonce/ciphertext are fields of the signed candidate; the salt also changes the
key and the nonce changes the AEAD operation. Cipher authentication alone does not authenticate their
service, member or lineage authority.

The producer samples a fresh 16-byte salt and 12-byte nonce for each new seal. Once a candidate is
retained, retry opens and reuses it rather than resealing. An interrupted precommit seal can be
abandoned; the next attempt samples fresh randomness. This is a probabilistic per-seal discipline,
conditional on independent, nonrepeating randomness and unbranched/unrewound histories. It is not a
proof of globally unique salts after RNG cloning or restore, and has no cross-device counter.

## 2. Closed carrier and inherited-suite disposition

`parseGenesis` requires the exact candidate and checkpoint fields. Candidate v1, generation 1,
proposedEpoch 1 and checkpoint v1 are fixed; workspace is 16-byte lowercase hex. Salt is 16 bytes,
nonce 12; ciphertext has 18 through 16 MiB + 16 bytes (minimum two-byte Yjs update plus tag). The
producer bounds plaintext to 16 MiB. Coverage uses `yjs-13.6.31-snapshot-v1` with an empty accepted-head
array; a member-at-zero entry is not an alternate genesis encoding. Actors, recipient order and all
other candidate predicates remain required by the existing parser/first-authority contracts.

The inherited `test/vectors/checkpoint.json` cipher is reproduced byte for byte by the current private
KDF helper, protocol AAD helper and independent Node/OpenSSL oracle. Its generation 3, epoch 9 and
`ws_...` identifier are **outside the current genesis parser**. Its plaintext is descriptive prose,
not an encoded Yjs update. Therefore this agreement qualifies the cipher construction only, not a
successful current startup, Yjs replay or later-epoch installation. The inherited manifest and semantic
admission are v2, while cipher/AAD remain v1; A already owns their current signatures and byte checks.
No inherited vector is rewritten to erase these distinctions.

The new fixed corpus adds current genesis-shaped cipher bytes and a decimal-format helper case.
Helper vectors outside the parser domain do not authorize their values at a live owner. Per-field
mutations and encoded omissions distinguish each of the five AAD components, both KDF-info components,
key, salt, nonce, ciphertext and tag. The parser fixes the cipher version even though the AAD encoder
has no caller-controlled version argument.

## 3. Producer and startup authority chain

`withVerifiedGenesis` holds the promotion slot lifetime, authenticates the claim/custody/promotion,
checks the service pin and recovery draft against the prepared context, and replays encrypted database
and journal. It rejects pending dependencies before capturing coverage. Both device and recovery
recipient wraps must open the held generation key. Candidate signatures are checked against the
prepared device signer. A detached decrypted checkpoint must reproduce both the rederived snapshot
coverage and full document state, including content. The owner rechecks current authorization before
committing the prepared candidate; nothing is selected merely because encryption succeeded.

`verifyAccountUnderPermit` first requires a supported retained handoff/active stage, held pin, identical
request/candidate, verified admission receipt and slot binding. It reconstructs the exact destination,
checks Local census, requires the passkey, and rechecks owner and index after the asynchronous assertion.
Only then does it open factor-protected custody, match recipient/signing credentials, and compare the
opened device generation wrap with the Local generation envelope. The custody factor remains required;
checkpoint decryption does not replace these checks.

The key and AAD above open the retained checkpoint. Startup cold-replays the encrypted database and
journal under the same lifetime, rederives checkpoint coverage, and verifies the receipt again with
separate derived SV and DS. At handoff-selected v4, the recovered document must equal the checkpoint.
At v5 and later it must already contain the genesis: `coversGenesis` applies it to a detached fork and
requires the original state to remain unchanged. It does not overlay missing genesis onto live writing.
Later source/spool/delivery/inbound ledgers additionally verify their own authenticated capture and
completeness witnesses. These predicates distinguish an admitted baseline from a merely decryptable blob.

Account classification is read-only and offline after handoff; it uses no recovery code or network
receipt refresh. Temporary checkpoint plaintext and generation buffers are cleared on the exercised
success/refusal paths; this is explicit buffer cleanup, not heap, filesystem or whole-profile erasure.
No startup refusal repairs, reseals, initializes a Local replacement, or publishes an Account capability.

## 4. Replay, pending state and bounded evidence

SV describes insertions and DS deletions: equal SV is insufficient. The tests generate deletion histories
whose SV stays identical and whose DS changes, reorder dependent delivery, and require full replay
agreement. A checkpoint containing unresolved dependencies refuses. Later current documents may contain
pending suffix work; containment must preserve that pending bookkeeping rather than claim it is a
complete materialized snapshot. Those later admission/ledger rules remain owned by the ordered runtime.

`account:checkpoint-contract` runs independent fixed vectors, parser negatives, shrinking-enabled cipher
and Yjs histories, actual source omissions, and native persisted startup. Native tests compare actual
promotion/startup KDF/AAD traces, prove retained retry does not reseal, cold-open without network, preserve
a later edit, and remove actual journal/database content to require refusal. Omitting selected/active
coverage checks makes those damaged cases classify, proving those checks are exercised. A startup KDF
workspace omission refuses the otherwise valid persisted checkpoint. Local-MAC-authenticated alterations
to receipt, candidate or checkpoint do not bypass service checks. Generated native scopes are fresh for
each history and shrink attempt; evidence reports seeds and counterexamples rather than disabling shrinking.
Inherited genesis and handoff campaigns retain their native interrupted-commit/restart checks.

This is targeted conformance evidence, not an exhaustive security review or a proof of all owner paths.
Native renderer interruption is not OS/power-loss evidence. No real Account, factor, operator key,
personal package, server, origin or browser is used by this campaign.

## 5. Remaining boundary

D7 closes the current genesis checkpoint KDF/AAD source-label group. Local/migration-only provenance
still needs an explicit bounded disposition. F-05/F-06 remain open pending that disposition and the
aggregate contract audit; specified byte groups alone do not complete Stage 4. F-15 retains its current
durability limitation. Successor epochs/checkpoints, install/fallback, trimming remote histories,
second-device adoption/enrollment, revocation/rotation, total-loss recovery, deployment/restore and
independent review remain separate work. The author's existing second device must adopt the first
workspace with fresh local custody and counters rather than merge its old writing.
