# F-17: residual preparation profile

Prospective follow-up at signed `1fd04afa`, after complete-comparison and detached-fork repairs.
The application budget remains failed on CPU-4x Android card typing at 69.4 ms; desktop met its
bound at 15.2 ms in the last observation. Both private drafts and deep undo-history copying remain.
This phase identifies the next bounded target. Do not assume that the earlier profile's cost split
still applies to the revised runtime.

## Browser observation

Run the existing owned `browser-latency-diagnosis` selection unchanged, alone. Its fixed design in
[latency-diagnosis.md](./latency-diagnosis.md) still governs: two reverse-order blocks of 120 trusted
keys on textarea, bare CodeMirror and admitted card; separate 60-key typing and ten-cycle focus
profiles; exact sample/text checks and cold reopen. Keep all raw samples, source maps, profiles and
process receipts. This repeat is justified by the production changes since the first profile,
not by a search for passing timings. It does not replace the unchanged application budget gate.

Inspect active stacks within private preparation, `forkWorkspaceHistory`, detached document
construction, metadata/selection copying, complete comparison and UI publication. Sum sampled
inclusive time per relevant stack without adding nested totals. Attribution is descriptive and
includes profiler perturbation; it does not identify a causal speedup or per-key quantile. If
mapped samples do not distinguish the candidate costs, retain that uncertainty and use the Node
probe below before choosing an implementation change.

## Controlled history-scaling probe

Use the signed runtime, with no product changes. Hold the document and mutation history fixed
within a pair; compare a document-only fork and a full history fork. Vary human undo depth over
0, 100 and 1,000 distinct groups. Use a fixed visible master-text length and deterministic edits
for each history (the resulting text varies across depths), and record actual integrated item count, encoded bytes, undo/redo depth and
metadata entries so history growth is not silently treated as fixed document complexity.

At each depth include metadata absent and before/after selection metadata with 1 and 100 target
entries per group. These are declared diagnostic stress strata, not a claimed distribution of
personal workspaces. Metadata uses the production relative-selection shape. All diagnostic target keys use the same
master-text basis to isolate metadata size at fixed document state; they do not model actual target
distribution or selection restoration. Record five warmups
and twenty alternating document/history pairs, with correctness checks and disposal outside timing.
Report medians and retained sample ranges. These dependent observations share host/JIT/GC state;
no population confidence interval, significance test or universal performance claim follows.

The unit of observation is a fork; the analysis unit is a fixed history/metadata stratum on this
host. Varying metadata at a fixed document/history state can localize copying cost, but subtracting
medians is not a per-command causal estimate. A full history fork also restores redone links and
copies deletion sets; retain those confounds. No concurrent tests/profiles during timing. Stop at
the declared counts, retain negative/mixed results and do not resample for a desired answer.

## Decision and scope

Choose a follow-up implementation only when browser attribution and controlled scaling identify
useful avoidable work. Prefer a repair that keeps private staging, source/destination metadata
isolation, human undo/redo, refused-input behavior and full per-transition verification. Define
its semantic oracle and a mutation control before changing production code. If duplicate drafts
are the target, specify the ownership and verification handoff before removing either one.

This phase produces evidence and a concrete next design, not an optimization or a new performance
pass. It cannot establish physical-device capacity, deep-history product limits, Account release
readiness or immutable qualification. The personal browser, package, server and deployment remain
untouched. Preserve append-only records and signed intermediate commits; stop if signing blocks.

## Observation at the signed baseline

The unchanged browser diagnostic passed four cases without retries and drained its process group.
It retained 1,440 raw timing samples, twelve p95 rows and four CPU profiles. Browser p95 values below
are milliseconds; two blocks are separate observations, not pooled estimates:

| Surface | Desktop, blocks 1 / 2 | Android emulation CPU 4x, blocks 1 / 2 |
| --- | ---: | ---: |
| Textarea | 2.5 / 1.8 | 5.1 / 5.4 |
| Bare CodeMirror | 2.4 / 17.9 | 7.3 / 18.0 |
| Admitted card | 15.0 / 16.4 | 73.0 / 73.9 |

The later bare-CodeMirror block again has a larger tail. Retain the recorder/scheduler uncertainty;
do not subtract controls from card timings or infer a new desktop budget pass from this diagnostic.
The independent application gate's last result remains failed at 15.2/69.4 ms desktop/CPU-4x typing.

CPU attribution is sampled inclusive milliseconds over each separate **60-key** typing profile:

| Stack | Desktop | Android CPU 4x |
| --- | ---: | ---: |
| Entire private preparation, `prepareIntent` | 542.9 | 2555.5 |
| Admission document fork | 166.4 | 752.5 |
| Workspace history fork, including its document | 309.9 | 1481.7 |
| History's document fork | 148.2 | 730.9 |
| Undo/redo stack copying | 157.8 | 738.2 |
| Full post-admission comparison | 186.4 | 774.4 |
| Publication listeners | 64.4 | 522.9 |

These rows overlap: history construction contains its document fork and stack copying, and private
preparation contains all three. The stack-item construction callback has 137.9/645.9 ms of own
sampled time, but the profile does not isolate native `structuredClone` from inline object creation
or other callback work. Deletion-set copying has 1.3/14.8 ms inclusive sampled time. The focus
profiles separately attribute 19.3/100.6 ms to editor mounting over ten cycles, not per focus event.

