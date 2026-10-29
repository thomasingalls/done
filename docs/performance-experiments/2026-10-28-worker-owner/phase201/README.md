# Phase201 — one read-only encrypted journal observation implementation

2026-10-29. Extract original Window complete key/value capture, pair grammar, limits, pages, retained
observations/expiry and Root disposal into windowJournalRead. Its genuine supervisor is lifetime/data
supervision only: no append/remove capability and no Storage mutation. Prefix grammar restricted to
existing old/hashed journal names, all snapshots share two credits/one retained observation across
prefixes,16MiB/65536 bounds unchanged. Each observation remembers its own prefix, so unrelated origin
or scope writes cannot invalidate that scope or redirect its exact comparison. One Root disposal
registration; no unbounded per-prefix readers. Observation IDs and ciphertext never mean crypto approval.

ORIGINAL Window journal factory STILL requires strict old-slot guard FIRST, verifies selected active
index/name and binds prefix exactly. Only it retains original16-entry identity/value-matched remove
body unchanged. New data-only core cannot construct that authority for ceremony supervisors. Original
Account/Local scoped capture/map credits/page/finish/observation/strict mutation independently AST exact
after specializing fixed validated prefix; original namespace derivation unchanged. No legacy clear,
unconditional prefix removal or implicit application authority is added.

Fixed startup ceremony environment composes SAME bounded Worker page reader for fresh encrypted reads
and scoped observations; no observed-pin callback. Its pinned method always refuses, and remove always
refuses locally without a mutation RPC. Journal owner chooses this asynchronous reader only in actual
fixed ceremony environment; ORIGINAL AEAD/CRDT read/retry/erasure remains Native Worker. Page and
Account/Local behavior exact without that environment. Client exposes only read/page/finish handlers;
no mutation or arbitrary localStorage access. Existing count/genesis/route/refusal/lifetime paths exact.

Eight new data/credit/prefix/lifetime cases;48 focused tests including original bridge/observation/
native-runtime/genesis controls pass.98 metadata/type/lint/format and independent extraction audits
pass.463 runtime sources/198 domain homes, no home changes; new required test remains uncredited, no old
tests modified/removed or generalized qualification/full-suite/timing claim. Initial extraction left
two now-unused imports, corrected; diagnostics retained. Crypto/native lifetimes/authority/genesis/
maintenance and Worker owners byte unchanged200. This phase does NOT enable protection or deletion.

Actual headless Chrome/Firefox: original Page Local writer keeps genuine sealed journal available
with explicit250ms copy-delay fixture; actual native ceremony Worker uses ORIGINAL openJournalSession/
custody/AEAD/native shared task, decrypts first update, then fresh second read includes second update.
Pinned/removal authority refused; flush/close and original Page cold exact after controlled delay ends.
Corrupted retained ciphertext refuses with repair-required and remains present. Test has no app doc,
fake authority or source transform; deliberate delay is not a performance workload. Original Local
Worker automatic maintenance/cold-exact passes both browsers, Account busy Worker zero-RPC input/Undo/
shipping-cold control passes Chrome. Final production source-map bodies exact; seven owned containers
absent. Fictional isolated profiles only, no real data/factors or computer use.

Next protection must retain original native exclusive ownership, target readback and source retirement
ordering. Supervisor/raw observation is NOT permission for broad journal deletion. Prefer exact
already-covered immutable journal cleanup with explicit target coverage and interruption/resume proof;
do not fake a native task or weaken strict old-slot factory. Account ceremony handoff, UI/default/
offline/build conversion then unchanged16ms input/2.5s peer-all-marker/30s delivery measurements remain.
182/187 outcomes open. No real staging/signing/push, preview8443, release/deploy or service automation.
