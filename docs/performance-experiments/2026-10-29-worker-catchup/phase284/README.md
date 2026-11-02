# Phase 284 — development-only range reader and all receipt consumers

2026-10-30. Reader first; application range writer remains disabled (independent source-usage check:
verifyInboundRange is referenced only in accountInbound). No service/wire, key, encrypted-row AD,
native commit policy, performance gate, production limit or service-automation change. V2 remains
explicitly development-only; see the new indexed-receipt development contract and its stale-tab/
rollback obligations. Do not assume older applications can reopen a carrier after its first v2 write.

One shared tag home covers membership/successor epoch boundaries, full census/epoch classification,
all three incremental paths, retention frontiers and selected retained entries. New range verifier
uses the existing per-entry mechanism. It captures bytes/authority fields, authenticates the exact
request/page once within a single call, and retains fresh prefix/lifetime/expiry/actor/link/envelope
checks for every entry. No native progress is produced here. Aggregate byte/record limits and
failure erasure remain. Stored v2 selected-position replay authenticates originals independently;
no persisted trust, cross-owner proof or cached permission. Old one-entry API and v1 bytes remain
exact; old tests are retained.

36 new cases pass: wider short/empty pages, independent indexed bytes, every selected entry in
ranges4/8 (header signature work exactly2+2n), bad later evidence, request/scope/expiry/prefix/late
owner, caller ownership, stored service signature, aggregate bounds and all readers. Real member/
successor fixtures exercise full and incremental reference equivalence. Full census retains the
second original from a combined page; native encrypted retention/removal/reopen succeeds. A real
admitted checkpoint cut inside one wider page preserves only its verified handoff suffix. These
are reader/storage correctness tests, not deep latency/fairness or stale-tab/rollback qualification.

Initial focused test failed because the new test omitted composed self advancement; adding the
actual pending-aware coverage/self step aligned its comparison without weakening the assertion.
Twelve isolated fault controls pass. The first cold-index fault survived because an unrelated own
event supplied the correct epoch; retain that inconvenient result. The strengthened new fixture
has no masking own event, and the exact epoch fault now fails. Individual membership, successor,
census, all three incremental paths, retained selection and retention routing faults are detected,
plus skipped later entry, stored-header auth, borrowed context and aggregate-record-bound faults.
Only disposable source copies were faulted, restored after each attempt. All raw attempts retained.

Final full Vitest2825pass/oneexisting skip,278files. Earlier full pass retained; final rerun follows
the fixture-strengthening change.119metadata/registry/adapter units,7repository contracts, types,
scoped lint/format pass. No old test/case/assertion/deadline removed. The only old test edit updates
open count15→16 and appends the exact new open construction ID; specified78 assertion is unchanged.

Independent bookkeeping preserves all1027prior obligation rows/exclusions and old selections;
adds2required uncredited test rows and one open construction (1030total,483unresolved tests).
All78specified contract fields are exact except reviewed source-site relocations. New v2 tag is
an open obligation, not qualified by old v1 vectors. Runtime inventory503files; exactly7source
identities change in this phase. V1 tag fact moves to inboundRecord; all other domain homes remain
exact. Crypto labels198→199, open constructions15→16, no aggregate credit or release activation.

Known development tradeoff: whole signed page repeats per selected receipt. Wider-range storage,
replay and maintenance costs need measurement before adoption. Four-position publisher fairness,
large-entry fallback, actual4/8 deep runs, Page deep64, repeatable fixture/withheld/normal gates and
native stale-tab/rollback behavior remain. Cold282confirms2full/3exact, but unreduced publication
still22.378s/+10full(observer-inclusive); no changed-evidence reuse is introduced here. Normal
Page/Worker comparison held. No release prep, signing, push, deploy, preview, computer use or
personal-profile access.
