# Inherited store and synchronous journal byte bridges

D5 pins the current owners at `837cd14`. It qualifies store naming, store-record derivation/AAD and
the synchronous journal KDF/AEAD/carrier connection. The inherited row-2 and row-3 stored-record vectors
remain byte-identical. Key envelopes, other custody primitives, checkpoints and migration provenance
retain their own unfinished construction records. No production format or implementation changes here.

## 1. Store names and encoding domains

```
message = LP("done/store-name/v1") || LP(principalId) || LP(workspaceId)
digest = SHA256(message)
dbName = "done." || lowercaseHex(digest[0..16))
```

LP is uint16 big-endian UTF-8 **byte length**, then the bytes, with at most 65,535 bytes per field.
There is no Unicode normalization, delimiter, salt, NUL terminator or hex intermediary. Slot ID, store
ID and root ID are absent. This is a rediscovery name, not an authentication credential or secret.
Someone with both identifiers can compute it; truncated digest collisions are possible. An assumed
unpredictable principal, not hashing alone, supports any narrower workspace-only guessing claim.

`deriveStoreName` is a typed low-level helper. Its private LP calls TextEncoder directly, so a lone
surrogate and U+FFFD alias if a caller supplies malformed Unicode. The admitting custody `identity`
guard rejects lone surrogates, empty strings and strings longer than 1,024 UTF-16 code units before
owner derivation. Other callers must establish that same identity precondition; hashing alone does
not validate it. Store/journal KDF/AAD helpers use `custodyCrypto.fields`, which also rejects lone
surrogates before encoding. Canonically equivalent Unicode strings remain distinct. The vectors cover
UTF-8 byte lengths, ambiguous concatenation boundaries and the native owner-derived name.

## 2. Store key, record bytes and authentication

Custody authenticates its retained record, factor-opens the root and unwraps a generation secret of
exactly 32 bytes before deriving:

```
K_store = HKDF-SHA256(K_g[32], salt=empty,
  info=LP("done/store/v1") || LP(workspaceId) || LP(storeId), length=32)
AAD = LP("done/store/v1") || LP(principalId) || LP(workspaceId) || LP(storeId)
   || LP(decimal(v)) || LP(decimal(gen)) || LP(decimal(seq)) || LP(kind)
ct = AES-256-GCM(K_store, nonce[12], AAD, plaintext, tagBits=128)
```

The nonce is fresh `crypto.getRandomValues` output for each encryption. WebCrypto returns ciphertext
followed by its 16-byte tag. The derived CryptoKey is non-extractable; content owners request
encrypt/decrypt usages, read-only custody requests decrypt alone. Principal is an AAD field but not
a KDF field. Slot and root IDs are in neither: their custody/metadata ownership checks are separate
from this encryption. The active generation number is not KDF info; the generation secret selects
the key. Non-extractability alone is not filesystem protection.

The native carrier is a structured-clone **plain object**, not canonical JSON:
`{v, gen, seq, kind, nonce, ct}` with exactly those keys. v=1; gen and seq are positive safe integers;
kind is update/state/heads/outbound; nonce is Uint8Array[12]; ct is Uint8Array with at least 16 bytes.
Arrays, unknown/missing properties, wrong prototypes and invalid widths refuse. The parser copies
nonce/ct; property order is immaterial. It has no independent upper ciphertext size bound. Ordinary
batch admission applies 1–256 records and at most 4 MiB total plaintext before allocating or sealing.
Decimal numeric AAD fields are JavaScript `String` of validated positive safe integers, with no leading
zeros or exponent notation. Payload helpers assume a parsed typed header, not arbitrary untrusted input.

Update/state rows belong in `content`; heads in `heads`; outbound in `outbound`. The primary key is
the row sequence. Native loading checks placement, allocated range, metadata authentication and current
generation before accepting opened bytes. Ordinary custody currently has only the generation-1 opener
and refuses other generations. The higher-generation vectors qualify byte syntax, not rotation support.
AEAD success alone does not establish Yjs completeness, Account authorization or permission to trim.

## 3. Journal key, AAD and canonical carrier

At open, custody derives a raw byte key for the synchronous WASM owner:

```
K_journal = HKDF-SHA256(K_g[32], salt=empty,
  info=LP("done/journal/v1") || LP(workspaceId), length=32)
AAD = LP("done/jrnl/v1") || LP(workspaceId) || LP(decimal(gen)) || LP(storageKey)
ct = XChaCha20-Poly1305(K_journal, nonce[24], AAD, plaintext)
value = "2:" || standardBase64(u32be(gen) || nonce[24] || ct)
```

`deriveBits` produces 256 bits from non-extractable HKDF input. Store ID and principal are not KDF
fields. The full storage key indirectly binds their selected database/store placement in the AAD.
Generation is an unsigned nonzero 32-bit header, also authenticated as decimal text. Ciphertext ends
with its 16-byte tag. Prefix `2:` is the only accepted suite; no fallback to legacy plaintext occurs.

