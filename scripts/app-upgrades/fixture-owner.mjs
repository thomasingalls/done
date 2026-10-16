/** Keep the disposable listener in its runner: runner death must close the socket too. */
import { once } from 'node:events';
import { upgradeFixtureServer } from './server.mjs';

export async function withUpgradeFixture(root, run) {
  const server = upgradeFixtureServer(root);
  try {
    const listening = once(server, 'listening');
    server.listen(0, '127.0.0.1');
    await listening;
    const address = server.address();
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    if (server.listening)
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
  }
}
