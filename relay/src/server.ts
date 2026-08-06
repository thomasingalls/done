/**
 * The relay (TRD §2, §7.2).
 *
 * A dumb pipe. It carries opaque binary updates between this person's devices,
 * holds no authority, runs no application logic, understands nothing about
 * days, cards or the freeze, and can be switched off without the app noticing.
 * Every decision that matters happened in the client; this process exists
 * because two devices that are never online at the same time still have to
 * exchange bytes.
 *
 * It is deliberately one small process:
 *
 *   - one HTTP server, for the upgrade and a health check
 *   - one websocket server, whose connection handler is upstream's
 *   - one authorization decision, in `auth.ts`
 *   - one file per room, in `persistence.ts`
 *
 * Terminating TLS is not its job. Put it behind a reverse proxy that has a
 * certificate — see README.md. The bearer token is only as private as the
 * transport it travels over.
 */

import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { docs, setPersistence, setupWSConnection } from '@y/websocket-server/utils';
import { authorize, redactUrl, type RelayPolicy } from './auth.js';
import { filePersistence, flush, type Persistence } from './persistence.js';

const port = Number(process.env['PORT'] ?? 1234);
const host = process.env['HOST'] ?? '0.0.0.0';
const dataDirectory = process.env['RELAY_DATA_DIR'] ?? '';

const policy: RelayPolicy = {
  token: process.env['RELAY_TOKEN'] ?? '',
  rooms: (process.env['RELAY_ROOMS'] ?? '')
    .split(',')
    .map((room) => room.trim())
    .filter((room) => room.length > 0),
};

// A relay reachable from the internet with no token is a document anyone can
// read and write. Refusing to start is the only version of that warning that
// cannot be scrolled past.
if (policy.token.length === 0 && process.env['RELAY_ALLOW_ANONYMOUS'] !== 'yes') {
  console.error(
    'relay: RELAY_TOKEN is not set. Set one, or set RELAY_ALLOW_ANONYMOUS=yes if this\n' +
      '       endpoint is genuinely unreachable from anywhere you do not control.',
  );
  process.exit(1);
}

let persistence: Persistence | null = null;
if (dataDirectory) {
  persistence = filePersistence(dataDirectory);
  setPersistence(persistence);
}

const websockets = new WebSocketServer({ noServer: true });

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok\n');
    return;
  }
  // Nothing else is served. This is not a web server, and an endpoint that
  // answers anything else is an endpoint someone will point a browser at.
  response.writeHead(404, { 'content-type': 'text/plain' });
  response.end('not found\n');
});

server.on('upgrade', (request, socket, head) => {
  const decision = authorize({ url: request.url, headers: request.headers }, policy);

  websockets.handleUpgrade(request, socket, head, (connection: WebSocket) => {
    if (!decision.ok) {
      // Completing the handshake and closing with a code, rather than refusing
      // the upgrade: a browser cannot read the status of a failed upgrade, and
      // a client that cannot tell "wrong token" from "no signal" retries a
      // typo forever (see auth.ts). Nothing is sent before the close.
      console.warn(`relay: refused ${redactUrl(request.url)} — ${decision.reason}`);
      connection.close(decision.code, decision.reason);
      return;
    }

    console.log(`relay: ${decision.room} connected`);
    connection.once('close', () => console.log(`relay: ${decision.room} disconnected`));
    setupWSConnection(connection, request, { docName: decision.room });
  });
});

server.listen(port, host, () => {
  console.log(`relay: listening on ${host}:${port}`);
  console.log(`relay: token ${policy.token ? 'required' : 'NOT required'}`);
  console.log(`relay: rooms ${policy.rooms.length > 0 ? policy.rooms.join(', ') : 'any'}`);
  console.log(`relay: state ${dataDirectory ? `in ${dataDirectory}` : 'in memory only'}`);
});

const shutdown = (signal: string): void => {
  console.log(`relay: ${signal}, closing`);
  // Flush first: the debounce that keeps disk writes off the message path is a
  // few seconds of state to lose if the process just exits.
  if (persistence) flush(persistence, docs);
  for (const connection of websockets.clients) connection.close(1001, 'relay restarting');
  server.close(() => process.exit(0));
  // A client that ignores the close still holds a socket open. The state is
  // already on disk by this point, so the deadline costs nothing.
  setTimeout(() => process.exit(0), 3_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
