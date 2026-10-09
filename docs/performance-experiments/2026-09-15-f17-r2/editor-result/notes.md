# Round two editor projection candidate

Hypothesis: a publication for one surface currently scans the entire unchanged text of other mounted surfaces and always sends a selection transaction to CodeMirror. That transaction rebuilds live-preview decorations because `selectionSet` is true. Skipping work when the accepted text, effective selection and editability are unchanged should reduce cross-surface projection cost without changing storage/admission behavior.

The candidate is limited to `src/editor/admittedEditor.ts`. It keeps every `document.read()` call, computes the same effective local-versus-accepted selection, and returns only when text, editability and all public selection state match. It defers prefix/suffix diff scanning until text actually changes. It neither caches nor trusts a previous successful document read. Changed selection, editability, text and unreadable reads retain their existing projection paths.

Review caught the composition reconciliation exception before browser screening: the composition-end microtask must still dispatch even if the accepted model did not change, because preedit DOM may need reconciliation after refusal. That path now explicitly forces projection. Active or suppressed composition also bypasses the no-op return. The focused suite includes a cancelled-preedit check; actual native IME behavior still belongs in promotion validation.

This intentionally removes CodeMirror update-listener notifications for an unchanged projection. Workspace publication/status callbacks, admission receipts and user-input behavior are unchanged. Custom extensions that relied on redundant selection transactions would need review before promotion; the mounted product extensions use actual text/selection/viewport changes.

Focused evidence initially passed 10 tests; the initial log is retained as `focused.log`. The final focused suite, including the composition guard, passed all 11 tests in 1.32 seconds (`focused-final.log`). Scoped formatting and direct TypeScript build checking passed (`format.log`, `typecheck.log`). This is exploratory evidence only, with no browser speed claim yet. Root performs common browser screening and combination comparisons serially.

Remaining validation before promotion: actual native composition/refused-input/pending/remote editor paths, document/card selection and keyboard behavior, plus the selected combination's unchanged broader release gates. No account/default activation, protocol changes, build, package installation, commits or main-checkout edits were performed by this agent.

The mounted Goals extension also responds to `selectionSet` by rebuilding its selected-line state and scheduling a React state update (`src/ui/Goals.tsx`). Removing the redundant transaction avoids that work as well; actual selection/text changes continue to update it.
