#!/usr/bin/env python3
"""Follow-up on 95923cd8 (runs labelled R-*): pairing race, recovery after a refused deliver, delivery margin, 429s."""
import json, os, re, collections, math
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = os.path.join(S, 'results')
short = lambda p: (p or '').replace('/account/', '').replace('/__account-setup/', '~')
pairs, twos, runs = [], [], []
for d in sorted(os.listdir(R)):
    mp = os.path.join(R, d, 'meta.json')
    if not os.path.exists(mp): continue
    meta = json.load(open(mp))
    if meta.get('invalid') or meta.get('error') or not meta['label'].startswith('R-'): continue
    log = open(os.path.join(R, d, 'run.log'), errors='replace').read()
    steps = [json.loads(m) for m in re.findall(r'^FLAKE_STEP (\{.*\})$', log, re.M)]
    marks = [json.loads(m) for m in re.findall(r'^FLAKE_MARK (\{.*\})$', log, re.M)]
    aborts = [json.loads(m) for m in re.findall(r'^FLAKE_ABORTS (\{.*\})$', log, re.M)]
    first_resp = [json.loads(m) for m in re.findall(r'^FLAKE_FIRST_RESPONSES (\{.*\})$', log, re.M)]
    p4 = [json.loads(m) for m in re.findall(r'^FLAKE_PAIRING_4XX (\[.*\])$', log, re.M)]
    svc = [json.loads(l) for l in open(os.path.join(R, d, 'service.jsonl'), errors='replace') if l.strip().startswith('{')]
    samp = [json.loads(l) for l in open(os.path.join(R, d, 'sampler.jsonl'), errors='replace') if l.strip().startswith('{')]
    outcome = {('two' if n.startswith('two') else 'returning'): s == '✓' for s, n in re.findall(r'^\s+([✓✘])\s+\d+ .*?› (two native|a returning)', log, re.M)}
    starts = {m['test']: m['t'] for m in marks if m.get('name') == 'start'}
    errors = re.findall(r'^\s+Error: (.*)$', log, re.M)
    runs.append({'run': meta['label'], 'arm': meta['arm'], 'exit': meta['exit'], 'seconds': meta['seconds'], 'two': outcome.get('two'), 'returning': outcome.get('returning'),
                 'load': meta['loadStart'].split()[0] + '->' + meta['loadEnd'].split()[0],
                 'foreign_frac': round(sum(1 for s in samp if s.get('foreignListeners', 0) > 0) / len(samp), 2) if samp else None, 'errors': errors[:3]})
    for idx, test in enumerate(('two', 'returning')):
        if test not in starts: continue
        t0 = starts[test]
        t_next = starts.get('returning') if test == 'two' else None
        pair = [s for s in steps if s['test'] == test and s['name'] == 'pairing']
        if not pair: continue
        t1 = t0 + pair[0]['ms'] + 500
        ev = [r for r in svc if t0 - 500 <= r['t'] <= t1]
        tr = [r for r in ev if r['event'] == 'done' and (r.get('path') or '').endswith('/ceremony/transfer')]
        deliver = [r for r in tr if r.get('action') == 'deliver']
        install = [r for r in tr if r.get('action') == 'install' and r.get('status') == 200]
        appr = [m['t'] for m in marks if m.get('name') == 'enrollment-approved' and t0 <= m['t'] <= t1]
        cert = [m for m in marks if m.get('name') == 'certified-first' and t0 <= m['t'] <= t1 + 1000]
        refused = [r for r in deliver if r.get('status') == 409]
        bodies = [r.get('body') for r in ev if r['event'] == 'error-body' and (r.get('path') or '').endswith('/ceremony/transfer')]
        exch409 = sum(1 for r in ev if r['event'] == 'done' and (r.get('path') or '').endswith('/ceremony/exchange') and r.get('status') == 409)
        after = [r for r in deliver if refused and r['t'] > refused[0]['t']]
        pairs.append({
            'run': meta['label'], 'arm': meta['arm'], 'test': test, 'pairing_ok': pair[0]['ok'], 'pairing_ms': pair[0]['ms'],
            'deliver_statuses': [r.get('status') for r in deliver], 'installs': len(install),
            'install1_minus_deliver2_ms': (install[0]['t'] - deliver[1]['t']) if len(deliver) > 1 and install else None,
            'refused_deliver': len(refused), 'transfer_409_bodies': bodies, 'exchange_409s': exch409,
            'deliver_attempts_after_refusal': [(r['t'] - refused[0]['t'], r.get('status')) for r in after],
            'approval_to_certified_first_ms': cert[0]['ms'] if cert else None,
            'refusal_to_certified_first_ms': (cert[0]['t'] - refused[0]['t']) if (cert and refused) else None,
            'device_4xx': [(x['device'], short(x['path']), x['status'], x['t'] - appr[0]) for x in (p4[idx] if idx < len(p4) else []) if appr and x['t'] >= appr[0] - 200],
        })
        if test == 'two':
            tev = [r for r in svc if t0 - 500 <= r['t'] and (t_next is None or r['t'] < t_next)]
            cap = [r for r in tev if r['event'] == 'refused']
            st = {s['name']: s for s in steps if s['test'] == 'two'}
            row = {'run': meta['label'], 'arm': meta['arm'], 'pass': outcome.get('two'),
                   'cap429': len(cap), 'cap_by_path': dict(collections.Counter(short(r['path']) for r in cap)), 'first_cap_s': round((cap[0]['t'] - t0) / 1000, 1) if cap else None,
                   'pm1': st.get('post-maintenance-first-to-second'), 'pm2': st.get('post-maintenance-second-to-first'), 'final': st.get('final-verify-snapshot-2')}
            if aborts:
                a = aborts[0]; f = a['first']
                row['aborts_first'] = len(f); row['aborts_second'] = len(a['second'])
                row['first_abort_to_unroute_ms'] = (a['unrouteAt'] - f[0]) if f else None
                row['abort_offsets_ms'] = [x - f[0] for x in f]
                if first_resp:
                    fr = first_resp[0]
                    subs = [fr['started'] + x['elapsed'] for x in fr['timings'] if x['path'] == '/account/delivery/submit' and x['status'] == 200 and fr['started'] + x['elapsed'] >= a['unrouteAt']]
                    row['unroute_to_first_device_submit_ms'] = (subs[0] - a['unrouteAt']) if subs else None
                    pm1 = row['pm1']
                    if pm1 and pm1['ok'] and subs:
                        row['unroute_to_step_start_ms'] = pm1['t'] - a['unrouteAt']
                        row['submit_to_arrival_ms'] = pm1['t'] + pm1['ms'] - subs[0]
                    row['first_device_429_after_unroute'] = sum(1 for x in fr['timings'] if x['status'] == 429 and fr['started'] + x['elapsed'] >= a['unrouteAt'])
                    budget = [r['budget'] for r in tev if r['event'] == 'done' and 'budget' in r and r['t'] <= a['unrouteAt']]
                    row['budget_at_unroute'] = budget[-1] if budget else None
            twos.append(row)
        else:
            tev = [r for r in svc if r['t'] >= t0 - 500]
            cap = [r for r in tev if r['event'] == 'refused']
            runs[-1]['returning_429'] = len(cap); runs[-1]['returning_429_by_path'] = dict(collections.Counter(short(r['path']) for r in cap))
