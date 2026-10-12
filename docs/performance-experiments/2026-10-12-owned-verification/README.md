# Private verification ownership — 2026-10-12

The prior warm-load repair is committed signed as **`e88c19a5`**. This packet measures the next
working-tree slice: remove the private verifier's redundant copies while preserving the storage
owner's detached caller boundary. The [prospective protocol](protocol.md) precedes implementation
and comparisons. [Runtime/bundle hashes](source-identity.json) identify the measured variants.
No stored-format change, publication or release-validation campaign is included.

## Attribution before repair

One isolated CPU-4x session on the signed warm-load base, with copy stacks and a CPU profile:

| Copy site | Calls | Rows copied | Bytes copied |
| --- | ---: | ---: | ---: |
| Storage load, caller-detached rows | 9 | 8,153 | 33,136,005 |
| Verifier candidate | 8 | 7,348 | 29,468,152 |
| Verifier retained rows | 8 | 7,348 | 29,468,152 |
| Coverage content copy | 8 | 102 | 1,837 |

The verifier additionally deep-clones its semantic result; that allocation is **not** included in
the record-copy byte counter. During the nine observed long tasks (59–99 ms), sampled self time
includes approximately 236 ms in byte comparison, 204 ms in `verify`, 154 ms in `sameRecords`'s
callback, 76 ms in the copy callback and 55 ms in erasure. Inclusive time in `verify` is about
534 ms; those inclusive figures overlap and must not be added to self times. CDP/profile clock
alignment uncertainty is 1.8 ms. The profile locates work in observed tasks, not every delayed
frame. It is excluded from the timing comparison.

## Repair and safety boundary

The [ownership contract](../../account-verification-ownership.md) describes the private callback
contract. Only exact byte-equal prefix records can share retained buffers. New/changed rows are
copied. Successful verification transfers the candidate and result into private ownership, and
erases only old backing buffers unreachable from the new view. This removes both verifier history
copies, the semantic-result clone, and repeated byte scans of identical internal prefix buffers.

Incoming storage rows and outward projections stay detached. Every incoming record still participates
in equality checking; counter checks, signature verification, reference audits, physical audits,
journal-before-apply and undo are unchanged. Failure/invalidation cannot install a speculative view.
Overlapping verifications remain refused. The generic verifier retains its old clone behavior.

## Final matched comparison

Same retained synthetic 120-card, 600+ received-position fixture (54,211 exported Markdown bytes),
fresh restoration per session, desktop Chromium at CPU-4x, offline. Each session types 120 keys at
requested 150 ms spacing, undoes/redoes the whole block, then reopens offline. Serial order:
reference-1, owned-1, owned-2, reference-2, reference-3, owned-3. Both arms use the same instrumented
source and differ by `VITE_ACCOUNT_RECORD_OWNERSHIP=0/1`; no profiling or other tests overlap these
timed sessions. Quantiles use `floor(n*p)` as specified. Durations below are milliseconds.

| Session | Handler median / p95 / max | Visible frame median / p95 / max | Long tasks | Total / max task |
| --- | --- | --- | ---: | --- |
| Reference 1 | 5.4 / 6.6 / 25.0 | 15.3 / 18.6 / 46.0 | 8 | 669 / 89 |
| Owned 1 | 5.3 / 6.8 / 21.0 | 15.5 / 19.8 / 101.2 | 4 | 220 / 57 |
| Owned 2 | 5.7 / 8.0 / 26.6 | 16.5 / 23.8 / 114.2 | 5 | 275 / 59 |
| Reference 2 | 5.9 / 7.4 / 19.5 | 17.4 / 47.6 / 164.0 | 8 | 710 / 96 |
| Reference 3 | 6.2 / 7.7 / 19.7 | 17.6 / 39.0 / 129.7 | 8 | 732 / 104 |
| Owned 3 | 5.6 / 7.3 / 24.9 | 16.5 / 45.8 / 117.6 | 6 | 323 / 60 |

All six pass full undo/redo and replay. Reference copies 92.072–92.079 MB; owned copies
33.162–33.166 MB: **64.0% fewer recorded copy bytes**. Aggregate long-task duration is
2,111→818 ms (**61.3% lower**), exceeding the declared 25% target. The median of session handler
medians is 5.9→5.6 ms; median of frame p95s is 39.0→23.8 ms, meeting the no-10%-regression rule.
Every session still has nine dirty flushes and nine warm loads, with 126 physical audit rows and
781,609 ciphertext bytes checked. The reduction does not come from skipping those checks.

The frame tails remain mixed: pair 1's maximum worsens 46.0→101.2 ms; pair 3's p95 worsens
39.0→45.8 ms. Candidate worst frame is 117.6 ms despite a 60 ms maximum long task. Dispatch-based
timing omits blocking before event delivery. The 16 ms p95 budget remains unmet. These three
sessions per arm show a local mechanism/effect size, not population significance or physical-phone
performance. CPU-4x is emulation; online catch-up and arbitrary history depths were not measured.

An earlier candidate pilot also passed (33.168 MB, three long tasks totaling 167 ms); it is retained
separately and excluded from the final comparison. There were no failed typing observations.

## Activation, evidence and remaining work

The branch now enables ownership transfer for incremental Account owners. The selector changed
from explicit `=1` during measurement to default-on unless `=0` after the criteria passed; the
ordinary packaged build verifies that default. The full reference ledger also retains the cloned
verifier. [Focused checks](checks.md) cover ownership/aliasing, failed/late proofs, generated
equivalence, native compaction/cold replay, reference-audit refusal, serialization and two-device
delivery/undo/offline reopening. No deployment follows from this packet.

Approximately 33 MB per session remains at the storage caller boundary. Incoming equality scans,
container copying and ownership graph traversal still scale with history. Removing that copy needs
a separate selection/lease design; handing mutable buffers directly to existing callers would let
their cleanup erase live verified state. [Local retention](../../account-local-retention-design.md)
remains design-only.

`evidence.tar.gz` contains numeric observations, the CPU profile, mapped copy sites/task attribution,
build/check logs, exact runtime patch and comparison summary. The archive excludes browser storage,
authenticators, service state and fixture credentials. `manifest.json` hashes each archived member
and the archive. Large source-mapped bundles and the reusable synthetic fixture remain outside Git
at paths/hashes in `source-identity.json`. Probe sources are in `probe/`; rebuilding the two arms
uses that build config, `VITE_ACCOUNT_LEDGER_PROFILE=1` and ownership `0/1`, with `DONE_PERF_DIST`
pointing at separate output directories. `run-pairs.py` records the exact run environment/order;
`summarize.py <results-directory>` recomputes the table from `typing.json` observations.
