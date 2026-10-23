# done — Development

How to run, build and test the project. **What the code is** is [codebase.md](./codebase.md); **where the
project stands** is [progress.md](./progress.md).

## Running it

```
corepack enable
pnpm install
pnpm dev            # http://localhost:5173, also on the LAN
pnpm dev:account-setup # private account setup/access preview at http://localhost:53210
pnpm test:account-setup # isolated first-device account browser checks
pnpm dev:tailscale  # trusted HTTPS/WSS over MagicDNS; starts the whole stack
pnpm build          # typecheck, bundle, and enforce the §12 budget
pnpm lint           # opt-in; oxlint bug-catchers (correctness) only — not part of `pnpm check`
pnpm format         # opt-in; oxfmt check, code files only — markdown is never formatted
pnpm vectors        # regenerate the TRD §15 test vectors
pnpm vectors:check  # fail if any vector file has drifted, or any AAD field is untested
pnpm vectors:coverage  # just the AAD coverage half of the above
pnpm check          # typecheck, vectors, document checks, traceability, WASM, unit and geometry tests
pnpm test           # unit tests
pnpm test:geometry  # layout, line-height and pixel-identity tests, needs a browser
pnpm exec playwright test --config playwright.compiler-loading.config.ts # dev compiler and cache restart regressions
pnpm test:latency   # TRD §12's latency budgets, measured; not part of `pnpm check`
pnpm test:https     # production build, service worker, offline shell and real WSS proxy
```

The [first-device account preview](./first-device-account-setup.md) runs a dedicated
loopback service with persistent development state. It supports setup, account
selection and offline unlock; device linking and sync remain unavailable. Its
account entry is separate from the ordinary production bootstrap.

`pnpm test:geometry` builds and previews the app, then drives Chromium. The
Playwright matrix has a real desktop browser profile (`Desktop Chrome`) and a
mobile emulation profile (`Pixel 7`); it is not only a small viewport. Where a
Chromium is already on disk and `pnpm exec playwright install` is not wanted,
set `CHROMIUM_PATH` to it.

`pnpm vectors` writes [`test/vectors/`](../test/vectors/) from the generators in
[`scripts/`](../scripts/), one file per selected TRD §15 row. **The generators
are the executable half of the selection documents** in
[selections/](./selections/): each verifies itself on every run — round-tripping
every vector, asserting every negative still fails to authenticate, and checking
its published must-fail list against what it actually asserted — so the failure
is loud rather than a file that quietly stops matching its own specification.
`pnpm vectors:check` is the same run without the write, and it is part of
`pnpm check`. **If it fails, regenerate rather than editing the JSON**: the file
is output, and a hand-edited vector is a specification with no generator behind
it.

`pnpm vectors:coverage` asks the question the paragraph above cannot: not
whether every published negative still fails, but whether the negatives **cover
every field the AAD binds**. It runs each generator once per bound field with
that field removed from the AAD, and watches which negatives stop failing — a
negative that stops differed from the base vector in that field and nothing
else, and a field where none stops is bound by the construction and tested by
nothing. It is part of `pnpm vectors:check`. **Generators are discovered by
glob**, so a new `scripts/generate-*-vectors.mjs` is audited without being added
anywhere; one that does not call `reportAudit()` from
[`scripts/lib/aad-coverage.mjs`](../scripts/lib/aad-coverage.mjs) fails rather
than being skipped.

`pnpm test:latency` is a **separate Playwright config** and a separate
discipline. It measures rather than asserts, so it runs one worker with no
parallelism and no retries — two measurements at once measure the contention,
and a retried measurement is a second sample reported as the first. Its mobile
profile adds a 4× CPU throttle, because emulation alone changes the viewport and
the user agent and nothing else. It is **deliberately absent from `pnpm check`**;
`pnpm latency:record` turns a run into rows for
[performance.md](./performance.md), which is where the method and the numbers
live.

Some rows cannot be taken that way at all. A CPU throttle stalls the thread
rather than modelling a slower core, so its stalls land inside individually
timed operations and become the tail — which makes any budget written as a p95
of _one_ operation unmeasurable on an emulated profile. Those need hardware:

