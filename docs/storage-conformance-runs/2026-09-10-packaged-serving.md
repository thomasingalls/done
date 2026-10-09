# Packaged serving and personal offline verification — 2026-09-10

The personal import checkpoint is signed commit `8db7070`. The author explicitly requested keeping the
build in this worktree and its server in the current Codex session. No durable host/service installation
or relocation is part of this phase. The five personal recovery/export files and four private verification
records were copied into a new dated folder beside the earlier backups and checked byte-for-byte.
Originals remain in the worktree, ignored by Git; private paths and hashes stay in `.dev/`.

Preparation exposed a build defect before changing the personal server. The old service-worker generator
ran during `generateBundle` and listed two entry chunks that Vite's HTML plugin subsequently removed.
The preview server's HTML fallback returned a successful response for those nonexistent URLs. The original
[two browser checks passed](./2026-09-10-packaged-serving/before-browser.json), while the new
[file-existence regression failed](./2026-09-10-packaged-serving/before-manifest-check.json) on a missing
entry chunk. The [original worker](./2026-09-10-packaged-serving/before-sw.js) records that faulty list.

The generator now reads final output in `writeBundle`, including copied public icons and the manifest.
Both application HTML entries must exist. Cache versions include each asset's bytes as well as names,
so fixed-name HTML/public assets can invalidate the cache. The worker itself is excluded from that hash/list.
Runtime storage, custody and admission were not changed.

| Check | Result |
| --- | --- |
| Final-file/fixed-name content regression | [One passing unit test](./2026-09-10-packaged-serving/unit.json); changed manifest and HTML bytes change the cache version while asset paths stay fixed |
| Native packaged campaign | [Three passing cases](./2026-09-10-packaged-serving/native.json): every cache URL matches a real file and exact HTTP response bytes; both app entries open a new tab offline, accept an offline edit, and recover it after another lock/close/reopen |
| Build, TypeScript, focused lint/format, budget and origin isolation | Passed; both ordinary entries remain at 326.6 kB gzip against 350 kB |
| Personal URL, read-only HTTP checks | All ten precache URLs plus the worker match this build's bytes; private recovery/utility/dev-client paths yield no private content; relay WebSocket connection is rejected without sending document data |

An initial unit fixture attempted a nested Vite build inside Vitest and failed during fixture HTML output
resolution ([diagnostic](./2026-09-10-packaged-serving/unit-fixture-before.json)). It was replaced with a
controlled final-file test for versioning; the native campaign separately exercises the actual full build
and server. That fixture failure is not credited as an application defect. No property campaign or full
runtime suite was added or rerun for this build-only repair.

After the author confirmed the workspace was locked and all app tabs/windows closed, the development
server was stopped and Vite preview was started in the Codex session on loopback port 8082, serving this
worktree's `dist/`. The existing Tailscale root route and unrelated service route were left intact. Relay
proxy environment switches were unset and only the existing personal hostname was additionally allowed.
The new [worker](./2026-09-10-packaged-serving/after-sw.js) lists only existing static files, including icons
and the web manifest. The [manifest](./2026-09-10-packaged-serving/manifest.json) pins the source/build/reports.

The author then loaded the package online at the original origin, unlocked the existing Local workspace
and confirmed the writing was present. The preview server was stopped; an independent HTTP request
returned 502. With that backend still unavailable, the author confirmed cached reopening and a later edit
surviving lock, tab close, normal reopen and unlock. The author also observed a failed forced refresh
against the stopped server and a successful subsequent normal refresh. This does not establish cache
deletion. The author operated the personal browser throughout; this result is reported by the author,
not an independently inspected export of the offline edit or a claim about all browser/profile failures.

The same preview server was restarted in this worktree/Codex session. HTTPS requests to the application
entry and worker returned 200 and matched the existing build bytes. Detailed process and verification
records remain in ignored `.dev/` files. The bounded personal packaged cutover is complete, with its repair
and evidence awaiting commit. Plaintext source cleanup, general host exclusion, whole-profile residue,
broader platform evidence and independent review remain separate.
