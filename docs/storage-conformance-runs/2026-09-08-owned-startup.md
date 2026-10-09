# Owned retained-workspace startup execution — 2026-09-08

**Scope:** phase-eight retained-workspace classification/open. Phase seven was committed as `a48c090`
before this work. The default application still uses the earlier store. See [owned-startup.md](../owned-startup.md).

| Run | Cases | Assertions | Mutants detected | Exit |
| --- | ---: | ---: | ---: | ---: |
| [Owned startup](./2026-09-08-owned-startup.json) | 15 | 96 | 3/3 | 0 |
| [Workspace regression](./2026-09-08-owned-startup-workspace-regression.json) | 10 | 62 | 4/4 | 0 |

Canonical outputs are `test-results/owned-startup/initial/report.json` and
`test-results/workspace-admission/startup-regression/report.json`. Saved JSON preserves their parsed
contents. The initial startup execution passed; no failed development run is credited. The startup runner
freezes 81 production files and records 99 input hashes. Both runs use Chromium 151.0.7922.34 / Playwright
1.62.0, Node 26.8.1 and Vite 8.1.5 on macOS arm64. External-origin requests are refused.

## What executed

The real startup owner reads the scoped slot index and known custody/content/journal carriers under Web
Locks. Empty preflight/open creates no database and enrolls no factor. A retained store without its index,
missing initialized content, missing custody and a mismatched route all refuse and preserve the post-fault
inventory. Selected legacy routing and its plaintext fixture remain untouched on the migration path.
The fixtures' separately captured database enumeration records native before/after inventories; ordinary
production enumeration is disabled and a named assertion checks it was never called.

Renderer death after the content counter commits but before the ready witness is signed leaves an
observable creation-pending state on restart. Ordinary startup neither finishes it nor changes the intent
or counter. Clearing/cleared state tags on extra scoped control rows block open and leave all material
present. These are refusal-only diagnostic tags, not validated ClearIntent records or cleanup authority.

Structurally consistent but corrupted ciphertext still reports unlock-required at preflight; the real
authenticated open then returns repair-required before actor initialization, editor or transport. A wrong
factor returns unlock-failed without a carrier change or surface. Valid factor unlock recovers text and
finishes admitted actor initialization before one actual CodeMirror/channel pair is constructed. The
identity callback observes a held shared slot permit.

An earlier successful preflight is followed by an exclusive holder installing a clear marker. The new
open queues behind that holder, rereads after the grant and refuses clearing without writing application
content. A separate schedule gates native content decryption, cancels open and observes that the exclusive
waiter remains blocked until the owned crypto work drains. No stale ready facade appears; a fresh attempt
reacquires and opens successfully.

Renderer death before the application initialization content barrier finishes exposes no editor. Restart
recovers the journalled initialization, retains the original text and one actor entry, starts fresh human
history and admits subsequent input. A future application schema is refused as repair-required without
rewriting it. An independently valid second workspace remains usable while the first has an unreadable
journal. The workspace regression re-exercises shared history, move/undo pressure, actor initialization,
repair, tab synchronization, scope rules and renderer death after the early schema guard was added.

Three source mutants independently let a probe create a database, treat retained unindexed material as
fresh, or bypass classification inside the granted open lifetime. Each fails its named assertion on the
passing baseline. The workspace's four prior history/origin mutants remain detected in regression.

## Verification and limits

Full Vitest passes **634 tests / 52 files**, including **27** new startup tests with fake IndexedDB and
immediate-grant lifecycle fixtures. They check undefined-valued surviving records, scoped array key
suffixes, missing/contradictory states, identity/routing refusal, unsupported versions and cancellation.
Those unit fixtures do not supply browser exclusion or authenticated-open evidence; the real-browser
schedules above do. The required identity verifier and fixture enrollment/index installation remain
synthetic. This checkpoint does not construct verified Local identity or wire the Account verifier.

Typecheck, focused lint/format, build/budget/origin, sixteen vector generators/AAD, WASM verification and
applicable project/governance/traceability checks pass. Initial JS remains **306.3 kB / 350.0 kB** gzipped.
`storage:startup` is included in the check chain. The literal full check chain, geometry and the separate
unchanged Goals/admission/journal/content/custody/lifecycle browser suites were not rerun; workspace
regression covers the one changed existing application module. This is one browser/host and page-loss
evidence, not power-loss, native IME, supported-profile or performance acceptance.

The next bounded work is verified fresh Local genesis and lifecycle-owned scoped indexing. It must supply
the immutable cross-database creation intent and factor confirmation before persistent editing. Verified
creation/migration resumption, journal-inclusive clear execution, exact trim, legacy cutover, Account
authority, PRF/generation/reference composition and independent/platform review remain owed. Existing
index writers do not yet participate in the new lifecycle, so this reader alone cannot authorize default
application cutover. No obligation or debt status changes; L-2's progress record is unchanged.
