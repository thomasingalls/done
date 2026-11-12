# Product follow-ups

Captured 2026-10-17 from the operator's requests in the scheduling/onboarding/enrollment conversation.
This is a parking place for observations and design questions. Order below is not priority or an
implementation plan. The [PRD](./PRD.md) and [TRD](./TRD.md) remain the requirements; individual changes
get a bounded scope and evidence before implementation. General release qualification remains
[paused](./private-release-validation-prep.md).

## Held from the release repair — recorded 2026-11-12

The release-repair slice (phases 538 onward, records under
[development-evidence/2026-11-11-release-repair](development-evidence/2026-11-11-release-repair/))
turned up more than it fixed. The operator asked on 2026-11-12 that everything held back be recorded
here for a future release. Nothing below is scheduled. Items marked *decision* would amend a recorded
decision and need the operator before any work; items marked *unmeasured* rest on reading the code.
The agents' reports behind these items are kept in
[investigations](development-evidence/2026-11-11-release-repair/investigations/README.md).

### History snapshots and pruning

- **HIST-INSTALL-LIMIT — a workspace above about 1.33 MiB of document state cannot have a service
  snapshot.** *decision.* A device installs a snapshot as one 4 MiB batch that holds the derived
  update and an install event carrying the same snapshot again as hex ciphertext (phase 544;
  1,397,416 bytes on the single-writer fixture, less four thirds of the coverage vectors). Past it,
  service history can never be pruned, and a device that installed a snapshot near that size parks
  reduction at about the same document size under phase 542's 8 MiB baseline ceiling. Candidate: an
  install event without the ciphertext, re-sealed on replay, which lifts the bound to nearly 4 MiB
  and halves the baseline cost; it changes a stored format and the replay proof. Alternatives: a
  larger batch for installation only, or a chunked install with a resumable journal.
- **HIST-SKIP-UNINSTALLABLE — a device that meets an uninstallable latest snapshot halts receive for
  good.** *decision.* The halt has been deliberate since 2026-10-09. Phase 544 stops new ones being
  published, admitted or pruned past; an account that already holds one stays halted. Skipping it,
  as the code already does for a snapshot needing retired history, would restore receive.
- **HIST-REPLAY-BOUND — no snapshot can be created or verified past 4,096 positions since the last
  admitted one** (`HISTORY_REPLAY_EVENTS`, `src/crdt/historySource.ts`; verified at node level,
  4,096 replays and 4,097 is refused). Phase 547 warns before the bound. Removing it needs a larger
  bound with memory and time evidence, or a chunked replay.
- **HIST-GATE-FLAG — a two-device account fetches history only because the production service
  advertises membership continuation.** *decision.* A three-device run against the production entry
  showed both outcomes: with the flag a returning device catches up; without it a two-device reader
  at epoch 3 never reads the catalog and strands. Fetching regardless (treat a 404 from the history
  route as "no history here") amends the 2026-10-15 decision "Keep optional receiver discovery
  separate from required authenticated history" and breaks
  `receiver-compatibility.spec.ts` › "…without requesting unsupported history".
- **HIST-PRUNE-READERS — a prune cannot know who is behind.** The service stores no record of how far
  each device has read and the pruning device sees only the roster. A hard refusal would let one
  lost phone block pruning for ever; a warning is the only sensible use of such a record, and a
  service-kept reader mark would be a new data class.
- **HIST-CANNOT-CATCH-UP — a named "this device cannot catch up" state with a guided re-sync that
  carries unsent writing.** Proposed in place of any limit on how far behind a device may fall.
  Catching up costs one snapshot install however long the device was away, and unsent writing
  survives in either order (tested with three devices, two prune cycles and conflicting edits). The
  cases that cannot catch up are an uninstallable snapshot, a cut that cannot be verified against
  reduced history, and possibly a missed key rotation. Not designed.
- **HIST-FOLD-RESIDUAL — an older build still cannot open a store holding an unfolded verified
  installation.** *decision.* Phase 550 commits a snapshot installation verified against reduced
  history only when a reduction can follow at once, and that reduction carries it into the baseline
  older builds read (10.2 to 10.3 s after the commit, measured). Three cases leave it unfolded for
  longer: capacity first met by the fold (later installations are then held), a device closed during
  the ten-second window or mid-fold (the next open of a newer build folds it), and writing entered
  after the commit while sending fails (folded once it is accepted). An older build then shows
  "Worker operation could not finish." on the unlock screen and writes nothing. Candidates: commit
  the installation and the new baseline atomically (not chosen on 2026-11-12), or a named message in
  a future build for a store it cannot replay.
- **HIST-UNTESTED — two conditions were asked for and not reached.** A prune landing while a device
  is mid-receive: four attempts all converged, but the device had installed the newer snapshot
  first, so the condition was never created. A key rotation while a device is offline across a
  prune: read only; the survivor adopts authority before installing and rotation records survive
  pruning, so it should work.
- **HIST-TEST-HOOKS — the lost-phone and history-gate browser tests live only in scratch copies.**
  They need designed test hooks before they can be added: holding a device's history fetch and
  receive, allowing reduction with small thresholds, exporting document state, and a service
  configuration that serves history without advertising it.
- **HIST-OTHER — smaller observations.** Snapshots with equal heads are allowed, so one covering no
  new positions is possible (unmeasured). A single-device snapshot replays its history twice. A
  custody-refresh failure after any history command closes the whole account session. The
  `test/account-history` client, service and pruning node tests and
  `test/packaged-account/automatic-history.spec.ts` are not in CI. A device joined by handoff may
  be shown an account-wide position count larger than its own replay, so Create can be hidden for
  it when it could still make the snapshot (phase 547). A discard whose reply is lost, followed by
  another device publishing, leaves the client resending a cancellation the service refuses (found
  in phase 547; intended for the refusal-messages work).

### Automatic service-history pruning

The operator wants it: "the current flow where you have to click a lot of buttons and do a lot of
waiting just doesn't cut it." It exists behind the build flag `VITE_ACCOUNT_HISTORY_AUTO`, off in
production. Pruning the log does not shrink the document; see compaction below.

- **AUTO-HIST-STAGES — a staged path.** Stage 0, refusal messages and one status line. Stage 1,
  manual-flow correctness (phases 546 and 547, the scoped service cache wipe). Stage 2, automatic
  create and verify triggered by positions accepted since the latest snapshot, provisionally 1,024,
  not by local records and an hourly clock. Stage 3, automatic prune once per snapshot by the
  admitting device. Stage 4, on by default.
- **AUTO-HIST-DECISIONS — what the operator would rule on.** *decision.* Keep second-device
  admission (recommended; automation removes the clicks, not the wait for another device). Let
  automation discard its own stale, oversized or definitely refused proposals, which amends the
  phase 126 rule of no automatic discard. Change the trigger metric. Phones verify but never create
  when another device can. A service-side switch for automatic clients.
- **AUTO-HIST-GAPS — known gaps beyond the stages.** Create and verify run inside the storage queue
  for 6 to 14 s per 1,024 positions at 0 to 50 ms round trip (phase 332), probably delaying edits
  typed meanwhile (unmeasured). Every device prunes once per owner lifetime, re-downloading
  snapshots each open. The automatic status reaches the page but nothing shows it. No metered,
  battery or session-length guard on phones.

### Document growth

- **DOC-COMPACTION — the document never discards deleted content.** Every limit above is reached by
  document state, not by visible text: a 142 KB export was already heading for the 1.33 MiB
  snapshot limit. Compacting the document would break the rule that each snapshot covers the one
  before it, so it needs its own baseline type and a decision (TRD §10.4). A device offline across a
  compaction cannot merge structurally; the shapes discussed were a grace window in which the
  service keeps the pre-compaction snapshot, the returning device re-expressing its unsent edits on
  the compacted document, and rescuing older edits as plain text for the person to place.

### Long text in one action

Phase 548 made a long card save in slices and made every other oversized action a refusal instead of
a stall. What it left:

- **TEXT-CEILING — lower the one-action text ceiling from 1,048,576 characters to 256 KiB.** The
  operator decided this on 2026-11-12, for after the next release. One compose or paste may carry
  1,048,576 UTF-16 units today, and saving near that takes minutes (below). A 256 KiB bound caps the
  wait near 15 s in a browser. It is a new limit on pastes that work today, only slowly, so it needs
  its own sentence and a decision entry when built.
- **TEXT-SAVE-COST — saving sliced text costs the square of its length.** Each 1,000-unit slice
  forks the workspace history and re-encodes the whole remaining text (read from the code; the
  split between the two is unmeasured). Measured in phase 548:
  200,000 characters took 14.5 s in headless Chromium; 1,048,576 single-byte characters took 114 s
  in Node; 696,000 three-byte characters had not finished after 23 minutes. Pastes always had this
  cost. Nothing shows progress while it runs.
- **TEXT-REDO — Redo of a card or paste over 16 KiB is refused.** Undo removes a long card in one
  step and Redo cannot bring it back, because Redo restores stored history as one change. Before
  phase 548 that Redo stalled the device. Fixing it needs a sliced Redo or a larger update limit.
- **TEXT-GOALS-COPY — copying or moving many short Goals lines whose total is over 16 KiB is
  refused**, although it could be split per card. Duplicate, Done for now, merge, split and Next to
  Goals over 16 KiB are refused because a crash between slices would leave a broken state; a
  two-phase form could lift that.
- **TEXT-STUCK-UPDATE — a page already stuck on an older build cannot update itself.** "Reload to
  update" fails while that build's queue is blocked. The person has to press Discard pending input
  (the draft stays in the field) or close every window. The stuck input lives only in memory.
- **TEXT-OTHER — smaller observations.** Slices never end inside a surrogate pair, but a combining
  accent or a joined emoji can be divided, so another device may briefly show a broken glyph while
  slices arrive. A crash between slices keeps the slices saved and loses the rest, as for a paste.
  Filing a long unfiled card to Goals takes the same refusal path and is untested. In reference mode
  a refused action still emits an empty two-byte update.

### Returning to the app and start-up

- **WARM-BYTE-COMPARE — compare stored bytes on return in place of a full baseline replay.**
  *decision.* On a reduced device the first load after a return decrypts and replays the whole
  baseline. The threat the invalidation answers is stored bytes changed in place by something
  outside the app while timers were stopped; a byte comparison with already-verified memory answers
  that, and the unreduced path already works this way. Amends the wording of the 2026-10-12
  decision. After phase 545 the remaining cost was 0.4 to 2.2 s per return in Node at 2 to 8 MiB;
  decide after measuring on a device.
- **WARM-REAL-SUSPENSION — invalidate only after a real suspension.** *decision.* A freeze or resume
  event, a heartbeat gap, or hidden longer than the audit interval, so a quick tab switch on desktop
  skips the re-read.
- **START-JOINED — the second slice of the start-up fix.** A joined device's pre-verification
  (`src/crdt/joinedAccount.ts`) has the same shape as the original device's and needs its own change.
  Also deferred: streaming one encoded state to the page in place of paged records, and marking the
  semantic audit due at open.
- **CATCH-UP-REDUCED — a reduced device still catches up more slowly than an unreduced one.**
  After phase 549 kept the completed background replay, a returning reduced device at a 300 ms round
  trip took 135.5 s where an unreduced one took 90.1 s with a similar amount of its own writing; a
  run that sent 1 position of its own instead of 22 took 65.5 s. The remaining gap is not the
  background replay; per-position cost on a reduced device is the likely cause (unmeasured). The
  device's own card-membership repair sends change catch-up time about twofold.
- **CATCH-UP-NO-VIEW — input or suspension that interrupts the background replay's index pass leaves
  no warm view**, so the next load, possibly a foreground one, replays in full. Queued work no
  longer causes this after phase 549; input and suspension still can.
- **CATCH-UP-LAB-RTT — the lab runs with no round-trip time**, so its catch-up figures understate a
  phone's. The 150 s catch-up of investigation 16 did not recur at phase 548 without a delay (24 to
  28 s) and never finished in 180 s with 300 ms; the phase 549 record has both.

### Sending

- **SEND-FURTHER — steps that amend recorded decisions or are large.** *decision.* Only if the
  queued send-path fixes miss their target (a sent position at 3,000 positions within 1.2 times the
  cost at 300, and under about 250 ms). A delivery-scoped speculative check in place of a whole-view
  clone (phase 143). Skipping the unchanged-load byte comparison or giving the plaintext one owner
  (phases 142 and 409). Limiting the adoption erase to dropped buffers (phase 142). Structural
  sharing in the ledger extension (large). A semantic-oracle trigger proportional to history, with
  no full re-read on every interruption (phases 416 and 417). A shape check once per storage task
  (2026-10-12).
- **SEND-ROW-BOUND — the 32,768-row index bound is still a cliff after phase 538.** Estimated at
  2,000 to 4,000 positions per device (unmeasured). Past it every ledger change runs the full check
  until the device reduces.

### Local history reduction

- **REDUCE-FURTHER — steps beyond the queued slice-budget change.** *decision.* Shrinking the fenced
  save from history-plus-saved-work to history-plus-slice, which amends the exact authenticated
  readback decisions (phase 127). Counting only input jobs for "Input is waiting to be saved.", or
  moving progress saves off the page's input queue as before the 2026-11-08 release, which amends
  phase 187. A continuous pass with background saves.
- **REDUCE-HOLD-RESIDUAL — a held window can still recur once per history change** when every window
  is cut short (phase 546, by design). Also noted: a device on the full check holds sync while
  offline, and other fenced callers (history install, authority adoption, the "Check history" dry
  run, manual install and replace) still meet the busy-handoff refusal.

