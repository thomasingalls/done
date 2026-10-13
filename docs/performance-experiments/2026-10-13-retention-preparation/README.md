# Initial retention conversion: attribution and bounded repair

Base: signed **`77e54ada`**, the [history-depth measurement packet](../2026-10-13-retention-depth/README.md).
The runtime repair is uncommitted. [Prospective protocol and pre-comparison repair choice](./protocol.md).
[Implementation and unchanged fences](../../account-local-retention-preparation.md).
No personal profile or deployed service was touched; general release validation remains paused.

## Findings

The deep own-history profile reproduced a **13.717 s** initial conversion, including an **11.499 s**
foreground task. Of 13.905 seconds of CPU-profile samples, `full` baseline replay had 9.428 seconds
inclusive, `verifyInboundCoverage` 8.674 seconds, and content coverage reconstruction 8.253 seconds.
These nested figures overlap. The dominant repeated work was applying the same content rows to a
new Y.Doc for individual source-capsule checks. The planner also rebuilt its candidate coverage
view and searched the same opened rows repeatedly. The profile, mapped function/line totals and
exact unminified reference bundle are retained; profile line numbers refer to that bundle.

The repair binds one private immutable coverage view per full replay and one per deletion plan.
It preserves reference pending-aware coverage, complete replay passes and every original's proof.
The existing 8 ms CPU budget adds yields between independent checks and before replay crypto;
owner validity is checked across those yields. A validated sequence map replaces repeated searches.
No transaction, authority check, journal fence, format or UndoManager was replaced.

## Matched results

Same synthetic two-card / 12,559-character Goals workspace and 1,201 genuine accepted own positions.
Three fresh contexts per arm, alternating reference/candidate order, cloned from the same closed
storage. Reference bundle was saved before runtime edits. CPU-1x, one desktop; medians (ranges):

| Metric | Reference | Candidate |
| --- | ---: | ---: |
| Complete initial conversion | 14.069 s (13.893–14.203) | **5.796 s (5.685–5.894)** |
| Largest foreground task | 11.836 s (11.722–11.872) | **431 ms (410–445)** |
| Largest 10 ms timer interval | 11.837 s (11.727–11.890) | **437 ms (411–446)** |
| Foreground tasks over 50 ms | 6 | 8–9 |

The maximum task shrank about **27 times**, meeting the predeclared order-of-magnitude criterion.
Total duration fell about 59%. Long tasks were shortened, not eliminated; their count increased.
Timer intervals measure event-loop availability, not input-to-visible-text latency. Observers cover
conversion plus a 50 ms drain; queued-input completion can fall in that drain. They are comparable
whole-operation observations, not individual internal-stage measurements.

All seven observations, including the CPU-4x control below, preserved queued journal-before-apply
input, undo/redo and exact cold-recovered final state. The cut still holds ordered admission, so a
key queued during conversion can wait for its **entire duration**, even while the page can repaint.
There is no claim that conversion is now transparent to someone typing.

Observed work was identical in both arms and the 4x control: 11 instrumented authority checks,
six delivery and six inbound verification passes, 2,402 prefix-link computations and 13,377 source
parses. Observed native crypto calls were also identical: 4,834 imports, 2,416 derivations, 10,852
decryptions, 9,638 verifications, 26,485 digests and three signs. These counters support retained
work, not a formal proof of complete authority checking; the unchanged boundary code and focused
negative/crash controls provide the additional evidence. The authority counter is the same scoped
receive-owner counter documented in the previous packet, not a global census.

**CPU-4x remains slow:** one candidate observation took **22.051 s**, with a **1.704 s** task and a
1.709 s timer interval. This is a descriptive stress observation, not a physical-phone result or
paired 4x comparison. The remaining large operations were not separately profiled on the candidate;
we do not attribute its 431 ms/1.704 s maxima to the atomic transaction merely from their duration.

## Correctness and checks

- Existing affected unit set: **110 passed**, including generated baseline/coverage histories,
  exact inventory mutation controls, lifetime/invalidation, original/joined authority, checkpoint,
  incomplete dependencies, caller isolation, warm reuse and partial source obligations.
- Two new controls pass in a **44-test focused rerun**: operation-bound reference coverage agrees
  across original/compacted/pending representations and invalidates after refusal; retirement during
  a CPU yield blocks the following cryptographic call, with a fresh retry succeeding.
- All **14 native retention controls pass**: actual abort and renderer death around reservation/
  commit, exact retry and old-reader fence, queued input/undo, closure during preparation, restored
  journal mismatch, old network flight and surviving unpublished originals.
- All **three packaged lifecycle/checkpoint journeys pass**: original/joined handoff, two rotations,
  restart, replacement, detached editing, unfinished-checkpoint refusal and post-cut two-way undo/reopen.
- TypeScript, focused lint/format, ordinary disposable Vite build, Yjs patch/runtime checks and built
  origin-isolation and initial-bundle budget checks pass. The budget checker used its unchanged
  script against a temporary `dist` symlink to the disposable build. No broad suite or release qualification campaign ran.

No correctness failure was suppressed. A stale unused heap helper in the copied probe caused the
first lint failure and was removed; it never ran in either arm. The source-copy editing script also
stopped before any runtime write when an expected anchor differed. Neither changed measured code.
The final readable probe has that unused helper removed; preserved bundles define the actual arms.

## Limits and next work

Only this native deep own-history fixture was compared, on one Apple M1 Pro / 32 GiB host,
Node 26.11.1 and Chromium 151.0.7922.34. Host loads are retained. Existing unit/native tests ran
while the comparison fixture was being seeded; all finished before timed observations. Packaged
lifecycle checks started after all observations. Other host activity/thermal effects were not
controlled. Three paired contexts do not estimate population tails or phone behavior.

This is a first conversion-cost repair, **not authorization for everyday/public conversion**.
Next, profile the candidate's remaining indivisible census/inventory/comparison work and specify
how preparation can leave admission available while preserving the exact final fresh check and
journal-era exchange. Keep the strict transaction indivisible. The 4x result makes that remaining
work material. Reader-first compatibility/rollback, retention trigger/cadence, capacity and
history-required UX remain separate gates. Local retention still does not bound arbitrary Yjs
workspace/tombstone growth or the unaccepted suffix.

## Reproduction and provenance

Run the focused diagnostic from the repo root:

```sh
DEPTH_OUT=/tmp/done-cut-profile-new \
ACCOUNT_BASELINE_INSTALL=1 ACCOUNT_BASELINE_READ=1 ACCOUNT_RETENTION=1 ACCOUNT_AUTHORITY_REUSE=1 \
node --test docs/performance-experiments/2026-10-13-retention-preparation/probe/cut.mjs
```

Without `CUT_REFERENCE`, this profiles the current build's first cut. To reproduce the paired run,
set `CUT_REFERENCE` to the decompressed `evidence/reference-bundle.js.gz`, and choose a fresh
`DEPTH_OUT`; the probe builds the current candidate. `CUT_DEPTH` defaults to 1,201. It uses the real
owner and a synthetic independent accepted-response oracle, not the public service. Fixture storage,
synthetic private credential state and operator tokens are not in the packet. All processes shut
down after each probe/test. Source/runtime identities, numeric observations, logs, profile and both
observer bundles are retained in `evidence/`, with byte lengths and SHA-256 in `manifest.json`.
`probe/summarize.py <results.json> <output.json>` rebuilds the descriptive table;
`probe/profile.py <profile.cpuprofile>` produces inclusive/self totals. `summary.json` is derived.
