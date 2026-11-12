# Why start-up verifies saved history more than once

A delegated agent's report from 2026-11-11, filed as delivered. Read-only at `ff8578cd0`. Paths under `/private/tmp` were session scratch space and no longer exist; the supporting files that mattered are under [support](./support/).

**What happened next.** The fix (one owner on a normal open) is queued behind a measurement and was not built when this was filed.

---

## Short answer

I read the code at ff8578cd0 and made no edits, builds or test runs. Nothing in the code today depends on verifying the saved history twice. Three narrower things are justified:
- one complete verification in the Worker before anything is shown or written;
- the genesis "ancestry" check, which needs a replayed document and which only the start-up pass does;
- the Window's own replay, which builds the editable document.

The duplicate comes from how two owners were put together on 2026-09-10. The project spotted it twice since (2026-10-11, and phases 120/121) and both times deferred it as a "cross-owner handoff". A smaller fix avoids the handoff altogether: on the normal opening path, don't create the temporary owner.

## 1. What actually happens on open

Read from code; nothing measured. The path is: original device, marker v9, packaged build (Worker composed path, incremental ledger, warm loads on, baseline reader on).

**Window side, before the Worker opens the account**
- `windowCeremonyUi.ts:269-340` (setupOpen) calls `openAccountWorkerSession(..., {composed:true})` (`:323`).
- That sends `open` to the same Worker (`accountWorkerClient.ts:448-464`).

**Worker side.** Everything below runs under one exclusive permit and one task (`writeSession.ts:412-441`, `accountCapture.ts:156-317`).
- **Authority** (`accountStartup.ts:62-125`): rotation observation, marker, pin, receipt, binding, route, census, then the passkey (`112-117`, milestone 'authorized' at `118`), then a marker re-read and census recheck.
- **Keys and genesis checkpoint** (`127-174`). No saved history has been read yet.
- **Pass A** (`accountStartup.ts:195-337` → `custody.ts:1152-1217`) uses a temporary custody owner.
  - A1, `owner.initialize` → `contentStore.ts:1258` load: full IndexedDB read, AES-GCM decrypt of every row, counter MAC, placement checks.
  - A1 then runs the start-up validator (`accountStartup.ts:289-334`): census, spool witness, successor, inbound ledger, spool signatures, delivery.
  - The inbound-ledger step builds its own Y.Doc of all content rows (`inboundLedger.ts:683-689` → `485-501`).
  - A2, `loadAccount` (`custody.ts:1204`): a second full read. Every sealed row is compared, plaintext is reused, and validation is skipped by view identity (`custody.ts:1180`).
  - A3: a second census (`accountStartup.ts:206`), then a replay of all content plus the journal into a fresh Y.Doc (`220`).
  - A3 then checks: genesis checkpoint applied (`224`), catch-up coverage (`225-240`), coversGenesis (`241-245`), receipt bound to the checkpoint's sv/ds (`247-252`).
  - All of it is destroyed afterwards (`254-255`, `custody.ts:1210-1215`). Only claim, record, marker, route and account flags are kept. Milestone 'classified' is set at `accountCapture.ts:200`.
- **Pass B** (`accountCapture.ts:236-265`) uses the live owner.
  - `extension.initialize` re-opens the keys and builds the inbound context (`accountReceive.ts:530-576`).
  - `owner.initialize` → load: full read and decrypt of every row again.
  - Then the live check (`accountReceive.ts:649` → checkFull `695-850`): census, spool witness, successor, spool signatures, delivery, inbound ledger with a retained coverage Y.Doc of all content (`703`), self-receive advancement (`790`), index build (`815`).
  - It keeps the plaintext view, warm shape, verified ledger view, memo, coverage doc and indexes. Every later incremental check uses these.
- **Activation**: `extension.activate` → `enableSpool` does a warm load (shape check, counter MAC, bounded audit, byte comparison; no re-validation). Milestone 'owner' is set at `accountReceive.ts:3577`.

