#!/usr/bin/env python3
"""Per pairing: order of the joining device's first transfer `install` and the approving device's second `deliver`."""
import json, os, re, sys
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = os.path.join(S, 'results')
out = []
for d in sorted(os.listdir(R)):
    mp = os.path.join(R, d, 'meta.json')
    if not os.path.exists(mp): continue
    meta = json.load(open(mp))
    if meta.get('invalid') or meta.get('error'): continue
    log = open(os.path.join(R, d, 'run.log'), errors='replace').read()
    steps = [json.loads(m) for m in re.findall(r'^FLAKE_STEP (\{.*\})$', log, re.M)]
    marks = [json.loads(m) for m in re.findall(r'^FLAKE_MARK (\{.*\})$', log, re.M)]
    svc = [json.loads(l) for l in open(os.path.join(R, d, 'service.jsonl'), errors='replace') if l.strip().startswith('{')]
    starts = {m['test']: m['t'] for m in marks if m.get('name') == 'start'}
    for test in ('two', 'returning'):
        if test not in starts: continue
        t0 = starts[test]
        pair = [s for s in steps if s['test'] == test and s['name'] == 'pairing']
        if not pair: continue
        t1 = t0 + pair[0]['ms'] + 500
        tr = [r for r in svc if r['event'] == 'done' and (r.get('path') or '').endswith('/ceremony/transfer') and t0 <= r['t'] <= t1]
        deliver = [r for r in tr if r.get('action') == 'deliver']
        install = [r for r in tr if r.get('action') == 'install' and r.get('status') == 200]
        margin = (install[0]['t'] - deliver[1]['t']) if len(deliver) > 1 and install else None
        out.append({'run': meta['label'], 'arm': meta['arm'], 'env': meta.get('env', ''), 'test': test, 'pairing_ok': pair[0]['ok'], 'pairing_ms': pair[0]['ms'],
                    'deliver_statuses': [r.get('status') for r in deliver], 'installs': len(install),
                    'install1_minus_deliver2_ms': margin})
json.dump(out, open(os.path.join(S, 'pairing-race.json'), 'w'), indent=1)
print('run | arm | test | pairing | deliver statuses | install#1 - deliver#2 (ms; negative = install first)')
for o in out:
    print(' | '.join(str(x) for x in [o['run'], o['arm'], o['test'], 'ok' if o['pairing_ok'] else 'FAIL', o['deliver_statuses'], o['install1_minus_deliver2_ms']]))
ok = [o for o in out if o['pairing_ok']]; bad = [o for o in out if not o['pairing_ok']]
print('pairings: %d ok, %d failed; failed with a 409 deliver: %d; ok with a 409 deliver: %d' % (len(ok), len(bad), sum(1 for o in bad if 409 in o['deliver_statuses']), sum(1 for o in ok if 409 in o['deliver_statuses'])))
