# Phase 559 survey: bytes-to-hex and hex-to-bytes routines

Base: phases 557 and 558, tree 4ef09a61b8da0101e356e1c9dd5e69f29dfbd476, uncommitted on commit
bfb512c70. Paths are relative to the repository root. "Grows" means the input can grow with
document or history size; "batch" means bounded by a constant over 64 KiB that does not scale with
the document (one envelope, submission, record or capsule); "small" is bounded by a constant of at
most 64 KiB; "fixed" is at most 64 bytes. A subagent read the call sites; the coordinating seat
spot-checked the promotion-payload, baseline and checkpoint rows against the code.

## The routines

| routine | where | how it worked at the base | call sites |
|---|---|---|---|
| `hex` | `src/crdt/custodyCrypto.ts:23` | array of one 2-character string per byte, joined | 297 in 79 files |
| `hex` | `account-protocol/recovery.ts:16` | the same | 83 in 23 files |
| `unhex(value, size)` | `account-protocol/recovery.ts:23` | `/^[0-9a-f]+$/` check, then a char-code loop into a `Uint8Array` | about 215 |
| `lowerHexBytes(value)` | `account-protocol/recovery.ts:148` | one char-code pass that checks and decodes (phase 542) | 5, plus the wrappers `inboundBytes`, `deliveryTransport` `boundedHex`, `spoolRecord` and `deliveryRecord` `hexValue`, `sourceCapture` |
| local helpers | `src/crdt/storeName.ts:34`, `src/crdt/legacySource.ts:123`, `src/crdt/legacyExport.ts:22`, `src/account/slotUnlock.ts:207` (and its `unhex`), `src/lib/id.ts:15`, `src/ui/pendingDeviceWorker.ts:18`, `src/crdt/accountWorkerCohort.ts:82`, `src/crdt/localStartupClient.ts:205` | `Array.from(...)`/spread with `toString(16).padStart` per byte | fixed (16- or 32-byte ids, digests, keys), except `legacySource.ts`, below, which now uses the shared `hex` |
| string validators named `hex` | `account-protocol/membershipLocator.ts:40`, `ceremonyRelay.ts:18`, `membershipCheckpoint.ts:26`, `removalDiscovery.ts:21`, `replacementTransfer.ts:21`, `scopedGrant.ts:43` | wrap `unhex(v, n)` with a fixed `n` (default 32) | fixed |
| Node `Buffer` hex | `account-service/*.ts` (`toString('hex')`, `Buffer.from(x, 'hex')`) | native | fixed or small (keys, nonces, salts, signatures, digests) |

Of the 380 calls of the two `hex` routines, about 245 take values that are fixed by construction
(`random(n)`, `getRandomValues` of a constant, SHA-256 digests, Ed25519 or HMAC signatures,
`.mac`, `.digest`, `.publicKey`, `.nonce`, `.salt`, PIN bytes), found by a pattern over the
argument text; the 134 that remained were read one by one and are classified below.

## Sites whose input grows

