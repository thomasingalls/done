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
- **UX-06 — Continuous mobile deletion.** The operator's barometer: “can I hold down backspace on mobile
  and watch the line disappear without pauses?” Pauses remain. Reproduce and measure sustained deletion
  on a physical phone, including while sync is active, alongside the existing typing measurements.
  Preserve writing, undo and durability guarantees while attributing the pauses.
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

## Earlier conversation items retained

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
