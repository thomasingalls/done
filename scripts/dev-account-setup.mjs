/** Loopback-only product development service. Uses the existing owners; never a deployment entry. */
import { createServer } from 'vite';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccountCore } from '../account-service/core.ts';
import { PrivateAuthority } from '../account-service/authority.ts';
import { CEREMONY_RELAY_LIMIT } from '../account-protocol/ceremonyRelay.ts';
import { CONTENT_DELIVERY_LIMIT } from '../account-protocol/contentDelivery.ts';
import { ENROLLMENT_REQUEST_LIMIT } from '../account-protocol/enrollment.ts';
import { ADMISSION_LIMIT } from '../account-protocol/admission.ts';
import { lockPreviewState, previewConfig } from './account-setup-state.mjs';

const { port, directory, policy } = previewConfig();
const { origin } = policy;
// A phone may suspend Vite's socket while its password manager is foregrounded.
// Vite reloads on reconnection, discarding in-memory code-confirmation steps.
// Walkthroughs use explicit refresh; live updates are an opt-in coding convenience.
const liveUpdates = process.env.ACCOUNT_SETUP_LIVE_UPDATES === '1';
mkdirSync(directory, { recursive: true, mode: 0o700 });
const release = lockPreviewState(directory);
process.once('exit', release);
const keyPath = join(directory, 'operator.key');
const pinPath = join(directory, 'pin.json');
if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 });
const key = readFileSync(keyPath);
const pin = existsSync(pinPath)
  ? JSON.parse(readFileSync(pinPath, 'utf8'))
  : PrivateAuthority.initialize(join(directory, 'authority.sqlite'), policy, key);
if (pin.origin !== origin) throw Error('Reuse the original port for this development service');
if (!existsSync(pinPath)) writeFileSync(pinPath, JSON.stringify(pin), { flag: 'wx', mode: 0o600 });
const authority = PrivateAuthority.open(join(directory, 'authority.sqlite'), pin, key);
key.fill(0);
let core;
try {
  core = new AccountCore(join(directory, 'account.sqlite'), policy);
} catch (cause) {
  authority.close();
  if (cause.message.includes('Unsupported account schema'))
    throw Error(
      'Preview database needs an explicit offline upgrade. Stop the preview, run node scripts/upgrade-account-setup.mjs with the same ACCOUNT_SETUP_STATE and ACCOUNT_SETUP_PORT, then restart.',
      { cause },
    );
  throw cause;
}
const token = randomBytes(32).toString('base64url');
const routes = new Map([
  ['ceremony/bootstrap', (input) => authority.ceremonyBootstrap(core, input)],
  ['ceremony/exchange', (input) => authority.relayCeremony(core, input)],
  ['ceremony/transfer', (input) => authority.transferContent(core, input)],
  ['authority/discover', (input) => authority.discoverAuthority(core, input)],
  ['enrollment/begin', (input) => authority.enrollment(core, 'begin', input)],
  ['enrollment/finish', (input) => authority.enrollment(core, 'finish', input)],
  ['enrollment/admit', (input) => authority.admitPrepared(core, input)],
  ['begin', (input) => core.begin(input)],
  ['resume', (input) => core.resume(input)],
  ['finish', (input) => core.finish(input)],
  ['cancel', (input) => core.cancel(input)],
  ['authority/prove', (input) => authority.prove(input)],
  ['preparation/inspect', (input) => authority.pending(core, input)],
  ['preparation/abandon', (input) => authority.pending(core, input, true)],
  ['recovery/begin', (input) => core.beginRecovery(input)],
  ['recovery/finish', (input) => core.finishRecovery(input)],
  ['promotion/begin', (input) => authority.beginPromotion(core, input)],
  ['promotion/challenge', (input) => authority.challengePromotion(core, input)],
  ['promotion/finish', (input) => authority.finishPromotion(core, input)],
  ['promotion/binding', (input) => authority.promotionBinding(core, input)],
]);
const server = await createServer({
  configLoader: 'runner',
  cacheDir: `node_modules/.vite-account-setup-${port}`,
  define: { __ACCOUNT_SETUP_CONFIG__: JSON.stringify({ pin, token }) },
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    hmr: liveUpdates,
    ws: liveUpdates
      ? origin.startsWith('https:')
        ? {
            protocol: 'wss',
            host: new URL(origin).hostname,
            clientPort: Number(new URL(origin).port || 443),
          }
        : {}
      : false,
    allowedHosts: [new URL(origin).hostname],
    open: false,
    fs: {
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem,key,p12,pfx,cer,der}',
        '.npmrc',
        '.yarnrc.yml',
        '**/.git/**',
        '**/.dev/**',
        '**/*.sqlite*',
        directory + '/**',
      ],
    },
  },
  plugins: [
    {
      name: 'private-account-setup',
      transformIndexHtml: {
        order: 'pre',
        handler(html, context) {
          if (!['/index.html', '/local.html'].includes(context.path)) return html;
          return html.replace(
            /src="\/src\/(?:main|local)\.tsx"/,
            'src="/private/account-setup.tsx"',
          );
        },
      },
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          if (request.headers.host !== new URL(origin).host) {
            response.writeHead(403).end();
            return;
          }
          const prefix = '/__account-setup/';
          if (!request.url?.startsWith(prefix)) return next();
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('X-Content-Type-Options', 'nosniff');
          const send = (status, body) => response.writeHead(status).end(JSON.stringify(body));
          const supplied = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
          if (
            request.method !== 'POST' ||
            request.headers.origin !== origin ||
            request.headers['content-type'] !== 'application/json' ||
            Buffer.byteLength(supplied) !== Buffer.byteLength(token) ||
            !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
          ) {
            send(403, { ok: false, refusal: 'malformed' });
            return;
          }
          const route = request.url.slice(prefix.length);
          const operation = routes.get(route);
          if (!operation) return void send(404, { ok: false, refusal: 'malformed' });
          try {
            const chunks = [];
            let size = 0;
            for await (const chunk of request) {
              size += chunk.length;
              if (
                size >
                (route.startsWith('promotion/')
                  ? ADMISSION_LIMIT
                  : route === 'ceremony/transfer'
                    ? CONTENT_DELIVERY_LIMIT
                    : route === 'ceremony/exchange'
                      ? CEREMONY_RELAY_LIMIT
                      : route === 'ceremony/bootstrap' ||
                          route === 'authority/discover' ||
                          route === 'enrollment/admit'
                        ? 4096
                        : route.startsWith('enrollment/')
                          ? ENROLLMENT_REQUEST_LIMIT
                          : 131072)
              ) {
                send(413, { ok: false, refusal: 'malformed' });
                return;
              }
              chunks.push(chunk);
            }
            const result = await operation(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            send(result?.ok === false ? 409 : 200, result);
          } catch {
            send(400, { ok: false, refusal: 'malformed' });
          }
        });
      },
    },
  ],
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
  authority.close();
  core.close();
  release();
}
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
await server.listen();
console.log(`Account setup development: ${origin}/private/account-setup.html`);
console.log(
  `Live updates ${liveUpdates ? 'enabled' : 'disabled; refresh explicitly for code changes'}.`,
);
