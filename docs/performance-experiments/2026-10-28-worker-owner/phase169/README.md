# Phase169 — acyclic runtime coordination and journal protocol

2026-10-29. Remove the new runtime-to-owner import cycle before wider worker integration. Native
coordination/error/permit primitives and the data-only journal protocol each have one dependency-free
home. The dedicated-worker join depends only on native coordination. Window cohort and old public
exports retain the same class/function identity. Runtime ports still resolve the actual secure-context
native lock manager; callers cannot provide a replacement. Authentication, native lease ordering,
compatibility, lifecycle/drain and synchronous admission remain unchanged.

Independent AST comparisons retain the original lifetime, Window cohort and worker join bodies,
allowing only the fixed helper-name replacements. Error/permit functions and protocol declarations
are exact. The new static-import closure regression detects the old high-level owner dependency
in both entry points and passes after extraction; it also refuses cycles and verifies old exports.
63 focused cases,26 native Chromium/Firefox lifetime/runtime cases and98 metadata cases pass. Both
missing-anchor faults still fail at the same stale-ticket assertion after moving the mutation target
to the join's actual home. Eight rebuilt actual-account Chromium cases pass with genuine signed
virtual-passkey assertions and unchanged-shipping-reader recovery. No source transforms or SAB.
Type/lint/format pass. Initial new-test use of the removed TypeScript compiler API and an empty
native grep selection are retained as harness failures, not counterexample or acceptance credit.

429 sources retain all198 crypto domains/owners; only the existing slot coordination label changes
its source home, with the corresponding explicit construction reference. All previous qualification
rows remain identical; the new test is required/uncredited:946 obligations/400 unresolved. This does
not resolve the previous combined journal observer timeouts; its scoped evidence remains in168.
Default app still executes on the page. Next bound lifecycle/activity delivery, then compose actual
worker-owned sync/receive/maintenance and application ceremonies. No performance acceptance,
gate change, native-check relaxation, service automation, preview, commit/push or release work.
