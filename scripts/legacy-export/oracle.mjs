/** Independent input-string ledger; never obtains expectations from capture, Yjs or exportEntries. */
import assert from 'node:assert/strict';
export const list = (cards) =>
  cards
    .map((text) => {
      const lines = text.split('\n');
      return (
        (lines[0] ? '- ' + lines[0] : '-') +
        lines
          .slice(1)
          .map((line) => '\n' + (line ? '  ' + line : ''))
          .join('')
      );
    })
    .join('\n\n');
export const dayText = (day) =>
  ['Next', 'Scheduled', 'Done']
    .map(
      (section) =>
        '## ' +
        section +
        '\n\n' +
        (day[section.toLowerCase()].length ? list(day[section.toLowerCase()]) + '\n' : ''),
    )
    .join('\n');
export const expected = (input) => [
  { path: 'master.md', content: input.master + input.suffix.slice(1) },
  ...input.days
    .filter((day) => day.archive || day.next.length || day.scheduled.length || day.done.length)
    .map((day) => ({ path: `days/${day.date}.md`, content: day.archive ?? dayText(day) }))
    .sort((a, b) => a.path.localeCompare(b.path)),
  {
    path: 'unfiled.md',
    content:
      '# Unfiled\n\nCards retained because no normal collection can currently display them.\n\n## Cards\n\n' +
      list([input.orphan]) +
      '\n\n## Provenance\n\n1. `orphan` — last known: unavailable\n',
  },
];
export function checkEntries(actual, input) {
  assert.deepEqual(actual, expected(input), 'all-authored-content-recovered');
  assert.equal(
    actual.filter((entry) => entry.path.startsWith('days/')).length,
    input.days.filter(
      (day) => day.archive || day.next.length || day.scheduled.length || day.done.length,
    ).length,
    'every-nonempty-day-present',
  );
}
export const example = () => ({
  master: '# Master\n\nOriginal text.\n',
  suffix: '!journal-only ✔\n',
  orphan: 'retained orphan\n\nwith detail',
  days: Array.from({ length: 10 }, (_, d) => ({
    date: `2026-08-${String(d + 1).padStart(2, '0')}`,
    next: ['one', 'two', 'three', 'four'].map((v) => `${d}: ${v}`),
    scheduled: [`scheduled ${d}\n\n## Done\n  whitespace  `],
    done: [`done ${d}`, ''],
  })),
});
