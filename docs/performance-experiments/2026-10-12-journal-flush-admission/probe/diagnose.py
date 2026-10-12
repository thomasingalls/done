"""Correlate queued-key waits with admission flush intervals; elapsed overlap is not CPU."""
import json
import pathlib
import sys

row = json.loads(pathlib.Path(sys.argv[1]).read_text())
flushes = [s for s in row['work'] if s['name'] == 'admissionFlush']
waits = [s for s in row['work'] if s['name'] == 'waitLocal']
rows = []
for wait in sorted(waits, key=lambda s: s['ms'], reverse=True):
    if wait['ms'] < 1:
        continue
    overlap = sum(max(0, min(wait['at'] + wait['ms'], f['at'] + f['ms']) - max(wait['at'], f['at'])) for f in flushes)
    rows.append({**wait, 'flushOverlapMs': overlap})
print(json.dumps({'flushCount': len(flushes), 'flushElapsedMs': sum(f['ms'] for f in flushes),
                  'localQueueWaitMs': sum(s['ms'] for s in waits), 'waitsAbove1Ms': rows}, indent=2))
