import {
  inboundPrepCampaign,
  validateInboundPrepCampaign,
  reconcileInboundPrepReports,
} from './account-inbound-prep-wrapper.mjs';
import {
  serviceDeliveryCampaign,
  validateServiceDeliveryCampaign,
  reconcileServiceDeliveryReports,
} from './account-service-delivery-wrapper.mjs';
import {
  deliveryCampaign,
  validateDeliveryCampaign,
  reconcileDeliveryReports,
} from './account-delivery-wrapper.mjs';
import {
  decisionsCampaign,
  validateDecisionsCampaign,
  reconcileDecisionsReports,
} from './account-decisions-wrapper.mjs';
import {
  spoolCampaign,
  validateSpoolCampaign,
  reconcileSpoolReports,
} from './account-spool-wrapper.mjs';
import {
  captureCampaign,
  validateCaptureCampaign,
  reconcileCaptureReports,
} from './account-capture-wrapper.mjs';
import {
  outboundCampaign,
  validateOutboundCampaign,
  reconcileOutboundReports,
} from './account-outbound-wrapper.mjs';
import { reconcileCampaignTrace } from './campaign-reporting.mjs';
import {
  editingCampaign,
  validateEditingCampaign,
  reconcileEditingReports,
} from './account-editing-wrapper.mjs';
import {
  handoffCampaign,
  validateHandoffCampaign,
  reconcileHandoffReports,
} from './account-handoff-wrapper.mjs';
/** One bounded stage. This module grants no whole-release coverage claim. */
import assert from 'node:assert/strict';
import { spawnOwnedStage as spawn, nestedGroupOwner, ownedPayloadPid } from './nested-groups.mjs';
import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { canonical, digest, hash, identityKey } from './identity.mjs';
import { groupState, signalGroup as kill } from './process-group.mjs';
import { startOwnedChromium } from './browser.mjs';
import { reconcileCarrier } from './carrier-adapter.mjs';
import { reconcileVitest, vitestArgv } from './vitest-adapter.mjs';
import { assertHistoricalInputs, validateHistoricalInputs } from './historical-inputs.mjs';

import { validatePlaywrightStage, reconcilePlaywright } from './playwright-adapter.mjs';