```
node scripts/bench-journal-device.mjs
```

It serves the journal benchmark at `/` and the cipher comparison at `/cipher`,
and prints the two ways to reach it from a phone. Both need an origin the
browser considers trustworthy, because **cross-origin isolation is what buys
the 5 µs clock instead of 100 µs** and a 12 µs write is invisible at the latter:

```
adb reverse tcp:4180 tcp:4180
```

```
tailscale serve --bg --https=8443 4180
```

The first gives the phone `http://localhost:4180`, which is trustworthy without
a certificate. The second serves the MagicDNS URL over TLS to the tailnet only —
remember `tailscale serve --https=8443 off` afterwards. Each page reports
whether it got the fine clock _before_ it will measure, and the cipher page
refuses to run at all unless every candidate reproduces the published vector.
Results post back and land in the same file `pnpm latency:record` reads.

The relay is a separate package with its own install, and the app never depends
on it:

```
cd relay
pnpm install
pnpm test           # starts the real process and drives the real client
RELAY_TOKEN=$(openssl rand -base64 32) pnpm dev
```

Then **menu → Sync** in the app: endpoint `localhost:1234`, room `done`, token
as above. In development that becomes `ws://localhost:1234` — a page served
over plain HTTP may open a plain websocket, so there is no certificate to
arrange. See [relay/README.md](../relay/README.md) for the development table, for
deployment and TLS, and for why the token must stay out of your access log.

For trusted cross-device development, connect the machine to Tailscale, enable
MagicDNS and HTTPS certificates for the tailnet, then run `pnpm dev:tailscale`
from the repository root. No separate `tailscale serve` command is needed: the
runner first checks or provisions this machine's certificate, then starts a
foreground Serve proxy, Vite and the relay, and stops all three together. It
prints the full `https://<machine>.<tailnet>.ts.net` app URL and sync settings
only after that exact HTTPS URL has answered successfully.

If certificate issuance fails, the command exits before publishing the app.
Check the device's **TLS certificate** status in the Tailscale Machines page;
`No certificate found` means the HTTPS endpoint cannot complete a handshake.
Do not leave a browser retrying the URL while diagnosing ACME issuance, because
each failed first-use attempt can create another certificate order.

Tailscale terminates trusted HTTPS/WSS on port 443 and forwards plain HTTP to a
loopback-only Vite. Vite removes the public `/relay` prefix and forwards that
WebSocket to the loopback-only relay. Neither development process is directly
reachable from the LAN or tailnet. Existing service-scoped Tailscale Serve
routes are independent; the runner refuses to replace a pre-existing
node-level web route. Enabling Tailscale HTTPS publishes the machine's
`*.ts.net` certificate name in certificate-transparency logs, but does not make
the service public.

`pnpm test:https` requires OpenSSL and Chromium. It creates an ephemeral leaf
certificate and grants only its fresh browser process access to that key, while
still performing real HTTPS and WSS handshakes. It does not depend on
Tailscale, mkcert or a host trust-store change.

### Recording a performance measurement

`pnpm build` enforces the initial-JS budget (TRD §12) and fails the build when it is exceeded. To turn a
measurement into a row for [performance.md](./performance.md):

```
pnpm budget --record
```

That prints an append-ready table row with the current commit. Recording is manual on purpose — appending
on every build would write a row per local rebuild. See [performance.md](./performance.md) for why the
history is checked in, and why the plaintext baseline has to be taken before Stage 1.

## Development tooling

This project uses pnpm (`packageManager` pins the expected pnpm release).
`pnpm-workspace.yaml` sets `minimumReleaseAge: 10080`, so installs wait seven
days after a package version is published before accepting it. The lockfile was
generated under that policy; a couple of transitive peer overrides are pinned
there so `pnpm peers check` stays clean.

Linting and formatting use the oxc.rs toolchain, **deliberately dialed back for
the remediation phase** (2026-08-28): Oxlint runs correctness rules only, plus
the React plugin, and Oxfmt never touches markdown — `.prettierignore`, which
oxfmt reads, excludes `*.md` because reflowing the TRD breaks the §15.1
register parser. Neither is part of `pnpm check`; both are opt-in. The broad
type-aware rule set and repository-wide formatting can return when the phase
changes.

