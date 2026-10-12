# Boundary and residual work

## Why this is an owned metadata transition

`contentStore.appendRecords` authenticates the current counter, derives a reservation and signs
it, then compares the exact predecessor inside the strict IndexedDB transaction. Only after that
transaction completes does the new branch match the owner's retained predecessor and copy the
reserved counter into memory. It never replaces the arrays or advances their semantic identity.

A reservation increases sequence/invocation allocation; it does not change committed row bytes,
placement, active generation or spool witness. Previously verified row bounds therefore remain
valid. A reserved range remains absent from both ciphertext and plaintext arrays until the final
row/witness transaction completes. Existing commit logic appends owned detached bytes and changes
identity at that later boundary. The next returned load still invokes semantic validation.

The pre-commit `state()` calls in `accountReceive` and the delivery path can consequently use the
warm loader: authenticate the counter, compare count and end keys, audit the next old slice, then
validate/select. Ordinary loads copy; selections clone their projected answers under an expiring
carrier lease. The reservation itself grants no selection lease or network authority.

The branch does not run for generic owners without `warmLoads`, missing warm state, or a mismatched
predecessor. Unknown transitions, reopen/reacquisition and resume retain their full-read behavior.
A pending full-read invalidation survives reservation advancement. Failure still clears the cache;
strict reservation completion and AES invocation accounting are unchanged. Rolling audit progress
survives, rather than being reset by the accidental full-read path.

As documented in the warm-owner policy, old same-shape ciphertext damage can wait for its audit.
This repair removes an incidental opportunity to detect it earlier. The owner continues using
previously verified memory, and a changed on-disk row is never newly adopted without verification.
Counter authentication, count/bounds refusal and audit mismatch refusal remain independent guards.

## What this does not remove

`createVerifiedRecords.verify` still calls `sameRecords` even for matching semantic identities.
Ordinary carrier loads still return detached copies. Delivery's speculative candidate preparation
and verification projections still have copying work; the profile counters are not total heap
allocation or physical disk bytes. The change does not claim history-independent warm CPU cost.

Custody authentication and authority rechecks are unchanged. A returned warm view cannot substitute
for network authorization, epoch checks or fresh custody observation. The next bounded reuse slice
must establish its own exact-byte/lifetime invalidation contract before skipping repeated crypto.

The remote admission job still owns the editor fence through receipt verification, durable commit,
readback and final promotion. Shortening that job does not let input execute while it awaits storage
or crypto. The separate prepared-handoff design investigates that boundary; it does not change it.
Long tasks also delay event dispatch before admission can see a key, so queue-wait reduction alone
cannot establish responsive typing.
