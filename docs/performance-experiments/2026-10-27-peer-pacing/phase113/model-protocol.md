#113 supplemental — Scheduler mechanism counterexample, not a timing replay

Before dispatch freeze three finite fake-clock histories using the exact production batch-window
function and scheduler slice: receive quantum100ms/prelude0ms,250ms/0ms,100ms/250ms. Offer8 local
wake events at0,500,…3500ms, run through8000ms then cancel/drain. Fixed round values are discriminating
controls, not fitted estimates of real per-pass or storage/crypto cost. Earlier retained data cannot
identify those internal costs. Keep the source untouched and record full/sliced hashes and logs.

Use success/progress-only mocked operations: receive work consumes its specified quantum; a send with
pending input consumes the specified prelude before invoking the actual beforeNewEnvelope callback.
Persisted submission/retry/auth/crypto/application paths are outside this mechanism model. No actual
workspace, proof, read authority or durability is replaced or weakened. No performance/adoption credit.

Hypothesis: repeated new local notes can keep postponing a due window when either an active receive
pass ends at the next input or asynchronous send prelude reaches the next input. Existing fixed2s
batch cap should eventually allow publication. Compare first publish in the two overlap histories
with100/0 control. If they do not delay first publication beyond1s, the proposed mechanism is not
established by this chosen counterexample; preserve it rather than tune until passing. Check one
active lane, monotone positions, all8 offered keys published and clean cancellation/drain. These
histories demonstrate a possible mechanism, not which cost occurred in111 or a safe repaired policy.
