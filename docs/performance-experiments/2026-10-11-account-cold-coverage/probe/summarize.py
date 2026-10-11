import json, statistics, sys
from pathlib import Path
root = Path(sys.argv[1])
summary = {}
for group, count in [('deep', 5), ('receiver', 3), ('fresh', 3)]:
    summary[group] = {}
    for arm in ['baseline', 'candidate']:
        rows = []
        for i in range(count):
            x = json.loads((root / f'{group}-{i}-{arm}' / 'opens.json').read_text())[0]
            l, m = x['ready']['ledger'], x['ready']['milestones']
            rows.append(dict(frameColdMs=x['frameColdMs'], pollingColdMs=x['coldMs'],
                heapMB=x['heap']/1e6, editMs=x['editMs'],
                preliminaryMs=m['classified']['at']-m['authorized']['at'],
                liveOwnerMs=m['owner']['at']-m['classified']['at'],
                coverageMs=l['timings']['coverageCheck']['totalMs'],
                coverageChecks=l['timings']['coverageCheck']['calls'],
                **l['work'], **{f'native_{k}': v-x['nativeBefore'].get(k,0) for k,v in x['ready']['native'].items()}))
        summary[group][arm] = {'n': len(rows), **{
            key: dict(median=statistics.median(r[key] for r in rows),
                      min=min(r[key] for r in rows), max=max(r[key] for r in rows))
            for key in rows[0]}}
print(json.dumps(summary, indent=2))
