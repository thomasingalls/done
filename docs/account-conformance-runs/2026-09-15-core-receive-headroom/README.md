# Core-receive execution headroom — single repair round

The preceding [lifetime/Account checkpoint](../2026-09-15-f17-rc-lifetime/README.md) is committed and
signature-verified as **`52a6aa80`**. The operator authorized one investigation/repair round and a stop
after its validation. This packet records that completed round; the repair is not yet committed.

**One owned attempt passes all 29 cases at unchanged limits.** No production code, native test bodies,
generated seeds/counts, mutation controls or deadline changes occur. No application-latency campaign
or second repair round follows this result.

| File | Cases | Stage elapsed, including preparation/drain | Existing limit |
| --- | ---: | ---: | ---: |
| Core receive | 17 | 149.007 seconds | 300 seconds |
| Ordered receive/editor | 12 | 150.515 seconds | 480 seconds |

The owned selection runs editor first, then core receive. Both worker and browser groups drain.
The cases preserve 12 receive and 10 editor generated histories, commit-boundary renderer death,
pending dependencies, compaction/cold replay, authenticated corruption refusal, mutation controls,
publication/source ordering and close/drain checks. Exact case identities and contracts remain bound
by the existing runner. Four Account runner tests and scoped formatting also pass.

## Investigation and repair

The prior core runs timed out at 300 seconds after 16/17 and 15/17 cases. Their recorded passing-case
durations total 290.611 and 288.033 seconds respectively; the generated case alone took roughly
109–110 seconds. Those partial sums do not include the unfinished case or all setup/drain costs.

A single standalone filtered pending-dependencies case passes in 10.084 seconds. Read-only Playwright
method timing observes **75 bundle evaluations taking 7.342 seconds**, 12 navigations taking 0.165
seconds, and small teardown costs. The wrappers time nested operations, so their totals must not be
summed as exclusive phases. This one-case probe identifies substantial repeated fixture setup work;
it is not full-file qualification and does not explain every historical timing variation.

The receive bundle already transitively re-exports all ancestor browser harnesses. Receive now passes
that complete bundle through nine existing ancestor fixtures using an optional parameter. The base
page setup evaluates it once; the ancestors still establish their bindings and configuration. Calls
without the override keep the previous path. Initial fixture construction still invokes inherited
setup; this change does not claim exactly one evaluation across an entire test. Cold replacement
pages, the original genesis page, real credentials, source selection and promotion transitions remain.
The fault bundles still replace the runtime explicitly at their existing test boundaries.

This removes redundant bundle evaluation rather than reducing test coverage or extending deadlines.
The editor's preceding 307.237-second result and both failed core runs remain historical evidence.
The new 149/150-second observations support headroom for these fixtures on this host; they establish
neither an application speedup nor loaded-host/immutable qualification. Other Account files retain
their earlier input identities: this is not one new 119-case Account selection.

## Preservation and next step

Only ten fixture source hashes change in the planning graph, and only its inventory digest changes
in the manifest. Planning remains at 626 obligations, 290 required files and 271 general files/2,189
dispositions (11 not applicable), with zero test-file/96 command/63 campaign unresolved adapter rows.
The initial inventory check correctly refused unrecorded fixture changes; a mistaken attempt to use
uninstalled Prettier failed before checks ran. The reviewed inventory update, installed oxfmt check
and separately executed runner tests pass. Both setup errors are recorded; no native retry is hidden.

The selected runtime, defaults, deadlines, previous packets, personal/vector pins, append-only record
prefixes and the other working seat are preserved. Personal app/server, phone, relay and deployment
are untouched. F-17 stays partial. Next is the unchanged application-latency gate, then the Local
default-activation decision with explicit disposition of any accepted latency debt. The one-round
fixture investigation is finished here; larger optimization exploration stays closed.

## Evidence

`artifacts.json.gz` contains the exact repair patch against the signed base, before/after fixture
sources, unchanged native tests, probe/helpers, planning audit, logs, selected contracts, all owned
receipts and their referenced artifacts. Its payload hashes are bound by `summary.json`. Two large
frozen source/dependency/browser inventories remain local and are hashed in `raw-artifacts.json`.
The packet contains synthetic fixture evidence, not personal browser data.

```sh
python3 docs/account-conformance-runs/2026-09-15-core-receive-headroom/verify.py
python3 docs/account-conformance-runs/2026-09-15-core-receive-headroom/verify.py --raw --current
```

The default verifier checks historical packet integrity and receipts. `--raw` also checks the local
large inventories while available; `--current` checks the repaired fixture and native-test bytes
against the current tree. Later intentional source changes must distinguish historical evidence
from current-tree equality. This is a bounded receipt, not an immutable release receipt.
