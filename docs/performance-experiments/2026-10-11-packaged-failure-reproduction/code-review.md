# Independent review of `343c4bce..0332a9ea`

2026-10-10 and 2026-10-11. Read-only correctness review by a delegated agent of the Claude review
session, started without the session's hypotheses: it was given the two failure descriptions but not
the rate-limit theory. Nothing was run. It formed its hypotheses from code first and consulted retained
logs afterwards. `95923cd8` landed while it was reading; that commit leaves `src/crdt/*` identical to
`0332a9ea`, so those line numbers hold for both, and the two enrollment files are cited at `0332a9ea`.

**Bottom line.** No path in `343c4bce..0332a9ea` produces either failure. Both are explained by
unchanged code, and the three commits can only shift timing. The review also found three things in the
new code that explain neither failure but bear on activation.

## Demonstrable by reading

### 1. Late delivery: sender retry back-off outlives the fault (unchanged code)

- **Where:** `src/crdt/accountSyncDriver.ts:192-212` and `:245-248`.
- **Mechanism:** an `unknown` send result sets `due = now + min(1000·2^(failures-1), 30000)`, and
  `lane.dirty` is ignored when the result is retryable. A `local` wake only sets `due` when it is
  undefined. Only `online`, `authority` and `retry` wakes reset it (`:251-254`).
- **Sequence** (`test/packaged-account/history.spec.ts` at `0332a9ea`, lines 75-155):
  1. The first device's submit is aborted from line 75; its first failed attempt follows `add()` at
     line 77 (call that t1).
  2. Further attempts fall at t1+1, +3, +7, +15, +31 and +61 s.
  3. The first device is never reloaded and never offline. `pair.other.setOffline(false)` at line 148
     only reaches the second device's context, so the first device gets no `online` wake.
  4. After `unroute` at line 149, the queued position waits for the next scheduled attempt; `add()` at
     line 152 does not shorten it.
- **Failing windows:** the 15 s check at line 153 fails when the unroute lands just after the t1+15
  attempt, or in roughly t1+31 to t1+46.
- **Consistent with the retained logs:** `packaged-default.log` shows the 41.5 s run failing exactly at
  line 153, in the first-to-second direction only. The second device was reloaded twice and got an
  `online` wake.
- **Role of the three commits:** none in the mechanism; the driver is untouched.
- **Confidence:** high for the mechanism. The elapsed time in the retained failing run was not measured.

A receiver-side variant gives the same symptom with lower confidence: a `remote` wake is ignored while
`receive.failures > 0` (`accountSyncDriver.ts:238-241`); the receive step returns `unknown` before
reading any page when discovery fails (`src/crdt/accountReceive.ts:1937-1942`, `:1316`); and the
service has one global request bucket of 120 refilling at 2 per second
(`account-service/scoped-http.ts:160-162`, `:209-211`), whose exhaustion surfaces as `unknown`.

### 2. Enrollment: two grant invalidations exceed the single retry (unchanged code)

- **Where, at `0332a9ea`:**
  - `src/account/deviceEnrollment.ts:887-897`: `operate` retries once on `NetworkAuthorityChanged`; a
    second one propagates.
  - `src/account/scopedTransport.ts:353-359`, `:370-371`: an `authority-changed` denial evicts the
    grant and throws without re-acquiring.
  - `account-service/grants.ts:47-50`, `:396-397`: the grant fingerprint covers the `content_transfers`
    row and `promotions.successor_head`.
  - `account-service/contentTransfer.ts:164`, `:170-173`: `deliver` inserts the transfer row; `install`
    updates it and `successor_head`.
  - `src/ui/AccountEnrollmentApp.tsx:204`, `:235-240`: the error is shown and polling is disabled while
    `error` is set.
- **Sequence:**
  1. The approver clicks "Compare and approve"; `decide` then `deliver` succeed, and `deliver`
     invalidates the approver's own grant.
  2. The next request gets 409; `operate` retries under a fresh grant.
  3. The candidate's `install` commits between that grant and the approver's next `ceremony/transfer`.
  4. The second 409 escapes `operate`; the UI shows the alert and stops polling.
