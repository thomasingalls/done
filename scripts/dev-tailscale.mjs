/**
 * Secure cross-device development through Tailscale Serve.
 *
 * Both application processes remain loopback-only. Tailscale terminates HTTPS
 * for the machine's MagicDNS name and proxies it to Vite; Vite owns the
 * /relay WebSocket route and proxies that to the plain loopback relay.
 */

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateDirectory = join(root, '.dev');
const tokenPath = join(stateDirectory, 'relay-token');

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error?.code === 'ENOENT') {
    throw new Error(`${command} is required but was not found on PATH`);
  }
  if (result.error) {
    throw new Error(`${command} ${args.join(' ')} could not run: ${result.error.message}`, {
      cause: result.error,
    });
  }
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim();
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout.trim();
};

const readJson = (command, args) => {
  try {
    return JSON.parse(run(command, args));
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      throw new Error(`${command} returned invalid JSON`, { cause });
    }
    throw cause;
  }
};

const tailscaleIdentity = () => {
  const status = readJson('tailscale', ['status', '--json']);
  if (status.BackendState !== 'Running') throw new Error('Tailscale is not connected');

  const dnsName = status.Self?.DNSName?.replace(/\.$/u, '');
  if (!dnsName) throw new Error('Tailscale did not report a MagicDNS name for this machine');
  if (!status.CurrentTailnet?.MagicDNSEnabled) {
    throw new Error('MagicDNS is not enabled for this tailnet');
  }
  if (!status.CertDomains?.includes(dnsName)) {
    throw new Error(`HTTPS certificates are not enabled for ${dnsName}`);
  }
  return dnsName;
};

const assertNodeServeRouteIsFree = () => {
  const status = readJson('tailscale', ['serve', 'status', '--json']);
  // Service-scoped routes have their own virtual IPs and are independent. A
  // node-level TCP/Web route would share this machine's MagicDNS name and the
  // foreground development route must not silently replace it.
  if (Object.keys(status.TCP ?? {}).length > 0 || Object.keys(status.Web ?? {}).length > 0) {
    throw new Error(
      'this node already has a Tailscale Serve route; remove it explicitly before starting development',
    );
  }
};

