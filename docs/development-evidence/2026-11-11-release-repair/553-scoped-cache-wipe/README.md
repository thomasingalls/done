# Phase 553 — a history request retires only its own account's verification

The operator approved scoping the history route's cache wipe on 2026-11-11 ("Yes, scope it"), from [investigation 12](../investigations/12-service-concurrency.md). The coordinating session asked for it on 2026-11-12, together with the submission bug the same report found. Approved and built:

- publish, admit and discard stop clearing the verification cache at all;
- a prune invalidates only the pruned account's publisher keys;
- a submission that meets a cleared authority proof retries, as reads do.

Not approved and not touched:

- keeping the pruned account's own tips across a prune;
- the other error-path clears (SVC-ERROR-CLEARS);
- the cost of a prune's commit (SVC-PRUNE-COMMIT);
- workers.

The operator declined request and cache-wipe logging on the service (SVC-NO-LOGS), so every count below comes from the service's own verification status, the test's hooks and its crypto boundary. Nothing is logged.

## What was wrong (read in code, reproduced on the base tree)

**Every history request wiped the cache for every account.** At `6e88b46e0`, `exchangeHistoryCheckpoint` (`account-service/historyCheckpoint.ts`) called `reuse.clear()` for every action other than a read: once on entry (line 140), and again in the `finally` of each of up to four attempts (line 686).
- **What `clear()` does.** It empties the service's one verification cache (`deliveryVerification.ts:47-52`): every account's verified publisher tips, every authority proof and every row result. It also bumps the revision, so every verification in flight is discarded.
- **Publish, admit and discard had no reason to clear.** They write only the `history_checkpoint_*` tables. No tip or authority proof reads those tables: `snapshotWorkspaceAuthority` and `snapshot` in `delivery.ts` never touch them.
- **A prune changes one account's rows only.** It replaces covered ciphertext with signed receipts in that account's `delivery_decisions` and `publisher_decisions` rows, and leaves every other account's rows alone.
- **On the base tree** ([run](./base-tree-run.txt)), after each of A's seven history steps, B's next submit and read held 0 tips, ran one whole-ledger census of about 1,030 rows and re-verified its account authority. That took 621 to 750 ms, against 11 to 12 ms on the candidate. A's two devices each re-verified their whole stream after every step, not just after the prune.

**A submission turned a cleared proof into a refusal and a second wipe.** `decideSubmission` (`delivery.ts:1158-1162` at the base) answered `unavailable` and called `reuse.clear()` again when its authority proof was cleared while in use (`AuthorityCacheClearedError`). `readInbound` has retried that case since phase 30 (2026-10-23).

## The change

Three service files, 20 lines added and 3 removed:

- **`account-service/historyCheckpoint.ts`:**
  - the entry clear is removed;
  - for a prune, the account is noted once its snapshot is captured (line 228);
  - after every attempt, including one that commits and then fails to answer, `reuse.tips.invalidateAccount(account)` runs (line 691);
  - publish, admit, discard and the reads retire nothing.
- **`account-service/publisherTips.ts`: `invalidateAccount(account)`** (lines 158-165) retires every key of that account, using the existing `invalidatePublisher`:
  - the tip;
  - queued audits;
  - the capture owner, so the account's live captures fail their guard and a late census or audit cannot reinstall them.

  Other accounts, quarantine (`poisoned`) and cold lanes are untouched.
- **`account-service/delivery.ts:1161`.** A submission's verify-phase catch now `continue`s on `AuthorityCacheClearedError`, within the existing four attempts, before noting a diagnostic or clearing. Everything else in that catch is unchanged.

Authority proofs are no longer retired by any history request. A proof is keyed by the exact bytes of the authority header it verified, and no history request writes those bytes. A tip-less verification owner (only `test/account-liveness` builds one) keys its row results by their exact input bytes, so it needs no prune invalidation either.

## What is amended, and what is not

Recorded in [decisions](../../../decisions.md) on 2026-11-12.

