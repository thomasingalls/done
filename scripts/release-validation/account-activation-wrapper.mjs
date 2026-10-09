import {
  activationReference,
  activationHistoricalFiles,
} from '../account-activation/historical-inputs.mjs';
import { historicalInputs, validateHistoricalInputs } from './historical-inputs.mjs';
import { createHash, createPublicKey, verify } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatedNodeDeclarations } from './census.mjs';
export const activationCampaign = 'scripts/account-activation/run.mjs';
export const activationFiles = ['core', 'controls', 'restart', 'native'].map(
  (n) => 'test/account-activation/' + n + '.test.mjs',
);
export const activationSteps = [
  {
    name: 'types',
    kind: 'exit',
    argv: ['node', 'node_modules/typescript/bin/tsc', '-b', '--noEmit'],
    deadlineMs: 60000,
  },
  {
    name: 'reproduction',
    kind: 'exit',
    argv: ['node', 'scripts/account-activation/reproduce.mjs'],
    deadlineMs: 30000,
  },
  ...[
    ['core', 120000],
    ['controls', 30000],
    ['restart', 30000],
    ['native', 180000],
  ].map(([name, deadlineMs]) => ({
    name,
    kind: 'node',
    deadlineMs,
    argv: [
      'node',
      '--test',
      '--test-concurrency=1',
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      '--test-reporter=junit',
      '--test-reporter-destination=$REPORT/' + name + '.xml',
      'test/account-activation/' + name + '.test.mjs',
    ],
  })),
];
export const activationReports = [
  'sources.json',
  'summary.json',
  ...activationSteps.map((s) => s.name + '.log'),
  ...activationSteps
    .filter((s) => s.kind === 'node')
    .flatMap((s) => [s.name + '.xml', 'case-reports/' + s.name + '.json']),
  'before.json',
  'activation--8.json',
  'activation--7.json',
  'generated-activation.json',
  'control-assertion.json',
  'control-expiry.json',
  'control-target.json',
  'control-generated.json',
  'restart-before-commit.json',
  'restart-after-commit.json',
  'control-client-signature.json',
  'control-client-target.json',
  'native-cancel.json',
  'native-prompt.json',
  'native-lost-finish.json',
];
export const activationFilePolicy = {
  kind: 'account-reports-v1',
  required: activationReports,
  maxEntries: 40,
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 2,
};
export function activationCampaignStage(root) {
  const steps = activationSteps.map((s) => {
    if (s.kind === 'exit') return { ...s, expect: { kind: 'exit', exitCodes: [0] } };
    const files = [s.argv.at(-1)];
    const cases = files.flatMap((file) => {
      const d = generatedNodeDeclarations(file, readFileSync(join(root, file), 'utf8'), { root });
      assert(!d.dataInputs?.length);
      return d.cases;
    });
    return { ...s, expect: { kind: 'cases', cases } };
  });
  return {
    id: 'campaign:' + activationCampaign,
    argv: ['node', activationCampaign],
    env: {},
    variant: 'account-activation-campaign-v1',
    expect: {
      kind: 'account-activation',
      steps,
      cases: steps.flatMap((s) => s.expect.cases ?? []),
      historyInputs: historicalInputs(root, activationReference, activationHistoricalFiles),
    },
    deadlineMs: 450000,
    graceMs: 5000,
    maxLogBytes: 4 * 1024 * 1024,
    maxReportBytes: 1024 * 1024,
    processPolicy: 'inherited-group-v1',
    dependsOn: [],
    fixture: { kind: 'chromium-cdp', startupMs: 15000 },
    fileOutputs: structuredClone(activationFilePolicy),
  };
}
export function validateActivationCampaign(s) {
  assert.equal(s.expect.kind, 'account-activation');
  assert.equal(s.variant, 'account-activation-campaign-v1');
  assert.deepEqual(s.argv, ['node', activationCampaign]);
  assert.deepEqual(s.env, {});
  assert.deepEqual(s.fileOutputs, activationFilePolicy);
  assert.deepEqual(s.fixture, { kind: 'chromium-cdp', startupMs: 15000 });
  assert.equal(s.expect.dataInputs, undefined);
  assert.equal(s.deadlineMs, 450000);
  assert.equal(s.graceMs, 5000);
  assert.equal(s.processPolicy, 'inherited-group-v1');
  validateHistoricalInputs(s.expect.historyInputs);
  assert.deepEqual(
    s.expect.historyInputs.map(({ reference, path }) => [reference, path]),
    activationHistoricalFiles.map((path) => [activationReference, path]),
  );
  assert.deepEqual(
    s.expect.steps.map(({ expect: _e, ...step }) => step),
    activationSteps,
  );
  assert.deepEqual(
    s.expect.cases,
    s.expect.steps.flatMap((step) => step.expect.cases ?? []),
  );
  for (const step of s.expect.steps) {
    if (step.kind === 'exit') {
      assert.deepEqual(step.expect, { kind: 'exit', exitCodes: [0] });
      continue;
    }
    assert.equal(step.expect.kind, 'cases');
    assert(step.expect.cases.length > 0);
    assert.equal(step.expect.dataInputs, undefined);
  }
}
export function reconcileActivationReports(directory, sources, historyInputs) {
  const json = (file) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const summary = json('summary.json');
  assert.equal(summary.status, 'passed', 'Activation summary failed');
  assert.equal(summary.error, undefined);
  for (const key of ['startedAt', 'completedAt'])
    assert(
      typeof summary[key] === 'string' && new Date(summary[key]).toISOString() === summary[key],
    );
  assert(Date.parse(summary.completedAt) >= Date.parse(summary.startedAt));
  assert.deepEqual(
    summary.stages,
    activationSteps.map(({ name }) => ({ name, code: 0, timedOut: false })),
    'Activation summary stages differ',
  );
  const selected = sources.filter(
    ({ path }) =>
      [
        'package.json',
        'pnpm-lock.yaml',
        'tsconfig.app.json',
        'tsconfig.node.json',
        'vite.config.ts',
        'docs/account-source-capture.md',
        'docs/account-outbound-composition.md',
        'docs/account-activation.md',
        'docs/account-authority.md',
        'docs/account-handoff.md',
        'docs/account-recovery.md',
        'docs/selections/row-7-checkpoint.md',
        'docs/review/remediation/S0-5/A-schemas.md',
        'docs/account-inbound.md',
        'docs/account-inbound-verification.md',
        'docs/account-delivery.md',
        'docs/account-admission.md',
        'docs/account-decisions.md',
        'docs/account-spool.md',
        'docs/selections/row-5-finalization.md',
        'docs/selections/row-6-antireplay-retention.md',
        'docs/account-outbound.md',
        'docs/TRD.md',
        'docs/review/remediation/S0-4/A-schemas.md',
        'docs/review/remediation/S0-2/authority-map.md',
        'docs/selections/row-4-envelope-format.md',
        'scripts/account-activation/run.mjs',
        'scripts/account-activation/reproduce.mjs',
        'scripts/account-activation/historical-inputs.mjs',
        'scripts/generate-checkpoint-vectors.mjs',
        'scripts/generate-private-envelope-vectors.mjs',
        'scripts/generate-envelope-vectors.mjs',
        'scripts/lib/aad-coverage.mjs',
      ].includes(path) ||
      /^(?:src|account-protocol|account-service|test|vite|wasm\/journal-seal)\/.*\.(?:ts|tsx|mjs|json|wasm)$/.test(
        path,
      ),
  );
  const sort = (rows) => [...rows].sort((a, b) => a.path.localeCompare(b.path));
  assert.deepEqual(
    sort(json('sources.json')),
    sort(selected.map(({ path, sha256 }) => ({ path, sha256 }))),
    'Activation source pins differ',
  );
  const before = json('before.json');
  assert.equal(before.commit, activationReference);
  assert.deepEqual(
    before.sources,
    historyInputs.map(({ path, sha256 }) => ({ path, sha256 })),
    'Activation reproduction historical bytes differ',
  );
  reconcileActivationEvidence(
    Object.fromEntries(
      activationReports
        .filter(
          (f) =>
            f.endsWith('.json') &&
            !f.startsWith('case-reports/') &&
            !['sources.json', 'summary.json'].includes(f),
        )
        .map((f) => [f, json(f)]),
    ),
  );
  readFileSync(join(directory, 'types.log'));
  for (const f of activationReports.filter(
    (f) => (f.endsWith('.log') && f !== 'types.log') || f.endsWith('.xml'),
  ))
    assert(readFileSync(join(directory, f)).length, 'Empty activation auxiliary report');
}

