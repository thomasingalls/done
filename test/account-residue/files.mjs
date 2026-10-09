/** Raw file observation, including unknown names and allocated SQLite/WAL bytes. No product schema. */
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIMITS } from './matcher.mjs';

export function collectFiles(root, surface = 'files', limits = LIMITS) {
  const result = { surface, complete: true, errors: [], entries: [] };
  let total = 0;
  const deadline = Date.now() + limits.collectorMs;
  const add = (location, bytes, type) => {
    if (bytes.length > limits.valueBytes || (total += bytes.length) > limits.surfaceBytes)
      throw Error('file-byte-budget');
    result.entries.push({ location, raw: bytes.toString('base64'), type });
  };
  const walk = (path, relative) => {
    if (Date.now() > deadline) throw Error('file-collector-timeout');
    if (relative.length > limits.cloneDepth) throw Error('file-depth-budget');
    const before = lstatSync(path, { bigint: true });
    if (before.isSymbolicLink()) throw Error('unobserved-symlink');
    if (before.isDirectory()) {
      const names = readdirSync(path).sort();
      for (const name of names) walk(join(path, name), [...relative, name]);
      if (JSON.stringify(names) !== JSON.stringify(readdirSync(path).sort()))
        throw Error('file-inventory-changed');
    } else if (before.isFile()) {
      if (before.size > BigInt(limits.valueBytes)) throw Error('file-byte-budget');
      add([...relative, 'path'], Buffer.from(relative.join('/')), 'path');
      add(relative, readFileSync(path), 'file');
      const after = lstatSync(path, { bigint: true });
      if (
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        before.ino !== after.ino
      )
        throw Error('file-changed');
    } else throw Error('unsupported-file-type');
  };
  try {
    walk(root, []);
  } catch (e) {
    result.complete = false;
    result.errors.push(e.message);
  }
  return result;
}
