import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
import { historicalInput, validateHistoricalInputs } from './historical-inputs.mjs';

export const editingCampaign = 'scripts/account-editing/run.mjs';
export const editingFiles = ['native'].map((name) => `test/account-editing/${name}.test.mjs`);
export const editingReports = [
  'sources.json',
  'summary.json',
  'results.xml',
  'run.log',
  'control-ancestry.json',
  'control-passkey.json',
  'generated-ancestry.json',
  'generated-native.json',
];
export const editingFilePolicy = {
  kind: 'account-reports-v1',
  required: editingReports,
  maxEntries: 32,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 1,
};

export function editingCampaignStage(root) {
  const cases = editingFiles.flatMap((file) => {
    const declarations = generatedNodeDeclarations(file, readFileSync(join(root, file), 'utf8'), {
      root,
    });
    assert.deepEqual(declarations.dataInputs, [], 'Review new editing registration inputs');
    return declarations.cases;
  });
  return {
    id: 'campaign:' + editingCampaign,
    argv: ['node', editingCampaign],
    env: {},
    variant: 'account-editing-campaign-v1',
    expect: {
      kind: 'account-editing',
      cases,
      historyInputs: [historicalInput(root, '649925f', 'src/crdt/promotionRecord.ts')],
    },
    // Preserve the wrapper's 300-second campaign bound; the owner also drains descendants.
    deadlineMs: 300000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(editingFilePolicy),
  };
}

