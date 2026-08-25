---
schema: 1
kind: finding
id: f-4259822-lapse-transition-kind-missing
status: candidate
type: contradiction
severity: medium
confidence: high
introduced_by: 4259822828060fe2b9592fa525cd9a17170af285
work_item: X-05
created_by: root
updated: 2026-08-25
challenged_by: none
superseded_by: none
---

# The transition protocol claims to bind deliberate lapse but defines no lapse kind

## Affected requirement or guarantee

A deliberate downgrade/lapse must stop hosted synchronization while leaving the authorization lineage live, and must not become account retirement. The PRD requires the transition kind to be authenticated in the request and settlement so interruption or field confusion cannot create the terminal state.

## Original source

`c6116669030eedeea3d599bca0da3547114e6930:docs/PRD.md` §6.10 (`OC-021`) distinguishes lapse/read-only from account deletion and says deliberate downgrade uses the same mechanism with its kind authenticated. The same snapshot's TRD row 15 (`OC-077`) leaves interrupted rotation and downgrade behavior open.

## End-state source

At `9edd9300adebcec3abd2234c946f1dcccdc17eef`, `docs/selections/row-15-transitions.md` claims product downgrade is closed by binding `kind`, but defines exactly three values: `rotate`, `replace-recovery`, and `retire`. `scripts/generate-transition-vectors.mjs` publishes those same three and compares `rotate` with `retire` as its downgrade test. Neither construction has a `lapse`/`downgrade` value, target, payload, or outcome. Row 16 says hosted retention adds no protocol field and separately starts its clock when synchronization stops.

## First introduction and propagation

`4259822828060fe2b9592fa525cd9a17170af285` closes row 15 with the three-kind protocol and propagates the claim that kind-binding protects lapse from retirement. `cdd206952b7cc0c6511fc1ee6ccc740c1b129407` later selects the lapse clock and expiry policy without adding a durable/authenticated lapse transition. The contradiction remains in tip PRD/TRD, both selection records, the transition vector, and the row-20 closure claim.

## Reachable consequence

1. A user deliberately downgrades and hosted synchronization must stop without creating a terminal record.
2. The implementation needs an idempotent durable settlement that distinguishes this live-dormant state from retirement and starts the disclosed retention clock once.
3. The selected carrier offers only `rotate` (a generation/epoch change), `replace-recovery`, or `retire` (terminal lineage). None represents lapse.
4. An implementation must therefore invent unreviewed billing/service state outside the claimed common protocol, misuse `rotate`, or use `retire` and violate the live-lineage guarantee.
5. Crash/race tests between downgrade, retirement, synchronization stop, and retention-clock start have no selected intent/outcome object to replay or compare.

The immediate defect is an unimplemented guarantee and false row closure. A service can preserve safety with additional state, so retirement is not inevitable; the risk is that the exact state distinction the binding supposedly made mechanical remains ad hoc.

## Supporting evidence

The exact row-15 grammar and generator enumerate only three values. Its prose says a lapse retires if `kind` is editable, then demonstrates only that a rotation message cannot be read as retirement. A rotation does not express payment lapse, hosted read-only, synchronization stop, or a retention deadline. The exact-tip transition and retention checks both pass because neither cross-checks a lapse carrier against the policy state.

## Counterevidence and disconfirmation attempt

A billing system can durably record `lapsed_at`, retain a live lineage, and gate deletion independently of row 15. The terminal record then remains an unambiguous retirement marker, so a careful Stage-4 implementation can satisfy the product requirement without a client-signed lapse intent. That is a viable alternative architecture, but it contradicts the current claim that the selected common intent/outcome protocol and its authenticated kind already close product downgrade. No such separate state machine or fault-injection oracle is selected.

## Validation procedure

1. Define whether lapse is a fourth signed transition kind or a separate durable service state machine.
2. Kill before and after request persistence, synchronization stop, settlement, user disclosure, retention-clock creation, resumption, retirement, and expiry deletion.
3. Require exactly one live-dormant start time, no terminal record for lapse, and terminal-before-delete for retirement.
4. Race lapse and retirement and prove a signed/durable winner is replayable after a lost response.
5. Add cross-kind negatives that use actual lapse and retire carriers rather than substituting rotation as the near neighbor.

## Disposition

Reopen the row-15/row-16 joint or narrow the normative claim. The review record must not call deliberate downgrade mechanically bound until the live-dormant transition has an exact durable carrier and crash semantics.
