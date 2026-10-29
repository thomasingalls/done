# Phase174 — preserve the Window mirror across journal/source-context changes

2026-10-29. Add an internal mirror controller over the original canonical/admission/Undo owner.
Consume/capture the closed opening schema synchronously, then erase incoming and temporary journal
subkeys. Scope/root/principal/database/incarnation/credential stay fixed. Only this exact carrier's
live queue-head fence permits hot rebinding; check it before/after every await. Confirm the actual
old journal is empty, prepare a codec for the authenticated Worker's replacement context, refresh
its real storage budget, then synchronously swap route/binding/codec before queued input resumes.
Generation, epoch and era cannot regress; an established binding cannot disappear or change intent.

A private32-byte SHA256 journal-key fingerprint rejects unexpected same-generation subkey changes.
It is an internal equality guard, never exported authentication/receipt credit. Raw JS journal-key
copies are erased after WASM import; root close erases temporary copies/fingerprint/codecs. A failed
authorized rebind immediately aborts the root and drains without awaiting its own queue callback.
The original application workspace gains no fence/rebind/receive capabilities. Mirror publication
batching now matches the original page factory. No application route selects the worker yet.

13 new controlled-carrier rebind cases pass; all14 original mirror cases/assertions remain AST-exact
with their setup extracted to a shared test fixture. Guarded carrier/task/I/O and all original scope,
generation/schema/retained-key/binding checks are independently AST-identical. Regressions cover
same editor/Undo across epochs, initial/advanced eras, forged/expired fences, mismatched roots/keys,
regressing contexts, unexpected retained entries, captured inputs and close during async checking.
A private fault retaining the old era binding fails the original journal-pairing check after the next
edit. These controlled cases do not establish actual native maintenance integration: that is next.

Full2331unit cases/one existing skip,98metadata cases, type/lint pass.11 rebuilt real-account Chromium
walkthroughs pass (eight Worker paths plus three original page paths): genuine virtual passkey checks,
held-worker synchronous admission, Undo, wrong credentials, termination/navigation, quota/lost reply,
cancellation, exact unchanged-shipping-reader reopen. All included source bodies match with no source
transforms or shared memory; eleven owned containers are absent. Retain initial new fixture unused
import and unavailable ES2024 convenience API errors; use the existing ES2022 target unchanged.
The full three native campaigns in173 remain distinct earlier evidence, not rerun/credited here.

432sources retain198domain assignments. All previous obligations remain exact; newtestrequired and
uncredited:952/406blocked. Next connect an actual Worker-owned native history transition to this
Window fence/rebind, then async receive/sync, fresh ceremonies and application/Local integration.
No performance acceptance, changed16ms/2.5s/all-marker/30s gates, service automation, default
activation, preview, real staging/signing/push or release preparation.
