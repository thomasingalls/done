# Account disappearance: history audit and deployed-release upgrade reproduction

Date: 2026-10-16. This closes the bounded audit/reproduction, **not the disappearance investigation**. No product code, production browser storage, preview server or deployment was changed. The preceding three empty-legacy/startup repair patches remain byte-for-byte unchanged.

## Result

No recorded computer-use action targeted production or erased its accounts. The complete recorded removal was the disposable Local workspace in Firefox Developer Edition Private Browsing at `https://mbp.tail0e0d4.ts.net:8445/remove/local`, on October 15. The action and response say “Remove local data” / “Removed from this device.”

The actual previous-to-deployed release upgrade did not reproduce account disappearance. **Two scenarios passed, 48.4 seconds, no retries:** a separately created Account, and a protected Local workspace promoted to sync. Each was paired through the invitation flow with a second independent browser process and persistent profile. All four profiles kept their database/store identities, counts and serialized record digests, account slot and local-storage digests across the hard refresh that adopted the current app. Original factors unlocked the writing. Writing synchronized both ways before and after upgrade, and survived whole-browser restart and subsequent offline unlocking.

**Limits:** these were Chromium processes using the established repository virtual-passkey convention. There is no Firefox-specific upgrade result, physical-provider result or OS installation claim. The production Firefox account disappearance remains unexplained. The restarted browsers navigated online, then went offline before unlock; this is not evidence of entirely offline launch. An earlier attempt failed when offline was enabled during bootstrap; it is preserved below.

## Audit scope

All 42 parent-conversation turns, 3,177 command entries and 317 direct computer-use calls were inspected. All 317 direct calls were independently matched to their raw-session responses by call ID. Five linked delegated threads contain 138 command entries and no computer-use calls. See [scope](./history-audit-scope.json), [corrected direct-call audit](./computer-use-audit-v2.json), [delegated audit](./delegated-thread-audit.json) and the compressed action index.

The arguments refer to localhost:53241 and Tailscale ports 8443, 8444 and 8445. Responses also mention localhost:5173 and the Tailscale hostname without a port. Neither arguments nor responses name `done.oxidationlabs.com`. The parent command review searched production/profile/browser-attachment access and inspected candidates; it is not a formal proof of every possible shell side effect. History cannot exclude unrecorded activity, browser eviction/storage failures, a different Firefox profile/container, or earlier account history.

The original raw-session parser incorrectly matched only the short tool name and counted zero calls. That result was rejected against the independent 317-call history census; namespace-aware parsing recovered all calls. `rejected-initial-audit.json` preserves the discarded result. The full private conversation and raw computer-use outputs were not copied here.

## Exact release inputs and procedure

- Previous source: `890fc6770cfdfff164dbda43c2f8040a1998a8dc`; 109 extracted production frontend files match the prior publication manifest.
- Current deployed source: `faf465f7255f2df8c5c2f0fac6c8d74e2e2450c2`; all 108 extracted frontend files match the current publication manifest. This excludes the unsigned empty-placeholder repair candidate.
- All tracked runtime sources under `src/` and `scripts/`, plus package/TypeScript manifests, compare byte-for-byte against their respective Git revisions: 582 previous and 600 current inputs. Source inventories and [verification](./source-verification.json) bind the runtime and helper identities. Both use the installed locked dependency tree and Node v24.18.0. The Chromium package manifest records version 151.0.7922.34; it is package metadata, not an independently measured binary version.
- A disposable localhost:53221 gateway and localhost:53222 sync backend ran the **complete old source**, not just the old frontend on a current backend. Account creation, passkeys, recovery setup, device comparison/approval, encryption and sync used actual application owners. Only authenticator hardware was simulated through CDP.
- Distinct persistent Chromium profile directories were created for original/joined devices. Each installed an activated, controlling old service worker, reopened and unlocked before the baseline. Both wrote Goals text and observed the other device's text.
- Both old service processes stopped. Both restarted from current deployed source against the same disposable service-state directory; the service pin was asserted unchanged. Old documents stayed open during the server change.
- After discovering a waiting update, CDP `Page.reload({ignoreCache:true})` performed the hard refresh. The observer awaited navigation and recorded unique document identities, storage snapshots, first module-script URL and worker/cache state. Both actual runs adopted current assets on this first hard refresh. The script contains an unused fallback for explicit waiting-worker activation; it was not needed in these runs.
- Before unlock, an independent comparison finds **all observed database names, versions, stores, counts, key digests and serialized-value digests unchanged**, including custody and the single account slot. Local-storage keys/value digests are unchanged. The UI version was asserted as `faf465f7` after original-factor unlock. Both-way writing still synchronized.
- Both whole browser processes closed; profile directories were retained. Virtual authenticator credentials stayed in test-process memory and were restored on reopen; no application storage was copied or reconstructed. Reopening navigated online, then disabled networking before original-factor unlock. Both browsers displayed every before/after writing value. This is retained offline-unlockable data after restart, not an entirely offline navigation test.

