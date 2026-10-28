# Phase93 prospective mechanism comparison

Decision: is whole-inbound structured cloning a worthwhile next bounded client repair? Current
source and the older static S06 agree that prepareRead selects one publisher after cloning every
retained receipt/peer; status also clones every receipt before reducing it to scalars. Server proof
reuse/discovery repairs already shipped; do not repeat that work or infer their old timings here.
Base: unsigned92 tree42187324d94441d548f5bc82667af7dbc34f45cd. Preview build is immutable and independent.

Design: fixed paired synthetic benchmark in Chromium, one fresh disposable page per depth/block,
CPU4x, one worker/no concurrent build or validator. Depths32,256,1024,2048 per publisher; two publishers,
unique2KiB envelopes plus512B proof buffers per retained position. These are realistic-shaped synthetic
values, deliberately not claimed to be cryptographically valid accounts. Fixed20 repetitions/condition,
three blocks per depth, order R/C,C/R,R/C. Unit of analysis is a whole block; repetitions are dependent.
No statistical population claim, p-value or power calculation:3 blocks are finite engineering evidence.
Primary: detached-clone retained-byte volume and paired preparation/status elapsed cost at1024+.
Independent byte walker outside timing verifies the shapes; prefix/conflict/starting-point/status
results must match. No payload buffers may leave the cursor projection. Match actual old callback and
produce a narrow scalar cursor prototype. Do not use it to verify or apply a page.

Predeclared decision: require zero retained receipt bytes in candidate outputs, exact necessary cursor/
status equivalence and >=20% median deep projection time improvement; preserve each raw block. A
reference first-to-last median drift >15% qualifies timing as contaminated. Small-depth additions over
0.5ms/op or any functional difference stop promotion. Even a passing mechanism does not establish
end-to-end catch-up,2.5s live peer,16ms local input,30s delivery,600s replay or120s continuation gates.
Those gates stay unchanged. If copying is negligible, choose another candidate instead of refactoring
for its own sake. No network/rate/retry/crypto/authority/ledger/custody check changes.

Runbook: freeze this protocol; record browser/host/source; run the serial plan; retain all failures and
raw rows; independently analyze output/shape agreement. Only then implement a narrow verified-owner
projection with unit/native regressions. Cold opens/phone/Gboard/production capacity are outside this
measurement. No real accounts, profiles, codes or keys are used. No release preparation or deployment.
