// Disposable loopback processes; no production state. Credentials are never logged.
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';

const children = new Set();
let proxy;
export const proxyRows = [];
const env = (state) => ({
  ...process.env,
  ACCOUNT_NETWORK_SESSIONS: '1',
  ACCOUNT_MEMBERSHIP_CONTINUATION: '1',
  ACCOUNT_SETUP_PORT: '53771',
  ACCOUNT_SETUP_ORIGIN: 'http://localhost:53771',
  ACCOUNT_SERVICE_PORT: '53772',
  ACCOUNT_SETUP_STATE: state,
  ACCOUNT_SETUP_DIST: process.env.DONE_PERF_DIST,
});
function start(script, ready, environment) {
  const child = spawn(process.execPath, [script], {
    cwd: process.env.DONE_PERF_SOURCE,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(Error('Disposable service startup timeout: ' + output));
    }, 20000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      children.delete(child);
      reject(Error(`Disposable service exited ${code}: ${output}`));
    });
    const data = (chunk) => {
      output = (output + chunk.toString()).slice(-8000);
      if (output.includes(ready)) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout.on('data', data);
    child.stderr.on('data', data);
  });
}
export const startBackend = (state) =>
  start('scripts/serve-account-service.mjs', 'Account API development:', env(state));
export async function startApp(state) {
  const delay = Number(process.env.RECEIVE_DELAY_MS ?? 0);
  if (![0, 75].includes(delay)) throw Error('Unspecified latency condition');
  proxy = createServer((req, res) => {
    const row = { path: new URL(req.url, 'http://localhost').pathname, at: Date.now(), delay };
    proxyRows.push(row);
    const forward = () => {
      row.forwardAt = Date.now();
      const up = httpRequest(
        {
          hostname: '127.0.0.1',
          port: 53772,
          path: req.url,
          method: req.method,
          headers: req.headers,
          agent: false,
        },
        (reply) => {
          row.responseAt = Date.now();
          row.status = reply.statusCode;
          res.writeHead(reply.statusCode, reply.headers);
          reply.pipe(res);
          reply.once('end', () => {
            row.end = Date.now();
          });
        },
      );
      up.on('error', () => {
        row.failed = true;
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      res.once('close', () => up.destroy());
      req.pipe(up);
    };
    if (delay) setTimeout(forward, delay);
    else forward();
  });
  await new Promise((resolve, reject) => {
    proxy.once('error', reject);
    proxy.listen(53774, '127.0.0.1', resolve);
  });
  return start('scripts/serve-account.mjs', 'Account packaged development:', {
    ...env(state),
    ACCOUNT_SERVICE_PORT: '53774',
  });
}
export async function stopAll() {
  for (const child of [...children]) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    await new Promise((resolve) => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGTERM');
    });
  }
  if (proxy)
    await new Promise((resolve) => {
      proxy.close(resolve);
      proxy.closeAllConnections();
    });
}
process.on('exit', () => {
  for (const child of children) child.kill('SIGKILL');
});