### Account service

- **SVC-ERROR-CLEARS — scope the error-path cache wipes** in `account-service/delivery.ts`,
  `discovery.ts` and `successor.ts` to the failing publisher. Held to be shown to the operator
  separately from the approved history-route scoping.
- **SVC-PRUNE-COMMIT — make a prune's commit proportional to changed rows.** Today it captures and
  re-encodes every blob and checkpoint inside one synchronous transaction, so every request waits.
  Medium, and it needs security review because it is the destructive operation.
- **SVC-WORKER-TIPS — verification in a worker.** Only if measurement still shows saturation after
  the two items above.
- **SVC-OPS — deployment values in the infrastructure repository.** The API container requests 100m
  CPU with no limit; the WebCrypto thread pool is at its default of four.
- **SVC-NO-LOGS — the operator declined request and cache-wipe logging on the service**
  (2026-11-11). Evidence for service behaviour comes from counters in tests and what a device shows.
- **SVC-SIGN-IN — the desktop sign-in failure during the phone's maintenance is unexplained.** The
  text recalled, "Account verification could not finish", exists only in a file nothing imports.
  Likely a census-bound step gone cold after the phone's cache wipes, or the device's own
  four-request budget (unmeasured). The pod's restart count for 2026-11-08 would show whether it was
  killed.

### Tests and tooling

- **TEST-BROWSER-BASELINE — `pnpm test:local-baseline` is required by the release policy, is not in
  CI, and failed on main** since the owner moved into a Worker. A repair exists uncommitted on
  another branch. Until it lands, phase 542's larger carrier has no real-browser coverage.
- **TEST-MOCK-CYCLE — an import cycle through `src/crdt/inboundLedger.ts` can leave a test's mock of
  it silently unapplied** (found in phase 545). Tests that mock it should assert the mock ran.
- **TEST-NODE-VERSION — local Node is 26; CI pins 24.22.1.**

### The affected account

- **ACCOUNT-UNCONFIRMED — none of phases 538 onward is confirmed on the account that prompted them.**
  Its devices are not the ones measured in earlier phases, and its row counts, document state size
  and snapshot history were never observed.

## Current position — 2026-10-28

Production now serves **b6f0160a**. The [signed release packet](development-evidence/2026-10-28-resumable-sync-release/README.md)
records the tested source/artifact; the rollout and operator walkthrough are recorded in
[infrastructure PR38](https://codeberg.org/oxidationlabs/ol-infra/pulls/38), awaiting the operator's
later review. The operator confirmed the version and ordinary walkthrough checks, then reported
the sustained-use problems below. Preserve both observations; the earlier acknowledgment does not
close the new reports. Startup feels faster and sync slightly faster to the operator, **without
timed evidence or attribution**.

Released work includes sidebar organization/presentation and User vocabulary; the whole date-picker
target; the specified macOS editing bindings and whole-line Cut; the concrete split/merge focus-trap
repair; Duplicate to Scheduled; Gentle context and breadcrumb menus/full outline; optional card
heading breadcrumbs; mobile reorder/handle repairs; Done dimming with interaction restoration; and
the later Goals breadcrumb menu behavior. These entries remain below as historical/product context,
not a request to implement them again. Gboard's intermittent invisible quick entry, continuous phone
deletion smoothness and saving-status layout movement remain open.

Automatic **local** history reduction and durable preparation resumption are enabled in the released
image. Automatic **service** snapshot/admission/pruning remains off. Backup readback cadence/backoff,
opening proof reuse and the catch-up/publication repairs are released; their finite tests do not
establish that every account or physical phone is responsive.

## Immediate post-release reports and architecture discussion — 2026-10-28

- **PERF-STALL — New long input stalls after the release.** The operator reports long pauses on
  mobile open/refocus, and occasional complete desktop input stalls, especially during a long
  sentence. Reported as new in the latest release; no isolated reproduction, duration or cause is
  established yet. Keep this distinct from the earlier pre-edit opening delay and held-backspace
  report. The four accepted scripted journeys passed the unchanged 16ms input and 2.5s peer gates,
  but their p95 measurements do not exclude infrequent long stalls or establish sustained typing/
  focus-return behavior. Reuse existing evidence and investigate these missing paths, including
  longest blocking operations, rather than repeating the entire old baseline.
- **ARCH-WORKER — Keep input/rendering free of account-runtime work.** Requested for discussion,
  not an authorized redesign. Consider moving heavy verification/recovery, history preparation,
  serialization, document replay and their coordination into a browser worker, leaving the page
  responsible for the editor/DOM and a small explicit bridge. Browser account work currently runs
  in the page context; cooperative checkpoints cannot interrupt a single synchronous operation.
  Evaluate a dedicated worker as the active runtime owner separately from service-worker wake/
  suspension behavior. Preserve encrypted local admission before claiming accepted writing:
  the current synchronous journal uses Window localStorage, so fully moving admission requires a
  deliberate acknowledgment/lifetime protocol, not merely replacing a call with postMessage.
  Bound message copying and worker queues; preserve local input priority, undo, key lifetime,
  lock/removal cancellation, stale-message rejection and multi-tab ownership. No worker split or
  changed durability contract is selected. Related: PERF-STALL and UX-18.
- **SYNC-BULK — Catch up to a known frontier without visibly replaying each edit.** The operator
  wants everything available since the last sync fetched promptly on return, rather than waiting
  through successive visible increments. Current reads request one publisher position at a time,
  grouped up to four; the next receive pass waits for the current group's verification/admission.
  Investigate separating a bounded download/staging cursor from the verified durable cursor and
  coalescing UI updates. A finite per-publisher target, streaming or encrypted staging can express
  one logical catch-up without an unbounded in-memory response or delaying all application until
  download completes. Downloaded bytes are not accepted/synchronized writing. Keep ordered proofs,
  fresh authority/witness/commit checks, request expiry, revocation/rotation handling, interruption,
  storage limits and fairness with local editing and other accounts. Existing read requests expire
  after 30s; deferred verification needs an explicit valid-context/revalidation design. Consider an
  admitted snapshot plus tail for deep backlog. No bulk protocol, staging format, worker mechanism
  or service automation is selected; source inspection identifies coupling, not its share of the
  operator's current delay.

These reports lead the next discussion; the older list is not a newly selected implementation order.

**Phase162 — bounded sustained-typing investigation:**
[Evidence and preserved failures](performance-experiments/2026-10-28-goals-stalls/phase162/README.md)
cover a seven-sentence paragraph at80 standardized typing wpm in the released frontend. Mobile CPU
emulation observes120 long tasks during online typing and zero in a fresh offline control; desktop
quiet time also has a922ms task. This implicates network-driven account work on the fixture without
establishing every production cause. The largest mapped application CPU sample weights are private
record comparison/projection and ownership cleanup. Physical Android hidden/suspended return remains
unestablished; only an unlocked focus transition is observed. Preserve the mobile prefix-expectation
failure and the offline control's15s same-context reopen failure alongside independent exact-writing/
offline persisted-profile checks; this is no repair or acceptance result. The proposed worker boundary
keeps the private account owner and state together with a small journal/UI/activity bridge.

**Catch-up objective clarified by the operator:** starting the next download must not require the
current chunk to finish verification and display. Treat downloaded/staged, verified-durable and
displayed progress as separately bounded queues. The [ownership/queue map](performance-experiments/2026-10-28-goals-stalls/phase162/worker-boundary.md)
records the current single-flight/request-cursor coupling and unresolved protocol obligations;
no particular worker or staging implementation is selected yet.

**Phase163 — ownership contract and native feasibility:**
[Kernel and contract](performance-experiments/2026-10-28-worker-owner/phase163/README.md) run the actual
first-device account owner in a worker, with original crypto/native storage and Window passkey/journal
endpoints.14 browser and14 protocol cases pass, including exact writing through normal shipping-reader
reopen, uncertain journal acknowledgments, cancellation and native mixed-owner fencing. The experiment
catches exclusive-Account compatibility and a queued-cohort deadlock; both are preserved, with an
explicit lab-only reservation/barrier/nonqueued-join protocol. Production remains unchanged.

The kernel's shared-memory bridge/isolation headers and lock adaptations are not a selected product
API. Keep local admitted mutation and sealed journal synchronous in the Window for the first
integration; a worker RPC acknowledgment cannot replace that guarantee. Next extract explicit runtime
environment/lifetime ports without changing page execution, then integrate a compatible cohort owner
and bounded admitted Window mirror. Actual Goals/IME/peer gates, phone suspension and large-archive
delta messaging remain untested; no speedup or16ms/2.5s acceptance claim. Independently progressing
download/verification/display queues remain a separate subsequent slice.

**Phase164 — explicit ports, existing page execution retained:**
[Extraction/evidence](performance-experiments/2026-10-28-worker-owner/phase164/README.md) adds fixed
internal activity, native lifetime/retirement and fresh synchronous journal endpoints. Remaining
owner algorithms/public APIs are byte-exact under the declared substitutions. Full2225unit cases,
35native cases,11detected native mutation controls and111metadata cases pass; all old tests remain.
Worker/cohort execution and the admitted Window mirror are still ahead, with local synchronous
acknowledgment, compatibility and all input/peer gates preserved. No performance claim or release
preparation; general qualification stays paused with the new required test uncredited.

**Phase165 — mixed-owner native fencing:** the [internal cohort](performance-experiments/2026-10-28-worker-owner/phase165/README.md)
passes20 Chromium/Firefox native cases and14 new unit cases. Unique incarnation and member leases
reject delayed/replayed joins; actual barriers retain exclusion through drain. Existing Account
factories remain exclusive and application execution stays on the page. The admitted Window mirror
and verified worker composition are still the next slice; no latency or release claim.

**Phase166 — admitted Window mirror:** [implementation and isolated real-account composition](performance-experiments/2026-10-28-worker-owner/phase166/README.md)
preserve the original command/Undo queue and synchronous sealed journal. Eight native account cases
cover held/busy worker, credential/stale-handoff refusal, Window/worker loss, quota and lost commit
reply, each reopening exact writing in the unchanged shipping app. Full2256unit cases/one existing
skip pass. The default app still runs on the page: replace the lab-only storage bridge, bound/stream
large bootstrap and integrate actual Goals/joined/receive/maintenance paths before activation and
input/peer acceptance. No reported-stall closure or performance credit; service automation stays off.

**Authorized continuation,2026-10-29:** complete the worker conversion in bounded phases and sequential
patches, then measure unchanged16ms input/2.5s peer/all-marker/30s targets. Through [175](performance-experiments/2026-10-28-worker-owner/phase175/README.md),
the actual authenticated dedicated-worker owner, scoped async journal transport, original admitted
Window mirror, native lifetime fences, bounded advisory activity and safe hot context rebinding are
implemented internally. Default application execution is still on the page. Full2336unit cases/one
existing skip,36native cohort cases and17rebuilt real-account Worker/page cases pass, including actual
native first/replacement eras, queued input, cancellation and lost reply with shipping cold reopen. [173](performance-experiments/2026-10-28-worker-owner/phase173/README.md)
repairs state observation with unchanged original assertions/deadlines; complete admission/journal/
lifetime campaigns and every fault control pass. Earlier failed attempts remain recorded.

[176](performance-experiments/2026-10-28-worker-owner/phase176/README.md) adds a genuine task-held
acknowledged receive finish, retaining the unchanged Page path;104 focused/42 native cases pass.
[177](performance-experiments/2026-10-28-worker-owner/phase177/README.md) adds actual Worker-owned
network login/signed receive, bounded original-frame transport and acknowledged final apply.20 native
account cases,2375 units/one skip pass; default execution is still Page.
[178](performance-experiments/2026-10-28-worker-owner/phase178/README.md) preserves joined physical
custody/logical Account scopes through actual native admission, Undo, era handoff and cold reopen.
21 native cases and2384 units/one skip pass.
[179](performance-experiments/2026-10-28-worker-owner/phase179/README.md) copies fresh journal context
inside the actual final task held through Window rebinding, with shared one-use acknowledgment.
Next original sync/workspace composition and bounded scheduling hints, resumable automatic preparation, fresh
ceremony ownership, all application/Local routes and offline artifact integration. Only then run the
original performance workloads. Data messages, queue fences and cached snapshots confer no native
verification authority. Preserve synchronous sealed input, actual native final checks and security
boundaries. Service history automation stays off; no preview/commit/push/release work is authorized
by this continuation. These implementation phases supersede the original discussion-only status.

## UX follow-ups and retained implementation context

- **UX-01 — Left sidebar.** Rework its organization, hierarchy and interactions. Review everyday
  navigation alongside identity/preferences, installation, local protection and sync setup.
  **Released organization/presentation repairs;** further polish needs concrete follow-up observations.
- **UX-02 — Account wizard presentation.** Polish the setup, connection and recovery screens. Review
  spacing, typography, hierarchy, credential explanations and indications of progress together, while
  preserving the agreed security steps and restart/retry behavior.
- **UX-03 — Friendlier styling.** Explore alternatives to the current visual style. The interface should
  get out of the way, but it may currently read as severe. Compare directions before choosing one;
  friendliness and visual quiet both matter.
- **UX-04 — macOS editor shortcuts.** Identify the specific broken or awkward shortcuts and reproduce
  them on Mac. Check native editing expectations, browser conflicts, selection and undo behavior before
  changing bindings. **Released:** native Option-Backspace, Cmd-] indentation, disabled Cmd-Enter
  checkbox cycling, Enter finishing card editing, Shift-Enter newline and three-Shift-Enter splitting;
  whole-line Cmd-X is covered by UX-17. Further conflicts need a specific report.
