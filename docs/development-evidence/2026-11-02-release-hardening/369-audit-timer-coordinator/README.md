# Stage 4 owner timer coordinator — phase 369

The new, still unwired coordinator owns one timer and rechecks scheduling readiness at the actual native queue head. Foreground jobs wake the owner only after their real settlement. Partial passes continue under the same quiet policy, and close or abort cancels the timer and invalidates an already queued start. The 1,024-row ceiling forces an attempt but grants no verification, storage or interruption exception. The caller must retain the existing native task and oracle guards.

Fourteen new coordinator cases plus the existing start-policy, warm-content and baseline cases pass: 73 cases/four files. Types, scoped lint, new-files formatting, inventory, all 12 existing registry controls and authority pass. Two omissions each fail exactly their named assertion: removing the queue-head readiness check and removing timer cancellation on close. Both good-source restorations are hash checked. [Evidence and complete logs](./evidence.json).

The failed initial new-file layout check and an incorrectly selected nonexistent test path remain in the record. The real registry suite passed afterward; neither earlier failure earns detection credit. Classification adds one scheduling source (511 total), leaves every old source hash/domain/location and construction unchanged, and registers one new test file (682/676/6). The coordinator changes no running app behavior yet. No performance, native owner integration, format or Stage5 claim is made.

Next: expose physical pressure from both existing audit caches and wire the coordinator into AccountCapture's current native queue, retaining every audit comparison and guard. Format approval remains pending, so Stage3.2 is stopped. No new lab work, release work or measurement occurred.
