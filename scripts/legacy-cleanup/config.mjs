import { resolve } from 'node:path';
export const defaultLimits = Object.freeze({
  'call-ms': 30000,
  'case-ms': 120000,
  'campaign-ms': 600000,
  'shrink-ms': 120000,
  'teardown-ms': 10000,
  'run-ms': 1800000,
});
export const readOptions = (args, root) => {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].slice(2);
    if (
      !args[i].startsWith('--') ||
      ![
        'output',
        'runs',
        'seed',
        'path',
        'replay',
        'mutant',
        'case',
        ...Object.keys(defaultLimits),
      ].includes(key) ||
      !args[i + 1] ||
      options[key] !== undefined
    )
      throw Error('Invalid options');
    options[key] = args[i + 1];
  }
  const runs = Number(options.runs ?? 60),
    seed = Number(options.seed ?? 8941);
  if (!Number.isSafeInteger(runs) || runs < 1 || !Number.isSafeInteger(seed))
    throw Error('Invalid seed/runs');
  const limits = Object.fromEntries(
    Object.entries(defaultLimits).map(([k, v]) => [k, Number(options[k] ?? v)]),
  );
  for (const n of Object.values(limits))
    if (!Number.isSafeInteger(n) || n < 1 || n > 2147483647)
      throw Error('Invalid deadline (milliseconds)');
  const output = resolve(
    root,
    options.output ??
      `test-results/legacy-cleanup/${new Date().toISOString().replaceAll(':', '-')}`,
  );
  return { options, limits, output, seed, runs };
};
