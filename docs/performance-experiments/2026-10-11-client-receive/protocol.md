# Client receive performance — prospective bounded comparison

Baseline: deployed runtime c609d8c7, identical runtime at local 86275345. Run disposable
loopback services and browser contexts; no production data or public service load. Release
qualification remains paused. Freeze baseline source/build before runtime changes.

## Question and decision

Can cheaper custody equality, bounded sticky receive scheduling and typed advisory notifications
improve catch-up without starving outgoing writing, weakening authenticated admission, or hiding
stopped lanes? Unexpected failures should retry; persistent failures need visible, lane-specific
recovery. Maintenance yielding and local ledger retention are later slices.

## Fixtures and units

Create one real two-device account through the packaged UI on baseline. Populate 120 cards with
roughly 400 characters each and a 12 KB Markdown Goals document: an explicit synthetic substantial
workspace, not a claim about the user's exact corpus. Build 600 separately accepted publisher
positions with the second device offline. Use the existing pagehide batch-close boundary only
during fixture construction to avoid waiting two seconds per position. Do not change admission,
signatures, network budgets or stored records. Retain baseline service and both browser snapshots
outside Git, with disposable credential material private. Each measurement restores that same
fixture into an isolated service and fresh browser contexts.

The whole restored run is the comparison unit; individual reads and keys are dependent samples.
Run baseline first, then candidate, and a reversed candidate/baseline pair if the first comparison
is valid. No simultaneous builds/tests/profiles during timed measurements. Keep failures and
timeouts as outcomes; instrumentation/setup failures get an explicit disposition.

## Measurement and analysis

Measure from restored receiver online wake to exact text convergence: positions/sec, request
counts by route/status and long tasks. Count successful writer submissions and their intervals
during catch-up, then measure 12 individual burst-to-peer deliveries (including the configured
publication batch delay). Collect a 120-key, 150 ms-gap block on the large received workspace,
input-to-frame latency and long tasks. Close/reopen the receiver offline with its complete
received history; measure unlock-to-first-editor-frame, retained record count, post-GC JS heap,
and exact recovered text. A separate CPU-profiled observation explains costs; never pool its
timings with unprofiled results.

Report individual run results and median contrasts, not significance from thousands of dependent
events. Two pairs provide a bounded engineering check, not population confidence intervals.
Primary target: at least 20% lower matched catch-up duration in both pairs. Guardrails: exact
convergence and offline recovery, no unexplained permanent halt, no 429s, due sends retain turns,
and no consistent >10% regression in large-workspace typing or peer latency. Mixed results call
for attribution, not automatic activation. Functional boundary tests remain mandatory regardless
of timing. Missing timing samples do not count as a pass.

## Limits and runbook

Freeze source and build hashes; create fixture; stop services before copying SQLite state. Restore
for baseline and candidate, using identical service source for a client-only comparison except
the negotiated notification classification. Record that compatibility change separately. Use
the same host/browser/viewport; retain raw request metadata without tokens or content. Compare
known complete fixture text privately, retain only lengths/hashes in the evidence packet.

This measures desktop loopback behavior with a large synthetic workspace and deep received
history. It does not establish phone, WAN, three-device, multi-account or indefinite-history
performance. Earlier 2.4 positions/sec and diagnostic +44%/+18% are not predicted outcomes.
No further cold-open verification pass is removed in this slice.

Fixture correction before measurement: Chromium requires local execution outside the sandbox.
The first launched fixture attempt used pagehide, which correctly closed the product workspace;
that is not a usable batch-construction shortcut. Preserve the failed setup log and use ordinary
300 ms quiet-burst publication instead. No timed comparison was produced by either attempt.


Amendment after the first timed baseline: it advanced from peer cursor 7 to 387 in 600 seconds,
with no non-200 HTTP responses. Preserve the censored result, do not lengthen the catch-up deadline.
Compare candidate against the same 600-position workload; a completion below 480 seconds establishes
at least the primary 20% improvement against the baseline lower bound, without imputing a completion
or pooling reads as independent trials. Repeat the pair in reverse order if candidate completes.
Because a timed-out baseline has no deep cold/typing observation, also restore the candidate's complete
received snapshot on baseline and candidate for matched offline cold-open and typing observations.
Live peer delay on the baseline requires a separately retained fully caught-up pair; no claim about
that outcome follows from the censored run. Report any unmeasured outcome explicitly.