The controlled Node probe completed all nine strata, five warmups per variant and twenty alternating
pairs per stratum: **360 measured forks**. Visible text length is 100,000 characters. Actual item
counts at 0/100/1,000 groups are 1/300/3,000; V1 encodings are 100,017/102,206/126,161 bytes. Redo depth
and redone-link count are zero throughout, so this probe does not measure redone-link restoration.
Every measured copy matched the complete source encoding and text; history copies matched undo/redo
depth and first/last metadata. These checks are diagnostic sanity checks, not new undo correctness
coverage. The earlier generated undo, isolation and redone controls remain the semantic evidence.

| Undo groups | Targets per before/after selection | Document median [range], ms | History median [range], ms |
| --- | ---: | ---: | ---: |
| 0 | 0 | 0.195 [0.156–1.327] | 0.207 [0.156–0.657] |
| 0 | 1 | 0.197 [0.135–2.594] | 0.206 [0.139–0.807] |
| 0 | 100 | 0.158 [0.109–1.839] | 0.174 [0.145–0.387] |
| 100 | 0 | 0.281 [0.237–0.463] | 0.395 [0.329–0.490] |
| 100 | 1 | 0.277 [0.197–0.421] | 1.020 [0.869–2.650] |
| 100 | 100 | 0.334 [0.226–12.721] | 57.169 [54.421–67.026] |
| 1,000 | 0 | 1.153 [1.021–3.337] | 1.848 [1.565–4.139] |
| 1,000 | 1 | 1.180 [1.055–3.243] | 8.802 [7.811–18.750] |
| 1,000 | 100 | 1.348 [1.087–5.092] | 559.527 [554.206–603.372] |

Zero-depth target labels create no actual metadata and are repeated controls. At 1,000 groups,
nonzero strata hold 2,000 or 200,000 selection entries across before/after maps. This is a stress
construction with target keys sharing the master-text basis, not a modeled user distribution.
Strata run in declared increasing order, so JIT/GC/order effects are not separated across strata;
only document/history order alternates within each. The 12.721 ms document-fork tail is retained.
Nevertheless, the large history-specific scaling with metadata at fixed document state, together
with browser stack attribution, supports targeting metadata copying before a larger ownership change.
It does not forecast a particular application speedup or establish that a real user has this history.

## Next bounded implementation

Prototype a specialized, **fully detached** copy of the known before/after selection-metadata shape
used by `forkWorkspaceHistory`. Keep the existing `structuredClone` behavior for metadata outside
that shape. Limit this first attempt to history metadata; both private documents, deletion sets,
redone links, command execution, admission order and every full comparison remain unchanged.

The fast path must preserve values and reference relationships within each cloned metadata graph,
including shared relative-position IDs, and produce no shared mutable Map, array, object or buffer
with its source. Keep separate clone identity across different stack items, as the current per-item
`structuredClone` does. Unknown keys, unsupported values, descriptors/prototypes or cycles must fall
back without partially changing the source or losing fields. Do not replace deep isolation with
shallow sharing, truncate history, or assume arbitrary seam metadata is immutable. A failed candidate
is discarded rather than used to justify weakening these contracts.

Before production edits, pin generated differential tests against the current per-item clone:
actual relative selections on master and cards, multiple ranges, shared IDs, before/after maps,
undo/redo stacks, unknown structured-cloneable metadata and fallback cases. Check alias relationships
and mutation isolation in both directions, not just JSON/value equality. Compare generated command
histories against an unforked reference, including undo/redo and restored selections. Deliberately
share a nested selection/ID in a mutation control; the intended isolation assertion must fail.

Compare baseline/candidate history forks with the same fixed nine strata, five warmups and twenty
alternating pairs. A useful candidate should lower the median by at least 20% in both nonzero-metadata
1,000-group strata without a consistent >10% regression in the zero-metadata controls; retain every
sample and mixed result. This is a prospective engineering decision rule, not a significance test.
Then run relevant semantic/native controls and the unchanged application budget gate alone. Passing
local clone timings cannot override a semantic failure or close the application gate.

Duplicate preparation, full comparison and UI publication remain substantial residual costs. This
bounded attempt is unlikely to meet Android's <16 ms typing budget by itself. Consider a prepared
history handoff only after explicitly defining who owns, verifies, disposes and publishes the draft.

## Evidence retention

[The phase packet](./account-conformance-runs/2026-09-14-f17-history-profile/README.md) retains all raw
samples and CPU profiles, every profile node's resolved source mapping, the analysis script, the
Node probe and all its samples, source/dependency/browser pins and process receipts. The full generated
source-map files remain in the raw run, with their paths and hashes recorded in the packet; their
multi-megabyte contents are not duplicated into the bounded packet. Thus the compact packet alone
is not a complete rebuild or immutable qualification bundle. The protocol wording about retaining
source maps is satisfied in the raw run; only resolved mappings are committed here. The original
prospective text is separately retained, including its subsequent clarification that visible length,
not final text content, is fixed across history depths. No production code or test contract changed.
