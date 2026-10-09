# Delivery unit oracle assessment — F-21.6

2026-09-12. Baseline: signed `77b0bb6239f7b7a48c4a52c74d3e3f39e39994a3`.

**F-21.6 is addressed at the named unit/reducer and retained-delivery evidence boundary.** Importance:
**low–medium assurance**. The original criticism was fair about incomplete state comparison and the
strength of the word “independent.” It did not establish an implementation defect or absence of all
independent delivery evidence. No production defect was found in this phase and no runtime code changed.

The [new model and scope](../../account-delivery-oracle.md) replace the old pairwise transition-like
propositions with intersections of possible outcomes at each observed position. A separate finite
enumeration of complete service worlds checks the consistency interpretation. Neither construction
supplies independent authority for the protocol's premises. Both rely on the declared meaning of an
accepted prefix, permanent refusal ID, final cutoff and competing digest.

The named unit test now compares every `DeliveryState` field and publication status at every forward,
reverse and shuffled prefix, retains exact sentinel wire maps/references, and checks proof immutability.
First refusal IDs and final cutoffs may differ between orders; each is checked against its own first
observation. Contradictory claims remain retained observations, even though no consistent service world
can satisfy them. An explicit competing-digest claim does not advance the owner's accepted prefix.

## Evidence that the assertions are stronger

Twelve source controls modify the real reducer in test bundles. All fail the new full-state oracle.
Four still match every field of the original oracle at every tested prefix: last-ID overwrite,
last-final overwrite, clearing submissions and clearing responses. The original oracle is extracted
from the signed baseline and executed, not merely described or rewritten for that comparison.

Six new native tests compare first refusal ID and first final cutoff in both orders through exact proof
persistence, compaction and cold page/owner restart. Two run the retention faults and show that the
old status still reads `conflict` while complete state is wrong. A test-only observer copies state
inside the real `describeDelivery`, after authenticated census. Raw proof/submission bytes and original
ledger rows are checked separately under factor-opened custody, together with witness counts and exact
source/envelope retention. Duplicate and post-conflict new proofs add no rows. No production inspection
or mutation API was added for these tests.

Native final-head and different-refusal-ID histories use the existing synthetic acceptance signer to
produce cryptographically authentic but contradictory claims. These are verification/retention tests;
the current service has no finalization owner and cannot issue every tested sequence. F-21.7's genuine
service-issued arrival-order campaign is rerun separately and retains its narrower issuance assumptions.

The [preserved campaign](../../account-conformance-runs/2026-09-12-account-delivery-oracle.md) records
test counts, generated seeds and executed source pins. It includes D3/C byte contracts, the full existing
native delivery suite, real service-issued arrival order, selected unit cases and all vectors. Previous
D3/F-21.7 evidence is credited rather than relabelled as newly implemented functionality.

## Remaining limits

Pure reducer tests may fold additional claims after a contradiction; the real owner refuses new proof
writes after retaining the first contradiction. This distinction is explicit and the native assertions
exercise the actual boundary. Enumerating 80 worlds and 2,197 proof triples is exhaustive only over
that finite domain. Generated histories have bounded lengths and recorded seeds; their success is not
proof over all histories or an independent cryptographic/protocol audit.

No full Vitest or aggregate crypto-audit rerun, broader storage campaign, new platform qualification,
power-loss assurance, general successor/finalization API, real Account creation or deployment is implied.
Personal packaged files, prior vectors, historical review and L-2 remain protected by their recorded
hashes. Other F-21 and roadmap obligations remain separate.

Next is the remaining F-21.2 admission-specific evidence inventory: distinguish byte-parser limits from
client-owned size/coverage checks, credit the newer A/D7/genesis/admission cases, then fill only actual gaps.
