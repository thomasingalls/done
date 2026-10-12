"""Retain whitelisted numeric diagnostics, not private fixtures or service/browser state."""
import hashlib
import json
import pathlib
import subprocess
import tarfile

repo = pathlib.Path.cwd()
root = pathlib.Path('/tmp/done-membership-work-20261012')
out = repo / 'docs/performance-experiments/2026-10-12-membership-work'


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
affected = git('diff','--name-only','--','src','account-protocol').splitlines()+['account-protocol/proofWork.ts']
(root / 'final-runtime.patch').write_text(git('diff', 'b656553a', '--', 'src', 'account-protocol') + subprocess.run(['git','diff','--no-index','--','/dev/null','account-protocol/proofWork.ts'],text=True,capture_output=True).stdout)
identities = {
    'base': git('rev-parse', 'b656553a').strip(),
    'measuredRuntimePatch': sha(root / 'measured-runtime.patch'),
    'measuredSource': json.loads((root / 'measured-source.json').read_text()),
    'finalRuntimePatch': sha(root / 'final-runtime.patch'),
    'finalSource': {p: sha(repo / p) for p in affected},
    'selectionChange': 'None. Measured candidate is the enabled ordinary default; VITE_ACCOUNT_MEMBERSHIP_WORK=0 selects the reference.',
    'probe': {str(p.relative_to(repo)): sha(p) for p in sorted((out / 'probe').iterdir()) if p.is_file()},
    'tests': {'test/account-membership/locator.test.mjs': sha(repo/'test/account-membership/locator.test.mjs')},
    'sharedHelpers': {p: sha(repo / p) for p in shared},
    'builds': {arm: {str(p.relative_to(root / arm)): sha(p) for p in sorted((root / arm).rglob('*')) if p.is_file()} for arm in ['reference', 'candidate', 'ordinary', 'controls-build', 'operation-reference', 'operation-candidate']},
    'fixtures': {p: sha(pathlib.Path(p)) for p in fixtures},
    'buildEnvironment': {
        'reference': {'VITE_ACCOUNT_LEDGER_PROFILE': '1', 'VITE_ACCOUNT_MEMBERSHIP_WORK': '0'},
        'candidate': {'VITE_ACCOUNT_LEDGER_PROFILE': '1', 'VITE_ACCOUNT_MEMBERSHIP_WORK': 'unset (measured enabled default)'},
        'ordinary': 'Final source, no instrumentation; see README for membership-work disposition. Bulk remains opt-in.',
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
    'measured-runtime.patch', 'measured-source.json', 'final-runtime.patch',
    'build-reference.log', 'build-candidate.log', 'build-ordinary.log', 'budget.log',
    'type-initial.log', 'type-owner.log', 'typecheck.log', 'lint.log', 'format.log',
    'units.log', 'protocol-checks.log', 'protocol-focused.log', 'prepared-native.log',
    'build-controls-initial.log', 'build-controls.log', 'build-controls-final.log',
    'controls-build-missing.log', 'controls.log', 'controls-r3.log',
    'build-operation-reference.log', 'build-operation-candidate.log',
    'operation-reference.log', 'operation-candidate.log',
    'legacy-failure-names.json', 'legacy-comparison.json',
]]
# These broader legacy outputs may include verbose fixture objects. Retain hashes/locations only.
external = [root/n for n in ['protocol-regressions.log','legacy-failures-baseline.log',
                            'legacy-failures-baseline-final.log','legacy-failures-candidate.log']]
for mode in ['valid','context','payload','expired','closed','custody']:
    files.append(root/'controls-r3'/mode/'result.json')
for arm in ['reference','candidate']:
    files.append(root/'operation'/arm/'result.json')
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
    'externalLogs': [{'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p)} for p in external],
    'files': [{'path': str(p.relative_to(root)), 'bytes': p.stat().st_size, 'sha256': sha(p)} for p in files],
}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
with tarfile.open(out / 'evidence.tar.gz') as archive:
    for entry in manifest['files']:
        data = archive.extractfile(entry['path']).read()
        assert len(data) == entry['bytes'] and hashlib.sha256(data).hexdigest() == entry['sha256']
print('Verified', len(files), 'evidence files;', manifest['bytes'], 'archive bytes.')
