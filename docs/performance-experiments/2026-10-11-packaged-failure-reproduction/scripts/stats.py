#!/usr/bin/env python3
"""Rates with exact binomial intervals, and Fisher exact comparisons, from summary.json / pairing-race.json / delivery-decomp.json."""
import json, os, math
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def comb(n, k): return math.comb(n, k)
def binom_cdf(k, n, p): return sum(comb(n, i) * p**i * (1-p)**(n-i) for i in range(0, k+1))
def cp(k, n, alpha=0.05):
    if n == 0: return (None, None)
    def solve(f, lo=0.0, hi=1.0):
        for _ in range(60):
            mid = (lo+hi)/2
            if f(mid): lo = mid
            else: hi = mid
        return (lo+hi)/2
    low = 0.0 if k == 0 else solve(lambda p: 1 - binom_cdf(k-1, n, p) < alpha/2)
    high = 1.0 if k == n else solve(lambda p: binom_cdf(k, n, p) > alpha/2)
    return (round(low, 2), round(high, 2))
def fisher(a, b, c, d):
    n = a+b+c+d; r1 = a+b; c1 = a+c
    def p(x): return comb(r1, x) * comb(n-r1, c1-x) / comb(n, c1)
    p0 = p(a); lo = max(0, c1-(n-r1)); hi = min(r1, c1)
    return round(sum(p(x) for x in range(lo, hi+1) if p(x) <= p0 + 1e-12), 3)
runs = json.load(open(os.path.join(S, 'summary.json')))
pair = json.load(open(os.path.join(S, 'pairing-race.json')))
dec = json.load(open(os.path.join(S, 'delivery-decomp.json')))
def group(label):
    if label.startswith('S0'): return 'A-smoke'
    if label.startswith('P1-A'): return 'A'
    if label.startswith('P1-B'): return 'B'
    if label.startswith('D1'): return 'D1'
    if label.startswith('D2'): return 'D2'
    if label.startswith('C-'): return 'C'
    return label
out = {}
print('group | runs | runs passing both journeys | pairings failed/total (95% exact) | delivery step reached | delivery >15 s | step ms range | 429s per two-device test (median)')
for g in ['A-smoke', 'A', 'B', 'D1', 'D2', 'C']:
    rs = [r for r in runs if group(r['label']) == g]
    if not rs: continue
    ps = [p for p in pair if group(p['run']) == g]
    ds = [d for d in dec if group(d['run']) == g]
    kf = sum(1 for p in ps if not p['pairing_ok'])
    caps = sorted(r['two']['cap429'] for r in rs if r['two']['pass'] is not None and (r['two'].get('pm')))
    ms = [d['step_ms'] for d in ds if d['ok']]
    late = sum(1 for d in ds if (not d['ok']) or d['step_ms'] > 15000)
    out[g] = {'runs': len(rs), 'runs_pass': sum(1 for r in rs if r['exit'] == 0), 'pairings': len(ps), 'pairings_failed': kf, 'pairing_ci': cp(kf, len(ps)),
              'delivery_reached': len(ds), 'delivery_over_15s': late, 'step_ms': ms}
    print(' | '.join(str(x) for x in [g, len(rs), sum(1 for r in rs if r['exit'] == 0), '%d/%d %s' % (kf, len(ps), cp(kf, len(ps))), len(ds), late,
                                        ('%d-%d' % (min(ms), max(ms))) if ms else '-', caps[len(caps)//2] if caps else '-']))
def pf(gs):
    ps = [p for p in pair if group(p['run']) in gs]
    return sum(1 for p in ps if not p['pairing_ok']), sum(1 for p in ps if p['pairing_ok'])
a = pf(['A', 'A-smoke']); a_only = pf(['A']); b = pf(['B']); binc = pf(['B', 'D1', 'D2']); allinc = pf(['B', 'D1', 'D2', 'C']); c = pf(['C'])
print('pairing failures, reference A (incl. smoke) %s vs incremental B (P1 only) %s: Fisher p=%s' % (a, b, fisher(a[0], a[1], b[0], b[1])))
print('pairing failures, reference A (P1 only) %s vs incremental B (P1 only) %s: Fisher p=%s' % (a_only, b, fisher(a_only[0], a_only[1], b[0], b[1])))
print('pairing failures, reference A (incl. smoke) %s vs all 0332a9ea-incremental runs B+D1+D2 %s: Fisher p=%s' % (a, binc, fisher(a[0], a[1], binc[0], binc[1])))
if c[0] + c[1]:
    print('pairing failures, 4500d9b6 incremental C %s vs 0332a9ea incremental B+D1+D2 %s: Fisher p=%s' % (c, binc, fisher(c[0], c[1], binc[0], binc[1])))
    print('pairing failures, reference A %s vs every incremental run %s: Fisher p=%s' % (a, allinc, fisher(a[0], a[1], allinc[0], allinc[1])))
lim = [d for d in dec if group(d['run']) in ('A-smoke', 'A', 'B', 'D2', 'C')]
print('delivery with the budget in place: %d observations, %d over 15 s; 95%% upper bound on the rate %s; step ms %s' % (len(lim), sum(1 for d in lim if (not d['ok']) or d['step_ms'] > 15000), cp(sum(1 for d in lim if (not d['ok']) or d['step_ms'] > 15000), len(lim))[1], sorted(d['step_ms'] for d in lim)))
print('  of which submit->arrival ms %s' % sorted(d['submit_to_arrival_ms'] for d in lim if d['submit_to_arrival_ms']))
unl = [d for d in dec if group(d['run']) == 'D1']
print('delivery with budgets unlimited: step ms %s; submit->arrival ms %s' % (sorted(d['step_ms'] for d in unl), sorted(d['submit_to_arrival_ms'] for d in unl if d['submit_to_arrival_ms'])))
marg = [p['install1_minus_deliver2_ms'] for p in pair if p['install1_minus_deliver2_ms'] is not None]
okm = sorted(p['install1_minus_deliver2_ms'] for p in pair if p['pairing_ok'] and p['install1_minus_deliver2_ms'] is not None)
badm = sorted(p['install1_minus_deliver2_ms'] for p in pair if not p['pairing_ok'] and p['install1_minus_deliver2_ms'] is not None)
print('install#1 - deliver#2 margin: passing pairings %s..%s ms (n=%d); failing %s..%s ms (n=%d)' % (okm[0], okm[-1], len(okm), badm[0], badm[-1], len(badm)))
json.dump(out, open(os.path.join(S, 'stats.json'), 'w'), indent=1)
