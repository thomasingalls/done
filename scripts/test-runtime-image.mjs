/** Final-image regression checks. Only disposable test helpers/state are mounted. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [image, toolsImage, directory] = process.argv.slice(2);
assert(
  image && toolsImage && directory && process.argv.length === 5,
  'Usage: node scripts/test-runtime-image.mjs IMAGE DEPENDENCIES_IMAGE OUTPUT_DIRECTORY',
);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(directory);
mkdirSync(output, { recursive: true });
const helpers = join(output, 'helpers');
mkdirSync(join(helpers, 'bin'), { recursive: true });
mkdirSync(join(helpers, 'lib'), { recursive: true });
const name = 'done-image-helpers-' + randomUUID();
const receipt = { image, toolsImage, checks: [], suites: [], ok: false };
function docker(args, input, timeout = 60000) {
  const result = spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout,
    maxBuffer: 16 * 1024 ** 2,
  });
  if (result.status !== 0) {
    writeFileSync(
      join(output, 'failed-command.json'),
      JSON.stringify(
        {
          args,
          status: result.status,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.error?.message,
        },
        null,
        2,
      ) + '\n',
    );
    throw Error(
      `docker ${args[0]} failed: ${result.error?.message ?? [result.stderr, result.stdout].filter(Boolean).join('\n')}`,
    );
  }
  return result.stdout.trim();
}
const security = ['--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges'];
let created = false;
try {
  receipt.imageId = docker(['image', 'inspect', image, '--format', '{{.Id}}']);
  receipt.platform = docker(['image', 'inspect', image, '--format', '{{.Os}}/{{.Architecture}}']);
  assert.equal(
    receipt.platform,
    docker(['image', 'inspect', toolsImage, '--format', '{{.Os}}/{{.Architecture}}']),
  );
  const inventory = JSON.parse(
    docker([
      'run',
      '--rm',
      ...security,
      '--network',
      'none',
      '--entrypoint',
      'node',
      image,
      '-e',
      `
    const fs=require('node:fs'), cp=require('node:child_process');
    const tools=['sh','bash','busybox','npm','npx','corepack','pnpm','yarn','yarnpkg','apt','apt-get','dpkg','perl','tar','gzip'];
    const found=tools.filter(name=>cp.spawnSync(name,['--version']).error?.code!=='ENOENT');
    const forbidden=['/usr/local/lib/node_modules/npm','/usr/local/lib/node_modules/corepack','/opt/yarn-v1.22.22','/app/test','/app/src','/app/.git','/app/.dev','/app/node_modules/vite'];
    console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),node:process.version,
      found, forbidden:forbidden.filter(p=>fs.existsSync(p)),data:fs.statSync('/data').mode&511,
      dataUid:fs.statSync('/data').uid,ca:fs.statSync('/etc/ssl/certs/ca-certificates.crt').size>0,
      age:cp.execFileSync('age',['--version'],{encoding:'utf8'}).trim(),
      ageBuild:fs.existsSync('/usr/local/share/doc/age/build-info.txt')?fs.readFileSync('/usr/local/share/doc/age/build-info.txt','utf8'):''}));
  `,
    ]),
  );
  assert.equal(inventory.uid, 65532);
  assert.equal(inventory.gid, 65532);
  assert.equal(inventory.node, 'v24.22.1');
  assert.deepEqual(inventory.found, []);
  assert.deepEqual(inventory.forbidden, []);
  assert.equal(inventory.data, 0o770);
  assert.equal(inventory.dataUid, 65532);
  assert(inventory.ca);
  assert.equal(inventory.age, 'v1.3.2');
  assert.match(inventory.ageBuild, /go1\.27\.3/);
  assert.match(inventory.ageBuild, /mod\s+filippo\.io\/age\s+v1\.3\.2\s+h1:/);
  assert.match(inventory.ageBuild, /CGO_ENABLED=0/);
  receipt.inventory = inventory;
  receipt.checks.push(
    'minimal non-root final image, CA bundle and actual age compiler/module inventory',
  );

  // Test-only age-keygen creates disposable fixtures. tar is an independent archive oracle.
  // Its own loader/library path never changes the libraries used by production Node or age.
  docker(['create', '--name', name, '--entrypoint', 'node', toolsImage, '-e', '']);
  created = true;
  docker(['cp', '-L', name + ':/usr/bin/age-keygen', join(helpers, 'bin/age-keygen')]);
  docker(['cp', '-L', name + ':/usr/bin/age', join(helpers, 'old-age')]);
  docker(['cp', '-L', name + ':/usr/bin/gzip', join(helpers, 'bin/gzip')]);
  docker(['cp', '-L', name + ':/usr/bin/tar', join(helpers, 'tar')]);
  const linkage = docker([
    'run',
    '--rm',
    '--network',
    'none',
    '--entrypoint',
    '/usr/bin/ldd',
    toolsImage,
    '/usr/bin/tar',
  ]);
  const libraries = [...linkage.matchAll(/(?:=>\s+|^\s*)(\/\S+)/gm)].map((m) => m[1]);
  const loader = libraries.find((p) => /\/ld-linux[^/]*\.so/.test(p));
  assert(loader, 'tar must have an identified ELF loader');
  for (const path of new Set(libraries))
    docker(['cp', '-L', name + ':' + path, join(helpers, 'lib', path.split('/').at(-1))]);
  writeFileSync(
    join(helpers, 'bin/tar'),
    `#!/usr/local/bin/node
    const r=require('node:child_process').spawnSync(${JSON.stringify('/test-tools/lib/' + loader.split('/').at(-1))},
      ['--library-path','/test-tools/lib','/test-tools/tar',...process.argv.slice(2)],{stdio:'inherit'});
    if(r.error)throw r.error;process.exit(r.status??1);
  `,
    { mode: 0o755 },
  );
  const fixtureMount = ['--mount', `type=bind,source=${helpers},target=/test-tools,readonly`];
  const scratch = ['--tmpfs', '/tmp:rw,noexec,nosuid,size=256m,uid=65532,gid=65532,mode=0700'];
  receipt.ageCompatibility = JSON.parse(
    docker([
      'run',
      '--rm',
      ...security,
      '--network',
      'none',
      ...scratch,
      ...fixtureMount,
      '--entrypoint',
      'node',
      image,
      '-e',
      `
    const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs');
    const run=(cmd,args,input)=>{const r=cp.spawnSync(cmd,args,{input,maxBuffer:4*1024**2,timeout:10000});assert.ifError(r.error);assert.equal(r.status,0,r.stderr.toString());return r.stdout;};
    const key='/tmp/identity',wrong='/tmp/wrong-identity';
    run('/test-tools/bin/age-keygen',['-o',key]);
    run('/test-tools/bin/age-keygen',['-o',wrong]);
    const recipient=run('/test-tools/bin/age-keygen',['-y',key]).toString().trim();
    const old='/test-tools/old-age', current='/usr/local/bin/age';
    assert.equal(run(old,['--version']).toString().trim(),'1.1.1');
    let roundTrips=0,refusals=0;
    for(const [encrypt,decrypt] of [[old,current],[current,old]])for(const length of [0,257,131073]){
      const plain=Buffer.alloc(length);for(let i=0;i<length;i++)plain[i]=i%256;
      const ciphertext=run(encrypt,['-r',recipient],plain);
      assert.deepEqual(run(decrypt,['-d','-i',key],ciphertext),plain);roundTrips++;
      const bad=Buffer.from(ciphertext);bad[bad.length-1]^=1;
      for(const [identity,bytes] of [[wrong,ciphertext],[key,bad]]){
        const rejected=cp.spawnSync(decrypt,['-d','-i',identity],{input:bytes,timeout:10000});
        assert.ifError(rejected.error);assert.equal(rejected.status,1);refusals++;
      }
    }
    fs.rmSync(key);fs.rmSync(wrong);
    console.log(JSON.stringify({old:'1.1.1',current:'v1.3.2',roundTrips,refusals}));
  `,
    ]),
  );
  receipt.checks.push(
    'old/new age X25519 compatibility in both directions, wrong-key and tamper refusal',
  );
  const groups = [
    {
      name: 'runtime-gateway',
      deadline: 15000,
      folders: ['public-runtime'],
      extra: ['test/account-application/gateway.test.mjs'],
    },
    { name: 'backup', deadline: 20000, folders: ['public-backup'], extra: [] },
    { name: 'restore', deadline: 20000, folders: ['public-restore'], extra: [] },
    { name: 'maintenance', deadline: 20000, folders: ['public-maintenance'], extra: [] },
  ];
  for (const group of groups) {
    const files = group.folders.flatMap((folder) =>
      readdirSync(join(root, 'test', folder))
        .filter((file) => file.endsWith('.test.mjs'))
        .sort()
        .map((file) => 'test/' + folder + '/' + file),
    );
    const result = docker(
      [
        'run',
        '--rm',
        ...security,
        '--network',
        'none',
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,size=256m,uid=65532,gid=65532,mode=0700',
        '--mount',
        `type=bind,source=${join(root, 'test')},target=/app/test,readonly`,
        // The gateway unit fixture imports this development-only parser; it is absent in production.
        '--mount',
        `type=bind,source=${join(root, 'scripts/lib/account-config.mjs')},target=/app/scripts/lib/account-config.mjs,readonly`,
        '--mount',
        `type=bind,source=${helpers},target=/test-tools,readonly`,
        '-e',
        'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/test-tools/bin',
        '--entrypoint',
        'node',
        image,
        '--test',
        '--test-reporter=tap',
        '--test-timeout=' + group.deadline,
        ...files,
        ...group.extra,
      ],
      undefined,
      300000,
    );
    writeFileSync(join(output, group.name + '.tap'), result + '\n');
    receipt.suites.push({
      name: group.name,
      files: [...files, ...group.extra],
      perCaseDeadlineMs: group.deadline,
      passed: true,
    });
  }
  receipt.checks.push(
    'real final-image SQLite, native TypeScript workers, age encryption/decryption, backup/restore and maintenance',
  );
  receipt.ok = true;
} catch (error) {
  receipt.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  if (created) docker(['rm', name]);
  rmSync(helpers, { recursive: true, force: true });
  writeFileSync(join(output, 'runtime-image-check.json'), JSON.stringify(receipt, null, 2) + '\n');
}