const hash = (v) => createHash('sha256').update(v).digest('hex');
const hex = (v, n = 32) =>
  assert(typeof v === 'string' && new RegExp(`^[0-9a-f]{${n * 2}}$`).test(v));
const canonical = (v) => JSON.stringify(sort(v));
const sort = (v) =>
  Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
const lp = (...values) =>
  Buffer.concat(
    values.map((v) => {
      const b = Buffer.from(v),
        n = Buffer.alloc(2);
      assert(b.length <= 65535);
      n.writeUInt16BE(b.length);
      return Buffer.concat([n, b]);
    }),
  );
function signed(value, domain, body, pub) {
  hex(pub);
  hex(value, 64);
  assert(
    verify(
      null,
      lp(domain, hash(JSON.stringify(body))),
      createPublicKey({
        key: Buffer.from('302a300506032b6570032100' + pub, 'hex'),
        format: 'der',
        type: 'spki',
      }),
      Buffer.from(value, 'hex'),
    ),
    'Activation evidence signature differs',
  );
}
function challenge(value) {
  assert.equal(value.v, 1);
  assert.equal(value.kind, 'promotion-activation-challenge');
  const c = value.context;
  assert.deepEqual(Object.keys(c), [
    'v',
    'pin',
    'accountId',
    'requestDigest',
    'offerHead',
    'completionDigest',
    'credentialId',
    'nonce',
    'expiresAt',
  ]);
  assert.equal(c.v, 1);
  for (const k of ['requestDigest', 'offerHead', 'completionDigest', 'nonce']) hex(c[k]);
  assert(Number.isSafeInteger(c.expiresAt) && c.expiresAt >= 0);
  signed(value.signature, 'done/promotion-activation-challenge/v1', c, c.pin.authRoot);
  return c;
}
function receipt(r) {
  assert.equal(r.kind, 'promotion-receipt');
  assert.equal(r.v, 2);
  const c = r.activation.context;
  assert.equal(c.accountId, r.offer.epoch.accountId);
  assert.equal(c.requestDigest, r.offer.epoch.requestDigest);
  assert.equal(c.offerHead, r.offer.head);
  hex(r.activation.proofHash);
  const { signature, ...body } = r;
  signed(signature, 'done/promotion-receipt/v2', body, c.pin.authRoot);
  return c;
}
const unchanged = (o) => {
  hex(o.before);
  assert.equal(o.after, o.before, 'Refused activation changed inventory');
};

