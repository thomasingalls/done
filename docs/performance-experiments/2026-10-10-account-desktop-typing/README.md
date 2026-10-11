# Desktop typing on the Account path, with sync and growing history

2026-10-10. Diagnostic measurement and three read-only studies at `23fd688d`, prompted by the
operator's report from the public installation: obvious input latency on desktop at an ordinary typing
speed, the saving indicator flickering, worse with server sync configured. This is not a budget run
and changes no gate.

**Finding.** Local typing is fine. On the Account path every edit makes the client re-validate its
whole local ledger on the main thread, in continuations that run after content-store transactions.
Keystrokes queue behind that work. The cost grows by about 0.35 ms per key for every prior edit, the
stored rows never shrink, and stopping the service does not remove it.

## What is here

| File | What it is |
| --- | --- |
| this README | The measurement: setup, results, attribution, limits |
| [client-trace.md](./client-trace.md) | Everything the client does per keystroke and per inbound update on the Account path, from reading code |
| [protocol-audit.md](./protocol-audit.md) | What the protocol and service require per edit, what a property needs and what it does not, ranked changes |
| [crdt-study.md](./crdt-study.md) | What the application needs from a CRDT, where Yjs fits badly, and candidate engines compared |
| `*.summary.json` | Per-block statistics: `control`, `local`, `account`, `extra` |
| `stable-text.txt` | Key-to-stable-text table recomputed from `raw/` by `probe/stable.mjs` |
| `*-profile-tree.txt` | Source-mapped call trees of the profiled blocks |
| `raw/` | Raw per-key captures for every block (2.3 MB) |
| `account-run1/` | The first account run, which stopped early (see Limits) |
| `campaign*.log`, `probe/` | Run logs and the probe scripts |

The three studies were written by delegated agents while the measurement ran. Each ends with a
"Checked afterwards" section listing the cited lines the coordinating session re-read, and how the
measurement confirmed or contradicted it.

## Setup

`git archive HEAD` built with source maps in a scratch directory; seven chunk hashes equal the public
build's. A local account service and gateway on ports 53771/53772 with network sessions and membership
continuation on, as deployed. Playwright headless Chromium 151.0.7922.34, no CPU throttle, virtual
passkey, one device. M1 Pro with other applications running: load average 5–7 throughout. The main
checkout's `node_modules` lacked `@tanstack/react-router`, so the build used the complete install in
another worktree, read-only.

A timed block types 200 keys of English text into a fresh card with jittered 110–180 ms gaps. Traced
and profiled blocks are 100 keys each and follow the timed block. Fixed sample counts; nothing was
rerun for a better number.

## Results

All values are p50 / p95 in ms.

- **Paint** is key to next frame (`keyToNextPaintMs`).
- **Text** is key to the character *stably* present in the editor DOM (`stable-text.txt`). The
  controlled editor lets the browser insert the character, removes it when the command is queued
  instead of accepted, and re-adds it on acceptance. The summaries' `keyToTextInDomMs` records the
  first arrival and is therefore optimistic on the Account path; the stable figure is the last time
  the text grew to include that key.
- **Queue** is keydown to first listener, p95 (`keydownQueueDelayMs`).
- **Indicator** is appearances of "Input is waiting to be saved." / keys typed while it was visible.

| Condition (prior edits) | Paint | Text | Queue p95 | Indicator | Actual gap p50 |
| --- | --- | --- | --- | --- | --- |
| Plain textarea | 1.4 / 2.2 | 0.7 / 1.1 | 0.6 | 0 / 0 | 148 |
| Bare CodeMirror | 1.7 / 7.9 | 0.7 / 1.2 | 0.6 | 0 / 0 | 149 |
| Local (0) | 4.0 / 6.4 | 0.9 / 1.2 | 0.5 | 1 / 1 | 150 |
| Local (1,000) | 4.4 / 6.6 | 0.9 / 1.3 | 0.5 | 2 / 2 | 150 |
| Account + sync (0) | 16.9 / 82 | 27.7 / 210 | 79 | 60 / 87 | 175 |
| Account + sync (320) | 133 / 285 | 223 / 779 | 274 | 41 / 111 | 290 |
| Account + sync (1,020) | 382 / 696 | 571 / 2,258 | 686 | 53 / 151 | 529 |
| Account + sync (2,020) | 711 / 1,400 | 4,962 / 12,510 | 1,392 | 7 / 191 | 860 |
| Account, service stopped (2,420) | 75 / 1,666 | 233 / 1,869 | 1,658 | 74 / 103 | 244 |

At 2,020 edits the indicator was visible for 92% of the block, which is why it appeared only 7 times.
On the fresh account each appearance lasted 97 ms p50 and 400 ms p95, and on 59 of 200 keys the
inserted character was removed and re-added.

Other blocks, paint then text:

- 50 ms cadence, 120 keys: Local 3.8 / 6.5 and 0.8 / 1.0. Fresh Account (after 200 edits) 94 / 190 and
  133 / 563.
- CPU-4x at 50 ms cadence: Local after 1,400 edits 13.5 / 15.7 and 2.1 / 2.9. Account after 200 edits
  103 / 743 and 1,093 / 4,319.
- Goals typing on an Account after 320 edits: 126 / 273 and 206 / 720, the same as card typing at that
  history.

### Growth with history

