"""Reproduce final matched statistics without treating individual keys as independent trials."""
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])


def quantiles(values):
    values = sorted(values)
    return [round(values[min(int(len(values) * p), len(values) - 1)], 2) for p in [.5, .95, 1]]


summary = {}
for path in sorted(root.glob('final-*/typing.json')):
    row = json.loads(path.read_text())[0]
    tasks = [item['ms'] for item in row['tasks']]
    summary[path.parent.name] = {
        'longTasks': len(tasks),
        'longTaskTotalMs': sum(tasks),
        'longTaskMaxMs': max(tasks),
        'handler': quantiles(row['handlers']),
        'frame': quantiles([item['frame'] for item in row['samples']]),
        'work': {key: row['after']['work'][key] - value
                 for key, value in row['before']['work'].items()},
        'replay': row['replay'],
        'undoRedo': row['undoRedo'],
    }
print(json.dumps(summary, indent=2))
