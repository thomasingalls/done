/** Explicit owner sites may register groups; ordinary detached spawns still refuse. */
import assert from 'node:assert/strict';
import { spawn, fork } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { groupState, signalGroup } from './process-group.mjs';
const permit = Symbol.for('done.release.registered-group');
export const spawnOwnedGroup = (file, args, options) =>
  spawn(file, args, { ...options, [permit]: true });
// Only the reviewed stage runner may replace its inherited test environment.
export const spawnOwnedStage = (file, args, options) =>
  spawnOwnedGroup(file, args, { ...options, [Symbol.for('done.release.stage-boundary')]: true });
export const forkOwnedGroup = (file, args, options) =>
  fork(file, args, { ...options, [permit]: true });
/** The public ChildProcess PID remains the group leader; profile custody binds the actual payload. */
export function ownedPayloadPid(child) {
  if (!child.releaseGroup) return child.pid;
  const { root, id } = child.releaseGroup;
  const record = JSON.parse(readFileSync(join(root, id + '.payload.json'), 'utf8'));
  assert.equal(record.id, id);
  assert.equal(record.leader, child.pid);
  assert(Number.isSafeInteger(record.pid) && record.pid > 1 && record.pid !== child.pid);
  return record.pid;
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const idPattern = /^[0-9a-f-]{36}$/;

export function nestedGroupOwner(directory, checkout) {
  const parent = process.env.RELEASE_NESTED_ROOT;
  const root = parent ? mkdtempSync(join(parent, 'scope-')) : join(directory, 'nested-groups');
  if (!parent) mkdirSync(root);
  const top = process.env.RELEASE_NESTED_TOP ?? root;
  const environment = {
    RELEASE_NESTED_ROOT: root,
    RELEASE_NESTED_TOP: top,
    RELEASE_NESTED_LAUNCHER: join(checkout, 'scripts/release-validation/nested-launcher.mjs'),
  };
  const cancel = () => writeFileSync(join(root, 'closed'), 'closed\n');
  const inventory = () => {
    const groups = [],
      pending = [],
      issues = [];
    let files = 0;
    const visit = (dir) => {
      const names = readdirSync(dir);
      files += names.length;
      if (files > 8192) throw Error('Nested registration bound exceeded');
      for (const name of names) {
        if (name.startsWith('scope-')) {
          visit(join(dir, name));
          continue;
        }
        if (!name.endsWith('.intent.json')) continue;
        const id = name.slice(0, -'.intent.json'.length);
        if (!idPattern.test(id)) throw Error('Invalid nested intent identity');
        const read = (suffix) => {
          const path = join(dir, id + suffix + '.json');
          if (!existsSync(path)) return undefined;
          if (readFileSync(path).length > 8192) throw Error('Nested record byte bound exceeded');
          return JSON.parse(readFileSync(path, 'utf8'));
        };
        try {
          const intent = read('.intent'),
            spawned = read('.spawned'),
            started = read('.started');
          if (intent.id !== id) throw Error('Nested identity mismatch');
          if (spawned?.error && !started) continue; // Native spawn failed before a leader existed.
          const pid = started?.pid ?? spawned?.pid;
          if (!Number.isSafeInteger(pid) || pid <= 1) {
            pending.push(id);
            continue;
          }
          if (
            started &&
            spawned &&
            (started.id !== id || spawned.id !== id || started.pid !== spawned.pid)
          )
            throw Error('Nested leader publication mismatch');
          groups.push({ id, pid, state: groupState(pid) });
        } catch (error) {
          issues.push(id + ': ' + error.message);
        }
      }
    };
    try {
      visit(root);
    } catch (error) {
      issues.push(error.message);
    }
    return { groups, pending, issues };
  };
  return {
    environment,
    cancel,
    async close(graceMs) {
      const closureErrors = [];
      try {
        cancel();
      } catch (error) {
        closureErrors.push(error.code ?? String(error));
      }
      let report = inventory();
      // Allow PID publication or a transient uncertain probe to settle, without
      // granting permission to start payloads after closure.
      const publicationUntil = Date.now() + graceMs;
      while (
        (report.pending.length ||
          report.issues.length ||
          report.groups.some((g) => g.state === 'unknown')) &&
        Date.now() < publicationUntil
      ) {
        await delay(10);
        report = inventory();
      }
      const orphaned = report.groups.filter((g) => g.state === 'alive').map((g) => g.id);
      const signalErrors = [];
      for (const signal of ['SIGTERM', 'SIGKILL']) {
        const until = Date.now() + graceMs;
        do {
          for (const group of report.groups.filter((g) => g.state !== 'gone')) {
            try {
              signalGroup(group.pid, signal);
            } catch (error) {
              if (error.code !== 'EPERM') signalErrors.push(error.code ?? String(error));
            }
          }
          if (
            !report.pending.length &&
            !report.issues.length &&
            report.groups.every((g) => g.state === 'gone')
          )
            break;
          await delay(10);
          report = inventory();
        } while (Date.now() < until);
        report = inventory();
      }
      const groupDrained =
        !closureErrors.length &&
        !report.pending.length &&
        !report.issues.length &&
        report.groups.every((g) => g.state === 'gone');
      const result = { ...report, orphaned, signalErrors, closureErrors, groupDrained };
      writeFileSync(join(directory, 'nested-groups.json'), JSON.stringify(result) + '\n');
      return result;
    },
  };
}