**Window side, after**
- `windowAccountMirror.ts:62-217` → `admissionQueue.ts:430` → Worker `beginRecovery` (`accountWorkerOwner.ts:393-404`).
- That reaches `accountCapture.ts:617-634`: journal read over the bridge, warm `loadAccount`, then capturedRecovery.
- The result is copied (`accountMirrorRecovery.ts`), sent in 128 KiB pages with one request each, and replayed on the main thread (`admissionQueue.ts:434`).
- The main thread then forks the whole document (`admittedWorkspace.ts:710`) and compares it whole (`731-742`). Milestone 'editor' is set at `accountReceive.ts:3597`.

**Counts**

| Work | Unreduced device | Reduced device (baseline plus suffix) |
|---|---|---|
| Full physical reads | 3, plus 2 warm checks | — |
| Decrypt of every row | 2 | 2 |
| Full ledger verifications | 2 | — |
| Census builds | 3 | — |
| Complete baseline verifications | — | 2, each with its own replay (A2 reuses its proof, per phase 122) |
| Full Yjs replays | **4**: 3 in the Worker, 1 on the Window main thread | **4** of the shorter history |
| Extra main-thread work | a whole-document fork and comparison | — |

So "twice" undercounts the replays: there are four, not three.

**Second (joined) device.** It has the same shape: `verifyJoinedAccount` (`joinedAccount.ts:880-1235`; its content pass is `1113-1208` and adds `verifySyncState`), then the live owner (`accountCapture.ts:162-197`).

**Inferred, not verified**
- That the setup controller and the account owner share one Worker realm after the handoff. If so, all milestones are Worker-side.

## 2. Why each pass exists, and whether the reasons hold

**Where each pass came from**
- **Pass A**
  - 649925f46 (2026-09-10) built start-up classification as a standalone API that grants nothing. `docs/account-handoff.md`, "Owned startup classification": cold replay plus checkpoint coverage.
  - d10cf8b4d the same day put it unchanged inside the editing owner, which then opened its own custody: "verification, activation, carrier and cleanup share one permit". `docs/account-editing.md` calls the checkpoint "ancestry evidence".
  - Pass A got ledger validation in 7082fa77c and f6e4cf4f9. `docs/account-spool.md` requires the census check "before … replaying startup", so pass A validates only because it replays.
- **Pass B.** The content carrier never hands back a normal-open capability without verifying its own load (`contentStore.ts:1244`, 468cbe2b4). The live validator also has to build the view it retains.
- **Window replay.** The Window owns admission and Undo, Yjs documents can't cross realms, and the Worker deliberately passes no verification authority (`accountMirrorRecovery.ts:1-2`).
- **Known and deferred.**
  - 2026-10-11 cold-census README: "Measure that before attempting a handoff across ownership boundaries."
  - Phase 120: the code "deliberately forbids sharing view identities across owners", followed by a list of proof obligations. Phase 121 lists it as item 2.
  - Decision for phase 122 (`decisions.md:5764`): "Keep live warm reference audits and cross-owner initialization separate."
  - No entry gives a security reason for the duplicate. The TRD start-up pipeline is a single pass: "Opened after complete replay" (`TRD.md:816-826, 981`).

**Your candidate reasons**
- **Runs before authority or keys exist: does not hold.** Pass A's content work runs after the passkey, the marker re-read and the census recheck (`112-125` come before `195`).
- **Different realms: does not hold.** A and B are both in the Worker; before the release both were in the Window. The boundary is between custody-owner objects, which is a lifetime and erasure rule, not a realm.
- **Storage could change in between: does not hold.** Same exclusive permit, same task, no writes between them, and no other tab can hold the permit. A hostile same-origin writer could change storage after B just as easily, and warm counter/shape checks and audits already cover that.
- **Different depth: partly holds.**
  - Both passes call the same verifier functions with equivalent inputs.
  - Only A does: the ancestry replay and coverage, catch-up coverage, the receipt sv/ds binding, the detached-prefix check (removed devices only), and `verifySyncState` on joined devices.
  - Only B does: self-receive advancement, indexes and the retained state.
  - The one real second-implementation cross-check at open: A's coverage uses the reference fork/apply/compare path, B uses the prepared baseline. The designed reference oracle is the periodic semantic audit (`accountReceive.ts:457-479`), which isn't due at open.