- **UX-05 — Mobile formatting controls.** Explore a small extension above the on-screen keyboard with
  one-tap heading and list formatting, especially in Goals. Evaluate keyboard/viewport behavior,
  selection, focus and available writing space on actual phones.
  [Investigation62](product-design/2026-10-23-goals-context/mobile-formatting.md), 2026-10-23,
  recommends a Goals-only in-app strip using existing CodeMirror panels/admitted commands, with
  a stable editor-attached fallback. Perfect keyboard docking is not universally standardized;
  composition/focus behavior must select the approach before implementation. No library or app
  code was added, and no toolbar implementation is selected yet.
- **UX-06 — Continuous mobile deletion.** The operator's barometer: “can I hold down backspace on mobile
  and watch the line disappear without pauses?” Pauses remain. Reproduce and measure sustained deletion
  on a physical phone, including while sync is active, alongside the existing typing measurements.
  Preserve writing, undo and durability guarantees while attributing the pauses. On 2026-10-23,
  after the sync release, the operator reports improvement but periodic pauses remain during held
  deletion on a phone; longer pauses also show the syncing warning. Native-input smoothness is not
  established. This UX patch series records the observation without claiming a performance repair.
  **2026-10-26:** Goals-only slowdown partly improves with Gentle context off. Later released82 adds
  numeric interval reuse/no-op effect suppression;83–84 prioritize sync over local-history preparation.
  Long synthetic backspace probes also fail
  final-text checks on both released/candidate builds; capture focus, selection, admitted operations
  and actual final text before attributing that failure. [Evidence](performance-experiments/2026-10-26-goals-context/README.md).
  **2026-10-28:** the final four desktop journeys pass the16ms gate
  ([scoped results](performance-experiments/2026-10-28-envelope-projection/phase156/README.md)); native
  phone deletion smoothness remains unestablished. PERF-STALL records the new sustained-use report.
- **UX-07 — Saving-status layout movement.** “Still saving” warnings currently move the text around.
  They make remaining latency visible during debugging, but this movement is unacceptable in the user
  experience. Keep save state truthful while making status changes preserve editor layout, selection,
  focus and scroll position. Treat the underlying delay and its presentation as separate problems.
- **UX-08 — Goals to day view.** Explore a more intuitive, inline or contextual way to bring material
  from Goals into the day view than the buttons at the bottom of the screen. Compare interactions on
  desktop and mobile; decide the interaction before changing movement/copying semantics. **Parked:**
  the operator retained footer controls after comparing nearby alternatives; see UX-20.
- **UX-09 — Day-card Markdown fit.** Reopen the discussion about whether the underlying Markdown format
  fits the day-card view. First clarify the concern: authoring, rendering, card boundaries, storage or
  export. No replacement format is selected. Consider existing writing, import/export fidelity and
  compatibility if a proposal changes stored representation. The separate day-container question below
  is related technical history, not an assumed answer to this design question.
- **UX-10 — Copy or move a Goals list item with its subtree.** Agreed in discussion on 2026-10-17;
  pending implementation. The current list item becomes the card title, and its descendants become
  the card body. Include the whole subtree until the next sibling or ancestor; retain the descendants'
  relative nesting inside the card. Acting on a child includes only that child's subtree, not its
  siblings or parent. For several selected sibling items, create one card per item, each carrying
  its descendants. Do not also create duplicate cards for children already included through a parent.
  Copy retains the source subtree; Move transfers the entire subtree in one undoable action.
  For example, `Plan the trip` with children `Book trains` and `Find somewhere to stay` becomes one
  card titled `Plan the trip` with those children as a Markdown list in its body; any grandchildren
  stay nested beneath their parent. This adds transfer semantics alongside UX-08's separate question
  about where the controls belong. Multiline cards remain essential. The later released keyboard
  changes use three **Shift-Enters** to split; Enter finishes editing. No new content format is selected.
- **UX-11 — Goals lenses for scanning and gathering.** The operator primarily scans Goals to gather
  possible work, rather than sending items across while writing. As the document grows, surveying it
  becomes burdensome. Explore low-effort ways to bring relevant writing into focus without requiring
  the user to formulate a search or supply extensive categorization. Heading navigation already exists
  and does not answer the whole need. Preserve the premise that actively prioritizing helps the user
  do the work; automatic recurring tasks or AI-selected priorities are not the solution requested here.
  This is a design problem to explore, not a selected lens or implementation.

  **Direction updated 2026-10-23:** the operator withdrew gathering/the gather tray as too rigid.
  Continue with scanning instead. [Design study61](product-design/2026-10-23-goals-context/README.md)
  compares folds in the original document with a compact reading projection that exposes nested
  items and notes in source order. Neither alternative is selected for implementation.

  **Browser-review clarification, 2026-10-23:** retain the formatted live-preview editor and caret
  syntax reveal; no separate scanning mode or outliner. [Revision64](product-design/2026-10-23-goals-context/editor-study.md)
  compares gentle caret-context dimming, per-crumb menus, experimental scroll-opening and a reading
  rail. None is selected for application implementation.

  **Selected 2026-10-25:** gentle context with a settings-sidebar toggle, default on, plus
  per-breadcrumb menus **and retention of the existing full-page outline dropdown**. Preserve the
  formatted editor and caret reveal. Scroll-opening and the reading rail are parked after review;
  a fixed viewport/percentage boundary does not establish the operator's attention. See the
  [selection and remaining details](product-design/2026-10-23-goals-context/selection-2026-10-25.md).
  That design selection alone did not authorize implementation; subsequent authorization did.

  **Implemented in phases66–68, subsequently released:** operator authorization includes
  the offscreen-caret fallback. Gentle context defaults on, has an immediate browser setting, and
  per-heading menus complement the full outline in the same formatted editor. Bounded unit/browser
  evidence and remaining limits are in the [implementation record](development-evidence/2026-10-25-goals-navigation/phase68/README.md).
  Later released changes refine context performance and root/child menu navigation. The full outline
  remains available; scroll-opening, the reading rail and gather tray remain parked.

- **UX-12 — Card focus trap.** Reported 2026-10-23 after an unknown desktop Tab/modifier
  sequence. Patch42 reproduces a concrete trap after split/merge: outside blur leaves a saved
  focus request, reopening the editor and stealing later input. Regression checks cover outside
  click and action Tab navigation. **Released.** This explains one path, not every possible focus defect.
- **UX-13 — Intermittent invisible mobile quick entry.** Android with Gboard: the Today add-item
  field sometimes shows no text and Add stays disabled while keyboard suggestions follow typing.
  The operator does not recall a reliable trigger; suggestion taps have also worked normally.
  Track separately from UX-12 and from IME-confirmation handling. Do not infer a physical-phone
  repair from synthetic events or a Chromium mobile user agent. Patch43 separately repairs
  IME confirmation being mistaken for submission; the intermittent phone symptom stays open.
- **UX-14 — Duplicate cards to Scheduled.** Add a Duplicate control in Next, Done and Scheduled,
  retaining the source and copying its whole multiline body into a new Scheduled card. Preserve
  writable-day and durability rules; do not turn duplication into movement out of Done. **Released.**

- **UX-15 — Sidebar presentation and user-facing vocabulary.** Requested 2026-10-23, **released**
  in the sidebar repair series. The request covered styling, spacing, vertical rhythm and visual balance in Account
  and the other sidebar sections. The operator’s [Account screenshot](product-references/2026-10-23-sidebar-account.png)
  is the visual reference: form rows are crowded while section/action spacing and control
  alignment feel uneven. Prefer **User** to **Actor** in the visible identity label; this is
  wording for the interface, not a change to internal actor identity or authorization.
  Related to UX-01/UX-03; broader stylistic exploration remains separate from this completed repair.
- **UX-16 — Whole date control opens the native picker.** Requested 2026-10-23, **released**.
  The original report was that only the calendar icon opened the picker. The repair makes the
  displayed date and calendar icon one complete click/tap target, retaining native date selection
  and keyboard access. The earlier overlay implementation alone did not establish full-area opening
  in every browser; bounded evidence for the repair is recorded below.
- **UX-17 — macOS whole-line Cut.** Requested 2026-10-23, **released**. Cmd-X originally appeared to do nothing
  when the operator expects the current whole line to be cut. With no text selected, copy
  the whole line to the clipboard and delete it; retain ordinary cutting of a selection.
  Preserve clipboard success/refusal, native user-gesture permissions, storage admission,
  undo and line/EOF boundaries
  without deleting writing that was not successfully copied. Extends UX-04; implementation
  and bounded regression evidence are recorded below.

- **UX-18 — Background sync and ready-on-return feasibility.** Queued 2026-10-23 as a
  design investigation, **not implementation**. The operator wants an unfocused PWA to keep
  up so reopening does not begin with a catch-up wait. Treat “sync likely pauses on unfocus”
  as a reported concern to trace, not an established browser-independent cause.
  - Distinguish an unfocused but running window, hidden tab, minimized app, suspended process,
    phone screen lock, closed app and an explicitly locked workspace. Establish what the app
    stops itself versus what the browser/OS stops, including the existing notifications,
    reconnect and lifecycle owners. Measure transfer, verification and apply time separately.
  - Produce a current browser/OS capability matrix for desktop Chrome/Firefox and mobile
    Android/iOS, installed and ordinary-tab contexts. Evaluate service-worker Push, one-off
    Background Sync, Periodic Background Sync and foreground continuation where supported;
    verify wake/time/permission constraints, battery/data costs and delivery guarantees from
    primary documentation and device observations. No mechanism or compatibility claim is
    selected by this queue entry.
  - Compare keeping the existing unlocked runtime working, background transfer of encrypted
    records for later verified application, and full background verification/application.
    Identify authentication, key custody, renewal, multi-tab/storage ownership, replay and
    retry requirements for each. Preserve fresh authority/history checks and canonical storage
    admission; downloaded ciphertext or a notification must never count as accepted writing.
  - Keep existing protected-workspace lock/sign-out/removal guarantees. Do not persist unlock
    secrets or silently add remembered unlocking to enable background work. If an option needs
    a changed guarantee, make that an explicit separate decision; remember-me remains deferred.
  - Deliver a recommendation with tradeoffs, bounded implementation phases/effort, an honest
    fallback when background work cannot finish, and physical-device acceptance measurements
    across background/return boundaries. Target writing already caught up on return where
    feasible, without promising continuous execution or immediate freshness without evidence.
  Related: device-setup interruption, UX-06/UX-07 and the separately deferred WebSocket transport
  question. Investigate lifecycle and transport separately; switching transport is not a
  selected remedy. No runtime or service-worker changes authorized by this reminder.

**Implementation/investigation status, 2026-10-23:** UX-15 is implemented in patch48
(sidebar layout and User vocabulary); UX-16 in patch49 (whole native date target); UX-17 in
patch50 (whole-line Cut with clipboard/storage guards). UX-18’s investigation is complete in
patch51: [findings and proposed next phases](background-sync-feasibility.md). Background sync
behavior is unchanged; physical-device lifecycle evidence is still needed before selecting a repair.
[UI evidence and limits](development-evidence/2026-10-23-sidebar-cut-background/README.md).

## Earlier conversation items retained

- **UX-19 — Automatic card context from Goals headings.** Requested 2026-10-23 for specification
  before coding. [Study61](product-design/2026-10-23-goals-context/README.md) mocks a captured heading
  breadcrumb and compact-label alternative. The initial study left capture, snapshot/live behavior,
  encryption and export/import policy open; the implementation below resolves those choices.
  Browser feedback approves breadcrumb placement only: preserve existing card styles/chrome.
  [Revision64](product-design/2026-10-23-goals-context/editor-study.md) reuses the current renderer/CSS.
  **Implemented in phases69–72, subsequently released:** card transfers keep advisory heading
  snapshots in encrypted workspace content. Paths appear beneath existing card writing with no
  leading icon. Account → Editor has a default-on, browser-local display switch; hiding does not
  erase context or stop capture. Optional export sidecars preserve Markdown. Mixed old clients may
  omit/retain stale advisory metadata; no live backlink, backfill or Move-back command is added.
  [Implementation evidence](development-evidence/2026-10-25-card-breadcrumbs/phase72/README.md).

- **UX-20 — Move/copy controls near the source.** Requested 2026-10-23; extends UX-08.
  [Study61](product-design/2026-10-23-goals-context/README.md) compares an explicit gutter popover
  with an attached action strip. Whole-subtree scope, current destination day and one-step Undo
  remain requirements; no application placement or new transfer implementation is selected.
  **Parked after browser review:** keep the existing footer controls; neither extra popover nor
  attached strip is selected. Desktop transfer shortcuts remain a separate candidate, with native
  editing/browser conflicts and exact bindings to be resolved.
- **UX-21 — Return a card to Goals using captured heading context.** Proposed by the operator on
  2026-10-23. Resolve the longest current root-prefix heading match, disclose ambiguity/missing paths,
  and append in a way that preserves the intended heading scope. The parent-with-subheadings insertion
  problem, multiline encoding and missing-context policy are recorded in
  [revision64](product-design/2026-10-23-goals-context/editor-study.md). No command is implemented.

