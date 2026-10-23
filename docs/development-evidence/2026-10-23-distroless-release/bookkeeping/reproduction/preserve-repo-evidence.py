from pathlib import Path, PurePosixPath
import hashlib, json, shutil, zipfile

repository = Path('/Users/thomasingalls/.codex/worktrees/7fda/done')
origin = Path('/Users/thomasingalls/.codex/state/plugins/codex-security/scans/done/artifacts-ffb7179fa13a9a3b3db4a5702d92b46da31860a25fc2eff324ae69c58b3231cc/artifacts')
destination = repository / 'docs/development-evidence/2026-10-23-distroless-release'
destination.mkdir(parents=True, exist_ok=False)
records = []

def copy(source, relative):
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    data = source.read_bytes()
    target.write_bytes(data)
    assert target.read_bytes() == data
    records.append({'path': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})

archives = [
    ('55-distroless/evidence.zip', 'exploration/evidence.zip', 'artifact-index.json', 'ff108131cdfef8613ee316d0411c08123f60ca2507f984a1ea341aadf8c6b4ea'),
    ('2026-10-23-signed-ux-image/preparation-evidence.zip', 'preparation/evidence.zip', 'preparation-evidence-index.json', 'fc9f96e8ff7ae549cc528811dd2b128f7adf348b53644549913c02914bc9e4d4'),
    ('2026-10-23-arm64-release-final/evidence.zip', 'final-artifact/evidence.zip', 'evidence-index.json', '6054c21e1b9b3bfc984fa528d0c6201b997ccb9796a5eac7a7fa0faa35faf4bc'),
]
verified = []
for name, relative, index_name, expected_hash in archives:
    source = origin / name
    assert hashlib.sha256(source.read_bytes()).hexdigest() == expected_hash
    with zipfile.ZipFile(source) as archive:
        names = archive.namelist()
        assert len(names) == len(set(names))
        for entry in archive.infolist():
            path = PurePosixPath(entry.filename)
            assert not path.is_absolute() and '..' not in path.parts
            assert (entry.external_attr >> 16) & 0o170000 != 0o120000
            assert entry.file_size < 20_000_000
            assert not {'node_modules', 'profiles', 'Default'}.intersection(path.parts)
            assert path.suffix not in ['.pem', '.key', '.sqlite', '.db', '.tar']
        index = json.loads(archive.read(index_name))
        declared = set()
        for entry in index['files']:
            assert entry['path'] not in declared
            declared.add(entry['path'])
            data = archive.read(entry['path'])
            assert len(data) == entry['bytes']
            assert hashlib.sha256(data).hexdigest() == entry['sha256']
        assert set(names) == declared | {index_name}
        output_index = str(Path(relative).parent / index_name)
        (destination / output_index).parent.mkdir(parents=True, exist_ok=True)
        (destination / output_index).write_bytes(archive.read(index_name))
        records.append({'path': output_index, 'bytes': (destination / output_index).stat().st_size, 'sha256': hashlib.sha256((destination / output_index).read_bytes()).hexdigest()})
        verified.append({'path': relative, 'sha256': expected_hash, 'entries': len(names), 'allInnerHashesAndPopulationVerified': True})
    copy(source, relative)

for name in ['README.md', 'source.json', 'image.json', 'verification.json', 'publication-preparation.md', 'publication-preparation.json', 'application-pr57-snapshot.json', 'infra-image-pin.patch', 'infra-image-pin-preparation.json']:
    copy(origin / '2026-10-23-arm64-release-final' / name, 'final-artifact/' + name)
for name in ['HANDOFF.md', 'fix-verification.md', 'scan-summary.json', 'source-image-identities.json']:
    copy(origin / '55-distroless' / name, 'exploration/' + name)

result = {'source': 'd1c2784bef0ccc3ea88d99dfd82f1db3a83af384', 'preservation': 'Exact original artifact bytes; prior external locations are historical provenance. This repository packet is the maintained release evidence home.', 'archives': verified, 'files': sorted(records, key=lambda x: x['path']), 'excluded': ['image/source tar archives', 'private keys', 'service databases', 'browser profiles', 'dependency trees']}
(destination / 'artifact-index.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'directory': str(destination), 'files': len(records), 'archives': verified}, indent=2))
