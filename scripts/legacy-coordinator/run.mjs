/** Reuse the independently bounded cleanup supervisor; only the campaign worker differs. */
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readOptions } from '../legacy-cleanup/config.mjs';
import { supervise } from '../legacy-cleanup/supervisor.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));
let args = process.argv.slice(2);
if (!args.includes('--output'))
  args = [
    ...args,
    '--output',
    `test-results/legacy-coordinator/${new Date().toISOString().replaceAll(':', '-')}`,
  ];
const { output, limits } = readOptions(args, root);
if (existsSync(output)) throw Error('Output exists');
mkdirSync(output, { recursive: true });
process.exitCode = await supervise({
  worker: fileURLToPath(new URL('./campaign.mjs', import.meta.url)),
  args,
  output,
  limits,
});
