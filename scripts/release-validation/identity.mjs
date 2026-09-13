import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  statSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  assert(
    value !== undefined && (typeof value !== 'number' || Number.isFinite(value)),
    'Non-canonical identity value',
  );
  return JSON.stringify(value);
}
export const digest = (value) => hash(canonical(value));
export function inside(root, path) {
  const part = relative(resolve(root), resolve(path));
  return part === '' || (!part.startsWith('..' + '/') && part !== '..' && !part.startsWith('/'));
}

/** Fresh repository scope, never an inherited campaign's historical list. Unrelated root
 * untracked files (including the author's `done `) are not read. All tracked inputs, plus new
 * files in source/test/config/documentation roots, are included; git-ignored output is not.
 */
export function sourcePaths(root) {
  const git = (args) =>
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
      .split('\0')
      .filter(Boolean);
  const tracked = git(['ls-files', '-z']);
  const added = git(['ls-files', '--others', '--exclude-standard', '-z']).filter(
    (p) =>
      /^(?:src|account-protocol|account-service|relay|scripts|test|vite|wasm|public|docs)\//.test(
        p,
      ) || /^(?:package\.json|pnpm-.*|.*\.config\.[cm]?[jt]s|tsconfig.*\.json)$/.test(p),
  );
  return [...new Set([...tracked, ...added])].sort();
}

export function filePins(root, paths, materialize = new Set()) {
  return paths.map((path) => {
    assert(inside(root, join(root, path)), 'Input escaped root: ' + path);
    const file = join(root, path);
    let stat;
    try {
      stat = lstatSync(file);
    } catch (e) {
      if (e.code === 'ENOENT') return { path, absent: true };
      throw e;
    }
    assert(stat.isFile() || stat.isSymbolicLink(), 'Unsupported input type: ' + path);
    if (stat.isSymbolicLink()) {
      if (materialize.has(path)) {
        stat = statSync(file);
        assert(stat.isFile(), 'Materialized metadata must be a regular file: ' + path);
      } else {
        assert(inside(realpathSync(root), realpathSync(file)), 'External input symlink: ' + path);
        return { path, link: readlinkSync(file) };
      }
    }
    return { path, executable: !!(stat.mode & 0o111), sha256: hash(readFileSync(file)) };
  });
}

/** Hash actual installed bytes and link targets, not just the lockfile or package versions.
 * Only documented generated caches are excluded. Two pnpm metadata links in this checkout
 * point at the saved project; their exact file bytes are materialized in the disposable copy.
 * Every other external link refuses rather than silently sharing a dependency directory.
 */
export function dependencyPins(root) {
  const base = join(root, 'node_modules'),
    paths = [];
  const visit = (dir) => {
    for (const e of readdirSync(join(base, dir), { withFileTypes: true })) {
      const path = dir ? dir + '/' + e.name : e.name;
      if (!dir && ['.cache', '.vite', '.vite-temp', '.tmp'].includes(e.name)) continue;
      if (e.isDirectory()) visit(path);
      else paths.push(path);
    }
  };
  visit('');
  return filePins(
    base,
    paths.sort(),
    new Set(['.package-map.json', '.pnpm-workspace-state-v1.json']),
  );
}
export function currentIdentity(root) {
  const sources = filePins(root, sourcePaths(root)),
    dependencies = dependencyPins(root);
  const revision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  return {
    schema: 1,
    revision,
    sources,
    dependencies,
    sourceDigest: digest(sources),
    dependencyDigest: digest(dependencies),
    runtime: {
      node: process.version,
      binary: hash(readFileSync(process.execPath)),
      platform: process.platform,
      arch: process.arch,
    },
  };
}
export const identityKey = (identity) =>
  digest({
    revision: identity.revision,
    sources: identity.sourceDigest,
    dependencies: identity.dependencyDigest,
    runtime: identity.runtime,
  });
