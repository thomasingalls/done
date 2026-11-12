# How the account service runs, and the global cache wipe

A delegated agent's report from 2026-11-11, filed as delivered. Read-only at `ff8578cd0`, including the infrastructure repository's deployment file. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** The operator approved scoping the history-route wipe on 2026-11-11 (queued) and declined request logging. The rest is under the SVC items in the product backlog.

---

Service concurrency investigation (read-only; nothing edited, built or run). Worktree tip ff8578cd0; production source 759890ca0 has the same service code apart from 0d7255376, a clock-tolerance change.

## Short answer
The quoted "single thread starves sign-in" story is mostly wrong in mechanism.
- **The expensive crypto already yields.** Ledger verification is async WebCrypto (Ed25519 and SHA-256), which Node runs on libuv's threadpool. The main thread interleaves other requests between rows.
- **Lab evidence agrees.** In the 1-CPU / 1 GiB lab (docs/performance-experiments/2026-10-22-history-checkpoint/analysis.json, 2026-10-27-self-read-order), event-loop utilization reached 0.80–0.91 while loop delay stayed at p99 ≈ 45 ms and max 80–285 ms. The loop was saturated, not blocked.
- **The real problem is amplification.**
  1. Every non-read history request (publish, admit, discard, prune) wipes the process-wide verification cache for all accounts, at the start and again after each retry.
  2. That turns every device's next sync request into a full O(history) re-verification.
  3. Cold-lane waits expire at 10 s, and each expiry wipes the cache again.
  4. On top of that, a few genuinely synchronous O(history bytes) stretches sit inside the prune.
- **Workers or cluster would not fix it.** They would spread work that should not happen across more cores. Cluster is actively defeated by the current design.

## 1. Process and storage model
**Verified by reading:**
- **Entry point.** Dockerfile:2 uses node:24.22.1 and runs the .ts files directly. Dockerfile:79-80 is `ENTRYPOINT node scripts/public-account.mjs`. scripts/public-account.mjs:1 says "One command per process"; lines 44-56 start the `api` or `app` mode.
- **Pod.** ol-infra/infra/apps/done/deployment.yaml has `replicas: 1` and `Recreate` (lines 13-15).
  - It runs two containers from one image: `api` on 127.0.0.1:8081 and `app` on :8080.
  - `app` is a proxy (scripts/lib/account-gateway.mjs). Its upstream timeout is 15 s, and on upstream failure it returns 503 `{"ok":false,"refusal":"service-unavailable"}` (lines 28-36, 45).
  - `api` resources (lines 109-116): CPU request 100m with no CPU limit; memory 256Mi request, 1Gi limit.
  - Probes (82-108): an exec healthcheck against /readyz with a 2 s fetch timeout. Readiness runs every 5 s and fails after 3; liveness runs every 20 s and fails after 3.
  - The cluster is one CAX31 node (8 vCPU arm64) that is also the Talos control plane (ol-infra infra/terraform/variables.tf:41).
