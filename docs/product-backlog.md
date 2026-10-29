# Product follow-ups

Captured 2026-10-17 from the operator's requests in the scheduling/onboarding/enrollment conversation.
This is a parking place for observations and design questions. Order below is not priority or an
implementation plan. The [PRD](./PRD.md) and [TRD](./TRD.md) remain the requirements; individual changes
get a bounded scope and evidence before implementation. General release qualification remains
[paused](./private-release-validation-prep.md).

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
