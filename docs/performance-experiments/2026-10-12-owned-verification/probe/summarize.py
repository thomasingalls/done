"""Session-level descriptive statistics; profiling and pilot observations are not pooled."""
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])


def q(values):
    values = sorted(values)
    return [round(values[min(int(len(values) * p), len(values) - 1)], 2) for p in [.5, .95, 1]]


summary = {}
for arm in ['reference', 'owned']:
    for index in [1, 2, 3]:
        name = f'{arm}-{index}'
        path = root / name / 'typing.json'
        if not path.exists():
            continue
        row = json.loads(path.read_text())[0]
        tasks = [t['ms'] for t in row['tasks']]
        summary[name] = {
            'handler': q(row['handlers']),
            'frame': q([s['frame'] for s in row['samples']]),
            'longTasks': len(tasks),
            'longTaskTotalMs': sum(tasks),
            'longTaskMaxMs': max(tasks, default=0),
            'work': {k: row['after']['work'][k] - v for k, v in row['before']['work'].items()},
            'undoRedo': row['undoRedo'], 'replay': row['replay'],
        }
print(json.dumps(summary, indent=2))
