# Phase189 — terminal presentation survives native Worker retirement

2026-10-29. The original Account transition notice is EPHEMERAL MODULE STATE, not localStorage or
restart authority. Page and Worker modules have separate instances. Forward only a closed kind and
public account ID, matched to the actual opened native account, in the existing post-drain Worker
closure acknowledgment. Reconstruct text through the existing shared message catalogue; no duplicated
runtime kind/message catalogue. Existing transition messages/state remain unchanged. Notice validation
is separate from native acknowledgment: invalid/unrelated presentation is dropped, never turned into
success or failed key cleanup. Legacy v1 close acknowledgments without notice remain compatible.

Input still withdraws immediately on native owner/channel retirement. A current post-drain closure
message also retires Window input before notifying UI subscribers, even if its independent port-close
event is delayed. Reject malformed native acknowledgments, ignore stale owners/replays. The actual
member barrier/key-disposal checks remain mandatory; this message is not a new release proof. A lost
remove RPC reply is never treated as proof of successful deletion. Forward the actual original native
transition (including pending/incomplete) instead. Only fresh authenticated native readiness clears
that account's previous Window notice; locking or an unrelated account does not claim fresh validation.
No generic invocation, credential, proof, writing or storage shim is added.

Ten new controlled shape/catalogue/scope/refusal/ordering/replay cases and36 affected unit cases pass,
plus98 metadata/type/lint/format and independent boundary audit. Original Worker open/close/drain AST
is identical after only public account ID capture and post-drain payload normalization. Existing
notice catalogue/state/messages AST unchanged; native crypto/auth/queues/journal fences/key disposal
byte-identical.446 runtime sources/198 domain homes, all old obligation rows/blocks retained, new test
source required/uncredited. No original tests removed/edited; no full-unit/qualification credit.

Real disposable account: original Page helpers/virtual passkeys create and connect two devices. Move
the primary into the actual composed Worker and invoke ORIGINAL verified-device removal. The command
reply is lost as native ownership retires (closed), Window refuses further input and original native
drain finishes; the Window notice store used by AccountSignIn gets the ORIGINAL committed-removal
message. The COMPLETE prior188 entry/client in an otherwise-current closure performs the same native
operation and closes cleanly but Window notice stays null, failing the unchanged5s observation. This
is a targeted source control, not a whole prior release comparison. Current final six native cases
pass: real removal/notice, fresh authenticated clearing, root cancellation, lost-apply/cold exact replay,
and native retirement with Window's independent hint suppressed in both raw/composed modes.

First current run also passed before adding the readiness-clear check. Source maps for final assets
match actual source bytes, no transforms. Source/control/driver IDs and all failures retained; known
factor scan passes, generated fresh factors never placed in retained outcomes. Eight owned containers
absent. These are protocol/functional tests, not a visual UI claim or latency acceptance. Default app
remains Page. Continue live configuration, Local/ceremony lifetimes and default/offline integration
before unchanged16ms input/2.5s peer/all-marker/30s delivery measurements. Separate heavy-backlog
outcomes remain open. No staging/signing/push, preview8443, release/deploy/service automation, computer
use or real user profiles/data.
