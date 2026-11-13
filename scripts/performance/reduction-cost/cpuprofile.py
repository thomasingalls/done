"""Phase 557: summarise a V8 .cpuprofile written by the reduction-cost probe (PROFILE=1).

Usage: python3 -I cpuprofile.py <file.cpuprofile> [top]
Prints the profile's span, the top functions by self time, and inclusive time for the functions
the coverage and verifying stages are made of. Inclusive time counts a sample once per function
even when the function recurses. Times are sample counts times their measured intervals.
"""
import json
import os
import sys
from collections import defaultdict

path = sys.argv[1]
top = int(sys.argv[2]) if len(sys.argv) > 2 else 25
p = json.load(open(path))
nodes = {n['id']: n for n in p['nodes']}
parent = {}
for n in p['nodes']:
    for ch in n.get('children', []):
        parent[ch] = n['id']


def label(n):
    f = n['callFrame']
    url = os.path.basename(f.get('url', '')) or '(native)'
    name = f.get('functionName') or '(anonymous)'
    return f'{name} {url}:{f.get("lineNumber", -1) + 1}'


samples, deltas = p['samples'], p['timeDeltas']
# timeDeltas[i] is the gap before sample i; attribute each sample the gap that follows it.
dur = [deltas[i + 1] if i + 1 < len(deltas) else 0 for i in range(len(samples))]
total = sum(dur) / 1000
self_ms = defaultdict(float)
incl_ms = defaultdict(float)
for s, d in zip(samples, dur):
    ms = d / 1000
    n = nodes[s]
    self_ms[label(n)] += ms
    seen = set()
    cur = s
    while cur is not None:
        lab = label(nodes[cur])
        if lab not in seen:
            seen.add(lab)
            incl_ms[lab] += ms
        cur = parent.get(cur)

print(f'# {os.path.basename(path)}: {total:.0f} ms sampled, {len(samples)} samples')
print(f'\n## Top {top} by self time\n')
print('| Self ms | Share | Function |')
print('|---:|---:|---|')
for lab, ms in sorted(self_ms.items(), key=lambda kv: -kv[1])[:top]:
    print(f'| {ms:.0f} | {100 * ms / total:.1f}% | `{lab}` |')

KEYS = [
    'forkRuntimeDoc', 'readUpdateV2', 'encodeStateAsUpdateV2', 'writeStructsFromTransaction',
    'applyUpdate', 'applyUpdateV2', 'sameDocState', 'snapshot', 'equalSnapshots',
    'createDeleteSetFromStructStore', 'sameEncodedState', 'comparisonEncoding', 'encodeIntegratedState',
    'normalizedIntegratedState', 'sameEncoding', 'equalBytes', 'hasEarlyLongString', 'check', 'has', 'add',
    'hash', 'destroy', '(garbage collector)', 'decodeUpdate', 'integrateStructs', 'readClientsStructRefs',
    'transact', 'cleanupTransactions', 'tryToMergeWithLefts', 'replayFullLocalHistory',
    'verifyInboundLedger', 'decrypt', 'digest', 'verify',
]
print('\n## Inclusive time of named functions (all definitions with that name)\n')
print('| Inclusive ms | Share | Function |')
print('|---:|---:|---|')
rows = []
for lab, ms in incl_ms.items():
    name = lab.split(' ')[0]
    if name in KEYS:
        rows.append((ms, lab))
for ms, lab in sorted(rows, reverse=True)[:top * 2]:
    print(f'| {ms:.0f} | {100 * ms / total:.1f}% | `{lab}` |')
