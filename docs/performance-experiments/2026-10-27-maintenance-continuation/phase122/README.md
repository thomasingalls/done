# Phase122 — exact same-owner baseline proof reuse

2026-10-27. Follows evidence121. The initial two new discriminators fail on the predecessor because
recovery initialization and its next logical load each replay the same baseline. Three original
safety controls already pass. No old assertion, deadline or test is removed.

The carrier now separates fresh native baseline reading from opening/replay. The raw reader is
explicitly non-authoritative. A one-shot startup owner may reuse its private completed v5 logical
proof only after a fresh full suffix census, counter authentication, exact closed pointer/chunk
comparison, and fresh verifier-owned authority pins before and after reuse. Every sealed row and
chunk is compared. Returned state is detached and the validation callback still runs. Failed reads
clear the proof; invalidation and direct reference operations force full replay. Raw snapshots are
erased after consumption; the ordinary read wrapper still authenticates/decrypts them normally.

Eligibility has an explicit immutable-authority opt-in, enabled only by original/joined startup
recovery. Other lifecycle readers retain full verification even if capabilities happen to match.
A reader that reconstructs equivalent distinct capabilities falls back to full replay. Warm live
owners keep their full semantic oracle and rolling audit rules; v3/v4 keep independent physical
history comparison. No identity or proof crosses owners, no format/key/domain changes, no server
permission, passkey or journal contract change.

Eleven new unit cases cover exact reuse with complete native reads/fresh authority, disabled opt-in,
cold owner/invalidation, changed ciphertext and counter MAC, extra metadata, fresh and late authority
replacement, equivalent reconstructed evidence, caller isolation and expired-task separation.
The final five affected suites pass96 cases. Typecheck, targeted lint and formatter pass. The first
candidate predates the explicit opt-in tightening; its successful diagnostic remains in scratch,
while this packet retains the final rerun. That rerun uses real service/crypto/IndexedDB in disposable
headless Chromium. Its57-row first reduction preserves writing and offline reopening; subsequent
opening retains3 native baseline snapshots but performs **2 full baseline opens/replays instead of3**.
This is eliminated-work evidence, not a physical-phone speedup estimate. No computer-use tools.

The inventory correctly refuses unreviewed drift. Independent review preserves every crypto source
path/domain/site classification; only6 source hashes/line positions change. Runtime source count
and197 domain families remain unchanged. The new required unit file remains uncredited/blocked:
manifest913 obligations/368 unresolved (previous912/367). All prior obligations stay. After explicit
recording the focused86 bookkeeping/adapter cases pass; no old test fixture requires an update.
General qualification remains paused. Existing native removal/fence results are retained separately.

No commit/signing, push, preview update, release preparation or deployment. The next bounded phase
shares immutable first-conversion verification within its builder, keeping independent compact
candidate/reference/survivor comparison and installed readback. Startup-to-live-owner transfer stays
separate; this phase intentionally removes only the duplicate inside one recovery owner.

The unchanged native removal suite passes21/21 with no skips/retries, including renderer death,
strict abort/rollback, foreign low rows, journal/era recovery, failed committed readback, retained
unpublished originals, late flights, input/lifecycle/queue interruption and final-fence exclusion.

A normal activated diagnostic frontend build passes using the real Git dirty label. The first
custom diagnostic revision string is rejected by the existing container-metadata validator before
building; the failed log is preserved. No validation is weakened. Current-source origin/budget
and ordinary contract/inventory/trace checks follow; their logs are retained as bounded checks,
not aggregate qualification or release preparation.

Final review adds an explicit retained-view identity check across reuse awaits. A new disposal-
during-final-authority regression refuses a late result even with a permissive fake task. All96
affected unit cases and the native work-count diagnostic pass again after that guard; final
types/format/build pass. The21-case native suite predates only this guard. Raw results and earlier
13 successful ordinary checks are retained; current-source receipts are refreshed after archiving.

Final13 ordinary checks pass after the late guard and complete evidence population. No aggregate qualification is run.