React Compiler is enabled in Vite through `@vitejs/plugin-react`'s
`reactCompilerPreset()` and `@rolldown/plugin-babel`. React 19 is already in use,
so no runtime shim is needed. Babel's include filter limits compilation to source files under
`src`; optimized dependencies must not be compiled again when a rehearsal or test cache lives
outside `node_modules`. The compiler-loading browser regressions exercise both the ordinary and
private-migration configurations with fresh and retained caches, verify compilation remains active,
and retain Local writing through reload and dev-server restart. It has one consequence worth knowing about before
writing a component here — see "reading the document" below.

## Source snapshots and historical harnesses

A frozen-source campaign must copy and hash its complete runtime input graph. The legacy import,
selection, cleanup and coordinator campaigns include `account-protocol` alongside `src`; resolving
missing files from the live checkout would invalidate their snapshot and mutation evidence.

Native Vite adapters use `scripts/lib/emitted-bundle.mjs` to retain every emitted chunk and asset under
its emitted filename, record hashes, and import the actual entry. An arbitrary first chunk is not a
complete executable artifact. The scheduler controls bundle the real mutated production entry with
its dependencies; their original mutation anchors and prohibited-invocation assertions remain.

`historical-bundle.mjs` rebuilds production source from a full pinned Git revision, with isolated source
paths and a recorded module graph. It checks historical runtime dependency declarations against the
current checkout's declarations and records both lockfile and source identities. This rebuild uses
the current installed toolchain; it is not a reconstruction of a historical binary. Browser bridges
invoke genuine old owners while current raw-census observers can remain separate. The original v8
revision also predates v2 admission: its positive control runs the original service/creation fixture
and owner together, rather than rewriting modern signed receipts. Source-identity checks independently
compare archive contents with Git blob identities, including a fresh output-directory check.

Focused commands for these additional regressions:

```
node --test --test-concurrency=1 test/account-successor/emitted-bundle.test.mjs test/account-admission-bounds/historical-closure.test.mjs
node --test --test-concurrency=1 test/account-receive/historical-owner.test.mjs
```

The normal CI build job runs these three cases after Chromium installation; its operator-resumed
quality job is unchanged. These direct functional checks do not provide aggregate execution credit. New files stay required and
blocked until their runtime denominator, subprocess/browser ownership and retained evidence are reviewed.
The rebuilt existing historical fixtures also need review of expanded archive/module-report custody in
their aggregate adapters. Their previous narrow historical-module pins do not attest the entire new
source closure. A direct native pass does not close that adapter obligation or authorize qualification.

## Unit-suite resource budget

The default Vitest gate runs at most two independent test files concurrently. This
keeps its file-level resource budget explicit across developer machines and CI.
Every case and existing case deadline remains; explicit concurrency exercised
inside a case is unchanged. A filtered or capped exploratory command is not a
substitute for the full `pnpm test` population. CI pins Node 24.18.0; record the
actual runtime and keep failed attempts when comparing results. This worker
budget is not a performance measurement or release-qualification result.

## Release bookkeeping

Pausing generalized release qualification does not pause the routine contract and bookkeeping
checks. The command population for **Check security contracts and published vectors** lives in
[the CI workflow](../.github/workflows/ci.yml); each command's implementation lives in
[package.json](../package.json). Run that surface before calling a candidate ready, together with
the release inventory/adapters and traceability checks appropriate to the changed files.

Presentation changes can invalidate the runtime authority census too. Review changed source,
domain sites and classification before explicitly refreshing it with
`node scripts/account-crypto-prep/run.mjs --record`; a recorder is not a substitute for that review.
Keep evidence in the established repository evidence directories, decisions and outcomes in their
append-only journals, and active work in the owning seat's progress document. Optional tools and
their storage conventions do not replace these homes. Finish bookkeeping before minting
tree-bound execution receipts, and rerun the relevant checks after the tree changes.
