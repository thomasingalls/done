# What stands between the switched-off automatic history and shipping it

A delegated agent's report from 2026-11-11, filed as delivered. Read-only at `2277ef5db`, with probes run in a copy. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** Its phase 539 finding was fixed in phase 546 and its manual-flow findings in phase 547. Its statement that some devices never fetch history holds only where the service omits the capability flag; see report 15.

---

## Automatic service history pruning: what the code does today, and what has to change before it can be switched on

Read-only investigation at tip `2277ef5db`. I changed nothing in the worktree. Probes ran in a `git archive` copy, which I have deleted. The probe sources are kept in `/private/tmp/claude-502/-Users-thomasingalls-Code-done--claude-worktrees-l2-onboarding-863db1/a2cb3ea1-c2ed-4b47-b08f-dc5bb9d6e506/scratchpad/auto-history/probes/`.

For `src/crdt` files I read `git show HEAD:`. `git status` now shows the other agent's edits in `src/crdt` and `docs/decisions.md`. I re-checked that the decision line numbers cited here match HEAD.

**Labels used throughout:**
- **[read file:line]** — verified by reading at HEAD.
- **[run]** — verified by a probe in the copy:
  - **P-sched**: the real scheduler, with owner results shaped as `runHistoryMaintenance` returns them.
  - **P-race**: the real client and the real in-process service, using a single credential to stand in for two devices.
  - **P-hold**: the real local-retention scheduler with mocked inputs.
- **[inferred]** — a conclusion I drew but did not verify.

### Headline findings
1. **Two devices creating at once can jam both of them.** [run P-race + read] The loser keeps a saved proposal it can never publish. In a two-device account the winner's proposal then waits for the loser to verify it, and the loser never can. Nothing in the automatic path discards. The manual view hides Discard in that state, so a person cannot clear it either. The race is likely, not rare: both devices see the same growth and go quiet at about the same time [inferred].
2. **There is an undocumented ceiling on snapshots.** `HISTORY_REPLAY_EVENTS = 4096` [read src/crdt/historySource.ts:48, 430]. Create and verify both replay every accepted position since the previous snapshot. For an original device's first snapshot, that means every position since genesis (`baselineHeads = []`, :132, :241-262). Past 4,096 positions, snapshots become permanently impossible. No test exercises this bound.
3. **A pending proposal stalls sync on unreduced devices.** A waiting proposal blocks local reduction as `durable-attempt` [read src/crdt/retentionAttempts.ts:18-31; accountReceive.ts:1076-1087, 1098]. Combined with phase 539's hold, P-hold showed send and receive held 83% of every hour (5 minutes on, 1 minute off) on a full-check device [run, mocked inputs]. This also affects the manual flow.
4. **The phase 544 notes are confirmed, with detail.** [run P-sched]
   - Every new owner lifetime issues `inspect` then `prune` for an unchanged sequence of 2 or more.
   - A prune refused as `tooLarge` halts as `owner-error`, again in every lifetime.
   - A `create` refused as `tooLarge` is retried each time there is 1 hour plus 1,024 records of growth: 4 creates in 3 simulated hours.
   - A pending snapshot too large to verify gets `inspect` plus 3 `verify` calls per turn, then parks silently.
   - The status never carries `tooLarge`.
5. **Nobody sees the automatic status.** The port reaches the page (`accountSessionBridge.ts:523`) but no file in `src/ui` reads it [read, git grep]. Every service refusal reaches the client as "unavailable": the service answers 409 [account-service/scoped-http.ts:347-349] and any non-200 becomes `HistoryTransportUnavailable` [src/account/historyHttp.ts:61-70].

---

## 1. What the automatic path does today when enabled

**Switch.** It is a build-time client flag, `VITE_ACCOUNT_HISTORY_AUTO`. The Dockerfile default is 0 [Dockerfile:18,25; vite/accountRetentionFlags.ts:35,48]. There is no service-side switch and no per-account switch.
- It is only wired for a composed scoped-access owner that is not detached [read accountReceive.ts:3994-4000].
- The scheduler only chooses which existing command to run. Every effect is a call to `runHistoryMaintenance` inside `runCaptureTask`, the serialized storage tail [accountReceive.ts:3241-3309, 3785-3801].

**Readiness.** All of these must hold [accountReceive.ts:4005-4016]:
- both sync lanes quiet ("blocked" counts as quiet, :4163-4166);
- no manual history command running, and local reduction not running;
- `gate()` ready: active, durable, no storage pressure, online;
- no passkey re-login needed; pending items 0; page visible.