| Prior edits at block | Main-thread ms per key, p50 / p95 (traced) | IndexedDB-callback ms per key (traced) | Longest task, ms | Handler ms, p50 / p95 | CPU ms per key (profiled, 100 edits later) |
| --- | --- | --- | --- | --- | --- |
| Local, 320 | 6.0 / 9.8 | 0.6 | 5.5 | 3.2 / 4.4 | 5.8 |
| Local, 1,200 | 6.6 / 11.7 | 0.6 | 6.0 | 3.7 / 4.8 | 6.2 |
| Account, 0 | 146 / 209 | 134 | 115 | 3.2 / 4.0 | 196 |
| Account, 520 | 346 / 504 | 324 | 507 | 2.4 / 11.2 | 402 |
| Account, 1,220 | 573 / 997 | 542 | 975 | 1.9 / 21.9 | 589 |
| Account, 2,220 | 853 / 1,631 | 789 | 1,749 | 2.1 / 56.5 | 985 |
| Account, service stopped, 2,620 | 197 / 1,862 | 747 | 1,829 | 68 / 77 | — |

Profiled CPU per key rises 789 ms over 2,220 edits: about 0.35 ms per key for every prior edit. The
`outbound` store held 12, 401, 1,182 and 2,256 rows and `heads` 16, 147, 290 and 416 at 0, 320, 1,020
and 2,020 edits. `outbound` gains about 1.1 rows per key and never shrank: 2,983 rows after 2,720
edits. Local's stores stayed at 4 content rows and no `outbound` rows. Origin `localStorage` held
288 characters throughout, so the journal's 1 MiB watermark was not involved.

### Network and service

A delivery cycle is four POSTs: `delivery/submit`, `authority/discover`, `history/v1/checkpoint` and
`delivery/read-v2`. That is 0.5 requests per key on a fresh account, falling to 0.1 as the client
slows. Every response with the service running was a 200. Median service time grew with history:
`submit` 13.3 to 33.2 ms and `checkpoint` 27.1 to 110.5 ms between the fresh block and 2,020 edits.

## Where the time goes

From `account-acct-p3-profile-tree.txt`, 985 ms per key, with the fresh account's figure
(`extra-fresh-profile-tree.txt`, 196 ms per key) in brackets:

| Branch | ms per key |
| --- | --- |
| Validation after a content-store transaction, entered at `writeSession.ts:156` | 413 (95) |
| `verifyInboundLedger`, `inboundLedger.ts:327`, through a runtime document fork | 199 (13) |
| Garbage collector | 92 (14) |
| `persist`, `accountCapture.ts:259` | 57 (6) |
| `prepare`, `admittedWorkspace.ts:442`, through `forkWorkspaceHistory` and its undo-stack copy (`yjs.ts:599`, `:636`) | 48 (under 4) |
| `verifyDelivery`, `deliveryRecord.ts:205` | 36 (11) |

The validation chain runs `contentStore.ts:280`, `accountReceive.ts:273`, `inboundLedger.ts:86`,
`deliveryRecord.ts:145`, `spoolRecord.ts:225`, `sourceCapture.ts:117` and `contentCompaction.ts:57`,
which builds a new `Y.Doc` for every stored record. By self time the largest leaves are the random
client id each `new Y.Doc` draws (`getRandomValues`, 143 ms per key at 2,320 edits), byte-wise `hex()`
in `custodyCrypto.ts:22`, and byte-wise equality in `verifiedRecords.ts:3`; together with the hex
helpers in `account-protocol/recovery.ts:15` they are about 40% of CPU at every history size.

Ranked causes:

1. **Whole-ledger re-validation after every content-store transaction.** 134 ms per key fresh and
   789 ms per key at 2,220 edits, in single tasks that grew from 115 ms to 1,749 ms.
2. **Keystrokes queued behind those tasks.** Queue p95 of 79, 274, 686 and 1,392 ms across the four
   history points, against 0.5 ms on Local. This is the felt latency and the indicator flicker.
3. **Undo-stack copying in the Account's `reference` preparation.** The handler's p95 grows 4, 11, 22,
   56 ms with the session's edits, and its p50 was 68 ms once keys were no longer queued behind
   service work. Local at 1,200 edits is 3.7 ms.
4. **Constant factors inside 1:** hex, a `Y.Doc` per record, byte compares, and the garbage they make.

The network is not a cause. With the service stopped, IndexedDB-callback work was 747 ms per key
against 789 ms with it running. "Worse with sync" holds because the capture, spool and delivery
ledgers exist only on the Account path.

The synchronous fork, comparison and snapshot work that the September experiments targeted is not the
main desktop cost on this small workspace: the handler is about 3 ms p50 on a fresh account.

## Limits

- One host under background load, one device, one run per condition, no remote edits, no cold reopen.
  That the growth survives a reload is inferred from the stored rows, not measured.
- Headless Chromium has no vsync, so paint has no frame floor here.
- Playwright waits for each key to be processed, so saturated blocks ran slower than the requested
  cadence (see the gap column). A person who keeps typing would see worse; treat those latencies as
  lower bounds.
- The workspace is small. The 20-day corpus the September gate used was not seeded, so costs that
  scale with workspace size were not exercised.
- The operator's real account was not inspected, and the public service was not driven.
- The first account run stopped at 320 edits because the probe clicked before the Goals text was
  accepted. Its two blocks agree with the second run and are kept in `account-run1/`.
- Copies here have the session's scratch directory replaced by `<scratch>`. After the run the probe
  scripts were formatted and two unused bindings removed; the formatted `stable.mjs` reproduces
  `stable-text.txt` exactly. Traces and CPU profiles (about 270 MB) were left in that scratch
  directory and are not retained.
