# First receive repair: prospective check

Baseline is signed `ee234d06`, with deployed runtime `77657e23`; the baseline attribution is
recorded in the adjacent packet. This repair changes only marker equality representation and
selection of recently checked own streams. It does not group receipts or change stored/wire formats.
Release validation remains paused.

## Claims and predictions, before candidate timing

- Removing whole-marker hex should remove most of the previous 44.5 seconds sampled there.
  It retains canonical payload construction, fresh custody reads, authentication and exact equality.
- Skipping own checks until the existing five-second poll is due should reduce 149–150 own reads
  per 600 useful positions to roughly 40–60. Unresolved submissions bypass suppression; the first
  check, authority resets, single-publisher and receive-only owners retain their behavior.
- Combined, expect about 230–270 seconds locally versus the retained 308.3-second baseline, not
  an order-of-magnitude gain. The 75-ms condition should still be slower: each useful position
  still requires its own request. Remaining authentication serialization and storage loads persist.

These are falsifiable engineering predictions, not acceptance limits or inferred speedups.

## Focused correctness

Check fair peer turns, periodic due checks, unresolved current submissions including current-key
retries with historical refusal responses, failed reads, authority resets and backward clock changes.
Retain native tests for lost replies/cold recovery, self-stream byte binding, empty self reads outside
the input queue and authority changes before commit. Exercise legitimate authority adoption so the
cached byte representation refreshes at the same ownership boundaries. Do not launch a generalized
conformance, mutation or release campaign.

## Matched measurements

Reuse the previous private 120-card/12-KB-Goals/600-position fixture and unchanged measurement
harness. Build separately; no repeated source/doc copies. All builds/tests finish before timing.
Run candidate local and candidate +75 ms/account request serially, with new output directories.
Then rerun the frozen baseline locally to check host drift rather than relying only on yesterday's
timing. Compare complete restored runs; requests and keystrokes within them are dependent samples.
If the local gain is below 15% or the new baseline differs by more than 15%, repeat in reverse order
before drawing a speedup conclusion. A separate diagnostic run is needed only if attribution is
ambiguous; do not pool instrumented and ordinary times.

Preserve catch-up duration, own/peer counts, HTTP refusals and transport failures, sender progress,
burst-to-peer delay, long tasks, full exports, and offline reopen. These are desktop loopback/artificial
latency observations, not phone measurements. A performance gain does not relax any authority,
coverage, expiry, recovery or receipt compatibility rule. Failed attempts remain in the record.

## Amendment after the first candidate pair, before a corrected build

The initial candidate completes locally in 244.430 seconds and with +75 ms in 323.811 seconds.
Both journeys pass, but the delayed-condition burst median is 2,851 ms versus the older baseline's
2,385 ms. Source review identifies an idle-selection inefficiency: skipping the own turn after
an empty peer response can re-read that same empty peer before the scheduler ends its sweep.
Do not claim this explains the timing difference without a controlled comparison. Restrict own
suppression to productive catch-up (or moving on from a completed own check), retaining the usual
idle sweep. Add the directed idle-transition check, preserve these first two observations as an
intermediate candidate, finish the already-running frozen baseline, then measure the corrected
candidate in both conditions. No build/tests run concurrently with the baseline observation.