- **Paid sync and storage.** The operator wants to charge for hosted sync/storage and address this
  before formal qualification. Pricing, entitlements and the associated UX need their own design pass.
  [PRD §11 question 1](./PRD.md#11-remaining-product-questions) retains the earlier pricing question;
  its older “downstream” wording is not the operator's current scheduling preference.
- **Remember me.** Design an optional way to avoid repeated local unlocking separately from onboarding.
  Keep existing protected workspaces protected. Remembered network login and remembered local unlocking
  are different mechanisms; the presence of one does not settle the other.
- **Goals and Next naming.** Keep both names for now; revisit whether they communicate the paper-list
  metaphor and the distinction between the running notes and what matters now.
- **Mascot.** Revisit the fastidious snail: a todo list carrying its house on its back. This remains a
  separate creative pass.
- **Agent integrations.** Deferred, reaffirmed by the operator on 2026-10-17. Keep advisory assistance
  separate from agents that can author writing as authorized members. Roles/capabilities, enrollment,
  attribution and the human's control need a dedicated design before implementation.
  [PRD phases 5 and 6](./PRD.md#10-phasing) retain the earlier scope; UX-11 does not authorize agents
  to prioritize on the user's behalf.
- **Possible multiuser support.** Retain human collaboration as a separate exploration: invitations,
  sharing, permissions, attribution and navigation across workspaces need their own product and
  authorization design. No commitment to build it or change the current single-person experience.
  [PRD deferred scope](./PRD.md#11-remaining-product-questions).
- **WebSockets instead of SSE.** Revisit the transport choice as deferred engineering work, as recalled
  by the operator on 2026-10-17. The current notification design uses authenticated fetch streaming
  with SSE framing; no replacement is selected by this reminder. Establish the intended benefit and
  preserve authorization, bounded reconnect/catch-up and the rule that a notification is not approval
  or content authority. [Current notification design](./account-sessions-subscriptions.md#6-notifications-fetch-streaming-with-sse-framing).
- **Disappearing desktop account.** Keep the production Firefox incident open for new evidence. The
  recorded-action audit found no recorded computer-use action targeting production, and the tested
  Chromium upgrade paths preserved their data; neither establishes the cause of the Firefox incident.
  Preserve the [investigation and limitations](./development-evidence/2026-10-16-account-upgrade-investigation/README.md),
  including the early-bootstrap offline-unlock failure and missing Firefox-specific upgrade coverage.
- **Device setup under interruption.** Revisit phone screen lock/backgrounding and incremental replay
  resumption. Recent progress and bounded retry work does not establish continued work while the OS
  suspends the app. The [enrollment evidence](./performance-experiments/2026-10-16-enrollment-throughput/README.md)
  retains the tested behavior and physical-device limitations.
- **Reconnect versus account recovery.** The production walkthrough exposed a UX gap: reconnecting a
  missing browser when another device still works should be clearly distinguished from recovery that
  disconnects previous devices. Review guidance and progress feedback without silently changing the
  authority of either flow.

## Older written questions to check against the current app

These are leads recovered from older documents, not a claim that every item is still unimplemented.
Confirm current behavior and subsequent decisions before promoting one into an active phase.

- **Long Goals navigation:** section focus, heading folding, manual archive and search/command palette.
  [PRD §4.9](./PRD.md#49-long-document-navigation) records the intended sequence and the distinction
  between navigation, temporary focus and changing text.
- **Card splitting:** whether three consecutive returns is discoverable and the right threshold.
  [PRD §4.8](./PRD.md#48-editing-experience) and §11 question 6 retain this as a tunable interaction.
  Discussion on 2026-10-17 confirms multiline cards matter. Later released keyboard changes retain
  splitting on three Shift-Enters while Enter finishes editing; UX-10 is still unimplemented.
- **Done ordering after concurrent day creation:** observe whether reconstructed ordering is visibly
  wrong in real use. [TRD §10.8](./TRD.md#108-a-days-collections-are-containers-created-concurrently--deferred)
  records the mitigation, root-type alternative, migration costs and triggers for reopening it.
- **Identity/presence details:** stale-device muting, same-kind device disambiguation, provenance-mode
  controls, and local versus remote caret distinction in both themes. Some device naming/code work has
  already landed; reconcile these older questions with it rather than reopening settled behavior.
  [PRD §11 questions 3, 4, 9, 14 and 15](./PRD.md#11-remaining-product-questions).
- **Installed-app storage context:** verify whether the installed PWA and ordinary tabs share storage
  on each supported platform; avoid treating installation as either shared or independent by assumption.
  [PRD §11 question 16](./PRD.md#11-remaining-product-questions).
- **Operational recovery:** automatic reconciliation remains a separately deferred protocol decision;
  first publication selected operator-led recovery with explicit possible writing loss.
  [Recovery choices](./recovery-options.md) retains the alternatives and failure assumptions.

There may be other older conversation-only items. This recovery pass checked the repository's product
questions, decision/completion records and the available conversation; it is not an exhaustive
reconstruction of every past session. Add newly recalled items here with their source and status.

## Automatic history maintenance — reported 2026-10-26, status updated 2026-10-28

Growing-account open/sync delay is reported, without attributing the current account's cause.
[Private scheduling73](./account-local-retention-automatic.md) reuses the earlier depth and preparation
studies and adds automatic calls to the existing local removal owner. Capacity/refusal presentation,
activation/rollback policy and durable resumable preparation are implemented. The released image
enables local reduction and resumption; source defaults and image activation are distinct. Physical
phone responsiveness remains a concern, including PERF-STALL. Separately consider automatic server
snapshot/admission/pruning without weakening the two-snapshot or multi-device rules; it remains off.
No user-visible writing is selected for age-based deletion. Do not repeat the already completed
preparation-task optimization as though it were still outstanding.

**Follow-up74–75:** local capacity/refusal presentation and paced explicit retry are implemented, with
quiet ordinary deferrals and a collapsed Data marker for persistent issues. The coherent automatic
release profile and compatible reader rollback were implemented/tested before activation. The
[runbook](./account-local-retention-activation.md) covers build-time flags and cached-client adoption.
Later production releases activated local reduction, most recently with durable resumption in
b6f0160a. Automatic service snapshots/admission/pruning remain separate and disabled.


## Startup and backup follow-ups — reported 2026-10-26, status updated 2026-10-28

- **PERF-OPEN — Active synced account takes about a minute before editing.** Reported on the phone
  after the operator confirms covered service history was pruned. Service pruning and device-local
  baseline reduction are separate; check whether the latter completed before attributing startup.
  Trace numeric unlock/authentication/classification/replay/render phases on the actual slow path;
  reuse existing depth evidence rather than repeat a broad sweep. Preserve all authority/lifetime
  and replay guarantees. The operator locates the wait after code/passkey entry, under a stale
  passkey title. Phase91 fixes that presentation and adds opt-in numeric census/opening timings;
  Back aborts/drains rather than removing data. Later [Android traces119–120](performance-experiments/2026-10-27-android-opening/phase120/README.md)
  capture the slow opening and confirm a reduced local baseline after maintenance; the operator then
  reports opening around7s. [First-conversion investigation121](performance-experiments/2026-10-27-android-opening/phase121/README.md)
  identifies repeated validation, without establishing how the phone's entire maintenance wait was
  spent. Same-owner/first-conversion proof reuse and resumable preparation are now released. The
  latest report describes improved startup qualitatively and new open/refocus stalls (PERF-STALL);
  it is not a timed phone confirmation of the remaining opening cost.
- **OPS-B2 — Released (phase90 and subsequent evidence).** The operator selects one remote
  verification cycle/hour, including unfamiliar retained keepers, and five-minute local encrypted
  checksums. New uploads stay prompt; receipts remain distinct from verified recovery-point credit.
  Quota circuits/backoff and retained exact-version receipts stop unchanged reuploads and redundant
  readback. A download cap pauses reads/pruning until UTC reset while allowing new uploads. Exact
  readback still gates anchor/keeper/prune credit. The cap is unchanged. New uploads can remain
  unverified for an hour; local checksum is not decryption/restore proof. Release checks do not
  grant aggregate qualification credit; general qualification remains paused.

[Discussion, source evidence and boundaries](development-evidence/2026-10-26-account-startup-and-backup-cadence/README.md).
These follow-ups were included in the later b6f0160a release; the linked packet records their earlier
development state rather than current deployment status.


## Catch-up performance — 2026-10-27

- **PERF-RECEIVE-COPY — Released, initially implemented in94.** Read preparation/status were copying all inbound
  receipt histories before selecting a publisher or scalar result. Project cursor metadata inside the
  existing verified owner before detached copying. Real encrypted receiver regressions observe zero
  retained payload copies while preserving old-position replay, conflicts and cold/reduced-baseline
  behavior; all old tests remain byte-exact. Synthetic copy timings support the mechanism, not total
  catch-up latency. Later matched whole-client work rebuilt both clients with the original
  responsiveness/durability/fairness gates intact, culminating in the four passing
  [phase156 journeys](performance-experiments/2026-10-28-envelope-projection/phase156/README.md).
  Earlier failures and scope limits remain recorded. The operator's new input-stall report and
  bulk catch-up question are open above; no service-only timing establishes these client outcomes.
  [Initial checkpoint](performance-experiments/2026-10-27-receive-projection/README.md).


**Phase180 — scheduling bridge:** one outstanding observation plus latest state; no input-handler
RPC or fake update frames. Original barrier remains authoritative.2400 unit cases/one existing skip,
40 focused and98 metadata pass; Page/native/scheduler logic retained. Composed Worker integration is
next; default app still Page, unchanged performance gates pending. [Evidence](performance-experiments/2026-10-28-worker-owner/phase180/README.md).


**Phase181 — composed final queues:** original prepared receive and fenced context mutation now
have bounded Worker/Window data handoffs.48 controlled focused cases/98 metadata pass, including
refusal retirement after a caught deadlock; no native/latency claim. Original runtime bodies exact,
application still Page. Next connect original composition/bootstrap. [Packet](performance-experiments/2026-10-28-worker-owner/phase181/README.md).


**Phase182 — actual composed Account Worker:** original scheduler/native operations now use the
real Window mirror/queues in the internal path.2417 unit cases/one skip,24 focused,98 metadata,
34 existing session-client cases pass;27/28 real native matrix, with joined late-marker deep catch-up
still over30s (continued progress and429 retained). No timing/activation credit. Next native-owner
retirement propagation, automatic context changes and remaining application integration; default app
still Page. [Evidence](performance-experiments/2026-10-28-worker-owner/phase182/README.md).


**Phase183 — native retirement coupling:** both real before failures (native member gone but
Window still active) repaired by direct carrier-signal retirement and reentrant-safe shutdown. Six
affected native cases,50 focused and98 metadata pass; original native checks/drain/obligations remain.
Default app still Page. Continue context/UI/resumable/Local/ceremony/offline conversion;182 deep
joined late-marker continuation remains open. [Evidence](performance-experiments/2026-10-28-worker-owner/phase183/README.md).


**Phase184 — automatic context coherence:** genuinely certified epoch3->5 now refreshes the
Window source context before later input. The complete prior receive-source control still captures3;
current captures5 and preserves commit/Undo/cold replay, including input/flush during proof checking.
42 affected unit/98 metadata checks pass; old checks/blocks remain. Continue UI/resumable/Local/
ceremony/offline integration before default activation and timing gates. [Evidence](performance-experiments/2026-10-28-worker-owner/phase184/README.md).


**Phase185 — Worker session/UI ports:** bounded public status and explicit original actions pass
controlled and five real Worker checks. Original jitter regression repaired in the bridge only; all
native/security/scheduling checks remain. Continue cancellation, terminal outcomes, resumable work,
Local/ceremony lifetimes and offline/default activation before performance acceptance.
[Evidence](performance-experiments/2026-10-28-worker-owner/phase185/README.md).


**Phase186 — scoped passkey cancellation:** independent reconnect cancellation no longer depends
on closing the editor; late assertions are rejected and erased. Controlled fault sensitivity and six
actual Worker checks pass. Original native verification retained. Continue remaining UI/configuration,
resumable, Local/ceremony and offline/default boundaries before acceptance.
[Evidence](performance-experiments/2026-10-28-worker-owner/phase186/README.md).


**Phase187 — Worker resumable local maintenance:** isolated read-only observation cannot authorize
mutation; progress save/removal retain fresh final head checks. Actual saved-slice/cold-resume/7275-row
reduction/input/Undo/original-read passes with network scheduling parked. Preserve separate30s catch-up
failure. Next repair: full-history validator still emits revision0 after a snapshot advances actual
predecessor to1, causing a correct native refusal on later maintenance. Then continue remaining Worker
configuration/terminal/Local/ceremony/offline integration before timing acceptance.
[Evidence](performance-experiments/2026-10-28-worker-owner/phase187/README.md).


**Phase188 — stale maintenance predecessor repaired:** full-history scheduling now uses the
existing metadata revision after validation, preserving the original wrong-predecessor refusal.
Primary/joined Worker warm/cold and real resumable reduction checks pass. Continue configuration,
terminal UI, Local/ceremony and offline/default integration. Separate catch-up outcomes remain open;
no performance acceptance claim.
[Evidence](performance-experiments/2026-10-28-worker-owner/phase188/README.md).


**Phase189 — Worker retirement notices:** actual native removal now keeps its original Window
explanation after the command channel closes. Fresh verified readiness clears its matching notice;
locked/unrelated accounts do not. Prior-control failure/six current native passes retained; no false
removal or cleanup-success inference. Continue live configuration, Local/ceremony and offline/default
integration before timing gates.
[Evidence](performance-experiments/2026-10-28-worker-owner/phase189/README.md).


**Phase190 — live capability updates:** open Workers now observe matching-pin updates without
polling/retry reset. Native discovery3->5/input/cold read and late-refusal key erasure regressions
pass, with both failing controls retained. Continue Local/ceremony lifetime proofs and offline/default
integration before measuring unchanged gates. Default Page and separate catch-up outcomes remain.
[Evidence](performance-experiments/2026-10-28-worker-owner/phase190/README.md).


**Phase191 — Local ownership:** retain existing shared writers, independently pin actual Worker client,
real native phase permits and physical fences through cleanup. Native coexistence/exclusion/replay/failure
and Account controls pass. Continue Local journal/mirror and ceremony/default/offline conversion before
unchanged timing gates. [Packet](performance-experiments/2026-10-28-worker-owner/phase191/README.md).


**Phase192 — Local native carriers/recovery:** original factor/census/crypto and exact Page cold reads
pass with cancellation, wrong-code preservation and single async recovery ownership. Continue Window
Local admission/Undo, ceremonies/default/offline conversion before unchanged timing gates.
[Packet](performance-experiments/2026-10-28-worker-owner/phase192/README.md).


**Phase193 — Local Window admission/Undo:** busy Worker zero-RPC sealed input, quota fallback, native
loss recovery and old/new-writer CRDT union pass. Carry over Local maintenance before startup/ceremony/
offline/default activation and unchanged timing gates.
[Packet](performance-experiments/2026-10-28-worker-owner/phase193/README.md).


**Phase194 — maintenance boundary:** pending-native-lock alternative rejected by browser falsifiers;
no candidate runtime retained. Continue with Worker heavy verification/preparation plus a narrowly owned
Window final commit preserving fresh synchronous journal validation. Default Page; conversion/gates
remain pending. [Packet](performance-experiments/2026-10-28-worker-owner/phase194/README.md).


**Phase195 — authenticated journal observations:** actual old shared writer causes stale comparison
refusal; fresh read matches, plaintext erases and IDs expire in Chrome/Firefox. Continue actual Local
maintenance head/final native Window commit, ceremonies and offline/default conversion before unchanged
timing gates. [Packet](performance-experiments/2026-10-28-worker-owner/phase195/README.md).


**Phase196 — Local maintenance foundations:** actual head expiry/interruption and owning parser are
covered, original native automatic maintenance retained in Chrome/Firefox. Continue bounded encrypted
census/final Window commit then remaining worker startup/ceremonies before unchanged timing gates.
[Packet](performance-experiments/2026-10-28-worker-owner/phase196/README.md).


**Phase197 — Local worker automatic maintenance retained:** actual stale journal refuses deletion,
fresh retry and foreground interruption preserve exact cold writing in Chrome/Firefox. Continue
hard-death withdrawal, startup/ceremony/default/offline conversion before unchanged performance gates.
[Packet](performance-experiments/2026-10-28-worker-owner/phase197/README.md).


**Phase198 — native hard-death withdrawal:** Window automatically retires without port acknowledgement,
sealed data cold-replays and fresh Worker opens without lock leak. Continue startup/ceremony/offline/
default conversion before unchanged gates.
[Packet](performance-experiments/2026-10-28-worker-owner/phase198/README.md).


**Phase199 — read-only Local startup moved:** actual native protected/automatic routing and legacy
preservation pass in Chrome/Firefox; supervisor cannot substitute for storage owner. Continue genesis/
resumption/protection then account ceremony/default/offline conversion before unchanged timing gates.
[Packet](performance-experiments/2026-10-28-worker-owner/phase199/README.md).


**Phase200 — Worker Local genesis/resumption:** original code/factor and one-winner creation survive
physical interruption and retained protected custody stays protected. Continue Local protection with
safe original exclusive journal cleanup, account ceremonies and app/offline/default conversion before
unchanged timing gates. [Packet](performance-experiments/2026-10-28-worker-owner/phase200/README.md).


**Phase201 — read-only journal transport:** one scoped bounded implementation, actual Worker AEAD,
no mutation/pinned permission for startup supervisor. Continue original protection with target coverage/
retirement proof, then account ceremony/UI/offline/default conversion before unchanged gates.
[Packet](performance-experiments/2026-10-28-worker-owner/phase201/README.md).


**Phase202 — represented journal preparation:** actual exclusive scope, original source/target crypto
and full byte equality verified after content retirement; uncovered valid ciphertext remains. Continue
protection matched cleanup/lost-reply/resume then account/UI/offline/default conversion before gates.
[Packet](performance-experiments/2026-10-28-worker-owner/phase202/README.md).


**Phase203 — native Local protection:** exact covered cleanup and interruption/lost-reply/death/resume
checks pass in both browsers. Continue actual Local UI, Account ceremony/handoff and offline/default
conversion before measuring unchanged gates. [Packet](performance-experiments/2026-10-28-worker-owner/phase203/README.md).


**Phase204 — complete Local UI Worker adapter:** full original controller flows pass both browsers;
Page remains default until Account same-realm ceremony/handoff and offline activation are ready.
[Packet](performance-experiments/2026-10-28-worker-owner/phase204/README.md).


**Phase205 — Account entry foundation:** extracted original owner and fixed203 runtime dependency cycle.
Continue same-realm ceremony/UI/default conversion. OPEN: composed history-rebind old packaged cold
reader misses15s on candidate twice while204 predecessor passes; retain and resolve before acceptance.
[Packet](performance-experiments/2026-10-28-worker-owner/phase205/README.md).


**Phase206 —205 evidence closure:** corrected packaging recorded separately without replacing205.
Same-realm handoff continues as207.205 cold-reader blocker remains open.


**Phase207 — native lifetime handoff:** same Worker realm with fresh actual Account ownership passes
both-browser functional/failure checks. Next genuine setup/recovery approvals, Account UI/credentials
and offline/default activation, then unchanged gates;182/187/205 blockers remain.
[Packet](performance-experiments/2026-10-28-worker-owner/phase207/README.md).


**Phase208 — genuine native approvals:** same-realm handoff consumes original approvals without an
extra prompt, reuses login and rejects a copied approval. Next actual wizard/browser/workspace ports
and offline/default activation before measurements;182/187/205 failures remain open.
[Packet](performance-experiments/2026-10-28-worker-owner/phase208/README.md).


**Phase209 — avoid duplicate initialization mechanism:** original final Account journal/generation
checks already cover native opening. Continue explicit wizard browser/workspace ports and same-realm
handoff, retaining original final-owner boundary. [Packet](performance-experiments/2026-10-28-worker-owner/phase209/README.md).


**Phase210 — minimal wizard workspace port:** Page behavior/native checks retained, async name reads
and immediate shutdown supported. Next credential port/native coordinator/Account UI/offline/default
activation before gates.182/187/205 remain open. [Packet](performance-experiments/2026-10-28-worker-owner/phase210/README.md).


**Phase211 — credential effect port:** one provider lifetime, original verification and JSON/slot
wire checks pass. Next idle ceremony reservation contention and native wizard wiring/offline/default
activation before measuring unchanged gates;182/187/205 remain open.
[Packet](performance-experiments/2026-10-28-worker-owner/phase211/README.md).


**Phase212:** idle setup no longer blocks unrelated fresh Account ownership; actual native slot-task fencing remains. Next native wizard/browser/workspace handoff, recovery/enrollment, offline/default activation, then unchanged measurements. [Packet](performance-experiments/2026-10-28-worker-owner/phase212/README.md).


**Phase213:** original setup browser effects isolated; compact planning snapshot retains all obligations and limit. Next native setup composition/context and stable controller channel; defaultPage, unchanged gates pending. [Packet](performance-experiments/2026-10-28-worker-owner/phase213/README.md).


**Phase214:** same-realm setup refs plus canonical name effects verified. Next original native controller with stable UI control and quiescent handoff, enrollment/recovery/offline/default activation, then unchanged gates. [Packet](performance-experiments/2026-10-28-worker-owner/phase214/README.md).


**Phase215:** tracked ceremony phase and fixed command/display projection ready. Next stable native UI control and actual controller handoff; defaultPage and performance acceptance pending. [Packet](performance-experiments/2026-10-28-worker-owner/phase215/README.md).


**Phase216:** original returning setup runs in native Worker through actual canonical mirror. Next fresh creation/promotion and failed-opening retry, enrollment/recovery, offline/mixed/default activation, then unchanged targets. One independent Window slot-index lookup deliberately retained. [Packet](performance-experiments/2026-10-28-worker-owner/phase216/README.md).


**Phase217:** complete native fresh and returning/cancel-retry flows verified; keep original initializer. Next lifetime edge cases, enrollment/recovery, PWA/offline/default activation, then unchanged measurements. [Packet](performance-experiments/2026-10-28-worker-owner/phase217/README.md).


**Phase218:** bounded cancellable presentation transport verified; reuse for remaining native device/recovery hosts without sharing authority. Next those flows, offline/default activation, then unchanged measurements. [Packet](performance-experiments/2026-10-28-worker-owner/phase218/README.md).


**Phase219:** both original enrollment routes and selector have explicit workspace/browser ports with real Page evidence. Next common native UI/lifetime assembly, device flow/notifications, recovery, offline/default activation, then unchanged targets. [Packet](performance-experiments/2026-10-28-worker-owner/phase219/README.md).


**Phase220:** shared genuine native UI lifetime verified with original first-device adapter. Next device connection/notifications and recovery, offline/mixed/default activation, then unchanged gates. [Packet](performance-experiments/2026-10-28-worker-owner/phase220/README.md).


**Phase221:** shared genuine Window supervisor and fixed first-device display verified. Next native device controller/notifications, recovery, offline/mixed/default activation, then unchanged targets. [Packet](performance-experiments/2026-10-28-worker-owner/phase221/README.md).


**Phase222:** Native enrollment joined path verified; next notification ownership, complete recovery, default/offline/mixed activation, then unchanged16ms/2.5s/30s gates. No staging, signing, push, preview8443, release or deployment. [Packet](performance-experiments/2026-10-28-worker-owner/phase222/README.md).


**Phase223:** Notifications native and verified. Next complete recovery, remaining screen entry/default activation, offline and mixed-owner checks; then unchanged16ms/2.5s/30s measurements. No release preparation. [Packet](performance-experiments/2026-10-28-worker-owner/phase223/README.md).


**Phase224:** Recovery effect boundaries ready; next same-realm native recovery controller and Window presentation, then remaining UI/default/offline/mixed activation and unchanged performance targets. [Packet](performance-experiments/2026-10-28-worker-owner/phase224/README.md).


**Phase225:** Native recovery complete and verified. Next wire app screens, native pending-device preparation, remaining Window custody callers/default activation, offline/mixed-owner checks; then unchanged16ms/2.5s/30s measurements. [Packet](performance-experiments/2026-10-28-worker-owner/phase225/README.md).


**Phase226:** Default Local/public Setup native. Next enrollment/recovery screen activation and pending-session drain, remaining caller/offline/mixed checks, then unchanged performance gates. [Packet](performance-experiments/2026-10-28-worker-owner/phase226/README.md).


**Phase227:** Default Local/setup/enrollment native and verified. Next actual recovery screen, remaining caller/offline/mixed and final gate measurements. No release prep. [Packet](performance-experiments/2026-10-28-worker-owner/phase227/README.md).


**Phase228:** All public Local/setup/enrollment/recovery screens use native owners. Next remaining Window boundary, mixed/offline/update and interrupted-source refusal review; then unchanged input/peer/delivery measurements. No release preparation. [Packet](performance-experiments/2026-10-28-worker-owner/phase228/README.md).


**Phase229:** Recovery Back repair recorded. Next retirement and recovered-device invitation blockers, then boundary validation and unchanged performance gates. [Packet](performance-experiments/2026-10-28-worker-owner/phase229/README.md).


**Phase230:** Retirement replacement implemented/unit verified, full browser continuation pending. Next recovery closing-field transition, remembered-name observation, then detached reopening and unchanged old recovery cases. [Packet](performance-experiments/2026-10-28-worker-owner/phase230/README.md).


**Phase231:** Recovered-account invitation transition repaired with original whole-case pass. Next isolate remembered-name overwrite, finish retirement and conversion compatibility checks, then unchanged performance measurements. [Packet](performance-experiments/2026-10-28-worker-owner/phase231/README.md).


**Phase232:** First-name entry race repaired; native actor algorithm unchanged. Next preserve account transition display and complete detached-copy checks, then remaining conversion validation and unchanged performance gates. [Packet](performance-experiments/2026-10-28-worker-owner/phase232/README.md).


**Phase233:** Promotion-device retirement/detached continuation now verified end to end. Next narrow comprehensive expected-removal entry fixture and remaining joined/recovery/offline/mixed checks, then unchanged performance gates. [Packet](performance-experiments/2026-10-28-worker-owner/phase233/README.md).


**Phase234:** Comprehensive recovery branches pass. Existing compatibility checks found a live-provider cancellation message lost across the Worker boundary; repair next without weakening its offline/resume assertions, then remaining conversion validation/performance. [Packet](performance-experiments/2026-10-28-worker-owner/phase234/README.md).


## 2026-10-29 — phase235: live credential cancellation

Phase235 closes cancellation/offline/resume compatibility. Continue remaining Worker boundary/lifecycle checks and explicit older failure review, then unchanged performance gates. [Evidence](performance-experiments/2026-10-28-worker-owner/phase235/README.md).


## 2026-10-29 — phase236: packaged offline Worker assets

Phase236 packaged Worker chunks and protected offline writing verified. Continue original native compatibility outcomes and final boundary audit before performance measurements. [Evidence](performance-experiments/2026-10-28-worker-owner/phase236/README.md).


## 2026-10-29 — phase237: Worker boundary and inconvenient results

Phase237: public heavy owners execute in actual Workers. Cold public entry after native baseline/maintenance remains unresolved; repair three config-return expectations and diagnose cold boundary before performance acceptance. [Evidence](performance-experiments/2026-10-28-worker-owner/phase237/README.md).


## 2026-10-29 — phase238: exact configuration fixture

Phase238 resolves the three classified full-unit fixture failures; whole-suite rerun remains due after runtime closure. Post-baseline public cold entry trace next. [Evidence](performance-experiments/2026-10-28-worker-owner/phase238/README.md).


## 2026-10-29 — phase239: Worker placement complete, measure next

Phase239: conversion complete on normal public paths; remaining work is measured performance/latency debt. Cold public entry~21s misses15s and deep joined catch-up misses30s. Run seven-sentence Goals input and whole-client peer cases with unchanged gates; no release preparation. [Evidence](performance-experiments/2026-10-28-worker-owner/phase239/README.md).


## 2026-10-29 — phase240: Worker measurements retain the acceptance block

Phase240 closes the requested conversion-and-measurement run. Normal public heavy owners are Workers; prepared sequential patches through240 remain uncommitted. Performance follow-ups: trace the normal final-marker2.836s failure and195–204s full catch-up; preserve16ms/2.5s/every-marker/30s gates. Cold post-maintenance~21s still misses15s; deep joined30s remains open. Strict no-catch-up driver and real-device suspension/throttle evidence are measurement gaps. No release preparation. [Evidence](performance-experiments/2026-10-28-worker-owner/phase240/README.md).


## 2026-10-29 — phase241: signed Worker checkpoint and matched protocol

Phase241: conversion is signed locally. Matched before/after catch-up comparison is next/in flight, followed by missed2.5s marker attribution. No product repair or release preparation selected. [Protocol](performance-experiments/2026-10-29-worker-catchup/phase241/protocol.md).


## 2026-10-29 — phase242: matched catch-up comparison

Phase242: apparent2x Worker catch-up slowdown not reproduced under matched current conditions; common226–240s throughput still deserves later server/apparatus/host isolation. Now trace the reproducible2.5s late-marker misses, retaining security and every existing gate. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase242/README.md).


## 2026-10-29 — phase243: late-marker attribution protocol

Phase243: trace scheduler send wait/prelude and receiver quiet-stream sweep on separately identified diagnostic. Keep2.5s gate blocked and security checks unchanged; do not lower publication timing or prioritize an unauthenticated publisher hint. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase243/README.md).


## 2026-10-30 — phase244: invalid midnight diagnostic retained

Phase244: original matched latency misses remain. Detailed attribution pending corrected civil-date fixture and finally-safe trace collector; do not infer upload/authority failure from a keyboard attempt against a frozen card. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase244/README.md).


## 2026-10-30 — phase245: corrected diagnostic apparatus

Phase245: finish late-marker attribution with corrected calendar/collector; original every-marker gate remains blocked. No product repair or release preparation. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase245/README.md).


## 2026-10-30 — phase246: late-marker attribution closed

Phase246: next cooperative receive-sweep yield for due sending, with regression tests and original two-receiver2.5s gate; follow with repeated receiveStatus proof-reuse investigation. Matched current catch-up overhead3–4%, historical2x not reproduced. Aggregate acceptance remains blocked; no release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase246/README.md).


## 2026-10-30 — phase247: due-send yield contract

Phase247: implement due-send publisher-boundary yield, continuation/scope/backoff regressions, then matched native normal/withheld two-receiver cases. Original2.5s gate stays blocked pending results; no release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase247/README.md).


## 2026-10-30 — phase248: due-send publisher-check yield

Phase248 implementation/regressions complete. Run fixed before/after normal/withheld two-receiver comparison, original16ms/2.5s every-marker/30s/600s/cold guards; keep proof reuse separate until results identify next clear repair. No release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase248/README.md).


## 2026-10-30 — phase249: matched due-send comparison apparatus

Phase249: run four fixed serial native before/after normal/withheld journeys; original2.5s gate unresolved. Continue clear attribution/repairs only after preserving outcomes. No release preparation. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase249/README.md).


## 2026-10-30 — phase250: due-send comparison outcomes

Phase250: yielding improves peerp95 but not aggregate acceptance; throughput cost requires investigation. Next same-source verified warm/selection0vs1 configuration control with native security guards, then follow clear evidence. Original2.5s/16ms gates and all old failures stay; no release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase250/README.md).


