# Account liveness evidence — 2026-09-12

[Assessment](../../review/implementation/account-sync-liveness.md) · [Protocol](../../account-sync-liveness.md)

- `campaign/`: corrected, passing run `2026-09-12T13-02-37.835Z`; 883 source hashes, raw logs, metrics,
  exact controller history, property histories, runtime versions/load and bundle hashes. One actual
  service read per idle observation is enforced. Generated WASM sources are included in the pins.
- `preliminary/`: earlier source-pinned run `2026-09-12T12-56-22.761Z`. Test exit status passed, but each
  idle observation contains two reads (setup plus ordinary). Do not use it as one-poll cost. Supplemental
  WASM hashes were checked against the signed baseline; they were not in that runner's original census.
- `pilots/`: unfrozen development measurements. The first growth pilot used inserts only and counted
  all retained rows in coverage size, not just replayed content; its ordinary comparison still wrapped
  crypto. The second pilot checked held fetch and expiry. These do not establish final-source results.
- `analysis.json`: descriptive extraction of corrected counts/timings. Raw samples remain authoritative.
- `preservation.json`: unchanged personal files, prior vectors and historical review/L-2 checks.
- `artifact-manifest.json`: SHA-256 of archived raw evidence and supplemental records, excluding itself.

All workspaces, passkey assertions, text, services and browser contexts were synthetic/disposable.
No personal writing or factor was used in this campaign. Inclusive nested durations overlap. These files support
mechanism findings and a repair boundary, not a release capacity, complete protocol, physical-residue
or supported-platform security claim. No default-app cutover or runtime optimization was performed.

To repeat: `pnpm account:liveness`, or directly `node scripts/account-liveness/run.mjs`. A local
loopback listener and installed Playwright Chromium are required. Also run `node scripts/check-yjs-patch.mjs`
to verify the installed patched dependency. Dated test-results directories keep failures/timeouts.
