# Scope and decisions

The operator asked for an implementation slice, with fixed costs, cold opening, leaf functions,
the measured leading consumer, uninterrupted undo history, and an activation criterion all included.
This is development performance work. Release qualification and public deployment remain paused.

## Measurement-led scope

The signed `4500d9b6` baseline runs its already-implemented incremental path. It is not the slower
reference path still selected by an ordinary production build. Comparisons therefore measure the
additional benefit of this slice, not the entire accumulated improvement over production.

The first uninterrupted diagnostic completed 2,320 actual edits. At its deep block, history metadata
copying was the largest named cost (about 62 ms/key inclusive; about 58 ms/key in the clone itself),
followed by historical source catalogue reconstruction (about 44 ms/key inclusive). Envelope selection
was about 7.5 ms/key in CPU samples and 8.9 ms/key in elapsed instrumentation. These nested costs
are not additive. The choice was therefore to repair source catalogue lookup and undo-selection
metadata, not to commit to an envelope index regardless of evidence.

Account preparation now reuses the existing owner-bound immutable selection snapshots. It keeps the
reference document fork encoding, original actor-bound source capture, and full post-admission state
verification. It does not enable Local's prepared-document handoff or spare-buffer catch-up. A scoped
selection owner still dies at lock/close. Metadata tokens cannot become content/admission authority.

Other consumer changes select before detaching verified results, look up incoming source identities
without re-decoding retained capsules, and avoid two exact record comparisons for a cache hit.
Exact duplicate conflicts, input batch duplicate handling and fallback reconstruction remain checked.
No verified mutable byte buffer is intentionally borrowed across an async boundary.

The major consumer/selection path follows the incremental build switch. The reference override still
reconstructs the full ledger. Independent leaf improvements are shared: indexed byte comparison,
lookup-table hex encoding, and a fixed unused GUID for isolated Yjs validation documents. Validation
still allocates a fresh document and random client ID, decodes/applies every update, checks pending
state and destroys the document. No reused dirty document or global randomness override is added.

## Costs deliberately retained

Physical store enumeration and placement checking; durable counters; authority rechecks; full cold
verification; the ordinary reference audit; exact-coverage compaction; full post-admission verification;
and serialized ownership all remain. Accepted historical byte retention is not solved. Neither is
rows-per-key growth. A burst-batching change needs its own durability, attribution and undo-boundary
analysis. It remains the next architectural lever, rather than a hidden change to this comparison.

Counters are observed intervals, not a claim that each position always has a fixed operation budget:
typing, settling, background receive/status work and batching overlap. Report per-key and per-position
ratios with successful position count and achieved history. Crypto wrappers count calls, not CPU time.
A fresh/deep CPU profile and matched traces are distinct measurements. A faster device may naturally
produce more positions at the same requested typing cadence; retain that effect and show it.

## Failures retained during investigation

The original uninterrupted baseline completed typing but timed out waiting for the editor during
cold reopening. Its probe failed to preserve the startup screen/profile on that error. The probe now
captures failure output and returns a failing exit status; a private disposable restart fixture is kept
outside the repository. The later four-point baseline reopened at every depth, including 2,320 edits,
and its saved fixture also reopened in the baseline and candidate profiling runs. The subsequent uninterrupted candidate exposed the underlying probe failure explicitly:
`WebAuthn.getCredentials` said that the virtual authenticator environment was no longer enabled.
A minimal control proved that detaching a second CDP session (the CPU profiler) disabled that
environment. The probe now retains one profiler session until page/context close. A focused
profile-then-cold-open smoke run passes. Thus the original diagnostic cold timeout is attributable
to the probe's virtual-credential lifecycle, not evidence of a three-minute storage replay.
The completed typing profiles from both runs remain valid; their attempted final cold openings
are not successful cold-open measurements.

One candidate packaged history test timed out waiting for later peer writing after an intentional
installation abort and offline reopen. Another diagnostic attempt stopped earlier with an enrollment
`authority-changed` refusal. A subsequent diagnostic run completed the history journey. Both the
candidate and signed baseline emitted repeated HTTP 429 responses and completed that diagnostic in
about 60 seconds. This is evidence of existing rate/retry pressure, not proof that every intermittent
failure has the same cause. No timeout or service security budget was loosened to obtain a pass.

Activation must be decided against the protocol and all retained results, including these failures.
A source default never updates the published image; deployment remains a separate action.

The later ordinary baseline control passed, as did both candidate journeys with in-memory
diagnostics and normal audits. A proposed-default ordinary run repeated the late delivery failure
and also hit the enrollment refusal. The final diagnostic stopped during enrollment. Thus there is
no demonstrated root cause and no basis to classify all failures as harmless harness problems.
Removing the test's submit interception does not emit an online wake; the sender deliberately keeps
its existing backoff (up to 30 seconds), whereas that assertion waits 15 seconds. This is a plausible
timing explanation, not established by a failed-run scheduler snapshot or observed later arrival.
The HTTP 429s are real but are likewise not proof of the cause. History transport already converts
transport failures to retryable outcomes, so a blanket claim that throttling permanently halts the
scheduler would be wrong.

Final decision: retain opt-in selection and hold default activation. Resolve the packaged enrollment
and post-maintenance delivery results before another rollout decision. Preserve the improvements
and complete the bounded performance work; do not silently expand it into authority/retry policy
changes or a generalized validation campaign.

## Review before finalization

A source review caught a diagnostic-only regression before finalization: reading `bytes.length`
for the parse counter before the existing type guard could turn a null/undefined source argument
into an uncaught TypeError instead of the established repair-required refusal. The counter now runs
after that guard, with malformed non-byte arguments retained as regression cases. Timed candidates
used valid byte inputs, so their measurements are unaffected; final-source fingerprints distinguish
this small instrumentation correction from the measured build.
The loaded-byte diagnostic also now skips its counting scan entirely when profiling is disabled;
the measured arms both enabled profiling, so that guard does not change their valid-input path.