| site | routine | bytes | bound before the call (constant, where checked) | runtime | how often |
|---|---|---|---|---|---|
| `src/crdt/localBaselineRecord.ts:102` (`bytes()`) | custodyCrypto `hex` | local baseline snapshot, history record, receipts, carried sources | each field ≤ `LARGE_LOCAL_BASELINE_LIMIT` 32 MiB (`:100`); writes: snapshot ≤ `LARGE_LOCAL_BASELINE_WRITE_LIMIT` 8 MiB (`:285`) and record ≤ 8 MiB (`:292`), so a snapshot near 4 MiB; reads: record ≤ 32 MiB (`:301`), so a snapshot near 16 MiB | device | 2 per encode (record and self-decode), 1 per decode; a baseline load decodes twice (`localBaselineStorage.ts:75`, `:86`) |
| `src/crdt/localBaselineRecord.ts:98` (`data`, via `inboundBytes`) | `lowerHexBytes` | the same fields, decoded | as above | device | once per field per decode |
| `src/crdt/accountSpool.ts:51` (`assertCurrent`), `:103` | custodyCrypto `hex` | the whole promotion payload, which carries the genesis and catch-up checkpoint ciphertexts as hex, so about four characters per ciphertext byte | no bound on the total; each ciphertext ≤ `GENESIS_LIMIT` + 16 (`genesis.ts:134`, `contentCheckpoint.ts:75`), coverage ≤ `COVERAGE_LIMIT` 16 MiB (`admission.ts:129`) | device | `:51` before every submission (`accountDelivery.ts:309`, `:459`) and in publication checks; `:103` once at open |
| `src/crdt/contentCheckpoint.ts:66`, `historyCheckpoint.ts:125`, `replacementCheckpoint.ts:109`, `promotionGenesis.ts:217` | custodyCrypto `hex` | a freshly encrypted checkpoint | plaintext ≤ `GENESIS_LIMIT` 16 MiB (`contentCheckpoint.ts:42`, `historyCheckpoint.ts:90`, `replacementCheckpoint.ts:75`, `promotionGenesis.ts:209`); a history snapshot installs only up to about 1.33 MiB (`HISTORY_INSTALL_LIMIT`, `historyCheckpoint.ts:355`), checked later | device | once per create |
| `src/account/recoveryTransition.ts:42` | recovery `hex` | recovery checkpoint ciphertext | `GENESIS_LIMIT` (`recoverySource.ts:413`); `RECOVERY_CHECKPOINT_BYTES` 4 MiB checked after the hex (`recoveryCommit.ts:18`) | device | once |
| checkpoint ciphertext readers: `account-protocol/contentCheckpoint.ts:143`, `historyCheckpoint.ts:215`, `replacementCheckpoint.ts:202`, `admission.ts:501`; `src/crdt/contentCheckpoint.ts:75`, `:107`, `historyCheckpoint.ts:160`, `replacementCheckpoint.ts:142`, `promotionGenesis.ts:302`, `accountStartup.ts:172`, `historySource.ts:287`, `recoverySource.ts:163`, `recoveryReading.ts:112`; validation-only re-parses at `account-protocol/contentCheckpoint.ts:80`, `historyCheckpoint.ts:138`, `replacementCheckpoint.ts:128` | `unhex` (own length) | checkpoint ciphertext | ≤ `GENESIS_LIMIT` + 16 (recovery: `RECOVERY_CHECKPOINT_BYTES` + 16); transport ≤ `CONTENT_CHECKPOINT_LIMIT` / `HISTORY_CHECKPOINT_LIMIT` 72 MiB | both (verify runs on the service too: `account-service/historyCheckpoint.ts:477`) | once per verify or open; a create re-parses its ciphertext 4 to 5 times |
| coverage descriptors: `src/crdt/contentCheckpoint.ts:57`, `:58`, `:126`–`:134`; `historyCheckpoint.ts:108`, `:109`, `:167`, `:205`, `:206`; `replacementCheckpoint.ts:94`, `:95`, `:150`, `:151`; `promotionGenesis.ts:175`, `:309`, `:339`; `accountStartup.ts:242`, `:249`, `:250`; `historySource.ts:299`, `:303`, `:304`; `recoverySource.ts:173`, `:177`, `:178`; `unhex` at `account-protocol/admission.ts:135` | custodyCrypto `hex`, `unhex` | Yjs state vector, delete set, coverage snapshot (grow with clients and deletions, usually kilobytes) | `COVERAGE_LIMIT` 16 MiB on the hex afterwards (`admission.ts:129`); before the hex only the 16 MiB document bound, and at `promotionGenesis.ts:175`, `:309` and `accountStartup.ts:242`–`:250` nothing in the function | device (`unhex`: both) | once per create or open |
| `src/crdt/joinedAccount.ts:1046`, `:1064` | custodyCrypto `hex` | installed initial update (whole document), then each event row, compared with expected rows | `MAX_BATCH_BYTES` 4 MiB (`joinedAccount.ts:694`, `:723`, `:748`); events ≤ 4,096 (`:254`) | device | once, then once per row |
| `src/crdt/legacyCleanupStorage.ts:38` | custodyCrypto `hex` | legacy update rows | total ≤ 16 MiB, ≤ 4,096 rows (`legacySource.ts:114`) | device | once per row per fingerprint |
| `src/crdt/legacySource.ts:179` | local `hex` (`toString(16)` per byte); the shared custodyCrypto `hex` from this phase | legacy update rows | total ≤ 16 MiB (`legacySource.ts:114`) | device | once per legacy observation |
| `account-service/delivery.ts:354`, `:355` | recovery `hex` | every ledger row's submission and response, in `snapshotBytes` | each submission ≤ 512 KiB admitted; no bound on the total, which grows with rows since the last prune | service | every `unchanged()` comparison (about 15 routes) |

