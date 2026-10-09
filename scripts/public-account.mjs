/** One command per process. Kubernetes will supervise app and API independently. */
import { resolve } from 'node:path';
import {
  publicListenConfig,
  publicServiceConfig,
  publicStorageConfig,
  publicRestoreConfig,
} from '../account-service/public-config.ts';

process.umask(0o077);
const mode = process.argv[2];
try {
  if (process.argv.length !== 3 || !['initialize', 'restore', 'api', 'app'].includes(mode))
    throw Error('Usage: node scripts/public-account.mjs initialize|restore|api|app');
  if (mode === 'initialize') {
    const { initializePublicState } = await import('../account-service/public-state.ts');
    // Public pin only. Mount this independently as DONE_SERVICE_PIN_FILE before serving.
    console.log(JSON.stringify(initializePublicState(publicStorageConfig())));
  } else if (mode === 'restore') {
    const { restorePublicBackup } = await import('../account-service/public-restore.ts');
    console.log(JSON.stringify(await restorePublicBackup(publicRestoreConfig())));
  } else {
    const listen = publicListenConfig();
    let service;
    if (mode === 'api') {
      const { startPublicAccountServer } = await import('../account-service/public-server.ts');
      service = await startPublicAccountServer({
        ...publicServiceConfig(),
        port: listen.servicePort,
      });
    } else {
      const { startAccountGateway } = await import('./lib/account-gateway.mjs');
      service = await startAccountGateway({
        ...listen,
        health: true,
        packaged: resolve(process.env.DONE_APP_DIST ?? 'dist'),
      });
    }
    const stop = () => {
      void service.close().catch(() => {
        console.error(`Public ${mode} shutdown failed`);
        process.exitCode = 1;
      });
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    console.log(
      `Public ${mode} ready on ${mode === 'api' ? '127.0.0.1' : listen.address}:${service.port}`,
    );
  }
} catch (cause) {
  console.error(
    `Public ${mode ?? 'account'} startup failed: ${cause instanceof Error ? cause.message : 'unknown failure'}`,
  );
  process.exitCode = 1;
}
