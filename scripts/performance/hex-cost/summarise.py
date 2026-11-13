"""Phase 559: tables from the hex-cost probe results written by run.sh.
Usage: python3 -I scripts/performance/hex-cost/summarise.py <out-dir>
Prints Markdown tables: each cell's runs as min to max (median over runs in brackets where three or
more runs exist). Time is the first call in a fresh process and the median of the timed reps;
peak is the rise in maxRSS over the first call (the cell's own peak, input and harness excluded)."""
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

out = Path(sys.argv[1])


def spread(values, digits=1):
    values = [v for v in values if v is not None]
    if not values:
        return ''
    fmt = f'{{:,.{digits}f}}'
    lo, hi = min(values), max(values)
    text = fmt.format(lo) if lo == hi else f'{fmt.format(lo)}–{fmt.format(hi)}'
    if len(values) >= 3 and lo != hi:
        text += f' ({fmt.format(statistics.median(values))})'
    return text


def size(n):
    return f'{n >> 20} MiB' if n >= 1 << 20 else f'{n >> 10} KiB' if n >= 1024 else f'{n} B'


if (out / 'routines.jsonl').exists():
    routines = [json.loads(l) for l in (out / 'routines.jsonl').read_text().splitlines() if l]
    cells = defaultdict(list)
    for r in routines:
        cells[(r['routine'], r['bytes'])].append(r)
    order = ['reference-hex', 'custody-hex', 'protocol-hex', 'option-byte-textdecoder',
             'option-chunked-fromcharcode', 'floor-tohex', 'lowerhexbytes', 'unhex',
             'option-encodeinto-lowerhexbytes', 'floor-fromhex']
    sizes = sorted({r['bytes'] for r in routines})
    print('### Routines as first built, slots at every length (one routine and size per process; runs: ' +
          str(max(len(v) for v in cells.values())) + ')\n')
    print('| routine | bytes | first call ms | median rep ms | peak rise MiB | ratio to reference (median rep) |')
    print('|---|---|---|---|---|---|')
    for name in order:
        for n in sizes:
            rows = cells.get((name, n))
            if not rows:
                continue
            decoder = name in ('lowerhexbytes', 'unhex', 'option-encodeinto-lowerhexbytes', 'floor-fromhex')
            ref = cells.get(('lowerhexbytes' if decoder else 'reference-hex', n))
            ratio = ''
            if ref and name not in ('reference-hex', 'lowerhexbytes'):
                mine = statistics.median(r['medianMs'] for r in rows)
                ratio = f"{statistics.median(r['medianMs'] for r in ref) / mine:.1f}x" if mine else 'n/a'
            digits = 5 if n < 1 << 10 else 4 if n < 1 << 16 else 3 if n < 1 << 20 else 1
            print(f"| {name} | {size(n)} | {spread([r['firstMs'] for r in rows], digits)} | "
                  f"{spread([r['medianMs'] for r in rows], digits)} | "
                  f"{spread([r['firstPeakDeltaMiB'] for r in rows])} | {ratio} |")
    base = cells.get(('none', sizes[-1]))
    if base:
        print(f"\nHarness and input alone (`none`): peak {spread([r['peakMiB'] for r in cells[('none', sizes[0])]])} MiB "
              f"at {size(sizes[0])}, {spread([r['peakMiB'] for r in base])} MiB at {size(sizes[-1])}.")

final_path = out / 'final.jsonl'
if final_path.exists():
    # The routines as finally built (join below HEX_SLOTS_FROM, slots from it) against the base.
    final = [json.loads(l) for l in final_path.read_text().splitlines() if l]
    fcells = defaultdict(list)
    for r in final:
        fcells[(r['routine'], r['bytes'])].append(r)
    print('\n### Final routines against the base (separate runs)\n')
    print('| routine | bytes | first call ms | median rep ms | peak rise MiB | base / this (median rep) |')
    print('|---|---|---|---|---|---|')
    for n in sorted({r['bytes'] for r in final}):
        for name in ['reference-hex', 'custody-hex', 'protocol-hex']:
            rows = fcells.get((name, n))
            if not rows:
                continue
            ratio = ''
            if name != 'reference-hex' and fcells.get(('reference-hex', n)):
                ratio = f"{statistics.median(r['medianMs'] for r in fcells[('reference-hex', n)]) / statistics.median(r['medianMs'] for r in rows):.2f}x"
            digits = 5 if n < 1 << 10 else 4 if n < 1 << 16 else 3 if n < 1 << 20 else 1
            print(f"| {name} | {size(n)} | {spread([r['firstMs'] for r in rows], digits)} | "
                  f"{spread([r['medianMs'] for r in rows], digits)} | "
                  f"{spread([r['firstPeakDeltaMiB'] for r in rows])} | {ratio} |")

