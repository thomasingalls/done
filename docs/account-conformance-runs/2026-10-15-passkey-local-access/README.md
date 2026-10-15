# Passkey compatibility and independent Local access

**Date:** 2026-10-15 · **Baseline:** signed `42ebdd12de0edcae7a5cd51bd44c3266e914bfcf` ·
**Status:** implementation checkpoint approved for commit and local preview; bounded repairs and
automated checks pass; the verified candidate passes the actual Firefox-private/Bitwarden HTTPS
journey, but the original reported failure is unreproduced.

## Bounded outcome and governing contracts

Repair the reported Firefox-private/Bitwarden passkey failure and keep an otherwise eligible
protected Local workspace accessible with its established code when account setup fails.
PRD v9 §7.2 and its 2026-10-14 onboarding amendment, PRD's network-login lifetime rule,
TRD v8 §13.3, and SC-01/03/06/08 govern the boundary. Local code verification is not account
authentication. Registration responses still require the existing service verification; already
promoted Account workspaces retain their binding/passkey and lifecycle checks.

No storage/protocol version, cryptographic construction, trust root, CSP relaxation, factor
fallback or remembered unlock is selected. Removal UX, legacy cleanup, unissued-code routing,
charging for sync, general release qualification and publication are separate work.

The repository procedure can be adopted from this clean, signed baseline without rewriting earlier
commits or treating their focused tests as complete onboarding evidence. The other seat's
`docs/progress.md` document is retained. This packet holds this bounded repair's active state;
the durable outcome must be appended to `docs/completed.md` before closing it.

## Evidence selected before repair

1. Capture the actual failing stage in Firefox Developer Edition private browsing with the
   installed Bitwarden extension. Retain only non-secret browser/provider versions, exception
   name/stage, source identity and visible outcomes. No factors, raw credentials or vault data.
2. Add new serializer regressions for native and extension-provided registration/assertion results,
   including absent or throwing native JSON methods and exact binary field encoding. The existing
   verifier must accept a real resulting response and continue refusing altered proofs.
3. Add new production-coordinator cases proving that a correct factor plus a later setup failure
   is not reported as a bad factor; wrong factors remain refused before network work.
4. Exercise the real UI: preserve writing, fail/cancel passkey setup, leave setup, cold-open Local
   with the same code while offline, then resume the retained account attempt.
5. Complete the repaired Firefox-private/Bitwarden creation and assertion flow, then lock/reopen
   and check retained writing. A virtual authenticator or mocked response is not this exit.
6. Challenge relevant new guards with deliberate faults in disposable source copies, preserving
   failing baselines and counterexamples. Existing tests require explicit approval for any edits.

## Initial characterization

The preceding read-only diagnosis ran production modules in disposable Chromium and Firefox
contexts. With a complete protected Local workspace and a correct code, an injected later network
failure produced the wrong-code message although the same factor still verified the Local route.
A simulated extension credential without `toJSON()` reproduced the reported generic passkey error
before submission, with the Local factor still valid. These establish testable defects, not the
actual Bitwarden exception or proof that the user's particular Local state is recoverable.

The same probe characterized legacy-only removal and unissued-code routing, which remain outside
this repair. The original probe and all six non-secret observations are retained beside this packet.

## Current state and exit

The uncommitted repair explicitly encodes WebAuthn binary response fields without relying on native
credential `toJSON()`. Every existing verifier and proof requirement remains. A verified Local code
followed by a failed registration continuation now produces a retry state, keeps the code only in
the live owner, and offers ordinary independent Local opening. A resumed setup consumes its one-shot
live handoff and rechecks authority; a cold owner still requires its external code. There is no new
stored factor, fallback, remembered Local unlock, format, protocol or server-verifier change.

The new regressions demonstrate the compatibility and Local continuation defects, including a
candidate failure that exposed the previously unused handoff on resumption. They do **not** establish
that native JSON compatibility caused the operator's particular Bitwarden failure.

### Automated evidence

- All **149 Vitest files** pass: **1,763 passed, one existing named skip**. The new files contribute
  nine cases. Existing tests were neither edited nor removed.
- All **five new packaged browser cases** pass, including actual authenticator-signed bytes with
  absent/throwing JSON methods, wrong signed bytes refused by the unchanged service, cancelled setup,
  offline Local reload with the original code, and resuming the same attempt without another code.
- All **12 affected existing packaged browser cases** pass (welcome, removal races, recovery), and
  all **12 existing device-enrollment cases** pass. These are Chromium checks, not Bitwarden evidence.
- Three deliberate source faults in disposable copies fail for the intended assertions: native JSON
  dependency (**4 failed/5 passed**), wrong-code state (**2 failed/7 passed**), dropped handoff
  (**1 failed/8 passed**). The original mutation harness missed referenced TypeScript configs and
  loaded no tests; those failures remain alongside the corrected, discriminating runs.
- TypeScript, changed-file lint, Yjs, packaged origin isolation and initial-JS budget pass
  (**229.5/350 kB**). Six crypto-inventory tests and 17 existing registry/onboarding guard tests pass.
  The census refresh changes file hashes and adds the serializer source; domain assignments and
  all **78 specified / 13 open** construction obligations remain unchanged.

The logs preserve the failing baseline, first candidate failure, mutation harness errors and three
enrollment setup errors (invalid shortened revision; shared dependency-cache write permission;
loopback listen permission). The enrollment pass uses the full source revision, a local cache and
approved loopback execution. A missing `vendor-patches` file prevented a combined snapshot Yjs/build
check from starting; Yjs was then checked in the actual workspace and budget/isolation in the tested
snapshot. Passing retries do not supersede those limits.

