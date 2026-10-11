# Incremental Account default activation

Based on signed `9586c7a0ba8ed09d5eb39d4a80ad06f27f88ea64`. This is a bounded integration
decision, not a new performance measurement or release-validation campaign. The public deployment
was not changed. [Source hashes](./source.json) and the [runtime/configuration patch](./runtime.patch)
identify the candidate.

## Decision and prerequisites

Enable incremental ledger verification and the corresponding Account editor snapshot path together
in ordinary builds. The [correctness repair](../2026-10-11-account-correctness/README.md) restored
exact installed-epoch equivalence, enforced verified-view ownership and handled declined self-read
decisions. The [request repair](../2026-10-11-account-requests/README.md) removed successful-submit
readback amplification and isolated session budgets. Its bounded typing probes met the no-429 and
convergence guards. Enrollment's repeated authority-change retry was repaired in `95923cd8`.

Those prerequisites, plus the focused default/rollback checks below, support making the existing
candidate the ordinary path. They do not establish that all latency goals are met. In particular,
the earlier measurements still leave cold-open growth, accepted-prefix byte retention, repeated
loads/copies, maintenance cost, peer-hint discovery/read amplification and rows per typing burst
as separate opportunities.

## Default, rollback and retained checks

One pure policy now selects both Account paths. An unset or empty `VITE_ACCOUNT_LEDGER`, or the
explicit value `incremental`, selects incremental verification and Account editor snapshots.
`reference` selects full ledger verification and the reference editor path. An invalid value fails
the build instead of silently choosing a path. The native fixture omits the define when no override
is supplied, so its default checks exercise absence rather than an explicit opt-in.

The Vite configuration validates the setting at build startup; the private migration configuration
continues inheriting that policy. Docker now accepts the optional `VITE_ACCOUNT_LEDGER` build
argument. See [runtime instructions](../../public-runtime.md#container-boundary). For rollback:

```sh
VITE_ACCOUNT_LEDGER=reference pnpm build
```

For a container, add `--build-arg VITE_ACCOUNT_LEDGER=reference` to the normal image build with its
required revision/date arguments. This changes compiled JavaScript, not service runtime state.
Publish the replacement through the ordinary application-update path. A running container's
environment cannot change an already cached application. Both builds use the same persistent format;
no schema migration, data restore or clearing of local writing is required.

Cold opens still perform full verification. Existing invalidation/fallback checks are unchanged.
Production retains the full reference audit: after at least 1,024 newly observed records since the
last audit, a verification that adds a content state row triggers it. This is tied to compaction,
not a wall-clock timer or an audit of every append. Reopening sooner still performs cold verification.
An audit disagreement emits `done/account-ledger-reference-mismatch`, throws `repair-required`,
invalidates the view and closes the owner. The default exposes no `__doneLedgerMetrics` global.
`VITE_ACCOUNT_LEDGER_AUDIT=every` remains available for focused diagnostics.

## Focused evidence

- [16 unit tests](./unit.log): build-policy defaults/override/refusal, verified-buffer ownership,
  invalidation and the existing incremental/reference comparisons.
- [Seven native checks with no mode flag](./native-default.log), with reference audit on each
  append: receipt progression, lost reply, both transaction-abort boundaries, serialized readers,
  retained-store rollback and audit disagreement. The rollback check opens the same account under
  reference → default → reference → default, edits and compacts in each, and verifies cold replay
  and the actual incremental/full counters. The audit control injects disagreement only in the test
  bundle, observes refusal/reporting, refuses further spool access, and recovers acknowledged writing
  through an unmodified cold open. It tests the failure response, not a naturally occurring mismatch.
- [Four reference-mode native checks](./native-reference.log): the same normal receipt, lost-reply
  and transaction-abort cases, including confirmation that incremental verification never runs.
- [Three packaged browser journeys](./packaged-history.log) with mode, audit and profiling flags
  unset: repeated single-device snapshots/lost publication; two-device approval, installation retry,
  offline reopen and two-way delivery; returning-editor catch-up after service pruning with local
  writing preserved. Existing deadlines were unchanged. These are disposable desktop profiles and
  loopback services, not a physical-phone or public-deployment walkthrough.
- [Default build](./build-default.log) and [reference build](./build-reference.log) pass. The
  intentionally misspelled override [fails at configuration load](./build-invalid.log), as required.
  TypeScript, targeted lint, formatting and diff checks pass. The patched Yjs check, initial bundle
  budget (136.6 KiB of 350 KiB for each entry), and origin-isolation scan pass on the default package.

The ordinary package was built into a disposable source directory; this worktree's existing `dist`
and running installations were left alone. Temporary service databases, keys, browser profiles and
credential traces are not part of this packet. The initial type-check caught the migration fixture's
object-only config inheritance; it was updated for the new mode-aware callback before these builds.

## Reproduce

From this source, using the locally installed tools:

```sh
node node_modules/vitest/vitest.mjs run test/accountLedgerMode.test.ts test/verifiedRecords.test.ts test/incrementalLedger.test.ts
env -u ACCOUNT_LEDGER_MODE -u VITE_ACCOUNT_LEDGER ACCOUNT_LEDGER_AUDIT=every \
  node --test --test-name-pattern='retained Account writing|reference audit disagreement|one owner advances|lost submit answer|native (submission|response) abort|concurrent Account readers' test/account-sync/native.test.mjs
ACCOUNT_LEDGER_MODE=reference node --test \
  --test-name-pattern='one owner advances|lost submit answer|native (submission|response) abort' test/account-sync/native.test.mjs
```

Build the ordinary app with mode/audit/profiling flags unset, then run:

```sh
node node_modules/@playwright/test/cli.js test --config playwright.packaged-account.config.ts test/packaged-account/history.spec.ts
```

The packaged fixture owns ports 53221/53222; run it alone from the chosen source directory with its
own `dist`. An archive without `.git` needs explicit `APP_BUILD_REVISION` and `APP_BUILD_DATE` when
building. Native tests use their own disposable services.

## Next

Commit and publish through the normal reviewed application/container/infrastructure path so the
public installation receives the improvements. This local integration is not publication. Afterward,
measure the remaining bottlenecks against the activated path; the older reference measurements must
not be presented as current production performance. Release validation remains paused.
