# Client trace: one keystroke and one inbound update on the Account path

2026-10-10, at `23fd688d`. Read-only study by a delegated agent: nothing was built or run. Every row
is from reading code unless marked *(inferred)*. It was written before the
[measurement](./README.md) finished; the closing section says what the measurement confirmed and what
it did not.

The application opens accounts with `openOwnedSyncingAccountWorkspace` (`accountReceive.ts:1910`),
which uses `reference` preparation with `captureSources` (`:1575-1590`). Three things stack up:

- Each key synchronously does three whole-document forks and two whole-document comparisons.
- Every storage task re-reads and re-validates the entire local ledger, which nothing trims.
- Keystrokes queue, unpainted, behind any asynchronous job at the head of the admission FIFO.

## 1a. One keystroke: synchronous, inside the input handler

| # | Step | Where | Scales with |
|---|---|---|---|
| 1 | `inputHandler` returns `true`, so CodeMirror does not apply the key | `admittedEditor.ts:109-117`, `:43-53` | O(1) |
| 2 | `text.input`: `structuredClone(action)`, relative selection, JSON-encode intent | `admittedWorkspace.ts:834-851`, `:519-547` | O(card) |
| 3 | `enqueue`: `status()` filters and reduces the queue | `admissionQueue.ts:721-760`, `:218-239` | O(queue) |
| 4 | Fork 1: clone canonical into a draft | `admissionDocument.ts:35` via `yjs.ts:150-181` | O(document) |
| 5 | Fork 2: `forkWorkspaceHistory` (gc off), scan every struct for `redone`, copy both undo stacks with `structuredClone(meta)` per item | `admittedWorkspace.ts:264`; `yjs.ts:599-659` | O(document) + O(undo depth) |
| 6 | Run command: `EditorState.create` with the markdown extension on the card text, then the Yjs insert | `workspaceCommands.ts:185-233` | O(card), parse up to ~3,000 chars *(inferred)* |
| 7 | Selection metadata `structuredClone` ×3, `Y.mergeUpdates`, source copies | `admittedWorkspace.ts:327-389` | O(update) |
| 8 | Fork 3 plus comparison 1: clone canonical again, apply sources, `sameDocState` | `admissionDocument.ts:66-79` | O(document) ×2 |
| 9 | `captureLocal`: capsule as JSON with hex, validated in a new `Y.Doc` | `accountCapture.ts:321-326`; `sourceCapture.ts:64-115`; `contentCompaction.ts:57-70` | O(update) |
| 10 | `appendLocal`: decode the capsule, re-encode it (second `Y.Doc`), hex-compare, WASM seal, one `localStorage.setItem` | `accountCapture.ts:327-333`; `sourceCapture.ts:116-178`; `journalStore.ts:228-263` | O(update); payload about 10× the raw update *(inferred)* |
| 11 | `promote`: state-vector encode/decode, `applyUpdate(canonical)` | `admissionQueue.ts:356-401`; `admissionDocument.ts:25-26` | O(writers) |
| 12 | Comparison 2: `verifyProjection`, canonical (gc on) against history doc (gc off) | `admittedWorkspace.ts:610`, `:571-577`; `yjs.ts:336-375` | O(document) |
| 13 | `emit`: `setSnapshot(workspace.read())`, and `project()` on each mounted editor | `workspaceUi.tsx:112-118`; `admittedWorkspace.ts:676-719`; `admittedEditor.ts:218-276` | O(workspace) + O(card) |
| 14 | Outgoing listener wakes the send lane; `gate()` calls `status()` repeatedly, two `JSON.stringify` | `accountReceive.ts:1778-1781`; `accountSyncDriver.ts:245-256`, `:93-95` | O(queue) |
| 15 | Two status notifications, each a new object, so every context consumer re-renders | `admissionQueue.ts:430`, `:758`; `workspaceUi.tsx:120`, `:208-225` | O(rendered day) |

Row 12 has a slow path: if the two encodings differ, each side is replayed into a fresh `Y.Doc` and
re-encoded (`yjs.ts:307-318`, `:184-192`). This is expected after the first deletion in a session,
because the history document retains deleted content *(inferred)*.

## 1b. Asynchronous consequences of that keystroke

All of this runs on the main thread. Storage tasks share one serialized tail
(`accountCapture.ts:231-246`).

