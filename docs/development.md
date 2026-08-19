# done — Development

How to run, build and test the project. **What the code is** is [codebase.md](./codebase.md); **where the
project stands** is [progress.md](./progress.md).

## Running it

```
corepack enable
pnpm install
pnpm dev            # http://localhost:5173, also on the LAN
pnpm dev:tailscale  # trusted HTTPS/WSS over MagicDNS; starts the whole stack
pnpm build          # typecheck, bundle, and enforce the §12 budget
pnpm lint           # oxlint with React, TypeScript, a11y, import, promise, and Vitest checks
pnpm format         # oxfmt formatting check
pnpm vectors        # regenerate the TRD §15 test vectors
pnpm vectors:check  # fail if any vector file has drifted from its generator
pnpm check          # typecheck, lint, format, vectors, unit and geometry tests
pnpm test           # unit tests
pnpm test:geometry  # layout, line-height and pixel-identity tests, needs a browser
pnpm test:latency   # TRD §12's latency budgets, measured; not part of `pnpm check`
pnpm test:https     # production build, service worker, offline shell and real WSS proxy
```

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

Linting and formatting use the oxc.rs toolchain: Oxlint is configured with
type-aware rules plus React, React performance, JSX accessibility, import,
promise, and Vitest plugins, and Oxfmt owns repository formatting. Warnings are
currently allowed because enabling the broad rule set surfaced follow-up cleanup
work in the scaffolded code; errors fail `pnpm lint`.

React Compiler is enabled in Vite through `@vitejs/plugin-react`'s
`reactCompilerPreset()` and `@rolldown/plugin-babel`. React 19 is already in use,
so no runtime shim is needed. It has one consequence worth knowing about before
writing a component here — see "reading the document" below.