- **The strongest case for the design** is "an independent second opinion at every open". It fails, because both passes call the same functions.

## 3. Recommended change: one owner on the normal path

Order: authorize → live owner initialize (pass B unchanged) → ancestry check on the live owner's data → existing writes.

**accountStartup.ts**
- Split `verifyAccountUnderPermit` into:
  - `authorizeAccountUnderPermit`, covering `62-174` plus the checks that need only the checkpoint (coverage snapshot hash, receipt sv/ds);
  - `verifyStartupAncestry(task, options, v, recovery)`, which re-opens the checkpoint under `withPromotionRoot`, replays into a fresh gc:false doc, runs coversGenesis (sameDocState for v4) and catch-up coverage, then destroys and zeroes everything.
- Keep the combined function for `accountCatchup.ts:152`, `accountJournal.ts:23`, `classifyAccountStartup`, and markers that aren't at v9.

**accountCapture.ts:199-286**
- Take the new path only when: extension version 9, marker v9, no captureBootstrap, not detached.
- Sequence: authorize, the same identity checks, `prepareAccountCustody`, `extension.initialize`, `owner.initialize`.
- Then, still inside initialize and before the marker bump and `extension.activate`: read the journal snapshot, call `owner.carrier.loadAccount` (warm), build the input with the existing `recovery()` helper (`140-155`), and run `verifyStartupAncestry`.
- Add a new milestone rather than moving 'classified'.

**Joined devices, as a second slice**
- Move `joinedAccount.ts:1113-1208` after the live owner's initialize.
- This needs `b.doc` either rebuilt (fixed size) or kept alive longer.
- It also needs a CaptureExtension hook in `accountReceive.ts` so `verifySyncState` runs on the live verified view.

**Optional**
- Mark the semantic audit due at open, so the reference coverage path runs in the background, off the critical path.

**Guarantees kept**
- Authority (including the passkey) still finishes before any history is read.
- A complete authenticated verification (or complete baseline verification) still happens before any write and before `initialize` returns, so before `workspaceOpen`.
- The census still comes before the replay, because the replay uses the verified census.
- The ancestry check is unchanged: same checks, same input set, same checkpoint.
- The input is freshly checked under the permit (counter MAC, shape check, bounded audit, byte-equal comparison; any change forces a full read).
- No proof crosses owners, and plaintext and doc erasure stay local.
- Detached and non-steady markers keep the old path.

**What it saves per open**
- Unreduced: 2 full reads, 1 decrypt of every row, 1 full ledger verification, 2 census builds and 1 coverage replay; it adds 1 warm load. Three replays remain.
- Reduced: 1 complete baseline verification and 1 decrypt of every row.

**Size**
- Roughly 100-150 source lines in two files, plus tests, for the original-device slice; about the same again for joined devices.
- The crypto census and construction registry list sites in `accountStartup.ts` and `accountCapture.ts`, so the release bookkeeping needs a refresh.

**What could go wrong**
- A write sneaks in ahead of the ancestry check. Test: refusal leaves storage unchanged.
- The two validators turn out not to be exactly equivalent (for example the `authority` versus `base.authority` input, or the key maps). Test: run the existing tamper fixtures through the new path.
- Refusal errors and repair text change.
- Milestone semantics shift for anyone comparing profiles.
- The reference coverage cross-check first runs at the first audit (up to 5 minutes, 256 rows or 1,024 positions) instead of at open.

