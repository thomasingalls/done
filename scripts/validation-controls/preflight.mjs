import { join } from 'node:path';

/** Q-01/Q-04 prerequisites shared by the phases that previously omitted these live checks.
 * These are actual omission experiments, not an anchor-presence substitute. Each selected Node
 * invocation must report one passing test; the content runner checks its selected case and mutant.
 * Wider receive/transport/content regressions and the aggregate remain separate obligations.
 */
export const validationControlStages = (output) => [
  ['construction-inventory', ['scripts/check-authority-map.mjs'], 60000],
  [
    'receive-coverage-control',
    [
      '--test',
      '--test-name-pattern=^cold replay refuses missing or changed content$',
      'test/account-receive/native.test.mjs',
    ],
    90000,
  ],
  [
    'http-bound-control',
    [
      '--test',
      '--test-name-pattern=^effective HTTP bound omission exposes the forbidden result$',
      'test/account-receive-transport/controls.test.mjs',
    ],
    60000,
  ],
  [
    'content-unreadable-control',
    [
      'scripts/content/run.mjs',
      '--case',
      'C09.unreadable-load',
      '--output',
      join(output, 'content-control'),
    ],
    90000,
  ],
];
