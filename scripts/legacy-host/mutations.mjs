import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha } from './assets.mjs';

/** Mutate a separate module copy; never rewrite repository files while native cases are running. */
export async function mutatedModule(root, output, id, file, from, to) {
  const path = join(root, file),
    original = readFileSync(path, 'utf8');
  if (original.split(from).length !== 2) throw Error('Nonunique host mutation anchor: ' + id);
  const changed = original
    .replace(from, to)
    .replace(
      /from '([.][^']+)'/gu,
      (_all, relative) => `from '${pathToFileURL(resolve(dirname(path), relative)).href}'`,
    );
  const folder = join(output, 'mutants');
  mkdirSync(folder, { recursive: true });
  const target = join(folder, id + '.mjs');
  writeFileSync(target, changed);
  return {
    module: await import(pathToFileURL(target).href),
    evidence: {
      id,
      file,
      original: sha(original),
      mutated: sha(changed),
      artifact: 'mutants/' + id + '.mjs',
    },
  };
}