## 2026-10-30 — phase251: existing verified-selection control

Phase251: measure existing guarded verified-selection path before writing new reuse. Product source remains248; all2.5s/16ms/throughput concerns and prior failures retained. Clear next repair follows actual control results; no release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase251/README.md).


## 2026-10-30 — phase252: verified-selection control outcomes

Phase252: next bounded input-delay attribution with event/longtask/driver timing, original16ms/2.5s unchanged. Existing verified path is useful; all earlier disabled gate/throughput/cold concerns remain. No release prep or acceptance claim. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase252/README.md).


## 2026-10-30 — phase253: input-delay attribution protocol

Phase253: attribute pre-beforeinput stall before any product repair. Preserve38ms input failure, disabled2526ms marker failure and15s cold control failure. No release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase253/README.md).


## 2026-10-30 — phase254: pre-event input-delay attribution

Phase254: next bounded delivery-backend crossover to distinguish Playwright path from remaining CDP/host scheduling. Keep all16ms/2.5s gates and previous physical/UI/input/cold failures; no blind application repair or release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase254/README.md).


## 2026-10-30 — phase255: native delivery crossover protocol

Phase255: measure delivery API versus other pre-event scheduling, then repair only clearly identified cause; all originalgates/source248/security intact. No release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase255/README.md).


