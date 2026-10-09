"""Verify archived payloads and reconstruct lossless references; run from the repository root.
Use the phase source tree (signed base plus source-patch.diff.gz) for live-source/repair checks.
"""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

folder = Path(__file__).resolve().parent
root = Path.cwd()
sha = lambda data: hashlib.sha256(data).hexdigest()
index = json.loads((folder / 'artifacts.json').read_text())


def decode(path):
    payload = gzip.decompress(path.read_bytes())
    try:
        value = json.loads(payload)
    except (ValueError, UnicodeError):
        return payload
    if not isinstance(value, dict):
        return payload
    if value.get('kind') == 'utf8-line-copy-v1':
        base_path = path.parent / value['base']
        if 'baseCompressedSha256' in value:
            assert sha(base_path.read_bytes()) == value['baseCompressedSha256']
        lines = decode(base_path).decode().splitlines(True)
        payload = ''.join(
            ''.join(lines[op['copy'][0]:op['copy'][1]]) if 'copy' in op else op['text']
            for op in value['operations']
        ).encode()
        assert sha(payload) == value['reconstructedArtifact']['normalizedSha256']
    elif 'sameNormalizedPayloadAs' in value:
        payload = decode(path.parent / value['sameNormalizedPayloadAs'])
        assert sha(payload) == value['reconstructedArtifact']['normalizedSha256']
    return payload


for item in index:
    data = (folder / item['path']).read_bytes()
    assert sha(data) == item['compressedSha256'], item['path']
    assert sha(gzip.decompress(data)) == item['normalizedSha256'], item['path']
    decode(folder / item['path'])

pins = json.loads(decode(folder / 'source-pins.json.gz'))
for name in ['f17-local-handoff', 'f17-local-handoff-final']:
    reference = json.loads(decode(folder / (
        'input--private-tmp-done-f17-local-handoff-' + name + '-workspace-input-reference.json.gz'
    )))['nonDocumentSourcePins']
    values = {pin['path']: pin for pin in pins}
    for path in reference['removedPaths']:
        del values[path]
    for pin in reference['upserts']:
        values[pin['path']] = pin
    encoded = (json.dumps(sorted(values.values(), key=lambda pin: pin['path']), indent=2) + '\n').encode()
    assert sha(encoded) == reference['reconstructedJsonSha256']

for pin in pins:
    if 'sha256' in pin:
        assert sha((root / pin['path']).read_bytes()) == pin['sha256'], pin['path']
for name in ['source-patch.diff.gz', 'publication-repair.diff.gz']:
    subprocess.run(['git', 'apply', '--check', '--reverse', '-'],
                   input=decode(folder / name), check=True, cwd=root)
for pin in json.loads(decode(folder / 'publication-repair-pins.json.gz')):
    assert sha((root / pin['path']).read_bytes()) == pin['afterSha256']

summary = json.loads((folder / 'summary.json').read_text())
for key, name in [('artifactIndexSha256', 'artifacts.json'), ('gatesSha256', 'gates.json'),
                  ('preservationSha256', 'preservation.json')]:
    assert sha((folder / name).read_bytes()) == summary[key]
assert sum(path.stat().st_size for path in folder.iterdir()) < summary['prospectivePacketCeilingBytes']
print(f'Verified {len(index)} archives, reconstructed references, source pins and reversible patches.')
