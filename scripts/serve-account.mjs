/** Compiled PWA and same-origin gateway. Run serve-account-service.mjs independently. */
import { startAccountGateway } from './lib/account-gateway.mjs';
import { previewConfig, accountServicePort } from './lib/account-config.mjs';

const config = previewConfig();
const app = await startAccountGateway({
  port: config.port,
  origin: config.policy.origin,
  servicePort: accountServicePort(config),
  packaged: process.env.ACCOUNT_SETUP_DIST ?? 'dist',
});
const close = () => {
  void app.close().catch(() => {
    console.error('Account application shutdown failed');
    process.exitCode = 1;
  });
};
process.once('SIGINT', close);
process.once('SIGTERM', close);
console.log(`Account packaged development: ${config.policy.origin}/`);
