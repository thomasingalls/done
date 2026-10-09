# F-17: bounded document-fork experiment

The signed baseline is `e2c93b05`. Complete per-transition comparison was improved in the prior
phase; the unchanged application gate still fails at 16.2 ms desktop / 77.2 ms CPU-4x Android
card typing. Private preparation still constructs both an admission draft and a separate undo
history. This phase tests the encoding used to construct those detached documents. It does not
remove either copy, share mutable document state, or change admission/publication order.

## Candidate and decision

Use pinned Yjs V2 struct compression only inside `forkDoc`, on the same integrated-only read view.
The naïve public-codec swap was rejected by three tests. Paired private codecs preserve V1
JSON stringify/parse semantics for formatting/embeds and normalize unpaired string-edge surrogates
before V2 joins fields. Binary values must detach from the temporary update before it is cleared,
including binary leaves inside arbitrary arrays/objects. The latter also repairs a pre-existing
V1 fork defect, retained as a baseline counterexample. The temporary representation is local to
the fork and is never emitted, persisted or accepted by another protocol path.
Copy pending updates, their missing-clock map and pending deletion bytes exactly as before;
do not replay them during the fork. Keep the existing runtime redone-link and deep undo-stack
copying. Persistent content, encrypted carriers, outbound updates, recovery formats, snapshots,
comparison and their V1 encodings remain unchanged.

The question is whether this standard codec reduces detached-fork and whole-command cost on this
host enough to retain a small runtime-only change. A pilot compares the fixed baseline with this
candidate at 1k, 10k and 100k actual Yjs items over 100k visible characters. Use the existing Node
profile unchanged: one warmup and five measured samples per fork/comparison, six real admitted
commands with the first excluded, and the existing archive-read control. Run sequentially without
other tests or profiles. Keep every sample, source patch and bundle identity. Report medians and
mixed outcomes; these dependent samples share host/JIT/GC state and do not support population or
causal estimates. A warmed alternating check (ten warmups, twenty AB/BA pairs, same item counts)
will assess fork-only order sensitivity before the final browser run if the pilot is promising.

Retain the change only if semantic/fault controls pass, the fork gain is substantial (at least
20% median in one predeclared item-count stratum), and no consistent >10% fork regression appears
in another stratum across the sequential and alternating checks. Otherwise preserve the failed
experiment and revert the candidate; do not broaden the implementation silently. Whole-command
and browser metrics remain independent guardrails and may expose unchanged dominant costs.
Small single-host samples do not establish a universal gain or dense-history/device capacity.

## Correctness and measurement controls

Compare fork results against the frozen V1 integrated-only fork reference using original encoded
state, exact pending bookkeeping and later dependencies, including deletion/GC, long/unusual
strings, nested maps/arrays/text/XML, JSON and binary values. Check mutable-content isolation in
both directions. Exercise undo/redo across repeated forks, retained deleted content, redone links
and selection metadata; mutation of a fork must not alter the accepted history. Keep the existing
500 reordered-delivery histories and per-transition equality properties. Deliberate pending-map
aliasing and omission of runtime redone links must be detected.

After focused controls pass, run the full unit suite, pure runner/type/style/inventory/authority
gates, native pending and original-order delivery campaigns, and the owned workspace-admission
catalogue/mutations. Then run the unchanged packaged application latency gate alone, retaining all
30 metrics, any budget failures and drained-process receipts. The existing pilot remains the
recorder calibration reference: frame-plus-task timing is a paint proxy, CPU 4x is host emulation,
and seeded editor work uses 1280x900, not a physical handset. Compare browser runs descriptively;
no thresholds, timeouts or sampling rules change to obtain a pass.

## Scope left open

This benchmark targets known item-count strata rather than a representative user population.
It does not establish fork-free admission, unbounded undo capacity, physical-device responsiveness,
Account release readiness or immutable aggregate qualification. Keep private staging, refused-edit
isolation, complete comparison, undo and pending delivery as hard constraints. Personal browser,
server, package, recovery files and deployed routing are untouched. Stop if signed commits block.

The initial plain-V2 pilot and its failed semantic controls remain exploratory evidence. The
final paired-codec candidate receives a fresh sequential and alternating measurement after its
focused and mutation controls. No earlier timing is presented as evidence for the revised source.

## Recorded result

The revised paired codec passes focused, generated, deliberate-fault, full-unit and native
controls. Alternating fork medians improve at all three item counts and meet the prospective
acceptance rule. Sequential whole-command timings remain mixed. Desktop card typing meets the
unchanged <16 ms budget at 15.2 ms; CPU-4x Android remains above it at 69.4 ms. The complete gate
is failed and F-17 remains partial. See [measurements](./performance.md) and
[retained evidence](./account-conformance-runs/2026-09-14-f17-forks/README.md).
