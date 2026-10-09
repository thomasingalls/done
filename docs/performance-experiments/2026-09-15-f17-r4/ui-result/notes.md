# R4 shared UI card lookup: focused test evidence

The only source file added by this subtask is `test/workspaceUiIndex.test.tsx` in the isolated candidate checkout. No runtime file, main checkout file, or commit was changed.

The first execution of the new test file passed: seven cases, 1.84 seconds total, 208 ms test execution. `initial-focused.log` is the unmodified Vitest output. There was no initial test failure to preserve. The preceding attempt to invoke a nonexistent Prettier executable failed with MODULE_NOT_FOUND; this repository uses oxfmt. The scoped oxfmt run succeeded (`format.log`).

## Coverage

The tests mount the real `WorkspaceUiProvider` and real `Collection`, retaining the real `useCardReorder` hook and static archived renderer. `Card` and `Compose` are replaced only at their leaf ports so tests can inspect their text, action callbacks, structural hooks and focus requests without mounting CodeMirror. The controlled workspace supplies read/subscribe/status/command/retry/discard methods; other methods are deliberately absent so unexpected use fails.

The seven cases cover:

- Every workspace publication still invokes the authoritative read. Current consumers share the same lookup. Replacement cards with the same identity update content including emoji, combining marks and CJK. Duplicate entries in `snapshot.cards` resolve to the last card just as native Map does; `__proto__` is an ordinary key. Retained older lookup closures retain their detached objects.
- The actual Collection renders new/replaced/removed cards in current membership order, filters missing ids, moves content between collections and removes an empty Scheduled collection.
- Status-only and command-error rerenders preserve the mounted lookup. Retry and discard buttons call the live workspace methods; refused commands still produce the provider's error state.
- Membership-only publications update Next-cap affordances, merge predecessor focus and real reorder-hook command indices. Changing the displayed date refreshes move and compose destinations. Callbacks submit actual WorkspaceCommand shapes through the provider.
- Archived strings remain independent of the live index and update through the actual static renderer when live cards disappear.
- A failed publication read leaves the existing projection as before; a later readable publication replaces it. Switching owners and unmounting remove both subscriptions.
- Fifty deterministic generated histories (seed 170409), with 1–12 publications apiece, compare both provider lookup object identity and actual Collection content/order against a fresh native Map oracle. Generated card arrays include duplicate ids; generated membership arrays remain unique to avoid testing React's unsupported duplicate sibling-key reconciliation. Lookup ids include `__proto__`, emoji and CJK; bodies receive an emoji suffix. Generated duplicate **card records**, missing memberships and replacement/removal behavior are covered.

No once-per-publication Map construction count is asserted. `useMemo` is an optimization that React can discard; current-publication sharing and freshness are the behavior tested. The mounted status-only identity check verifies the intended optimization in ordinary rerenders, without claiming a React lifetime guarantee.

## Limits and next evidence

These are jsdom component/port tests. They do not prove native editor/IME behavior, rendering latency, storage admission durability, or Account transport semantics. Commands are recorded and resolved by the controlled workspace rather than executed against CRDT/storage. Root owns the affected existing tests, TypeScript, deliberate stale-dependency and wrong-key controls, candidate build and serial native timing. The suite is designed to fail a memo dependency changed to `[]` or an index built under text instead of id; it does not depend on the implementation's Map construction shape.