import { registrationModulePath } from './registration-modules.mjs';
import { validateFileOutputs, inspectFileOutputs } from './file-outputs.mjs';
import {
  coreCampaign,
  validateCoreCampaign,
  reconcileCoreReports,
} from './account-core-wrapper.mjs';
import {
  recoveryCampaign,
  validateRecoveryCampaign,
  reconcileRecoveryReports,
} from './account-recovery-wrapper.mjs';
import {
  authorityCampaign,
  validateAuthorityCampaign,
  reconcileAuthorityReports,
} from './account-authority-wrapper.mjs';
import {
  promotionCampaign,
  validatePromotionCampaign,
  reconcilePromotionReports,
} from './account-promotion-wrapper.mjs';
import {
  genesisCampaign,
  validateGenesisCampaign,
  reconcileGenesisReports,
} from './account-genesis-wrapper.mjs';
import {
  admissionCampaign,
  validateAdmissionCampaign,
  reconcileAdmissionReports,
} from './account-admission-wrapper.mjs';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export function validateStage(stage) {
  assert(stage && typeof stage.id === 'string' && stage.id.length, 'Stage identity required');
  assert(
    stage.argv?.length &&
      stage.argv.every((s) => typeof s === 'string' && s.length && !s.includes('\0')),
    'Invalid argv',
  );
  assert.equal(stage.argv[0], 'node', 'Only the pinned Node executable is certified');
  assert(typeof stage.variant === 'string' && stage.variant.length, 'Explicit variant required');
  assert(
    stage.env &&
      Object.entries(stage.env).every(
        ([k, v]) => /^[A-Z_][A-Z_0-9]*$/.test(k) && typeof v === 'string' && !v.includes('\0'),
      ),
    'Invalid environment',
  );
  assert(
    Object.keys(stage.env).every(
      (k) => !/^(?:NODE_OPTIONS|RELEASE_.*|HOME|PATH|TMPDIR|ACCOUNT_REPORT_DIR)$/.test(k),
    ),
    'Owned environment override',
  );
  if (Object.hasOwn(stage, 'fileOutputs')) validateFileOutputs(stage.fileOutputs);
  for (const [key, max] of [
    ['deadlineMs', 3600000],
    ['graceMs', 10000],
    ['maxLogBytes', 16 * 1024 * 1024],
    ['maxReportBytes', 4 * 1024 * 1024],
  ])
    assert(
      Number.isSafeInteger(stage[key]) && stage[key] > 0 && stage[key] <= max,
      'Invalid bound: ' + key,
    );
  assert(
    ['inherited-group-v1', 'registered-groups-v1'].includes(stage.processPolicy),
    'Unresolved process ownership',
  );
  if (stage.processPolicy === 'registered-groups-v1') {
    assert.equal(stage.variant, 'node-registered-groups-v1');
    assert(['cases', 'exit'].includes(stage.expect.kind));
  }
  if (stage.variant === 'node-registered-groups-v1')
    assert.equal(stage.processPolicy, 'registered-groups-v1');
  assert(
    Array.isArray(stage.dependsOn) && new Set(stage.dependsOn).size === stage.dependsOn.length,
    'Invalid prerequisites',
  );
  assert(
    [
      'exit',
      'cases',
      'account-core',
      'account-recovery',
      'account-authority',
      'account-promotion',
      'account-genesis',
      'account-admission',
      'account-handoff',
      'account-editing',
      'account-outbound',
      'account-capture',
      'account-spool',
      'account-decisions',
      'account-delivery',
      'account-service-delivery',
      'account-inbound-prep',
      'vitest',
      'playwright',
      'content',
      'journal',
      'admission',
      'editor-admission',
      'workspace-admission',
      'owned-startup',
      'local-genesis',
      'write-session',
      'custody',
      'content-trim',
      'local-clear',
    ].includes(stage.expect?.kind),
    'Unresolved result adapter',
  );
  if (stage.expect.kind === 'exit')
    assert.deepEqual(
      stage.expect.exitCodes,
      [0],
      'Nonzero exit alone cannot prove a mutation was detected',
    );
  else if (
    [
      'cases',
      'vitest',
      'playwright',
      'account-core',
      'account-recovery',
      'account-authority',
      'account-promotion',
      'account-genesis',
      'account-admission',
      'account-handoff',
      'account-editing',
      'account-outbound',
      'account-capture',
      'account-spool',
      'account-decisions',
      'account-delivery',
      'account-service-delivery',
      'account-inbound-prep',
    ].includes(stage.expect.kind)
  ) {
    assert(stage.expect.cases?.length, 'Empty expected case set');
    assert.equal(
      new Set(stage.expect.cases.map((c) => c.id)).size,
      stage.expect.cases.length,
      'Duplicate expected case',
    );
    for (const c of stage.expect.cases) {
      assert(
        typeof c.id === 'string' &&
          c.id.length &&
          (['pass', 'detected'].includes(c.outcome) ||
            (stage.expect.kind === 'playwright' && c.outcome === 'not-applicable')),
        'Invalid expected case',
      );
      if (c.outcome === 'detected')
        assert(
          typeof c.assertion === 'string' && c.assertion.length,
          'Mutation needs its discriminating assertion',
        );
    }
  }
  if (
    stage.expect.kind === 'account-core' ||
    stage.argv[1] === coreCampaign ||
    stage.variant === 'account-core-campaign-v1'
  )
    validateCoreCampaign(stage);
  if (
    stage.expect.kind === 'account-recovery' ||
    stage.argv[1] === recoveryCampaign ||
    stage.variant === 'account-recovery-campaign-v1'
  )
    validateRecoveryCampaign(stage);
  if (
    stage.expect.kind === 'account-authority' ||
    stage.argv[1] === authorityCampaign ||
    stage.variant === 'account-authority-campaign-v1'
  )
    validateAuthorityCampaign(stage);
  if (
    stage.expect.kind === 'account-promotion' ||
    stage.argv[1] === promotionCampaign ||
    stage.variant === 'account-promotion-campaign-v1'
  )
    validatePromotionCampaign(stage);
  if (
    stage.expect.kind === 'account-genesis' ||
    stage.argv[1] === genesisCampaign ||
    stage.variant === 'account-genesis-campaign-v1'
  )
    validateGenesisCampaign(stage);
  if (
    stage.expect.kind === 'account-admission' ||
    stage.argv[1] === admissionCampaign ||
    stage.variant === 'account-admission-campaign-v1'
  )
    validateAdmissionCampaign(stage);
  if (
    stage.expect.kind === 'account-handoff' ||
    stage.argv[1] === handoffCampaign ||
    stage.variant === 'account-handoff-campaign-v1'
  )
    validateHandoffCampaign(stage);
  if (
    stage.expect.kind === 'account-editing' ||
    stage.argv[1] === editingCampaign ||
    stage.variant === 'account-editing-campaign-v1'
  )
    validateEditingCampaign(stage);
  if (
    stage.expect.kind === 'account-outbound' ||
    stage.argv[1] === outboundCampaign ||
    stage.variant === 'account-outbound-campaign-v1'
  )
    validateOutboundCampaign(stage);
  if (
    stage.expect.kind === 'account-capture' ||
    stage.argv[1] === captureCampaign ||
    stage.variant === 'account-capture-campaign-v1'
  )
    validateCaptureCampaign(stage);
  if (
    stage.expect.kind === 'account-spool' ||
    stage.argv[1] === spoolCampaign ||
    stage.variant === 'account-spool-campaign-v1'
  )
    validateSpoolCampaign(stage);
  if (
    stage.expect.kind === 'account-decisions' ||
    stage.argv[1] === decisionsCampaign ||
    stage.variant === 'account-decisions-campaign-v1'
  )
    validateDecisionsCampaign(stage);
  if (
    stage.expect.kind === 'account-delivery' ||
    stage.argv[1] === deliveryCampaign ||
    stage.variant === 'account-delivery-campaign-v1'
  )
    validateDeliveryCampaign(stage);
  if (
    stage.expect.kind === 'account-service-delivery' ||
    stage.argv[1] === serviceDeliveryCampaign ||
    stage.variant === 'account-service-delivery-campaign-v1'
  )
    validateServiceDeliveryCampaign(stage);
  if (
    stage.expect.kind === 'account-inbound-prep' ||
    stage.argv[1] === inboundPrepCampaign ||
    stage.variant === 'account-inbound-prep-campaign-v1'
  )
    validateInboundPrepCampaign(stage);
  if (Object.hasOwn(stage.expect, 'dataInputs')) {
    const module =
      stage.expect.kind === 'cases' &&
      stage.variant === 'node-account-fixture-file-v1' &&
      stage.argv.includes('--test') &&
      registrationModulePath(stage.argv.at(-1));
    assert(
      ['vitest', 'account-outbound', 'account-inbound-prep'].includes(stage.expect.kind) || module,
      'Unreviewed registration data adapter',
    );
    const inputs = stage.expect.dataInputs;
    assert(Array.isArray(inputs) && inputs.length, 'Invalid registration data inputs');
    assert.equal(
      new Set(inputs.map((i) => i.path)).size,
      inputs.length,
      'Duplicate registration input',
    );
    for (const i of inputs) {
      assert(i && typeof i === 'object', 'Invalid registration data input');
      assert.deepEqual(Object.keys(i).sort(), ['path', 'sha256']);
      assert(
        typeof i.path === 'string' &&
          typeof i.sha256 === 'string' &&
          (module ? i.path === module : /^test\/vectors\/[A-Za-z0-9_./-]+\.json$/.test(i.path)) &&
          !i.path.split('/').includes('..') &&
          /^[a-f0-9]{64}$/.test(i.sha256),
        'Invalid registration data input',
      );
    }
  }
  if (Object.hasOwn(stage.expect, 'historyInputs')) {
    if (
      ![
        'account-genesis',
        'account-admission',
        'account-handoff',
        'account-editing',
        'account-capture',
        'account-spool',
        'account-decisions',
        'account-delivery',
        'account-service-delivery',
        'account-inbound-prep',
      ].includes(stage.expect.kind)
    ) {
      assert.equal(stage.expect.kind, 'cases', 'Historical source metadata requires Node cases');
      assert(
        stage.argv.includes('--test'),
        'Historical source metadata requires the Node reporter',
      );
    }
    validateHistoricalInputs(stage.expect.historyInputs);
  }
  if (stage.expect.kind === 'playwright') validatePlaywrightStage(stage);
  if (stage.argv[1] === 'scripts/release-validation/playwright-driver.mjs')
    assert.equal(stage.expect.kind, 'playwright', 'Browser driver requires its exact case adapter');
  if (stage.expect.kind === 'vitest') {
    assert.equal(stage.expect.files?.length, 1, 'Only single-file Vitest stages are certified');
    assert.deepEqual(stage.argv, vitestArgv(stage.expect.files[0]), 'Unreviewed Vitest invocation');
    assert.deepEqual(stage.env, {}, 'Unreviewed Vitest environment');
    assert(
      stage.expect.cases.every((c) => c.outcome === 'pass'),
      'Vitest mutations need a separate adapter',
    );
    assert(!stage.fixture, 'Native Vitest fixtures are not certified');
  }
  if (stage.argv[1] === 'node_modules/vitest/vitest.mjs')
    assert.equal(stage.expect.kind, 'vitest', 'Vitest requires its exact case adapter');
  if (
    [
      'content',
      'journal',
      'admission',
      'editor-admission',
      'workspace-admission',
      'owned-startup',
      'local-genesis',
      'write-session',
      'custody',
      'content-trim',
      'local-clear',
    ].includes(stage.expect.kind)
  ) {
    assert.equal(
      stage.argv[1],
      `scripts/${stage.expect.kind}/worker.mjs`,
      'Unreviewed carrier worker',
    );
    assert.equal(stage.fixture?.kind, 'chromium-cdp', 'Carrier requires owned Chromium');
    assert(
      stage.expect.selection?.cases.length && Array.isArray(stage.expect.selection.mutants),
      'Missing carrier denominator',
    );
  }
  if (stage.fixture) {
    if (stage.fixture.kind === 'chromium-inherited-profiles') {
      if (stage.expect.kind === 'account-recovery') validateRecoveryCampaign(stage);
      else {
        assert.equal(stage.variant, 'node-inherited-chromium-v1');
        assert(['cases', 'exit'].includes(stage.expect.kind), 'Unreviewed profile result adapter');
      }
      // The shared profile helper has a fixed 15-second startup bound. It launches
      // inside the guarded worker group, which also owns close/reopen lifetimes.
      assert.deepEqual(stage.fixture, { kind: 'chromium-inherited-profiles', startupMs: 15000 });
    } else if (stage.fixture.kind === 'chromium-registered-groups') {
      assert.equal(stage.variant, 'node-registered-groups-v1');
      assert.equal(stage.processPolicy, 'registered-groups-v1');
      assert.deepEqual(stage.fixture, { kind: 'chromium-registered-groups', startupMs: 15000 });
    } else assert.equal(stage.fixture.kind, 'chromium-cdp');
    assert(
      Number.isSafeInteger(stage.fixture.startupMs) &&
        stage.fixture.startupMs > 0 &&
        stage.fixture.startupMs <= 30000,
      'Invalid browser startup bound',
    );
  }
  if (stage.variant === 'node-inherited-chromium-v1')
    assert.equal(
      stage.fixture?.kind,
      'chromium-inherited-profiles',
      'Missing profile tool binding',
    );
  if (stage.argv.includes('--test')) {
    assert.equal(stage.expect.kind, 'cases', 'A test process needs an exact census');
    assert(
      stage.argv.includes('--test-reporter=./scripts/release-validation/node-reporter.mjs'),
      'Node tests need the owned reporter',
    );
    assert(
      !stage.argv.some((s) => /^--test-(?:name-pattern|skip-pattern|only|shard)/.test(s)),
      'Filtered Node selection is not certified',
    );
  }
}