Decode requires canonical standard base64 with exact alphabet, padding, a length divisible by four,
and equality after decode/re-encode. Whitespace, URL-safe spelling and nonzero unused padding bits
refuse. Raw length is 44 through 16,428 bytes: four header bytes, 24 nonce bytes and 16 tag bytes plus
0–16,384 plaintext bytes. The production codec rejects larger plaintext **before** WASM sealing.
The low-level encoder has no upper size guard and is not the admission API. The decoder copies slices.

Each codec holds one generation opener. A different header generation refuses even if some other
opener could exist. Authentication then uses the decoded generation and exact supplied storage key.
Native custody creates generation 1; vectors for 256 and 2^32−1 test big-endian framing only.
Authentication/framing errors become repair-required, preserving unreadable storage for repair.

The already shipped RustCrypto WASM wrapper enforces 32-byte keys, 24-byte nonces and its AAD/plaintext
limits, returns detached outputs, clears staging buffers, and clears memory on disposal. D5 uses that
exact generated blob and reruns its existing published KAT, composition and source-hash drift checks.
This is a bridge to existing evidence, not a rebuild, provenance attestation or whole-WASM qualification.

## 4. Storage identity, owner lifetime and safety assumptions

```
prefix = "done.pending-update." || encodeURIComponent(dbName) || "."
writer = lowercaseHex(random[16])             // once per journal owner
storageKey = prefix || storeId || "." || writer || "."
           || String(++ordinal).padStart(16, "0")
```

Ordinal begins at zero, must remain a safe integer, and advances even if a later admission step refuses.
It identifies an entry; it is **not** a nonce or allocation counter. The owner separately samples a fresh
24-byte nonce for each seal. Existing entry identity refuses rather than overwrites. Append returns a
journalled receipt only after synchronous localStorage.setItem succeeds. Pressure/quota refusal is not
an acknowledgment. The one-million-character watermark counts observed UTF-16 key/value characters;
it is advisory, and actual setItem refusal remains authoritative.

The snapshot reader enumerates scoped prefix keys, opens all captured values, checks the same key set
and rereads exact values. Concurrent addition/removal produces a bounded retry; immutable replacement
poisons the owner. Recovery captures journal before content. Flush commits captured plaintext to the
allocated encrypted database, then removes only each unchanged key/value. This depends on conforming
writers using immutable, never-reused entry identities: localStorage has no atomic compare-and-delete.
Content metadata provides additional scope/generation authority; it does not make journal operations
part of an IndexedDB transaction. D5 does not qualify old-key retirement or general rotation.

**Correction to the inherited row-2 wording:** 192-bit random nonce safety is not “unconditional.” With
independent uniform samples, collision probability grows with invocations (approximately
q(q−1)/2^193 for q much smaller than 2^96). Practical margin is large, but depends on functioning fresh
randomness. Cloned/restored RNG state, writable profile branching and arbitrary rollback are not
established safe by a byte test. Writer collisions have their own identity/refusal behavior and must
not be confused with AEAD nonce collisions. Inherited AES lifetime accounting and relaxed IndexedDB
durability retain D4's explicit F-15 limitation; renderer death is not an OS/power-loss test.

## 5. Evidence and remaining gates

`pnpm account:store-contract` checks eleven independently generated vectors, every encoded AAD field,
the unchanged inherited row-2 and stored-record subset of row-3 corpus, parser boundaries, actual
source omissions, and 160 shrinking-enabled generated byte histories. Node crypto implements the
independent AES/HKDF oracle; noble implements the independent XChaCha oracle. Neither imports production
encoders. Fixed nonces are test inputs, not a production discipline. Generated higher-generation syntax
does not model production rotation or prove arbitrary concurrent histories.

Native disposable Chromium fixtures inspect actual factor-opened custody derivations and raw persisted
records/journal, reopen the owners, verify writer restart/ordinal identities, flush, and refuse changed
headers, placement, tags and copied entries. A source control removes storeId from custody's real KDF:
its local encrypt/decrypt round trip still works, while the independent expected-byte check fails.
Helper source controls omit record principal/sequence/kind or journal workspace/generation/identity
while preserving real cryptography; a parser control admits a padding alias. Existing content/journal
native regressions retain crash, unreadable-load, abort, concurrent-writer, handoff and disposal evidence.

Synthetic fixture identity/creation checks do not confer a real Account receipt or qualify onboarding.
The production sources, personal build/server, prior vectors and historical review remain unchanged.
F-05/F-06 remain open for the remaining custody/checkpoint/provenance constructions and broader gates;
F-15 remains open for its failure model and persistence repair. No release-wide security or independent
review claim follows from this bounded bridge.