- **One Node process, one connection.** One AccountCore holds one `DatabaseSync` on account.sqlite (core.ts:244), with WAL, `synchronous=FULL`, `busy_timeout=5000` and foreign keys (core.ts:260-263). Sessions and grants share that same connection (docs/account-session-grants.md:12). authority.sqlite is opened read-only only to unseal the key at startup (authority.ts:235-260). ownership.sqlite is held in rollback-journal mode with `BEGIN EXCLUSIVE` for the life of the process (public-state.ts:92-122). Startup runs `PRAGMA quick_check` synchronously (public-state.ts:156-162).
- **Binding is the synchronous node:sqlite API.** Every transaction is synchronous. The design rule is that no transaction is held across an await. I found no await between BEGIN and COMMIT/ROLLBACK in account-service/*.ts. Note that core's `#transaction` does not check `isTransaction` (core.ts:766-786), so yielding inside a transaction on the shared connection would be unsafe.
- **Workers and child processes already exist.**
  - `publisherAudit.worker.ts`: a full census in a worker on a read-only connection, with no keys, one job at a time, a fresh Worker per job (publisherTips.ts:210-219).
  - A long-lived backup worker (backup/owner.ts:11).
  - An `age` child process for backups (backup/archive.ts:19).
  - There is no pool, and no request-path work runs in workers.
- **Handlers.** Each route has a 10 s timer that destroys the socket but does not cancel domain work (scoped-http.ts:245-249, session-http.ts:56-60, session-host.ts:132-135). Admission budgets slots per session: 4 active, and 16 for the whole process (requestBudget.ts:4-12). The slot is released only when the domain work finishes, not when the timer fires (scoped-http.ts:368-378).
- **Signing** uses synchronous `node:crypto sign` (authority.ts:660-677).

**Inferred, from Node's implementation and not measured here:** `crypto.subtle.verify` and `digest` run as async jobs on libuv's default 4-thread pool. UV_THREADPOOL_SIZE is not set in the Dockerfile or the deployment.

## 2. Recorded rationale
No rationale is recorded anywhere for synchronous storage, for not using a worker pool on the request path, or for global rather than scoped cache invalidation. What is recorded:
- docs/account-core.md (2026-09-10, commit e9477aa7d) only describes the setup: "Node's `DatabaseSync` owns one SQLite file, WAL mode, `synchronous=FULL`…".
- docs/account-service-delivery.md (2026-09-11, commit 96a20405d), line 91: "No database lock is held across an await or signature request." Line 122: "Full scans and indefinite retention deliberately leave backlog performance and pruning to later work."
- TRD.md:1084: "the first deployment may remain one process."
- decisions.md:4375 (2026-10-09): "Brief sync outages are acceptable."
- recovery-options.md:39 (2026-10-10): "One writer plus a log receiver may suffice." Single-writer ownership is described in public-runtime.md.
- decisions.md:4452-4458 (2026-10-11) chose a worker "rather than an inline five-minute stall". The verified-tips plan.md:17-18 says "…pruning, close and failed verification invalidate reuse." That is the approved basis for the clears, but it does not say the clears must be global.

**My judgement:**
- **Real constraints:**
  - One ordering authority per ledger, so positions are never double-assigned and the witness chain never forks. This is enforced by `BEGIN IMMEDIATE` plus the unique accepted-position index, so it holds at the database level, not the process level.
  - An atomic re-check and commit in one synchronous transaction.
  - One process owning the state directory, for backup, restore and maintenance.
  - Signing keys and custody stay in the owner process.
- **Convenience or default:** synchronous node:sqlite as a built-in, verification running inline on the main thread, the global clears, and the 100m CPU request.
- **Cluster or replicas are ruled out by design, not just inconvenient:**
  - Grants, access tokens, notifications and cold lanes all live in process memory.
  - `PRAGMA data_version` invalidates every cached tip whenever another connection commits (publisherTips.ts:168-175), so a second process would wipe all caches on every write.
  - The ownership lock deliberately allows only one process.

## 3. Blocking operations and cost
The cache wipe is **global**, not account-scoped. There is one `DeliveryVerification` per process. `clear()` (deliveryVerification.ts:47-52) does three things: wipes the whole authority cache (inboundAuthorityReuse.ts:68-71), calls `tips.invalidate()` (publisherTips.ts:147-152, clearing all owners, tips and queued audits for every account), and bumps the revision, which discards every in-flight `remember` and authority check.
- **History request clears.** historyCheckpoint.ts:133-134 clears at entry and :675-676 clears in `finally` on every one of up to 4 attempts. This applies to all non-read actions. Publish, admit and discard write only `history_checkpoint_*` tables, which neither tips nor the authority cache read, so for them the clear is pure collateral.
- **Error-path clears** are also global: delivery.ts:1160, 1288, 1422 and 1611, discovery.ts:110, successor.ts:234. readInbound's catch wipes everything on "Cold publisher wait expired" (cold lanes have a 10 s cap, publisherTips.ts:347-364).
- **Bug:** `decideSubmission` turns `AuthorityCacheClearedError` into `unavailable` plus another wipe (delivery.ts:1158-1161). readInbound retries in the same case (1603-1608).

| Operation | Cost | Blocks everyone? |
|---|---|---|
| History request (non-read): initial `capture()` | Synchronous O(all blobs + checkpoints) (historyCheckpoint.ts:136-205) | Yes, while it runs |
| History request: checkpoint verification, every request including catalog reads | `get()` of latest/previous/pending does `JSON.parse` + unhex + digest. Synchronous O(checkpoint size), limit 72 MiB (lines 281-343) | Yes, during parse/unhex |
| History request: full census of every stream | Tips not used. O(all rows), about 3 Ed25519 checks per row, async (lines 370-414) | Interleaved, not blocked |
| Prune signing and verification | About 4 Ed25519 operations + 4 digests + 1 sign per covered row, async (lines 520-588) | Interleaved |
| Prune commit block | `capture()` again, `captureBytes` twice (hex + JSON of every blob and checkpoint), an UPDATE per row with `db.prepare` inside the loop, FULL fsync, possible WAL auto-checkpoint. Synchronous, cannot yield (lines 604-666) | Yes, all requests wait |
| Cold census after a wipe | Per stream: loads all rows, hex-encodes them twice synchronously, plus O(N) async crypto. Measured ≈0.55 ms/row on a Mac: 3,077 rows took 1.69 s (verified-tips README). Rebuild is lazy and per stream, and is thrown away if another wipe lands first. | Only that request, plus anything queued on its cold lane |
| Grant begin | Uncached O(membership) verification | No |
| Session begin/finish/renew | 1–3 short transactions + one WebAuthn verify | No |

## 4. The sign-in explanation
- **Pure login steps do no census and touch no cache.** These are session begin/finish/ack/renew and `/__account-setup` begin/finish. They exceed 10 s only if the main thread is truly blocked for seconds or the process is down. That needs a very large history or checkpoint, or an OOM or liveness restart. I rate that low to moderate.
- **More likely:**
  - The step that failed was census-bound (authority/membership discover, reads) and went cold after the phone's wipes, then hit the 10 s cold-lane expiry, which wiped again. Or its HTTP timer fired and the gateway returned 503 `service-unavailable`.
  - Or the desktop's grant got 429 `capacity`, because its own long cold requests held all 4 of its per-session slots. Grant and content requests share the session budget key.
  - Phone retries can overlap a prune that is still running. Each retry repeats the full work and wipes again.
- **The message text needs checking.** The exact text "Account verification could not finish" exists only in src/account/accountSignIn.ts, and `createAccountSignIn` has no importer at 759890ca0 or at the tip. The siblings should pin which client step and message were actually shown.
- **No service log line would settle it.** The public runtime logs only "Public api ready…", shutdown failures, and the `ledger-integrity` warning. Diagnostics stay in memory.
- **What might still exist:**
  - The `api` container's `restartCount` and `lastState.terminated` (reason, finishedAt): `kubectl -n done get pod -o yaml`. This is lost if the pod has been recreated since.
  - `kubectl logs --previous -c api --timestamps`.
  - Probe-failure events ("Public api is not ready") are kept about 1 h, so they are probably gone.
  - I found no gateway access-log configuration.

## 5. Options, cheapest first
1. **Instrumentation.** Log per request: route, status or refusal, duration and cold-wait time. Log each global clear with its cause. Log a periodic event-loop delay, utilization and RSS summary. Expose `deliveryVerificationStatus` (`fullCensuses`, `verifiedRows`, `coldWaiting`) on a loopback endpoint. Small change, no risk.
2. **Stop the history route's global wipe** (historyCheckpoint.ts:133-134, 675-676; add `invalidateAccount` in publisherTips.ts).
   - Publish, admit and discard need no clear at all.
   - Prune: invalidate only the pruned account's publisher keys. Or, with an operator amendment, keep them: a prune preserves count, witness and chain commitment, because receipts carry `submissionHash` (prunedDecision.ts:169) and the census extends with `originalHash`.
   - Must preserve: guard compares inside `BEGIN IMMEDIATE` (publisherTips.ts:439-462), so in-flight captures across a prune still fail and retry; quarantine is untouched.
   - About 20–40 lines plus tests. Low risk. It amends the plan.md:17-18 invalidation line, so it needs your approval.
   - Only keeping the pruned account's own tips helps the incident case, where phone and desktop are the same account.
3. **Scope the error-path clears** (delivery.ts, discovery.ts, successor.ts). Never wipe on scheduling errors or cache-cleared errors. Make submit retry on `AuthorityCacheClearedError` the way readInbound does. Otherwise invalidate only the failing publisher; census failures already quarantine it. Small change, low-to-moderate risk.
4. **Make the prune's commit cost O(changed rows)** (historyCheckpoint.ts).
   - Fence on: exact authority header, per-stream count and witness, exact bytes of the rows being replaced, and the catalog and records.
   - Prepare statements once.
   - Split into bounded transactions. Pruning is already idempotent and resumable (pruning.test.mjs "resumes atomically").
   - Cache verified immutable checkpoints by (workspace, hash).
   - Must preserve: no lock across await, one writer, and only bytes that were verified get replaced.
   - Medium size (about 100–200 lines), moderate risk; it needs security review because it is the destructive operation.
5. **Worker-established tips.** Generalize publisherAudit.worker.ts to return a VerifiedPrefix. The owner installs it after checking header, count and witness in a short read transaction, the same way audit completion works today. Also verify independent signatures in parallel. The worker still gets no keys. Medium-large (about 300–500 lines), with memory risk under the 1 GiB limit. Do this only if measurement still shows cold-census saturation after options 2–4.
6. **Yielding: little value.** The crypto already yields. The remaining synchronous parts are single native calls or sit inside transactions, which must not yield on the shared connection.
7. **Read-only worker connections per read: defer.** The owner still has to authorize, sign and commit, and the gain overlaps option 5.
8. **Cluster or replicas: don't**, for the reasons in section 2.
9. **Ops (yours, in ol-infra).** Raise the api CPU request from 100m, set UV_THREADPOOL_SIZE, and check memory headroom.

**Recommended order:**
1. Measure first. Build a probe in scripts/performance/ using the service-verified-tips.mjs seeding pattern. Size it from production-shaped counts: run `SELECT count(*), sum(length(submission))` per account and credential on a backup copy, plus the checkpoint sizes. Record:
   - prune duration and its synchronous phases;
   - event-loop delay max and p99;
   - RSS peak;
   - full censuses on the other device's next reads;
   - latency of concurrent session finish and grant begin, both on the same account and on another account.
   Also check the pod status now.
2. Instrumentation (option 1).
3. Options 2 and 3.
4. Option 4.
5. Option 5, only if still needed.

**Tests.** The "budget" tests in these directories (test/account-sessions/request-budget*.test.mjs, inbound-batch-budget.test.mjs, scoped-http.test.mjs) are admission-limit unit tests, not timing tests. There are no wall-clock tests in test/account-history, test/account-service-inbound or test/account-sessions. Timing guards live in scripts/performance/service-verified-tips.mjs and in the experiment harnesses, which use `monitorEventLoopDelay` and event-loop utilization.

Proposed new test, test/account-history/prune-isolation.test.mjs:
1. Seed about 3,000 rows directly, using the probe's seeding pattern.
2. Admit two checkpoints using the pruning.test.mjs pattern.
3. Warm device 2's tip.
4. Start the prune without awaiting it.
5. Run device 2's session begin → finish → renew → grant begin, then a warm read.
6. Gate on deterministic counters: device 2's read after the prune adds no `fullCensuses`, and there is no global clear (add a clear counter).
7. Treat timing (sign-in under N ms, loop delay under 250 ms) as a probe, or as a frozen gate with N set from measurement.

## Could not determine
- The production account's rows per stream, blob sizes and checkpoint size. These decide whether the synchronous stretches are about 50 ms or several seconds.
- Whether the api container OOMed or restarted on 2026-11-08.
- Which client step and message the desktop actually showed.
- The Hetzner volume's fsync latency.
- WebCrypto threadpool behavior is inferred from Node's implementation, not measured.
