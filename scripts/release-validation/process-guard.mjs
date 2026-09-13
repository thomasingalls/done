/** Cooperative ownership contract for certified Node stages, not a hostile-code sandbox.
 * Native wrappers that require detached children need a different reviewed ownership adapter.
 */
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { appendFileSync } from 'node:fs';
const guard = process.env.RELEASE_PROCESS_GUARD;
const violations = process.env.RELEASE_GUARD_VIOLATIONS;
if (!guard || !violations) throw Error('Missing release process ownership');
const refuse = (reason) => {
  appendFileSync(violations, JSON.stringify({ pid: process.pid, reason }) + '\n');
  throw Error(reason);
};
const options = (opts = {}) => {
  if (opts.detached) refuse('Detached child is outside the certified process-group contract');
  const env = { ...process.env, ...opts.env };
  // Keep the guard on Node descendants even when callers supply a new environment.
  env.RELEASE_PROCESS_GUARD = guard;
  env.RELEASE_GUARD_VIOLATIONS = violations;
  const inherited = (env.NODE_OPTIONS ?? '').replace(/--import=\S*process-guard\.mjs/g, '').trim();
  env.NODE_OPTIONS = `${inherited} --import=${guard}`.trim();
  return { ...opts, detached: false, env };
};
for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']) {
  const original = childProcess[name];
  childProcess[name] = function (file, args, opts, callback) {
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
