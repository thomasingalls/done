# Private migration coordinator — 2026-09-09

The private seeded coordinator now composes capture, factor-confirmed enrollment, bounded import, selection,
source cleanup and fresh terminal verification. It derives restart state from the existing authenticated
component records, releases its inspection permit before entering a component owner, and never creates a
second progress record. Closing cancels owned work and waits for native draining. The default application
does not import or invoke this coordinator.

`verifyLegacyCleanup` is a read-only terminal-verification entry point in the existing cleanup owner. It checks
terminal authenticated progress under its own permit before any cleanup effect could occur. The coordinator
then requires a fresh ordinary Local open and closes that workspace before returning its observation. A
prior inspection or terminal cursor alone cannot turn verification into deletion or certify current recovery.
The host separately checks its current exclusion epoch; this result adds no durable completion certificate.

## Executed checks

| Check | Result |
| --- | --- |
| Coordinator directed native cases | 33 in the full campaign, plus three focused dispatch-gap cases; all pass |
| Coordinator generated histories | 60 pass, seed 8941, no baseline failure or shrinking in the credited full campaign |
| Deliberate coordinator renderer deaths | 19, after observed import/selection/cleanup commits or removals |
| Coordinator fault controls | Ten detected by their named assertions |
| Full unit suite | 793 tests / 67 files pass; coordinator suite includes 30 generated disposal/import histories |
| Shared bounded supervisor tests | 14 pass, including intentionally wedged/leaking child-process controls |
| Native import regression | 22 cases, 60 histories, ten deaths and six controls pass |
| Native selection regression | 20 cases, 60 histories, three deaths and five controls pass |
| Native cleanup regression | 45 cases, 60 histories, 16 deaths and seven controls pass |
| Native startup / Local clear regressions | 15 / 17 cases and three / five controls pass |

The [full report](./2026-09-09-legacy-coordinator/full-native/report.json) records the actual browser,
deadlines, coverage counters and frozen inputs. It completes in 700.154 seconds, with clean teardown and
unchanged inputs. Its 156 inputs match the final working files before documentation edits, apart from the
subsequent three-case campaign addition. The [three additional cases](./2026-09-09-legacy-coordinator/dispatch-gaps/report.json)
park dispatch after inspection, then change the source, remove the completed route or complete Local clear
through its separate owner. Each stale operation refuses without changing the resulting carriers. These cases
were added after the full run and executed separately; the full report has not been rewritten to include them.

Directed coordinator cases also cover externally saved recovery readback, metadata authentication, selection,
retained-state preservation, packet rebinding after partial deletion, between-call and parked exclusion loss,
blocked native deletion, selected journal-only edits, terminal source reappearance, cross-owner selection,
packet loss/restoration and clear handoff. The component regressions retain their more detailed corruption,
size-boundary, source-value and commit/removal schedules; this is not a claim to repeat every component case
at every coordinator stage.

Generated native histories vary Unicode source text, day/archive/unfiled values, DB/WAL delivery partitions,
bounded import budgets, observed import/selection abort points, cleanup cursor, renderer replacement and later
encrypted-journal edits. Every history saves and rereads the original recovery file, reaches selection,
refuses missing input without mutation, resumes an interrupted cleanup and recovers the external Node
text/operation ledger. Some histories flush and compact before final recovery. An independent carrier ledger
checks exact source preservation before deletion, known-source absence afterward, unrelated local values and
modern journal preservation, fixed destination identity, and nondecreasing reservations across observations.
These are bounded generated schedules, not arbitrary interleavings or a proof over all protocol states.

| Deliberate defect | Detecting assertion |
| --- | --- |
| Reuse the first inspection | `inspection-rereads-state` |
| Skip import-claim authentication during inspection | `authenticated-inspection-refuses` |
| Treat the provisional index as selected | `selected-open-ready` |
| Delete retained custody as a reset/remint precursor | `retained-refusal-preserves-carriers` |
| Accept a replacement binding after partial cleanup | `partial-input-binding-refuses` |
| Use memory bytes instead of reading the saved recovery file | `saved-readback-before-enroll` |
| Ignore host exclusion loss | `exclusion-loss-refuses-dispatch` |
| Fulfill close before active native work drains | `close-drains-native` |
| Overwrite a selected edit from the old packet | `selected-edit-ledger` |
| Skip current terminal cleanup verification | `terminal-reappearance-refuses` |

The close control tests premature close completion. The unmodified blocked-delete case independently checks
that an actual competing writer cannot acquire the permit until native deletion settles. No timeout or generic
exception counts as a detected control. Native deaths occur after observed transactions/removals, parking at
the next crypto operation or fixture return; they are not instruction-exact or OS/power-loss cuts.

## Failure found and retained

The first full development attempt passed all 33 directed cases and the first three generated histories.
History four then exposed a harness scheduling error: it expected the `import-imported` abort during the first
bounded import invocation. Larger plans require several calls to reach that transaction. The harness now keeps
the injection armed across bounded calls until that exact boundary is observed; it still requires the native
abort and the corresponding refusal. It does not accept an unrelated refusal as success.

The [first input and error](../../test/legacy-coordinator/regressions/import-completion-abort/diagnostic.json)
were saved before shrinking. The shrink budget expired, so no minimality is claimed. The exact first input
passes [one saved-input replay](./2026-09-09-legacy-coordinator/abort-replay/report.json) without shrinking,
and passes again as history four of the credited 60-history run. Its canonical input hash is
`9842c58d15c66644e52f17e08b8ab6394d87bcea687479ba66b5eeefcfb25ce6`.
This establishes a test scheduling defect, not a discovered coordinator data-loss defect.

## Provenance and remaining gates

[Provenance](./2026-09-09-legacy-coordinator/provenance.json) records original paths and byte hashes for the
retained reports, diagnostics, unit report and lossless compressed event streams. Reports keep starting HEAD
`f4ed6bc` and their actual tested hashes: the coordinator implementation was uncommitted during these runs.
The full campaign preceded the three additive dispatch cases; its tested campaign source is retained. The
older failing/replay campaign sources are retained as well; the first run also preceded the package script
registration, whose old snapshot is retained. Documentation changes after execution do not alter
those reports. Unit evidence is a Vitest report, not a native frozen-source receipt. Run duration here includes
concurrent regression work on the same host and is not a product performance measurement.

This closes the bounded private coordinator checkpoint. It does not establish production supported-version
exclusion, a product recovery-save/readback ceremony, the real carrier/attribution choice, default-app cutover,
whole-profile/forensic residue removal, supported-browser performance or independent review. The packet is
plaintext diagnostic recovery of the captured source, not a backup of later destination edits or a portable
fidelity archive. Input/action bounds remain and whole-input planning/replay remain in memory.

The next bounded work is production migration host preparation: specify an implementable old-executable and
transport exclusion procedure, restart/loss handling and recovery-save/readback ownership, with seeded
supported-version falsifiers, before wiring a default application route. Existing obligations and debt payment
conditions remain unchanged.