- **Why the three commits cannot produce it:** nothing in `src/account`, `src/ui`, `account-service` or
  `account-protocol` changed. As far as the review can tell no receive owner is open during the
  ceremony. The vault path only reaches changed leaf code (`hex`, `sameBytes`,
  `validateContentUpdates`, default-argument `verifyDelivery` and `verifyInboundLedger`), which behaves
  identically there.
- **Confidence:** high.

## Findings in the changed code (none explains either failure)

### 3. An unrecorded self-read decision becomes receive-lane back-off (`d5763346`, both modes)

- **Where:** `src/crdt/accountReceive.ts:1846-1859`. The result of `outbound.recordResponse` is
  discarded and the step returns `kind: received.kind`. `src/crdt/accountReceiveDriver.ts:219-231`
  then classifies "not empty, no progress" as `unknown`.
- **Sequence:** the service holds an own position beyond the local accepted prefix, and `record()`
  declines it (`src/crdt/accountDelivery.ts:235-245`: no expected position, unverified evidence, or
  conflict). Every sweep then stops at the self publisher with `unknown`. Back-off grows to 30 s, peers
  are read once per back-off, and remote wakes are ignored.
- **In these journeys:** not triggered, because `route.abort()` stops the submit before it leaves the
  browser.
- **Check:** at failure, the second device's `sync.status.receive.failures` should be 0; a non-zero
  value on the self publisher's turn would point here.

### 4. Latent: overlapping verifications can install a zero-filled view (`4500d9b6`)

- **Where:** `src/crdt/verifiedRecords.ts:93-127`. `verify` no longer clears first; the extend result
  aliases the live `value`, and `finally` erases it.
- **Sequence:** verify A starts with a slow extend; verify B starts with an empty delta before A
  resolves. A loses on `at !== revision` and zero-fills buffers B is still extending from. B can then
  install a view whose old submissions and sources are zeros.
- **Reachability:** believed unreachable today. Every `load` runs on the single storage tail
  (`src/crdt/accountCapture.ts:239-261`), and `task.wait` always awaits its inner promise
  (`src/crdt/writeSession.ts:154-162`).
- **Check:** a unit test on `createVerifiedRecords` with that A/B ordering.

### 5. The incremental path skips the installed-authority boundary check on appended events (`4500d9b6`)

- **Where:** `src/crdt/incrementalAccountLedger.ts:323` only checks that the epoch does not regress,
  and only when `route.history` is set. The reference requires the exact post-cut epoch
  (`src/crdt/accountSuccessor.ts:181-190`).
- **Sequence:** right after adoption, before any new-epoch event exists, a row at the old epoch passes
  the extension and is refused at the next cold open or audit.
- **Reachability:** honest writers cannot produce it (`accountReceive.ts:818-819`, `:1040-1041`,
  `:1195-1196`).
- **Effect if it happened:** a repair-required close on reopen, not a missed delivery.
- **Check:** a native test appending a hand-built stale-epoch delivery row with audit off, then
  reopening.

## Suspicion

### 6. Strict selection validation could block admission with the switch on (`0332a9ea`)

- **Where:** `src/crdt/admittedWorkspace.ts:161-164`, `src/crdt/selectionSnapshots.ts:31-51`.
- **Sequence:** a selection key or shape that fails `validate` makes `prepareWorkspace` throw.
  Admission blocks, the gate reports `local-storage` (`accountReceive.ts:1800-1801`), and both lanes
  pause.
- **Against it for the delivery failure:** the first device admitted the text, and Local already uses
  the same validation.
- **Confidence:** low. **Check:** capture `workspace.status.pressure` on both devices at failure.

## Checked against the hazards it was asked about, and found sound

- **View surviving invalidation:** cleared on successor and membership adoption
  (`accountReceive.ts:1035-1039`, `:1190-1194`) and on dispose (`:470-474`). History installs force the
  full verifier (`incrementalAccountLedger.ts:249-265`). Compaction needs content equivalence
  (`:235-239`, `src/crdt/inboundLedger.ts:382-390`).
- **Lost progress:** the own prefix is recomputed from retained decisions on every validation
  (`src/crdt/accountSyncState.ts:36-110`); no cursor is stored. The two lanes never run concurrently.
