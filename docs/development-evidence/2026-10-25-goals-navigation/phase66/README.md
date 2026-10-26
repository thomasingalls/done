# Phase66 — gentle context and browser presentation preference

2026-10-25 · selected implementation · sequential patch66 after design65.

## Bounded outcome

Goals keeps one admitted editor. A numeric view-only scope keeps the current section, two nearest
heading ancestors and selected writing clear. Other rendered lines get a text-color class. The
offscreen fallback measures the scroll area clipped to the visual viewport. No text/layout/undo,
card, account or protocol changes. The sidebar toggle defaults on, applies immediately, persists
one content-free browser Boolean and follows cross-tab changes. Storage denial retains the visit's
choice with truthful feedback. Existing protected-workspace and canonical write paths remain.

The planner skips inline/code subtrees, caps block lookup, and uses completed parse work without
forcing a new parse. Measurement coalesces; its view effect is deferred beyond CodeMirror's active
update, fenced by editor lifetime/generation/exact measured state. Removing the extension cancels
its listeners and rejects queued work. No heading content is persisted in UI preferences.

## Evidence

-24 focused unit cases pass, including existing heading/Goals cases, parser-frontier coverage,
  Setext/skipped/code headings, selected text and half-open boundaries, bounded refusal and defaults.
-8 actual built-frontend browser cases pass: five new feature cases plus all three old breadcrumb
  cases. They cover dimming/offscreen restoration, geometry, input/Undo/reopen, cross-tab settings,
  blocked preference storage, resize/rapid toggles and absence of editor exceptions.
-TypeScript and focused lint pass. Read-only independent review compared225 positions against a
  complete-tree ancestry traversal and checked lifetime/admission/preference boundaries.

The compressed reports and build log preserve these bounded results. They do not establish phone
IME, performance budgets, full-suite or general release/security qualification. New test obligations
remain required but uncredited; final inventory/census bookkeeping follows in its own phase.
No old tests/assertions/deadlines were changed in66. Browser menus follow separately.

## Failures retained

Early new unit fixtures omitted multiple-selection enablement and used a block corpus below the
lookup bound. A further failure exposed completed parser work being newer than `syntaxTree(state)`;
the zero-budget completed-tree read and dedicated long-document case repair that scope error.
Initial typing declarations incorrectly used a non-public editor window property; the owner document
now supplies the window. First browser attempt had5 passes/2 failures: dimming never installed because
dispatch inside measurement.write nested an active CodeMirror update. Independent review identified
the same defect; deferred/fenced dispatch repairs it and the additional lifetime/error case passes.

The first browser JSON/output directory was reused by the final attempt. The original counts/errors
are retained here from the tool transcript, not claimed as preserved raw first-attempt artifacts.
Passing final reports do not erase those attempts. A diagnostic-script parenthesis error was also
corrected before its fictional editor inspection. All data used here are disposable local fixtures.

## Boundaries

No source commit, real index staging, push, merge, deployment, preview8443 replacement or qualification
resumption. The candidate uses an isolated loopback53921 origin and build directory. Other-seat
progress and prior design artifacts remain unchanged. UI presentation is not accepted content or
authority; no bypass of admission is introduced by a display setting or navigation decoration.