json.dump({'runs': runs, 'pairings': pairs, 'two_device': twos}, open(os.path.join(S, 'followup.json'), 'w'), indent=1)
print('RUNS'); 
for r in runs: print(' ', r['run'], 'exit', r['exit'], 'two', r['two'], 'returning', r['returning'], 'secs', r['seconds'], 'load', r['load'], 'foreign', r['foreign_frac'], 'ret429', r.get('returning_429'), r['errors'])
print('PAIRINGS  run | test | ok | deliver statuses | install#1-deliver#2 ms | refused | attempts after refusal (ms,status) | approval->certified(first) ms | refusal->certified(first) ms')
for p in pairs: print(' ', ' | '.join(str(x) for x in [p['run'], p['test'], 'ok' if p['pairing_ok'] else 'FAIL', p['deliver_statuses'], p['install1_minus_deliver2_ms'], p['refused_deliver'], p['deliver_attempts_after_refusal'], p['approval_to_certified_first_ms'], p['refusal_to_certified_first_ms']]))
print('TWO-DEVICE  run | pass | pm1 ms | pm2 ms | final verify | 429 | first 429 s | aborts first/second | first-abort->unroute | unroute->first-device submit | submit->arrival | budget at unroute')
for t in twos:
    f = lambda s: (str(s['ms']) + ('' if s['ok'] else '!')) if s else '-'
    print(' ', ' | '.join(str(x) for x in [t['run'], t['pass'], f(t['pm1']), f(t['pm2']), f(t['final']), t['cap429'], t['first_cap_s'], '%s/%s' % (t.get('aborts_first'), t.get('aborts_second')), t.get('first_abort_to_unroute_ms'), t.get('unroute_to_first_device_submit_ms'), t.get('submit_to_arrival_ms'), t.get('budget_at_unroute')]))
    print('      429 by path:', t['cap_by_path'])
