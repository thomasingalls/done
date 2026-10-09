# F-17: private Local preparation integration

Starting at signed `0c84e5cc`, connect the preparation owner to the Local queue and workspace through
an explicit private constructor selection. `createAdmittedWorkspace` defaults to `reference`; only
callers selecting `local-handoff` use the candidate. The default Local opener, packaged app and all
Account factories keep the reference path. This is a functional integration checkpoint, with no new
latency observation or default activation.

## Ownership and publication

A symbol-keyed internal admission option carries the workspace's command, verified revision,
acceptance and failure callbacks. It survives the factor-unlocked admission factory's options capture;
it is absent from the application workspace and transport interfaces. The queue supplies the actual
head object, current slice, revision and writer to the existing opaque-context owner. Registration is
rejected for an Account source-capturing carrier, and candidate workspace construction rejects source
capture. Generic `PrepareIntent` remains supported.

Both paths share the same command/history/selection implementation. The reference additionally forks
a canonical draft and replays the captured command update into it. The candidate forks only the
workspace history, registers its ownership immediately, and derives its update from actual command
transactions. Bound checks and verified-basis checks precede storage; a no-op also requires full
candidate/canonical equality. Local does not claim independent Account source verification. The
reference's original-frame source probe remains intact.

A retained queue head borrows the same prepared bytes on storage retry without rerunning the command.
Both synchronous journal append and awaited content append use a lease. Close revokes authority
immediately while preserving an in-flight writer's references until release. The queue never directly
erases a handoff-owned buffer during that lease. Discard disposes the abandoned candidate; a completed
slice copies its remaining intent before finishing and erasing the old preparation.

After durability, canonical promotion advances revision. Before advancing the slice ordinal or
publishing an event, the owner requires the same job/slice/writer at exactly the next revision and a
complete canonical/candidate comparison. It then transfers history and selection state to the
workspace and records the verified revision. The workspace checks the publication's revision and
source before emitting; remote transitions still apply their original event bytes and perform full
comparison. Reentrant submissions remain queued behind the current slice. A detached publication
copy survives an observer closing the owner. Failed adoption is terminal, retains the projection
failure cause for workspace callers, and cannot retry already-persisted input.

## Evidence and discovered gap

The 23 original workspace tests remain under a reference label and also run against the candidate.
Each path additionally checks no-op revision/remote writer replacement, reentrant submission, and the
same 80 generated histories (seed `140925`). Independent text, revision, undo/redo and cold-replay
expectations cover local acceptance, storage failure/retry, discard and remote insertion; selection
and one-preparation-per-retry assertions are included. Two Local-specific cases test leased bytes
through close and post-promotion mismatch without publication. There are 54 workspace cases total.
Eight affected files pass 155 case dispositions through the owned runner, including the unchanged
source-capture and ordered-receive regressions.

The first native pending-state run passed its 100 generated histories but failed the directed
initialization-publication control. A Local event deliberately relabeled as remote was tolerated
because the candidate had already been adopted and matched canonical state. The repair binds the
publication source as well as revision and retains `projection-mismatch` through startup refusal.
The original source, failing report, directed repair pass and final full run survive. Removing the
source check reproduces the intended failure. Separately, omitting adoption comparison and erasing
leased bytes fail their targeted unit assertions. These are faults in the new private integration,
not evidence that the default app or personal writing was affected.

Final native pending-state and original-order delivery campaigns each pass all directed cases and
100 generated histories. The owned workspace catalogue passes its ten cases and four discriminating
mutations. Its pending-history mutation now targets the shared command's candidate assignment,
because the private handoff no longer stores its candidate in the workspace's legacy `pending` slot.
All exact reports, source variants and output are retained in the
[evidence packet](./account-conformance-runs/2026-09-14-f17-local-handoff/README.md).

No application timing is taken. The last application gate remains 15.2/69.4 ms desktop/CPU-4x Android
typing against <16 ms, with Android failing. Next specify and run a balanced candidate/reference
performance comparison and the unchanged application gate before deciding default Local activation.
Account source/capture activation, physical-device capacity and immutable qualification remain
separate. After the F-17 disposition, return to the 96 command / 63 campaign wrapper obligations and
remaining qualification repairs. All test-file adapters are already integrated.


## Recorded checkpoint

Full units pass alone at unchanged limits: 97 files / 1,093 tests. All 99 runner self-tests, TypeScript,
scoped style, inventory and authority checks pass. The general set is 261 files / 2,073 dispositions
(11 not applicable), with only the workspace registration expanded and all original reference cases
retained. All 52 personal/vector pins and L-2 remain unchanged. Command/campaign and immutable
qualification remain open. The next timing comparison should include the signed baseline as well
as the retained reference, because sharing the command helper also changes reference implementation
code; semantic agreement does not establish identical cost.


## Performance follow-through

The subsequent [prospective performance phase](./f17-local-performance.md) meets its relative Node
criteria against both this reference path and signed `0c84e5cc`, while preserving every semantic
check. The unchanged candidate application gate still fails Android typing at 63.5 ms (<16 ms),
so default activation is refused and this handoff remains private. No product code changes in that
phase. Earlier statements about timing being next describe this functional checkpoint.
