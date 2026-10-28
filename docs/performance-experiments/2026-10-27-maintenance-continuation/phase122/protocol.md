# Phase122 contract — exact same-owner reduced baseline reuse

Parent: evidence121 (`ccaba7e11f223819f935a932aa5e64dcb108658a`). No computer use, release
preparation, signing, push or deployment. General qualification remains paused.

Only a completed v5 baseline replay inside the same explicitly opted-in non-warm Content owner may be reused. The opt-in promises immutable verifier-owned authority capabilities.
Every read still takes a fresh complete native suffix census, authenticates its counter, reads
the exact closed baseline pointer/chunks and compares every sealed byte. Fresh custody-derived
baseline contexts must match the existing verifier-owned authority pin before and after reuse.
Counter/witness/pointer/era, rows, chunks or capability changes prohibit reuse. Readers rebuilding
equivalent but distinct capabilities keep the full path. No result/identity crosses owners.

Reuse returns detached logical state, still invokes the owner's validator, and shares a view identity
only for exactly equal evidence under that pin. Failed verification clears retained state. Explicit
invalidation/reference operations force full replay. Existing live warm audit/oracle policy and
v3/v4 full-history comparisons remain unchanged. No stored format or crypto construction changes.

First demonstrate the extra replay with a real-crypto, fake-IDB unit fixture, then repair it and
test fresh authority/native reads, changed ciphertext/counter/suffix, capability changes during
reuse, caller isolation, invalidation, disposal and cold owner. Native browser diagnostic must
retain writing and offline reopening while the reduced opening changes from three replays to two.
Counts establish eliminated work, not a physical-phone latency improvement.