**Alternatives I rejected**
- **Hand pass A's view to the live owner.** It needs the new cross-owner contract phase 120/121 describes, and A doesn't produce B's retained state anyway.
- **Drop pass A entirely.** It is the only check that genesis-era content rows weren't lost; compaction legitimately leaves sequence gaps, so the ledger checks don't catch that.
- **Drop pass B.** The live owner would have nothing to extend from.
- **Persist a "verified" flag.** The decisions log rejects this repeatedly.
- **Deferred, not rejected:** stream one encoded state to the Window instead of N records. It changes the admission accounting; measure first.

## 4. What the 2026-11-08 release changed

`git diff 410221ad..759890ca0`:
- `accountStartup.ts` changed by 2 lines (a type only). The initialize structure in `accountCapture.ts` is unchanged. The double pass dates from 2026-09-10/11 and was already in production.
- The release added `accountWorkerOwner.ts`, `accountWorkerClient.ts`, `windowAccountMirror.ts`, `accountWorkerRecoveryStream.ts`, `accountMirrorRecovery.ts`, `workerAccountComposition.ts` and `windowCeremonyUi.ts`. `AccountSetupApp.tsx` now uses the Worker setup whenever networkSessions is on.

So the release added no extra verification pass and no extra replay. It did three things:
- moved passes A and B off the main thread into the Worker;
- left the Window replay on the main thread, but now feeds it through a copy and 128 KiB paged round trips instead of a same-realm load;
- added the Worker boot and setup handoff, plus journal reads over the bridge.

## 5. Measurement plan and stop rule

**Setup**
- Packaged build with `VITE_ACCOUNT_LEDGER_PROFILE=1`, desktop Chromium, Account mode, online, with an offline variant to separate network time.
- Fixtures: a large unreduced original device (the phase 516 3,072-position or phase 495 fixtures, if still in /private/tmp), its joined device, and a reduced device.

**What to read**
- The milestones now live in the Worker, so read them with `page.workers()` → `evaluate(() => __doneOpenMilestones())`.
  - authorized→classified is pass A.
  - classified→owner is pass B.
  - owner→editor is the stream and Window replay.
- Also read `__doneLedgerMetrics()`:
  - costs: `startupCustodyAndLedger`, `physicalRead`, `loadElapsed`;
  - work: `startupValidations`, `loads`, `loadedRows`, `inboundVerifications`, `deliveryVerifications`, `inboundCensuses`, `baselineFullReplays`, `baselineExactReuses`;
  - timings: `full` and `coverageRebuild`.
- Add the page-side first-shell-frame timer (MutationObserver plus two animation frames), copied from `docs/performance-experiments/2026-10-11-account-cold-coverage/probe/cold.spec.ts`.
- That probe only reads page globals and patches the page's SubtleCrypto, so it misses Worker work since the release. Phase 323's `probe-worker-profiler.mjs.gz` covers Worker CPU profiles.
- Probes stay outside `test/`. The 15 s functional gate (`test/packaged-account/devices.ts:108-135`) stays as it is.

**Before implementing**
- Run at least 3 opens on the large unreduced fixture.
- Implement if pass A's median is at least 20% of click-to-first-frame, or at least 1 s.
- If it is under 10% and under 0.5 s, don't implement; look at owner→editor or the Worker boot instead.
- The only prior figure is from the pre-Worker lab on 2026-10-11: pass A 880 ms of a 2,341 ms first frame.

**After implementing**
- The counters should show exactly the removed work: `startupValidations` 0, one full check, one physical full read, and for reduced devices `baselineFullReplays` 1.
- Run 5 alternating pairs.
- Stop when the paired median gain is larger than either arm's range. If the counters confirm the removal but the medians overlap, stop anyway and record that pass A was not material on this path.

## 6. What I couldn't determine

- Any timings, including the operator's desktop and its share of the open.
- Whether the slow device is the original or the joined one.
- Full equivalence of the two validators' inputs (the authority object and key maps). I read them as equivalent but haven't proven it.
- Whether the joined live check covers what `verifySyncState` checks.
- The Worker boot and setup cost before the passes.
- Whether the production deployment enables automatic retention, which decides whether devices are reduced.
- Whether maintenance starting right after open competes with the editor.
