/** Faults live at the server boundary, so real Worker requests see them too. */
import { createServer, request as forward } from 'node:http';
import { startDevelopmentAccountServer } from '../../account-service/development-server.ts';
import { startAccountGateway } from '../../scripts/lib/account-gateway.mjs';
import {
  decodeInboundBatch,
  INBOUND_BATCH_REQUEST_LIMIT,
} from '../../account-protocol/inboundBatch.ts';
import { decodeInboundRequest } from '../../account-protocol/inboundTransport.ts';
const origin = 'http://localhost:54371';
export async function service(directory, packaged) {
  const backend = await startDevelopmentAccountServer({
    directory,
    port: 54374,
    policy: { origin, rpId: 'localhost' },
    networkSessions: true,
    membershipContinuation: true,
  });
  let withheld = false,
    dropped = 0,
    forwarded = 0;
  const streams = [];
  const batches = [];
  const sockets = new Set();
  const proxy = createServer((request, response) => {
    const trace = { publisher: '', ready: 0, dropped: 0, forwarded: 0 };
    const batch = {
      code: 0,
      reader: '',
      requests: [],
    };
    if (request.url === '/account/delivery/read-v2-batch') {
      const chunks = [];
      let size = 0;
      request.on('data', (chunk) => {
        size += chunk.length;
        if (size <= INBOUND_BATCH_REQUEST_LIMIT) chunks.push(Buffer.from(chunk));
      });
      request.once('end', () => {
        const bytes = Buffer.concat(chunks),
          sample = new Uint8Array(bytes);
        let inner = [];
        try {
          if (size > INBOUND_BATCH_REQUEST_LIMIT) return;
          inner = decodeInboundBatch(sample);
          const requests = inner.map(decodeInboundRequest);
          batch.reader = requests[0].reader;
          batch.requests = requests.map((r) => ({
            publisher: r.publisher,
            after: r.after,
            limit: r.limit,
          }));
        } catch {
          /* The real service, not this observation, classifies invalid input. */
        } finally {
          for (const b of inner) b.fill(0);
          sample.fill(0);
          bytes.fill(0);
          for (const b of chunks) b.fill(0);
        }
      });
      batches.push(batch);
    }
    if (request.url === '/account/notifications/v1/subscribe') {
      let body = '';
      request.on('data', (chunk) => {
        if (body.length <= 4096) body += chunk.toString('utf8');
      });
      request.once('end', () => {
        try {
          const scope = JSON.parse(body);
          if (scope.kind === 'workspace' && /^[a-f0-9]{32}$/.test(scope.credentialId))
            trace.publisher = scope.credentialId;
        } catch {
          /* Observation only; the real service still classifies the original body. */
        }
      });
    }
    const outgoing = forward(
      {
        host: '127.0.0.1',
        port: 54374,
        path: request.url,
        method: request.method,
        headers: request.headers,
      },
      (incoming) => {
        batch.code = incoming.statusCode;
        response.writeHead(incoming.statusCode, incoming.headers);
        if (incoming.headers['content-type'] !== 'text/event-stream') {
          incoming.pipe(response);
          return;
        }
        streams.push(trace);
        let pending = '';
        incoming.setEncoding('utf8');
        incoming.on('data', (text) => {
          pending += text;
          for (let end; (end = pending.indexOf('\n\n')) >= 0;) {
            const frame = pending.slice(0, end + 2);
            pending = pending.slice(end + 2);
            if (withheld && /^event: (hint|content)\n/.test(frame)) {
              dropped++;
              trace.dropped++;
            } else {
              forwarded++;
              trace.forwarded++;
              if (frame.startsWith('event: ready\n')) trace.ready++;
              response.write(frame);
            }
          }
          if (pending.length > 4096) response.destroy(Error('Unexpected notification framing'));
        });
        incoming.on('end', () => {
          if (pending) response.write(pending);
          response.end();
        });
        incoming.on('error', () => response.destroy());
        response.once('close', () => incoming.destroy());
      },
    );
    outgoing.once('error', () => response.destroy());
    response.once('close', () => outgoing.destroy());
    request.pipe(outgoing);
  });
  proxy.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  try {
    await new Promise((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(54372, '127.0.0.1', resolve);
    });
    const app = await startAccountGateway({ port: 54371, origin, servicePort: 54372, packaged });
    return {
      withhold(value) {
        withheld = value;
      },
      counts: () => ({
        dropped,
        forwarded,
        streams: streams.map((s) => ({ ...s })),
        batches: batches.map((b) => ({ ...b, requests: b.requests.map((r) => ({ ...r })) })),
      }),
      async close() {
        await app.close();
        for (const socket of sockets) socket.destroy();
        await new Promise((r) => proxy.close(() => r()));
        await backend.close();
      },
    };
  } catch (error) {
    for (const socket of sockets) socket.destroy();
    if (proxy.listening) await new Promise((r) => proxy.close(() => r()));
    await backend.close();
    throw error;
  }
}
