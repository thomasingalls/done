/** External deadline survives a wedged browser, teardown, or worker event loop. */
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readOptions } from './config.mjs';
import { supervise } from './supervisor.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2),
  { options, output, limits } = readOptions(args, root);
if (existsSync(output)) throw Error('Output exists');
mkdirSync(output, { recursive: true });
process.exitCode = await supervise({
  worker: fileURLToPath(new URL('./campaign.mjs', import.meta.url)),
  args: options.output ? args : [...args, '--output', output],
  output,
  limits,
});
