# Delivery evidence oracle — F-21.6

2026-09-12. This bounded phase strengthens `test/accountDelivery.test.ts` and its retained-evidence
checks. It does not change service policy, delivery format or implement successor/finalization owners.

## Inventory and intended observations

The prior unit oracle compared pairwise proof propositions to status, maximum accepted position and
refusal positions. Reversed histories compared status alone. It omitted first retained refusal IDs,
the first final cutoff, the conflict flag itself and the submission/response maps. Calling it independent
without qualification overstated the evidence: its propositions closely resembled `applyDecision`.

D3 already provides independent canonical ledger reconstruction, source/envelope correspondence,
ordering and completeness-witness controls. Native delivery already exercises final/prefix/refusal
contradictions in both orders, but the directed contradiction test checks status/count on restart.
F-21.7 adds genuine service-issued refusal and competing-head histories with exact persisted proof sets,
lost replies and service/renderer cuts. Those tests are credited; they are not replaced by a unit model.

## Constraint model

Treat each observed position as having one unknown durable service outcome: accepted, unaccepted,
or refused under one opaque refusal ID. An accepted head at n constrains every observed position ≤n
to accepted. A final head additionally excludes accepted outcomes above n. A refusal fixes its exact
position's outcome to its ID. A proved conflicting digest excludes the expected original stream.

The oracle intersects these constraints independently for each observed position. Any empty domain
means the claims cannot all hold. Unobserved positions can always be completed to a prefix, so no loop
over every integer through a potentially large position is needed. This construction is independent of
the reducer's transition branches, but it shares the stated protocol assumptions and cannot verify
that those assumptions are right or that a signature deserves authority.

Retained observations remain meaningful even when claims conflict: highest accepted head, first final
cutoff, and first refusal ID per position in first-seen order. Conflict is absorbing for proof folding.
The reducer leaves exact submission/response maps untouched; the durable owner manages those maps.
Status precedence is conflict, closure, finalization, ready. Duplicate observations do not replace the
first retained ID/cutoff. Reversing conflicting histories may change either first value; compare each
order with its own full reference result, not blanket state equality.

Pure reducer histories may continue after conflict to stress information retention. The actual owner
retains the first contradictory proof, then permits no new proof writes; exact duplicates are no-ops.
Tests of full owner state must apply that admission boundary first. Signed fixture final heads and
different refusal IDs model contradictory authority claims; the current private service cannot issue
all such sequences and has no finalization API. F-21.7 supplies the separate real-issuer evidence.

## Evidence construction

- Generated forward, reversed and permuted histories compare every derived field at every prefix,
  exact sentinel maps and proof immutability. Fixed cases specify first-value and status precedence.
- Source controls change retention, prefix/final contradiction checks and unrelated-map preservation.
  Retention controls must leave old observed fields unchanged while failing the new full-state check.
- Native signed contradictory histories inspect all derived fields, original submission/proof bytes,
  witness count and source/envelope retention through compaction and cold owner restart. This adds the
  missing ID/final-cutoff observations; existing D3/F-21.7 coverage remains separately scoped.
- The campaign preserves seeds/shrinking and exact source pins, runs affected unit/native/contracts and
  vector/type checks, and keeps the personal installation and servers unchanged.

The constraint implementation is cross-checked against a second finite interpretation: 80 complete
service worlds over three positions, checked against every one of 2,197 three-proof histories. This
cross-check is exhaustive only over that explicit small domain. The main generated property uses
500 histories (seed `1121060`), each in forward, reverse and generated shuffled order, with assertions
after every observation. Large safe positions have a separate directed case.

Twelve source faults alter the real reducer inside in-memory bundles. Four still match every field
of the original unit oracle, extracted from signed `77b0bb6239f7b7a48c4a52c74d3e3f39e39994a3`:
replacing the first refusal ID, replacing the first final cutoff, clearing submissions and clearing
responses. All four fail the complete-state comparison. Other faults cover prefix retention,
closure retention, both prefix/refusal orders, both higher-head/final orders, final state and a proved
conflict. These are explicit mutation controls; clearing a map is a destructive injected fault,
not a missing production guard.

The six new native cases cover two different refusal IDs and two different final cutoffs in both
orders, plus the two retention faults. A test-only observer copies state inside the real
`describeDelivery` after the owner's authenticated census. It does not skip verification or persistence.
Exact response wires, the original submission and ledger rows, source capsules, envelope bytes and
witness event counts are checked separately through authenticated load. The second proof conflicts;
duplicates and a third new proof add no rows. Compaction and fresh page/owner restart retain the same
per-order state. Expected extra reopen captures are restricted to the existing canonical empty Yjs
source; all original sources remain exact.

Run `pnpm account:delivery-oracle`. The campaign includes the existing full delivery native suite,
D3/C contracts and F-21.7's service-issued arrival-order tests, plus the unit model, types, inventory,
all vector checks and formatting/lint. Broader unrelated Account/storage campaigns are not implied.
