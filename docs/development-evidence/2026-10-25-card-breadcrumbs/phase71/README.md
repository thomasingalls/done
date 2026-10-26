# Phase71 — card context display and account-menu switch

2026-10-25 · bounded UI follow-up to snapshot foundation70.

Cards show a plain, wrapping heading path beneath their unchanged Markdown surface and above the
existing actions. There is no leading symbol or new link/action. Goals transfers capture the matching
accepted source row's path before submitting its text; display preference does not stop capture.
Direct composition/existing cards stay unlabeled. Renames preserve historical snapshots.

Account → Editor has a default-on “Goals breadcrumbs on cards” checkbox. It applies immediately in
this browser, hides existing labels without deleting metadata, and follows cross-tab changes. It
shares the existing gentle-context Boolean mechanism; old helper exports/keys remain compatible.
Unavailable saving keeps the visit's choice and says it was not saved. No writing/heading data enters
localStorage preferences. Providers add no DOM or change Card editor-effect dependencies.

Seven preference units pass (three new, four unchanged gentle-context cases). Final built-browser
checks26/26 pass across desktop and Android emulation: all day sections, direct entry, cold reopen,
hide-only capture, source edits, Move/Duplicate/Undo, literal-heading escaping, light/dark narrow wrap,
unchanged card-surface geometry/styles, cross-tab isolation and denied storage. The old gentle-context
browser cases also pass. A new case directly checks that an external display event preserves an
already-mounted card editor, selection, staged composition and Undo. These synthetic composition
checks do not establish physical Gboard/phone IME behavior.

Independent source review found no material UI issue and suggested that active-editor case, which is
now covered. The initial26-case predecessor was24/24 before the extra regression. TypeScript, focused
lint and frontend build pass. Actual fictional screenshots retain existing card chrome and show the
new settings. A patch-tool preflight rejected an invalid same-file delete/add operation before any
file was changed; it was reapplied as an ordinary update. No runtime failure was hidden.

Snapshots remain encrypted workspace content through unchanged admission/custody boundaries. No
server, cryptography, workspace identity, protection or source-format change occurs in this phase.
Physical-device/other-engine/performance/general qualification remain outside these checks. Inventory
refresh and broader affected regression follow in72. No real profiles, preview8443 replacement,
index staging, signing, commit, push, merge or deployment.
