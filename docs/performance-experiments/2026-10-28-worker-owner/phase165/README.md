# Phase165 — native ownership cohort, without activation

2026-10-28. Add the internal native coordination primitive for a Window journal endpoint and one
dedicated worker. All417 existing runtime sources remain byte-identical. Ordinary Account/joined
factories remain exclusive, ordinary compatibility checks remain mandatory, and no application
route selects the cohort. Native coordination is **not** Account authentication or permission to
decrypt; the following mirror proof must still enter through the actual verified owner.

The Window acquires a per-slot supervisor reservation, a unique per-incarnation anchor, an exclusive
drain barrier on the existing slot name, then a shared endpoint lease on that same name. A worker
validates those actual native holders, takes an exclusive per-incarnation member lease, joins the
existing slot name with `ifAvailable`, and revalidates the Window holders before initialization.
There is no lock stealing, queued cohort join or caller-provided lock manager. Derived lock names
are coordination suffixes of the existing injective slot name, not new cryptographic domains.

The unique anchor prevents a delayed old ticket from joining a replacement in the same Window
client. The exclusive member refuses ticket replay into a second worker. An orphaned real worker
still holds the legacy slot domain and blocks a new supervisor's exclusive drain barrier. Older
exclusive owners wait for both endpoints; an older exclusive request arriving between Window and
worker acquisition causes refusal rather than the phase163 deadlock.

Closing invalidates Window effects and withdraws the join anchor first. It drains registered Window
work, stops the worker, crosses an actual native member-release barrier, erases registered local
buffers, then releases the slot endpoint and supervisor. Failed cleanup keeps the real slot fence
and supervisor held until context death. The member barrier has a5s refusal deadline: expiry fails
closed, never authorizes release or erasure credit. A structurally similar forged coordinator
cannot enter the following mirror composition.

## Evidence and preserved failures

- 14 new unit cases and21 existing focused cases pass; typecheck/lint/format pass.
- 20 native cases pass,10 each in headless Chromium and Firefox, with no retries and30s case
  deadlines. They cover mixed exclusive ordering, replay, same-Window stale incarnation, drain,
  cleanup failure, false stop acknowledgment, orphaned worker, navigation and queued cancellation.
  Orphan injection forces actual Window native callbacks to release while retaining the real worker;
  it models a lost supervisor, not a claim that the old surviving test page may keep writing.
- Removing only the Window-anchor check in the disposable Vite build makes the stale-ticket case
  wrongly initialize a worker in **both** browsers. Both expected controls fail at the specific
  `active` versus `refused` assertion. This is mutation detection, not two passing product cases.
- The initial native run has15 pass/1 failure: a worker's closed message can precede another
  context's observation of native release. Replace the one-shot member census with the actual
  native barrier. Keep the failed result. The initial source census is reconstructed retrospectively,
  not claimed as an immutable pre-run identity.
- Two initial fixture type errors are corrected in new files only. The first inventory attempt
  correctly refuses an unmapped Playwright family. Register its configuration, preserving the
  requirement and aggregate block.98 affected metadata/registry cases then pass.

The later20-case native run was completed before the final opaque Window-owner guard was added;
the final frozen20-case run and35-case focused unit run include that guard. Both are retained.
Deliberate close-refusal controls can produce Vite development rejection messages; their asserted
outcome is a failed owner with retained native exclusion, not successful cleanup.

## Reproduction and scope

Run Node24.18.0 with locked dependencies:

```
node node_modules/vitest/vitest.mjs run test/accountWorkerCohort.test.ts test/runtimePorts.test.ts test/writeSession.test.ts
node node_modules/@playwright/test/cli.js test --config playwright.account-worker-cohort.config.ts
COHORT_MUTATION=missing-anchor node node_modules/@playwright/test/cli.js test --config playwright.account-worker-cohort.config.ts --grep 'old ticket cannot join'
```

The last command must fail at both stale-ticket assertions. All browser contexts/profiles are
disposable and loopback only; no actual account data or keys are used in this phase. The synthetic
local buffer cleanup is not cryptographic-key erasure evidence. Worker Account verification and the
real journal/admission mirror are the next slice. Shared memory is not used by this primitive.

[Inputs](phase165-inputs.json), [independent review](review.py), [result](review.json),
[native log](reports/phase165-native-frozen.log.gz),
[mutation log](reports/phase165-native-mutation.log.gz) and unsuccessful logs remain in the packet.
The runtime census is418 sources with unchanged198 labels/templates and classification. Both new
test files stay required/uncredited:938 obligations/392 unresolved, retaining every prior manifest
row. General qualification remains paused;16ms/2.5s/30s gates remain unchanged and unearned here.
Freeze patch165 after164; no real staging, signing, push, preview update, release prep or deployment.
