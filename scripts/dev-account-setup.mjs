/** Loopback-only product development service. Uses the existing owners; never a deployment entry. */
import { createServer } from 'vite';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { AccountCore } from '../account-service/core.ts';
import { PrivateAuthority } from '../account-service/authority.ts';
import { ADMISSION_LIMIT } from '../account-protocol/admission.ts';

const port = Number(process.env.ACCOUNT_SETUP_PORT ?? 53210);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid development port');
const origin = `http://localhost:${port}`;
const directory = resolve(process.env.ACCOUNT_SETUP_STATE ?? '.dev/account-setup');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const keyPath = join(directory, 'operator.key');
const pinPath = join(directory, 'pin.json');
if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 });
const key = readFileSync(keyPath);
const policy = { rpId: 'localhost', origin };
const pin = existsSync(pinPath)
  ? JSON.parse(readFileSync(pinPath, 'utf8'))
  : PrivateAuthority.initialize(join(directory, 'authority.sqlite'), policy, key);
if (pin.origin !== origin) throw Error('Reuse the original port for this development service');
if (!existsSync(pinPath)) writeFileSync(pinPath, JSON.stringify(pin), { flag: 'wx', mode: 0o600 });
const authority = PrivateAuthority.open(join(directory, 'authority.sqlite'), pin, key);
key.fill(0);
const core = new AccountCore(join(directory, 'account.sqlite'), policy);
const token = randomBytes(32).toString('base64url');
const routes = new Map([
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
              if (size > (route.startsWith('promotion/') ? ADMISSION_LIMIT : 131072)) {
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
}
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
await server.listen();
console.log(`Account setup development: ${origin}/private/account-setup.html`);
