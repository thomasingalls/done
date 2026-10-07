/** Public origin and local ports only; importing this never opens account state. */
import { resolve } from 'node:path';

export function previewConfig(env = process.env) {
  const port = Number(env.ACCOUNT_SETUP_PORT ?? 53210);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error('Invalid development port');
  const origin = env.ACCOUNT_SETUP_ORIGIN ?? `http://localhost:${port}`;
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    (origin !== `http://localhost:${port}` &&
      (url.protocol !== 'https:' || !url.hostname.endsWith('.ts.net')))
  )
    throw Error('Preview origin must be loopback or an explicit Tailscale HTTPS origin');
  if (
    env.ACCOUNT_NETWORK_SESSIONS !== undefined &&
    !['0', '1'].includes(env.ACCOUNT_NETWORK_SESSIONS)
  )
    throw Error('ACCOUNT_NETWORK_SESSIONS must be 0 or 1');
  return {
    ...(env.ACCOUNT_NETWORK_SESSIONS === '1' ? { networkSessions: true } : {}),
    port,
    directory: resolve(env.ACCOUNT_SETUP_STATE ?? '.dev/account-setup'),
    policy: { rpId: url.hostname, origin },
  };
}

export function accountServicePort(config, env = process.env) {
  const port = Number(env.ACCOUNT_SERVICE_PORT ?? 53211);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === config.port)
    throw Error('Account service needs a distinct loopback port');
  return port;
}
