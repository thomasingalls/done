# Initial retention preparation outside input admission — 2026-10-13

Base: signed **`75a3e94b`**. Follow-up to
[bound coverage and cooperative preparation](../2026-10-13-retention-preparation/README.md).
This is a private initial-conversion experiment, not public activation or release qualification.
The [prospective protocol](./protocol.md) was written before measurements; its profile-driven
amendment preceded the paired comparison.

## What the profile found

At 1,201 accepted own positions (8,439 physical rows), the frozen reference first cut took
**5.737 s**, with **448 ms** and **422 ms** foreground tasks. Full replay still invoked the
synchronous inbound/delivery/spool/source census twice. Inclusive CPU samples attribute 781 ms to
inbound inspection and 758 ms to its nested delivery inspection; these numbers overlap. Exact
inventory cloning adds 183 ms self, mostly in strict transaction comparisons and repeated plan
checks. Hex conversion remains material inside the parsers. The raw profile and unminified bundle
are retained; `probe/profile.py` maps function/line totals. This is CPU sampling plus long-task
observation, not a time-aligned tracing proof of each individual task.

## Repair

- Preparation runs on the exclusive storage tail outside the input FIFO. Admitted input invalidates
  it; the journal still records the edit before application. A skipped preparation never reserves,
  installs an era or deletes history. One conversion request may be outstanding per owner.
- Completed isolated evidence retains a private owner/activity guard, not the preparation task.
  The final job uses a new task and repeats complete authority, attempt, journal and exact inventory
  checks. Any intervening inventory change abandons the cut before reservation. Old network flights
  and pending final-apply permissions are fenced at mutation. Strict atomic exchange, authenticated
  readback and independent reduced replay stay inside the input fence.
- The existing cooperative census now yields through its nested delivery, spool and source loops.
  Synchronous callers drain those same generators. All parsing/canonicality/ordering checks remain.
  No decoded capsule buffers cross a yield. Baseline full replay checks lifetime on each budget point.
- Exact inventory comparison borrows bytes synchronously and sorts shallow ordering arrays; it no
  longer clones and erases both byte inventories just to compare them. The plan itself still owns a
  deep snapshot, and evidence returned to callers is detached. Unknown fields and changed bytes
  remain compared; transactions do not yield.

A packaged lifecycle check exposed a retired-read refusal propagating through the initial durability
wait. The private removal request now returns a skipped attempt for that pre-mutation refusal while
the owner is live. The fixture no longer adds a second external durability wait that bypassed this
retry contract. It still requires both exact revisions to be removed. The initial failure and repaired
journey are retained. No general admission/refusal rule was relaxed.

## Measurement design and limits

The same synthetic two-card/12,559-character Goals workspace and 1,201 genuine own publications
are used in both arms. Closed IndexedDB state is cloned into disposable contexts, not personal
accounts. A Node/OpenSSL acceptance oracle signs expected genuine submissions; this is not a
service-throughput measurement. Three quiet pairs alternate order. One candidate CPU-4x quiet
cut is profiled. Separate 50 ms input interventions compare reference versus candidate and a
candidate CPU-4x case. The deterministic native control additionally holds baseline-signing crypto
and proves admission completes before it is released.

Input latency here starts when the scripted input callback executes; it excludes time blocked before
that callback. Foreground tasks and 10 ms timer gaps are reported separately. These small samples
and host load cannot establish phone responsiveness or a 16 ms typing budget. Other focused checks
ran during seeding, not during the timed comparison observations.

## Results

Three paired CPU-1x observations, same closed state in each arm:

| Outcome | Reference | Prepared handoff |
| --- | ---: | ---: |
| Total cut, median (range) | 5.706 s (5.617–5.808) | 6.029 s (5.926–6.050) |
| Largest foreground task, median (range) | 436 ms (436–450) | 97 ms (96–100) |
| Largest timer gap, median | 443 ms | 101 ms |
| Long-task count per cut | 9 / 9 / 9 | 6 / 5 / 6 |
| Preparation outside FIFO | none | 4.956–5.006 s |
| Final FIFO occupancy | whole conversion | 0.966–1.041 s |

This improves responsiveness, not total throughput: median total time rises about 6%. One profiled
candidate CPU-4x cut takes **25.008 s**, including **1.860 s** fenced; its largest task is **533 ms**
and largest timer gap **722.5 ms**. It has 15 long tasks. No same-session CPU-4x reference was run;
do not treat a comparison with the previous packet as a paired result.

With an input callback scheduled at 50 ms, the reference input waits **5,567 ms** and the conversion
finishes. The candidate admits the input in **9.4 ms**, cancels conversion and returns `skipped` after
84 ms. At CPU-4x, candidate admission takes **39.5 ms**, returning `skipped` after 125 ms. These are
one observation each and callback-to-admission figures, not human key-to-frame p95. All three
preserve journal-before-apply, undo/redo and exact cold recovery. All seven quiet cuts also cold-replay
exactly. A separate deterministic native control proves input passes while actual preparation crypto
is still held; the final-mutation control proves later input stays fenced.

Observed native crypto calls are identical in all seven quiet cuts: importKey 4,834; deriveKey 2,416;
decrypt 10,852; verify 9,638; digest 26,485; sign 3. Each has 13,376 source parses, six delivery and
six inbound verifications, 2,402 prefix links and one baseline full replay counted by the existing
metrics. The scoped authority-check counter increases from 11 to 14; it does not count every
lower-level authority operation. No full verification was removed.

### Identity and retention of evidence

`summary.json` is computed from retained raw observations with `probe/summarize.py`. Frozen native
bundles, profiles, logs, runtime patch and check outputs are included as gzip files under `evidence/`;
`manifest.json` gives bytes and SHA-256 for every packet file except itself. These contain only code,
numeric diagnostics and synthetic fixture results, not saved browser credentials or personal writing.
`source-identity.json` records the final files. The paired candidate bundle was frozen before the
small pre-mutation retired-read retry catch described above and a source comment edit; neither
executes on the offline measured paths. Final correctness/build checks include that repair. Exact
reference and measured candidate bundles are retained; results are not attributed to a published
commit or image.

## Remaining boundary

The strict exchange and full authenticated readback still occupy input for about a second here.
Some indivisible work, evidence copies, decoding and GC remain; CPU-4x still has a half-second task.
The new CPU-4x profile retains those costs for the next targeted investigation. This phase does not
establish that automatic retention is unobtrusive, nor a bound independent of initial history size.
Private removal remains opt-in; non-deleting installation/era-only APIs keep their existing queue
boundary. Reader-first publication, compatible rollback, real lifecycle use and public scheduling
remain separate work.

## Focused correctness evidence

- 191 unique unit tests across 13 affected files, including nested cancellation, caller isolation,
  task expiry, fresh authority, journal/activity invalidation and changed-inventory refusal.
- 17 native controls: actual transaction abort, renderer death, burned reservation, retry, exact
  readback, stale reader, old flight, new-era journal crashes, unpublished sources, closure, input
  during preparation versus fenced mutation, and undo/reopen. The input case also checks a second
  preparation is refused immediately.
- Three packaged lifecycle/checkpoint journeys, with the first failure and repaired rerun retained:
  original/joined owners, repeated cuts, two rotations, replacement, detached editing, checkpoint
  refusal/installation, two-way writing and undo/reopen.

TypeScript, build, lint/format, Yjs runtime, origin isolation and bundle budget are checked separately.
No service, deployment, personal browser storage, public retention switch or reader format changed.
