# Owned one-device delivery and reconnect evidence — 2026-09-11

Committed the preceding private HTTP transport/readback as `e1a5029`. This phase adds the explicit private
sending factory and its lifecycle-owned scheduler. [Contract](../account-driver.md).

Final driver campaign: `test-results/account-driver/2026-09-10T22-58-09.440Z`.
[Summary](./2026-09-11-account-driver/summary.json),
[campaign sources](./2026-09-11-account-driver/sources.json),
[final sources](./2026-09-11-account-driver/final-sources.json),
[generated browser inputs](./2026-09-11-account-driver/generated-native.json),
[findings](./2026-09-11-account-driver/findings.json), and
[evidence manifest](./2026-09-11-account-driver/manifest.json).

| Check | Result and scope |
| --- | --- |
| Driver unit/property cases | Eight pass; 200 generated histories (seed 9122026) with deferred operations and an independent clock/invocation ledger; wake coalescing, one active pass/timer, capped retry floor, storage/offline pauses, close/drain and pending-first preparation |
| Node/native campaign | 14 pass, including real captured edits, HTTP/service decisions, exact retries, native source/invocation retention, cold reopening, Local failure/repair, permanent halts and close during fetch/backoff |
| Native generated histories | Eight (seed 9132026), 3–6 edit/offline/lost-reply/retry/restart actions; exact wrapper-by-position comparison, actual SQLite rows, complete capture/envelope/acceptance drain, invocation counts and writing preservation |
| Actual controls | Removed concurrency checks invoke overlapping passes; removed post-observer stop check invokes work after close; removed final dispatch gate sends after a connectivity change |
| Polling reproduction | The installed Playwright async predicate can complete with false; the replacement poll explicitly awaits results, waits for true and times out on persistent false |
| Transport/readback regression | 17 pass, including 60 generated service histories and existing membership/page-binding controls |
| Existing v8 delivery regression | Four property and 19 native cases pass, including eight durable histories, commit/crash boundaries and original witness/proof/authority controls |
| Full unit suite | 881 tests in 79 files pass, including a final strengthened assertion that progress keeps working status until an empty pass |
| Build/checks | Isolated build at `test-results/account-driver/app-build`, TypeScript, scoped lint/format and 13 repository gates; adjacent artifacts retain outcomes |

Two directed failures exposed implementation defects. A working-status observer could close the scheduler
before it nevertheless invoked an operation; the scheduler now rechecks after publication. A successful
pass briefly reported idle with backlog remaining; it now stays working across yields and reports starting
before the first check. Both are protected by retained tests, with an actual control for the observer case.
Generated histories found no additional production counterexample.

The initial native harness used async waitForFunction predicates. In this installed Playwright they can
return a false value as success because the predicate Promise is truthy. Explicit awaited polling repairs
the new drain and lock-pending waits; its live falsifier is retained. Older unrelated uses remain outside
this audit. The initial generated run exhausted 110 seconds; progress output, per-history cleanup and
measured bounded deadlines now preserve actionable results (180 seconds for that case, 300 for the stage).
The timeout itself is not claimed as a minimized protocol defect.

[Superseded test inputs](./2026-09-11-account-driver/superseded-test-inputs.json) explains snapshot differences.
No production input differs: the older regression inventories also include two driver fixture files that
they do not invoke, repaired and exercised by the final driver campaign. One final unit assertion was added
after its campaign snapshot and executed by the full final suite. Original hashes are preserved alongside
the final source inventory rather than rewritten to claim an execution that did not occur.

The driver sends only owned persisted bytes, infers progress only from durable evidence, and treats
transport failures as unknown. It neither changes the wire/storage formats nor receives/applies new remote
content. Runtime status/backoff is not acceptance authority. The private token stays in the factor-owned
lifetime and scheduling detaches/drains on close. No personal Account, browser, factor, relay or preview was
operated on. The Local release/predecessor remain intact. No whole debt is paid and no entire pnpm check
run is claimed. Inbound baseline/authority/cursor preparation is next.