export function reconcileCases(expected, actual, nonce) {
  assert.equal(actual.schema, 1);
  assert.equal(actual.nonce, nonce, 'Stale case report');
  assert.deepEqual(actual.errors, [], 'Reporter refused case structure');
  assert(Array.isArray(actual.cases), 'Missing actual case census');
  assert.equal(
    new Set(actual.cases.map((c) => c.id)).size,
    actual.cases.length,
    'Duplicate actual case',
  );
  const sort = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(sort(actual.cases), sort(expected), 'Incomplete or non-passing case census');
  if (actual.summary) {
    assert.equal(actual.summary.success, true, 'Node test summary failed');
    assert.equal(
      actual.summary.counts.tests,
      expected.length,
      'Node total disagrees with case census',
    );
    for (const k of ['failed', 'cancelled', 'skipped', 'todo'])
      assert.equal(actual.summary.counts[k], 0, 'Non-passing Node total: ' + k);
  }
}

export function createStageRunner({
  root,
  output,
  fingerprint,
  browserRuntime,
  heartbeat = () => {},
}) {
  assert(['darwin', 'linux'].includes(process.platform), 'POSIX process groups are required');
  root = resolve(root);
  output = resolve(output);
  const receipts = new Map(); // Only this owner's completed results are candidates for reuse.
  const issued = new WeakSet();
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const issue = (receipt) => {
    issued.add(receipt);
    return freeze(receipt);
  };
  const guardPath = join(root, 'scripts/release-validation/process-guard.mjs');
  assert(!/\s/.test(guardPath), 'Process guard needs a path without whitespace');
  mkdirSync(output, { recursive: true });
  const owner = randomUUID();
  return async function run(stage, { dependencies = [], signal } = {}) {
    stage = structuredClone(stage);
    validateStage(stage);
    assert.deepEqual(
      dependencies.map((r) => r.stageId),
      stage.dependsOn,
      'Missing or reordered prerequisite receipts',
    );
    for (const r of dependencies) {
      assert(
        r.owner === owner && r.status === 'passed' && issued.has(r),
        'Unverified prerequisite receipt',
      );
      if (r.contract.fileOutputs)
        assert.deepEqual(
          inspectFileOutputs(join(receipts.get(r.key).dir, 'files'), r.contract.fileOutputs),
          r.result.fileOutputs,
          'Changed prerequisite report tree',
        );
      for (const artifact of r.artifacts)
        assert.equal(
          hash(readFileSync(join(receipts.get(r.key).dir, artifact.path))),
          artifact.sha256,
          'Changed prerequisite result artifact',
        );
    }
    const before = await fingerprint();
    assertHistoricalInputs(root, stage.expect.historyInputs);
    for (const i of stage.expect.dataInputs ?? [])
      assert.equal(
        hash(readFileSync(join(root, i.path))),
        i.sha256,
        'Registration data changed after planning: ' + i.path,
      );
    if (stage.fixture)
      assert(
        browserRuntime && before.tools?.chromium === digest(browserRuntime.snapshot),
        'Missing or stale browser identity',
      );
    const contract = { ...stage };
    delete contract.id;
    // Dependency identity includes the complete result, not just its name.
    const prerequisiteKeys = dependencies.map((r) => ({ key: r.key, result: r.resultDigest }));
    delete contract.dependsOn;
    const key = digest({
      root,
      owner,
      input: identityKey(before),
      contract,
      prerequisites: prerequisiteKeys,
    });
    for (const r of dependencies)
      assert.equal(r.input, identityKey(before), 'Stale prerequisite inputs');
    const cached = receipts.get(key);
    if (cached) {
      if (stage.fileOutputs)
        assert.deepEqual(
          inspectFileOutputs(join(cached.dir, 'files'), stage.fileOutputs),
          cached.receipt.result.fileOutputs,
          'Changed reusable report tree',
        );
      for (const a of cached.receipt.artifacts)
        assert.equal(
          hash(readFileSync(join(cached.dir, a.path))),
          a.sha256,
          'Changed reusable result artifact',
        );
      assert(!signal?.aborted, 'Cancelled before reuse');
      return issue({ ...cached.receipt, stageId: stage.id, reused: true });
    }
    const dir = join(output, key),
      nonce = randomUUID();
    assert(!existsSync(dir), 'Refuse stale or partially written stage directory');
    mkdirSync(dir);
    for (const p of ['home', 'tmp']) mkdirSync(join(dir, p));
    const fileDirectory = join(dir, 'files');
    if (stage.fileOutputs) mkdirSync(fileDirectory);
    const report = join(dir, 'cases.json'),
      violations = join(dir, 'ownership.jsonl');
    writeFileSync(violations, '');
    const logPath = join(dir, 'output.log');
    writeFileSync(logPath, '');
    // Keep generated source beside the copied dependencies. Report directories may be
    // outside the checkout, where Vite would resolve a second package instance.
    const workerOutput = join(root, 'test-results', 'release-worker', key);
    const nestedOwner =
      stage.processPolicy === 'registered-groups-v1' || process.env.RELEASE_NESTED_ROOT
        ? nestedGroupOwner(dir, root)
        : undefined;
    let nestedResult;
    const env = {
      PATH: dirname(process.execPath) + ':/usr/bin:/bin',
      HOME: join(dir, 'home'),
      TMPDIR: join(dir, 'tmp'),
      LANG: 'C.UTF-8',
      TZ: 'UTC',
      CI: '1',
      ...nestedOwner?.environment,
      ...stage.env,
      ...(stage.fileOutputs ? { ACCOUNT_REPORT_DIR: fileDirectory } : {}),
      NODE_OPTIONS: '--import=' + guardPath,
      RELEASE_PROCESS_GUARD: guardPath,
      RELEASE_GUARD_VIOLATIONS: violations,
      RELEASE_CASE_REPORT: report,
      RELEASE_RUN_NONCE: nonce,
      ...(browserRuntime ? { RELEASE_BROWSER_EXECUTABLE: browserRuntime.executable } : {}),
      RELEASE_CONTENT_OUTPUT: join(workerOutput, 'content'),
      RELEASE_JOURNAL_OUTPUT: join(workerOutput, 'journal'),
      RELEASE_ADMISSION_OUTPUT: join(workerOutput, 'admission'),
      RELEASE_EDITOR_ADMISSION_OUTPUT: join(workerOutput, 'editor-admission'),
      RELEASE_WORKSPACE_ADMISSION_OUTPUT: join(workerOutput, 'workspace-admission'),
      RELEASE_OWNED_STARTUP_OUTPUT: join(workerOutput, 'owned-startup'),
      RELEASE_LOCAL_GENESIS_OUTPUT: join(workerOutput, 'local-genesis'),
      RELEASE_WRITE_SESSION_OUTPUT: join(workerOutput, 'write-session'),
      RELEASE_CUSTODY_OUTPUT: join(workerOutput, 'custody'),
      RELEASE_CONTENT_TRIM_OUTPUT: join(workerOutput, 'content-trim'),
      RELEASE_LOCAL_CLEAR_OUTPUT: join(workerOutput, 'local-clear'),
    };
    const started = Date.now();
    let reason = signal?.aborted ? 'cancelled' : null,
      child,
      code = null,
      childSignal = null,
      browserOwner;
    let bytes = 0,
      groupDrained = true,
      drainStarted = false,
      termSent = false,
      uncertainProbes = 0;
    const probe = () => {
      const state = groupState(child.pid);
      if (state === 'unknown') uncertainProbes++;
      return state;
    };
    const term = () => {
      if (termSent) return;
      termSent = true;
      if (probe() !== 'gone') kill(child.pid, 'SIGTERM');
    };
    const stop = (why) => {
      if (reason !== null) return;
      reason ??= why;
      try {
        nestedOwner?.cancel();
      } catch (error) {
        reason += ': nested closure ' + error.code;
      }
      if (child?.pid) {
        try {
          term();
        } catch (e) {
          reason += ': signal failure ' + e.code;
        }
      }
    };
    const abort = () => stop('cancelled');
    let timer, pulse;
    try {
      if (!reason && stage.fixture?.kind === 'chromium-cdp') {
        browserOwner = startOwnedChromium({
          runtime: browserRuntime,
          directory: dir,
          env,
          startupMs: stage.fixture.startupMs,
          graceMs: stage.graceMs,
          maxLogBytes: stage.maxLogBytes,
        });
        env.RELEASE_BROWSER_ENDPOINT = await browserOwner.ready(signal);
      }
      if (!reason) {
        child = spawn(process.execPath, stage.argv.slice(1), {
          cwd: root,
          env,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let closed = false;
        child.once('close', () => {
          closed = true;
        });
        const exited = new Promise((resolveExit) => {
          child.once('error', (e) => {
            reason ??= 'spawn: ' + e.message;
            resolveExit();
          });
          child.once('exit', (c, s) => {
            code = c;
            childSignal = s;
            resolveExit();
          });
        });
        const collect = (b) => {
          const remaining = stage.maxLogBytes - bytes;
          if (remaining > 0) {
            try {
              appendFileSync(logPath, b.subarray(0, remaining));
            } catch (e) {
              stop('log-write: ' + e.code);
            }
          }
          bytes += b.length;
          if (bytes > stage.maxLogBytes) stop('log-limit');
        };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        timer = setTimeout(() => stop('timeout'), stage.deadlineMs);
        pulse = setInterval(
          () =>
            heartbeat({
              stage: stage.id,
              elapsedMs: Date.now() - started,
              log: join(dir, 'output.log'),
            }),
          15000,
        );
        // Polling here bounds both a stuck leader and pipes inherited by an orphan. Waiting
        // only for ChildProcess.close was the old harness's unbounded edge.
        let ended = false;
        let nextFileCheck = 0;
        void exited.then(() => {
          ended = true;
        });
        while (!ended && !reason) {
          if (browserOwner?.failed) stop(browserOwner.failed);
          if (stage.fileOutputs && Date.now() >= nextFileCheck) {
            const files = inspectFileOutputs(fileDirectory, stage.fileOutputs, {
              hashes: false,
              required: false,
            });
            if (!files.complete) stop('file-outputs: ' + files.error);
            nextFileCheck = Date.now() + 100;
          }
          await delay(10);
        }
        if (child.pid) {
          // On this host a just-terminated group can transiently answer EPERM to kill(0).
          // Uncertainty is neither a living orphan nor proof of drain: require ESRCH.
          if (ended && !reason) {
            let state = probe();
            const knownUntil = Date.now() + stage.graceMs;
            while (state === 'unknown' && Date.now() < knownUntil) {
              await delay(10);
              state = probe();
            }
            if (state === 'alive') reason = 'orphaned-child';
            if (state === 'unknown') reason = 'undrained-process-group';
          }
          if (reason || probe() !== 'gone') {
            drainStarted = true;
            term();
            const until = Date.now() + stage.graceMs;
            while (probe() !== 'gone' && Date.now() < until) await delay(10);
            if (probe() !== 'gone') kill(child.pid, 'SIGKILL');
            const killUntil = Date.now() + stage.graceMs;
            while (probe() !== 'gone' && Date.now() < killUntil) await delay(10);
          }
          groupDrained = probe() === 'gone';
          if (!groupDrained) reason ??= 'undrained-process-group';
        }
        const closeUntil = Date.now() + stage.graceMs;
        while (!closed && Date.now() < closeUntil) await delay(10);
        if (!closed) reason ??= 'stdio-drain-timeout';
        child.stdout.destroy();
        child.stderr.destroy();
      }
    } catch (e) {
      reason ??= String(e);
      if (child?.pid) {
        try {
          if (probe() !== 'gone') kill(child.pid, 'SIGKILL');
        } catch (cleanupError) {
          reason += ': cleanup failure ' + cleanupError.code;
        }
        groupDrained = false;
      }
      child?.stdout?.destroy();
      child?.stderr?.destroy();
    } finally {
      clearTimeout(timer);
      clearInterval(pulse);
      signal?.removeEventListener('abort', abort);
      if (browserOwner) {
        const browserResult = await browserOwner.close();
        groupDrained = groupDrained && browserResult.groupDrained;
        if (!browserResult.groupDrained) reason ??= 'undrained-browser-group';
        if (browserResult.failure) reason ??= browserResult.failure;
      }
    }
    if (nestedOwner) {
      try {
        nestedResult = await nestedOwner.close(stage.graceMs);
        groupDrained = groupDrained && nestedResult.groupDrained;
        if (!nestedResult.groupDrained) reason ??= 'undrained-nested-groups';
        else if (nestedResult.orphaned.length) reason ??= 'orphaned-nested-group';
      } catch (error) {
        groupDrained = false;
        reason ??= 'nested-owner-close: ' + String(error);
        nestedResult = { groupDrained: false, error: String(error) };
      }
    }
    let fileOutputs;
    if (stage.fileOutputs) {
      fileOutputs = groupDrained
        ? inspectFileOutputs(fileDirectory, stage.fileOutputs)
        : { complete: false, entries: [], bytes: 0, error: 'Report producers not drained' };
      if (!fileOutputs.complete) reason ??= 'file-outputs: ' + fileOutputs.error;
      writeFileSync(join(dir, 'files.json'), canonical(fileOutputs) + '\n');
    }
    let actual;
    try {
      assert.equal(code, 0, 'Nonzero or missing exit');
      assert.equal(readFileSync(violations, 'utf8'), '', 'Process ownership violation');
      if (stage.expect.kind !== 'exit') {
        assert(
          statSync(report).size <= stage.maxReportBytes,
          'Case report exceeded artifact bound',
        );
        const reported = JSON.parse(readFileSync(report, 'utf8'));
        if (
          [
            'content',
            'journal',
            'admission',
            'editor-admission',
            'workspace-admission',
            'owned-startup',
            'local-genesis',
            'write-session',
            'custody',
            'content-trim',
            'local-clear',
          ].includes(stage.expect.kind)
        ) {
          const cases = reconcileCarrier(stage.expect.kind, stage.expect.selection, reported, {
            nonce,
            sources: before.sources,
            root,
            workerPid: ownedPayloadPid(child),
            browserExecutable: browserRuntime?.executable,
            custodyOutput: env.RELEASE_CUSTODY_OUTPUT,
          });
          actual = { cases };
        } else if (
          [
            'account-outbound',
            'account-capture',
            'account-spool',
            'account-decisions',
            'account-delivery',
            'account-service-delivery',
            'account-inbound-prep',
          ].includes(stage.expect.kind)
        ) {
          assert(
            groupDrained && fileOutputs?.complete,
            'Campaign report producers or inventory incomplete',
          );
          actual = reconcileCampaignTrace(
            stage.expect.steps,
            reported,
            nonce,
            fileDirectory,
            reconcileCases,
          );
          if (stage.expect.kind === 'account-outbound')
            reconcileOutboundReports(fileDirectory, before.sources);
          else if (stage.expect.kind === 'account-capture')
            reconcileCaptureReports(fileDirectory, before.sources);
          else if (stage.expect.kind === 'account-spool')
            reconcileSpoolReports(fileDirectory, before.sources);
          else if (stage.expect.kind === 'account-decisions')
            reconcileDecisionsReports(fileDirectory, before.sources);
          else if (stage.expect.kind === 'account-delivery')
            reconcileDeliveryReports(fileDirectory, before.sources);
          else if (stage.expect.kind === 'account-service-delivery')
            reconcileServiceDeliveryReports(fileDirectory, before.sources);
          else reconcileInboundPrepReports(fileDirectory, before.sources);
        } else if (stage.expect.kind === 'playwright') {
          actual = reconcilePlaywright(stage.expect, reported, nonce);
        } else if (stage.expect.kind === 'vitest') {
          actual = reconcileVitest(stage.expect, reported, nonce);
        } else {
          if (
            stage.argv.includes('--test') ||
            [
              'account-core',
              'account-recovery',
              'account-authority',
              'account-promotion',
              'account-genesis',
              'account-admission',
              'account-handoff',
              'account-editing',
              'account-outbound',
              'account-capture',
              'account-spool',
              'account-decisions',
              'account-delivery',
              'account-service-delivery',
              'account-inbound-prep',
            ].includes(stage.expect.kind)
          ) {
            assert.equal(reported.phase, 'complete', 'Missing terminal Node reporter completion');
            assert(reported.summary, 'Missing terminal Node summary');
          }
          reconcileCases(stage.expect.cases, reported, nonce);
          if (stage.expect.kind === 'account-core') {
            assert(
              groupDrained && fileOutputs?.complete,
              'Core report producers or inventory incomplete',
            );
            reconcileCoreReports(fileDirectory, before.sources);
          }
          if (stage.expect.kind === 'account-authority') {
            assert(
              groupDrained && fileOutputs?.complete,
              'Authority report producers or inventory incomplete',
            );
            reconcileAuthorityReports(fileDirectory, before.sources);
          }
          if (stage.expect.kind === 'account-promotion') {
            assert(
              groupDrained && fileOutputs?.complete,
              'Promotion report producers or inventory incomplete',
            );
            reconcilePromotionReports(fileDirectory, before.sources);
          }
          if (stage.expect.kind === 'account-genesis') {
            assert(
              groupDrained && fileOutputs?.complete,
              'Genesis report producers or inventory incomplete',
            );
            reconcileGenesisReports(fileDirectory, before.sources);
          }
          if (stage.expect.kind === 'account-admission') {
            assert(
              groupDrained && fileOutputs?.complete,
              'Admission report producers or inventory incomplete',
            );
            reconcileAdmissionReports(fileDirectory, before.sources);
          }
          if (stage.expect.kind === 'account-handoff') {
            assert(
              groupDrained && fileOutputs?.complete,
              'Handoff report producers or inventory incomplete',
            );
            reconcileHandoffReports(fileDirectory, before.sources);
          }
          if (stage.expect.kind === 'account-editing') {
            assert(
              groupDrained && fileOutputs?.complete,
              'Editing report producers or inventory incomplete',
            );
            reconcileEditingReports(fileDirectory, before.sources);
          }
          if (stage.expect.kind === 'account-recovery') {
            assert(
              groupDrained && fileOutputs?.complete,
              'Recovery report producers or inventory incomplete',
            );
            reconcileRecoveryReports(fileDirectory, before.sources, {
              custodyOutput: env.RELEASE_CUSTODY_OUTPUT,
              browserExecutable: browserRuntime.executable,
            });
          }
          actual = reported;
        }
      }
      assert.equal(
        identityKey(await fingerprint()),
        identityKey(before),
        'Inputs changed during execution',
      );
      assertHistoricalInputs(root, stage.expect.historyInputs);
      for (const i of stage.expect.dataInputs ?? [])
        assert.equal(
          hash(readFileSync(join(root, i.path))),
          i.sha256,
          'Registration data changed during execution: ' + i.path,
        );
    } catch (e) {
      reason ??= String(e);
    }
    const artifacts = [
      'output.log',
      'ownership.jsonl',
      ...(existsSync(join(dir, 'nested-groups.json')) ? ['nested-groups.json'] : []),
      ...(existsSync(report) ? ['cases.json'] : []),
      ...(fileOutputs ? ['files.json'] : []),
      ...(browserOwner ? ['browser.json', 'browser.log'] : []),
    ].map((path) => {
      const size = statSync(join(dir, path)).size;
      return size <= Math.max(stage.maxLogBytes, stage.maxReportBytes)
        ? { path, sha256: hash(readFileSync(join(dir, path))) }
        : { path, size, oversized: true };
    });
    for (const entry of fileOutputs?.entries ?? [])
      if (entry.type === 'file')
        artifacts.push({ path: 'files/' + entry.path, sha256: entry.sha256 });
    const result = {
      code,
      signal: childSignal,
      reason,
      groupDrained,
      drainStarted,
      uncertainProbes,
      ...(nestedResult ? { nestedGroups: nestedResult } : {}),
      ...(browserOwner ? { browser: structuredClone(browserOwner.result) } : {}),
      elapsedMs: Date.now() - started,
      artifacts,
      ...(actual ? { cases: actual.cases } : {}),
      ...(fileOutputs ? { fileOutputs } : {}),
    };
    const receipt = {
      schema: 1,
      owner,
      key,
      stageId: stage.id,
      input: identityKey(before),
      contract,
      prerequisites: prerequisiteKeys,
      environment: env,
      nonce,
      status: reason === null && groupDrained ? 'passed' : 'failed',
      result,
      resultDigest: digest(result),
      artifacts,
    };
    writeFileSync(join(dir, 'receipt.json'), canonical(receipt) + '\n');
    if (receipt.status === 'passed') receipts.set(key, { dir, receipt });
    return issue(receipt);
  };
}
