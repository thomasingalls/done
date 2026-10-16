/** Retain the complete emitted graph and import its actual entry, never an arbitrary first chunk. */
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
export function emitBundle(result, parent) {
  const builds = Array.isArray(result) ? result : [result];
  if (builds.length !== 1) throw Error('Expected one emitted bundle');
  const output = builds[0].output;
  const entries = output.filter((file) => file.type === 'chunk' && file.isEntry);
  if (entries.length !== 1) throw Error('Expected one emitted entry');
  const names = new Set();
  for (const file of output) {
    const name = file.fileName;
    if (
      !name ||
      isAbsolute(name) ||
      name.split(/[\\/]/).some((p) => p === '..') ||
      names.has(name) ||
      name === 'package.json' ||
      name === 'bundle-manifest.json'
    )
      throw Error('Invalid emitted filename');
    names.add(name);
  }
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, 'module-'));
  const clear = () => rmSync(directory, { recursive: true, force: true });
  try {
    const files = output.map((file) => {
      const bytes = file.type === 'chunk' ? file.code : file.source;
      const target = join(directory, file.fileName);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      return { path: file.fileName, sha256: createHash('sha256').update(bytes).digest('hex') };
    });
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}\n');
    writeFileSync(
      join(directory, 'bundle-manifest.json'),
      JSON.stringify({ entry: entries[0].fileName, files }, null, 2) + '\n',
    );
    return { entry: join(directory, entries[0].fileName), directory, files, clear };
  } catch (error) {
    clear();
    throw error;
  }
}
