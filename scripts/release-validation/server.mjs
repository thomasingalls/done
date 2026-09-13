import assert from 'node:assert/strict';
import { once } from 'node:events';

export async function listenEphemeralVite(server) {
  assert(server.httpServer, 'Owned Vite server requires its HTTP server');
  // Vite's high-level listen treats zero as its default port. Its public HTTP server
  // retains Vite's initialization hook and accepts Node's OS-assigned port request.
  const listening = once(server.httpServer, 'listening');
  server.httpServer.listen(0, '127.0.0.1');
  await listening;
  const address = server.httpServer.address();
  assert(address && address.address === '127.0.0.1' && address.port > 0);
  return `http://127.0.0.1:${address.port}`;
}
