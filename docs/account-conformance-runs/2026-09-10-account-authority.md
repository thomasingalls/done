# Private authority root and Local preflight — 2026-09-10

Base: signed `0f1a073`. [Contract and promotion-write prep](../account-authority.md).
[Source pins](./2026-09-10-account-authority/sources.json),
[summary](./2026-09-10-account-authority/summary.json),
[log](./2026-09-10-account-authority/run.log),
[JUnit](./2026-09-10-account-authority/results.xml).

`node scripts/account-authority/run.mjs` (`pnpm account:authority`) passes all **13 tests** in
11.62 seconds, below its 120-second deadline. Raw artifacts are under
`test-results/account-authority/2026-09-10T15-22-59.610Z`.

| Coverage | Evidence |
| --- | --- |
| Four directed root cases | Independent Node Ed25519 reconstruction of fixed bootstrap bytes; sealed-root cold open; exact pin/policy/nonce; wrong factor, tamper, missing state and unknown versions; no reinitialization; private-file/symlink checks; before/after commit failure |
| Generated root histories | 160 histories, seed 9172026, up to 25 operations; independent live/readable ledger, corruption/restore, close/reopen, wrong operator key, competing initialization, substituted response and nonce replay |
| Process boundary | SIGKILL before and after root commit, cold recovery in new children, plus two real processes racing exclusive initialization; exactly one winner, no implicit replacement |
| Two acceptance controls | Resolving the pin from the response accepts a self-signed attacker root; trusting the returned nonce accepts a captured response for a different request; baseline refuses both |
| Native directed preflight | Real Local genesis/custody, journal-only writing, cold replay and unreadable dependency refusal; independently pinned proof route; repeatable context after reload; authenticated imported-claim fixture; exact before/after carrier inventory; wrong code starts no network call; admitted-carrier refusal; HTTP origin gate |
| Native cancellation | Aborted preflight retains exclusive slot ownership until the pending network attempt settles, then a second tab acquires it |
| Generated native histories | 40 histories, seed 9182026, up to eight operations; page reload, disk/journal edits, wrong factor and repeated preflight; exact retained-byte inventory stays unchanged on reads and the recovery context remains stable |

The [pin](./2026-09-10-account-authority/control-pin.json) and
[nonce](./2026-09-10-account-authority/control-nonce.json) control records contain only synthetic public
pins, signed responses and acceptance outcomes. They demonstrate actual bad acceptance after guard
removal, not a parser failure. The final generated campaigns found no counterexample.

The preliminary native test page inherited the inert account adapter's `default-src 'none'` policy,
which correctly prevented the Local journal's WebAssembly from compiling. The cancellation case then
waited for a network callback the failed local check never reached. The disposable **app test page**
now permits `wasm-unsafe-eval`; the private API adapter retains its restrictive policy. This was harness
configuration, not a production defect discovered by the generated histories. Preliminary output was
returned through the tool, not preserved as a complete campaign directory.

The imported-claim case signs synthetic imported provenance onto a valid Local fixture; it tests this
preflight's authenticated claim path. It does not rerun the importer, source cleanup or the author's
personal migration. The read-only result is a proposed context, not evidence of completed promotion,
account eligibility, checkpoint coverage or actual service admission.

[Core regressions](./2026-09-10-account-authority/core-regression/summary.json) pass all **30 tests**,
including 240 generated histories and ten process-death cases. [Recovery regressions](./2026-09-10-account-authority/recovery-regression/summary.json)
pass all **25 tests**, including 160 generated histories, six process-death cases and browser restart/
renderer crash. All **825 existing unit tests in 73 files** pass in 35.08 seconds.

[Static checks](./2026-09-10-account-authority/static-checks.json) record TypeScript, focused lint and
formatting. [Final gates](./2026-09-10-account-authority/final-gates.json) record isolated app budget/
origin isolation and governance/traceability. The build lives under this run's `app-build`, with the
budget adapter's `dist` symlink isolated in `build-checks`; the personal `dist/` and verified
`.dev/releases/17d87c2/app` remain intact. The complete check chain was not run, and no debt/matrix
status changed. Evidence hashes are in the [manifest](./2026-09-10-account-authority/manifest.json).

The personal preview and relay remain off. No real pin, operator secret, account, passkey, recovery
code or Local write was provisioned. Trusted configuration distribution, durable promotion intent and
fresh device custody, genesis/epoch/index handoff, activation, encrypted sync and broader lifecycle
remain future owners; power-loss/hostile-restore and full device-matrix certification remain open.