There is no metered-connection, battery or session-length check.

**What wakes it** [read :4023-4042, 4066-4067, 4182-4183, 4216-4217; automaticHistoryMaintenance.ts:229-243]:
- Opening the owner: one `inspect` after 10 s of quiet, even with no growth.
- Input (keydown, beforeinput, pointerdown, visibilitychange) and workspace changes reset the 10 s quiet window.
- Status changes re-check readiness.
- These count as hints: a control notification (any non-`content` event; the service sends one when publish, admit or discard changes the catalog [scoped-http.ts:350-361]), coming back online, a login change, and the end of a manual history command.
- There is no periodic poll.

**Trigger for `create`** [automaticHistoryMaintenance.ts:71-103]:
- At least 1,024 records of growth in the device's **local ledger** since the last create in this owner lifetime, and at least 1 hour since that create.
- Growth starts at the whole current local suffix when the owner opens (`observed` is undefined, so `added = records`).
- `lastCreate` resets on every open.
- It is not a measure of service history.

**One turn** [:146-187]: an `inspect`, then up to three more commands:
- If the status is `resume` or `verify`, run that command.
- Otherwise, if the sequence is 2 or more and higher than the last sequence pruned in this lifetime, `prune`.
- Otherwise, if growth allows, `create`.
- A status of `waiting` or `stale` ends the turn and parks (reason `peer` or `stale`).
- `discard` is never issued (`AutomaticCommand` excludes it, :21).

**State.**
- In memory, per lifetime only: quiet and backoff clocks, `lastCreate`, the growth counters, the last pruned sequence, the failure count, `waitForEvent`, and a copy of `{sequence, pending, canDiscard, pruned}` with `tooLarge` dropped (:128-145).
- Durable: only the existing encrypted custody `history` progress (catalog, saved attempt and admission, discard intent) [historyMaintenance.ts:34-47].

