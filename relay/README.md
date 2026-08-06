# done — relay

A dumb pipe carrying opaque binary updates between one person's devices
(TRD §2, §7.2). It holds no authority, runs no application logic, understands
nothing about days or cards, and **the app is complete without it**: with no
endpoint configured the client never constructs a provider, never loads the
transport, and works exactly as it did in Phase 2.

It is also **not a backup**. Every device holds a full replica and the app's
markdown export is the backup story (TRD §7.2, §10.5). Deleting this relay's
state directory loses nothing that isn't already on a phone and a laptop.

## What it does

| Concern         | Decision                                                                         |
| --------------- | -------------------------------------------------------------------------------- |
| Protocol        | `y-protocols` sync and awareness, in a message loop forked from upstream         |
| Auth            | one shared bearer token, over TLS you terminate in front of it (`src/auth.ts`)   |
| Rooms           | one per document; `RELAY_ROOMS` optionally pins the list                         |
| State           | one file per room, written on idle and on last disconnect (`src/persistence.ts`) |
| Everything else | not its business                                                                 |

## Running it

```sh
pnpm install     # its own workspace: the app does not depend on this
pnpm build
RELAY_TOKEN=$(openssl rand -base64 32) pnpm start
```

Four dependencies, no build step beyond `tsc`, and nothing native — so it runs
on whatever Node you have.

Or with Docker:

```sh
echo "RELAY_TOKEN=$(openssl rand -base64 32)" > .env
docker compose up -d --build
```

Then in the app: **menu → Sync**, endpoint `wss://your-host`, room `done`,
token as above. Do the same on the other device with the same token, and the
two devices are syncing.

## In development, where there is no certificate

`pnpm dev` serves the app over plain HTTP, and a page served over HTTP is
allowed to open a plain `ws://` connection. So the development answer is that
there is nothing to set up:

| In the endpoint field  | What happens                                                                |
| ---------------------- | --------------------------------------------------------------------------- |
| `localhost:1234`       | becomes `ws://localhost:1234` — no certificate involved, and it works.      |
| `ws://localhost:1234`  | the same thing, spelled out.                                                |
| `wss://localhost:1234` | fails. Nothing on localhost has a certificate; the app says so.             |
| `0.0.0.0:1234`         | refused. That is the address the relay _listens_ on, not one to connect to. |

The app defaults a bare hostname to `wss://` — the token is a bearer credential
— but makes one exception: **bare loopback on a page that is itself insecure
becomes `ws://`**, because that combination is a laptop in development and
nothing else. A LAN address or a real hostname still gets `wss://`.

To reach the relay from a phone on the same network, load the app from the
laptop's LAN address (`pnpm dev` already listens there) and use the same
address for the relay: `ws://192.168.1.x:1234`. The scheme has to be typed —
that is not loopback, and the app will not quietly downgrade a credential onto
a network. **The token crosses that network in cleartext**, so use one you are
willing to throw away, and keep the real one for the deployment behind TLS.

If you need HTTPS end-to-end in development anyway — a service worker wants a
secure context, so anything PWA-shaped on a phone does — put both the app and
the relay behind one local reverse proxy with a certificate from `mkcert`, and
the deployment section below applies unchanged.

## Configuration

| Variable                | Default            | Meaning                                                                 |
| ----------------------- | ------------------ | ----------------------------------------------------------------------- |
| `RELAY_TOKEN`           | —                  | The shared bearer token. **Required**, see below.                       |
| `RELAY_ROOMS`           | any                | Comma-separated allowlist of room names.                                |
| `RELAY_DATA_DIR`        | in-memory          | Where to keep each room's state. Unset means a restart forgets it.      |
| `RELAY_ALLOW_ANONYMOUS` | `no`               | `yes` to start without a token. Only for an endpoint nothing can reach. |
| `HOST` / `PORT`         | `0.0.0.0` / `1234` | What to listen on.                                                      |

The process refuses to start with no token unless `RELAY_ALLOW_ANONYMOUS=yes`.
A relay reachable from the internet without one is a document anyone can read
and write, and a warning that can be scrolled past is not a warning.

## TLS, and where the token goes

Browsers cannot set headers on a websocket, so the token travels as a query
parameter — `wss://host/done?token=…`. Two consequences, and neither is
optional:

1. **Terminate TLS in front of this.** Over `ws://` the token is in cleartext on
   the wire. The client defaults a bare hostname to `wss://` for this reason;
   plain `ws://` is available for a LAN box but you have to type it.
2. **Do not log the query string.** TLS protects the token in flight, not from
   your own access log. This process routes every logged URL through
   `redactUrl`; your reverse proxy needs telling separately.

A Caddy front end, which is two lines and gets a certificate on its own:

```caddyfile
relay.example.com {
	log {
		format filter {
			request>uri query {replace: token REDACTED}
		}
	}
	reverse_proxy 127.0.0.1:1234
}
```

## Tests

```sh
pnpm test
```

Starts the real process the way the Dockerfile does, connects the real client
provider the app uses, and asserts what the app depends on: two devices
converge; awareness arrives and is cleared again when a device leaves; a device
that was offline while the other wrote catches up on connect; a wrong token is
refused with a close code the client can turn into a sentence; and the document
survives a restart of the relay.

The app's own suite does not start servers. It tests the authorization
decisions directly (`test/relayAuth.test.ts` there imports `src/auth.ts` here)
and everything else about sync against an injected transport.

## Why the message loop is a fork

`src/connection.ts` is `@y/websocket-server`'s `setupWSConnection` (MIT, Kevin
Jahns), typed and trimmed. Depending on the package was the first choice, and
it did not survive contact with a laptop.

`@y/websocket-server@0.1.1` — the last release built against Yjs 13, which is
what the client is pinned to (TRD §10.1) — imports `y-leveldb` at the top of
the module, unconditionally, for a persistence backend this relay does not use.
`y-leveldb` pulls in `leveldown`, a native module. Where a prebuilt binary
exists for the running platform and ABI that is invisible; on Node 26 and an
arm64 Mac, none does, and the relay does not start:

```
Error: No native build was found for platform=darwin arch=arm64 runtime=node abi=147
```

No install flag fixes it. The import is static, so the module loads whether or
not the package is wanted, and skipping optional dependencies only changes
which of the two failures you get. The release that removed the import also
moved to Yjs 14 — a migration this codebase makes on both sides of the socket
at once or not at all.

Upstream's README describes this server as living in a forkable repository, and
this is that fork. What is being _not_ reinvented is still not reinvented: the
protocol is `y-protocols/sync` and `y-protocols/awareness`, imported, at the
same versions the app uses. What the fork drops is the leveldb backend, the
HTTP callback machinery, and the environment variables that configured them —
none of which this relay was using. What it gains is that its dependencies are
four packages of plain JavaScript, and the Yjs 14 migration happens when the
client's does.