**Amended:**
- **The invalidation line of the approved verified-tip policy, for pruning only.** The policy was approved on 2026-10-11; the line is at [plan.md](../../../performance-experiments/2026-10-11-service-verified-tips/plan.md) lines 17 to 18: "…membership changes, pruning, close and failed verification invalidate reuse". A prune now invalidates reuse for the pruned account, not every account.
- **What the code did beyond that line.** Publish, admit and discard also invalidated reuse; they no longer do.

**Extended:** the 2026-10-23 phase 30 rule, that a native read caller may retry only a typed revision clear, now covers the submission caller under the same conditions. Close, changed input, custody, signature, authorization and expiry stay hard refusals, and the four attempts stay.

**Not amended:**
- invalidation on other-connection writes (`data_version`), on membership changes, on close, and on failed verification;
- the error-path clears (`delivery.ts:1163, 1291, 1425, 1614`, `discovery.ts:110`, `successor.ts:234`), which still clear every account (SVC-ERROR-CLEARS);
- the full verification at first use after start-up;
- quarantine until restart;
- the off-path audits;
- the pruned account's own tips, which a prune still retires.

**One older expectation was aligned.** `test/account-service-delivery/publisher-commit-races.test.mjs`, "publication authority cache never revives an in-flight proof after clear", held a submission inside its authority proof, cleared the cache and expected `unknown` with four rows stored. It now expects the submission to be accepted after a second, fresh proof: `offers === 2` straight after it, and five rows. That second proof is the check that the in-flight proof is never revived. Its title, setup and other assertions are unchanged. With the aligned expectation, that case fails on the base tree, which answers `unknown` ([run](./aligned-test-base-run.txt)); the other 44 cases in the file pass there and on the candidate.

## Tests

**`test/account-history/cache-scope.test.mjs`, 6 cases.**

The set-up: two accounts on one in-process service.
- **Account A** has two certified devices (the phase 547 devices fixture) and runs the real `runHistoryMaintenance` commands. A1 writes 1,024 positions and A2 writes 512.
- **Account B** (the delivery fixture, on the same core) writes 1,024 positions.
- **A's snapshots.** Snapshot 1 covers 512 + 256 positions and snapshot 2 covers 1,024 + 512. A prune covers 768 rows.
- **Cost.** A cold census of one of these streams verifies 512 to 1,033 rows. Each case builds its own fixture, about 10 s.
- **The harness.** Cases 2 to 6 run the service's own `readInbound`, `decideSubmission` and `exchangeHistoryCheckpoint` on a second connection with its own verification owner, as the core composes them. This lets the test hold a prune at its last await and see the moment a read captures. Every write after set-up goes through that one connection.

1. **Seven history steps leave another account alone.** A runs publish, admit, publish, admit, publish, discard and prune through the core.
   - **After every step**, B's next submit and read keep B's tip, with no full census and no fresh authority proof. The authority proof is counted at `crypto.subtle.verify` by its `done/promotion-offer/v1` message.
   - **After publish, admit and discard**, A's two reads verify only the one row each device's last write appended.
   - **After the prune**, A's two tips are gone and B's remains. A's next reads run exactly 2 full censuses verifying 1,544 rows, every page is checked by the independent oracle, and 768 rows hold receipts. A then writes on with no further census.
2. **A read in flight across its own account's prune fails its guard and retries.**
   - The prune is held after it has verified and signed everything, at its last await. At that moment `db.isTransaction` is false.
   - The test takes three captures there, exactly as reads take them: A1's row 1 (to be pruned), A1's latest row (not pruned) and B's latest row.
   - A real read of A1's latest row then starts. Its capture releases the prune, so the order is: read captures, prune commits, read guards and fails, read retries and guards again.
   - The retry re-verifies A1 once and the page verifies.
   - The commit fence, asked inside `BEGIN IMMEDIATE`, keeps B's capture valid and refuses both of A's.