Second-pair amendment, before either baseline-2 or completed-state measurements: the first
candidate completed in 307.083 seconds. Its optional DOM text-progression observer searched for
a trailing space removed by Markdown normalization; that trace is unavailable. The Playwright
completion assertion, request metadata and timing were independent of that observer. Correct the
observer for the second pair. Preserve the same primary 600-second deadline. On baseline-2 only,
after recording a missed primary deadline, allow up to 600 additional seconds solely to obtain
a completely caught-up pair for the requested secondary live peer-delay observations. Label that
continuation explicitly; a completed continuation does not turn the primary timeout into a pass.
The independently restored deep receiver remains the matched cold-open/typing fixture.

The completed-state probe also observes two seconds after typing ends, labelled separately from
keystroke samples, to include the normal 750 ms idle-maintenance window. It does not force compaction
or assert that one occurred. Collect cold-open WebCrypto call counts and a separate cold/typing CPU
profile. No additional runtime optimization is selected from these diagnostics in this slice.

Final error-classification review, while the frozen baseline-2 observation runs: admission
`queue-full`/`storage-failed` must not be labelled corrupt evidence. Keep those retryable (subject
to the existing storage gate), and label inactive/discarded admission sessions closed. The timed
candidate bundle predates this error-only correction. Preserve its runtime patch/hash separately;
these successful performance runs do not enter the changed exception branches. Test the corrected
classification and rebuild the final application after all timing/profile observations. Do not
attribute a new timing result to the rebuilt bundle without measuring it.

The same final review also separates a newly retained upload acceptance from local send progress
(such as preparing a retry under a new generation). Only the former sets the displayed last-success
time. This is an observation field, not a change to send scheduling/admission. Its focused control
and final build are recorded separately from the timed candidate bundle.

Acceptance-interval measurement correction before supplemental observations: the first complete
runs recorded HTTP-success timestamps but not submission positions. The completed service stores
show one repeated submit response, so those are reply intervals, not precisely deduplicated accepted
position intervals. Add request position extraction (retain only the integer, no identity/envelope)
and one short baseline/candidate writer-only pair on the same >600-position fixture while its receiver
is catching up. After stopping each service, match those positions against its accepted decision rows.
This supplies the requested acceptance-interval outcome; it is not another catch-up qualification run.
Also retain named browser request failures in these later observations rather than just a boolean.

Manual send retry also closes only its own publication batch; retrying receive leaves the send
batch deadline unchanged. This final UI-retry correction prevents a user's immediate retry from
waiting for a fresh typing quiet period. It does not change automatic batching or failure backoff;
none of the timed successful runs uses manual retry.

Profile-only maintenance diagnostic, specified before its run: use 160 keys rather than 120 to
cross the ordinary 128-change maintenance threshold, followed by the same two idle seconds. Keep
all four unprofiled cold/typing observations at 120 keys. The diagnostic's counts/timings are not
pooled with them. Source-map the resulting long task before attributing it to compaction.

Final refusal-path control: cancelling an oversized history response must not replace its known
size refusal with a generic exception if stream cancellation itself rejects. This affects only
refused replies; retain the focused test and record the final source hashes separately.

Profile outcome qualification: the 160-key diagnostic did not capture an idle long task. Keys are
not a one-to-one count of changed content records under batching, so that attempt does not establish
a measured compaction cost. The larger post-catch-up tasks and a reduced content-row count in the
second candidate are evidence to investigate, not a source-mapped attribution to compaction.

The seed's service prefix is 607. Restoring the writer legitimately retries its last already accepted
position after the intentionally interrupted acknowledgment. Exclude all positions <=607 from the
supplemental newly accepted interval calculation; deduplicate later replies by position and check
them against the stopped service's accepted rows.
