import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { census, checkRegistry, checkSnapshot } from './census.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (args.some((a) => a !== '--record') || args.length > 1)
  throw Error('Usage: node scripts/account-crypto-prep/run.mjs [--record]');
const registry = JSON.parse(readFileSync(join(root, 'docs/account-crypto/registry.json'), 'utf8'));
const path = join(root, 'docs/account-crypto/census.json');
const current = census(root);
const failures = checkRegistry(current, registry);
for (const home of new Set(registry.groups.map((g) => g.home)))
  if (!existsSync(join(root, home))) failures.push('Missing construction home ' + home);
for (const entry of registry.unlabelled)
  if (!entry.review || !existsSync(join(root, entry.path)))
    failures.push('Missing manual entrypoint ' + entry.path);
if (!args.includes('--record'))
  failures.push(...checkSnapshot(current, JSON.parse(readFileSync(path, 'utf8'))));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  if (args.includes('--record')) writeFileSync(path, JSON.stringify(current, null, 2) + '\n');
  console.log(
    `${args.includes('--record') ? 'Recorded reviewed' : 'Matched pinned'} runtime census: ${current.sources.length} sources, ${current.domains.length} labels/templates, ${registry.groups.length} groups; ${registry.unlabelled.length} manual entrypoints.`,
  );
  console.log(
    'Inventory only: authority-map integration, complete byte vectors and field omissions remain open.',
  );
}