legacy_path = out / 'legacy.jsonl'
if legacy_path.exists():
    # A second set of runs: the legacy source's own helper beside the current hex, same session.
    legacy = [json.loads(l) for l in legacy_path.read_text().splitlines() if l]
    lcells = defaultdict(list)
    for r in legacy:
        lcells[(r['routine'], r['bytes'])].append(r)
    print('\n### Legacy source helper beside the current hex (separate runs)\n')
    print('| routine | bytes | first call ms | median rep ms | peak rise MiB | ratio (median rep) |')
    print('|---|---|---|---|---|---|')
    for n in sorted({r['bytes'] for r in legacy}):
        for name in ['legacy-source-hex', 'custody-hex']:
            rows = lcells.get((name, n))
            if not rows:
                continue
            ratio = ''
            if name == 'custody-hex' and lcells.get(('legacy-source-hex', n)):
                ratio = f"{statistics.median(r['medianMs'] for r in lcells[('legacy-source-hex', n)]) / statistics.median(r['medianMs'] for r in rows):.1f}x"
            digits = 5 if n < 1 << 10 else 4 if n < 1 << 16 else 3 if n < 1 << 20 else 1
            print(f"| {name} | {size(n)} | {spread([r['firstMs'] for r in rows], digits)} | "
                  f"{spread([r['medianMs'] for r in rows], digits)} | "
                  f"{spread([r['firstPeakDeltaMiB'] for r in rows])} | {ratio} |")

codec_path = out / 'codec.jsonl'
if codec_path.exists():
    codec = [json.loads(l) for l in codec_path.read_text().splitlines() if l]
    groups = defaultdict(list)
    for r in codec:
        groups[(r['op'], r['mib'], r['arm'])].append(r)
    print('\n### Local-baseline codec (one operation, size and arm per process)\n')
    print('| operation | encoded | arm | first call ms | reps ms (all runs) | peak rise MiB | process peak MiB |')
    print('|---|---|---|---|---|---|---|')
    for op, mib in [('encode', 8), ('decode', 8), ('auth', 8), ('decode', 32), ('auth', 32)]:
        for arm in ['reference', 'current', 'floor']:
            rows = groups.get((op, mib, arm))
            if not rows:
                continue
            seen = {(r['hexSeen'], r['lowerHexBytesSeen']) for r in rows}
            assert len(seen) == 1, seen
            reps = [x for r in rows for x in r['repMs']]
            print(f"| {op} | {rows[0]['encodedBytes']:,} B | {arm} ({'/'.join(next(iter(seen)))}) | "
                  f"{spread([r['firstMs'] for r in rows])} | {spread(reps)} | "
                  f"{spread([r['firstPeakDeltaMiB'] for r in rows])} | {spread([r['peakMiB'] for r in rows])} |")
    print('\n### What the replacement removes from the codec (medians over runs)\n')
    print('| operation | encoded | first call: reference → current (share removed) | reps: reference → current | peak rise: reference → current (share removed) | floor first call | floor peak rise |')
    print('|---|---|---|---|---|---|---|')
    med = lambda rows, key: statistics.median(r[key] for r in rows)
    for op, mib in [('encode', 8), ('decode', 8), ('auth', 8), ('decode', 32), ('auth', 32)]:
        ref, cur, flo = (groups.get((op, mib, a)) for a in ('reference', 'current', 'floor'))
        if not (ref and cur):
            continue
        rf, cf = med(ref, 'firstMs'), med(cur, 'firstMs')
        rr = statistics.median(x for r in ref for x in r['repMs'])
        cr = statistics.median(x for r in cur for x in r['repMs'])
        rp, cp = med(ref, 'firstPeakDeltaMiB'), med(cur, 'firstPeakDeltaMiB')
        print(f"| {op} | {mib} MiB | {rf:,.1f} → {cf:,.1f} ms ({(rf - cf) / rf:.0%}) | {rr:,.1f} → {cr:,.1f} ms ({(rr - cr) / rr:.0%}) | "
              f"{rp:,.1f} → {cp:,.1f} MiB ({(rp - cp) / rp:.0%}) | "
              f"{med(flo, 'firstMs'):,.1f} ms | {med(flo, 'firstPeakDeltaMiB'):,.1f} MiB |")
