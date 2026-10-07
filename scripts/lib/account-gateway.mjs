/** Immutable application plus a fixed loopback API proxy; no account keys or database owners. */
import { createServer, request as httpRequest } from 'node:http';
import { packagedApplication } from './packaged-application.mjs';

function proxyAccountRequest(request, response, servicePort) {
  // Forward only framing and the client's authority inputs. Never invent an Origin,
  // Authorization or forwarded-host claim, follow redirects, or retry a lost reply.
  const headers = {};
  for (const key of ['host', 'origin', 'authorization', 'content-type', 'content-length'])
    if (request.headers[key] !== undefined) headers[key] = request.headers[key];
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const upstream = httpRequest({
    hostname: '127.0.0.1',
    port: servicePort,
    path: request.url,
    method: request.method,
    headers,
    agent: false,
  });
  const unavailable = () => {
    request.unpipe(upstream);
    upstream.destroy();
    if (response.writableEnded || response.destroyed) return;
    if (response.headersSent) return response.destroy();
    response.writeHead(503, { 'Content-Type': 'application/json' });
    // The outcome may already be durable. Only the existing operation owner may retry.
    response.end(JSON.stringify({ ok: false, refusal: 'service-unavailable' }));
  };
  upstream.setTimeout(15000, unavailable);
  upstream.on('error', unavailable);
  upstream.on('response', (reply) => {
    reply.on('error', unavailable);
    for (const key of ['content-type', 'content-length'])
      if (reply.headers[key] !== undefined) response.setHeader(key, reply.headers[key]);
    response.writeHead(reply.statusCode);
    reply.pipe(response);
  });
  request.on('error', () => upstream.destroy());
  request.on('aborted', () => upstream.destroy());
  response.on('close', () => upstream.destroy());
  request.pipe(upstream);
}

export async function startAccountGateway({ port, origin, servicePort, packaged }) {
  if (port === servicePort) throw Error('Account service needs a distinct loopback port');
  const host = new URL(origin).host;
  const serve = packagedApplication(packaged);
  let closing;
  const server = createServer((request, response) => {
    // closeIdleConnections at shutdown misses responses still in flight. Reap
    // them as they finish, and stop admitting polls on existing keep-alive sockets.
    response.once('close', () => {
      if (closing) server.closeIdleConnections();
    });
    if (closing)
      return void response
        .writeHead(503, { 'Cache-Control': 'no-store', Connection: 'close' })
        .end();
    if (request.headers.host !== host)
      return void response.writeHead(403, { 'Cache-Control': 'no-store' }).end();
    if (request.url.startsWith('/__account-setup/') || request.url.startsWith('/account/'))
      return proxyAccountRequest(request, response, servicePort);
    serve(request, response);
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', accept);
  });
  return Object.freeze({
    port: server.address().port,
    close: () =>
      (closing ??= new Promise((accept) => {
        server.close(accept);
        server.closeIdleConnections();
      })),
  });
}
