/** Pin the Git bytes explicitly used by reviewed historical fixture builders. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { hash } from './identity.mjs';

function validateLocator(reference, path) {
  assert(
    typeof reference === 'string' &&
      /^[a-f0-9]{7,40}$/.test(reference) &&
      typeof path === 'string' &&
      (/^account-service\/[a-z-]+\.ts$/.test(path) ||
        path === 'src/crdt/spoolRecord.ts' ||
        path === 'account-protocol/admission.ts'),
    'Invalid historical source locator',
  );
}

export function validateHistoricalInputs(inputs) {
  assert(
    Array.isArray(inputs) && inputs.length > 0 && inputs.length <= 8,
    'Invalid historical source inputs',
  );
  for (const i of inputs) {
    assert(i && typeof i === 'object', 'Invalid historical source input');
    assert.deepEqual(Object.keys(i).sort(), ['path', 'reference', 'revision', 'sha256']);
    validateLocator(i.reference, i.path);
    assert(
      typeof i.revision === 'string' &&
        /^[a-f0-9]{40}$/.test(i.revision) &&
        i.revision.startsWith(i.reference) &&
        typeof i.sha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(i.sha256),
      'Invalid historical source pin',
    );
  }
  assert.equal(
    new Set(inputs.map((i) => i.reference + ':' + i.path)).size,
    inputs.length,
    'Duplicate historical source input',
  );
}

export function historicalInput(root, reference, path) {
  validateLocator(reference, path);
  const git = (args) =>
    execFileSync('git', args, {
      cwd: root,
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const revision = git(['rev-parse', '--verify', reference + '^{commit}'])
    .toString('utf8')
    .trim();
  // Read exactly the expression the fixture uses, including replacement-object semantics.
  const sha256 = hash(git(['show', reference + ':' + path]));
  const pin = { reference, revision, path, sha256 };
  validateHistoricalInputs([pin]);
  return pin;
}

export function assertHistoricalInputs(root, inputs = []) {
  for (const i of inputs)
    assert.deepEqual(
      historicalInput(root, i.reference, i.path),
      i,
      'Historical source changed after planning: ' + i.reference + ':' + i.path,
    );
}
