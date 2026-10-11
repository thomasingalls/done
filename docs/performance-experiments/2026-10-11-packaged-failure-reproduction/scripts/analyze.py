#!/usr/bin/env python3
"""Summarise every run under results/: outcome, step timings, service-side refusals, delivery pipeline timing."""
import json, os, re, sys, collections, statistics
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = os.path.join(S, 'results')
def load_jsonl(p):
    out = []
    if os.path.exists(p):
        for l in open(p, errors='replace'):
            try: out.append(json.loads(l))
            except Exception: pass
    return out
rows = []
for d in sorted(os.listdir(R)):
    meta_p = os.path.join(R, d, 'meta.json')
    if not os.path.exists(meta_p): continue
    meta = json.load(open(meta_p))
    if meta.get('invalid') or meta.get('error'): continue
    log = open(os.path.join(R, d, 'run.log'), errors='replace').read()
    steps = [json.loads(m) for m in re.findall(r'^FLAKE_STEP (\{.*\})$', log, re.M)]
    marks = [json.loads(m) for m in re.findall(r'^FLAKE_MARK (\{.*\})$', log, re.M)]
    first = [json.loads(m) for m in re.findall(r'^FLAKE_FIRST (\{.*\})$', log, re.M)]
    tests = re.findall(r'^\s+([✓✘])\s+\d+ .*?› (two native|a returning)[^\n]*\((\d+\.\d+)(s|m)\)', log, re.M)
    outcome = {('two' if n.startswith('two') else 'returning'): (s == '✓', float(sec) * (60 if unit == 'm' else 1)) for s, n, sec, unit in tests}
    aborts = [json.loads(m) for m in re.findall(r'^FLAKE_ABORTS (\{.*\})$', log, re.M)]
    first_resp = [json.loads(m) for m in re.findall(r'^FLAKE_FIRST_RESPONSES (\{.*\})$', log, re.M)]
    pairing4xx = [json.loads(m) for m in re.findall(r'^FLAKE_PAIRING_4XX (\[.*\])$', log, re.M)]
    fail_at = re.findall(r'at .*?/test/packaged-account/(\w+\.(?:spec\.)?ts):(\d+)', log)
    errors = re.findall(r'^\s+Error: (.*)$', log, re.M)
    svc = load_jsonl(os.path.join(R, d, 'service.jsonl'))
    pids = []
    for r in svc:
        if r['pid'] not in pids: pids.append(r['pid'])
    def tstart(test):
        for m in marks:
            if m.get('test') == test and m.get('name') == 'start': return m['t']
    def mark(test, name):
        for m in marks:
            if m.get('test') == test and m.get('name') == name: return m['t']
    def stepd(test, name):
        for s in steps:
            if s['test'] == test and s['name'] == name: return s
    per = {}
    for i, test in enumerate(['two', 'returning']):
        t0 = tstart(test)
        nxt = tstart('returning') if test == 'two' else None
        ev = [r for r in svc if t0 and r['t'] >= t0 - 3000 and (nxt is None or r['t'] < nxt - 0)]
        if test == 'two' and nxt is None: pass
        cap = [r for r in ev if r['event'] == 'refused']
        done = [r for r in ev if r['event'] == 'done']
        authchg = [r for r in ev if r['event'] in ('auth-failure', 'notify-fail', 'result-refused') and r.get('refusal') == 'authority-changed']
        info = {
            'requests': len(done), 'cap429': len(cap),
            'cap_by_source': dict(collections.Counter(r['source'] for r in cap)),
            'cap_by_path': dict(collections.Counter(r['path'].replace('/account/', '').replace('/__account-setup/', '~') for r in cap).most_common(6)),
            'cap_concurrency': sum(1 for r in cap if r.get('active', 0) >= 16),
            'first_cap_s': round((cap[0]['t'] - t0) / 1000, 1) if cap and t0 else None,
            'last_cap_s': round((cap[-1]['t'] - t0) / 1000, 1) if cap and t0 else None,
            'authority_changed': len(authchg),
            'authority_changed_paths': dict(collections.Counter((r.get('path') or 'notify').replace('/account/', '').replace('/__account-setup/', '~') for r in authchg)),
            'timeouts0': sum(1 for r in done if r.get('status') == 0),
            'budget_min': min([r['budget'] for r in done if 'budget' in r] or [None]),
        }
        # client back-off gaps: after a capacity refusal for (tag,path), time until that tag asks that path again
        gaps = []
        seq = collections.defaultdict(list)
        for r in ev:
            if r['event'] in ('refused', 'done') and r.get('source') == 'scoped': seq[(r.get('tag'), r.get('path'))].append(r)
        for k, lst in seq.items():
            for a, b in zip(lst, lst[1:]):
                if a['event'] == 'refused': gaps.append(b['t'] - a['t'])
        info['backoff_n'] = len(gaps)
        info['backoff_p50_ms'] = round(statistics.median(gaps)) if gaps else None
        info['backoff_max_ms'] = max(gaps) if gaps else None
        if test == 'two':
            st = stepd('two', 'post-maintenance-first-to-second')
            ub = mark('two', 'submit-unblocked')
            if st:
                w0 = st['t'] - 1500  # the add() precedes the step by about a second
                w1 = st['t'] + st['ms']
                win = [r for r in ev if w0 <= r['t'] <= w1 + 200]
                subs = [r for r in win if r.get('path') == '/account/delivery/submit']
                ok_sub = [r for r in subs if r['event'] == 'done' and r.get('status') == 200]
                info['pm'] = {
                    'ok': st['ok'], 'ms': st['ms'],
                    'cap_in_window': sum(1 for r in win if r['event'] == 'refused'),
                    'cap_in_window_by_path': dict(collections.Counter((r.get('path') or '').replace('/account/', '') for r in win if r['event'] == 'refused')),
                    'submit_refused_in_window': sum(1 for r in subs if r['event'] == 'refused'),
                    'first_ok_submit_ms': (ok_sub[0]['t'] - st['t']) if ok_sub else None,
                    'ok_submits': len(ok_sub),
                    'readv2_ok_after_submit_ms': None,
                    'unblocked_to_step_ms': (st['t'] - ub) if ub else None,
                }
                if ok_sub:
                    sender = ok_sub[0].get('tag')
                    reads = [r for r in win if r.get('path') == '/account/delivery/read-v2' and r['event'] == 'done' and r.get('status') == 200 and r.get('tag') != sender and r['t'] >= ok_sub[0]['t']]
                    if reads: info['pm']['readv2_ok_after_submit_ms'] = reads[0]['t'] - st['t']
            st2 = stepd('two', 'post-maintenance-second-to-first')
            if st2: info['pm2'] = {'ok': st2['ok'], 'ms': st2['ms']}
        # enrollment race evidence: ceremony/transfer actions and statuses around the approval
        tr = [r for r in ev if r['event'] == 'done' and (r.get('path') or '').endswith('/ceremony/transfer')]
        info['transfer'] = {
            'deliver200': sum(1 for r in tr if r.get('action') == 'deliver' and r.get('status') == 200),
            'deliver409': sum(1 for r in tr if r.get('action') == 'deliver' and r.get('status') == 409),
            'install200': sum(1 for r in tr if r.get('action') == 'install' and r.get('status') == 200),
            'last_deliver_status': ([r.get('status') for r in tr if r.get('action') == 'deliver'] or [None])[-1],
        }
        inst = [r['t'] for r in tr if r.get('action') == 'install' and r.get('status') == 200]
        d409 = [r['t'] for r in tr if r.get('action') == 'deliver' and r.get('status') == 409]
        info['transfer']['deliver409_after_install_ms'] = (d409[0] - max([t for t in inst if t <= d409[0]] or [d409[0]])) if d409 else None
        if test == 'two' and aborts:
            a = aborts[0]
            f = a['first']
            info['aborts'] = {
                'first_n': len(f), 'second_n': len(a['second']),
                'first_abort_to_unroute_ms': (a['unrouteAt'] - f[0]) if f else None,
                'last_abort_to_unroute_ms': (a['unrouteAt'] - f[-1]) if f else None,
                'first_abort_offsets_ms': [x - f[0] for x in f],
            }
            if first_resp:
                fr = first_resp[0]
                subs = [fr['started'] + x['elapsed'] for x in fr['timings'] if x['path'] == '/account/delivery/submit' and x['status'] == 200 and fr['started'] + x['elapsed'] >= a['unrouteAt']]
                info['aborts']['first_device_submit_ok_after_unroute_ms'] = (subs[0] - a['unrouteAt']) if subs else None
                info['aborts']['first_device_429_after_unroute'] = sum(1 for x in fr['timings'] if x['status'] == 429 and fr['started'] + x['elapsed'] >= a['unrouteAt'])
        pair = stepd(test, 'pairing')
        info['pairing'] = {'ok': pair['ok'], 'ms': pair['ms']} if pair else None
        info['pass'] = outcome.get(test, (None, None))[0]
        info['test_s'] = outcome.get(test, (None, None))[1]
        failed = [s['name'] for s in steps if s['test'] == test and not s['ok']]
        info['failed_step'] = failed[0] if failed else None
        per[test] = info
    samp = load_jsonl(os.path.join(R, d, 'sampler.jsonl'))
    rows.append({'dir': d, 'label': meta['label'], 'arm': meta['arm'], 'env': meta.get('env', ''), 'exit': meta['exit'], 'seconds': meta['seconds'],
                 'loadStart': meta['loadStart'].split()[0], 'loadEnd': meta['loadEnd'].split()[0],
                 'foreign_frac': round(sum(1 for s in samp if s.get('foreignListeners', 0) > 0) / len(samp), 2) if samp else None,
                 'waited': meta.get('waitedForForeign'), 'pairing4xx': pairing4xx, 'errors': errors[:3], 'fail_at': fail_at[:2], 'first_page': first[:1], **per})
