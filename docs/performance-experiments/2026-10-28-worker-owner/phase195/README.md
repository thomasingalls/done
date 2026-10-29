# Phase195 — scoped authenticated journal observations for a final commit boundary

2026-10-29. Read-only foundation, no deletion/automatic maintenance activation yet. Window retains one
bounded ciphertext observation through the existing page transport; it shares the two-snapshot bound,
keeps ordinary page completion/finish behavior, and releases at explicit finish or Root disposal. Final
comparison requires the retained observation's pages consumed and the same active genuine Root, rereads
current scoped keys/values synchronously, and compares exactly. Added/removed/replaced scoped ciphertext
refuses equality. Unrelated account/budget writes do not invalidate this scope. Errors refuse; nothing
is deleted. Observation ID is data, not a native permit, crypto approval or retirement receipt.

Extract original Worker bounded page reader into one helper, preserve exact loop/entry/character limits
and ordinary pin-before-finish ordering. The ordinary pin callback runs at page completion before an
extra await; observation reads NEVER invoke it or install pinned permission. Runtime lifetime/activity/
fence behavior otherwise exact. Native Local private factory exposes observation only through its
actual live.run task: original journal AEAD opening and original CRDT-byte validator execute in Worker,
opened bytes erase on scope exit, retained Window ID expires in finally even on refusal/close. No root,
content, metadata-MAC or private credential key moves to Window. No fake Storage/LockManager/task or
serialized verification lease. Ciphertext transport itself grants no application open/clear authority.

Eleven new transport/scope/bound/refusal cases and33 affected tests pass, including original bridge and
Local runtime/dependency tests unchanged.98 metadata/type/lint/format checks pass.454 runtime sources/
198 domain homes, no home change; two new test sources required/uncredited, prior obligations and blocks
retained. Independent AST audits recover original bounded page loop/limits, pin placement and cleanup,
all remaining runtime/custody/native crypto/admission/commit bodies, and ordinary Window read/page/
finish/remove behavior after specializing only retained observation. No old tests edited/removed or
full-unit/generalized qualification credit. Initial new-fixture unused import and intentionally malformed
page's direct TypeScript cast were corrected; diagnostics retained. A source-review ordering refinement
kept the existing ordinary pin callback at exact page-completion point; initial helper preimage/build
identity retained, final source rebuilt before controls. No timing acceptance claimed.

Actual original Page creates fictional encrypted Local writing. Its independent old shared writer seals
an update while the native Worker opens factor/census/crypto normally. A controlled250ms background-copy
wait (only fictional fixture, not a performance workload) keeps real sealed journal bytes available;
all other timer behavior remains native in final control. Worker authenticates retained observation,
then that old writer seals another update. Window exact comparison refuses the stale observation. A
fresh observation authenticates both/more entries and matches; decrypted bytes erase and both IDs expire.
Flush/close and exact original Page cold reader pass. The same actual crypto/scoped observation case
passes in headless Chrome and Firefox. Firefox uses no passkey/provider and skips unrelated virtual CDP
restoration. Original current Account busy-Worker zero-RPC sealed input/Undo/exact Page cold reopen and
Local quota-fallback commit-before-promotion controls also pass. Final production bodies untransformed
and source-map matched; five owned containers absent. No real profiles/data/factors or computer use.

Default remains Page. Next integrate original Local maintenance with its actual Window queue-head
fence and a final Window native transaction that retains exact fresh journal/ciphertext census checks;
heavy crypto/coverage/merge/preparation stay Worker. No pending-lock barrier from rejected194. Considered
cross-turn transaction keepalive, but its own primary documentation warns of CPU-heavy dummy requests:
https://dexie.org/docs/Dexie/Dexie.waitFor%28%29
Prefer stage bounded encrypted census data before the final cursor-based transaction rather than
starting with that polling approach; do not weaken data equality or introduce a truncating history cap.
Any remaining Window commit/memory cost still needs unchanged16ms measurement after full conversion.
Ceremony/startup/offline/default integration and16ms input/2.5s peer/all-marker/30s delivery gates remain;
separate182/187 outcomes open. No staging/signing/push/preview8443/release/deploy/service automation.
