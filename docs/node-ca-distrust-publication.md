# Node 24.22.1 for the eMudhra CA distrust — publication handoff

Prepared 2026-10-30 from signed source `410221adf55e2a6259c484fc3eddd6ba65b11ab4`, branch
`node-24.22.1` from main `f7447878` (PR #59). This is an ordinary application update that changes
only the Node runtime; no application code changes.

## Changes and evidence

The private keys of eight eMudhra intermediate CAs are recoverable from their certificates
(CVE-2026-111943, <https://emudhra.we-have-a-problem.com/>), so anyone on the network path could
impersonate any host to a client that trusts them. The service uses Node's built-in root store.
Node 24.22.1 updates it to NSS 3.131.1 and rejects the compromised intermediates.

- `Dockerfile`: the `dependencies` base moves to `node:24.22.1-bookworm-slim@sha256:be8204d4…605c`.
  The runtime copies its Node binary from that stage, so build and runtime both move.
- CI `node-version` pins and the runtime-version assertions in
  `scripts/smoke-public-container.mjs` and `scripts/test-runtime-image.mjs` move to 24.22.1.

Node's own `fetch` against the tracker's test hosts: 24.18.0 connects to the emSign chain;
24.22.1 rejects both the emSign and the AAA cross-signed chains as `CERT_REVOKED`, in the base
image and in the built runtime, while ordinary hosts still verify.

## Immutable candidate

- Local image: `done-public:410221adf55e`, `linux/arm64`, Node 24.22.1.
- Local index: `sha256:ad463efe357065bf227f47bb557496feda1b79acdb824ba04a3f36d5dc80d8af`.
- Built as documented in [public runtime](./public-runtime.md) from a clean checkout of the signed
  commit; the four build-stage suites pass (16, 10, 6 and 6 tests).
- The final-image harness passes runtime/gateway, backup, restore and maintenance.
- The disposable two-container smoke passes, including precache responses, SIGKILL/restart
  ownership and identity, and graceful stop.

Browser journeys and broader validation campaigns were not run: the operator scoped this release
to the runtime upgrade.

## Publication, compatibility and rollback

Schemas, wire formats, initialization, migrations and browser storage are unchanged.

1. Merge the application PR with a merge commit.
2. Publish this exact tested image as `ghcr.io/thomasingalls/done:410221ad`. Verify the remote
   index and ARM64 manifest, private visibility and authenticated pull.
3. Prepare the ol-infra PR changing only the image pin in
   `infra/apps/done/components/runtime/kustomization.yaml`.
4. After the operator merges, reconcile with the infrastructure Justfile commands, verify
   readiness, public assets and backup health, then confirm a phone edit round-trip.

The currently deployed image is `sha256:f81bd4ba3621fc5c1fd28979d22c9605d522fd6ba5cf7b06eafde63cd2459872`
(source `b6f0160a`). Reverting the pin is an ordinary rollback; it restores trust in the
compromised CAs.
