# Phase168 — actual dedicated-worker owner and asynchronous journal recovery

2026-10-29. Internal composition only; the default application still runs on the page. The actual
production worker entry authenticates the original Account owner and holds genuine native leases.
A scoped asynchronous encrypted-journal endpoint replaces the experimental shared-memory shim;
there are no source transforms, shared memory, isolation headers or configurable lock managers.
The worker keeps native storage, root/content/signing keys and original crypto verification. Only
journal subkeys and exact authenticated content records enter the Window mirror. Synchronous
journal views expire after opening or an explicit Window FIFO reservation. An observed snapshot
cannot authorize a later mutation. Activity is advisory; final native checks remain mandatory.

Bootstrap fragments preserve every original record identity/byte, including historical states over
the current append-size limit. Close cancels pending calls, drains or terminates the worker, and
retains the native member barrier before releasing the Window endpoint. Hard termination earns no
graceful worker-memory-erasure credit. The Window retains the original command/admission/Undo
queue and synchronous sealed admission: held-worker and lost-reply cases reopen exactly once in
the unchanged shipping reader. Opening cancellation cannot revive a stale session.

**Observed functional evidence:**2289 unit cases pass with the existing single skip;26 native
Chromium/Firefox cohort/runtime cases pass; both stale-fence mutations fail at the intended
assertion. Eight actual-account Chromium cases pass against rebuilt, source-matched code without
SAB or source transforms: held worker/Undo; corrupted genuine passkey; wrong code; worker death;
Window navigation; quota fallback; lost committed reply; cancelled opening.206 built source bodies
match the repository. These tests use fictional writing and genuine signed virtual-authenticator
assertions verified by the original cryptographic path, not a mocked authentication approval.
Type/lint/format,98 metadata cases, default page build/budget/origin/admission/authority/WASM/Yjs
checks pass. No original latency gate was measured or changed.

The original native lifetime campaign passes13 cases and detects all5 fault controls in a serial
run. The long journal campaign passes17 cases, then encounters observer timeouts in four later
mutation runs. Fresh scoped runs detect those four controls; the other two were detected in the
combined run. This is **not** a passing full combined journal campaign. Concurrent lifetime/journal
attempts also time out; preserve all attempts and unchanged deadlines/assertions. Investigate the
observer separately if it recurs. Other retained failures: missing observer module in the private
server, initial type errors, wrong runner argument, and an overly restrictive *new* bootstrap read
limit corrected before final testing. The native isolated results establish functionality only,
not default UI/IME, background execution, peer responsiveness or actual-device performance.

One old fixture now waits for its existing saved-membership-hint assertion. The production config
source is unchanged since6eeb7d5f: live hints intentionally precede optional fenced persistence.
A new deterministic test blocks the metadata permit to demonstrate that ordering. No test,
assertion or deadline was removed.426 runtime sources retain198 domain labels/owners; three
construction references move source lines only. All previous qualification rows remain identical;
three new files are required and uncredited (945 obligations/399 unresolved).

Reproduction sources, all attempts, closed build identities and the fictional archive are retained
here; factors, credentials and browser profiles are omitted. The independent review checks source
identity, prior obligations, line-only construction changes and results. Continue with an acyclic
low-level runtime boundary, actual receive/maintenance composition and application integration.
Fresh setup/recovery capabilities must remain worker-owned and independently verified; no cloned
approval flag or extra passkey prompt. See remaining-boundaries.md. No default activation, preview,
real staging/signing, push, release preparation, service automation or deployment.