## Batch-sized sites (one item bounded, totals can grow)

| sites | routine | bytes | bound |
|---|---|---|---|
| `account-protocol/deliveryTransport.ts:147`, `inboundTransport.ts:123` (encode and message), `:142`, `deliveryTransport.ts:168` (decode) | recovery `hex`, `lowerHexBytes` | page entry envelopes | `ENVELOPE_WIRE_LIMIT` 4 MiB + 2 KiB per entry; page `READ_PAGE_LIMIT` 10 MiB |
| `account-service/lostDeviceRecovery.ts:600` | recovery `hex` | recovery page envelopes | 512 KiB accepted; page ≤ 4 MiB after the hex |
| `account-protocol/deliveryTransport.ts:54`, `:59`, `submission.ts:96` | recovery `hex`, `lowerHexBytes` | submissions | `SUBMISSION_LIMIT` about 4 MiB |
| `src/crdt/spoolRecord.ts:156`, `:222`, `:227`; `deliveryRecord.ts:114`, `:145`, `:147`, `:362`; `accountDelivery.ts:344`, `:545`; `accountSyncState.ts:14`; `accountInbound.ts:487`, `:538` | custodyCrypto `hex`, `lowerHexBytes` | spool and delivery wires and records, compared or encoded | `MAX_BATCH_BYTES` 4 MiB per record, wires 2 MiB, inbound envelopes 512 KiB |
| `src/crdt/inboundRecord.ts:127`, `:164`, `:213`; `src/account/contentReader.ts:259`; `membershipReader.ts:270` | custodyCrypto `hex`, `lowerHexBytes` | inbound pages and records | page ≤ `READ_PAGE_LIMIT` 10 MiB before `:127` (record ≤ 4 MiB after); records ≤ 4 MiB, ≤ 4,096 per reading |
| `src/crdt/membershipReading.ts:318`, `handoffHistory.ts:152`, `recoverySource.ts:335` | `unhex` (own length) | handoff and recovery events | ≤ 4 MiB per event on the membership path; count ≤ 4,096; on the content-reader and joined-account paths only the count is checked first |
| `src/crdt/sourceCapture.ts:111`, `:139`, `:267`; `accountCapture.ts:824`; `rotationCapture.ts:35`; `accountUploadActivation.ts:78`; `spoolRecord.ts:442` | custodyCrypto `hex`, `lowerHexBytes` | source capsules | `MAX_CAPTURE_BYTES` 2 MiB (`sourceCapture.ts:125`) |

Small sites (`RESPONSE_LIMIT` 4,096, `READ_REQUEST_LIMIT` 4,096, the 128 KiB login state in
`src/account/sessionVault.ts:156`, `:184`, field lists, counter payloads) and fixed sites
(`account-protocol/envelope.ts:89`, `src/account/approvalVault.ts:139`, `generationWrap.ts:104`,
`:105`, `recovery.ts:96`–`:162`, `creationSeed.ts:78`, `promotionRecord.ts:303`,
`inboundRecord.ts:184`, `:358`, and every `random`, digest, signature, MAC, key and nonce) take the
same path and are unaffected in practice.

## Regular expressions on long hex

`unhex` still checks `/^[0-9a-f]+$/` and so do `genesis.ts:40`, `admission.ts:120`,
`recoveryCommit.ts:20` and `membershipReading.ts:145`, on strings up to about 32 million
characters. Phase 542 measured that pattern (no group) correct at 64 MiB of characters in WebKit
26.5, Chromium 151 and Firefox 153; only the grouped `/^(?:[0-9a-f]{2})+$/` failed. Nothing here
changes them.
