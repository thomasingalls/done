# Phase197 — original Local compaction, native Worker verification and final Window commit

2026-10-29. Local Window mirror now retains original automatic128-record/1MiB/750ms maintenance.
Original native owner still owns factor/crypto/counter MAC/AEAD/full CRDT/incomplete-union/exact coverage,
replacement publication/readback and eight fresh-census retries. Original Page branch is AST exact.
Worker-only bridge replaces outside-transaction journal checks with fresh async reads and original AEAD/
CRDT validation/erasure. Final authenticated retained journal observation spans the Window transaction
and its settled reply. No expired pin, caller snapshot as authority, serialized native task or fake
Storage/LockManager. No root/content/MAC/private credential key enters Window. Original native task.wait
owns transport and transaction acknowledgement; native interruption/error closing retains original rules.

Stream audited ciphertext one row at a time in64KiB parts, bounded by original4MiB record limit with
AEAD tag, no aggregate history truncation cap. Audited row ciphertext transfers after its last native
coverage comparison and erases after framing; retained counter MAC is not erased. Window copies headers,
assembles frames, and expires/erases staged census on completion/failure/Root disposal. One monotone
maintenance identity and AbortController; old cancellation cannot target a later job. Original
MaintenanceInterrupted is reconstructed only through closed interruption kind; known integrity codes
keep priority. Actual Window admission-head fence and genuine pinned Local cohort gate every effect.

Final Window native noncreating open validates all original stores/layout. One all-store readwrite
transaction cursor-compares the entire counter (including MAC), every key/header/nonce/ciphertext against
native-verified data. Native binary comparison avoids cloning large ciphertext. Missing/unknown metadata
refuses with integrity error; changed immutable records/counter/census retain everything. Synchronous
retained journal comparison precedes any delete and repeats after the final delete. One-request-at-time
covered-content deletion callbacks retain responsiveness; changed journal abort rolls every delete back.
Heads/outbound/metadata/journal untouched. Foreground/Root abort prevents effects and aborts active TX;
Window Root cleanup waits the actual final open/TX flight as well as worker native drain. No transaction
keepalive polling or pending exclusive old-slot barrier from rejected194.

Seventeen new transport/order/cancellation/census/rollback cases;53 focused checks pass, including
unchanged compaction/admission/ciphertext/Local runtime tests.98 metadata/type/lint/format and independent
Page-specialization audit pass: original merge/coverage/delete/checkJournal/owning custody/admission
bodies exact, crypto/lifetimes/journal/Account source byte unchanged196.456 sources/198 domain homes,
no home changes. New regression sources required/uncredited, no old test edits/removals or qualification
credit. Initial nine controlled IDB tests timed out because their new fixture reported zero journal
removals, so original maintenance correctly never reached128 changes; fixed fixture reports real count.
Initial new test TypeScript index/return diagnostics corrected, all diagnostics retained.

Actual headless Chrome AND Firefox: Worker automatic maintenance compacts native encrypted writing,
original Page cold reopen exact; compatible old shared writer seals during held final commit so first
trim replies false, fresh retry succeeds and cold reopens BOTH writings; foreground input aborts active
native deletion and drains before successful input/retry/cold reopen. The250ms copy delay is only an
explicit fictional old-writer journal race fixture, never a timing workload. Initial original Page
maintenance control and current Account busy-Worker sealed input/Undo/cold control pass. Untransformed
production bodies map-matched, eight owned containers absent. Earlier built helper/driver identities
preserved. No real browser/profile/data, computer use or performance acceptance claims.

Default Page remains; next finish hard-worker-death withdrawal, Local startup/bootstrap and account
ceremony handoffs, then production build/offline/default activation before unchanged16ms input/2.5s
peer/all-marker/30s delivery measurements.182/187 outcomes remain open. No real Git staging/signing/push,
preview8443, release, deploy or service-history automation.