/** Report consistency against observed keys complements, rather than replaces, fixture oracles. */
export function reconcileActivationEvidence(r) {
  const before = r['before.json'];
  assert.equal(before.commit, activationReference);
  assert.equal(before.assertionCalls, 0);
  assert.equal(before.receiptVersion, 1);
  assert.equal(before.receipt.v, 1);
  assert.equal(before.receipt.kind, 'promotion-receipt');
  assert.equal(before.accountState, 'active');
  assert.equal(before.activatedWithoutFreshAssertion, true);
  assert.equal(before.newReaderRefusesActualOldReceipt, true);
  assert.deepEqual(before.finishFields, ['retryKey', 'requestDigest', 'completion']);
  for (const alg of [-8, -7]) {
    const o = r['activation-' + alg + '.json'],
      c = challenge(o.challenge);
    assert.deepEqual(receipt(o.receipt), c);
    assert.equal(o.assertionHash, hash(canonical(o.assertion)));
    assert.equal(o.receipt.activation.proofHash, o.assertionHash);
    assert.equal(o.counter, 17);
    const client = JSON.parse(Buffer.from(o.assertion.response.clientDataJSON, 'base64url'));
    assert.equal(client.type, 'webauthn.get');
    assert.equal(client.origin, c.pin.origin);
    assert.equal(
      client.challenge,
      Buffer.from(
        hash(lp('done/promotion-activation/v1', hash(JSON.stringify(c)))),
        'hex',
      ).toString('base64url'),
    );
  }
  for (const gate of ['assertion', 'expiry', 'target']) {
    const c = r['control-' + gate + '.json'];
    assert.equal(c.gate, gate);
    assert.deepEqual(
      c.observations.map((o) => o.variant),
      ['baseline', 'mutant'],
    );
    for (const o of c.observations) {
      const target = challenge(o.challenge);
      hex(o.completionDigest);
      if (gate === 'assertion') assert.deepEqual(o.assertion, {});
      if (gate === 'target') assert.notEqual(o.completionDigest, target.completionDigest);
      else assert.equal(o.completionDigest, target.completionDigest);
      if (gate === 'expiry') assert(o.now >= target.expiresAt);
      if (o.variant === 'baseline') {
        assert.equal(o.result.ok, false);
        assert.equal(o.accountState, 'pending');
        unchanged(o);
      } else {
        receipt(o.result);
        assert.equal(o.accountState, 'active');
        hex(o.before);
        hex(o.after);
        assert.notEqual(o.after, o.before);
      }
    }
  }
  const control = r['control-generated.json'];
  assert.equal(control.seed, 9110402);
  assert.equal(control.failed, true);
  assert(Number.isSafeInteger(control.numShrinks) && control.numShrinks > 0);
  assert(typeof control.path === 'string' && control.path.length);
  assert(Array.isArray(control.counterexample) && control.counterexample.length === 1);
  assert(control.attempts.length > 1);
  for (const o of control.attempts) {
    assert(
      o.delays.length >= 1 &&
        o.delays.length <= 8 &&
        o.delays.every((n) => Number.isInteger(n) && n >= 1 && n <= 600000),
    );
    const old = challenge(o.old),
      fresh = challenge(o.fresh);
    assert.notEqual(old.nonce, fresh.nonce);
    assert(fresh.expiresAt > old.expiresAt);
    assert.deepEqual(receipt(o.result), fresh);
    const client = JSON.parse(Buffer.from(o.assertion.response.clientDataJSON, 'base64url'));
    assert.equal(
      client.challenge,
      Buffer.from(
        hash(lp('done/promotion-activation/v1', hash(JSON.stringify(old)))),
        'hex',
      ).toString('base64url'),
    );
    assert.equal(o.result.activation.proofHash, hash(canonical(o.assertion)));
  }
  assert(
    control.attempts.some(
      (o) => JSON.stringify(o.delays) === JSON.stringify(control.counterexample[0]),
    ),
  );
  for (const side of ['before-commit', 'after-commit']) {
    const o = r['restart-' + side + '.json'];
    assert.equal(o.side, side);
    assert.equal(o.operation, 'challenge-promotion');
    assert.equal(o.code, null);
    assert.equal(o.signal, 'SIGKILL');
    challenge(o.result);
    assert.deepEqual(o.retry, o.result);
    hex(o.before);
    hex(o.after);
    if (side === 'after-commit') assert.equal(o.after, o.before);
    else assert.notEqual(o.after, o.before);
  }
  for (const gate of ['signature', 'target']) {
    const o = r['control-client-' + gate + '.json'];
    assert.equal(o.gate, gate);
    assert.equal(o.baselinePrompts, 0);
    assert.equal(o.mutantPrompts, 1);
    assert.equal(o.marker, 'admission-offered');
  }
  const cancel = r['native-cancel.json'];
  assert.equal(cancel.seenAbort, true);
  assert.equal(cancel.beforeRelease.settled, false);
  assert.equal(cancel.beforeRelease.otherDone, false);
  assert(cancel.beforeRelease.pending > 0);
  assert.equal(cancel.finishes, 0);
  receipt(cancel.result);
  for (const stage of ['prompt', 'lost-finish']) {
    const o = r['native-' + stage + '.json'];
    assert.equal(o.stage, stage);
    assert.equal(o.coldPrompts, stage === 'prompt' ? 1 : 0);
    receipt(o.receipt);
    if (stage === 'prompt') assert.equal(o.beforeCrash, null);
    else assert.deepEqual(o.beforeCrash, o.receipt);
  }
  reconcileActivationHistories(r['generated-activation.json']);
}
export function reconcileActivationHistories(g) {
  assert.equal(g.seed, 9110401);
  assert.equal(g.status, 'passed');
  assert.equal(g.failed, false);
  assert.equal(g.numRuns, 120);
  assert.equal(g.numShrinks, 0);
  assert.equal(g.counterexample, null);
  assert.equal(g.counterexamplePath, null);
  assert.equal(g.histories.length, 120);
  const used = new Set(),
    coverage = {},
    verified = new Map();
  for (const [id, value] of Object.entries(g.values)) {
    hex(id);
    assert.equal(hash(JSON.stringify(value)), id, 'Activation observation bytes differ');
    // Each content-addressed response is checked once per report. Every transition
    // still resolves its exact response and checks its own clock/state bindings.
    if (value.kind === 'promotion-activation-challenge') verified.set(id, challenge(value));
    else if (value.kind === 'promotion-receipt') verified.set(id, receipt(value));
  }
  const value = (id) => {
    if (id === null) return null;
    hex(id);
    assert(Object.hasOwn(g.values, id), 'Missing activation observation');
    used.add(id);
    return g.values[id];
  };
  for (const h of g.histories) {
    assert.equal(h.completed, true);
    assert(h.commands.length >= 3 && h.commands.length <= 24);
    assert.equal(h.observations.length, h.commands.length);
    let state = 'pending',
      now = 1000,
      current,
      previous,
      retained = null,
      issued = 0,
      last = h.initial;
    assert.equal(last.accountState, 'pending');
    assert.equal(last.proofHash, null);
    assert.equal(last.receipt, null);
    for (const [i, cmd] of h.commands.entries()) {
      assert(
        ['challenge', 'advance', 'finish', 'old', 'changed', 'restart', 'abandon'].includes(cmd),
      );
      coverage[cmd] = (coverage[cmd] ?? 0) + 1;
      const o = h.observations[i];
      assert.equal(o.cmd, cmd);
      assert.equal(o.nowBefore, now);
      assert.deepEqual(o.before, last);
      const result = value(o.result);
      let writes = false;
      if (cmd === 'advance') now += 600000;
      if (cmd === 'challenge') {
        if (state === 'cancelled') assert.equal(result.ok, false);
        else if (state === 'active') assert.equal(o.result, retained);
        else {
          assert.equal(result.kind, 'promotion-activation-challenge');
          const c = verified.get(o.result);
          if (current && now < value(current).context.expiresAt) assert.equal(o.result, current);
          else {
            if (current) assert.notEqual(c.nonce, value(current).context.nonce);
            assert.equal(c.expiresAt, now + 600000);
            previous = current;
            current = o.result;
            issued++;
            writes = true;
          }
        }
      } else if ((cmd === 'finish' || cmd === 'old') && current) {
        const chosen = cmd === 'old' ? (previous ?? current) : current,
          c = value(chosen).context;
        assert.equal(o.chosenNonce, c.nonce);
        hex(o.proofHash);
        const valid =
          state !== 'cancelled' && chosen === current && (state === 'active' || now < c.expiresAt);
        if (valid) {
          assert.equal(result.kind, 'promotion-receipt');
          assert.deepEqual(verified.get(o.result), c);
          assert.equal(result.activation.proofHash, o.proofHash);
          if (retained) assert.equal(o.result, retained);
          writes = state !== 'active';
          retained = o.result;
          state = 'active';
        } else assert.equal(result.ok, false);
      } else if (cmd === 'changed' && current) assert.equal(result.ok, false);
      else if (cmd === 'abandon') {
        if (state === 'active') assert.equal(result.ok, false);
        else {
          assert.equal(result.ok, true);
          state = 'cancelled';
          writes = true;
        }
      } else assert.equal(result, null, 'Unexpected result for activation no-op');
      assert.equal(o.nowAfter, now);
      hex(o.before.inventory);
      hex(o.after.inventory);
      if (!writes)
        assert.equal(
          o.after.inventory,
          o.before.inventory,
          'Read-only activation step changed inventory',
        );
      assert.equal(o.after.accountState, state === 'active' ? 'active' : 'pending');
      assert.equal(o.after.receipt, retained);
      if (retained) {
        const r = value(retained);
        assert.equal(o.after.proofHash, r.activation.proofHash);
        assert.equal(o.after.challengeNonce, r.activation.context.nonce);
      } else assert.equal(o.after.proofHash, null);
      last = o.after;
    }
    assert.equal(h.state, state);
    assert.equal(h.issued, issued);
  }
  assert.deepEqual(
    [...used].sort(),
    Object.keys(g.values).sort(),
    'Unaccounted activation observations',
  );
  for (const op of ['challenge', 'advance', 'finish', 'old', 'changed', 'restart', 'abandon'])
    assert(coverage[op] > 0);
}
