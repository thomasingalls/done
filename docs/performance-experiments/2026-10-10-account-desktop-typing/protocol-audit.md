# Protocol and service audit: what one edit requires

2026-10-10, at `23fd688d`. Read-only study by a delegated agent that had not seen the coordinating
session's conclusions: nothing was built or run. Every cost comes from reading code; magnitudes are
estimates unless quoted from a repository document. It was written before the
[measurement](./README.md) finished; the closing section compares the two.

## Headline findings

1. **Sync work runs inside the queue that admits keystrokes.** The admission queue is one FIFO
   (`src/crdt/admissionQueue.ts:698-720`). Two sync steps occupy its head for their whole asynchronous
   duration: the durable flush forced at the start of every send pass
   (`src/crdt/accountEnvelopePreparation.ts:127`, flush job at `admissionQueue.ts:467-474`), and the
   commit of every received page, including the device's own updates read back
   (`admissionQueue.ts:475-503`, `761-767`). A local job is journalled synchronously only when the
   queue is idle (`:699`). Sync also shortens the flush window from 250 ms (`:22`) to 50 ms after the
   first keystroke.
2. **One uploaded unit costs far more than one sign and one seal.** On a one-device account, each
   position (one numbered envelope in the device's outbound stream) costs the sender about 5 Ed25519
   signatures and 10 verifications, 6 durable ledger appends (12 strict IndexedDB write transactions),
   29 full reads of the entire local store, each followed by a ledger re-validation, and 5 HTTP
   requests. Roughly half of this is the echo and a self-triggered authority check.
3. **Every service request re-reads and re-checks the publisher's whole decision ledger.** This
   includes hex-encoding every stored blob twice while holding the SQLite write lock. The
   history-catalogue request does full signature verification of every publisher's ledger with no
   cache. The crypto cache thrashes once a scan exceeds 512 rows.
4. **The TRD selected a lighter construction than what was built.** It specifies heads amortised over
   a run, one `(seq, link)` per credential, no verification on local replay, and batching on a flush
   interval. The code does the opposite in each case.
5. **The service rate limit is global: burst 120, refill 2 requests per second, shared by all
   clients** (`account-service/scoped-http.ts:161`, `209-211`). At 5 requests per position, sustained
   typing would exhaust it in about 24 positions, after which the send lane backs off 1 to 30 s.

The repository's own measurement supports the scale. After the caching repairs, 24 input jobs took
about 61 s to sync, and three status reads took a median 88 ms at about 35 positions
(`docs/account-sync-liveness-repairs.md:81-85`). The same document says proportional scans remain
(`:94-96`).

## What happens, per what, scaling with what

### Sending client

| Step | Per | Scales with | Evidence |
|---|---|---|---|
| Source capsule (JSON, hex of update, random id) and synchronous journal AEAD | local command | update size | `admissionQueue.ts:561-565`, `627`; `src/crdt/accountCapture.ts:321-333` |
| Journal flush to IndexedDB: full store load and validation, then K update records plus 1 capsule record, each sealed | 250 ms window, and every send pass | whole local store | `accountCapture.ts:259-301`; `src/crdt/contentStore.ts:298-358` |
| Source selection: decodes every retained capsule, SHA-256 of selected ones | position | all retained sources | `accountEnvelopePreparation.ts:47-89` |
| `position`, `attempt`, `envelope` ledger records (3 appends) | position | — | `accountEnvelopePreparation.ts:161-206` |
| Seal: HKDF, 12-byte nonce, AES-256-GCM, SHA-256(ct), Ed25519 sign | position | batch size | `account-protocol/envelope.ts:245-278` |
| Submission wrapper: SHA-256(envelope), second Ed25519 sign, `submission` record | position | — | `account-protocol/submission.ts:100-114`; `src/crdt/accountDelivery.ts:307-354` |
| Verify response: recompute link chain, Ed25519 verify head, `response` record | position | positions (memoised) | `src/crdt/deliveryRecord.ts:182-204`; `account-protocol/positionDecision.ts:225-273` |
| Each append: SHA-256 witness extension, counter MAC ×2 sign and ×2 verify, 2 strict write transactions, a full load before commit | append (6 per position with echo) | whole local store | `contentStore.ts:306-360`; `src/crdt/spoolRecord.ts:453-474`; `accountDelivery.ts:134-188` |
| Local re-verification of what it just produced: decrypt and verify the new envelope, verify the submission (2 verifies), verify the response | position (once, then memoised) | — | `spoolRecord.ts:358-450`; `deliveryRecord.ts:299-337` |
| Full-store loads in one send pass: about 16 | position | whole local store | `src/crdt/accountSyncDriver.ts:283-341` with `src/crdt/accountReceive.ts:1324-1363`, `accountDelivery.ts:114-133`, `224-270` |
| Scoped grant (Ed25519 proof) | 5 minutes | — | `account-protocol/scopedGrant.ts:7` |

### Wire and batching

| Step | Per | Bound | Evidence |
|---|---|---|---|
| Send lane wakes 50 ms after a local admission; one position per pass; 50 ms after progress | pass | no minimum fill, no idle debounce | `accountSyncDriver.ts:198-199`, `245-248` |
| Batch: contiguous unsent sources, same actor, kind and epoch | position | 32 sources, 64 KiB | `spoolRecord.ts:37-38`; `accountEnvelopePreparation.ts:66-76` |
| Envelope admission | position | 255 updates, 512 KiB wire; update ≤ 16 KiB | `envelope.ts:12-14`; `src/crdt/journalCodec.ts:6` |
| Submit body is JSON with the submission in hex (2× bytes) | position | 10 s timeout | `account-protocol/deliveryTransport.ts:53-57` |
| Read pages: client refuses any limit other than 1; service supports 8 | position per publisher | — | `src/crdt/accountInbound.ts:265`; `accountReceive.ts:456`; `deliveryTransport.ts:10` |

A typing burst is therefore many requests: roughly burst duration divided by (pass time + 50 ms). For
each position on one device: submit, authority discover, history catalogue, own-stream read, and at
least one empty read to confirm idle.

### Service, per request

| Step | Scales with | Evidence |
|---|---|---|
| Bearer grant lookup, session row, authority fingerprint (re-snapshots about 10 authority rows) | constant | `account-service/grants.ts:372-401` |
| `SELECT * … ORDER BY ordinal`: the whole ledger with blobs | **full ledger, all bytes** | `account-service/delivery.ts:310-313` |
| Re-verify the admission and membership chain from stored rows, no memo | membership events (about 6 Ed25519 verifies on one device) | `delivery.ts:336-492`; `account-service/membershipHistory.ts:35-209` |
| Census: walk every row; on a cache hit a per-byte compare, a deep clone and 2 SHA-256; on a miss 3 Ed25519 verifies plus hashes | rows and bytes | `delivery.ts:676-806`; `account-service/deliveryVerification.ts:43-52` |
| Cache is LRU over 512 entries or 16 MiB, shared across accounts; a sequential scan of more than 512 rows misses on every row (deduced from the eviction order, not run) | cliff at 512 rows | `deliveryVerification.ts:2-3`, `63-64` |
| Verify the new submission: 2 Ed25519 verifies, 2 SHA-256; decode re-encodes and hex-compares each time | request size | `delivery.ts:596-635`; `submission.ts:64-99` |
| `BEGIN IMMEDIATE`, second full snapshot, hex of every blob on both copies, string compare, all under the write lock | **full ledger bytes ×2** | `delivery.ts:315-325`, `918-922`, `1190-1192` |
| Open the acceptance key 4× (HKDF, AES-GCM, key import each); sign the head; sign the witness | constant | `account-service/acceptance.ts:106-180`; `delivery.ts:389`, `930-945` |
| INSERT decision, UPDATE witness, COMMIT with WAL and `synchronous=FULL` | constant, 1 fsync | `delivery.ts:957-976`; `account-service/core.ts:246` |
| Hint every workspace subscriber, the submitter included; re-check every open stream's grant | connected streams | `scoped-http.ts:283`, `321`; `account-service/notifications.ts:34-49` |
| Read page: scans all rows in memory to return one entry; signs the page | full ledger | `delivery.ts:1161-1213` |
| Authority discover: same full read, census and snapshot compare | full ledger | `account-service/discovery.ts:61-83` |
| History catalogue: snapshots every publisher's ledger and runs the census **without the cache** | all ledgers, full crypto | `account-service/historyCheckpoint.ts:143-152`, `365`; `core.ts:673-675` |

`node:sqlite` is synchronous, so one long ledger delays every user.
`docs/account-service-delivery.md:121-122` records the full scans as deliberately deferred.

### Receiving device, per page (one position)

| Step | Scales with | Evidence |
|---|---|---|
| Sign read request; verify own request signature; verify page signature; verify head and link; SHA-256(ct) and verify envelope signature; HKDF and AES-GCM open; `Y.decodeUpdate` | batch size | `accountReceive.ts:446-465`; `accountInbound.ts:276-401` |
| Persist K update records plus one record holding the full request and page; witness extension; 2 write transactions; about 5 full loads | whole local store | `accountReceive.ts:754-778` |
| Retains every position's envelope and proof, re-walked on each changed view | inbound history | `src/crdt/inboundLedger.ts:327-430` |
| Content coverage check: one byte-compare of all content records per retained inbound entry; rebuilds a `Y.Doc` from all content when content changed | entries × content bytes | `inboundLedger.ts:296-326`, `361`, `410` |
| Promote through the admission queue; bumps revision and notifies UI listeners | workspace | `admissionQueue.ts:356-401` |

### Echo

The publisher list includes the device itself (`accountReceive.ts:434-436`). A successful send makes
the receive lane due immediately (`accountSyncDriver.ts:175-183`). The service's hint also reaches the
submitter, and the client responds by resetting its authority and history throttles
(`accountReceive.ts:1797-1800`, `1521-1525`).

Per own position the echo costs one read request with 1 signature, 4 verifications and 1 decrypt; a
second stored copy of the updates plus the page (the envelope ends up about 4× its size through nested
hex); about 9 full loads; a signed discover and a signed catalogue request; and an admission-queue
slot with a no-op promotion that still publishes a new revision.

### Backup

| Step | Per | Scales with | Evidence |
|---|---|---|---|
| Tick every 30 s; dirty if `data_version` changed. Every accepted submission writes; reads do not | accepted position (coalesced to one cycle) | — | `account-service/backup/worker.ts:21`; `backup/cycle.ts:92`; `backup/snapshot.ts:56-58` |
| Online copy, `quick_check`, SHA-256 and SHA-1, tar, gzip, age, upload, full read-back | dirty tick | **database size** | `snapshot.ts:78-112`; `cycle.ts:97-123`; `docs/public-backups.md:43-47`, `57-65` |

It runs in a worker thread, so it competes for CPU and IO rather than blocking the event loop.
Continuous typing by any user means a full snapshot cycle every 30 s. The database grows about 1 kB
per position and is not pruned in ordinary operation.

## Classification

**(a) Required by a stated property**

| Step | Property and threat | Where stated |
|---|---|---|
| Synchronous journal seal per local update | Crash safety; nothing authoritative without a durable carrier | TRD §6.1 (`docs/TRD.md:714-720`, `751-763`) |
| Source capsule keeping actor and exact bytes | Attribution | `docs/progress.md`, "What any design must keep" |
| One AEAD seal and one Ed25519 signature per envelope | Forgery by the service, a removed device, a member posing as another credential | TRD §7.4 (`:1079-1100`); PRD §5.3 |
| Durable position grant before the envelope exists | Two tabs choosing one position; crash gaps | TRD §7.4 (`:1129-1141`) |
| Exact envelope bytes persisted before the first network byte; identical resubmission on silence | The device equivocating against itself after a lost reply | TRD §7.4 (`:1164-1169`), §7.5 rule 5 |
| Service-signed acceptance evidence before a receiver applies anything | A write withheld then released after revocation; equivocation; gaps | TRD §7.5 (`:1231-1271`) |
| Signed permanent refusal | A forged refusal inducing a re-mint | TRD §7.4–7.5 |
| Service checks envelope signature and epoch | Content-blind validation | PRD §7.5 (`docs/PRD.md:2006-2008`) |
| Received content persisted before promotion | Remote dependencies recoverable before local input relies on them | TRD §6.1 (`:731-737`) |

**(b) Required only by the current construction; a cheaper mechanism keeps the property**

- One head per position. The TRD says one signature covers every position beneath it and evidence is
  per run (`:1269-1271`, `:1364-1367`).
- Seal-invocation record per seal. The 2³² bound (`:1116-1122`) survives a block lease.
- The service's full census and whole-ledger compare per request. The witness chain is incremental by
  construction.
- Authority chain re-verified per request. It can be memoised on the fingerprint `grants.ts:47-50`
  already computes.
- Witness signature. Only the service ever verifies it, so a MAC serves.
- Submission wrapper signature when there is no refusal parent. The envelope signature already binds
  workspace, credential, epoch, generation, position and digest.
- Read-request signature. The grant already proves the device key and scope.
- Page signature. The newest head is already a signed high-water mark. Replaying an older one is
  withholding, which TRD §7.5 treats as availability.
- Append-only local proof ledger with a full census per operation. The TRD selects one `(seq, link)`
  per credential (`:1355-1362`).
- One-entry pages. Not reviewed: the 30 s backup cadence and the global limiter.

**(c) Not required**

- Downloading, verifying, decrypting, re-storing and re-promoting the device's own updates. The submit
  response already carries the head. Clone detection needs only the tip.
- The client verifying its own request signature (`accountInbound.ts:277-290`).
- Decrypting and verifying an envelope it sealed moments earlier. PRD §5.3 (`:832-833`) and TRD §7.4
  (`:1212-1225`) say local replay must not verify.
- Persisting the submission wrapper. The service answers retries by position and digest, not by
  wrapper bytes.
- Authority discovery and history catalogue triggered by the device's own commit.
- The un-memoised catalogue census.
- Hex-string comparison where a byte comparison would do, and about 29 loads where one would.

**Where documents and code disagree**

- TRD §7.5 amortised heads against a head per position.
- TRD row 6 `(seq, link)` state (`:3840`) against a log.
- TRD and PRD "no verification on local replay" against `docs/account-delivery.md:24-25` ("every
  operation verifies the retained ledger").
- TRD §7.1 (`:998`) "nothing on the write path may await sync state" against the shared queue, which
  `docs/account-outbound-composition.md:52` describes as intended.
- TRD §7.4 (`:1143-1146`) flush interval against a 50 ms yield.

## Ranked changes

| # | Change | Saves | Depends on | Wire / stored change | Migration |
|---|---|---|---|---|---|
| 1 | Stop reading own-stream bodies. Advance the self cursor from the delivery state; detect a cloned credential by comparing the tip | About half the per-position client work; removes sync from the keystroke queue; removes the growing coverage cost | Submit response head is acceptance evidence for own writes; a conflicting digest already returns the winner's head | Wire: none. Stored: self prefix derived from delivery records | Reader-fence bump; old self-inbound records stay readable |
| 2 | Coalesce a burst: idle-debounce (for example 300–1000 ms, or cap reached) and raise 32 sources toward the 255 receiver cap. Keep updates as separate frames | Positions per burst fall from many to about one; multiplies every other saving | TRD §7.4 permits same-actor batching and asks for a flush interval | None; tunables | None. Cost: remote visibility delay |
| 3 | Service: keep a verified tip per publisher in memory; full census once at startup; per request check the stored witness against the tip and use indexed lookups; range-query pages; memoise authority | O(ledger) to O(1) per request; removes the 512-row cliff and cross-user blocking | Single owning process; the witness chain is incremental | None, perhaps an index | None |
| 4 | Client: one authenticated in-memory state updated on append, verified in full only at cold open | About 29 store reads per position to about 1; the flush stops re-validating | The repository already planned incremental append verification (`docs/account-sync-liveness.md:114-117`) | None | None |
| 5 | Do not hint the submitting session for its own commit, or do not reset discovery on a content hint | 2 requests, 2 signatures and 2 service censuses per position | Hints carry no authority | None if server-side | None |
| 6 | Rate limit per session, sized to the request count | Avoids throttling under typing | — | None | None |
| 7 | Multi-entry pages, one head verified per run | Catch-up for other devices: 1/8 the requests and verifies | TRD §7.5 per-run evidence; service already builds such pages | Inbound record gains multi-entry form | Fence bump, dual reader |
| 8 | Replace the local proof log with the TRD's shape: envelope store keyed by position with a state field, one heads record per credential, block-leased seal budget, binary not hex-JSON | Per-position cost independent of history; about 12× less local storage | TRD §7.4 (`:1171-1174`), row 6 | New local format | Highest: fold-forward migration and new vectors |
| 9 | Backup: interval adaptive to snapshot cost, or incremental shipping | O(database) work every 30 s | Changes the recovery-point statement in `docs/public-backups.md:57-65`; operator decision | None on the protocol | Operational |
| 10 | Small constants when formats are next touched: witness MAC, no wrapper for first attempts, grant-authenticated reads, head-only pages, cached network key | About 2 signatures and 3 verifications per position | As in (b) | Versioned wire and row formats | Moderate; not worth doing alone |

Do 3 before or with 2: larger batches reach the 16 MiB cache bound sooner.

**Would not do**

- **Server-assigned positions.** The position is inside the sealed and signed bytes, and the client
  must replay its own chain unaided (TRD `:1110-1114`).
- **A MAC in place of the envelope signature.** A key shared with the service lets the service forge;
  a content-key-derived key lets any member or removed device forge another credential.
- **One signature across several envelopes.** The service must validate each envelope on arrival.
- **Merging update bytes within a batch.** Source capture must keep each transaction's bytes.
- **Dropping persist-before-send or permanent refusals.**

## Not covered by the audit

- No measurements. Per-byte costs for the hex helper and byte compares are guesses, as are
  projections past 35 positions.
- TRD §13, §7.6 and §14 were not read beyond search. Enrollment, rotation and recovery were not traced
  except where they add per-request work.
- Client history maintenance and pruning were not traced, so the audit cannot say whether anything
  bounds the local ledger in practice. Service pruning keeps rows.
- The gateway, session renewal, and the live deployment's actual configuration were not checked. Only
  `account-service/public-state.ts:170`, `271` shows membership continuation on.

## Checked afterwards

Lines re-read by the coordinating session and found as cited: `account-service/scoped-http.ts:160-162`
and `:209-213` (one shared budget of 120 refilling at 2 per second), `account-service/delivery.ts:310-313`,
`src/crdt/accountSyncDriver.ts:196-199` and `:245-248`, `src/crdt/accountInbound.ts:265`,
`docs/TRD.md:998`, `src/crdt/accountEnvelopePreparation.ts:127`, `src/crdt/spoolRecord.ts:37-38`.
The remaining rows were not independently re-read.

Against the measurement:

- **Requests.** A delivery cycle was four POSTs (`submit`, `discover`, `checkpoint`, `read-v2`), not
  five, at 0.5 requests per key on a fresh account and 0.1 once the client had slowed. Every recorded
  response was a success; the shared limit was not reached in these single-client sessions.
- **Service growth.** Median service time rose with history: `submit` 13.3 to 33.2 ms and `checkpoint`
  27.1 to 110.5 ms between a fresh account and about 2,000 edits. That agrees with the per-request
  ledger read, at a size where the client's own cost is far larger.
- **Network is not the bottleneck.** Stopping the service left the client's per-key work nearly
  unchanged. The audit's finding that sync work shares the keystroke queue stands; its cost is local
  ledger work, not waiting on the service.
- **Not measured.** The 512-row cache cliff, the backup worker, multi-device catch-up and the echo's
  separate share.