| # | Trigger | Work | Where | Scales with |
|---|---|---|---|---|
| A | 250 ms after the journal goes dirty | Flush barrier enters the FIFO. Scan all origin `localStorage`, full ledger load, clone the census, decode every stored capsule, then append | `admissionQueue.ts:690-697`; `journalStore.ts:161-200`; `accountCapture.ts:259-307`, `:382-387` | O(ledger); 5 IDB transactions, 2 strict |
| B | 50 ms after a local edit | Send lane: `deliveryStatus`, `spoolStatus`, `prepareNextEnvelope`, `prepareSubmission`, `submitPending`, `deliveryStatus` | `accountSyncDriver.ts:283-341` | about 17 full loads and 5 ledger appends per position |
| B1 | Inside `prepareNextEnvelope` | Calls `whenDurable()`, a second forced flush barrier; decodes every capsule from the start to pick sources; 3 spool appends; AES-GCM plus Ed25519 | `accountEnvelopePreparation.ts:127`, `:47-89`, `:162-206` | O(all capsules) |
| B2 | `submitPending` | 1 HTTP `submit`; recording the response walks a SHA-256 chain from position 1, unmemoized | `accountDelivery.ts:224-270`, `:198`; `deliveryRecord.ts:182-204` | O(positions) WebCrypto calls |
| C | Send progress, or a notification | Receive lane: discovery POST and history-catalog POST when due, then `read-v2` with `limit: 1` | `accountSyncDriver.ts:175-183`; `accountReceive.ts:1723-1766`, `:456` | at least 2 `read-v2` per position per publisher |
| C1 | Own position read back | Its updates are stored again and replayed through the editor path (see 1c) | `accountReceive.ts:727-781` | O(document) × updates in the envelope |
| D | 128 changed records, then 750 ms idle | Compaction holds `busy`, so later keys wait | `admissionQueue.ts:644-689` | O(ledger) + full replay |

Shared costs under A to D:

- **Every load:** `getAll` plus `getAllKeys` on three stores, then parse, compare and copy all rows
  (`contentStore.ts:142-180`, `:227-297`).
- **Every load after an append:** full re-validation (`accountReceive.ts:273-347`). Crypto is memoised;
  iteration, byte compares, `structuredClone` per hit, and `JSON.stringify` of the route per row are not.
- **Quadratic terms:** `positions.some` and `positions.find` inside per-event loops
  (`spoolRecord.ts:269`, `:316`, `:336`; `deliveryRecord.ts:205-336`).
- **Every content change:** inbound coverage replays every content row into a new `Y.Doc`
  (`inboundLedger.ts:250-325`).
- **Authority re-check:** `assertCurrent` re-reads and re-authenticates the slot claim, about 10
  WebCrypto calls and 2 to 3 IDB reads, roughly 15 to 20 times per position
  (`accountReceive.ts:174-193`; `joinedAccount.ts:266-316`; `promotionRecord.ts:430-471`).

## 1c. One inbound update (a peer's, or the device's own echo)

1. A notification wakes the receive lane and resets the discovery and history timers
   (`accountReceive.ts:1794-1805`, `:1521-1525`).
2. `receiveStatus`: authority re-check, full load, clone of the inbound state (`:398-410`). That state
   retains every received envelope and proof (`inboundLedger.ts:421-425`).
3. `prepareRead`: full load, Ed25519 sign, then `POST read-v2` (`:426-507`).
4. The page enters the admission FIFO as a remote job. Local keys queue behind it (`:1617-1623`;
   `admissionQueue.ts:475-504`).
5. `receivePage` (`:678-795`):
   - full load;
   - `verifyInboundPage`: SHA-256, three Ed25519 verifies, AES-GCM open (`accountInbound.ts:229-443`);
   - own stream only: another load plus an unmemoised census (`:727-752`);
   - `appendInbound`: updates and the full page stored again; its pre-commit hook re-checks authority
     and loads again;
   - a final load, which triggers full re-validation and a coverage rebuild.
6. `promote(updates)` runs once per update, all synchronous in one task (`admissionQueue.ts:488`;
   `admittedWorkspace.ts:601-650`): apply to canonical and to the history document; full
   `sameDocState`; `emit` (whole snapshot, every editor); `cardMembershipIssues` scan; invalidate the
   repair flag, so the next key re-runs `repairCardMemberships`.
7. `receiveStatus` again; on progress the lane repeats 50 ms later until a page is empty.

An echo of a 20-key burst therefore runs step 6 twenty times in one task.

## 2. Worse than O(edit), ranked by the trace's expectation of impact

1. **Keys blocked behind asynchronous FIFO heads**, each O(ledger): flush, forced flush from the send
   lane, remote and echo commits, compaction.
2. **Full ledger load on every storage task**, about 30 per delivered position
   (`contentStore.ts:298-305`).
3. **Full re-validation after every append**, about 7 per position, with quadratic terms and a capsule
   decode (JSON, hex, new `Y.Doc`) three times per capsule per census (`spoolRecord.ts:225-357`).
