# Private retention evidence reuse — 2026-10-13

Base: signed `eb2a3374`, the [grouped atomic exchange](./account-local-retention-fenced.md).
This phase changes private evidence handling, not the stored format, exact cut, authority policy or
public switches. Release validation remains paused.

## Ownership contract

The planner still deep-captures its complete raw inventory, candidate, semantic counter and exact
deletion evidence in a private WeakMap. Original caller mutation cannot change that capture. It owns
and erases those bytes on disposal. Full detached inspection remains available for focused tests.

Runtime consumers no longer request the full inspection object:

- Final independent replay receives a detached candidate baseline/anchor.
- The storage adapter receives a detached candidate, semantic and raw predecessor counters, and
  deletion store/key pairs. It does not receive old ciphertext rows or old encrypted chunks.
- A synchronous comparison checks a fresh inventory directly against the private capture, after
  rechecking the live plan, owner lifetime, intent and reduced-reader binding. Its boolean form lets
  pre-mutation preflight abandon changed evidence without reserving a nonce.
- After strict reservation completes, a verifier snapshots only the reserved counter and binding.
  Each invocation re-fetches the still-live private plan and checks its guard. It substitutes exactly
  that counter entry and compares all other fields, keys and sealed bytes against the original
  capture. It never exports or erases borrowed plan data. Its own disposal erases only the small
  counter snapshot; plan disposal or owner invalidation makes it unusable.

The reservation verifier is a comparison facility, not authority to sign, write or delete. Only the
existing adapter derives and signs the reserved counter, commits its exact predecessor comparison,
seals the candidate and attempts the final exchange. There is no persisted handle or reusable
authorization detached from the original owner lifetime.

## Boundaries retained

Preflight still reads every physical row and metadata entry. Both strict transactions still collect
a complete census and compare it once against the private evidence (with the reserved counter only
in the second transaction). Repeated comparison against a detached copy of the same private plan
is removed. Fresh complete custody/authority checks before the exchanges, synchronous owner/activity
and journal checks inside them, and deletion-set completeness proof are unchanged.

After the replacement census matches, its actual metadata keys identify obsolete encrypted chunks.
These are the same exact keys just compared, used synchronously inside the transaction. Logical
stores are cleared only after independently proving equality with the complete deletion set. An
extra low key, changed ciphertext, missing row, old chunk change or malformed cut refuses before clear.

Reservation burns, strict settlement, exact raw readback, authenticated reduced load, independent
replay and final fresh authority/journal checks remain. Uncertain mutation still closes the owner.
Input can cancel preparation; it cannot enter during the final fenced exchange/readback. The existing
live Y.Doc and UndoManager remain installed, and new local edits still journal before apply.

## Evidence and limits

The [packet](./performance-experiments/2026-10-13-retention-evidence/README.md) retains the prospective
protocol, frozen builds, profiles, raw observations and focused checks on the same 1,201-position
fixture. Three matched CPU-1x pairs reduce median final fence **500 → 265 ms (47%)**. One profiled
CPU-4x pair reduces it **1.331 → 0.697 s**; the three copy spans fall **372 → 11 ms**. All 134 unique
unit tests, 18 native controls and three packaged lifecycle/checkpoint journeys pass. Complete
scoped authority/verification counts remain; the packet distinguishes post-operation background work.

This does not remove initial full verification, the remaining physical censuses, candidate/deletion-key
copies, or final admission fencing. Preparation varies and dominates total conversion; CPU-4x maximum
tasks remain about 430–450 ms, and total conversion is slower in that single candidate observation.
Public activation, compatible reader-first rollout/rollback and product cadence remain separate work.