const ensureTlsCertificate = (dnsName) => {
  const directory = mkdtempSync(join(tmpdir(), 'done-tailscale-cert-'));
  const certPath = join(directory, 'certificate.pem');
  const keyPath = join(directory, 'private-key.pem');

  try {
    // This reads a cached certificate when one exists and performs one
    // synchronous ACME issuance otherwise. Doing it before Serve prevents a
    // browser's parallel/retrying handshakes from creating repeated orders.
    run('tailscale', ['cert', '--cert-file', certPath, '--key-file', keyPath, dnsName], {
      timeout: 90_000,
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `Tailscale could not provision a TLS certificate for ${dnsName}. ` +
        `Check this device's TLS certificate status in the Tailscale console, then retry. ${detail}`,
      { cause },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const ensureRelayToken = () => {
  const supplied = process.env['RELAY_TOKEN']?.trim();
  if (supplied) return supplied;

  mkdirSync(stateDirectory, { recursive: true });
  if (!existsSync(tokenPath) || statSync(tokenPath).size === 0) {
    writeFileSync(tokenPath, `${randomBytes(32).toString('base64url')}\n`, { mode: 0o600 });
  }
  chmodSync(tokenPath, 0o600);
  return readFileSync(tokenPath, 'utf8').trim();
};

const port = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} must be a TCP port`);
  }
  return String(value);
};

const assertPortIsFree = (name, value) =>
  new Promise((resolveFree, reject) => {
    const probe = createServer();
    probe.once('error', (cause) => {
      if (cause.code === 'EADDRINUSE') {
        reject(new Error(`${name} ${value} is already in use on loopback`));
        return;
      }
      reject(cause);
    });
    probe.listen(Number(value), '127.0.0.1', () => probe.close(resolveFree));
  });

const delay = (milliseconds) =>
  new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });

const errorDetail = (cause) => {
  if (!(cause instanceof Error)) return String(cause);
  if (cause.cause instanceof Error) return `${cause.message}: ${cause.cause.message}`;
  return cause.message;
};

const waitForTailnetHttps = async (url) => {
  const deadline = Date.now() + 30_000;
  let lastFailure = 'no response';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      await response.body?.cancel();
      if (response.ok) return;
      lastFailure = `HTTP ${response.status}`;
    } catch (cause) {
      lastFailure = errorDetail(cause);
    }
    await delay(250);
  }

  throw new Error(`the published HTTPS URL did not become reachable: ${lastFailure}`);
};

const stop = (child) => {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
};

const main = async () => {
  const dnsName = tailscaleIdentity();
  assertNodeServeRouteIsFree();

  const appPort = port('DEV_APP_PORT', 5173);
  const relayPort = port('DEV_RELAY_PORT', 1234);
  const allowedRooms = process.env['RELAY_ROOMS']?.trim() || 'done';
  const room = allowedRooms.split(',')[0]?.trim() || 'done';
  const token = ensureRelayToken();
  await Promise.all([
    assertPortIsFree('DEV_APP_PORT', appPort),
    assertPortIsFree('DEV_RELAY_PORT', relayPort),
  ]);
  ensureTlsCertificate(dnsName);
  const environment = {
    ...process.env,
    DEV_RELAY_PORT: relayPort,
    DEV_RELAY_PROXY: '1',
    // Tailscale preserves the public Host header when proxying to plain Vite.
    // Add exactly this machine-controlled name; never disable Vite's host check.
    __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: dnsName,
  };

  const relay = spawn('pnpm', ['--dir', 'relay', 'dev'], {
    cwd: root,
    env: {
      ...environment,
      HOST: '127.0.0.1',
      PORT: relayPort,
      RELAY_ROOMS: allowedRooms,
      RELAY_TOKEN: token,
    },
    stdio: 'inherit',
  });
  const vite = spawn(
    'pnpm',
    ['exec', 'vite', '--host', '127.0.0.1', '--port', appPort, '--strictPort'],
    { cwd: root, env: environment, stdio: 'inherit' },
  );
  const serve = spawn('tailscale', ['serve', appPort], {
    cwd: root,
    env: environment,
    stdio: 'inherit',
  });

  const children = [
    { child: serve, name: 'Tailscale Serve' },
    { child: vite, name: 'Vite' },
    { child: relay, name: 'relay' },
  ];
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    for (const { child } of children) stop(child);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  const firstExit = Promise.race(
    children.map(
      ({ child, name }) =>
        new Promise((resolveExit, reject) => {
          child.once('error', reject);
          child.once('exit', (code, signal) => resolveExit({ code, name, signal }));
        }),
    ),
  );

  let result;
  let requestedShutdown = false;
  try {
    const startup = await Promise.race([
      firstExit,
      waitForTailnetHttps(`https://${dnsName}`).then(() => ({ ready: true })),
    ]);
    if (!('ready' in startup)) {
      if (stopping) return;
      throw new Error(
        `${startup.name} exited before the tailnet HTTPS endpoint was ready` +
          `${startup.code === null ? '' : ` (exit ${startup.code})`}`,
      );
    }

    console.log('');
    console.log('Tailscale development sync settings (verified reachable)');
    console.log(`  app       https://${dnsName}`);
    console.log(`  endpoint  wss://${dnsName}/relay`);
    console.log(`  room      ${room}`);
    console.log(`  token     ${token}`);
    console.log('');

    result = await firstExit;
    requestedShutdown = stopping;
  } finally {
    shutdown();
    await Promise.all(
      children
        .map(({ child }) => child)
        .filter((child) => child.exitCode === null && child.signalCode === null)
        .map(
          (child) =>
            new Promise((resolveExit) => {
              child.once('exit', resolveExit);
            }),
        ),
    );
  }

  if (!requestedShutdown && result.code) process.exitCode = result.code;
  if (
    !requestedShutdown &&
    result.signal &&
    result.signal !== 'SIGINT' &&
    result.signal !== 'SIGTERM'
  ) {
    process.exitCode = 1;
  }
};

main().catch((cause) => {
  console.error(`dev:tailscale: ${cause instanceof Error ? cause.message : String(cause)}`);
  process.exitCode = 1;
});