- **Aliasing:** every `verified.read` or `readIfMatches` result is cloned. `verifyProposed` works on a
  clone and copies proposed rows (`accountReceive.ts:1473-1507`).
- **Duplicate and conflict classification:** `capturedSourcePresence` matches the old catalogue loop,
  including in-batch duplicates (`src/crdt/sourceCapture.ts:186-198`, `accountCapture.ts:281-290`).
- **Disk disagreement between modes:** none found. No format or writer differs; selection tokens are
  memory-only.

## Changed code that runs with the switch off

- `advanceSelfReceive` in every full verification (`accountReceive.ts:363-366`).
- The self-read path and `selfOnly` (`:829-833`, `:886-899`, `:1846-1859`).
- The restructured `verify` without pre-clear (`verifiedRecords.ts:93-127`).
- The rewritten coverage index and `bind` (`inboundLedger.ts:251-432`).
- The restructured journal `persist` (`accountCapture.ts:274-324`).
- `withSelection` and `selectDelivery` fallbacks (`accountDelivery.ts:127-149`).
- `hex`, `sameBytes`, the fixed-GUID validation document, and the always-on `countLedger` and
  `measureLedger`.

Switch-only: `extendAccountLedger`, `indexVerifiedLedger`, the audit, `verifyProposed`,
`selectVerified`, `sourcePresence`, and `account-snapshots`.

## Coverage

- **Read closely:** the full diff of `accountReceive.ts`, `accountSyncState.ts`,
  `incrementalAccountLedger.ts`, `verifiedRecords.ts`, `inboundLedger.ts`, `deliveryRecord.ts`,
  `accountDelivery.ts`, `accountCapture.ts`, `accountEnvelopePreparation.ts`, `contentStore.ts`,
  `contentCompaction.ts`, `sourceCapture.ts`, `custodyCrypto.ts`, `selectionSnapshots.ts`. Also,
  unchanged: `accountSyncDriver.ts`, `accountReceiveDriver.ts`, `accountInbound.ts`,
  `accountSuccessor.ts`, `verificationMemo.ts`, `scopedTransport.ts`, `notifications.ts`, and the
  history spec and helpers.
- **Skimmed:** `admittedWorkspace.ts`, `admissionQueue.ts`, `yjs.ts` selection history,
  `spoolRecord.ts`, `historyInstall.ts`, `historyOwner.ts`, `accountCatchup.ts`,
  `deviceEnrollment.ts`, `AccountEnrollmentApp.tsx`, and service `grants.ts`, `contentTransfer.ts`,
  `ceremony.ts`, `enrollment.ts`, `delivery.ts`, `scoped-http.ts`.
- **Not reached:** `account-protocol` internals (history decisions, admission history), `custody.ts`
  seal reservations, journal store flush, content rotation, `accountRotation.ts`,
  `membershipSource.ts` and `joinedAccount.ts` beyond grep, history checkpoint and source,
  `forkRuntimeDoc`, the new tests' bodies, and the experiment `protocol.md` files.

## Checked afterwards

Re-read by the coordinating session at `0332a9ea` and found as described:

- **Finding 5.** `incrementalAccountLedger.ts:323` is
  `if (route.history && epoch < indexes.epoch) captureError(...)`, a non-regression check, where
  `accountSuccessor.ts:182-190` requires an exact epoch by position relative to the cut.
- **Finding 3.** `accountReceive.ts:1849-1858` awaits `outbound.recordResponse` without using its
  result and returns `{ kind: received.kind, recorded: false }`.
- **Finding 4.** The structure of `verify` at `verifiedRecords.ts:93-127` is as described: a revision
  counter, `extend(previous, before, candidate)`, and `eraseVerified(result)` in `finally`. Whether the
  extend result aliases the live value, and so whether the hazard is real, was not independently
  confirmed.

Against the reproduction:

- **Both mechanisms agree with what was measured.** The enrollment sequence is exactly the ordering
  that separates all 62 pairings. The retry schedule matches the measured abort times.
- **The failing window for delivery was not reached** in any run; the blocked phase lasted
  8.7–10.4 s.
- **Findings 3 to 6 were not exercised** by the reproduction and remain reading-based.
