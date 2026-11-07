# Phase171 — account coordinator over the actual workspace port

2026-10-29. Extract the existing page factory and a minimal workspace/status/durability interface.
The coordinator can now be composed over another genuine admission endpoint. It does not require
a fake canonical document or throwing workspace methods. The worker-only entry still enters the
original native/account authentication. No application route selects it yet. The page factory keeps
source capture, batching/publication, signal handling, original command/Undo and exact signed-input
refusal. Its options contain only identity/today/signal, not authentication material.

Independent AST comparison finds the original factory call identical and the entire coordinator
body identical except binding the injected factory result. Four new functional cases plus old
mirror/scheduler/notification/maintenance cases pass (61total). They cover same-handler journal
admission/Undo, signed-input refusal, actual FIFO exclusion and the original prepared final callback.
Three rebuilt real-account Chromium cases pass: normal original code/passkey authentication, sealed
input/Undo, native close/exact shipping reopen; genuine signed assertion corruption refusal; wrong
code refusal. No source transforms, profile reuse beyond fictional fixtures or actual-user data.
Type/lint/format and98 metadata cases pass. Keep initial unused import, new fixture byte-type errors
and expectation of the inner rather than wrapped validation error. No old tests/assertions change.

431sources retain198domain assignments, construction source lines only. All old obligations remain
identical; new testrequired/uncredited:948/402blocked. Original admissionQueue is byte-unchanged from170.
No full performance sweep repeats here; the preceding full2300unit run is evidence for170, not the
new source. No measured speed claim or changed16ms/2.5s/all-marker/30s gate. The prior long journal
observer failure remains unresolved. Continue with genuine queue-head journal fences, safe hot route/
era rebinding and async worker receive handoffs before application/ceremony integration. Existing
OwnedReceiveQueue does not itself flush the local journal; a prior external barrier is insufficient.
No default activation, service automation, preview, real staging/signing/push or release work.
