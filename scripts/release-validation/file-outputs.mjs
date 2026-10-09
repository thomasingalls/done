/** Cooperative report retention, not a filesystem sandbox or a semantic report oracle. */
import assert from 'node:assert/strict';
import {
  constants,
  openSync,
  closeSync,
  readSync,
  fstatSync,
  lstatSync,
  opendirSync,
} from 'node:fs';
import { join } from 'node:path';
import { hash } from './identity.mjs';

const safePath = (path) =>
  typeof path === 'string' &&
  path.length <= 240 &&
  path.length > 0 &&
  path.split('/').every((part) => /^[A-Za-z0-9_.-]+$/.test(part) && !['.', '..'].includes(part));

export function validateFileOutputs(policy) {
  assert(policy && typeof policy === 'object', 'Invalid file-output policy');
  assert.deepEqual(Object.keys(policy).sort(), [
    'kind',
    'maxBytes',
    'maxDepth',
    'maxEntries',
    'required',
  ]);
  assert.equal(policy.kind, 'account-reports-v1', 'Unreviewed report directory binding');
  for (const [key, max] of [
    ['maxBytes', 4 * 1024 * 1024],
    ['maxDepth', 8],
    ['maxEntries', 256],
  ])
    assert(
      Number.isSafeInteger(policy[key]) && policy[key] > 0 && policy[key] <= max,
      'Invalid file-output bound: ' + key,
    );
  assert(
    Array.isArray(policy.required) && policy.required.length <= policy.maxEntries,
    'Invalid required report files',
  );
  assert.equal(new Set(policy.required).size, policy.required.length, 'Duplicate required report');
  for (const path of policy.required)
    assert(
      safePath(path) && path.split('/').length <= policy.maxDepth,
      'Invalid required report path',
    );
}

function fileHash(path, expected, remaining) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    assert(
      stat.isFile() && stat.nlink === 1 && stat.ino === expected.ino && stat.dev === expected.dev,
      'Report file changed type or identity',
    );
    assert(stat.size === expected.size && stat.size <= remaining, 'Report file changed size');
    // Never read an unbounded file if a writer or external edit races the final scan.
    const bytes = Buffer.alloc(stat.size + 1);
    let used = 0,
      count;
    while (used < bytes.length && (count = readSync(fd, bytes, used, bytes.length - used, null)))
      used += count;
    const after = fstatSync(fd);
    assert(
      used === stat.size && after.size === stat.size && after.mtimeMs === stat.mtimeMs,
      'Report file changed while reading',
    );
    return hash(bytes.subarray(0, used));
  } finally {
    closeSync(fd);
  }
}

/** Bounded traversal also inventories empty directories. Never follow symlinks or hard links.
 * On failure, keep the files in the owned directory and return an explicitly partial inventory.
 * Polling enforces cooperative limits; it cannot prevent a writer's transient disk-space burst.
 */
export function inspectFileOutputs(directory, policy, { hashes = true, required = true } = {}) {
  validateFileOutputs(policy);
  const result = { complete: false, entries: [], bytes: 0, error: null };
  let count = 0;
  const visit = (relative, depth) => {
    const path = join(directory, relative),
      stat = lstatSync(path);
    if (relative) {
      assert(safePath(relative), 'Unsupported report path');
      assert(depth <= policy.maxDepth, 'Report depth limit: ' + relative);
    }
    assert(!stat.isSymbolicLink(), 'Report symlink refused: ' + relative);
    if (stat.isDirectory()) {
      if (relative) result.entries.push({ path: relative, type: 'directory' });
      const dir = opendirSync(path),
        names = [];
      try {
        let entry;
        while ((entry = dir.readSync())) {
          assert(++count <= policy.maxEntries, 'Report entry limit');
          names.push(entry.name);
        }
      } finally {
        dir.closeSync();
      }
      for (const name of names.sort()) visit(relative ? relative + '/' + name : name, depth + 1);
    } else {
      assert(
        relative && stat.isFile() && stat.nlink === 1,
        'Report must be a single-link regular file: ' + relative,
      );
      assert(stat.size <= policy.maxBytes - result.bytes, 'Report byte limit: ' + relative);
      const sha256 = hashes ? fileHash(path, stat, policy.maxBytes - result.bytes) : undefined;
      result.entries.push({
        path: relative,
        type: 'file',
        bytes: stat.size,
        ...(hashes ? { sha256 } : {}),
      });
      result.bytes += stat.size;
    }
  };
  try {
    assert(lstatSync(directory).isDirectory(), 'Missing report directory');
    visit('', 0);
    if (required)
      for (const path of policy.required)
        assert(
          result.entries.some((entry) => entry.path === path && entry.type === 'file'),
          'Missing required report: ' + path,
        );
    result.complete = true;
  } catch (error) {
    result.error = String(error.message).slice(0, 2048);
  }
  return result;
}