export function validateEditingCampaign(stage) {
  assert.equal(
    stage.expect.kind,
    'account-editing',
    'Editing wrapper requires report postconditions',
  );
  assert.equal(stage.variant, 'account-editing-campaign-v1');
  assert.deepEqual(stage.argv, ['node', editingCampaign]);
  assert.deepEqual(stage.env, {});
  assert.deepEqual(stage.fileOutputs, editingFilePolicy);
  assert.deepEqual(stage.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(stage.deadlineMs, 300000);
  assert.equal(stage.graceMs, 5000);
  assert.equal(stage.processPolicy, 'inherited-group-v1');
  assert.equal(stage.expect.dataInputs, undefined);
  validateHistoricalInputs(stage.expect.historyInputs);
  assert.deepEqual(
    stage.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    [['649925f', 'src/crdt/promotionRecord.ts']],
  );
}

/** Called only after bounded inventory validation and producer drain. Node's owned
 * terminal census is the case authority; JUnit and run.log remain auxiliary evidence. */
export function reconcileEditingReports(directory, sources) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Editing campaign summary failed');
  assert.equal(summary.code, 0);
  assert.equal(summary.timedOut, false);
  assert.equal(summary.launchError, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
      'Invalid campaign time',
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  const selected = sources.filter(
    ({ path }) =>
      [
        'package.json',
        'pnpm-lock.yaml',
        'tsconfig.node.json',
        'tsconfig.app.json',
        'src/account/recovery.ts',
        'src/account/slotUnlock.ts',
        'src/account/es256Signature.ts',
        'test/slotUnlock.test.ts',
        'src/account/generationWrap.ts',
        'test/vectors/package.json',
        'test/account-promotion/fixtures.mjs',
        'test/account-promotion/browser.ts',
        'src/account/recoveryOwner.ts',
        'test/account-authority/browser.ts',
        'test/account-core/fixtures.mjs',
        'test/account-core/worker.mjs',
        'test/account-recovery/fixtures.mjs',
        'wasm/journal-seal/seal.generated.ts',
        editingCampaign,
        'docs/account-promotion.md',
        'docs/account-editing.md',
        'docs/account-handoff.md',
        'docs/account-admission.md',
        'test/account-authority/fixtures.mjs',
      ].includes(path) ||
      /^src\/crdt\/[^/]+\.ts$/.test(path) ||
      /^src\/lib\/[^/]+\.tsx?$/.test(path) ||
      /^(?:account-service|account-protocol|test\/account-editing|test\/account-handoff|test\/account-admission|test\/account-genesis)\/[^/]+\.(?:ts|mjs)$/.test(
        path,
      ),
  );
  const sort = (rows) => [...rows].sort((a, b) => a.path.localeCompare(b.path));
  assert.deepEqual(
    sort(json('sources.json')),
    sort(selected.map(({ path, sha256 }) => ({ path, sha256 }))),
    'Editing report source pins disagree with owned inputs',
  );
  reconcileEditingControls(json('control-ancestry.json'), json('control-passkey.json'));
  reconcileEditingHistories(json('generated-ancestry.json'), json('generated-native.json'));
  // Presence/bytes are already bound by fileOutputs. Do not credit JUnit as an
  // independent oracle or discard counterexample/ledger diagnostics on failures.
  for (const file of ['run.log', 'results.xml'])
    assert(
      readFileSync(join(directory, file)).length > 0,
      'Empty editing auxiliary report: ' + file,
    );
}

export function reconcileEditingControls(ancestry, passkey) {
  assert.equal(ancestry.normal, 'refused');
  assert.equal(ancestry.baselineUnchanged, true, 'Editing ancestry baseline mutated storage');
  assert(
    typeof ancestry.original.master === 'string' && ancestry.original.master.length > 0,
    'Editing ancestry control had no original writing',
  );
  assert(Array.isArray(ancestry.original.cards));
  assert.deepEqual(
    ancestry.mutant,
    { master: '', cards: [] },
    'Editing ancestry mutant did not open empty replacement',
  );
  assert.equal(passkey.normal, 'refused');
  assert.equal(passkey.baselineUnchanged, true, 'Editing passkey baseline mutated storage');
  assert.equal(passkey.signature, '00'.repeat(64), 'Editing passkey signature was not corrupted');
  assert(typeof passkey.before === 'string' && passkey.before.length > 0);
  assert.equal(passkey.insert, 'unauthorized ');
  assert.equal(
    passkey.mutant,
    passkey.insert + passkey.before,
    'Editing passkey control did not expose unauthorized writing',
  );
}
const nat = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
const text = (value, min, max) =>
  typeof value === 'string' && value.length >= min && value.length <= max;
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function reconcileEditingHistories(ancestry, native) {
  assert.equal(ancestry.seed, 9282026);
  assert(
    Array.isArray(ancestry.histories) && ancestry.histories.length === 200,
    'Incomplete editing ancestry histories',
  );
  for (const h of ancestry.histories) {
    assert.deepEqual(Object.keys(h).sort(), [
      'at',
      'insert',
      'observed',
      'pending',
      'remove',
      'seedText',
    ]);
    assert(text(h.seedText, 1, 20) && text(h.insert, 0, 20));
    assert(nat(h.at, 30) && nat(h.remove, 20));
    assert.equal(typeof h.pending, 'boolean');
    assert.deepEqual(Object.keys(h.observed).sort(), [
      'accepted',
      'afterSha256',
      'beforeSha256',
      'refused',
      'text',
    ]);
    assert.equal(h.observed.accepted, true, 'Editing ancestry rejected descendant');
    assert.equal(h.observed.refused, true, 'Editing ancestry accepted missing genesis');
    assert(sha(h.observed.beforeSha256) && sha(h.observed.afterSha256));
    assert.equal(
      h.observed.beforeSha256,
      h.observed.afterSha256,
      'Editing ancestry comparison changed source',
    );
    const at = h.at % (h.seedText.length + 1),
      end = Math.min(h.seedText.length, at + h.remove);
    assert.equal(
      h.observed.text,
      h.seedText.slice(0, at) + h.insert + h.seedText.slice(end),
      'Editing ancestry text differs from commands',
    );
  }
  assert.equal(native.seed, 9292026);
  assert(
    Array.isArray(native.histories) && native.histories.length === 24,
    'Incomplete editing native histories',
  );
  for (const h of native.histories) {
    assert.deepEqual(Object.keys(h).sort(), ['commands', 'expected', 'observed']);
    assert(Array.isArray(h.commands) && h.commands.length >= 1 && h.commands.length <= 6);
    assert(
      Array.isArray(h.observed) && h.observed.length === h.commands.length,
      'Editing native history omitted observations',
    );
    let expected = 'base original';
    for (const [index, command] of h.commands.entries()) {
      assert.deepEqual(Object.keys(command).sort(), ['at', 'insert', 'mode', 'remove', 'undo']);
      assert(nat(command.at, 50) && nat(command.remove, 12) && text(command.insert, 0, 10));
      assert.equal(typeof command.undo, 'boolean');
      assert(['journal', 'flush', 'compact', 'crash'].includes(command.mode));
      if (!command.undo) {
        const at = command.at % (expected.length + 1),
          end = Math.min(expected.length, at + command.remove);
        expected = expected.slice(0, at) + command.insert + expected.slice(end);
      }
      assert.equal(h.observed[index], expected, 'Editing native observation differs from commands');
    }
    assert.equal(h.expected, expected, 'Editing native final state differs from commands');
  }
}
