# Development compiler loading with isolated optimizer caches

**2026-10-15 — bounded repair verified; implementation uncommitted.** The operator first requested
the approved account fixture commit, then this repair and new regressions, with no old-test edits
without approval and no merge/deployment. Signed fixture commit
`86e830c83e7d410443237a8bdeafc7d3f6e9663c` is complete and its SSH signature verifies. Preview
`fcb659c3`, backend and user data remain untouched. Aggregate qualification remains paused.

## Contract and cause

Both ordinary and private-migration development configurations must mount the app with a fresh
optimizer cache outside `node_modules`, retain the compiler in application code, and retain Local
writing through reload and server restart. A cache whose path happens to contain `src` is still
optimizer output. Existing custody, compatibility, authority, crypto and removal behavior remains.

The dependency trace identifies the invalid named `c` import in the HTTP response for optimized
TanStack Router, while ordinary source responses correctly use Vite's CommonJS interop. Babel's
default dependency exclusion catches `node_modules` but misses custom cache directories. It
recompiles the optimized dependency and adds the React Compiler import. Vite intentionally skips
ordinary-source interop inside optimizer output; its compiler-runtime module exports a default.
The earlier explicit `needsInterop` override fails because that metadata was already present.

The repair anchors Babel's include filter to the actual `src/` directory derived from this config's
URL, with escaped path segments and both separator forms. It keeps the React Compiler preset and
ordinary dependency exclusions. No dependency upgrade, compiler disablement or runtime shim is
introduced. No application, account-service or account-protocol source differs from the signed base.

## Regression evidence and failures retained

- Both new browser cases fail before repair, with the missing named export retained in their error
  attachments. The diagnostic process's earlier zero exit after recording an app error is never
  treated as an app pass.
- A first generic `src`-segment include passes ordinary custom caches. Moving the test cache under
  an unrelated `src` directory makes both cases fail again. The first candidate patch and failures
  are retained. The final anchored filter passes both cases on that same misleading cache path.
- The two final regressions verify compiler-generated application calls, first mount, saved writing,
  reload, dev-server restart on the same origin, and byte-identical retained optimizer metadata.
  Both ordinary and private-migration configs are exercised without skips or retries.
- The unchanged migration walkthrough initially passes three cases and times out twice at the old
  Local-editor `Device-lock code` field locator, after loading succeeds. The initial Goals-related
  guess was corrected by the actual report. No Goals locator is changed.
- The operator approves the exact [four-line locator patch](reproduction/private-migration-unlock-fixture.patch).
  Only Local-editor locators change to `Unlock code`; migration and cleanup-dialog labels, all five
  tests, wrong-code and recovery checks, complete storage comparisons and deadlines remain.
  All **five** full walkthrough cases pass on the final configuration, including cleanup, crash,
  resumed import, cold opening and later writing. All **eight** unchanged packaged onboarding cases
  pass on the final built artifact. Together with the new regressions this is **15 browser passes**.
- The full unit population passes **151 files, 1,779 cases and one existing named skip**, with two
  workers and unchanged deadlines. The default-worker timeout issue remains open.
- Build/typecheck, required Yjs patch, origin isolation, budget (**231.6/350 kB**), scoped lint,
  new-test typecheck and formatting checks pass. The initial standalone TypeScript command refuses
  TS5112; its corrected `--ignoreConfig` invocation passes. Both logs are retained.
- All **38** affected inventory, CI and census regressions pass. The normal CI job now runs the new
  browser tests. The operator-resumed CI job is byte-identical to the signed base.

## Approval, identity and handoff

The [old-test boundary](old-test-boundary.json) independently checks that the one modified old file
matches the exact approved proposed hash. No other old test changes. The inventory policy adds
only the new required browser family; all pre-existing entries remain identical. Normal inventory
and manifest checks pass with **847 obligations and 306 unresolved obligations**. The new family's
aggregate runtime-denominator/process-ownership adapter still requires review; direct CI/browser
passes do not close that qualification obligation or resume the aggregate.

The [artifact index](artifact-index.json) retains **59 hashed artifacts**, including original errors,
failed counterexamples, final reports, source/build pins and reproduction material. [Results](results.json)
separate observation from passing execution. Logs and base64 text attachments normalize workstation
paths and redact disposable factor patterns. Profiles, databases, downloaded recovery files and real
vault material are not copied. The final build is identified in [build pins](build-pins.json); it is
not installed on the preview or published. New source/regressions and four approved locator changes
remain uncommitted.

Local Node is 26.11.1; CI Node 24 and a new Firefox/Bitwarden walkthrough were not run. The original
85-command full-suite baseline and its unrelated failures remain open. The outcome was appended to
`docs/completed.md` before advancing this packet state. The other seat's `docs/progress.md` is
untouched. No push, merge, preview refresh, deployment or aggregate qualification occurred.