There are 40 metadata snapshots and 2,549 browser events across the final two scenarios. API instrumentation recorded no database deletion, object-store clear or local/session-storage clear after server stop. This is document instrumentation, not a browser-internal storage trace. No claim is made that no unrelated metadata transactions occurred.

`mainScript` in raw snapshots is the **first module-script URL**, not necessarily the application entry module. `new-app-locked-before-offline-verification` is a retained stage label: the final run is still online at that stage. Raw runner summaries saying “reopening offline” have the narrower sequencing described above. CryptoKey serialization hashes descriptors (algorithm/type/extractability/usages), not nonexportable raw key material; original-factor unlocking separately establishes that retained keys remained usable. Binary/ciphertext values are fully hashed.

## Preserved inconvenient results

1. **Initial worker control:** the old worker was activated but did not control the initial page. The first attempt stopped before upgrade. The corrected probe performs an old-version lock/reopen navigation and proves control before the baseline.
2. **Refresh observer race:** old accounts/sync and the complete server restart passed, but an observer evaluated inside the departing document and received “Execution context was destroyed.” No data-loss result follows. The corrected probe awaits navigation and records per-document IDs.
3. **Early offline unlock:** the original browser completed the current-app hard refresh with every database/store and local-storage digest unchanged, and the account was still present. Enabling offline before asynchronous bootstrap reached the unlock UI led to “Could not unlock this workspace. Check your device-lock code and try again.” The cause remains unresolved. The successful final scenario instead stays online through initial app adoption/unlock and separately checks offline unlock after whole-browser restart. It does not erase or resolve this failed control.

Each attempt retains its executed source, runner log, metadata observations/events and limitation record. Full test profiles, service databases/operator keys and raw error-context snapshots stay outside the repository. There is no production account material in this packet.

## Recheck and rerun

Run the independent snapshot comparison without launching browsers:

```sh
python3 docs/development-evidence/2026-10-16-account-upgrade-investigation/verify-observations.py
```

Its assertions read the compressed final snapshots/events and establish [the qualified comparison](./verified-refresh-boundary.json). `SHA256SUMS` identifies this packet. The probe and helper copies under `probe/` are archived as text to avoid ordinary test discovery or aggregate qualification credit.

The executed local probe was:

```sh
PATH=/private/tmp/done-node24-runtime/node-v24.18.0-darwin-arm64/bin:$PATH \
  /private/tmp/done-node24-runtime/node-v24.18.0-darwin-arm64/bin/node \
  /private/tmp/done-onboarding-publish-faf465f7/source/node_modules/@playwright/test/cli.js \
  test --config /private/tmp/done-disappearing-account-upgrade-2026-10-16/playwright.upgrade-incident.config.mjs
```

Do not blindly rerun it against retained directories: it expects empty disposable profile/state directories and fixed free ports. Preserve the existing attempts, prepare new isolated scratch paths, restore exact archived release sources/frontends and adjust the archived config/probe paths. The local profiles/state contain disposable credentials and must not enter source control.

The next discriminating experiment is a separately bounded normal-Firefox persistent-profile upgrade, with an independent second browser and equivalent refresh/storage observations. If that also passes, reproduce older account histories and profile/container context. Neither step is claimed complete here. General release qualification remains paused; no deployment is authorized by these results.
