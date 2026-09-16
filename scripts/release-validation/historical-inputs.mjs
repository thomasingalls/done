import {
  activationReference,
  activationHistoricalFiles,
} from '../account-activation/historical-inputs.mjs';
/** Pin the Git bytes explicitly used by reviewed historical fixture builders. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { hash } from './identity.mjs';

let planningSnapshot;

/** Share pins only within one synchronous plan. Execution always checks fresh Git bytes. */
export function withHistoricalInputSnapshot(plan) {
  const previous = planningSnapshot;
  planningSnapshot = new Map();
  try {
    const result = plan();
    assert(typeof result?.then !== 'function', 'Historical input planning must be synchronous');
    return result;
  } finally {
    planningSnapshot = previous;
  }
}

function validateLocator(reference, path) {
  assert(
    typeof reference === 'string' &&
      /^[a-f0-9]{7,40}$/.test(reference) &&
      typeof path === 'string' &&
      ((reference === activationReference && activationHistoricalFiles.includes(path)) ||
        /^account-service\/[a-z-]+\.ts$/.test(path) ||
        path === 'src/crdt/spoolRecord.ts' ||
        path === 'src/crdt/accountEnvelopePreparation.ts' ||
        path === 'src/crdt/accountDelivery.ts' ||
        path === 'account-protocol/admission.ts' ||
        path === 'test/accountDelivery.test.ts' ||
        path === 'src/crdt/promotionRecord.ts' ||
        path === 'src/crdt/promotionAdmission.ts' ||
        path === 'src/crdt/startupClassification.ts' ||
        path === 'account-protocol/genesis.ts'),
    'Invalid historical source locator',
  );
}

export function validateHistoricalInputs(inputs) {
  assert(
    Array.isArray(inputs) && inputs.length > 0 && inputs.length <= 26,
    'Invalid historical source inputs',
  );
  // Larger sets are allowed only for the complete reviewed activation reproduction.
  if (inputs.length > 8)
    assert.deepEqual(
      inputs.map((i) => [i.reference, i.path]),
      activationHistoricalFiles.map((path) => [activationReference, path]),
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
  const location = resolve(root);
  if (!planningSnapshot) return readHistoricalInput(location, reference, path);
  const key = JSON.stringify([location, reference, path]);
  if (!planningSnapshot.has(key))
    planningSnapshot.set(key, readHistoricalInput(location, reference, path, planningSnapshot));
  // Stage builders may modify their returned metadata; never expose the shared pin.
  return { ...planningSnapshot.get(key) };
}

function readHistoricalInput(root, reference, path, revisions) {
  validateLocator(reference, path);
  const git = (args) =>
    execFileSync('git', args, {
      cwd: root,
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  // A two-part key is distinct from every three-part file-pin key. Sharing the
  // revision avoids one subprocess per file in the fixed reproduction set.
  // Execution callers omit this compilation-local map and always re-read Git.
  const revisionKey = JSON.stringify([root, reference]);
  const revision =
    revisions?.get(revisionKey) ??
    git(['rev-parse', '--verify', reference + '^{commit}'])
      .toString('utf8')
      .trim();
  revisions?.set(revisionKey, revision);
  // Read exactly the expression the fixture uses, including replacement-object semantics.
  const sha256 = hash(git(['show', reference + ':' + path]));
  const pin = { reference, revision, path, sha256 };
  validateHistoricalInputs([pin]);
  return pin;
}

export function assertHistoricalInputs(root, inputs = []) {
  for (const i of inputs)
    assert.deepEqual(
      readHistoricalInput(root, i.reference, i.path),
      i,
      'Historical source changed after planning: ' + i.reference + ':' + i.path,
    );
}
