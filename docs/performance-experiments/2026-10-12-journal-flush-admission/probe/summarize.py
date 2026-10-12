"""Session-level descriptive statistics; profiling and pilot observations are not pooled."""
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])


def q(values):
    values = sorted(values)
    return [round(values[min(int(len(values) * p), len(values) - 1)], 2) for p in [.5, .95, 1]]


summary = {}
for arm in ['reference', 'background']:
    for index in [1, 2, 3]:
        name = f'{arm}-{index}'
        path = root / name / 'typing.json'
        if not path.exists():
            continue
        row = json.loads(path.read_text())[0]
        assert len(row['samples']) == 120 and len(row['handlers']) == 120
        assert all(s['frame'] > 0 for s in row['samples'])
        assert row['undoRedo'] and row['replay'] and not row['errors']
        tasks = [t['ms'] for t in row['tasks']]
        summary[name] = {
            'handler': q(row['handlers']),
            'frame': q([s['frame'] for s in row['samples']]),
            'longTasks': len(tasks),
            'longTaskTotalMs': sum(tasks),
            'longTaskMaxMs': max(tasks, default=0),
            'waitLocalMs': round(sum(s['ms'] for s in row['work'] if s['name'] == 'waitLocal'), 2),
            'waitLocalMaxMs': round(max((s['ms'] for s in row['work'] if s['name'] == 'waitLocal'), default=0), 2),
            'flushMs': round(sum(s['ms'] for s in row['work'] if s['name'] in ['admissionFlush', 'admissionBackgroundFlush']), 2),
            'work': {k: row['after']['work'][k] - v for k, v in row['before']['work'].items()},
            'undoRedo': row['undoRedo'], 'replay': row['replay'],
        }
print(json.dumps(summary, indent=2))
