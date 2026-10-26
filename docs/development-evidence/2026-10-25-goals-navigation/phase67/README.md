# Phase 67 — breadcrumb menus with the full outline

2026-10-25 · bounded presentation/navigation change · unsigned patch after 66.

## Outcome and contract

Goals remains one formatted, admitted editor. Its stable root control still opens the complete
source-ordered outline. Breadcrumb text scrolls to its heading; adjacent controls offer immediate
children or, at a leaf, siblings from the same authored parent. Skipped levels remain authored.
Duplicate labels retain separate positions and show ancestry plus line number. A common ancestry
prefix is derived once when opening; ordinary typing and menu-row rendering do not rebuild catalogues.

Navigation never changes the selection, writing or undo and never focuses the editor. Choosing a
menu destination returns keyboard focus to the stable Goals control; a leaf trigger could disappear
when navigating to a sibling. Escape restores the originating trigger without closing narrow Goals.
Outside pointers dismiss, local menus support arrow/Home/End keys, and changing the accepted document
closes menus. Every destination independently checks the captured immutable document before scrolling.

## Evidence

- 13 focused unit cases pass (six new hierarchy cases and seven existing breadcrumb cases).
- Seven new built-frontend browser cases pass: full/local outline, authored levels, duplicate locations,
  caret and undo preservation, keyboard/outside dismissal, stale destination before React dismissal,
  narrow light/dark layout and the empty document.
- TypeScript and focused lint pass; independent read-only review challenges focus and native touch.
  The later consolidated evidence preserves that review and the affected old-test run.
- `menu-dark.png` shows the actual candidate with fictional writing. It does not establish real phone
  IME or hardware behavior. Browser runs use fresh disposable profiles and loopback53921.

## Inconvenient results and limits

First new browser attempt: five pass, two fail. The fixture captured a large insertion before its
admitted continuation finished, and attempted a raw text transaction that the application correctly
refused for lacking a semantic admission adapter. Fixtures now await complete accepted text and
observe a real admitted projection. The raw-transaction refusal was preserved, not bypassed.
A later stronger final-scroll assertion expected an intro line at the edge, but actual insertion
scrolls its caret to Work. It now checks the actual first section and near-start scroll while retaining
the stale-destination counterexample. Separate attempt reports retain these failures.

Review confirmed that choosing a destination stranded keyboard focus on body; stable-root focus fixes
that defect. Actual CDP touch swipes reached clipped ancestor breadcrumbs without changing panels.
A proposed pointer interception was removed before sealing: no gesture defect was established.
The initial screenshot script used an unavailable import and then a too-short final section for its
scroll setup; the successful fictional screenshot uses the installed package and a scrollable section.

The old breadcrumb geometry fixture still measures a trail nested inside the root button, which is
now deliberately a sibling of separate breadcrumb buttons. Its narrow locator adaptation and broader
regression/bookkeeping follow in 68; no old test/assertion/deadline was changed here. No account,
protocol, crypto, persisted workspace format, card styling or transfer command changes. No real index
staging, commit, push, merge, deployment, preview8443 replacement or qualification resumption.