3. **Another account goes straight through a prune.**
   - While A's prune is held, B submits on the same connection and is accepted.
   - B's read captures, the prune commits, and B's read passes its guard first time.
   - The prune needs one attempt: B's write is outside its fence.
   - No full census runs; B's tip remains and A's two are gone.
4. **A submission retries a cleared proof.** A clear is injected while a submission replays its authority proof's custody checks.
   - The submission is accepted on its retry, which alone reaches the commit fence.
   - Only the injected clear runs.
5. **Quarantine is untouched by a prune.**
   - The test damages a row of A2's stream on the same connection. A read refuses it and quarantines A2. Then the bytes are restored.
   - A's prune is refused with `ledger-integrity`, prunes nothing and clears nothing.
   - The quarantine stays at 1, B keeps its tip, and the restored bytes are still refused until a restart.
   - The damaged read's own whole-cache clear is the held error path (SVC-ERROR-CLEARS); the test re-warms B after it.
6. **A prune that commits and then loses its reply.** The hook throws after commit.
   - The prune still retires A's tips and only those. B runs no census; A's two streams are re-verified once each.
   - A resent prune finds nothing more to replace and leaves B alone.

**On `6e88b46e0`**, with the three service sources reverted and the new tests kept ([script](./base-run.sh.txt)), all 6 cases fail ([run](./base-tree-run.txt)). Each failure shows the base numbers:

1. **Case 1.** After every step, B held 0 tips and ran 1 full census and 1 authority proof. A ran 2 full censuses, verifying 768 to 1,544 rows. B's submit and read took 621 to 750 ms.
2. **Case 2.** B's capture is refused by the fence (`other: false`), and 2 wipes ran.
3. **Case 3.** B's read retried with a full census (`guards: 2`, `censuses: 2`), and 2 wipes ran.
4. **Case 4.** The submission answered `unavailable` with no fence reached, and 2 wipes ran.
5. **Case 5.** The refused prune wiped twice, and B ran a census.
6. **Case 6.** No tip remained, B ran a census, and 4 wipes ran.

