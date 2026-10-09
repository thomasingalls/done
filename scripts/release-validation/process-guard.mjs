/** Cooperative ownership contract for certified Node stages, not a hostile-code sandbox.
 * Native wrappers that require detached children need a different reviewed ownership adapter.
 */
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { appendFileSync, existsSync, writeFileSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
const guard = process.env.RELEASE_PROCESS_GUARD;
const violations = process.env.RELEASE_GUARD_VIOLATIONS;
if (!guard || !violations) throw Error('Missing release process ownership');
const refuse = (reason) => {
  appendFileSync(violations, JSON.stringify({ pid: process.pid, reason }) + '\n');
  throw Error(reason);
};
const options = (opts = {}, boundary = false) => {
  if (opts.detached) refuse('Detached child is outside the certified process-group contract');
  const env = boundary ? { ...opts.env } : { ...process.env, ...opts.env };
  const childGuard = boundary ? opts.env.RELEASE_PROCESS_GUARD : guard;
  const childViolations = boundary ? opts.env.RELEASE_GUARD_VIOLATIONS : violations;
  // Keep the guard on Node descendants even when callers supply a new environment.
  env.RELEASE_PROCESS_GUARD = childGuard;
  env.RELEASE_GUARD_VIOLATIONS = childViolations;
  if (process.env.RELEASE_NESTED_ROOT) {
    const proposed = opts.env?.RELEASE_NESTED_ROOT;
    const part = proposed ? relative(process.env.RELEASE_NESTED_ROOT, proposed) : '..';
    env.RELEASE_NESTED_ROOT =
      proposed && !part.startsWith('..') && !part.startsWith('/')
        ? proposed
        : process.env.RELEASE_NESTED_ROOT;
    env.RELEASE_NESTED_TOP = process.env.RELEASE_NESTED_TOP;
    env.RELEASE_NESTED_LAUNCHER = process.env.RELEASE_NESTED_LAUNCHER;
  }
  const inherited = (env.NODE_OPTIONS ?? '').replace(/--import=\S*process-guard\.mjs/g, '').trim();
  env.NODE_OPTIONS = `${inherited} --import=${childGuard}`.trim();
  return { ...opts, detached: false, env };
};
const permit = Symbol.for('done.release.registered-group');
const originals = { spawn: childProcess.spawn, fork: childProcess.fork };
const registered = (kind, file, args, opts) => {
  const boundary = opts[Symbol.for('done.release.stage-boundary')] === true;
  if (boundary) {
    const below = (parent, path) => {
      if (typeof parent !== 'string' || typeof path !== 'string') return false;
      try {
        const part = relative(realpathSync(parent), realpathSync(path));
        return part && !part.startsWith('..') && !part.startsWith('/');
      } catch {
        return false;
      }
    };
    const sameGuard = (path) => {
      try {
        return realpathSync(path) === realpathSync(guard);
      } catch {
        return false;
      }
    };
    if (
      kind !== 'spawn' ||
      file !== process.execPath ||
      !below(process.env.RELEASE_NESTED_ROOT, opts.env?.RELEASE_NESTED_ROOT) ||
      (!sameGuard(opts.env?.RELEASE_PROCESS_GUARD) &&
        !below(process.env.TMPDIR, opts.env?.RELEASE_PROCESS_GUARD)) ||
      (!below(process.env.TMPDIR, opts.env?.RELEASE_GUARD_VIOLATIONS) &&
        !below(
          resolve(dirname(guard), '../../test-results'),
          opts.env?.RELEASE_GUARD_VIOLATIONS,
        )) ||
      opts.env?.NODE_TEST_CONTEXT !== undefined
    )
      refuse('Invalid nested stage boundary');
  }
  const safe = options({ ...opts, detached: false }, boundary);
  const root = safe.env.RELEASE_NESTED_ROOT,
    top = safe.env.RELEASE_NESTED_TOP;
  if (!root || !top || !safe.env.RELEASE_NESTED_LAUNCHER || opts.shell)
    refuse('Missing registered group owner');
  const tmp = relative(process.env.TMPDIR ?? '/nonexistent', resolve(file));
  if (
    kind !== 'fork' &&
    file !== process.execPath &&
    file !== process.env.RELEASE_BROWSER_EXECUTABLE &&
    (tmp.startsWith('..') || tmp.startsWith('/'))
  )
    refuse('Unreviewed registered executable');
  let dir = root;
  for (;;) {
    if (existsSync(join(dir, 'closed'))) throw Error('Nested owner is closed');
    if (dir === top) break;
    const parent = dirname(dir);
    if (parent === dir) refuse('Invalid nested owner ancestry');
    dir = parent;
  }
  const id = randomUUID();
  writeFileSync(join(root, id + '.intent.json'), JSON.stringify({ id, parent: process.pid }), {
    flag: 'wx',
  });
  const spec =
    kind === 'fork'
      ? {
          file: process.execPath,
          args: [...(opts.execArgv ?? process.execArgv), file, ...args],
          serialization: opts.serialization,
        }
      : { file, args, serialization: opts.serialization };
  let child;
  try {
    const payload = [root, id, JSON.stringify(spec)];
    child =
      kind === 'fork'
        ? originals.fork(safe.env.RELEASE_NESTED_LAUNCHER, payload, {
            ...safe,
            detached: true,
            execArgv: [],
          })
        : originals.spawn(process.execPath, [safe.env.RELEASE_NESTED_LAUNCHER, ...payload], {
            ...safe,
            detached: true,
          });
    const save = (record) =>
      writeFileSync(join(root, id + '.spawned.json'), JSON.stringify({ id, ...record }));
    child.releaseGroup = { root, id };
    if (child.pid) save({ pid: child.pid });
    child.once('error', (error) => {
      if (!child.pid) save({ error: error.code ?? String(error) });
    });
    return child;
  } catch (error) {
    writeFileSync(join(root, id + '.spawned.json'), JSON.stringify({ id, error: String(error) }));
    throw error;
  }
};
for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']) {
  const original = childProcess[name];
  childProcess[name] = function (file, args, opts, callback) {
    if (
      ['spawn', 'fork'].includes(name) &&
      Array.isArray(args) &&
      opts?.detached &&
      opts[permit] &&
      process.env.RELEASE_NESTED_ROOT
    )
      return registered(name, file, args, opts);
    if (Array.isArray(args)) {
      if (typeof opts === 'function') return original.call(this, file, args, options(), opts);
      return original.call(this, file, args, options(opts), callback);
    }
    if (typeof args === 'function') return original.call(this, file, [], options(), args);
    return original.call(this, file, [], options(args), opts);
  };
}
for (const name of ['exec', 'execSync']) {
  const original = childProcess[name];
  childProcess[name] = function (command, opts, callback) {
    if (typeof opts === 'function') return original.call(this, command, options(), opts);
    return original.call(this, command, options(opts), callback);
  };
}
syncBuiltinESMExports();