## 2026-10-30 — phase256: keyboard crossover result

Phase256: stop delivery-API repair hypothesis. Verify/record production-flag mismatch and reported outside-load overlap, then correct Page/Worker baseline before further mechanism. All gates/failures unchanged; no release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase256/README.md).


## 2026-10-30 — phase257: baseline scope correction

Phase257: previous warm-off3–4%overhead and public/deep deadline failures do not establish production-default behavior. Rebaseline Page8d/Worker0ab with warm flag unset on coordinated quiet host; original gates/failures remain. Attribute before new repair; no release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase257/README.md).


## 2026-10-30 — phase258: production baseline apparatus

Phase258: production-flag Page/Worker ABBA now prepared. Use coordinated quiet host and no concurrent heavy work; retain every gate/failure. Original publiccold/deepjoined reruns follow separately. No new mechanism or release prep. [Protocol](performance-experiments/2026-10-29-worker-catchup/phase258/protocol.md.gz).


## 2026-10-30 — phase259: production baseline outcomes

Phase259: corrected baseline all absolute gates pass; repeatable>10%Worker slowdown remains inconclusive. Do original productionflag publiccold/deepjoined next, then clean withheld inputcontrol and request/commit/Window counts/Worker profiles. Keep248yield candidate unaccepted and all previous qualified failures. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase259/README.md).


## 2026-10-30 — phase260: production cold compatibility apparatus

Phase260: original publiccold/deepjoined checks ready at actual release settings. Run unchanged deadlines/guards, then sourcebound work/input attribution. No repair selected from brief estimates; no releaseprep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase260/README.md).


## 2026-10-30 — phase261: production cold compatibility outcomes

Phase261:182/205/187fullcase deadline blockers persist at production flags; intermediate maintenance is sound in this run but publiccold remains slow. Keep every original failure/deadline; no releaseprep. Next quiet withheldinput control and measured native/Window/commit work, not another speculative mechanism. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase261/README.md).


## 2026-10-30 — phase262: quiet-host input protocol

Phase262: quiet-host withheld original/diagnostic controls ready. Preserve261cold/deep failures and all gates; next count actual request/commit/Window work and profileWorker before adopting brief mechanism hypotheses. No releaseprep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase262/README.md).


## 2026-10-30 — phase263: quiet-host input outcomes

Phase263: productionflag ordinary withheld input/peer gates pass once; diagnostic inputtail remains precreation and quiet warm0marker fails. Next actual native work counts and WorkerCPU(emptyreceive/envelope), then side-effect audit before any emptyWindow-flight/publication repair. Preserve261deadline blockers, all gates,248candidate status and no releaseprep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase263/README.md).


## 2026-10-30 — phase264: disposable request-budget protocol

Phase264: next is lab-only budgetfalsifier, then publiccold numeric/WorkerCPU trace. Native workcounts moveafter current blocker attribution. Preserve current productyield/oldfailures/allgates; no productionrate/releaseprep change. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase264/README.md).


## 2026-10-30 — phase265: disposable request-budget outcome

Phase265: budget contributes but deepjoinedstillblocked30s; retain447/703failures. Next uncappedPage/Workercomparison after validcivilfixture, plus independent publiccold profiling. Do not raise productionrate or choose newmechanism from roughcounts; keepsecurity/allgates. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase265/README.md).


## 2026-10-30 — phase266: public cold-open attribution protocol

Phase266: trace repeatedbaseline/nativecost in both originalpubliccold failures next. Keep265partialbudgetresult and normalfixturecalendarrefresh pending; allgates/security/sourcecandidateunchanged. No releaseprep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase266/README.md).


## 2026-10-30 — phase267: partial public cold-open attribution

Phase267: repeatedbaseline candidate now measured5replaysbeforeeditor; actualWorkerCPU stillneeded. Prioritize actual maintenanceopening failure/errorboundary before treatingsecond15smissasperformance. Correcttarget/errorenumtrace next; no newtrustwindow/securityrelaxation/releaseprep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase267/README.md).


## 2026-10-30 — phase268: actual cold owner/error protocol

Phase268: diagnoseactualcoldopeningfallback andcollectcorrectWorkerCPU next; repeatedbaselinecountsvalid butCPUcausepending. Preserve265partialbudgetresult and originalgates/failures. No performanceortrustmechanism/releaseprep selected. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase268/README.md).


## 2026-10-30 — phase269: cold CPU and recovery compatibility target

Phase269: next boundedregression/repair targets authenticatedbaseline state0 through Workerrecovery, preserving strictlypositive diskrecords and all authority/history/journal/fencing. Then rerunoriginalmaintenancecold. Repeatedbaselineperf and labbudgetPageWorkercompare remain pending; no releaseprep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase269/README.md).


## 2026-10-30 — phase270: baseline recovery red contract

Phase270: implement narrowfirststatezero transportcompatibility, retain allnative/diskchecks, then focused/fullunits/sourcebookkeeping and unchanged realcoldcases. Repeatedbaselineperf, higherbudgetnormalcompare/fixture refresh and yielddecision remain pending; no releaseprep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase270/README.md).


## 2026-10-30 — phase271: baseline recovery compatibility repair

Phase271: narrowbaselineprojectionrepair passes affected/fullunit/bookkeepingchecks. Next exactcumulativecandidate at originalnativecold/deepgates withoutdiagnostics. Keepsecurity/freshchecks/oldfailures; repeatedbaselineperformance and budget/fixture/yield followups stillopen. No releaseprep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase271/README.md).


## 2026-10-30 — phase272: repaired native walkthrough protocol

Phase272: originalnative aftercases next, then closecompatibilityrepair onlyifactual coveredhistoryremoval/coldarchive/Undo passes. Remainingstartupcost/budgetnormal/yieldquestions separate; no releaseprep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase272/README.md).


## 2026-10-30 — phase273: repaired native walkthrough outcome

Phase273: Workerrecovery baseline0 compatibility repaired/realmaintenancecold verified. Remainingdeepcatchup30s/unreducedcold15s, capfreePageWorkercompare aftercivilfixture refresh, Page/WorkerMainlongtasks/Goals andmissing0abwithheld/yielddecision stayopen. No releaseprep or productionrate/automation change. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase273/README.md).


## 2026-10-30 — phase274: unreduced baseline exact-evidence contract

Phase 274: implement bounded same-carrier unreduced exact-proof reuse, then verify cold behavior. Normal Page/Worker comparison is held. Deep at/headersAt and multi-entry reads/fairness come next, followed by deep Page64, reproducible fixture refresh and withheld/normal gates. No release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase274/README.md).


## 2026-10-30 — phase275: unreduced same-carrier exact reuse

Phase 275: same-carrier unreduced exact reuse implemented and checked. Next actual cold after-check, then deep request at/headersAt and multi-entry/fairness. Preserve normal Page/Worker hold and step order; no release prep or production limit change. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase275/README.md).


## 2026-10-30 — phase276: unreduced cold after-check protocol

Phase 276: run the frozen unreduced/reduced cold after-check next, retaining all prior outcomes. Then trace deep at/headersAt before multi-entry reads and fairness. Normal comparison held; no release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase276/README.md).


## 2026-10-30 — phase277: native cold after-check outcome

Phase 277 closes item1 cold same-carrier reuse at the original native gates. Next item2 deep traffic start/header timestamps and read extents, then multi-entry verification/read repair and fairness. Item3 Page deep64 and item4 fixture recipe/withheld/normal gates follow. Normal comparison held; no release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase277/README.md).


## 2026-10-30 — phase278: deep traffic attribution protocol

Phase 278: run original deep joined case with traffic timing/extent next. Then design multi-entry verifier and durable replay with byte/record limits and position-weighted fairness preserved. Page deep64 and recipe/withheld/normal gates follow; normal comparison held, no release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase278/README.md).


## 2026-10-30 — phase279: deep request trace outcome

Phase279: deep request cadence/extent recorded. Next implement and test bounded multi-entry receive including durable receipt replay, safe large-entry fallback and four-position fairness; then actual deep/fairness checks. Page deep64 and reproducible fixture/withheld/normal gates follow. Normal comparison held, no release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase279/README.md).


## 2026-10-30 — phase280: multi-entry reader contract

