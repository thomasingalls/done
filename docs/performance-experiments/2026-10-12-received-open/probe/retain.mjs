import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
const [scratch, packet] = process.argv.slice(2);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const describe = (path) => {
  const b = readFileSync(path);
  return { path, bytes: b.length, sha256: sha(b) };
};
for (const part of ['samples', 'profiles', 'logs', 'identity'])
  mkdirSync(join(packet, part), { recursive: true });
const external = [];
for (const arm of [
  'baseline',
  'baseline-profile',
  'coverage-only',
  'candidate',
  'candidate-profile',
  'final',
  'baseline-confirm',
  'final-profile',
  'final-profile-isolated',
]) {
  for (const file of ['opens.json', 'profile.json', 'cold-0.cpuprofile']) {
    const path = join(scratch, arm, file);
    if (!existsSync(path)) continue;
    external.push(describe(path));
    writeFileSync(
      join(packet, file === 'opens.json' ? 'samples' : 'profiles', arm + '-' + file + '.gz'),
      gzipSync(readFileSync(path), { level: 9 }),
    );
  }
}
const redact = (v) => {
  if (Array.isArray(v)) return v.map(redact);
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(
    Object.entries(v).map(([k, x]) => {
      if (k === 'text') return ['textLength', x.length];
      if (k === 'records') return [k, x.map(({ stores }) => ({ stores }))];
      return [k, redact(x)];
    }),
  );
};
const live = join(scratch, 'live-receive/result.json');
external.push(describe(live));
writeFileSync(
  join(packet, 'samples/live-receive.json.gz'),
  gzipSync(JSON.stringify(redact(JSON.parse(readFileSync(live)))), { level: 9 }),
);
for (const file of [
  'native.log',
  'native-final.log',
  'contract-final.log',
  'contract-repaired.log',
  'unit-final.log',
  'live-receive.log',
  'build.log',
  'coverage-build.log',
  'candidate-build.log',
  'final-build.log',
]) {
  const path = join(scratch, file);
  external.push(describe(path));
  writeFileSync(join(packet, 'logs', file + '.gz'), gzipSync(readFileSync(path), { level: 9 }));
}
const code = [
  'src/crdt/yjs.ts',
  'src/crdt/inboundLedger.ts',
  'src/crdt/inboundRecord.ts',
  'src/crdt/accountReceive.ts',
  'src/crdt/accountLedgerMetrics.ts',
  'account-protocol/inboundTransport.ts',
];
const tests = [
  'test/preparedCoverage.test.ts',
  'test/incrementalLedger.test.ts',
  'test/accountInboundCodec.test.ts',
  'test/account-receive/fixtures.mjs',
  'test/account-ledger-contract/runtime.mjs',
  'test/account-ledger-contract/controls.test.mjs',
];
writeFileSync(
  join(packet, 'identity/repair.patch'),
  execFileSync('git', ['diff', '--', ...code, ...tests]),
);
const allFiles = (root) =>
  readdirSync(root, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? allFiles(join(root, e.name)) : [join(root, e.name)],
  );
writeFileSync(
  join(packet, 'identity/source.json'),
  JSON.stringify(
    {
      base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      code: code.map(describe),
      tests: tests.map(describe),
      node: process.version,
      fixture: describe(
        '/tmp/done-foreground-stall-20261012/diagnostic-before-2/deep-received-fixture.json',
      ),
      variants: {
        baseline: 'signed d1e5e5ea ordinary bundle from foreground-stall packet',
        coverage: 'coverage-doc lifetime and positive proof only',
        candidate: 'coverage plus outer stored receipt validation',
        final: 'also avoid nested request/page re-encoding',
      },
      bundles: Object.fromEntries(
        [
          ['baseline', '/tmp/done-foreground-stall-20261012/ordinary-dist'],
          ['coverage', join(scratch, 'coverage-dist')],
          ['candidate', join(scratch, 'candidate-dist')],
          ['final', join(scratch, 'final-dist')],
        ].map(([name, path]) => [name, allFiles(path).sort().map(describe)]),
      ),
      note: 'External bundles/maps/fixtures stay on disk. The fixture contains disposable credentials and must not be committed. final-profile overlaps unit tests and is confounded; final-profile-isolated is the final attribution. live-receive is a functional journey, not an isolated performance comparison.',
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(join(packet, 'identity/external.json'), JSON.stringify(external, null, 2) + '\n');
