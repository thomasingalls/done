/** Retained account APIs only. Keep ACCOUNT_SETUP_ORIGIN pinned to the public application. */
import { startDevelopmentAccountServer } from '../account-service/development-server.ts';
import { previewConfig, accountServicePort } from './lib/account-config.mjs';

const config = previewConfig();
const service = await startDevelopmentAccountServer({
  ...config,
  port: accountServicePort(config),
});
const close = () => {
  void service.close().catch(() => {
    console.error('Account service shutdown failed');
    process.exitCode = 1;
  });
};
process.once('SIGINT', close);
process.once('SIGTERM', close);
console.log(`Account API development: 127.0.0.1:${service.port} for ${config.policy.origin}`);
