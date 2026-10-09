import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readOptions } from '../legacy-cleanup/config.mjs';
import { supervise } from '../legacy-cleanup/supervisor.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));
let args = process.argv.slice(2);
// Sixty histories each include several full process lifetimes. Preserve the shared short deadlines.
if (!args.includes('--campaign-ms')) args = [...args, '--campaign-ms', '1200000'];
if (!args.includes('--output'))
  args = [
    ...args,
    '--output',
    `test-results/legacy-host/${new Date().toISOString().replaceAll(':', '-')}`,
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
