# Phase194 — reject pending-lock maintenance barrier after actual browser falsifiers

2026-10-29. INVESTIGATION/EVIDENCE ONLY. All1368 current source/test files and four generated census/
construction/manifest/graph homes are byte-identical to accepted193. No candidate runtime ships in this
patch. Default still Page; Local maintenance and worker conversion remain incomplete. Restored36 focused
and98 metadata tests pass; all earlier tests/obligations/blocks retained. Candidate7 new unit cases/21
focused tests/type/lint had passed, but native evidence falsified the proposed continuation mechanism.
The candidate implementation and its tests remain as complete identified text artifacts, not active
executable tests or aggregate credit. No previously accepted tests were removed or modified.

Problem: Local content maintenance's last authenticated journal census runs synchronously inside the
actual all-store IndexedDB deletion transaction. A Worker cannot synchronously query Window localStorage;
an earlier pinned snapshot is insufficient while another compatible Local Page may write. Do not weaken
that check, drop writer fences or pretend a Window FIFO alone excludes other native shared writers.

Proposed/rejected mechanism: retain actual Worker root+active journal and Window shared old-slot permits;
queue a real exclusive intent, independently check exact held clients and pending state, then let that
pending intent prevent later shared joins during the existing Window maintenance head. It is NOT an
exclusive grant or retirement authority. Drain real work, cancel only our pending intent, resume later
writers. W3C queue/abort/snapshot algorithms motivated this candidate:
https://www.w3.org/TR/web-locks/#lock-requests
https://www.w3.org/TR/web-locks/#abort-a-request
https://www.w3.org/TR/web-locks/#snapshot-the-lock-state
Browser behavior must still be observed, not inferred from a document or controlled mock.

Actual Chrome original predicate times out180s waiting for a later queued shared writer. Older-writer
refusal and retry pass. A5s diagnostic locates the boundary: three real shared key-holding permits remain,
our pending exclusive disappears, yet the later shared request stays pending. An effect-free shared
request/query/cancel wake does not fix it: unchanged180s predicate and5s diagnostic still fail; existing-
writer refusal and older exclusive order controls pass (2pass2fail). A direct isolated probe acquires an
additional KEYLESS real shared lease before the pending exclusive, cancels that exclusive, then releases
ONLY the keyless lease. Chrome still leaves the later shared queued after5s. The exact same direct probe
passes in Firefox. Original root/active key-holding permits were NEVER dropped; no steal, timeout-based
retirement or relaxed deadline was used. These observations reject this cross-browser mechanism; they
do not establish a universal browser bug or explain engine internals.

Post-run binary Info.plist metadata identifies installed Chrome156.0.8078.74 and Playwright Firefox153.0;
version was read after the tests, not sampled from each live process. Disposable fresh headless profiles
only, no real user data or provider. Firefox skips virtual CDP authenticator restoration because this
probe exercises only Local native locks, no passkeys. Fictional H fixture only bootstraps the lab page.
One initial diagnostic used an anchored grep that selected no tests; retain it as harness error, no
native evidence. Failing driver preimages are hash-checked against receipts. Both complete candidate
source variants and build identities retained. Final source maps match the REJECTED wake candidate for
localWorkerLifetime and otherwise unchanged actual production bodies. No build transforms. Binary assets
are identified; reproduction uses preserved source/lab/driver plus pinned dependencies. Private profiles,
factors and error-context screenshots are not exported. Known fictional factor scan passes; nine owned
containers absent. No performance/qualification credit.

Decision: discard this runtime alternative and restore193 exactly. Next keep heavy crypto/coverage/
merge/preparation in Worker, but make the final small native deletion transaction a Window endpoint
under its actual Local lifetime and actual maintenance head. Compare the complete authenticated encrypted
census and a freshly Worker-authenticated journal snapshot against current bytes inside that transaction;
any change retains covered history. Preserve all original authority, MAC, coverage, interruption, native
settlement and fresh-journal checks. Use bounded frames/native cursor callbacks to avoid a monolithic
Window crypto/history job. This alternative is not implemented or accepted here; measure its input cost
under the unchanged16ms gate after full conversion, alongside2.5s peer/all-marker and30s delivery gates.
No staging/signing/push/preview8443/release/deploy/service automation/computer use. Continue current scope.

Artifact replay note: the first freezer detected an exact-byte mismatch in the embedded review patch: Git whitespace repair changed its context-only blank lines. Preserve the failed freezer/patch and store that review artifact as gzip instead. No runtime/test/source evidence changed; the final sequence must pass exact forward/reverse byte replay.
