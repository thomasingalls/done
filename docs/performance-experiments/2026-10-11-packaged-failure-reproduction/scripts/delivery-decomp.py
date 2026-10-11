#!/usr/bin/env python3
"""Post-maintenance delivery: split arrival into the sender's wait for its next submit attempt and the rest."""
import json, os, re
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
    ab = [json.loads(m) for m in re.findall(r'^FLAKE_ABORTS (\{.*\})$', log, re.M)]
    st = [s for s in steps if s['name'] == 'post-maintenance-first-to-second']
    un = [m['t'] for m in marks if m.get('name') == 'submit-unblocked']
    blk = [m['t'] for m in marks if m.get('name') == 'submit-blocked']
    t_start = [m['t'] for m in marks if m.get('test') == 'two' and m.get('name') == 'start']
    if not st or not un: continue
    st = st[0]; un = un[0]
    svc = [json.loads(l) for l in open(os.path.join(R, d, 'service.jsonl'), errors='replace') if l.strip().startswith('{')]
    arrival = st['t'] + st['ms']
    win = [r for r in svc if un <= r['t'] <= arrival + 100]
    subs = [r for r in win if r['event'] == 'done' and r.get('path') == '/account/delivery/submit' and r.get('status') == 200]
    # The reopened second device submits its retained original within about a second of going online;
    # the first device's submit is the first accepted one more than 2.5 s after unblocking (checked against
    # the first-device response listener where that exists).
    late = [r for r in subs if r['t'] - un > 2500]
    first_sub = late[0]['t'] if late else None
    budget_at_unblock = next((r['budget'] for r in reversed(svc) if r['t'] <= un and r['event'] == 'done' and 'budget' in r), None)
    row = {
        'run': meta['label'], 'arm': meta['arm'], 'env': meta.get('env', ''), 'ok': st['ok'],
        'start_to_blocked_s': round((blk[0] - t_start[0]) / 1000, 1) if blk and t_start else None,
        'blocked_phase_s': round((un - blk[0]) / 1000, 1) if blk else None,
        'budget_at_unblock': budget_at_unblock,
        'aborts_first': len(ab[0]['first']) if ab else None,
        'first_abort_to_unblock_ms': (ab[0]['unrouteAt'] - ab[0]['first'][0]) if ab and ab[0]['first'] else None,
        'abort_offsets_ms': [x - ab[0]['first'][0] for x in ab[0]['first']] if ab and ab[0]['first'] else None,
        'unblock_to_first_device_submit_ms': (first_sub - un) if first_sub else None,
        'submit_to_arrival_ms': (arrival - first_sub) if (first_sub and st['ok']) else None,
        'unblock_to_arrival_ms': (arrival - un) if st['ok'] else None,
        'step_ms': st['ms'],
        'cap429_unblock_to_arrival': sum(1 for r in win if r['event'] == 'refused'),
        'requests_ok_unblock_to_arrival': sum(1 for r in win if r['event'] == 'done' and r.get('source') == 'scoped'),
        'accepted_submits_in_window': len(subs),
    }
    out.append(row)
json.dump(out, open(os.path.join(S, 'delivery-decomp.json'), 'w'), indent=1)
cols = ['run', 'ok', 'blocked_phase_s', 'budget_at_unblock', 'aborts_first', 'first_abort_to_unblock_ms', 'unblock_to_first_device_submit_ms', 'submit_to_arrival_ms', 'step_ms', 'cap429_unblock_to_arrival', 'accepted_submits_in_window']
print(' | '.join(cols))
for r in out: print(' | '.join(str(r[c]) for c in cols))
