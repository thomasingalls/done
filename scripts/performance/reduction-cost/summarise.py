"""Phase 556: tables from reduction-cost probe results.

Usage: python3 -I summarise.py <dir> <label> [arm ...]
Reads <dir>/<label>-<pairs>-<arm>-<rep>.json. Times are medians over repetitions; counts are the
median repetition's. The uncached arm of the same run is the floor. PER_ATTEMPT=<pairs> adds that
size's per-attempt table; STAGES=1 adds the uncached pass by stage.
"""
import glob
import json
import os
import statistics
import sys

d, label = sys.argv[1], sys.argv[2]
arms = sys.argv[3:] or ['sliced']
MiB = 1024 * 1024
SIZES = [128, 256, 512, 1024, 2048]


def reps(pairs, arm):
    out = []
    for p in sorted(glob.glob(os.path.join(d, f'{label}-{pairs}-{arm}-*.json'))):
        out.append(json.load(open(p)))
    return out


def median_run(runs, key='totalMs'):
    ordered = sorted(runs, key=lambda r: r[key])
    return ordered[(len(ordered) - 1) // 2]


def med(runs, key):
    return statistics.median(r[key] for r in runs)


for arm in arms:
    print(f'\n### {label}, {arm}\n')
    print(
        '| Pairs | Rows | Uncached wall ms | Sliced wall ms | Wall ratio | Uncached CPU ms | Sliced CPU ms | CPU ratio | Runs | Attempts | Fenced saves | Inventory reads | Prefix captures | SHA-256 calls / MiB | AES decrypts / MiB | HMAC verifies / MiB | To first miss ms | Fresh ms | Save ms | Largest W MiB |'
    )
    print('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
    for pairs in SIZES:
        u, s = reps(pairs, 'uncached'), reps(pairs, arm)
        if not u or not s:
            continue
        m = median_run(s)
        t = m['totals']
        per = m['perAttempt']
        first = sum(a['firstMissMs'] or 0 for a in per)
        fresh = sum(a['freshMs'] or 0 for a in per)
        w = max(a['durableBytes'] for a in per) / MiB
        attempts = sorted({r['attempts'] for r in s})
        saves = sorted({r['fencedSaves'] for r in s})
        print(
            f"| {pairs} | {m['rows']} | {med(u, 'totalMs'):.0f} | {med(s, 'totalMs'):.0f} | {med(s, 'totalMs') / med(u, 'totalMs'):.2f} | "
            f"{med(u, 'cpuMs'):.0f} | {med(s, 'cpuMs'):.0f} | {med(s, 'cpuMs') / med(u, 'cpuMs'):.2f} | {len(s)} | "
            f"{'–'.join(map(str, attempts))} | {'–'.join(map(str, saves))} | {t['inventoryReads']} | {t['prefixCaptures']} | "
            f"{t['digestCalls']} / {t['digestBytes'] / MiB:.1f} | {t['decryptCalls']} / {t['decryptBytes'] / MiB:.1f} | "
            f"{t['hmacVerifyCalls']} / {t['hmacVerifyBytes'] / MiB:.1f} | {first:.0f} | {fresh:.0f} | {t['saveMs']:.0f} | {w:.1f} |"
        )

pa = os.environ.get('PER_ATTEMPT')
if pa:
    for arm in arms:
        s = reps(int(pa), arm)
        if not s:
            continue
        m = median_run(s)
        print(f'\nPer attempt, {label}, {arm}, {pa} pairs (median run):\n')
        print('| # | Kind | To first miss ms | Fresh ms | Save ms | Hits | Misses | Delta KiB | W MiB | Inventory reads | Prefix captures | AES decrypts |')
        print('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
        for a in m['perAttempt']:
            print(
                f"| {a['n']} | {a['kind']} | {a['firstMissMs'] or 0:.0f} | {a['freshMs'] or 0:.0f} | {a['saveMs']:.0f} | {a['hits']} | {a['misses']} | "
                f"{a['deltaBytes'] / 1024:.0f} | {a['durableBytes'] / MiB:.1f} | {a['inventoryReads']} | {a['prefixCaptures']} | {a['decryptCalls']} |"
            )

if os.environ.get('STAGES'):
    print(f'\nUncached pass by stage, {label} (median run; ms):\n')
    print('| Pairs | Rows | Opening | Verifying | Building | Coverage | Commit | Total |')
    print('|---:|---:|---:|---:|---:|---:|---:|---:|')
    for pairs in SIZES:
        u = reps(pairs, 'uncached')
        if not u:
            continue
        m = median_run(u)
        a = m['perAttempt'][0]
        st = a['stages']
        o, v, b, c = st['opening'], st['verifying'], st['building'], st['coverage']
        cur = st.get('current', a['prepareMs'])
        print(f"| {pairs} | {m['rows']} | {v - o:.0f} | {b - v:.0f} | {c - b:.0f} | {cur - c:.0f} | {a['commitMs']:.0f} | {m['totalMs']:.0f} |")
