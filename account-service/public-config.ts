/** Configuration for the public host. Neither parsing nor app serving opens retained state. */
import { isAbsolute, resolve } from 'node:path';
import { isIP } from 'node:net';
import { validatePolicy, type Policy } from './webauthn.ts';
import { backupConfig } from './backup/config.ts';

type Environment = Record<string, string | undefined>;
export function publicPolicy(origin: string): Policy {
  const url = new URL(origin);
  const policy = { origin, rpId: url.hostname };
  validatePolicy(policy);
  if (url.protocol !== 'https:') throw Error('Public service requires an exact HTTPS origin');
  return Object.freeze(policy);
}
function required(env: Environment, name: string): string {
  const value = env[name];
  if (!value) throw Error(`Missing ${name}`);
  return value;
}
function path(env: Environment, name: string): string {
  const value = required(env, name);
  if (!isAbsolute(value)) throw Error(`${name} must be an absolute path`);
  return resolve(value);
}
export function publicStorageConfig(env: Environment = process.env) {
  return Object.freeze({
    policy: publicPolicy(required(env, 'DONE_PUBLIC_ORIGIN')),
    directory: path(env, 'DONE_STATE_DIR'),
    operatorKeyFile: path(env, 'DONE_OPERATOR_KEY_FILE'),
  });
}
export function publicServiceConfig(env: Environment = process.env) {
  const storage = publicStorageConfig(env);
  return Object.freeze({
    ...storage,
    pinFile: path(env, 'DONE_SERVICE_PIN_FILE'),
    backup: backupConfig(storage.directory, env),
  });
}
export function publicListenConfig(env: Environment = process.env) {
  const port = Number(env.DONE_APP_PORT ?? 8080);
  const servicePort = Number(env.DONE_API_PORT ?? 8081);
  for (const value of [port, servicePort])
    if (!Number.isInteger(value) || value < 1024 || value > 65535)
      throw Error('Public host ports must be integers from 1024 to 65535');
  if (port === servicePort) throw Error('App and API ports must differ');
  const address = env.DONE_APP_ADDRESS ?? '0.0.0.0';
  if (!isIP(address)) throw Error('DONE_APP_ADDRESS must be an IP address');
  return Object.freeze({
    port,
    servicePort,
    address,
    origin: publicPolicy(required(env, 'DONE_PUBLIC_ORIGIN')).origin,
  });
}