**By account shape** (one person per workspace, PRD §2.2, so "members" are that person's devices; a multi-member workspace is the same as multi-device):
- **One device.** `members.length === 1`, so the producer admits its own snapshot [historyMaintenance.ts:294, 309-320]. `inspect`, `create` (publish and self-admit), and later `prune` once the sequence reaches 2 all run unattended.
  - Each snapshot replays the history **twice**: `prepare` and `admit` both call `replay` [read historyOwner.ts:151-187].
  - This device never installs its own snapshots: `historyRequired` is false at epoch 3 or below and generation 1 [accountReceive.ts:1717-1724].
- **Two devices.**
  - The producer publishes, gets `waiting`, and parks. Its saved attempt stays and blocks its own local reduction.
  - The other device verifies (cold replay and admit) when it is open, visible and quiet and receives the hint or reopens.
  - The producer clears its attempt on its next turn: `resume` reconciles because the service returns the admitted record.
  - After that, **each device** prunes once per lifetime.
  - Waiting for the other device to come online is unavoidable. Racing is likely (headline 1).
- **Three or more.**
  - Any non-producer can admit. If two verify at once, the loser gets `admission-conflict`, retries after an event, and then `resume` reconciles. This heals itself, at the cost of one wasted replay [read service :485-494; client :331-345].
  - The loser of a concurrent create is stuck with a stale attempt [run P-race].

**Failure handling** [read :189-202; accountReceive.ts:4019-4020]:
- **Retried:** `HistoryTransportUnavailable` and `HistoryReceivePending`. Backoff is 1, 2, 4, 8, then 16 minutes, and a retry happens only after a new event (`waitForEvent`). This covers network errors, the 10 s request timeout, and **every service refusal** (`checkpoint-busy`, `sources-changed`, `checkpoint-too-large`, `retention-boundary-changed`, `state-changed`, `unavailable`, `ledger-integrity`).
- **Halted for the rest of the lifetime (`owner-error`):** any other error. That includes ordinary races between devices:
  - "History advanced while reading" [historyMaintenance.ts:348-352];
  - "Pruning requires two unchanged admitted snapshots" [:361-369];
  - "History advanced during preparation" [historyOwner.ts:98-99];
  - the 4,096 replay bound;
  - `HistoryReplyRefused`.

  Only reopening clears a halt.
- **Custody refresh failure** after any history command closes the whole account session [accountReceive.ts:3288-3291]. Under automation that happens with nobody present [inferred risk].
- **Lock or close:** the in-flight work is aborted, and a prepare that had not yet saved is lost.

**What still needs a person:**
- opening the other device in a two-device account;
- discarding a stale proposal (membership or sources changed); this blocks creation on every device, because the service refuses to publish while one proposal is pending (`checkpoint-busy`);
- discarding an oversized or unpublishable saved attempt — for the race loser the view offers only Resume (headline 1);
- reopening after any halt.

---

## 2. Why each step and wait exists

| Step or wait | Source | Inherent or only interface | Property protected, against whom |
|---|---|---|---|
| A different device must admit when one exists; the producer admits its own only when it is alone | P-8 (2026-08-26, docs/review/remediation/decisions/P-8-checkpoint-and-creation-authority.md:32-55); S0-5 return (2026-08-28); TRD §7.6 (docs/TRD.md:1414-1565); row 7 (docs/selections/row-7-checkpoint.md:96-107); first built 2026-10-09 (account-history-management.md:29-33) | **Inherent:** another device has to come online and replay. The clicks are only interface. | The accepted-head baseline. Coverage itself is re-derived by every restorer, but whether the heads stop where the snapshot stops cannot be checked once trim removes the events: "a fresh restorer's confidence in that baseline is exactly its confidence in the admitting credential". Protects against one compromised admitted credential, or "an encoding or selection bug … as readily as a malicious producer". The content-blind service cannot check it. Remaining risk: producer and verifier colluding (P-8:86-99). |
| Admission is signed before any trim | TRD §7.6; P-8 requirement 7 | Inherent | Same as above |
| Two admitted snapshots before a prune; the floor is the **previous** snapshot's cut | Row 7 §5 (:229-234); TRD §7.6 and §11.3 test 8 (TRD:2451-2452); account-history-management.md:39-40, 434-457; commit `5e47a043a` (2026-10-09); service floor at historyCheckpoint.ts:566 | Inherent as a rule. Under automation it is only one snapshot interval of lag, not a person's wait. | Continuity: fall back to the next-newest when "the store holding the newest checkpoint [is] unavailable", or when the newest tuple lacks bytes, admission or opener. Against an unavailable or faulty durable store, or local loss. Availability, not confidentiality. |
| Snapshot bound to the epoch head; stale after a membership change | S0-5 return (verifier resolved from the certified set at the manifest's epoch); account-history-management.md:94-96 | Rebuild is inherent. **Discarding a stale proposal is not**: any current device may discard once the epoch head changed [service :516-522]. | Eligibility resolution |
| `sources-changed`: a handoff published mid-attempt forces a rebuild | account-history-management.md:154-159 | Inherent | Completeness: no writing silently left out |
| One pending slot (`checkpoint-busy`) | Catalog design, account-history-management.md:87-88 | Protocol choice, not security | Serializes advance against the admitted parent |
| Create and verify take 6-14 s per 1,024 positions | Network reads inside the storage tail; 8 positions per request (`READ_COUNT_LIMIT`, account-protocol/deliveryTransport.ts:10), one request at a time; the history replay passes no `readBatch` [historyOwner.ts:54-68, 120-134] | Implementation | — |
| The producer must re-inspect after the peer admits, or its local reduction stays blocked | historyMaintenance.ts:301-311 | Interface | — |
| Manual buttons; automation off | Operator chose an explicit Account-menu action and "Automatic cadence remains off until maintenance cost is observed" (account-history-management.md:107-108, 2026-10-09); phase 126 decision (decisions.md:5795-5803) | Interface | — |

---

## 3. Gap list, ranked

1. **Concurrent creation jams devices** (two-device deadlock; stale attempt with three or more).
   - Fix: re-read the catalog after `prepare` and before saving the attempt; on a definite refusal, discard your own unadmitted attempt; offer Discard whenever an unadmitted attempt is saved; add jitter before creating.
   - Size: S-M. Touches `historyMaintenance.ts`, `historyHttp.ts` (parse the 409 body's refusal, which the service already sends), `automaticHistoryMaintenance.ts`, `AccountHistory.tsx`.
   - **Amends** the phase 126 decision (2026-10-27): "no automatic discard". That rule assumed discarding could destroy manual work in progress; that does not hold for a definite refusal.
2. **The 4,096-position replay ceiling.**
   - Snapshots, and therefore pruning, are impossible past it. Existing accounts may already be past it, and the first automatic create would halt them.
   - At minimum: detect it and say so. To remove it: a larger bound (needs memory and time evidence) or chunked replay.
   - Size: S to detect, L to remove. Touches `historySource.ts`. Amends nothing recorded; the constant is undocumented (commit `4d3d70c2b`).
3. **Storage-tail occupation** (recorded activation blocker 1, docs/account-service-history-automatic.md:58-67).
   - Phase 332 measured input p95 of 5.6-8.3 ms during the tail on a lab desktop.
   - Not measured: the outbound send also runs in the tail (`run: runCaptureTask`, accountReceive.ts:~3166), so edits typed during a create are probably delayed for its whole duration [inferred]. Peer p95 during create or verify, and phones, are unmeasured.
   - Fix: move history network reads to `runNetworkTask`, or make preparation preemptible.
   - Size: L. Satisfies the phase 126 gate rather than amending it.
4. **A pending proposal blocks local retirement** (recorded blocker 2), plus the hold interaction (headline 3).
   - S: treat `durable-attempt` as parked until the history progress changes, and never hold sync for it. **Amends** phase 539 (decisions.md:8496).
   - M-L: removing the block itself **amends** phase 126 ("no weakening the local retirement pin").
5. **`tooLarge` is ignored in the automatic path.**
   - Fix: keep `tooLarge` in the status and park on it; check the local document size before replaying; discard your own oversized saved or pending proposal.
   - Size: S.
6. **A prune every lifetime on every device.** Each one downloads the latest snapshot twice, the previous once and any pending once [historyMaintenance.ts:346-347, 359-360; service :455-458]. That is about 11 MiB per open near the install bound [inferred from phase 544 sizes]. It also costs a full census on the service and wipes the verification cache for every account (service historyCheckpoint.ts:140, 686; core.ts:706-714).
   - Fix: prune once per sequence, done by the admitting device; the service short-circuits a prune with nothing to do; scope the cache wipe (already approved).
   - Size: S.
7. **No reader-progress check before a prune.** [read client :356-380; service :530-598] Devices with `historyRequired` false never fetch history [accountReceive.ts:1717-1724].
   - Size: M-L. Depends on the sibling agent's findings.
   - A service-kept reader mark would be a new data class needing a TRD §16 row (PRD §7.11 constraint 6).
8. **The trigger measures local ledger records, not service history.**
   - Also: equal heads are allowed [account-protocol/historyCheckpoint.ts:248-256], so a snapshot covering no new positions is possible [inferred]. Replace the metric with positions since the latest snapshot (section 4).
   - Size: S-M. **Amends** phase 126 (1,024 records and 1 hour per lifetime).
9. **No visibility.** No surface for the automatic status, refusal codes collapsed, a halt only clears on reopen, and `durable-attempt` shows the default "Automatic maintenance is on…" [read src/ui/LocalHistoryMaintenance.tsx:105-113].
   - Size: S-M.
10. **No phone guards.** No metered, battery or session-length check. Per-lifetime resets repeat wasted work. Uploads near the bound meet the 10 s timers.
    - Size: M.
11. **Stale proposals are never discarded automatically.** Size: S. Amends phase 126.
12. **No service kill switch or rate limit** for automatic clients. Size: S-M.
13. **Thin CI coverage.** `test/packaged-account/automatic-history.spec.ts` and the `test/account-history` client, service and pruning node tests are not in CI [read .github/workflows/ci.yml:66-126]. Size: S.
14. **Install bound of about 1.33 MiB, and about 4P baseline cost** (P = snapshot plaintext). Size: L. **Amends** phase 544 (2026-11-11, "Keep the install bound").

---

## 4. Trigger policy

**Metric.** S = sum over publishers of (current accepted head − latest admitted snapshot's cut).
- Every authenticated history page carries the current `heads` [service :601-612].
- A catalog read carries no snapshot ciphertext (`service.test.mjs` case "catalog reads authenticate the current pointers without downloading checkpoint content").
- The latest snapshot's heads can be cached from its manifest and checked against the catalog hash.

**Create** when S ≥ 1,024, as a provisional number.
- Show an "overdue" state at S ≥ 2,048, and an alarm at about 3,500, before the 4,096 ceiling.
- Check document size against the install bound before replaying.
- Wait a random 0-120 s, then re-check the catalog after `prepare`.

**Admit** as today: any non-producer device, on a hint or on opening.

**Prune** only when all of these hold:
- sequence is 2 or more and the latest snapshot is installable;
- newly coverable positions (previous cut − the prior previous cut) are at least 1,024;
- the reader-safety condition from gap 7 holds.

Done once per sequence by the device that admitted. No timers except backoff and rate limits.

**Grounding (phase 332, lab Chromium, small corpus, 1,024 positions;** docs/performance-experiments/2026-10-29-worker-catchup/phase332/README.md):

| | 0 ms RTT | 50 ms RTT |
|---|---|---|
| Create | 7.86 s | 14.4 s |
| Verify | 5.85 s | 13.95 s |
| Returning device catch-up, plain drain | 18.9 s | 26.2 s |
| Returning device catch-up, installing the snapshot | 2.36 s | 2.76 s |

- Snapshot sizes: 17,741 B ciphertext, 38,281 B checkpoint JSON, 41,642 B response body.
- About +6.6 s per +50 ms of RTT, which matches roughly 128 one-at-a-time requests (1,024 ÷ 8).
- Phone estimate [inferred]: at 150 ms RTT the round trips alone are about 19 s per replay; a single-device snapshot does two replays.
- Install bound about 1.33 MiB plaintext (phase 544).
- Baseline carries about 4P for the **latest** installed snapshot only. It replaces rather than accumulates [read localBaselineRecord.ts:84; phase 542 README:7]. Only devices with `historyRequired` install.
- The operator's phone held about 4,622 heads rows and 6,318 outbound rows (phase 119), so real accounts are in the thousands of positions.

**Cost of one snapshot:**
- **Producer:** replay S plus open the previous snapshot; encode the document; encrypt and sign; upload about 2.2P of JSON within 10 s. A single-device account does it all twice.
- **Verifier:** replay S plus download the latest snapshot.
- **Devices that install history:** download about 2.2P; install 3P in one 4 MiB batch; net +4ΔP in the next baseline.
- **Service:**
  - up to three retained ciphertexts;
  - every exchange re-verifies latest, previous and pending (O(P));
  - publish and admit run a full census, and every mutation wipes the shared cache;
  - a prune signs each covered row and updates every row in one `BEGIN IMMEDIATE` transaction;
  - each catalog change sends a hint, and every open device then inspects.

**Measure before trusting the numbers:**
- create and verify time and memory for S of 1,024, 2,048 and 4,096, and for document size up to the bound, on desktop and phone;
- install time and memory against P, and the next reduction's cost;
- service prune and publish time against row count, and with the cache wipe;
- peer p95 during create and verify;
- phone session length against create time;
- how many accounts are past 4,096 positions or 1.33 MiB — measured on the device, since the operator declined request logging.

---

## 5. Safety and failure behaviour under automation

- **A device offline for a long time.** The producer waits with no limit. Its reduction is blocked, and its sync is held on a full-check device. Nothing tells the person.
  - Fix: show "waiting for another device to verify", stop the hold, and discard your own waiting proposal when it goes stale or is superseded.
- **Two devices creating at once.** See gap 1 for the fix.
  - [run P-race] The loser saved its attempt; `publish` was refused `checkpoint-busy` while the winner was pending, and `unavailable` once the winner's parent had moved. `inspect` then says `resume` (it takes precedence over `verify`, historyMaintenance.ts:286-296), with `canDiscard: false` when there is no pending proposal. `resume` was refused again. `discard` works, but the view hides it.
  - [run P-sched] The automatic path loops `inspect` and `resume` on each hint with reason `connection`, and never discards.
- **Workspace too large to snapshot.** Park for good, with one sentence. Check before replaying. Never halt.
- **Phone retries.** Gate on estimated duration and `saveData`. Keep scheduler state outside the lifetime, or derive it from S. Discover state with catalog reads.
- **A prune that would strand a device.** Today nothing prevents it. See gap 7 and the sibling agent's findings.
- **How the person finds out.** Add one status line in Data, drawn only from what the device knows:
  - catalog sequence and S;
  - waiting, stale, too large, overdue or halted;
  - the named refusal code and the last success.

---

## 6. What automatic log pruning does not solve

The document is Yjs with `gc:false`. A snapshot is the full state, deleted content included, and each snapshot must cover the one before it, so snapshots only grow.

Past about 1.33 MiB of state (less four thirds of the coverage vectors) no snapshot can be made, so service history can no longer be pruned. Devices that installed a snapshot near that size park reduction at about 1.33 MiB of document (4P + 2D under the 8 MiB ceiling). Enrollment is separately bounded at 4 MiB. Log pruning delays the problem; it does not remove it.

**How this relates to compaction:** only discarding old deleted content shrinks P. A compacted state breaks the rule that each snapshot covers the previous one, so compaction needs its own baseline type and a decision (TRD §10.4).

---

## 7. Staged plan

**Existing test coverage.**
- `test/automaticServiceHistory.test.ts`: 16 unit cases, in CI. Covers opt-in, quiet, cadence, parking, backoff, halt, and pruning only after two snapshots.
- `test/packaged-account/automatic-history.spec.ts`: 2 cases, not in CI. A single device creating, admitting and pruning; a two-device peer admitting.
- `vite/preparationBuildFlags.test.ts` and `vite/rangeBuildFlags.test.ts`: flag plumbing.
- `test/accountSessionBridge.test.ts`: status bridge.
- None of them cover `tooLarge`, races, the 4,096 bound, the hold interaction, phones, stale proposals or stranding.

| Stage | Change | Tests that prove it | Flag and rollout | Done when |
|---|---|---|---|---|
| 0 | Show refusal codes and a status line, including S | historyHttp unit; `accountHistory.test.tsx`; local history text | Client only | The operator's devices show S and the state |
| 1 | Manual-path correctness: re-check before saving, discard on refusal, Discard offered for a saved attempt, `durable-attempt` parks without holding sync, prune no-op short-circuit, scoped cache wipe | Race cases (like P-race) in `test/account-history/client.test.mjs`; hold unit; add the `account-history` node tests to CI | Service first, then client | Races resolve with no person; hold time 0 with an attempt saved |
| 2 | Automatic create and verify only: S trigger, `tooLarge` parks, size check before replay, phone guards; requires the storage-tail fix | New scheduler units; packaged spec in CI, plus three-device and short-session cases; peer-latency harness | Service kill switch first; then a client flag on the operator's devices; then everyone | On the operator's account for N days: zero halts, peer p95 ≤ 2.5 s during create and verify on desktop and phone |
| 3 | Automatic prune, once per sequence by the admitter, with the reader-safety rule | `pruning.test.mjs` cases; packaged returning device on a two-device epoch-3 account and a three-device account | Service first (short-circuit and safety), then a second client flag | A device offline across two cycles catches up on every account shape; prune time measured |
| 4 | Default on; the history view moves under diagnostics | — | — | The operator never opens it for N weeks |

---

## Decisions for the operator, with recommendations

1. **Keep second-device admission?** Keep it. Automation removes the clicks, not the wait.
2. **Let automation discard its own unadmitted proposals** when stale, too large, or definitely refused? Yes. This amends phase 126.
3. **Change the trigger** to positions since the latest snapshot, with 1,024 as a provisional number? Yes.
4. **The 4,096 ceiling:** detect it now; decide later between raising it and chunked replay.
5. **Reader safety before a prune:** prefer making a device that is behind install the latest snapshot, plus pruning only below cuts every device has proven. Avoid a reader mark kept on the service.
6. **The install bound:** accept that pruning stops for large workspaces, with a visible message, or approve the ciphertext-free install event? Approving it is recommended before automation is advertised.
7. **Phones:** they verify when they must; never create if another device can.
8. **Rollout:** service first (scoped cache, kill switch); create and verify before prune.
9. **Status line:** yes.

## Could not determine
- The operator's account: number of devices, epoch, whether it installs history, total positions, S, P, and whether it is past 4,096.
- The ratio of local ledger records to service positions.
- Phone timings, install cost for a large P, and service prune time.
- Whether the hold interaction appears in the real owner (P-hold used mocked inputs).
- Whether agent credentials count as eligible admitters.

## Depends on the sibling agent
- Stranding of devices that are behind, and devices with unsent edits: gap 7, stage 3, section 5.
- The full list of service refusals: I only verified that every refusal arrives at the client as `HistoryTransportUnavailable`.

## Looks wrong outside the question
1. **The manual flow can strand a person** with an unpublishable saved attempt and no Discard button [run].
2. **Any saved attempt makes phase 539's hold stall sync** on full-check devices; the attempt can be history, approval or rotation progress [run, mocked].
3. **`durable-attempt` shows the default local-history sentence**, so the cause is hidden.
4. **All refusals collapse to "unavailable"** on the client.
5. **The 4,096 replay ceiling** is undocumented and untested.
6. **Snapshots with equal heads are allowed.**
7. **A single-device snapshot replays twice.**
8. **In a two-device account, the device that is behind downloads its backlog twice:** once for the admission replay and once for the live drain, because it does not install history [inferred].
9. **A custody-refresh failure** in a history command closes the account session.
