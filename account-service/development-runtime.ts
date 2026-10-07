/** Own the retained private account service independently of Vite, assets and process signals. */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAuthorityPin } from '../account-protocol/authority.ts';
import { AccountCore } from './core.ts';
import { PrivateAuthority } from './authority.ts';
import { validatePolicy, type Policy } from './webauthn.ts';
import { lockDevelopmentState } from './development-state.ts';
import {
  createDevelopmentAccountHandler,
  type DevelopmentAccountHandler,
} from './development-http.ts';

export function openDevelopmentAccountService(options: { directory: string; policy: Policy }) {
  const directory = options.directory;
  const policy = { ...options.policy };
  validatePolicy(policy);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const release = lockDevelopmentState(directory);
  let authority: PrivateAuthority | undefined;
  let core: AccountCore | undefined;
  const dispose = () => {
    try {
      authority?.close();
    } finally {
      try {
        core?.close();
      } finally {
        release();
      }
    }
  };
  try {
    const keyPath = join(directory, 'operator.key'),
      pinPath = join(directory, 'pin.json');
    if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 });
    const key = readFileSync(keyPath);
    let pin;
    try {
      pin = Object.freeze(
        parseAuthorityPin(
          existsSync(pinPath)
            ? JSON.parse(readFileSync(pinPath, 'utf8'))
            : PrivateAuthority.initialize(join(directory, 'authority.sqlite'), policy, key),
        ),
      );
      if (pin.origin !== policy.origin || pin.rpId !== policy.rpId)
        throw Error('Reuse the original port for this development service');
      if (!existsSync(pinPath))
        writeFileSync(pinPath, JSON.stringify(pin), { flag: 'wx', mode: 0o600 });
      authority = PrivateAuthority.open(join(directory, 'authority.sqlite'), pin, key);
    } finally {
      key.fill(0);
    }
    try {
      core = new AccountCore(join(directory, 'account.sqlite'), policy);
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes('Unsupported account schema'))
        throw Error(
          'Preview database needs an explicit offline upgrade. Stop the preview, run node scripts/upgrade-account-setup.mjs with the same ACCOUNT_SETUP_STATE and ACCOUNT_SETUP_PORT, then restart.',
          { cause },
        );
      throw cause;
    }
    const token = randomBytes(32).toString('base64url');
    const dispatch = createDevelopmentAccountHandler(core, authority, pin, token);
    const pending = new Set<Promise<void>>();
    let closing: Promise<void> | undefined;
    const handle: DevelopmentAccountHandler = (request, response, next) => {
      if (closing) {
        response.writeHead(503, { 'Cache-Control': 'no-store', Connection: 'close' }).end();
        return Promise.resolve();
      }
      // Retain ownership even if an HTTP client disconnects during an awaited operation.
      const work = dispatch(request, response, next).catch(() => {
        if (!response.headersSent) response.writeHead(400);
        response.end();
      });
      pending.add(work);
      void work.then(
        () => pending.delete(work),
        () => pending.delete(work),
      );
      return work;
    };
    return Object.freeze({
      clientConfig: Object.freeze({ pin, token }),
      handle,
      close: () => (closing ??= Promise.allSettled([...pending]).then(dispose)),
    });
  } catch (cause) {
    dispose();
    throw cause;
  }
}
