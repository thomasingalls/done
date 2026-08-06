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
| Protocol        | `y-websocket`, via upstream's `@y/websocket-server` connection handler           |
| Auth            | one shared bearer token, over TLS you terminate in front of it (`src/auth.ts`)   |
| Rooms           | one per document; `RELAY_ROOMS` optionally pins the list                         |
| State           | one file per room, written on idle and on last disconnect (`src/persistence.ts`) |
| Everything else | not its business                                                                 |

## Running it

```sh
pnpm install --no-optional     # its own workspace: the app does not depend on this
pnpm build
RELAY_TOKEN=$(openssl rand -base64 32) pnpm start
```

Or with Docker:

```sh
echo "RELAY_TOKEN=$(openssl rand -base64 32)" > .env
docker compose up -d --build
```

Then in the app: **menu → Sync**, endpoint `wss://your-host`, room `done`,
token as above. Do the same on the other device with the same token, and the
two devices are syncing.

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
provider the app uses, and asserts the four things the app depends on: two
devices converge; a device that was offline while the other wrote catches up on
connect; a wrong token is refused with a close code the client can turn into a
sentence; and the document survives a restart of the relay.

The app's own suite does not start servers. It tests the authorization
decisions directly (`test/relayAuth.test.ts` there imports `src/auth.ts` here)
and everything else about sync against an injected transport.

## Why upstream's connection handler

`@y/websocket-server` is the forkable descendant of the server that used to
ship inside `y-websocket`, and its `setupWSConnection` is the sync and awareness
message loop. Reimplementing it would be inventing a local-first technique,
which PRD §12 lists as a non-goal. It is pinned at `0.1.1`, the last release
built against Yjs v13; `0.1.2` moved to Yjs v14, which is the same migration
`y-codemirror.next` is waiting on (TRD §10.1) and should happen at the same
time, on both sides of the socket at once.
