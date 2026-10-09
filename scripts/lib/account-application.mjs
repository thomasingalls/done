/** Compose private account ownership with either Vite or an immutable packaged build. */
import { createServer as createHttpServer } from 'node:http';
import { packagedApplication } from './packaged-application.mjs';
import { openDevelopmentAccountService } from '../../account-service/development-runtime.ts';
import { previewConfig } from '../account-setup-state.mjs';

export async function startAccountApplication({ config, packaged, liveUpdates = false }) {
  const {
    port,
    directory,
    policy: { origin },
  } = config;
  const service = openDevelopmentAccountService(config);
  const clientConfig = service.clientConfig;
  const middleware = service.handle;
  let server;
  try {
    if (packaged) {
      const serve = packagedApplication(packaged);
      const http = createHttpServer((request, response) => {
        void middleware(request, response, () => serve(request, response)).catch(() => {
          if (!response.headersSent) response.writeHead(400);
          response.end();
        });
      });
      server = {
        close: () =>
          new Promise((resolve) => {
            http.close(resolve);
            http.closeIdleConnections();
          }),
      };
      await new Promise((resolve, reject) => {
        http.once('error', reject);
        http.listen(port, '127.0.0.1', resolve);
      });
    } else {
      const { createServer } = await import('vite');
      server = await createServer({
        configLoader: 'runner',
        cacheDir: `node_modules/.vite-account-setup-${port}`,
        define: { __ACCOUNT_SETUP_CONFIG__: JSON.stringify(clientConfig) },
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
              vite.middlewares.use(middleware);
            },
          },
        ],
      });
      await server.listen();
    }
  } catch (cause) {
    try {
      await server?.close();
    } finally {
      await service.close();
    }
    throw cause;
  }
  let closing;
  return Object.freeze({
    origin,
    close: () =>
      (closing ??= (async () => {
        // Reject new operations immediately; stop listening while admitted work drains.
        const drained = service.close();
        await Promise.all([server.close(), drained]);
      })()),
  });
}

export async function runAccountApplication({ packaged = process.env.ACCOUNT_SETUP_DIST } = {}) {
  // A phone's password manager can suspend Vite's socket; reconnection reloads
  // the page and loses in-memory code confirmation. Keep live updates opt-in.
  const liveUpdates = process.env.ACCOUNT_SETUP_LIVE_UPDATES === '1';
  const app = await startAccountApplication({ config: previewConfig(), packaged, liveUpdates });
  const close = () => {
    void app.close().catch(() => {
      console.error('Account application shutdown failed');
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  console.log(`Account ${packaged ? 'packaged development' : 'setup development'}: ${app.origin}/`);
  console.log(
    `Live updates ${liveUpdates ? 'enabled' : 'disabled; refresh explicitly for code changes'}.`,
  );
}
