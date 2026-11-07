# Phase164 — extract runtime and lifetime ports; retain page execution

2026-10-28. Extract a fixed internal page adapter for activity, native lifetime and journal
environment endpoints. Account work still executes on the page. Local admission still synchronously
seals/writes its actual Window journal before acknowledgment; no worker round trip is introduced.
This implements the next boundary in the [phase163 contract](../phase163/contract.md), without
activating its experimental cohort, shared memory or headers.

## Change and preserved boundaries

[`runtimePorts.ts`](../../../../src/crdt/runtimePorts.ts) defines three typed ports and one frozen
page adapter. Activity observes document visibility/freeze/resume and Window pageshow. Lifetime
resolves actual secure-context Web Locks and subscribes to pagehide/exact-slot retirement. Journal
resolves actual localStorage afresh on every call and pairs its storage-event subscription with
cleanup. Activity unsubscribers retain their registration target, including if a test/environment
later replaces that target.

Only endpoint references change in accountCapture, writeSession and journalStore. The independent
[review](review.py) reverses a manually enumerated substitution list and requires **exact original
bytes for the entire remaining three files**, including public APIs, exclusive Account/joined modes,
compatibility, guards, drain/cleanup, sealing, snapshot retries, flush and receipt ordering. Another
437 prior catalog inputs remain exact. The new adapter adds no asynchronous work, key/proof access,
admission authority or caller-supplied runtime option. A compromised same-origin caller is still
outside the capability-sandbox promise, as before.

The worker cohort remains unimplemented in production. Its required reservation, existing-name
exclusive drain barrier, nonqueued join/refusal and dual-endpoint fencing remain in the prior
contract. This extraction does not authorize shared Account writers or a replaceable lock manager.
Synchronous local admission, native strict commits, fresh authority/witness checks, Undo, backoff,
formats and activation switches remain unchanged.

## Evidence

| Check | Result |
| --- | --- |
| Before focused existing unit files |24 pass. |
| After focused existing/new files |38 pass, including14 new regressions. |
| Full unit suite |192 files;2,225 pass, one existing skip. |
| Native write-session campaign |13 cases pass; all5 mutation controls detected. |
| Native journal campaign |17 cases pass; all6 mutation controls detected. |
| Selected existing v9 account lifecycle cases |5 pass: visibility/resume/pageshow invalidate authority/cache reuse; changed custody/clear/import refuse; hidden-page publication and renderer-death journal recovery preserve writing. |
| Metadata/inventory adapters |111 pass after source-site reconciliation. |
| Ordinary build/type/lint/format |Pass; build budget295.6KiB gzip against350KiB; origin scan passes. These are build checks, not latency measurements. |
| Package-defined security checks |Vector/AAD omission, retention, selection status, update limit, authority, recipient, admission, remediation, debts and WASM verification pass. Exact Node leaves/exit receipts retained. |
| Independent audit controls |Changed owner guard, false native assertion and undetected mutant are all rejected. |

The native journal case explicitly checks that append is synchronous, has no subtle-crypto await,
already has a sealed recoverable carrier, survives actual renderer death, and preserves content
after flush. Native lifetime cases retain close/drain/cleanup, frozen-owner exclusion, stale tasks,
worker participation, navigation and cleanup-error refusal. They ran with their original deadlines
and mutation assertions. No old tests or harnesses changed.

The five activity cases use explicit authority-reuse/incremental/coordinated-2000 settings in a
disposable fixture. They are functional checks, not a phone walkthrough, whole-client catch-up or
typing comparison. Keep16ms input,2.5s peer/all-marker and30s delivery gates. No speedup, performance
acceptance or release readiness is claimed here.

## Failed attempts and apparatus limits

- The initial new listener-detach test spied on an EventTarget after its methods were bound into
  globals, so it saw no registration:37 pass/1 fail. Correct only that new fixture to observe the
  actual global endpoint. Preserve its original source and failure.
- The first native wrapper refuses this checkout's external `.bin` dependency link **before any
  stage runs**. Preserve that refusal. Run the unchanged campaigns on a disposable candidate with
  materialized installed dependencies, omitting only generated account-setup caches. Candidate
  runtime hashes match both the checkout and the native reports. No identity rule is relaxed.
- Metadata initially has110 pass/1 fail: the non-crypto coordination registry retains three former
  BroadcastChannel source sites. Move that census to the one new constant and shifted unchanged
  writer-name site. No label family, construction status, specified contract or assertion changes.
- A read-only census snippet has one syntax error; the retained corrected script passes. The host
  pnpm12 command produces no output before interruption. Execute the exact package-defined Node
  leaves under24.18.0 instead, including recursive vectors:coverage expansion. Do not count the
  interrupted package-manager attempt as a pass.

Full failure notes and initial source are retained in [reproduction](reproduction/failures.md.txt).
The source-copy workaround is test apparatus; it changes neither the app nor installed dependencies
in this checkout. Both owned native campaigns report their process groups drained. Private profiles,
factors and service data are absent from the packet; the preview on8443 is untouched.

## Bookkeeping and replay

Review the [input identities](inputs.json), [independent audit/result](review.json),
[native session report](reports/native-session-copy/report.json.gz),
[native journal report](reports/native-journal-copy/report.json.gz),
[activity log](reports/native-account-activity.log.gz), [full unit log](reports/full-unit.log.gz),
[metadata log](reports/metadata-final.log.gz) and [Node command receipts](reports/contract-receipt.json).
Original failed reports remain alongside them. Reproduction protocol/scripts are retained as text;
ordinary source and the new regression file are part of sequential patch164 itself.

The runtime census is417 sources with the same198 labels/templates and36 groups. Planning inventory
adds the14-case test as **required but uncredited**:936 obligations/390 unresolved. Every old manifest
row remains identical; its935 obligations and389 unresolved rows are retained. General qualification
stays paused. No signing, commit, push, preview restart, worker/cohort activation, release preparation
or deployment.

Next is a production-shaped worker owner and admitted Window mirror/journal boundary, with explicit
mixed-owner refusal and interruption proofs before actual Goals/peer measurements. The separate
download/verification/display pipeline remains a subsequent slice.
