"""Run at this phase's source state; --raw also checks locally retained large inputs/builds."""
import base64
import gzip
import hashlib
import json
import math
import statistics
import subprocess
import sys
from pathlib import Path

root = Path.cwd()
packet = Path(__file__).resolve().parent
sha = lambda b: hashlib.sha256(b).hexdigest()


def decode(path):
    data = gzip.decompress(path.read_bytes())
    try:
        value = json.loads(data)
    except (ValueError, UnicodeError):
        return data
    if isinstance(value, dict) and value.get('kind') == 'utf8-line-copy-v1':
        base = path.parent / value['base']
        assert sha(base.read_bytes()) == value['baseCompressedSha256']
        lines = decode(base).decode().splitlines(True)
        data = ''.join(''.join(lines[x['copy'][0]:x['copy'][1]]) if 'copy' in x else x['text']
                       for x in value['operations']).encode()
        assert sha(data) == value['reconstructedArtifact']['normalizedSha256']
    return data


def payload(name):
    return decode(packet / (name + '.gz'))


def read(name):
    return json.loads(payload(name))


index = json.loads((packet / 'artifacts.json').read_bytes())
for item in index:
    assert sha((packet / item['path']).read_bytes()) == item['compressedSha256']
    data = decode(packet / item['path'])
    assert sha(data) == item['decodedSha256']
    assert len(data) == item['decodedBytes']
summary = json.loads((packet / 'summary.json').read_bytes())
assert sha((packet / 'artifacts.json').read_bytes()) == summary['artifactIndexSha256']
assert sum(p.stat().st_size for p in packet.iterdir() if p.is_file()) < 250000
frozen = read('frozen.json')
for key, name in [('protocol', 'protocol.md'), ('build', 'build.mjs'), ('worker', 'worker.mjs'),
                  ('run', 'run.mjs'), ('analysis', 'analyze.mjs')]:
    assert sha(payload(name)) == frozen[key]
observations = read('node-observations.json')
outputs = read('node-output.json')
assert len(observations) == len(outputs) == 54
inputs = read('input-reference.json')
analysis = read('analysis.json')
assert analysis['nodeCriteriaPassed'] is True
seeds = {}
for value in observations.values():
    assert value['startedAt'] > frozen['at']
    assert value['status'] == 'passed'
    assert value['bundleSha256'] == inputs['variants'][value['variant']]['bundle']
    samples = value['samples']
    assert len(samples) == 88
    assert [s['index'] for s in samples] == list(range(88))
    assert [s['phase'] for s in samples] == ['warmup'] * 24 + ['measured'] * 64
    assert all(math.isfinite(s['ms']) and s['ms'] >= 0 for s in samples)
    assert value['initial']['handoff'] == (value['variant'] == 'C')
    assert value['final']['undo'] - value['initial']['undo'] == 88
    assert value['final']['revision'] - value['initial']['revision'] == 88
    assert seeds.setdefault(value['items'], value['seed']) == value['seed']
for value in outputs.values():
    assert value['status'] == 0 and value['signal'] is None
for row in analysis['rows']:
    sessions = {}
    for variant in ['B', 'R', 'C']:
        sessions[variant] = []
        for block in range(6):
            value = observations[f'measure-{block}-{row["items"]}-{variant}.json']
            ms = [s['ms'] for s in value['samples'][24:]]
            sessions[variant].append({'median': statistics.median(ms),
                                      'p95': sorted(ms)[math.ceil(len(ms) * .95) - 1]})
    for comparison in row['comparisons']:
        a, b = sessions[comparison['a']], sessions[comparison['b']]
        medians = [x['median'] / y['median'] for x, y in zip(a, b)]
        tails = [x['p95'] / y['p95'] for x, y in zip(a, b)]
        assert abs(statistics.median(medians) - comparison['ratioMedian']) < 1e-12
        assert sum(x > 1.10 for x in medians) < 4
        assert sum(x > 1.10 for x in tails) < 4
        if comparison['a'] == 'C' and row['items'] >= 10000:
            assert statistics.median(medians) <= .90
            assert sum(x < 1 for x in medians) >= 5
report = read('application-cases.json')
receipt = read('application-receipt.json')
assert report['status'] == receipt['status'] == 'failed'
assert len(report['collected']) == len(report['cases']) == 12
assert sorted(report['collected']) == sorted(c['id'] for c in receipt['contract']['expect']['cases'])
assert [c['status'] for c in report['cases']].count('failed') == 1
assert report['configuration']['workers'] == 1
assert all(p['retries'] == 0 and p['repeatEach'] == 1 for p in report['configuration']['projects'])
assert report['server']['closed'] and receipt['result']['groupDrained']
measurements = payload('application-measurements.jsonl')
assert base64.b64decode(report['measurementArtifact']['base64']) == measurements
assert sha(measurements) == report['measurementArtifact']['sha256']
rows = [json.loads(line) for line in measurements.splitlines()]
assert len(rows) == 30
for project, expected in [('desktop', 12.90000057220459), ('android', 63.5)]:
    row = next(x for x in rows if x['project'] == project and x['metric'] == 'keystroke → paint, card editor')
    assert row['samples'] == 120 and row['value'] == expected
reference = inputs['currentNonDocumentSources']
source = packet / reference['path']
assert sha(source.read_bytes()) == reference['compressedSha256']
assert sha(decode(source)) == reference['reconstructedSha256']
for pin in json.loads(decode(source)):
    if 'sha256' in pin:
        assert sha((root / pin['path']).read_bytes()) == pin['sha256'], pin['path']
preservation = read('preservation.json')
for pin in preservation['personalAndVectorPins'] + preservation['priorPacket']:
    assert sha((root / pin['path']).read_bytes()) == pin['sha256'], pin['path']
for pin in preservation['appendOnlyPrefixes']:
    assert sha((root / pin['path']).read_bytes()[:pin['prefixBytes']]) == pin['prefixSha256']
assert sha((root / 'docs/progress.md').read_bytes().split(b'\n---\n\n## Active slice: Stage 4', 1)[1]) == preservation['L2SuffixSha256']
subprocess.run(['git', 'apply', '--check', '-'], input=payload('activation.patch'), check=True)
if '--raw' in sys.argv:
    for pin in read('raw-artifacts.json'):
        assert sha((root / pin['path']).read_bytes()) == pin['sha256'], pin['path']
print('Verified frozen protocol, 54 sessions, independent decision, failed application gate, source and preservation pins.')
