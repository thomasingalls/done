# Phase209 — retain the final Account initialization boundary

2026-10-29. Source trace corrects an earlier continuation hypothesis: the only initial-generation
activation caller is verifyJoinedAccount, itself invoked by the actual joined write-session initialize
callback in accountCapture. Native final opening already occurs after Account Worker runtime install;
its original bounded opening journal read/pinned guard applies. No new ceremony permission is needed.

An exploratory unneeded ceremony-only empty-journal observation fallback was drafted, then rejected
before any browser run, bookkeeping registration or source patch freeze. It would add another cached
observation/scope mechanism where the original final Account path suffices. Preserve original synchronous
journal checks before and INSIDE the final commit, original generation/census/MAC checks and original
owner composition. Future native wizard must hand off to the actual Account factory before opening.
Rejected source retained as inert compressed evidence, explicitly NOT applied. No new runtime helper,
content/custody/crypto/storage format or permission remains in the checkout.

Independent AST trace identifies both real call sites and their actual owning callback, with source
hashes; all268 phase208 built production bodies are byte unchanged.23 affected original initialization
(including late journal and abort/refusal), dependency/handoff/reference tests pass. No old test change,
new test or aggregate credit. Existing metadata208 remains source-identical; no repeated general
qualification, browser benchmark or timing acceptance. No native containers/profiles created here.

Continue explicit browser credential and setup-workspace ports, whole native Account coordinator,
offline/default activation, then unchanged16ms input/2.5s peer/all-marker/30s delivery measurements.
182/187/205 blockers remain open. No staging/signing/push, preview8443, release/deploy or automation.
