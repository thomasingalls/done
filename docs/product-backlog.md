# Product follow-ups

Captured 2026-10-17 from the operator's requests in the scheduling/onboarding/enrollment conversation.
This is a parking place for observations and design questions. Order below is not priority or an
implementation plan. The [PRD](./PRD.md) and [TRD](./TRD.md) remain the requirements; individual changes
get a bounded scope and evidence before implementation. General release qualification remains
[paused](./private-release-validation-prep.md).

## Newly reported

- **UX-01 — Left sidebar.** Rework its organization, hierarchy and interactions. Review everyday
  navigation alongside identity/preferences, installation, local protection and sync setup.
- **UX-02 — Account wizard presentation.** Polish the setup, connection and recovery screens. Review
  spacing, typography, hierarchy, credential explanations and indications of progress together, while
  preserving the agreed security steps and restart/retry behavior.
- **UX-03 — Friendlier styling.** Explore alternatives to the current visual style. The interface should
  get out of the way, but it may currently read as severe. Compare directions before choosing one;
  friendliness and visual quiet both matter.
- **UX-04 — macOS editor shortcuts.** Identify the specific broken or awkward shortcuts and reproduce
  them on Mac. Check native editing expectations, browser conflicts, selection and undo behavior before
  changing bindings. The exact shortcuts still need to be collected.
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
- **UX-07 — Saving-status layout movement.** “Still saving” warnings currently move the text around.
  They make remaining latency visible during debugging, but this movement is unacceptable in the user
  experience. Keep save state truthful while making status changes preserve editor layout, selection,
  focus and scroll position. Treat the underlying delay and its presentation as separate problems.
- **UX-08 — Goals to day view.** Explore a more intuitive, inline or contextual way to bring material
  from Goals into the day view than the buttons at the bottom of the screen. Compare interactions on
  desktop and mobile; decide the interaction before changing movement/copying semantics.
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
  about where the controls belong. Multiline cards remain essential, and the existing three-Enter
  split stays for now. No new content format or replacement split gesture is selected.
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
  No app implementation is authorized or claimed by this design selection.

  **Implemented in unsigned phases66–68, 2026-10-25:** subsequent operator authorization includes
  the offscreen-caret fallback. Gentle context defaults on, has an immediate browser setting, and
  per-heading menus complement the full outline in the same formatted editor. Bounded unit/browser
  evidence and remaining limits are in the [implementation record](development-evidence/2026-10-25-goals-navigation/phase68/README.md).
  No source commit, preview8443 update or deployment has occurred.

- **UX-12 — Card focus trap.** Reported 2026-10-23 after an unknown desktop Tab/modifier
  sequence. Patch42 reproduces a concrete trap after split/merge: outside blur leaves a saved
  focus request, reopening the editor and stealing later input. Regression checks cover outside
  click and action Tab navigation. This explains one path, not every possible focus defect.
- **UX-13 — Intermittent invisible mobile quick entry.** Android with Gboard: the Today add-item
  field sometimes shows no text and Add stays disabled while keyboard suggestions follow typing.
  The operator does not recall a reliable trigger; suggestion taps have also worked normally.
  Track separately from UX-12 and from IME-confirmation handling. Do not infer a physical-phone
  repair from synthetic events or a Chromium mobile user agent. Patch43 separately repairs
  IME confirmation being mistaken for submission; the intermittent phone symptom stays open.
- **UX-14 — Duplicate cards to Scheduled.** Add a Duplicate control in Next, Done and Scheduled,
  retaining the source and copying its whole multiline body into a new Scheduled card. Preserve
  writable-day and durability rules; do not turn duplication into movement out of Done.

- **UX-15 — Sidebar presentation and user-facing vocabulary.** Queued 2026-10-23 for after
  the current work. Revisit styling, spacing, vertical rhythm and visual balance in Account
  and the other sidebar sections. The operator’s [Account screenshot](product-references/2026-10-23-sidebar-account.png)
  is the visual reference: form rows are crowded while section/action spacing and control
  alignment feel uneven. Prefer **User** to **Actor** in the visible identity label; this is
  wording for the interface, not a change to internal actor identity or authorization.
  Related to UX-01/UX-03; no redesign or implementation is selected by this queue entry.
- **UX-16 — Whole date control opens the native picker.** Queued 2026-10-23. The operator
  reports that only the calendar icon currently opens the picker. Make the displayed date
  and calendar icon one complete click/tap target, retaining native date selection and
  keyboard access. Reproduce on the current preview, including Firefox/macOS, before repair;
  the earlier overlay implementation is not evidence that every browser opens from its full area.
- **UX-17 — macOS whole-line Cut.** Queued 2026-10-23. Cmd-X currently appears to do nothing
  when the operator expects the current whole line to be cut. With no text selected, copy
  the whole line to the clipboard and delete it; retain ordinary cutting of a selection.
  Reproduce in Goals and card editors before choosing the repair. Check clipboard success/
  refusal, native user-gesture permissions, storage admission, undo and line/EOF boundaries
  without deleting writing that was not successfully copied. Extends UX-04; implementation
  and regression tests are deferred until after the current work.

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
  breadcrumb and compact-label alternative. Proposed opt-in captures context on new transfers;
  snapshot/live behavior, encrypted metadata and export/import policy remain product/format decisions.
  The user did not request a settings mock. No automatic tagging has been implemented.
  Browser feedback approves breadcrumb placement only: preserve existing card styles/chrome.
  [Revision64](product-design/2026-10-23-goals-context/editor-study.md) reuses the current renderer/CSS.
  **Implemented in unsigned phases69–72, 2026-10-25:** card transfers keep advisory heading
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
  Discussion on 2026-10-17 confirms multiline cards matter and deliberately retains three-Enter
  splitting for now; UX-10 is the agreed improvement to add next to this open design question.
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

## 2026-10-26 — Automatic history maintenance

Growing-account open/sync delay is reported, without attributing the current account's cause.
[Private scheduling73](./account-local-retention-automatic.md) reuses the earlier depth and preparation
studies and adds automatic calls to the existing local removal owner. Public conversion remains off.
Next work: capacity/refusal presentation and activation/rollback policy; physical-device behavior;
separately consider automatic server snapshot/admission/pruning without weakening the two-snapshot or
multi-device rules. No user-visible writing is selected for age-based deletion. Do not repeat the
already completed preparation-task optimization as though it were still outstanding.

**Follow-up74–75:** local capacity/refusal presentation and paced explicit retry are implemented, with
quiet ordinary deferrals and a collapsed Data marker for persistent issues. The coherent automatic
release profile and compatible reader rollback are implemented/tested; ordinary builds remain reader-
only until an activated image is selected. The [runbook](./account-local-retention-activation.md) covers
build-time flags and cached-client adoption. Automatic service snapshots/admission/pruning remain
separate. No real-profile conversion or production release occurred in these unsigned phases.
