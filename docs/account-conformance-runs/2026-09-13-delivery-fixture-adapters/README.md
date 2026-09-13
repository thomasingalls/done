# Service delivery and inbound-read fixture evidence

Base: signed and verified `95fa715db75509efe1affdf2ec6759c44b6ebe7a`.
This new phase remains uncommitted. Prospective packet ceiling: **150 kB**.

The disposable `delivery-fixtures` selection passes **eight files / 52 cases** in **119.579 seconds**,
including snapshot and fingerprint work. Every process group drained. Product source, test bodies,
names, assertions, seeds, populations and deadlines remain byte-identical to the signed base.

## Reviewed scope

| Family | Files / cases | Fixture effects and ownership |
| --- | --- | --- |
| Service delivery | controls, core, generated, restart: 4 / 32 | Synthetic admission and cryptographic oracles; temporary SQLite; copied-source mutants; binary IPC crash workers and competing service processes |
| Inbound read | controls, core, generated, restart: 4 / 20 | Synthetic signed pages, original ciphertext and independent prefix oracle; temporary SQLite; copied-source mutants; binary IPC crash workers; inherited competing SQLite subprocess |

The delivery property retains 80 histories at seed 9822026; inbound retains 60 at seed 9112031
and its seven-operation coverage assertion. These **140 passing histories** remain ordinary required
cases. The inbound core also runs the actual receiver through an in-memory Vite build with
`configFile: false` and `write: false`, then imports the temporary module. It writes no root build.
No browser or HTTP listener is started. Temporary databases/modules and workers have teardown hooks
and the external owner retains its unchanged three-minute file bound and five-second drain grace.

Optional `ACCOUNT_REPORT_DIR` exports remain disabled: file success does not grant wrapper artifact
credit. The inbound native fixture stays blocked. The retired v8 delivery native fixture stays
excluded; this work does not revive that product path.

## Historical inputs are part of the execution contract

Two tests deliberately load prior source with `git show`. Delivery's old-reader control uses
`2cb42a2:account-service/core.ts`, resolved to `2cb42a2678adbc83eaef98405fa63ea86569d94f`.
Inbound's historical size fixture uses
`4bb09042f37f68ec31f0d82587af608f599eb096:account-service/delivery.ts` to seed two ciphertexts at
4 MiB + 16 bytes. Current code owns their retry, cold reopen and paginated read. This historical seed
does not relax the current R-01 admission bound.

Checkout fingerprints alone omit those historical bytes. The explicit adapter now records the
original reference, resolved full commit, path and source SHA-256 in the stage contract. Reads have
a five-second timeout and 2 MiB output ceiling. The owner checks these pins before launch or reuse
and after execution; they also enter the receipt key. Only reviewed Node case stages accept this
metadata. Other adapters, malformed/duplicate pins and unsupported locators refuse.

Synthetic Git replacement controls demonstrate the gap: historical bytes change while the checkout
fingerprint stays identical. Prelaunch and reuse refuse; a changed pin after explicit replanning
produces a different receipt key. A fixture whose case passes while changing its historical source
still receives a failed, drained receipt. This is a cooperative pre/post input check, consistent with
the existing source owner, not protection against hostile or transient changes. Planning pins only
the explicitly reviewed historical dependencies.

## Controls and retained artifacts

All **114 non-native runner/control tests** pass: 88 pure census/adapter tests, 21 ownership controls
and five actual Vitest controls, with **3,360 generated control histories**. Binary IPC is tested
with a `Uint8Array` round trip: intentional worker death drains normally; a leaked fork fails despite
a passing case report. The Vitest archive retains thirteen complete receipts: three expected passes
and ten required failures. Eleven native ownership controls retain previous evidence.

The first new reuse control expected `reused: false`; fresh receipts omit that field. Its assertion
is corrected and both logs are retained. An initial generic formatter invocation included the
deliberately compact generated manifest. Corrected scoped style and exact writer-layout checks pass;
the manifest was not reformatted. `pnpm typecheck` stalled without starting the compiler and was
terminated (exit 143); the direct local TypeScript command passed. No product test needed repair,
retry, population reduction or a longer deadline.

`summary.json` records actual input digests, timings, raw output location and artifact hashes.
`selection-receipts.json.gz` retains every stage contract, receipt, report, log and ownership event.
Historical pins, 61 selected source/helper pins, exact source patch (including the new helper),
product-test preservation and all 128 prior contracts / 1,206 identities are checked and retained.
Raw full input bytes remain in the recorded ignored output directory; their archive hash is retained.

Planning, authority, signature, whitespace, scoped style and direct typecheck pass. General
selections now contain **136 files / 1,258 cases: 96 Vitest and 40 Node files**. The 128 prior files
retain earlier execution evidence; they were not rerun in this phase. The manifest has 612 obligations
and 281 unresolved rows: 122 test-file (106 Node, sixteen Playwright), 96 command and 63 campaign.
Its 588,519 bytes remain below the unchanged 700 kB ceiling. Release execution correctly refuses.

All 21 personal/package files, 31 prior vectors and L-2 remain unchanged. No personal server,
profile, Account, origin or routing was used. Historical review/evidence, formal debts and signing
backups are unchanged. Subsequent documentation/evidence edits do not turn this bounded selection
into an immutable aggregate, workload/platform qualification or release approval.