**Mutation controls** ([output](./mutation-controls.txt), [script](./mutation-controls.py.txt)). Each mutation was applied alone on the candidate and restored byte for byte. All 13 are detected. The base run and these controls used the new file before `oxfmt` changed the quotes of one title (case 3's), which is the only difference from the final file.

| | Piece removed or broken | Detected by |
|---|---|---|
| M1 | publish, admit and discard clear every account again at entry | case 1 |
| M2 | every non-read attempt clears every account again in its `finally` | case 3 |
| M3 | prune invalidates nothing | case 2 (the read does not retry; A's unpruned-row capture passes) |
| M4 | prune invalidates every other account instead of its own | case 3 |
| M5 | prune names its account by workspace id, which matches no key | case 1 |
| M6 | account invalidation retires tips but keeps capture owners | case 2 |
| M7 | only a prune that answered invalidates its account | case 6 |
| M8 | publish, admit and discard invalidate their own account too | case 1 |
| M9 | a submission answers `unavailable` on a cleared proof again | case 4 |
| M10 | a submission retries but clears the whole cache first | case 4 |
| M11 | account invalidation lifts that account's quarantine | case 5 |
| M12 | the prune holds its write transaction across its last await | case 3 |
| M13 | the commit fence skips its byte comparison | existing `publisher-tips` and `publisher-commit-races` (4 cases fail) |

**What the controls show about the fence:**
- **The byte comparison still matters on its own.** Under M3 the read did not retry, and A's unpruned-row capture passed, yet the capture of the row the prune replaced was still refused (`covered: false`). That is the fence's byte comparison alone, unchanged code.
- **Case 2 does not depend on it.** Under M13, case 2 still passes, because the account invalidation already refuses A's captures. Four existing cases catch M13.

## Kept, and how it is shown

- **The commit fence compares inside `BEGIN IMMEDIATE`.** Case 2, and M3's run for the byte comparison alone.
- **Quarantine is untouched.** Case 5 and M11.
- **No lock is held across an await.** During the held prune, cases 2 and 3 assert `db.isTransaction === false`, and case 3 commits B's write. M12 is detected.
- **The static check** ([static-checks.txt](./static-checks.txt)) finds:
  - no added connection, worker, process or await;
  - no await between a `BEGIN` and its `COMMIT` or `ROLLBACK` in the three files.
- **One writer.** The harness writes through one connection. The change opens nothing.

## Not verified

- **No device, browser, real gateway or deployed service.** Everything ran on the in-process service on a shared Mac.
- **Whether this explains the desktop's sign-in failure during the phone's maintenance (SVC-SIGN-IN).** Session login and grants never used these caches. What this removes is the cold re-verification of every device's sync requests after each history step.
- **Repeated history requests.** The cases run one history request at a time. Two prunes of one account at once, or a prune racing an audit of the same account, were reasoned through from the code but not tested.
- **The production account's size.** The cases use 1,024 to 1,544 rows per account; nothing observed it.

## Runs on the final tree (this seat)

In [evidence.json](./evidence.json):
- **`node --test test/account-history/*.test.mjs`:** 113 of 113 (107 existing, 6 new), in 375 s. After that run, `oxfmt` changed the quotes of one new title; the new file was rerun on the final tree, 6 of 6 ([run](./candidate-run.txt)).
- **`test/account-service-delivery/*.test.mjs`, `test/account-service-inbound/*.test.mjs` and `test/account-liveness/service-cache.test.mjs`:** 161 of 162. The one failure, "service cache retains reuse with 65536-byte checkpoint and 35 larger rows" (116 verifies where 105 are expected), fails the same way on `6e88b46e0` with the three service sources reverted. It predates this phase and is not in a CI step.
- **The CI steps that cover these files:**
  - "native sync authority": 307 of 307, in 142 s;
  - "enrollment read batching": 69 of 69;
  - "service quarantine and restart": passed.
- **`node --test test/account-sessions/*.test.mjs`:** 195 of 195.
- **Type, format and lint:**
  - `pnpm typecheck`;
  - `oxfmt` through stdin and `oxlint --no-ignore` on the five changed code files, both clean.
- **Bookkeeping checks:**
  - the nine CI adapter files;
  - `pnpm validation:inventory` and the plan check;
  - `pnpm account:crypto-prep`.

  Their results: 178 of 178; passed with 10 of 10, and the plan at 1,130 / 559; census matched with 6 of 6.
- **The ten contract checks** (the CI step "Check security contracts and published vectors"): all pass.
- **`pnpm trace:check`:** fails only because the local origin-isolation receipt was written by a build on the phase 551 tree. `pnpm build` was not run here.
- **At review, on the final tree:** the full unit suite (`pnpm test --maxWorkers=1`), 353 files, 3,682 passed and 1 existing skip, in 327 s; then `pnpm typecheck`, `pnpm build`, the ten contract checks, the inventory and plan checks, `pnpm account:crypto-prep`, the nine adapter files, the packaged-application routing tests, `pnpm trace:check` (passing once the build had run on this tree), the history, service delivery and service inbound node tests, and the CI session, authority and quarantine steps.

**Bookkeeping** per [development.md](../../../development.md#release-bookkeeping):
- **Denominator.** Unchanged at 3,035: the new file is a node test in `test/account-history`, blocked like its neighbours, not a reviewed Vitest file.
- **Planning inventory.** It moves from 1,129 to 1,130 obligations, and from 558 to 559 unresolved. The new file joins the release selection, blocked. The inventory graph goes from 765 to 766 test files. The release-validation header in `progress.md` had lagged at 1,126/556 since phase 552 and now shows the recorded numbers.
- **Runtime census.** It records new hashes for the three service sources. No changed line adds a domain label or a cryptographic call.
- **Construction registry.** No registered site moved: the one labelled site in these files is `delivery.ts:781`, above the change.