[Candidate identity](candidate-identity.json) pins the exact tested source and build inventory.
[Log custody](log-custody.json) records original and retained log hashes; only absolute workspace and
dependency paths are normalized. Reproduction uses the normal commands below, with disposable state
and build directories. The source-snapshot and mutation scripts are retained; their fixed temporary
output paths must be unused when reproducing.

```sh
node_modules/.bin/vitest run
node_modules/.bin/tsc -b --noEmit
PASSKEY_TEST_BUILD=/private/tmp/done-passkey-access-candidate-build-2 \
  node_modules/.bin/playwright test --config playwright.packaged-account.config.ts \
  test/packaged-account/passkey-local-access.spec.ts
```

### Real provider and remaining exit

Firefox Developer Edition **158.0b2**, Bitwarden **2026.9.3**, private window, macOS
(Darwin 25.5.0), real installed extension, disposable `http://localhost:53241` service.
No virtual authenticator, verifier substitution, weakened CSP or persisted factor was used for the
real walkthrough. The operator unlocked the vault/Mac, approved test credentials and performed the
test-credential replacement. Three explicitly named disposable test vault items remain; no pre-existing
credential was changed.

1. The first delayed baseline creation saved a passkey but was refused as expired (HTTP 409).
   Non-secret diagnostic: `returned:true`, `jsonMethod:function`, `converted:true`. This is an
   expired attempt, **not** reproduction of the reported generic passkey error.
2. Renewed baseline creation and confirmation passed on Vite. With the candidate loaded, the original
   Local code opened the original writing and a verified live handoff resumed its retained setup.
3. Candidate Vite creation, confirmation, recovery verification, connection approvals and protected
   opening passed through Bitwarden. Lock plus reload required the same original code and another
   real assertion; the original writing was present.
4. A separate fresh-slot baseline creation and confirmation also passed under the packaged CSP.
   The non-secret creation diagnostic recorded HTTP **200**, native JSON conversion successful.
   This falsifies attributing this run's outcome to the packaged CSP difference.
5. After switching the localhost server to the candidate, the fresh slot resumed with its established
   code, confirmed recovery and completed all connection/opening approvals through Bitwarden. New
   writing survived lock, reload and code-plus-Bitwarden reopening. **Correction:** the loaded module
   was not independently observed there. The later HTTPS cache observation below means this run is
   retained as unattributed evidence, excluded from candidate credit.

The approved isolated HTTPS comparison used `https://mbp.tail0e0d4.ts.net:8444`, separate browser and
service storage, the same hostname/relying party as 8443, and the existing packaged CSP. The
[real-provider observations](real-provider-observations.json) retain exact module identities,
diagnostics, observed transitions, limits and cleanup verification:

1. A fresh protected Local list retained its writing. Baseline creation and confirmation passed
   through Bitwarden. Both native JSON conversions succeeded; the service returned **200**. The
   original generic failure did not reproduce with the same relying party.
2. Switching the isolated server to the candidate and reloading left Firefox controlled by the old
   service worker, running **`AccountSetupApp-CCfstx_P.js`**. That reload earns no candidate credit.
3. Independent `/local` entry opened the writing with the original code. The sidebar showed
   **Update ready / Reload to update**. Using that normal update action loaded the candidate; resource
   inspection explicitly observed **`AccountSetupApp-CZLK8i_E.js`**, matching the tested build hash.
4. The original code still opened the list. Its live handoff resumed retained recovery confirmation
   without another code field. Only the disposable unconnected attempt was then retired through the
   existing restart UI. The operator replaced its disposable test credential in Bitwarden.
5. On the verified candidate, real Bitwarden creation, confirmation, recovery verification,
   exact-list connection approval and protected opening all passed. The original writing was present.
   Lock plus page reload required the same original code and a real assertion; writing remained.
6. The added HTTPS route was removed. The cached app still loaded after a locked reload, required
   the original code and real Bitwarden assertion, and displayed the original writing alongside
   **Network login is unavailable. Your writing remains available offline.** No verifier or factor
   fallback was used.
7. The disposable workspace was left locked, both disposable services were stopped, and all Tailscale
   routes matched the pre-test observed configuration. Port 8443 still proxies to 53219. The three
   explicitly named test vault items remain; no pre-existing credential was changed.

The existing 8443 preview has not been restarted or modified. Its packaged frontend advertises
version `63da4600`; that metadata alone does not identify uncommitted input at build time. Its
separately running backend is in the other worktree; the WebAuthn verifier source file there has the
same SHA-256 as this branch. No other worktree was edited.

The verified candidate passes the requested actual-provider journey, including same-code Local
resumption, protected Account reopening and service-unreachable access. The original failure's cause
and resolution remain unestablished because the fresh HTTPS baseline also passed. Its next
discriminating evidence must come from the original failing retained state and exact failing stage;
fresh-workspace success does not prove that state recoverable. The full report is **not called fixed**.
The operator subsequently requested a commit of the tested implementation, an update of the local
8443 preview, and a full functional test run while retrying the original flow. That checkpoint is
recorded in `docs/completed.md`; it does not close the original report or grant release credit.
Removal/migration and unissued-code routing remain separate reported defects.
The paused release compiler will also need explicit admission of the two new unit files and one new
browser file, with any old census-fixture edits presented for approval. No tests are excluded to hide
that maintenance. General release qualification, merges and publication remain paused.
