/** API-only loopback listener. Its identity is the public application origin, not this port. */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { openDevelopmentAccountService } from './development-runtime.ts';
import type { Policy } from './webauthn.ts';

export async function startDevelopmentAccountServer(options: {
  directory: string;
  networkSessions?: boolean;
  membershipContinuation?: boolean;
  policy: Policy;
  port: number;
}) {
  const service = openDevelopmentAccountService(options);
  let closing: Promise<void> | undefined;
  const server = createServer((request, response) => {
    response.once('close', () => {
      if (closing) server.closeIdleConnections();
    });
    void service.handle(request, response, () => {
      response.writeHead(404, { 'Cache-Control': 'no-store' }).end();
    });
  });
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
        const stopped = new Promise<void>((accept) => {
          server.close(() => accept());
          server.closeIdleConnections();
        });
        await Promise.all([drained, stopped]);
      })()),
  });
}
