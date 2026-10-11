# Receive-path trace: what a catching-up device does

2026-10-11, at `bbfc532d` (the same tree as deployed `main` `7b6d8d9f`). Read-only trace by a delegated
agent of the Claude review session: nothing was run. Everything is from reading unless marked
*(inferred)* or *(deduced)*. It was written while the [measurement](./README.md) ran; the closing
section compares the two. Paths are under `src/crdt/` unless prefixed.

**Headline.** Catch-up is strictly one position per scheduler pass, and three terms grow with history:

- On the client, every pass does about ten full ledger loads, each cloning the whole inbound state,
  including every envelope and proof ever received.
- On the service, every read re-reads and re-checks the publisher's whole ledger, and the crypto cache
  stops helping past 512 rows *(deduced)*.
- The history-catalog request verifies every publisher's whole ledger with no cache at all.

## 1. The catch-up loop

All client steps run on the main thread.

| # | Step | Where | Holds editor queue? | Scales with |
| --- | --- | --- | --- | --- |
| 0 | Wake: `start` on open, `online` (also resets throttles), a hint (`resetDiscovery()` then `wake('remote')`), or idle poll every 5 s (60–65 s when the stream is healthy) | `accountReceive.ts:2034`, `:1939-1942`, `:2023-2026`, `:1947` | no | — |
| 1 | `refreshAuthority`: skipped if under its 5 s throttle; otherwise a signed discovery POST, chain verification and `adoptMembership` (returns early if unchanged) | `:1260-1430`, throttle `:1272`, `:1334` | no | membership chain |
| 2 | `receiveHistory`: skipped if under its 5 s throttle; otherwise `state()`, sign, POST `history/v1/checkpoint` catalog. A new admitted snapshot is fetched and installed through the queue | `:636-726`, `:727-799`, `:1957` | only on install | service: all ledgers |
| 3 | Publisher loop: `driveReceiveStep` per certified device, round-robin including self, returning at the first non-idle step. So at most one position per pass | `:1985-1991`, `:560-562`, `:1707` | — | device count P |
| 3a | `receiveStatus` (before): `state()` | `accountReceiveDriver.ts:200`; `accountReceive.ts:803` | no | local ledger |
| 3b | `prepareRead`: `state()`, build request with `limit: 1`, Ed25519 sign, authority re-check | `:552-598` | no | local ledger |
| 3c | POST `delivery/read-v2` | `:601-633` | no | service ledger |
| 3d | Self publisher: verify the (normally empty) page outside the queue; `state()` again | `:1850-1871`, `:819` | no | local ledger |
| 3e | Peer publisher: page enters the admission FIFO as a remote job with `commit` | `:1819-1821`, `:1873`; `admissionQueue.ts:475-503` | **yes, until 3i** | — |
| 3f | In the commit: `state()`; `verifyInboundPage` (reader signature, page signature, head, envelope signature, AES-GCM) | `:819`, `:841-852`; `accountInbound.ts:258-443` | yes | update count |
| 3g | `appendInbound`: reservation transaction, seal K+1 records, `beforeCommit` (authority re-check plus `state()`), commit transaction. Two strict writes. Stores K update rows plus one `heads` row holding the full request and page | `:907-926`; `contentStore.ts` `appendRecords` | yes | local ledger |
| 3h | `saved = state()`: incremental extension. The stored page is verified once more (then memoised), the coverage document is extended, and the whole verified view is cloned on install | `:928`; `inboundLedger.ts:429-549`, `:357-392`; `verifiedRecords.ts` `verify` | yes | all retained bytes |
| 3i | `promote(updates)`, once per update, synchronously | `:931`; `admissionQueue.ts:488`, `:356-401` | yes | see section 4 |
| 3j | `receiveStatus` (after): `state()` | `accountReceiveDriver.ts:205` | no | local ledger |
| 4 | Progress sets the next pass 50 ms out; only one pass (send or receive) runs at a time | `accountSyncDriver.ts:206-221`, `:149-152` | — | — |

- **`state()` is the repeated cost.** It is an authority re-check, a full carrier load, an exact
  comparison of every row, and `structuredClone(v.inbound)` (`accountReceive.ts:524-536`;
  `verifiedRecords.ts:68-78`).
- **The inbound state retains every received position's envelope and proof, and every own accepted
  one.** Nothing deletes them (`inboundLedger.ts:540`; `accountSyncState.ts:93-94`).
- **Count per peer position with two devices:** about ten `state()` calls: six on the productive read
  (3a, 3b, 3f, 3g, 3h, 3j) and four on the empty self read.

## 2. What bounds positions per second

