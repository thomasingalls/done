# Private Account index handoff and startup — bounded evidence

Parent: signed `beed8cf` (`Admit private genesis and retain authenticated first-epoch receipt`).
[Contract](../account-handoff.md). This component selects the existing encrypted store as Account,
preserving its principal, workspace, database, content key, generation and counters. A private owned
startup API classifies the selected store offline. It returns metadata after releasing its permit;
an Account editing lifetime is the next component. The default editor and relay remain disconnected.

## Evidence

The `account:handoff` runner completed at
`test-results/account-handoff/2026-09-10T18-04-28.332Z`: **21 tests pass in 85.58 seconds**, with no failed,
cancelled or skipped tests and no campaign timeout. It ran as `node scripts/account-handoff/run.mjs`,
the package script's exact target. The campaign has a 120-second deadline and streams progress to disk.

- The service derives a signed row-12 binding from the admitted registration's current confirmed
  credential. Independent Node/OpenSSL verification checks the root signature over separately encoded
  LP bytes. Restart produces the same binding. Wrong capability, pending account, changed credential
  state and inconsistent stored COSE/SPKI refuse; a change after signing prevents stale issuance.
- **60 generated service histories**, seed `9252026`, compare issuance, activation, restart and wrong
  capability commands against a separate eligibility ledger. These test service state, not Yjs replay.
- Native handoff checks the retained receipt, exact source checkpoint, both saved content factors,
  current signed binding and a fresh passkey assertion. A v4 authenticated prepared carrier precedes
  strict index compare-and-replace; a selected carrier follows its acknowledgement. Tests abort before
  and kill the renderer after each of the three commits, then cold-resume the exact result. A held
  native acknowledgement keeps a cancelled owner's competing permit blocked until drain.
- **24 generated native histories**, seed `9272026`, vary writing/deletion, database versus journal
  persistence, reversed delivery, aborted handoff commits, lost binding replies, wrong assertions and
  repeated cold retries. An independent text model and OpenSSL checkpoint replay retain source meaning;
  separate inventories allow changes only to the promotion marker and target index row. Each selected
  result cold-classifies with network blocked and no recovery code. Histories stop on failure without
  unbounded shrinking; generated inputs and outcomes are preserved.
- A real `navigator.credentials.get` call against a disposable Chromium CDP virtual ES256 authenticator
  completes handoff and offline startup. Its WebAuthn DER signature reaches the production verifier.
  This tests browser encoding and integration, not the author's personal or platform authenticator.
- **200 generated OpenSSL DER signatures**, seed `9262026`, are converted by the production parser and
  independently verified as P1363. Malformed sequence/integer lengths, padding, signs, truncation and
  trailing data refuse. Message generation is seeded; OpenSSL key/signature randomness is not. The
  actual public key, messages and signatures are saved in `generated-der.json` for exact replay.
- Missing, closed, changed or regressed index routes, missing custody/provenance, damaged progress,
  wrong factor and replayed passkey nonce refuse without repairing or exposing the store. The actual
  committed `beed8cf` promotion reader and ordinary Local APIs refuse v4. Repeated successful startup
  classifications leave durable inventory unchanged.
- **Two observed bad-acceptance controls**: disabling the local passkey guard actually selects and
  classifies with an invalid assertion; disabling service COSE/SPKI consistency actually root-signs a
  substituted credential key. Normal code refuses each. Control artifacts record accepted outcomes.

Affected regressions refreshed against the final source:

| Campaign | Passing result |
| --- | --- |
| Account core | 30 tests |
| Recovery preparation | 25 tests |
| Authority/preflight | 14 tests |
| Promotion preparation | 18 tests |
| Genesis candidate | 17 tests |
| First admission | 34 tests |
| Writer lifetime | 13 native cases; five deliberate faults detected |
| Local genesis | 17 native cases; four deliberate faults detected |
| Local clear | 17 native cases; five deliberate faults detected |
| Owned startup | 15 native cases; three deliberate faults detected |
| Existing unit suite | 825 tests in 73 files, 51.06 seconds, two workers |

TypeScript, focused lint/format, isolated application build and 13 final repository/build gates pass.
Initial JavaScript is **328.2 / 350.0 kB**. Build output remains in the handoff run's `app-build`, with
an isolated `build-checks/dist` symlink. The retained personal `dist/` and
`.dev/releases/17d87c2/app` were not overwritten. This was not a full `pnpm check` invocation.

[Preserved inventory](./2026-09-10-account-handoff/manifest.json) includes exact source hashes, logs,
JUnit, generated histories/signatures, observed controls, regressions, findings, unit/build/static
output and final gates. `runs.json` identifies original run directories. Artifacts use disposable
test credentials and documents; no personal account was provisioned.

## Findings and corrections

The real ES256 ceremony exposed an existing verifier defect: WebAuthn supplies DER, while WebCrypto
expects fixed-width r || s. The old unit fixture used `subtle.sign`, reproducing the verifier's raw
format assumption. The committed `beed8cf` verifier fails the real browser assertion with
`assertion-signature-invalid`; that directed before log is preserved. Strict DER conversion repairs
the boundary. The unit fixture now uses independent OpenSSL DER, and the real browser after-test
passes. Binding and challenge bytes are unchanged. The new binding parser also initially omitted the
uncompressed-point `04` byte from its ES256 SPKI shape; the same directed test caught that refusal.

Storage regressions exposed an unnecessary eager import of an account protocol comparison helper into
shared Local census. Copied Local harnesses do not load the account modules, so module loading failed.
The helper was replaced with the identical local comparison; initial runners were terminated after
their module failures and logs are retained. Final Local genesis and clear campaigns pass. The owned
startup regression also expected `repair-required` where the existing future-schema check returns
`app-update-required`. Its expectation/title now match that behavior while retaining no-rewrite and
no-exposure assertions; its before report and passing final report are preserved.

These were directed integration/review findings, not discoveries by the generated histories. The
final generators found no additional counterexample. Controls demonstrate the represented guards,
not completeness of the protocol or test model.

## Limits and next boundary

The original Local claim remains authenticated provenance behind the promotion interlock. It is not a
selectable duplicate. The two database commits are coordinated by retained prepared/selected progress,
not a cross-database atomic transaction. Startup still checks the original frozen genesis; ongoing
Account edits require a new owned lifetime and persistence contract before that source may evolve.

Next is Account editing/writer lifetime integration: acquire and retain the slot permit, authenticate
the selected store and fresh passkey, admit journal-backed edits, and drain/erase on lock or shutdown.
Its cold reopen must preserve later edits without treating the original genesis checkpoint as the
entire current state. Encrypted relay, account UI and fresh adoption by the author's actual old second
device follow. That device will not import or merge its old writing.

This evidence does not establish whole-protocol, power-loss, profile-clone/rollback, offline revocation
freshness, full platform-matrix, production pin distribution/restore or encrypted convergence safety.
Account epoch evolution, close/delete and full recovery remain open. No debt or selection-matrix status
changes. The personal preview and relay remain stopped.
