"""Summarize retained numeric measurements; whole sessions, not keys, are comparison units.
Usage: python3 summarize.py /tmp/done-account-batching > comparisons.json
Accepts plain or gzip-compressed raw captures in the evidence packet too.
"""
import gzip
import json
import math
import pathlib
import sys

root = pathlib.Path(sys.argv[1])

def read(path):
    if path.exists():
        return json.loads(path.read_text())
    return json.loads(gzip.decompress(path.with_suffix(path.suffix + '.gz').read_bytes()))

def describe(values):
    values = sorted(values)
    return {'n': len(values), **({
        'p50': round(values[math.ceil(len(values) * .5) - 1], 1),
        'p95': round(values[math.ceil(len(values) * .95) - 1], 1),
        'max': round(values[-1], 1),
        'mean': round(sum(values) / len(values), 1),
    } if values else {})}

def stable(raw):
    data = raw['data']
    base = data['armed']['baseLength']
    values = []
    for i, key in enumerate(data['keys']):
        want = base + i + 1
        prev = base + i
        last = None
        for item in data['lengths']:
            if item['t'] >= key['t'] - 1 and prev < want <= item['len']:
                last = item['t']
            prev = item['len']
        if last is None:
            raise ValueError('Missing character ' + str(i))
        values.append(last - key['t'])
    return describe(values)

def session(name, mode):
    path = root / name
    report = read(path / (mode + '.summary.json'))
    blocks = []
    for b in report['blocks']:
        if 'keys' not in b:
            continue
        before = b['diagnosticBefore']['ledger']
        after = b['diagnosticAfter']['ledger']
        blocks.append({
            'name': b['name'], 'priorEdits': b['typedBefore'], 'keys': b['keys'],
            'stableTextMs': stable(read(path / (mode + '-' + b['name'] + '.raw.json'))),
            'activeCpuMsPerKey': b['profile']['activeMsPerKey'],
            'work': {k: v - before['work'].get(k, 0) for k, v in after['work'].items()},
            'elapsedWorkMs': {k: round(v['totalMs'] - before['costs'].get(k, {}).get('totalMs', 0), 1) for k, v in after['costs'].items()},
            'queuePeaksAtEnd': after['queuePeaks'],
            'requests': b['network'], 'longTasks': b['longTasks'], 'indicator': b['indicator'],
            'textComplete': b['textComplete'],
        })
    maintenance = [b for b in report['blocks'] if 'maintenance' in b['name']]
    return {'name': name, 'started': report['started'], 'finished': report.get('finished'),
            'host': report['host'], 'blocks': blocks, 'maintenance': maintenance, 'notes': report['notes']}

rows = []
for name in ['baseline-diagnostic', 'matched-baseline', 'matched-publication-1000',
             'matched-coordinated-1000', 'matched-coordinated-2000', 'matched-baseline-repeat',
             'candidate-diagnostic']:
    mode = 'matched' if name.startswith('matched-') else 'diagnostic'
    if (root / name / (mode + '.summary.json')).exists():
        rows.append(session(name, mode))
print(json.dumps(rows, indent=2))
