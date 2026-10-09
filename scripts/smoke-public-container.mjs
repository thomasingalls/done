/** One disposable two-process container smoke check. Never mounts a host/service data directory. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { request } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const image = process.argv[2];
assert(image && process.argv.length === 3, 'Usage: node scripts/smoke-public-container.mjs IMAGE');
const prefix = 'done-public-smoke-' + randomUUID();
const api = prefix + '-api',
  app = prefix + '-app';
const data = prefix + '-data',
  secrets = prefix + '-secrets',
  missing = prefix + '-missing';
const containers = [],
  volumes = [];
const evidence = { image, started: new Date().toISOString(), checks: [] };
function docker(args, input, allowFailure = false) {
  const result = spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 45000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (!allowFailure && result.status !== 0)
    throw Error(`docker ${args[0]} failed: ${result.error?.message ?? result.stderr}`);
  return result;
}
const output = (args) => docker(args).stdout.trim();
const check = (name) => {
  evidence.checks.push(name);
  console.log(name);
};
const security = [
  '--read-only',
  '--tmpfs',
  '/tmp:rw,noexec,nosuid,size=16m',
  '--cap-drop',
  'ALL',
  '--security-opt',
  'no-new-privileges',
];
const stateMount = ['--mount', `type=volume,source=${data},target=/data`];
const secretMount = ['--mount', `type=volume,source=${secrets},target=/etc/done,readonly`];
const origin = 'https://done.example.com';
const env = [
  '-e',
  `DONE_PUBLIC_ORIGIN=${origin}`,
  '-e',
  'DONE_STATE_DIR=/data/service',
  '-e',
  'DONE_OPERATOR_KEY_FILE=/etc/done/operator.key',
  '-e',
  'DONE_SERVICE_PIN_FILE=/etc/done/pin.json',
];
function exchange(port, path, body, headers = {}) {
  return new Promise((accept, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Host: 'done.example.com',
          Origin: origin,
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        const parts = [];
        res.on('data', (part) => parts.push(part));
        res.on('error', reject);
        res.on('end', () =>
          accept({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(parts) }),
        );
      },
    );
    req.setTimeout(10000, () => req.destroy(Error('HTTP smoke deadline')));
    req.on('error', reject);
    req.end(body);
  });
}
async function ready(name, mode) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (
      docker(['exec', name, 'node', 'scripts/public-healthcheck.mjs', mode], undefined, true)
        .status === 0
    )
      return;
    if (output(['inspect', name, '--format', '{{.State.Running}}']) !== 'true')
      throw Error(`${mode} exited: ${output(['logs', name])}`);
    await new Promise((accept) => setTimeout(accept, 200));
  }
  throw Error(`${mode} readiness deadline`);
}
function startApp() {
  output([
    'run',
    '-d',
    '--name',
    app,
    '--label',
    'done.test=public-runtime',
    ...security,
    '--network',
    `container:${api}`,
    '-e',
    `DONE_PUBLIC_ORIGIN=${origin}`,
    image,
    'app',
  ]);
  if (!containers.includes(app)) containers.push(app);
}
try {
  evidence.imageId = output(['image', 'inspect', image, '--format', '{{.Id}}']);
  evidence.platform = output(['image', 'inspect', image, '--format', '{{.Os}}/{{.Architecture}}']);
  evidence.sourceRevision = output([
    'image',
    'inspect',
    image,
    '--format',
    '{{index .Config.Labels "org.opencontainers.image.revision"}}',
  ]);
  assert.match(evidence.sourceRevision, /^[0-9a-f]{40}(?:-dirty)?$/);
  const inspection = JSON.parse(
    output([
      'run',
      '--rm',
      ...security,
      '--entrypoint',
      'node',
      image,
      '-e',
      `const fs=require('node:fs'); console.log(JSON.stringify({uid:process.getuid(),node:process.version,
     absent:['.git','.dev','test','src','node_modules/vite'].every(p=>!fs.existsSync('/app/'+p))}));`,
    ]),
  );
  assert.equal(inspection.uid, 65532);
  assert.equal(inspection.node, 'v24.18.0');
  assert(inspection.absent);
  evidence.nodeVersion = inspection.node;
  evidence.ageVersion = output([
    'run',
    '--rm',
    ...security,
    '--entrypoint',
    'age',
    image,
    '--version',
  ]);
  check('Non-root Node 24 runtime excludes repository, tests, development state and build tools');
  for (const name of [data, secrets, missing]) {
    output(['volume', 'create', '--label', 'done.test=public-runtime', name]);
    volumes.push(name);
  }
  // Model a root-owned, group-readable projected Secret without putting a factor in arguments/logs.
  docker([
    'run',
    '--rm',
    '--user',
    '0:0',
    '--mount',
    `type=volume,source=${secrets},target=/secrets`,
    '--entrypoint',
    'node',
    image,
    '-e',
    `const fs=require('node:fs'); fs.writeFileSync('/secrets/operator.key',require('node:crypto').randomBytes(32),{mode:0o440});fs.chownSync('/secrets/operator.key',0,65532);`,
  ]);
  const pin = JSON.parse(
    output([
      'run',
      '--rm',
      ...security,
      ...stateMount,
      ...secretMount,
      ...env,
      image,
      'initialize',
    ]),
  );
  docker(
    [
      'run',
      '--rm',
      '-i',
      '--user',
      '0:0',
      '--mount',
      `type=volume,source=${secrets},target=/secrets`,
      '--entrypoint',
      'node',
      image,
      '-e',
      `const fs=require('node:fs'); fs.writeFileSync('/secrets/pin.json',JSON.stringify(JSON.parse(fs.readFileSync(0,'utf8'))),{mode:0o444});`,
    ],
    JSON.stringify(pin),
  );
  check('Explicit initialization publishes a pinned identity using external secret custody');
  const refused = docker(
    [
      'run',
      '--rm',
      ...security,
      '--mount',
      `type=volume,source=${missing},target=/data`,
      ...secretMount,
      ...env,
      image,
      'api',
    ],
    undefined,
    true,
  );
  assert.equal(refused.status, 1);
  check('Ordinary API startup refuses an uninitialized volume');
  output([
    'run',
    '-d',
    '--name',
    api,
    '--label',
    'done.test=public-runtime',
    ...security,
    '--publish',
    '127.0.0.1::8080',
    ...stateMount,
    ...secretMount,
    ...env,
    image,
    'api',
  ]);
  containers.push(api);
  await ready(api, 'api');
  const contender = docker(
    [
      'run',
      '--rm',
      ...security,
      '--network',
      'none',
      ...stateMount,
      ...secretMount,
      ...env,
      image,
      'api',
    ],
    undefined,
    true,
  );
  assert.equal(contender.status, 1);
  assert.match(contender.stderr, /in use/);
  check('A second container cannot take ownership of the same live store');
  startApp();
  await ready(app, 'app');
  const mapping = output(['port', api, '8080/tcp']);
  assert.match(mapping, /^127\.0\.0\.1:\d+$/);
  const port = Number(mapping.split(':')[1]);
  const config = await exchange(port, '/__account-setup/config', '{}');
  assert.equal(config.status, 200);
  assert.deepEqual(JSON.parse(config.bytes), {
    v: 2,
    pin,
    networkSessions: true,
    membershipContinuation: true,
  });
  assert.equal(
    (await exchange(port, '/__account-setup/config', '{}', { Origin: 'https://other.example.com' }))
      .status,
    403,
  );
  assert.notEqual((await exchange(port, '/account/delivery/submit', '{}')).status, 200);
  for (const path of ['/etc/done/operator.key', '/src/main.tsx'])
    assert.equal((await exchange(port, path)).status, 404);
  check('Keyless app container serves the session API through exact-origin scoped boundaries');
  const worker = (await exchange(port, '/sw.js')).bytes.toString();
  const precache = JSON.parse(worker.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
  const integrity = JSON.parse(worker.match(/const INTEGRITY = (\{[^\n]*\});/)[1]);
  for (const path of precache) {
    const res = await exchange(port, path);
    assert.equal(res.status, 200);
    assert.equal(createHash('sha256').update(res.bytes).digest('hex'), integrity[path]);
  }
  evidence.precacheUrls = precache.length;
  check('Every packaged service-worker precache response matches its recorded bytes');
  const retryKey = randomBytes(32).toString('base64url');
  const begin = await exchange(
    port,
    '/__account-setup/begin',
    JSON.stringify({ operation: 'register', retryKey }),
  );
  assert.equal(begin.status, 200);
  output(['stop', '--time', '20', app]);
  output(['rm', app]);
  containers.splice(containers.indexOf(app), 1);
  output(['kill', '--signal', 'KILL', api]);
  assert.equal(output(['wait', api]), '137');
  output(['start', api]);
  await ready(api, 'api');
  startApp();
  await ready(app, 'app');
  // Docker may allocate a new host port on restart; use the actual endpoint again.
  const restartedPort = Number(output(['port', api, '8080/tcp']).split(':')[1]);
  const resumed = await exchange(
    restartedPort,
    '/__account-setup/resume',
    JSON.stringify({ retryKey }),
  );
  assert.equal(resumed.status, 200);
  assert.deepEqual(JSON.parse(resumed.bytes), JSON.parse(begin.bytes));
  assert.deepEqual(
    JSON.parse((await exchange(restartedPort, '/__account-setup/config', '{}')).bytes).pin,
    pin,
  );
  check(
    'SIGKILL/restart reacquires ownership and preserves identity plus the accepted registration attempt',
  );
  output(['stop', '--time', '20', app]);
  output(['stop', '--time', '20', api]);
  assert.equal(output(['inspect', api, '--format', '{{.State.ExitCode}}']), '0');
  assert.equal(output(['inspect', app, '--format', '{{.State.ExitCode}}']), '0');
  const retried = JSON.parse(
    output([
      'run',
      '--rm',
      ...security,
      ...stateMount,
      ...secretMount,
      ...env,
      image,
      'initialize',
    ]),
  );
  assert.deepEqual(retried, pin);
  check('Graceful stop exits cleanly; explicit initialization retry retains the existing identity');
  evidence.ok = true;
} catch (cause) {
  evidence.ok = false;
  evidence.error = cause instanceof Error ? cause.message : 'unknown';
  console.error(evidence.error);
  process.exitCode = 1;
} finally {
  const cleanup = [];
  for (const name of [...containers].reverse())
    if (docker(['rm', '-f', name], undefined, true).status !== 0) cleanup.push(name);
  for (const name of [...volumes].reverse())
    if (docker(['volume', 'rm', name], undefined, true).status !== 0) cleanup.push(name);
  evidence.cleanupFailures = cleanup;
  if (cleanup.length) {
    process.exitCode = 1;
    console.error('Cleanup needs attention:', cleanup.join(', '));
  }
  evidence.finished = new Date().toISOString();
  const directory = resolve('test-results/public-runtime', evidence.started.replaceAll(':', '-'));
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, 'container-smoke.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log('Evidence:', directory);
}