| Bound | Arithmetic |
| --- | --- |
| Page size 1 | `accountReceive.ts:582`; the verifier refuses anything else (`accountInbound.ts:265`). The service allows 8 (`account-protocol/deliveryTransport.ts:10`). So one position per round trip and per commit. |
| Reads per position | P reads when one publisher has the backlog: one productive plus P−1 empty, self included. The request packet measured 298 reads for 139 submits, 2.14 with two devices. |
| Inter-pass delay | 50 ms per position, so at most 20 per second before any work. Timer clamping in a hidden tab would cap this near 1 per second *(inferred)*. |
| Hint-driven requests | A hint zeroes both the discovery and history throttles (`:1721-1725`). While the sender is still typing, each pass adds a discovery and a catalog request: about 4 receiver requests per position. With a quiet backlog each is once per 5 s. |
| Network | Requests are sequential. Time per position ≥ P × (round trip + service read time), plus two more round trips when hinted. |
| Session budget | 120 burst, 16 per second, 4 in flight (`account-service/requestBudget.ts:5-11`). At 2–4 requests per position that allows 4–8 positions per second, so it is not the binding limit. |
| Back-off | Any `unknown` (429, timeout, failed discovery) backs off 1 to 30 s, and hints are ignored while failures > 0 (`accountSyncDriver.ts:206-207`, `:248-251`). The transport itself retries a 429 after 1 s and 2 s (`src/account/scopedTransport.ts:179-196`). |
| Local work | About ten loads and clones, two strict transactions, two signs and roughly eight verifies per position. |
| Growth | Each position adds a `heads` row with the full page plus retained envelope bytes. The per-`state()` clone and comparison therefore grow linearly, and total catch-up is roughly quadratic *(inferred)*. |

## 3. Service read path

**`delivery/read-v2`** (`account-service/delivery.ts:1110-1233`), per request:

1. Reads the publisher's full ledger with blobs (`:290-314`).
2. Verifies workspace authority and the request signature.
3. Runs `census` over every row (`:676-806`). On a cache hit that is a per-byte comparison, a
   `structuredClone` and a commitment hash; on a miss it is three Ed25519 verifications plus hashes.
4. Scans the rows linearly to pick one entry.
5. Takes `BEGIN IMMEDIATE`, re-snapshots, and compares hex-in-JSON of both full snapshots under the
   write lock (`:1190-1192`).
6. Signs the page.

So every read is O(ledger rows and bytes) even with a perfect cache.

**The 512-entry cache** (`deliveryVerification.ts:2-3`, `:35-75`) *(deduced, not run)*. There is one
slot per ledger row, keyed by account, credential and ordinal. A hit moves the slot to the back; an
insert evicts the oldest while 512 or more are held. For a ledger of R > 512 rows scanned in order,
inserting row k evicts row k+(R−512), so each row is evicted before the scan reaches it again. Every
request then pays full crypto for every row. The cache is also shared across publishers and accounts.
At the 224 positions per 600 keys the request packet measured, a publisher crosses 512 rows after about
1,400 keystrokes.

**Discovery** (`discovery.ts:51-106`): full snapshot, the same census with the cache, then a snapshot
comparison.

**History catalog** (`historyCheckpoint.ts:143-152`, `:365`): snapshots every publisher's ledger and
runs `census` with no cache argument. Every catalog read, the cheap `catalog` selector included, is
full crypto over all ledgers.

## 4. What one delivered position costs to render

Per update, synchronously inside the queue job (`admissionQueue.ts:488`): apply to canonical; the
workspace subscriber applies to the history document and runs `verifyProjection()`, a full document
comparison (`admittedWorkspace.ts:612-623`); `emit()` runs a whole-workspace `read()` per update
(`src/ui/workspaceUi.tsx:111-118`); and a `cardMembershipIssues` scan. A user typing on the receiving
device is blocked from 3e through 3i for every position, because local input queues behind the remote
job (`admissionQueue.ts:698-699`).

## 5. What the design says

- **Per-run evidence.** "A client walks a run to n, verifies one signature there, and applies the whole
  run or none of it" (`docs/TRD.md:1364-1367`). The build verifies and commits per position.
- **Anti-replay state.** The TRD specifies one `(seq, link)` per credential, not a log, and says a
  device "retains only its own outbound envelopes" (`:1355-1370`). The build retains every received
  page.
- **Checkpoints.** A device starting from a checkpoint verifies only the suffix (`:1399-1403`). Cadence
  is meant to be a position count or an interval, grounded in first-sync cost (`:1511-1518`).

What exists for checkpoints today:

- **Install is automatic.** The receive loop checks the catalog before reading suffixes, installs an
  admitted snapshot through the queue and advances each publisher's prefix to its cut
  (`accountReceive.ts:1957`; `inboundLedger.ts:206-249`; `docs/account-history-management.md:329-333`,
  `:373-381`).
- **Creation is manual.** It is an explicit Account-menu action; automatic cadence is off (`:94-95`,
  `:48-50`).
