"""Retain timings/counters only; never publish browser snapshots or credential-bearing state."""
import json
import math
import sys
from collections import Counter
from pathlib import Path


def stats(values):
    values = sorted(v for v in values if v is not None)
    if not values:
        return None
    return {"n": len(values), "p50": values[math.ceil(len(values) * .5) - 1],
            "p95": values[math.ceil(len(values) * .95) - 1], "max": max(values)}


def summarize(path):
    r = json.loads(path.read_text())
    out = {"run": path.parent.name, "source": r['source'], "status": r.get('status', r.get('phase'))}
    if 'requests' not in r:
        out.update({k: r[k] for k in ('profiled', 'cold', 'heap', 'exportHash', 'exportBytes') if k in r})
        t = r.get('typing', {})
        out['typing'] = {k: stats([row.get(k) for row in t.get('rows', [])]) for k in ('frame', 'visible')}
        finish = r.get('typingFinishedAt', float('inf'))
        out['typing']['longTasks'] = stats([row['ms'] for row in t.get('tasks', []) if row['at'] <= finish])
        out['idleLongTasks'] = stats([row['ms'] for row in t.get('tasks', []) if row['at'] > finish])
        if out['status'] != 'passed':
            out['error'] = r.get('error', '').splitlines()[0]
        return out
    started = r.get('started', 0)
    end = r.get('caughtAt', started + 600000)
    deadline_missed = 'caughtAt' not in r or 'primaryDeadlineMissedAt' in r
    out['primaryDeadlineMissed'] = deadline_missed
    out['primaryMs'] = 600000 if deadline_missed else end - started
    out['completionMs'] = end - started if 'caughtAt' in r else None
    out['liveMs'] = stats([row['ms'] for row in r.get('live', [])])
    out.update({k: r[k] for k in ('coldMs', 'heap', 'exportBytes') if k in r})
    out['records'] = [[{'store': s['name'], 'rows': s['rows']} for s in d['stores']] for d in r.get('records', [])]
    requests = r['requests']
    # HTTP response headers are a proxy for acceptance latency, not a durable client timestamp.
    out['requests'] = dict(Counter(f"{v['device']} {v['path']} {v.get('status','pending')}" for v in requests))
    out['requestFailures'] = dict(Counter(v['device'] for v in requests if v.get('failed')))
    if r.get('mode') == 'writer-only':
        accepted = set(json.loads((path.parent / 'accepted-positions.json').read_text()))
        seen = {}
        for v in requests:
            if (v['device'] == 'A' and v['path'].endswith('/submit') and
                    v.get('status') == 200 and v.get('position') in accepted):
                seen.setdefault(v['position'], v['end'])
        times = [seen[k] for k in sorted(seen)]
        return {"run": out['run'], "mode": 'writer-only', "status": out['status'],
                "source": out['source'], "acceptedPositions": sorted(seen),
                "acceptedReplyIntervalMs": stats([b-a for a, b in zip(times, times[1:])]),
                "requests": out['requests'], "requestFailures": out['requestFailures']}
    for label, stop in [('primary', min(end, started + 600000)), ('completedCatchup', end)]:
        q = [v for v in requests if started <= v['at'] <= stop and v['phase'] == 'catchup']
        reads = [v for v in q if v['device'] == 'B' and v['path'].endswith('/read-v2')]
        accepts = sorted(v['end'] for v in q if v['device'] == 'A' and v['path'].endswith('/submit') and v.get('status') == 200)
        out[label] = {'receiverOwnReads': sum(v.get('self') is True for v in reads),
                      'receiverPeerReads': sum(v.get('self') is False for v in reads),
                      'lastPeerAfter': max((v['after'] for v in reads if not v.get('self')), default=None),
                      'writerSubmitReplies': len(accepts),
                      'writerReplyIntervalMs': stats([b-a for a, b in zip(accepts, accepts[1:])]),
                      'receiverSubmitMs': [v['end'] - started for v in q if v['device']=='B' and v['path'].endswith('/submit') and v.get('status') == 200]}
    capture = r.get('capture', r.get('catchupCapture', {}))
    tasks = capture.get('tasks', [])
    out['catchupLongTasksMs'] = stats([v['ms'] for v in tasks if started <= v['at'] <= end])
    typing = r.get('typing', {})
    out['typingFrameMs'] = stats([v['ms'] for v in capture.get('keys', []) if typing.get('start', 0) <= v['at'] <= typing.get('end', 0)])
    out['typingLongTasksMs'] = stats([v['ms'] for v in tasks if typing.get('start', 0) <= v['at'] <= typing.get('end', 0)])
    return out


if __name__ == '__main__':
    print(json.dumps([summarize(Path(p)) for p in sys.argv[1:]], indent=2))