4. **Unbounded ledger.** Compaction deletes only `content` rows (`contentCompaction.ts:119`). Capsules,
   spool, delivery and inbound rows are kept. Each keystroke is stored at least six times *(inferred
   from record formats)*.
5. **Per-key synchronous work:** three forks, two comparisons, a struct scan and an undo-stack clone
   (rows 4, 5, 8, 12).
6. **Echo replay:** N full comparisons and snapshots per read-back position.
7. **Capsule decoding per flush and per position** (`accountCapture.ts:265`;
   `accountEnvelopePreparation.ts:61-62`).
8. **`expectedPosition` hash chain per response** (`accountDelivery.ts:198`).
9. **Coverage rebuild per content change.**
10. **Whole-workspace `read()` and context re-render per event.**
11. **Origin-wide `localStorage` scan per flush.**

The growth the September review round observed is still present. Per-position cost is Θ(ledger rows)
through items 2, 3, 7, 8 and 9, with quadratic terms in item 3. A verification memo now avoids repeated
AES and Ed25519, but not the loads, parses, copies and scans.

## 3. Done per keystroke that could be per burst, with durability and wire bytes unchanged

- Forks 1 to 3 and comparisons 1 and 2 (rows 4, 5, 8, 12).
- Undo-stack copy and the `redone` scan (row 5).
- The parsed `EditorState` for a plain insert (row 6).
- The capsule encode, decode and re-encode round trip, and the two validation documents (rows 9, 10).
- Whole-workspace `read()` and the status-driven context re-render (rows 13, 15).
- The send-lane wake and gate recomputation (row 14).
- Per flush rather than per key: the capsule catalogue of all history, and the full-store load.
- Per echo: one comparison and snapshot per page instead of per update.
- Per driver pass: one load and one authority re-check instead of about 17.

## 4. Cause of the saving-indicator flicker

Both banners show when `status.pendingItems > 0` (`workspaceUi.tsx:228-231`;
`admittedEditor.ts:301-302`).

- In the synchronous path the queue is empty again before any status notification, so the banner
  never shows.
- It shows only when `pump()` returns early because an asynchronous job is in flight
  (`admissionQueue.ts:699`).
- The typed key is then held back as well, because the editor shows accepted text only.
- The jobs that cause it are 1b rows A, B1, C/C1 and D.

Sync makes it worse because the flush at the FIFO head shares the storage tail with the sync driver's
O(ledger) tasks. A keystroke waits for the queued driver tasks, then the flush.

## 5. Questions the trace left to measurement

- How many rows and bytes the public account's store holds, and flush duration against that count.
- The split of a keystroke's delay between synchronous work (1a) and head-of-line wait.
- Whether `sameDocState` takes the normalisation fallback in real sessions.
- Whether the journal is refusing writes. `observedCharacters` counts all origin `localStorage`
  against a 1 MiB watermark (`journalStore.ts:171-174`, `:237`). If exceeded, every key takes the
  asynchronous forced path; check for `status.pressure.code === 'content-pending'`.
- Long-task distribution during an echo replay and during compaction.
- Actual HTTP requests per position.
- Whether IDB `getAll` or the JavaScript validation dominates a load.

## Checked afterwards

Lines re-read by the coordinating session and found as cited: `workspaceUi.tsx:228`,
`admissionQueue.ts:698-699`, `contentStore.ts:142-152` and `:298-305`, `accountReceive.ts:456` and
`:1910`, `journalStore.ts:168-176` and `:235-239`, `contentCompaction.ts:119`.

Against the measurement:

- **Confirmed.** Ranked items 1 to 4. Keydown-to-listener delay reached 1,392 ms p95, the validation
  chain under `contentStore.ts:280` is the largest profile branch, and `outbound` rows grow about 1.1
  per key without shrinking. The flicker mechanism in section 4 matches what the indicator observer saw.
- **Smaller than expected on a small workspace.** Item 5. The synchronous handler measured about
  3 ms p50 on a fresh account. Its p95 does grow with undo depth, to 56 ms after about 2,200 edits.
- **Not exercised.** Item 10 did not appear in the profiles, but the measured workspace had no seeded
  corpus. Item 6 and the compaction path were not isolated.
- **Answered.** Four POSTs per delivery cycle (`submit`, `discover`, `checkpoint`, `read-v2`). Origin
  `localStorage` held 288 characters throughout, so the journal watermark was not involved in the
  measured sessions. The main-thread time of a load is JavaScript validation running in IndexedDB
  callbacks; the time IndexedDB itself spends off the main thread was not separated.
- **Still open.** The public account's row counts, and whether `sameDocState` takes its fallback.
