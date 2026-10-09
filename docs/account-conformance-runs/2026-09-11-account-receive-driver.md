# Owned receive polling/reconnect evidence — 2026-09-11

The receive HTTP phase was committed as `1ceb88d`. The [working patch](./2026-09-11-account-receive-driver/working.patch)
implements the next bounded [private polling/reconnect owner](../account-receive-driver.md) against that
commit. This phase remains uncommitted for review.

| Check | Observed result |
| --- | --- |
| Native polling/reconnect | Five cases pass: actual service empty-to-later-data polling, lost response/backoff/catch-up/cold replay, persistent failure halt, Local pressure/explicit repair, close/drain and prompt backoff close |
| Native generated histories | Ten histories, seed 9112052; publish/local/lost/offline/halt/restart actions preserve authored text, durable progress, source counts and the cold request cursor |
| Independent scheduler model | 400 deferred clock/event histories, seed 9112051, check exact attempt deadlines/counts, unknown floors, pauses, halts, close, one pass and one timer |
| Observer-pause regression | 100 generated pause durations, seed 9112053, plus a focused failing-before/passing-after test |
| Effective omissions | Five actual scheduler controls and two native final-dispatch controls all distinguish the passing baseline from a prohibited result |
| Full unit suite | 974 tests in 86 files pass with `--maxWorkers=2`; original per-test deadlines remain |
| Affected campaigns | Manual receive HTTP and the v8 sender/reconnect driver pass, including their native, generated and mutation cases |
| Isolated build/trace | Yjs binding, TypeScript, Vite, budget, origin isolation and fresh prerequisite/trace chain pass; initial JS 329.6 KiB / 350 KiB, 101 claims, 28/28 named current-defect falsifiers, nine retained debts |
| Scoped static checks | TypeScript, lint, formatting and diff checks pass |

[Final campaign](./2026-09-11-account-receive-driver/campaign/summary.json),
[native cases](./2026-09-11-account-receive-driver/campaign/native.log),
[generated native histories](./2026-09-11-account-receive-driver/campaign/generated-native.json),
[clock/property cases](./2026-09-11-account-receive-driver/campaign/units.log),
[regression chain](./2026-09-11-account-receive-driver/regressions/summary.json),
[final full units](./2026-09-11-account-receive-driver/regressions/receive-driver-isolated-units.json), and
[isolated build](./2026-09-11-account-receive-driver/build/summary.json).

## Defect found and repaired

A status observer introducing Local pressure just before the first owned step started could erase its
pending attempt. Ordinary admission restoration then had nothing to schedule. The
[original module](./2026-09-11-account-receive-driver/reproduction/receive-driver-reentrant-before.ts) and
[failing test](./2026-09-11-account-receive-driver/reproduction/receive-driver-reentrant-before.log) preserve
that counterexample. The repair retains the pending time until the owned step actually starts. The focused
regression, 100 generated observer-pause cases and a mutation recreating the stall pass. This was found by
focused review and reproduction; the earlier random event campaign had not represented that observer cut.

A separate classification correction distinguishes skipped readiness from a verified empty response.
A paused pass does not reset unknown failures or claim the stream is caught up. The independent generated
oracle now includes paused completions. No further counterexample was found by the final generated tests.

The other four scheduler controls expose concurrent passes, absent polling after end, online events
clearing a permanent halt, and invocation after observer closure. Native controls change connectivity or
induce actual Local quota/storage pressure at the final dispatch boundary: the baseline makes zero fetches,
the guard omission makes one. Each control runs a baseline and altered production source. Timeouts or
harness errors are never counted as detection. The first overlap mutation left one guard intact and did
not produce overlap; it was strengthened before the recorded final campaign.

## Failed run and scope of validation

A concurrent full-unit run failed ten existing per-test deadlines across nine files while browser campaigns
and build work were running; 964 other tests passed. Its
[failed output](./2026-09-11-account-receive-driver/regressions/receive-driver-complete-units.log) is retained.
The final full suite subsequently passed with two workers and no concurrent native/build campaign, without
changing assertions or deadlines. Earlier passing campaigns preceding the two scheduler corrections are
retained separately and are not substituted for the final campaign.

[Verification](./2026-09-11-account-receive-driver/verification.json) compares the final campaign code inputs
and isolated runtime inputs with current files. Earlier manual-receive/v8 regressions precede only the final
scheduler-specific corrections; the final driver campaign and full units cover the final scheduler.
Documentation was completed afterward. The [artifact manifest](./2026-09-11-account-receive-driver/manifest.json)
identifies the saved evidence and patch. The build helper asserts the exact isolated checkout path before
running. Both personal package directories match all 21 saved hashes; no predecessor restoration was
needed this phase. The historical review and L-2 checkpoint are unchanged.

This is targeted validation, not another full `pnpm check`. `pnpm account:receive-driver` is appended to that
aggregate. No v9 outbound sender, new-member enrollment, personal browser/factor operation, real Account,
route, server or deployment was activated. Creating-member/first-epoch and existing receiver-size bounds
remain. Whole-protocol debt and the accepted review gates before real Account use remain open.