json.dump(rows, open(os.path.join(S, 'summary.json'), 'w'), indent=1)
hdr = ['run','exit','s','two','pair_ms','d409','pm1_ms','pm2_ms','429','1st429_s','aborts','ab1->unroute','lastab->unr','sub_ok_after_unr','ret','pair_ms','d409','429','load','foreign']
print(' | '.join(hdr))
for r in rows:
    t, u = r['two'], r['returning']
    pm = t.get('pm') or {}; pm2 = t.get('pm2') or {}; ab = t.get('aborts') or {}
    f = lambda d, k: (str(d.get('ms')) + ('' if d.get('ok', True) else '!')) if d else '-'
    print(' | '.join(str(x) for x in [
        r['label'], r['exit'], r['seconds'],
        'PASS' if t['pass'] else 'FAIL', f(t['pairing'], 0), t['transfer']['deliver409'], f(pm, 0), f(pm2, 0), t['cap429'], t['first_cap_s'],
        ab.get('first_n', '-'), ab.get('first_abort_to_unroute_ms', '-'), ab.get('last_abort_to_unroute_ms', '-'), ab.get('first_device_submit_ok_after_unroute_ms', '-'),
        'PASS' if u['pass'] else 'FAIL', f(u['pairing'], 0), u['transfer']['deliver409'], u['cap429'],
        r['loadStart'] + '->' + r['loadEnd'], r['foreign_frac']]))
