"""Retain whitelisted numeric diagnostics, not private fixtures or service/browser state."""
import hashlib
import json
import pathlib
import subprocess
import tarfile

repo = pathlib.Path.cwd()
root = pathlib.Path('/tmp/done-bulk-custody-20261012')
out = repo / 'docs/performance-experiments/2026-10-12-bulk-custody'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], text=True)


shared = [
    'docs/performance-experiments/2026-10-12-final-apply/probe/build.config.ts',
    'docs/performance-experiments/2026-10-12-final-apply/probe/analyze.mjs',
    'docs/performance-experiments/2026-10-12-prepared-receive/probe/build.config.ts',
    'docs/performance-experiments/2026-10-12-online-typing/probe/build.config.ts',
    'docs/performance-experiments/2026-10-12-owned-verification/probe/build.config.ts',
    'docs/performance-experiments/2026-10-12-warm-ledger/probe/build.config.ts',
    'docs/performance-experiments/2026-10-12-text-admission/probe/build.config.ts',
    'docs/performance-experiments/2026-10-12-receive-attribution/probe/runtime.mjs',
    'test/packaged-account/devices.ts',
    'test/account-receive-editor/fixtures.mjs',
    'test/account-receive-editor/prepared.test.mjs',
    'pnpm-lock.yaml',
    'package.json',
    'vite.config.ts',
]
fixtures = [
    '/tmp/done-client-receive/fixture.json',
    '/tmp/done-online-typing-20261012/seed-matched-12000/fixture.json',
]
affected = ['src/crdt/startupStorage.ts', 'src/crdt/localGenesisRecord.ts']
(root / 'final-runtime.patch').write_text(git('diff', '902806c9', '--', 'src'))
identities = {
    'base': git('rev-parse', '902806c9').strip(),
    'measuredRuntimePatch': sha(root / 'measured-runtime.patch'),
    'measuredSource': json.loads((root / 'measured-source.json').read_text()),
    'finalRuntimePatch': sha(root / 'final-runtime.patch'),
    'finalSource': {p: sha(repo / p) for p in affected},
    'selectionChange': 'Measured bulk unless flag=0; final bulk only if flag=1. Reader unchanged.',
    'probe': {str(p.relative_to(repo)): sha(p) for p in sorted((out / 'probe').iterdir()) if p.is_file()},
    'tests': {str(p.relative_to(repo)): sha(p) for p in [repo / 'test/custodyBulkRead.test.ts', *sorted((repo / 'test/custody-bulk').glob('*'))]},
    'sharedHelpers': {p: sha(repo / p) for p in shared},
    'builds': {arm: {str(p.relative_to(root / arm)): sha(p) for p in sorted((root / arm).rglob('*')) if p.is_file()} for arm in ['reference', 'candidate', 'ordinary']},
    'fixtures': {p: sha(pathlib.Path(p)) for p in fixtures},
    'buildEnvironment': {
        'reference': {'VITE_ACCOUNT_LEDGER_PROFILE': '1', 'VITE_ACCOUNT_BULK_CUSTODY': '0'},
        'candidate': {'VITE_ACCOUNT_LEDGER_PROFILE': '1', 'VITE_ACCOUNT_BULK_CUSTODY': 'unset (measured bulk default)'},
        'ordinary': 'Final source, both flags unset: no instrumentation, cursor default',
    },
    'environment': {
        'node': subprocess.check_output(['node', '--version'], text=True).strip(),
        'platform': subprocess.check_output(['uname', '-sm'], text=True).strip(),
        'playwright': json.loads((repo / 'node_modules/@playwright/test/package.json').read_text())['version'],
    },
    'privacy': 'Fixture contents, browser/service snapshots, credentials and writing excluded.',
}
(out / 'source-identity.json').write_text(json.dumps(identities, indent=2) + '\n')

files = [root / name for name in [
    'measured-runtime.patch', 'measured-source.json', 'final-runtime.patch', 'result-access.json',
    'build-reference.log', 'build-candidate.log', 'build-ordinary.log', 'budget.log',
    'typecheck.log', 'typecheck-final.log', 'lint.log', 'lint-final.log', 'format-final.log',
    'unit-initial.log', 'units.log', 'units-final.log',
    'native-initial.log', 'native-observer.log', 'native.log', 'native-final.log',
    'prepared-native.log', 'prepared-native-final.log',
]]
for rep in [1, 2]:
    for mode in ['active', 'backlog']:
        for arm in ['reference', 'candidate']:
            name = f'{arm}-{mode}-{rep}'
            files.append(root / f'{name}.log')
            for leaf in ['result.json', 'before-verification.json', 'analysis.json']:
                path = root / name / leaf
                if path.exists():
                    files.append(path)

with tarfile.open(out / 'evidence.tar.gz', 'w:gz') as archive:
    for path in files:
        archive.add(path, arcname=str(path.relative_to(root)))
manifest = {
    'archive': 'evidence.tar.gz',
    'bytes': (out / 'evidence.tar.gz').stat().st_size,
    'sha256': sha(out / 'evidence.tar.gz'),
    'files': [{'path': str(p.relative_to(root)), 'bytes': p.stat().st_size, 'sha256': sha(p)} for p in files],
}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
with tarfile.open(out / 'evidence.tar.gz') as archive:
    for entry in manifest['files']:
        data = archive.extractfile(entry['path']).read()
        assert len(data) == entry['bytes'] and hashlib.sha256(data).hexdigest() == entry['sha256']
print('Verified', len(files), 'evidence files;', manifest['bytes'], 'archive bytes.')
