# Online typing and Goals size: prospective measurement protocol

Base: signed `9ba0ae63`. Measure before selecting another repair. No runtime change,
release campaign, publication, retained-format change or inspection of personal writing.

Questions: how much input queue waiting returns with two-way sync running? Which foreground
jobs account for it? Does editing a large individual Goals text add substantial synchronous
planning/projection work even offline? The user's current Goals is about 3,000 characters;
12 KB represents their larger previous use, and 64 KB is explicitly a synthetic stress case.

Build one source-mapped probe from this base, instrumenting numeric admission/storage spans,
text planning/state creation and visible editor projection. Expose test-only editor state for
length/tail assertions: CodeMirror virtualizes Goals, so whole-document DOM length cannot be
the timing oracle. Keep writing, credentials and account identities out of retained observations.
Retain CPU profiles only for separate diagnostic runs, not the repeated timing comparison.

Seed three disposable paired fixtures from the existing deep-received device (600+ positions)
and its original peer, bring them fully current, then set Goals through real admitted input to
3,000 / 12,000 / 64,000 ASCII characters. Preserve roughly 120 existing cards. Save both browser
states/authenticators and a stopped service snapshot outside the repo. Changing Goals lengths
adds different numbers of source records; record row counts and do not attribute all cross-size
storage changes to text length. Paired online/offline comparisons use the exact same seed.

Main matrix: established receive-target card (record its exact length) with 12 KB Goals, plus
Goals at each of the three sizes. For each target run offline and online twice, fresh restored
sessions, first round offline/online, second round online/offline in reversed target order.
CPU-4x on typing device B, peer A unthrottled, 120 `x` keys at requested 150 ms spacing. No
concurrent builds/tests. Online adds 75 ms per account request through the local proxy and A
adds one character to a different card every 2 s (ten edits), exercising receiving as well as
sending. Offline peers remain offline during timing. Let startup/catch-up settle before arming.
Stop on correctness failure and retain failed attempts separately; never pool harness retries.

Metrics: session handler and keydown-to-visible-frame median/p95/max; long tasks; local queue
wait sum/max and overlap with explicit flush / remote jobs; loads, authority checks, copies,
audits and storage queue/operation spans. Plan and projection spans are synchronous timings;
async spans are elapsed time and overlap. Record requests by device/path/status and accepted /
received position changes, plus final convergence. The key-to-frame measurement omits browser
pre-dispatch delay. Separate 1 ms sampled profiles for online card, online Goals 12 KB and
Goals 64 KB identify CPU mechanisms; add a discriminating diagnostic only if attribution needs it.

Validation per observation: all 120 admitted characters appear, the peer converges after online
typing (after reconnect for offline), local undo/redo of the last key preserves peer edits,
and cold offline reopening preserves the measured writing. Keep explicit convergence time out
of the input timing window. Verify active sync through successful requests and numeric progress;
a stopped lane is a finding, not an online observation silently relabelled as offline.

Sessions are the analysis units; keys are dependent repeated observations. Two replicates estimate
local magnitudes, not significance or handset populations. Report every session and medians of
session summaries. Timing, history growth, CPU emulation and synthetic markdown limit generality.
The design identifies the combined two-way-network workload effect within a size, not a pure
RTT effect or pure text-size effect across seeds. Do not combine overlapping spans as CPU totals.

Decision: prefer the largest repeatable measured component of online input delay. If wait grows
while handler cost stays flat and overlaps explicit barriers/receives, target that ownership-safe
boundary next. If planning/projection grows materially with text size (>=5 ms/key or >=25% of
handler time in the 12 KB case), design a separate text-state/projection repair with undo and
remote-update invalidation rules. 64 KB alone justifies a stress-case finding, not a claim that
current 3 KB usage is slow. Report mixed results; do not implement or activate a speculative repair.

## Setup amendment, before any typing observation

The initial attempt combined an old writer browser snapshot with a newer service/receiver
continuation. The writer stopped with receive integrity before measurement; this is not a
valid matched restore. Retain it as `seed-12000`, excluded from timing. Use the original
contemporaneous paired fixture at `/tmp/done-client-receive/fixture.json` instead, catch up
normally, then derive each size from that newly saved pair. The matched 12 KB seed passes
normal authenticated convergence and export equality. Its receiver is again 600+ positions
deep, but is not byte-identical to the prior offline single-device fixture. This avoids
asserting continuity between service history and a browser snapshot from a different run.