- **Two-device accounts get no shortcut.** With two or more certified members the producer cannot admit
  its own snapshot (`account-protocol/historyCheckpoint.ts:326`, `:342`), and the admitting device
  replays accepted sources itself (`docs/account-history-management.md:188-189`). The lagging device is
  the only possible admitter. With three or more devices an up-to-date third can admit.
- **New devices start at their admission cut,** not genesis (`:392-396`).

## 6. Options, as ranked by this trace for making an existing backlog replay fast

| # | Change | Gain | Wire / stored | Leans on | Risk |
| --- | --- | --- | --- | --- | --- |
| 1 | **Service: stop per-request whole-ledger work.** Keep a verified tip per publisher and extend it by new rows, or at least stop the scan self-evicting. Pass the cache to the catalog census. Fetch page rows by index. Compare snapshots by witness and count | Largest if ledgers exceed 512 rows; removes linear service cost on every path. Needs only a service deploy | none | incremental witness chain; single owning process | medium |
| 2 | **Stay on the publisher that has a backlog.** Read self and idle publishers only at the idle interval | Removes P−1 reads and about 4 `state()` calls per position | none | hints carry no authority | low |
| 3 | **Narrow the receive `state()`** to prefix, conflict and the one retained entry needed, and reuse it within a pass | Removes the O(history bytes) clone, about 10× per position | none | existing select-before-clone | medium |
| 4 | **No 50 ms wait while a backlog remains.** Continue in-pass with a time budget, yielding to local input | 50 ms per position plus scheduling overhead | none | — | low |
| 5 | **Content hints do not zero the discovery and history throttles** | Two requests per position during live typing, one of them the costliest service call | none | 5 s throttles still bound staleness | low |
| 6 | **Verify and publish once per page**, with UI publication coalesced during a sweep | K× fewer comparisons and reads; a prerequisite for sender batching | none | check before exposure, with the page as the unit | low to medium |
| 7 | **Pipelined single-entry reads:** up to 4 outstanding signed requests, committed in order | Amortises round trips | none (the client's single-outstanding rule at `accountReceive.ts:823-826` changes) | per-entry evidence unchanged | medium |
| 8 | **Multi-entry pages with one head per run** | Up to 8× fewer requests and commits | new inbound record form; reader fence and dual reader | TRD §7.5 per-run evidence | high |
| 9 | **`(seq, link)` receive state** in place of retained pages | Stops ledger and clone growth at the source | new local format and migration | TRD `:1355-1362` | high |
| 10 | **Automatic checkpoint creation** | Skips whole prefixes for accounts with three or more devices; needs an admission-rule decision for two | cadence only; rule change if self-admission is allowed | TRD §7.6 | medium to high |
| 11 | **Sender batching** | Shrinks future backlogs only | none | — | — |

The trace's order: 1, then 2, 4 and 5 together, then 3 and 6, then measure before 7 or 8. Options 8 to
11 mostly help future history, or need format decisions.

## Verified, deduced and inferred

- **Verified by reading:** every step, request and file reference above; the retained-envelope clone;
  the uncached catalog census; the self-admission rule.
- **Deduced:** the cache thrash past 512 rows, from the eviction order.
- **Inferred:** all rates and timings; quadratic growth; hidden-tab clamping.

## Checked afterwards

Lines re-read by the coordinating session at `bbfc532d` and found as cited:
`account-service/deliveryVerification.ts:35-75` (a hit re-inserts the slot at the back; an insert evicts
the oldest while 512 or more entries are held); the `census` call sites, of which only
`account-service/historyCheckpoint.ts:365` passes no cache; `accountReceive.ts:524-538` (`state()` is
`assertCurrent`, a carrier load, and `verified.read(records, (v) => v.inbound)`); and
`accountReceive.ts:1983-1993` (the publisher loop returns at the first step that is not idle).

Against the measurement:

- **The cache deduction is confirmed causally.** Service handling stepped up about fivefold at the
  writer's 498th accepted position; lifting the bound removed the step and lowering it to 64 moved it
  to the 67th position.
- **The uncached catalog is confirmed.** `history/v1/checkpoint` costs about 1 ms per position at every
  ledger length, with or without the bound.
- **One position per pass with an empty self read is confirmed**: two reads per position, and keeping
  to the advancing publisher raised the rate 44%.
- **The 50 ms pause is confirmed as a real but smaller term**: removing it raised the rate 18%.
- **The largest client CPU cost was not the clone the trace expected.** At a short ledger, 75 of 188 ms
  per position was `assertCurrent` hex-encoding one custody record to compare it
  (`custodyRecord.ts:404`). The clone's growth with depth shows as the rate falling through a backlog.
- **Rendering was not a factor on a small workspace** (about 2.5 ms per position), and typing on the
  receiver was not delayed. Section 4's blocking concern was not observed at this size; a large
  workspace was not measured.
- **The session budget did not bind**: no request was refused.
- **Since this trace, `4bcac419` (not deployed)** verifies and publishes once per page on Account
  receives, which is option 6.
