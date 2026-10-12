// Retain numeric observations only; replay fixtures contain synthetic credentials and stay external.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
const [scratch, packet] = process.argv.slice(2);
for (const dir of ['samples', 'profiles', 'logs', 'identity'])
  mkdirSync(join(packet, dir), { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex');
const hashFile = (path) => ({
  path,
  bytes: readFileSync(path).length,
  sha256: sha(readFileSync(path)),
});
const redact = (value) => {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key === 'text') return ['textLength', item.length];
      if (key === 'records') return [key, item.map(({ stores }) => ({ stores }))];
      return [key, redact(item)];
    }),
  );
};
const external = [];
for (const name of [
  'diagnostic-before',
  'diagnostic-before-2',
  'collision-before',
  'collision-after',
  'collision-after-profile',
  'collision-final',
  'ordinary-final',
]) {
  const dir = join(scratch, name),
    source = join(dir, 'result.json');
  if (!existsSync(source)) throw Error('Missing completed observation: ' + name);
  const raw = readFileSync(source),
    result = JSON.parse(raw);
  writeFileSync(
    join(packet, 'samples', name + '.json.gz'),
    gzipSync(JSON.stringify(redact(result)) + '\n'),
  );
  external.push(hashFile(source));
  for (const file of [
    'catchup.cpuprofile',
    'task-profile.json',
    'summary.json',
    'observations.json',
  ]) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    external.push(hashFile(path));
    writeFileSync(
      join(packet, 'profiles', name + '-' + file + '.gz'),
      gzipSync(readFileSync(path)),
    );
  }
}
for (const name of readdirSync(scratch).filter((n) => n.endsWith('.log'))) {
  copyFileSync(join(scratch, name), join(packet, 'logs', name));
  external.push(hashFile(join(scratch, name)));
}
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
for (const name of [
  'diagnostic-dist',
  'collision-before-dist',
  'collision-after-dist',
  'collision-final-dist',
  'ordinary-dist',
]) {
  const dir = join(scratch, name);
  writeFileSync(
    join(packet, 'identity', name + '.json'),
    JSON.stringify(
      walk(dir).map((p) => ({ ...hashFile(p), path: relative(dir, p) })),
      null,
      2,
    ) + '\n',
  );
}
writeFileSync(
  join(packet, 'identity', 'external-results.json'),
  JSON.stringify(external, null, 2) + '\n',
);
const files = execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter((p) => /^(src|test)\//.test(p));
files.push('test/contentInterruptedReuse.test.ts');
writeFileSync(
  join(packet, 'identity', 'identity.json'),
  JSON.stringify(
    {
      parent: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      runtimeAndTests: files.map(hashFile),
      fixtures: [
        '/tmp/done-client-receive/fixture.json',
        join(scratch, 'diagnostic-before-2/deep-received-fixture.json'),
      ].map(hashFile),
      node: process.version,
      note: 'First two diagnostic captures and collision-before use parent runtime. collision-after/profile use the intermediate repair. collision-final and ordinary-final use the final repair. Bundles, maps and credential-bearing replay fixtures stay external. Hash manifests bind them; CPU profiles, numeric results and logs are retained here.',
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  join(packet, 'identity', 'runtime.patch'),
  execFileSync('git', ['diff', '--', 'src']),
);