Phase280: implement reader-first bounded multi-entry verification and indexed v2 replay across all tag consumers, with unchanged v1 and interior-cut semantics. Then separate planner/large-entry/fairness phase and deep rerun, Page deep64, fixture recipe/withheld/normal gates. Normal comparison held; no release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase280/README.md).


## 2026-10-30 — phase281: diagnostic work-count protocol

Phase281 adds cold editor work-count and unreduced live-publish observations before continuing multi-entry implementation. V2 remains development-only; cover all v1 tag readers, range4/8, stale tabs and rollback. Then deep/fairness, Page deep64 and fixture recipe/withheld/normal gates; no release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase281/README.md).


## 2026-10-30 — phase282: diagnostic work-count outcome

Phase282 confirms cold exact reuse is exercised, but opens explicit unreduced post-commit cost:one source22.378s/+10full replays, observer-inclusive. Preserve exact-evidence boundaries. Continue multi-entry reader/planner with all tag readers, ranges4/8, stale-tab/rollback record; then deep/fairness, Page deep64 and fixture/withheld/normal gates. No release prep. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase282/README.md).


## 2026-10-30 — phase283: range and reader coverage contract

Phase283: implement shared v1/v2 tag recognition, exact indexed receipt reader/range verifier and all reader paths, preserving old v1 API and original checks. Then reader fault/bookkeeping checks, separate planner/deep/fairness. V2 development-only; stale-tab/rollback before release work. Retain unreduced mutation cost, normal comparison hold and remaining Page64/fixture/withheld/gates. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase283/README.md).


## 2026-10-30 — phase284: development range reader

Phase284 reader-first boundary complete: all v1/v2 tag readers and4/8 indexed replay/storage/handoff checks pass. Next bounded planner/writer with safe large-entry fallback and four-position fairness, then actual deep4/8 and Page deep64. Evaluate evidence duplication costs; native stale-tab/rollback before any release work. Keep unreduced mutation cost open, normal comparison held and fixture/withheld/normal gates pending. [Evidence](performance-experiments/2026-10-29-worker-catchup/phase284/README.md).


### 2026-10-30 — Worker catch-up phase285

Phase285 enables development-only four-position range planning. Next: rebuilt deep4, bounded network8 continuation/fairness and deep8, Page64 deep, repeatable date fixture then withheld/normal gates. Keep unreduced live-publication cost and native stale-tab/rollback obligations open. See [phase285](./performance-experiments/2026-10-29-worker-catchup/phase285/README.md).


### 2026-10-30 — Worker catch-up phase286

Phase286: execute the frozen original deep4 cell; preserve the complete outcome before planning network8 continuation and Page64. See [phase286](./performance-experiments/2026-10-29-worker-catchup/phase286/README.md).


### 2026-10-30 — Worker catch-up phase287

Deep4 improves deadline progress but still fails30s. Next bounded8download/unverified-tail/four-position fairness and clean oversized-range Worker fallback, then actual8deep and Page64. Normal comparison/release remain held. See [phase287](./performance-experiments/2026-10-29-worker-catchup/phase287/README.md).


### 2026-10-30 — Worker catch-up phase288

Implement bounded preparation from phase288 before raw-tail/planner8. Preserve full-range all-or-nothing contract, four-position native turns and clean size fallback; all native/performance/rollback obligations stay open. See [phase288](./performance-experiments/2026-10-29-worker-catchup/phase288/README.md).


### 2026-10-30 — Worker catch-up phase289

Phase289 closes bounded preparation. Next raw signed-original tail cache and8entry planner with fresh native checks/four-position turns; test clean Worker size fallback and actual8deep/fairness. Preserve all other held gates and rollback obligations. See [phase289](./performance-experiments/2026-10-29-worker-catchup/phase289/README.md).


### 2026-10-30 — Worker catch-up phase290

Phase290 closes raw-tail integration functionally. Before timed8 inspect/alleviate partial-turn3+4+1 alignment; then rebuilt deep8, native composed size/fairness and Page64. Keep normal comparison/release held and all gates unchanged. See [phase290](./performance-experiments/2026-10-29-worker-catchup/phase290/README.md).


### 2026-10-30 — Worker catch-up phase291

Phase291 closes partial-turn alignment. Execute rebuilt291deep8at original30s/default limits, retain complete traffic, then Page64and remaining native/gate obligations. No normal comparison or release work yet. See [phase291](./performance-experiments/2026-10-29-worker-catchup/phase291/README.md).


### 2026-10-30 — Worker catch-up phase292

Execute frozen deep8cell next; record actual native progress/failure and traffic before Page64and remaining held gates. See [phase292](./performance-experiments/2026-10-29-worker-catchup/phase292/README.md).


### 2026-10-30 — Worker catch-up phase293

Deep4and8both fail30s. Next real Page syncing joined deep at lab64, then fixture recipe/withheld/normal gates. Preserve native range fallback/fairness and stale-tab/rollback obligations; no release work. See [phase293](./performance-experiments/2026-10-29-worker-catchup/phase293/README.md).


### 2026-10-30 — Worker catch-up phase294

Run frozen joined Page64deep once next; preserve actual outcome before fixture recipe and withheld/normal gates. No normal comparison/release activation. See [phase294](./performance-experiments/2026-10-29-worker-catchup/phase294/README.md).


### 2026-10-30 — Worker catch-up phase295

Next rerunnable civil-date fixture generation with early editable cards and unchanged history/device asymmetry; then withheld yield cell/normal gates. Bulk4/8and Page64all fail30s; preserve proof/evidence-cost investigation and native compatibility obligations. See [phase295](./performance-experiments/2026-10-29-worker-catchup/phase295/README.md).


### 2026-10-30 — Worker catch-up phase296

Run the phase296recipe, retain generation failures/success identities, then fresh civil preflight before withheld signed0ab/yield cell and normal gates. Do not append late cards after old backlogs or bypass freeze logic. V2 compatibility/fairness obligations remain. See [phase296](./performance-experiments/2026-10-29-worker-catchup/phase296/README.md).


### 2026-10-30 — Worker catch-up phase297

Fresh civil fixture is now verified. Next signed0abwithheld/default flags, then normal cases with original gates and per-case editability preflight. V2 remains development-only; preserve all deep failures and compatibility obligations. See [phase297](./performance-experiments/2026-10-29-worker-catchup/phase297/README.md).


### 2026-10-30 — Worker catch-up phase298

Fresh fixture now has semantic writer-role adapter. Freeze and run signed0abwithheld first, then yield-only matched withheld and current ordinary/fairness cases with original absolute/native gates. Deep and compatibility blocks remain. See [phase298](./performance-experiments/2026-10-29-worker-catchup/phase298/README.md).


### 2026-10-30 — Worker catch-up phase299

Execute missing signed0abwithheld first under299, record functional and independent latency outcomes, then matched yield-only/current ordinary/fairness cases if classification allows. All deep/compatibility and release holds remain. See [phase299](./performance-experiments/2026-10-29-worker-catchup/phase299/README.md).


### 2026-10-30 — Worker catch-up phase300

Missing signed0abwithheld baseline nowpasses. Next matched248-onlywithheld, then current291normal/multi-account fairness. Preserve tails, all deep failures and v2compatibility/release blocks. See [phase300](./performance-experiments/2026-10-29-worker-catchup/phase300/README.md).


### 2026-10-30 — Worker catch-up phase301

Next run pinned-browser cohort in fixed source order; do not pair across the old/new binary break. Preserve ordinary/deep/compatibility and release blocks. See [phase301](./performance-experiments/2026-10-29-worker-catchup/phase301/README.md).


### 2026-10-30 — Worker catch-up phase302

Next fixed248-onlywithheld, then current291normal and fairness under301. Input miss, deep failures and v2compatibility remain open. See [phase302](./performance-experiments/2026-10-29-worker-catchup/phase302/README.md).


### 2026-10-30 — Worker catch-up phase303

Next fixed current291normal then multi-account fairness. Yield withheld gap is filled; current range deep/compatibility and release blocks remain. See [phase303](./performance-experiments/2026-10-29-worker-catchup/phase303/README.md).


### 2026-10-30 — Worker catch-up phase304

Finish frozen fairness, then approved lab-only Worker CPU profile/factorial4range screen; default-off writer and realv5publish before any landing. Deep/marker/compatibility blocks remain. See [phase304](./performance-experiments/2026-10-29-worker-catchup/phase304/README.md).


### 2026-10-30 — Worker catch-up phase305

Next default-off range writer, realv5livepublish and approved isolated7factor range4lab screen/profile/ablations. Current normalmarker/fairness/deep and stale-tab/rollback blocks stay open. See [phase305](./performance-experiments/2026-10-29-worker-catchup/phase305/README.md).


### 2026-10-30 — Worker catch-up phase306

Begin fictional-only range4Worker CPU profile and seven-toggle8run+2plain lab screen, then contributor ablations and one frozen original-gate stack. Measure realv5publication; v3lab result is not established production cost. Writer stays default off; full-red attempt and marker/fairness/deep/compatibility blocks remain. See [phase306](./performance-experiments/2026-10-29-worker-catchup/phase306/README.md).


### 2026-10-30 — Worker catch-up phase307

Lab screen/ablations/original-gate challenge complete with failures retained. Next isolate
withheld-hint scheduling (16.609/18.967speerp95) with C/E/GwithoutunsafeF, then native8fairness
and verification hardening separately. Byte-comparison/storage work is the stronger profile lead.
Keep range writer default off, all gates, full-unit red history and v2stale-tab/rollback holds;
no normalPage/Workercomparison or release work. See
[phase307](./performance-experiments/2026-10-29-worker-catchup/phase307/README.md).

### 2026-10-31 — Worker catch-up phase308

Next bounded performance investigation: use the retained 2,048-position failures to trace why
local preparation repeatedly returns `activity-or-journal` and does not commit after typing
stops. All six runs have 112–120 overlapping keys, passing input/peer/marker timings and exact
archive/Undo checks, but zero completions and counter v2 after the unchanged 120-second wait.
Cold reopening was not reached. Preserve this before evidence and its deadline. The trace can
begin without a phone.

Then address R's initial missing-hint wait, its 2.560/2.553-second post-drain diagnostic tail,
and healthy-hint arm/rearm behavior. Harden G and any immutable-prefix reuse separately.
Named hints show modest traffic savings. Review the design-only self-contained page receipt
against the ten-reader inventory, membership/replacement replay, cuts within pages, logical
budgets, audit units and old-tab/rollback fences before implementing a format. Keep the range
writer default off, V confined to the lab, service automation off and every gate unchanged.
No release preparation. See [phase308](./performance-experiments/2026-10-29-worker-catchup/phase308/README.md).


### 2026-10-31 — Worker catch-up phase309

The maintenance trace confirms periodic idle receive enters membership discovery's storage queue,
interrupts preparation and incurs60sretry. It also contradicts the proposed inevitable verifying
stall: with those periodic polls paused, unchanged preparation/removal completes in36.012s and
actual cold passes. The operator's stop condition applies before S/Y/P. Both grown typing cases
and idle-with-polls retain their120scompletion failures; no cold credit for those timeouts.

Reconsider the next lab repair with this evidence: distinguish discovery queue priority from
typing-driven flushes before Y; measure S as efficiency rather than assume one-miss starvation.
The approved dense P exploration, P/V screens, R1scomparison,3072index diagnostic, three new
D pairs and original/grown three-replicate gates remain unrun after this stop. Landing requirements
for S/Y/G/R/D/P are separate in the report; no hardening is started. Keep V out of candidate,
all security checks/gates/deadlines,750msquiet/defaultoff writer/service automationoff, and the
frozen phase308lab intact. See
[phase309](./performance-experiments/2026-10-29-worker-catchup/phase309/README.md).


### 2026-10-31 — Worker catch-up phase310

Next SxYnormal/withheld once per arm, original writer-only120swait and >=60keys unchanged;
report every reader's completion/journal/capacity and best-arm reader-idle with polls on.
Reader S0paused confirms one-entry slice cliff; S1progresses rapidly then capacity-halts before
cold. Pmay remove duplicated-page pressure but is unbuilt. Keep all later P/V/R/index/D/gate
screens, reader diagnostics in every grown/index case, all security/compatibility holds and
no-hardening rule. See
[phase310](./performance-experiments/2026-10-29-worker-catchup/phase310/README.md).


### 2026-10-31 — Worker catch-up phase311

Next isolated Pdense-receipt build and interior-page-cut/cold probe, then P/Vandremainingordered
screens using S1Y1. Writer completion now passes both hint conditions in that arm, while reader
capacity remains. Include reader completion/journal/capacity in every grown/index case and
preparation bytes in Pcomparison. All originalgates/limits,3replicates/anyfailure rule,Vcomparison
only,defaultoffwriter/serviceautomationoff remain; no hardening. See
[phase311](./performance-experiments/2026-10-29-worker-catchup/phase311/README.md).

- 2026-10-31 phase312 checkpoint: P exploratory prototype/probes complete, no acceptance or landing. Continue with genuinely P-grown cohorts and the declared P/V, maintenance, R,3072,D and original/grown three-replicate screens. Reader capacity and all failed cells stay visible. Physical-browser same-page-cut/process-reopen, all compatibility/format/verification hardening and separate S/Y/G/R/D landing needs remain open; do not start hardening without operator decision. [Evidence](./performance-experiments/2026-10-29-worker-catchup/phase312/README.md).

