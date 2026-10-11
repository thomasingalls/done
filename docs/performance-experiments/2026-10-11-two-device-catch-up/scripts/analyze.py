#!/usr/bin/env python3
"""Catch-up analysis for one run directory. Usage: analyze.py <results/NN-label> -> prints and writes analysis.json"""
import json, sys, os, statistics, collections

D = sys.argv[1]
d = json.load(open(os.path.join(D, 'catchup.json')))
svc = [json.loads(l) for l in open(os.path.join(D, 'service.jsonl')) if l.strip()]
rows = d['rows']


def q(v, p):
    if not v:
        return None
    s = sorted(v)
    return round(s[min(len(s) - 1, int(p * len(s)))], 1)


def stats(v):
    return None if not v else {'n': len(v), 'p50': q(v, 0.5), 'p95': q(v, 0.95), 'max': round(max(v), 1), 'mean': round(sum(v) / len(v), 1)}


def short(p):
    return p.replace('/account/', '').replace('/__account-setup/', 'setup/')


# Session tags: A is the tag that submits; B the tag that reads during a catch-up window.
sub = collections.Counter(e['tag'] for e in svc if e['path'] == '/account/delivery/submit' and e['status'] == 200)
tagA = sub.most_common(1)[0][0] if sub else None
out = {'run': os.path.basename(D), 'tagA': tagA, 'phases': []}

