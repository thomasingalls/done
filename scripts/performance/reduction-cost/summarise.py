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
SIZES = [128, 256, 512, 1024, 2048, 4096]


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

if os.environ.get('COVERAGE'):
    # Phase 557: every stage's median over runs, the coverage stage split at the plan's bare
    # coverage report into its row loop and the final replay and comparison, and the loop's
    # whole-document forks and comparisons (counts from the median run). Growth is per doubling.
    def stage_ms(run, x, y):
        a = run['perAttempt'][0]
        st = a['stages']
        end = st.get(y, a['prepareMs']) if y == 'current' else st[y]
        return end - st[x]

    def loop_counts(run):
        sc = run['perAttempt'][0]['stageCounts']
        return {k: sc['coverage-loop'][k] - sc['coverage'][k] for k in sc['coverage-loop']}

    print(f'\nUncached pass by stage, {label} (medians over runs; ms):\n')
    print('| Pairs | Rows | Runs | Opening | Verifying | Building | Coverage | (row loop) | (final replay) | Commit | Total | Loop forks | Loop compares | Fork ms | Compare ms | Coverage growth |')
    print('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
    prev = None
    for pairs in SIZES:
        u = reps(pairs, 'uncached')
        if not u:
            continue
        m = median_run(u)
        cov = statistics.median(stage_ms(r, 'coverage', 'current') for r in u)
        loop = statistics.median(stage_ms(r, 'coverage', 'coverage-loop') for r in u)
        tail = statistics.median(stage_ms(r, 'coverage-loop', 'current') for r in u)
        opening = statistics.median(stage_ms(r, 'opening', 'verifying') for r in u)
        verifying = statistics.median(stage_ms(r, 'verifying', 'building') for r in u)
        building = statistics.median(stage_ms(r, 'building', 'coverage') for r in u)
        commit = statistics.median(r['perAttempt'][0]['commitMs'] for r in u)
        lc = loop_counts(m)
        growth = f'{cov / prev:.2f}' if prev else ''
        prev = cov
        print(
            f"| {pairs} | {m['rows']} | {len(u)} | {opening:.0f} | {verifying:.0f} | {building:.0f} | {cov:.0f} | {loop:.0f} | {tail:.0f} | {commit:.0f} | "
            f"{med(u, 'totalMs'):.0f} | {lc['forks']} | {lc['compares']} | {lc['forkMs']:.0f} | {lc['compareMs']:.0f} | {growth} |"
        )
    print('\nRun-to-run spread of the coverage stage (min–max ms):\n')
    for pairs in SIZES:
        u = reps(pairs, 'uncached')
        if u:
            vals = sorted(stage_ms(r, 'coverage', 'current') for r in u)
            print(f'- {pairs} pairs: ' + ', '.join(f'{v:.0f}' for v in vals))
