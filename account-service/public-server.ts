/** The API stays loopback-only behind the same-pod application gateway. */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { openPublicAccountService } from './public-runtime.ts';
import type { PublicStateOptions } from './public-state.ts';

export async function startPublicAccountServer(
  options: PublicStateOptions & { pinFile: string; port: number },
) {
  const service = openPublicAccountService(options);
  let closing: Promise<void> | undefined;
  const server = createServer(
    { headersTimeout: 10000, requestTimeout: 15000 },
    (request, response) => {
      response.once('close', () => {
        if (closing) server.closeIdleConnections();
      });
      if (
        ['/healthz', '/readyz'].includes(request.url ?? '') &&
        ['GET', 'HEAD'].includes(request.method ?? '')
      ) {
        response.writeHead(service.closing ? 503 : 200, { 'Cache-Control': 'no-store' }).end();
        return;
      }
      void service.handle(request, response, () => {
        response.writeHead(404, { 'Cache-Control': 'no-store' }).end();
      });
    },
  );
  try {
    await new Promise<void>((accept, reject) => {
      server.once('error', reject);
      server.listen(options.port, '127.0.0.1', accept);
    });
  } catch (cause) {
    await service.close();
    throw cause;
  }
  return Object.freeze({
    port: (server.address() as AddressInfo).port,
    close: () =>
      (closing ??= (async () => {
        const drained = service.close();
        const stopped = new Promise<void>((accept) => server.close(() => accept()));
        server.closeIdleConnections();
        await drained;
        // Incomplete HTTP headers must not keep an already-drained owner alive indefinitely.
        server.closeAllConnections();
        await stopped;
      })()),
  });
}