# Service cost against ledger length (A's accepted submits number the ledger).
ledger = 0
curve = collections.defaultdict(lambda: collections.defaultdict(list))
for e in sorted(svc, key=lambda e: e['t']):
    if e['path'] == '/account/delivery/submit' and e['status'] == 200 and e['tag'] == tagA:
        ledger += 1
    e['ledger'] = ledger
    if e['status'] == 200 and e['runMs'] >= 0:
        kind = short(e['path'])
        if kind == 'delivery/read-v2':
            kind += ' (entry)' if e['outBytes'] > 400 else ' (empty)'
        curve[kind][ledger // 100 * 100].append(e['runMs'])
out['serviceMsByLedger'] = {k: {str(b): stats(v) for b, v in sorted(bins.items())} for k, bins in curve.items()
                            if k.split(' ')[0] in ('delivery/submit', 'delivery/read-v2', 'membership/v2/discover', 'authority/discover', 'history/v1/checkpoint')}

sampler = d.get('sampler') or {}
for ph in d['phases']:
    on, cv = ph['onlineAt'], ph['convergedAt']
    win = [e for e in svc if on <= e['t'] <= cv + 200]
    reads = collections.Counter(e['tag'] for e in win if e['path'] == '/account/delivery/read-v2')
    tagB = next((t for t, _ in reads.most_common() if t != tagA), None)
    b = [e for e in win if e['tag'] == tagB]
    entries = [e for e in b if e['path'] == '/account/delivery/read-v2' and e['outBytes'] > 400 and e['status'] == 200]
    empties = [e for e in b if e['path'] == '/account/delivery/read-v2' and e['outBytes'] <= 400 and e['status'] == 200]
    P = {'index': ph['index'], 'target': ph['target'], 'keys': ph['keys'], 'positionsBuilt': ph['positions'],
         'ledgerAfterBuild': ph['ledgerPositionsAfter'], 'buildMs': ph['buildMs'], 'db': ph['db'],
         'backlogChars': ph['expectedChars'] - ph['beforeChars'], 'converged': ph['converged'], 'catchupMs': ph['catchupMs'],
         'load': ph.get('load')}
    secs = ph['catchupMs'] / 1000
    P['positionsDelivered'] = len(entries)
    P['positionsPerSecond'] = round(len(entries) / secs, 2)
    P['charsPerSecond'] = round((ph['afterChars'] - ph['beforeChars']) / secs, 2)
    P['keysPerPosition'] = round(ph['keys'] / max(1, ph['positions']), 2)
    # Rate through the backlog, by quarter of delivered positions.
    quarters = []
    if len(entries) >= 8:
        n = len(entries)
        for k in range(4):
            seg = entries[k * n // 4:(k + 1) * n // 4]
            t0 = on if k == 0 else entries[k * n // 4 - 1]['t']
            quarters.append(round(len(seg) / max(0.001, (seg[-1]['t'] - t0) / 1000), 2))
    P['positionsPerSecondByQuarter'] = quarters
    # Requests on B: service view and client view.
    by = collections.defaultdict(list)
    for e in b:
        k = short(e['path'])
        if k == 'delivery/read-v2':
            k += ' (entry)' if e['outBytes'] > 400 else ' (empty)'
        by[(k, e['status'])].append(e)
    P['serviceRequests'] = {f'{k} {s}': {'n': len(v), 'perPosition': round(len(v) / max(1, len(entries)), 2),
                                           'handlingMs': stats([e['ms'] for e in v]), 'runMs': stats([e['runMs'] for e in v]),
                                           'outBytes': stats([e['outBytes'] for e in v])} for (k, s), v in sorted(by.items())}
    cb = [r for r in rows if r['device'] == 'B' and on <= r['start'] <= cv + 200 and r.get('end')
          and '/notifications/' not in r['path'] and '/session/' not in r['path']]
    byc = collections.defaultdict(list)
    for r in cb:
        byc[(short(r['path']), r.get('status'))].append(r['end'] - r['start'])
    P['clientRequests'] = {f'{k} {s}': stats(v) for (k, s), v in sorted(byc.items())}
    P['status429'] = sum(1 for r in cb if r.get('status') == 429)
    # Cycle decomposition from B's client timeline: per delivered position.
    seq = sorted(cb, key=lambda r: r['start'])
    cyc, net, gap_before_entry, gap_after_entry = [], [], [], []
    last_entry_start = None
    # map service outBytes onto client rows by order per path
    svc_reads = [e for e in sorted(b, key=lambda e: e['t']) if e['path'] == '/account/delivery/read-v2']
    cli_reads = [r for r in seq if r['path'] == '/account/delivery/read-v2']
    for r, e in zip(cli_reads, svc_reads):
        r['entry'] = e['outBytes'] > 400
        r['svc'] = e['ms']
    for i, r in enumerate(seq):
        if r['path'] != '/account/delivery/read-v2' or 'entry' not in r or not r['entry']:
            continue
        if last_entry_start is not None:
            cyc.append(r['start'] - last_entry_start)
        last_entry_start = r['start']
        if i > 0:
            gap_before_entry.append(r['start'] - seq[i - 1]['end'])
        if i + 1 < len(seq):
            gap_after_entry.append(seq[i + 1]['start'] - r['end'])
    P['cycleMsPerPosition'] = stats(cyc)
    P['clientGapBeforeEntryReadMs'] = stats(gap_before_entry)
    P['clientGapAfterEntryReadMs'] = stats(gap_after_entry)
    busy = sum(r['end'] - r['start'] for r in cb)
    P['clientRequestTimeShare'] = round(busy / max(1, ph['catchupMs']), 3)
    P['clientRequestMsPerPosition'] = round(busy / max(1, len(entries)), 1)
    P['serviceHandlingMsPerPosition'] = round(sum(e['ms'] for e in b) / max(1, len(entries)), 1)
    # What the user sees.
    lens = [(t, n) for t, n in sampler.get('len', []) if on <= t <= cv + 200]
    steps = [lens[i][1] - lens[i - 1][1] for i in range(1, len(lens))]
    gaps = [lens[i][0] - lens[i - 1][0] for i in range(1, len(lens))]
    P['visible'] = {'updates': len(lens), 'charsPerUpdate': stats(steps), 'msBetweenUpdates': stats(gaps)}
    longs = [x for t, x in sampler.get('long', []) if on <= t <= cv]
    P['longTasks'] = {'n': len(longs), 'totalMs': round(sum(longs)), 'maxMs': round(max(longs)) if longs else 0,
                      'msPerPosition': round(sum(longs) / max(1, len(entries)), 1)}
    c0, c1 = ph['countersBefore'], ph['countersAfter']
    sub0, sub1 = c0['subtle'], c1['subtle']
    P['perPositionCounters'] = {'idbReadTx': round((c1['idbRO'] - c0['idbRO']) / max(1, len(entries)), 1),
                                'idbWriteTx': round((c1['idbRW'] - c0['idbRW']) / max(1, len(entries)), 1),
                                'webCrypto': {k: round((sub1.get(k, 0) - sub0.get(k, 0)) / max(1, len(entries)), 1) for k in sorted(sub1)}}
    if 'profileStart' in ph:
        ps, pe = ph['profileStart'], ph['profileEnd']
        P['profile'] = {'ms': pe - ps, 'positions': sum(1 for e in entries if ps <= e['t'] <= pe),
                        'chars': next((n for t, n in reversed(lens) if t <= pe), 0) - next((n for t, n in reversed(lens) if t <= ps), 0)}
    if 'typeStart' in ph:
        ts, te = ph['typeStart'], ph['typeEnd']
        keys = [k for k in sampler.get('keys', []) if ts - 50 <= k[0] <= te + 50 and len(k[2]) == 1 or (ts - 50 <= k[0] <= te + 50 and k[2] == ' ')]
        edit = [e for e in sampler.get('edit', []) if ts - 500 <= e[0] <= te + 5000 and e[1] >= 0]
        delay = [k[0] - k[1] for k in keys]
        stable = []
        if edit:
            base = edit[0][1]
            for i, k in enumerate(keys):
                want = base + i + 1
                prev, last_rise = None, None
                for t, n in edit:
                    if t < k[1] - 1:
                        prev = n
                        continue
                    if (prev is None or prev < want) and n >= want:
                        last_rise = t
                    prev = n
                if last_rise is not None:
                    stable.append(last_rise - k[1])
        P['typingOnB'] = {'keys': len(keys), 'keydownListenerDelayMs': stats(delay), 'stableTextMs': stats(stable),
                          'positionsDeliveredMeanwhile': sum(1 for e in entries if ts <= e['t'] <= te)}
    out['phases'].append(P)

json.dump(out, open(os.path.join(D, 'analysis.json'), 'w'), indent=1)
for P in out['phases']:
    print(f"--- phase {P['index']}: built {P['positionsBuilt']} positions from {P['keys']} keys ({P['keysPerPosition']} keys/pos), ledger {P['ledgerAfterBuild']}, backlog {P['backlogChars']} chars")
    print(f"    catch-up {P['catchupMs']} ms converged={P['converged']}: {P['positionsDelivered']} positions, {P['positionsPerSecond']}/s, {P['charsPerSecond']} chars/s; by quarter {P['positionsPerSecondByQuarter']}")
    print(f"    cycle/pos {P['cycleMsPerPosition']}; gap before entry read {P['clientGapBeforeEntryReadMs']}; gap after {P['clientGapAfterEntryReadMs']}")
    print(f"    client request ms/pos {P['clientRequestMsPerPosition']} (share {P['clientRequestTimeShare']}); service handling ms/pos {P['serviceHandlingMsPerPosition']}; 429s {P['status429']}")
    for k, v in P['serviceRequests'].items():
        print(f"      svc {k}: n={v['n']} perPos={v['perPosition']} handling={v['handlingMs']} out={v['outBytes'] and v['outBytes']['p50']}")
    for k, v in P['clientRequests'].items():
        print(f"      cli {k}: {v}")
    print(f"    visible {P['visible']}; long tasks {P['longTasks']}; counters/pos {P['perPositionCounters']}")
    for k in ('profile', 'typingOnB'):
        if k in P:
            print(f"    {k}: {P[k]}")
print('service ms by ledger (runMs p50):')
for k, bins in out['serviceMsByLedger'].items():
    print('  ', k, {b: (s['p50'], s['n']) for b, s in bins.items()})