- 2026-10-31 phase313: P with full comparison clears the three-replicate deep screen (19.268/22.011/19.764s); Poffmisses one at33.468s. All12cold exact, no credit/landing. Genuine paired2,048writer fixtures ready. Next execute the eight declared grown cells with reader capacity/durablebytes, then R,3072,D and all original/grown three-replicate gates. Do not start hardening; Pcompatibility/format and separate S/Y/G/R/Dlanding obligations stay open. [Evidence](./performance-experiments/2026-10-29-worker-catchup/phase313/README.md).

- 2026-10-31 phase314: four Ponpaired-grown writer journeys meet measured predicates and both offline cold profiles; four Poffwriters hit preparation capacity (one also peer2.5smiss). One Ponreader completes belowcap, otherscensored. All attempt/family/capacity/load evidence retained. Next R1500/1000,3,072reader/index diagnostics,Dpairs,original+grownthree-replicate gates; no hardening or credit. Capacity-refusal owner-error/UX remains separate. [Evidence](./performance-experiments/2026-10-29-worker-catchup/phase314/README.md).

- 2026-10-31 phase315: R1000gives1.91/1.95spost-drainp95 versus1500's2.51/2.45; carry1sforremaininglabworkonly. Normal repair remains armed96.9%/50.7%oftyping, so unchanged-traffic claim is open; maintenance completion censored. Next3,072reader/index diagnostics,Dpairs,alloriginal+grownthree-replicate gates. No hardening or qualification. [Evidence](./performance-experiments/2026-10-29-worker-catchup/phase315/README.md).

- 2026-10-31 phase316: common3,072history ready via real accepted edits, with original30minute failure and one helper failure retained. Pending input recovered offline, final+1,024/only-target archive independently checked; no cold failure. Next four reader/index/capacity diagnostics P0/P1/P1/P0, then Dpairs and original+grownthree-replicate gates. Rnormal-traffic cost remains open; no hardening. [Evidence](./performance-experiments/2026-10-29-worker-catchup/phase316/README.md).

### 2026-10-31 — Phase317: Continue D cost controls, then original and grown gates

All four predeclared real3,072 reader diagnostics retained. Full per-run index fallback, map-family/durable bytes, timing curve, interruptions and cold exposure recorded; capacity throws remain owner-error/halted, not parked. Reopen behavior traced without building a fix. S landing explicitly requires specific skipped/capacity mapping and reopened-journal coverage. Two Roff normal controls declared before D pairs. Evidence/docs only, no credit or hardening. See[phase317](./performance-experiments/2026-10-29-worker-catchup/phase317/README.md).

Phase317 measurement limitation: all four detailed event buffers filled before the boundary, so exact first fallback positions and late native per100costs are unmeasured. Retained uncapped scalars/network show77versus1full ledger checks and a P0cursor bend at2,400–2,600; those do not replace the missing event. Dense-on27.887MBfits, but one of two reader maintenance windows times out; no qualification claim.

### 2026-10-31 — Phase318: normal cost controls and separate D benefit

All eight predeclared normal runs pass functional,16cold and measured predicates. Roff2controls versus R1000/Doff3arms show no added token/quiet-read cost in these windows, with0Ractivations in all3R1000/Doffarms; prior315normal episodes remain. Dspeeds H1in all3pairs(~7.5sin the two less-contended pairs), removing/defering unrelated quiet-peer probes; H2mostlyunchanged. Source/build/gates unchanged. Continue smallest selected Doffstack to3rep original/grown challenge; no hardening or credit. See[phase318](./performance-experiments/2026-10-29-worker-catchup/phase318/README.md).

### 2026-10-31 — Phase319: retain original preconditions and immediate cold-stop visibility

Recreated genuine current-civil original1024single-entry caught-up H2profile through real sync, whole archive exact/counterv2/onlyH2changed; retained distinct grown2048and native/Goals prepared-v5preconditions. Added observation-only cold-stop markers and explicit old-fixture selector; independent ASTchecks preserve all old expectation/test/wait nodes and existing config hashes. Declared30original+6separate grown runs before start, unchanged gates/deadlines,3percell/onefailfailscell; per-owner interruption/retry reporting. Evidence/docs only, no hardening or credit. See[phase319](./performance-experiments/2026-10-29-worker-catchup/phase319/README.md).

### 2026-10-31 — Phase320: retain exposure failures; no hardening without operator decision

All36declared journeys retained, functional/cold guards pass, no no-Fcold failure. Eight of ten original cells meet all predicates; both old1024maintenance cells fail unchanged>=60overlap in all3runs(19–31keys), all other predicates pass. Both separate grown cells pass3/3including85–120overlap,120swriter completion,16msinput/2.5speer/markers/cold. Late withheld post-drainp95=1.832/1.710/1.824s. Grown writers finish40.8–76.7safterlastkey;32priority interruptions/retry clocks recorded, no startsduringtyping/drain, readercompletion1/6otherscensored. Capacity mapping/reopen and separate landing contracts documented; exact3072index fallback remains unmeasured due event overflow. No hardening, credit or release work. See[phase320](./performance-experiments/2026-10-29-worker-catchup/phase320/README.md).

### 2026-10-31 — Phase321: reader censoring resolved for the observed grown cohort

Six predeclared grown diagnostics on unchanged313assets/stack retain the original writer wait, then observe both owners to completion/halt/absolute120safterlastkey before original cold. All6readers(43.982–90.905s)and6writers(53.123–79.245s)complete inside120s; zero capacity/halts,12coldchecks exact. Five readers finish4.263–22.817safter writers. Perowner attempts/jobs/retry clocks/journal peaks retained;38priority10sclocks, no new startsduringtyping/drain. Application source/build unchanged, only observation spec copy; no gate credit/hardening.

Operator amendment effective from321: >=60typing/catch-up overlap applies only to grown fixtures. Future1,024-position old-maintenance cells report overlap as information; every other predicate stays required. The assumption that the old backlog lasts for60keys has expired. Phase320recorded failures/verdicts are preserved byte-for-byte and not regraded. This321diagnostic is not a gate and grants no acceptance credit. Future gate plans must carry the amended scope explicitly. Hardening remains an operator decision; none started. See[phase321](./performance-experiments/2026-10-29-worker-catchup/phase321/README.md).

### 2026-11-01 — Catch-up serialization lab stopped at phase322

Resolve the profiled diagnostic's cold WebAuthn failure before further lab runs, under the no-Fcold stop rule. Then run75msbaseline and compare batched/concurrent/both starting from main's bounded receivePrefetch; evaluate transferred ordinary handoff separately from mandatory rotation/maintenance fences, then timing ablations with actual live/maintenance exposure. Current0/50msdata show serial-latency sensitivity and mostly idle Window, not a complete explanation of remaining4.0–4.4s. No candidate built, no hardening or release credit. [Evidence](./performance-experiments/2026-10-29-worker-catchup/phase322/README.md).

### 2026-11-01 — Phase 323: review before any hardening

Review idle-check coalescing/read-ahead as a network-latency tradeoff, with 0 ms regression and wider-page index amplification retained. Choose P’s durable-format contracts before landing; rerun beyond the index limit and multi-account fairness for B8. Review zero-extra-priority-retry latency versus replay/CPU/battery cost; preserve every authority/journal/handoff guard and fix the separate capacity→owner-error mapping only in an authorized bounded repair. Audit actual fixture document sizes before claiming nominal 13 k Goals coverage. No hardening/release work begun. [Results and separate landing requirements](./performance-experiments/2026-10-29-worker-catchup/phase323/README.md).

### 2026-11-01 — Phase 324: stopped parsed-page reuse experiment

Before resuming the lab, repair the prototype's dense stored-replay mode only in a new bounded phase, reviewing all expectedRecord branches and adding expired-historical versus expired-live, tuple/duplicate and erasure controls. Preserve the failed cold journey. Then revisit the remaining mixed B×P screen, profiles, live/grown checks, cap prediction, sender wait study and read-only signed multi-publisher-tip contract. No winner or production/default decision yet. [Stopped evidence](./performance-experiments/2026-10-29-worker-catchup/phase324/README.md).

### 2026-11-01 — Phase 325: sender-wait three-arm comparison queued

After the phase 324 cold-replay blocker and valid candidate-stack screen, compare coordinated-2000, reference and immediate/in-flight coalescing in 18 declared journeys: paired 150 ms and single 500 ms, three per cell. Include both directions, accepted positions per 100 keys, route-specific read/write costs and timed exact offline cold opens; preserve all gates and leave defaults unchanged. No implementation or measurements yet. [Declared order and controls](./performance-experiments/2026-10-29-worker-catchup/phase325/README.md).

### 2026-11-01 — Phase 326: lab screen completed; maintenance and paired-writing blockers

Keep stored-mode repair and parsed-page reuse development-only pending separate hardening decisions. Next bounded diagnosis should capture the original snapshot-building owner-error (all3 grown withheld writers, not measured capacity) and the Worker/Window workspaceFinish refusal behind paired-writing closure; preserve synchronous journal admission and every fence. Repeated deep screen selects E1B1P1 for lab stages only; index charge is not RAM. Sender policy remains undecided despite complete grid because paired cells fail and latency/cost/cold must be assessed together. Review the signed multi-publisher-tip contract separately before any endpoint. Existing dense-format old-tab/rollback/handoff contracts, capacity mapping and fairness/past-cap work remain open. No release prep/hardening. [All runs and queue](./performance-experiments/2026-10-29-worker-catchup/phase326/README.md).

### 2026-11-01 — Phase327: local baseline warm-audit disagreement is the next fault target

A tagged paired reference run pinpoints repair-required in localBaselineReuse.compare, reached by the scheduled full warm audit; subsequent native-owner withdrawal closes the Window. Next isolate the first differing census/delivery/inbound field and exact committed-prefix/owner/baseline evidence on both sides, with bounded hashes/counts rather than writing. Preserve the full semantic oracle and terminal security behavior; determine which projection or comparison scope is wrong before repairing. No observed RPC quota saturation, and Window fail callbacks were downstream. This does not prove all prior closures or phase326's grown building failure share a cause. Lab-only; no landing/hardening/release. [Trace and separate requirements](./performance-experiments/2026-10-29-worker-catchup/phase327/README.md).

### 2026-11-01 — Phase 328: provenance correction complete; fault target unchanged

The phase327 log-index correction changes no result. The next substantive diagnostic remains the first differing census/delivery/inbound field and captured evidence identity in the warm full-versus-incremental ledger comparison; preserve every guard. [Correction](./performance-experiments/2026-10-29-worker-catchup/phase328/README.md).

### 2026-11-01 — Phase329: scope diagnosis confirmed; paired latency and unrun controls remain

The lab mixed dense/legacy replay reuses a stale turn; focused controls and a matched unrepaired grown recurrence confirm the retained receipt defect. Private repair passes18paired functional/both-maintenance/cold journeys and3repaired grown measured journeys. All6paired latencycells remain red, including one1.422sinputp95outlier; trace on the common larger fixture before selecting a sender policy. Device1single500 and finaldeep0 control are unrun because the unrepairedP1maintenance owner-error triggered the explicit functional stop. Resumption and hardening need operator direction; no main/source/default/format change or release work. [Allruns and separate limits](./performance-experiments/2026-10-29-worker-catchup/phase329/README.md).

### 2026-11-01 — Phase330: admitted-checkpoint return comparison remains unmeasured

The first new harness attempt stops before history creation because it compares offline pre-backlog C to the final archive. Correct C's normal-sync preparation on a separately resumed attempt, retaining full archives/catalog exposure/install/Undo/cold checks and the frozen0/50ms ×3 plan. All12Breturn journeys and6loaded A/C companions are unrun; no snapshot speedup or storage-tail input result exists yet. Do not conflate the harness precondition failure with a product install defect, or phase329's unresolved paired latency. [Stop and declaration](./performance-experiments/2026-10-29-worker-catchup/phase330/README.md).

### 2026-11-01 — Phase331: previously unrun controls complete

Device1single500all3policies and repaireddeep0nowfunctionally/coldexact; no acceptance credit. Continue matched checkpoint preparations and only then the separately declared idle-warm-audit arm. Existing paired latency deficits remain unresolved. [Controls](./performance-experiments/2026-10-29-worker-catchup/phase331/README.md).

### 2026-11-01 — Phase332: checkpoint comparison measured; idle-audit arm next

Matched checkpoint cuts return visibility18.939→2.363s/26.243→2.760s at0/50ms on1024corpus, all primaryarchive/Undo/cold exact. Loadedproducer/admitterinputp95under16ms inthislab; install itself n0/1unexposed. Keep unresolvedone-offdownloadobservationtimeout visible, no browser20limit claim. Automatic service history remains off; no default/format/trust changes. Proceed idle-warm-audit arm with full oracle/guards/hardrowbound, same329fixture. [Allattempts](./performance-experiments/2026-10-29-worker-catchup/phase332/README.md).

### 2026-11-01 — Phase333: idle-audit evidence available, no candidate promoted

Twelve declared paired journeys and per-audit/read-turn/native-queue observations preserved, functional maintenance/cold exact. Consult every directional predicate before selecting further work; no default/hardening/landing or release preparation. The reference-policy input outlier remains unresolved by this two-policy screen. [Results](./performance-experiments/2026-10-29-worker-catchup/phase333/README.md).

### 2026-11-02 — Phase334: trace-only follow-up after signing241–333

All93preparedcommits signed locally; no push/release. Next possible lab questions are aggregated-instrumentation/exactcooperativeprefixloop cost and receiver progress under continuousbidirectional writing, including untaggeddelivery storage boundaries. Existing30journeys/60owners retained; four333latencycells remain failed despite exactwriting/cold. No implementationselected or hardeningstarted. [Details](./performance-experiments/2026-10-29-worker-catchup/phase334/README.md).
