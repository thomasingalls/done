import { build } from 'vite';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { native as base, args, waitPredicate } from '../account-receive-driver/fixtures.mjs';
export * from '../account-receive-driver/fixtures.mjs';
export async function syncBundle(control, mode = process.env.ACCOUNT_LEDGER_MODE) {
  let hits = 0;
  const targets = {
    'flush-copy-boundary': [
      '/src/crdt/journalStore.ts',
      'const batch = entries.slice(offset, offset + 256);',
      `const batch = entries.slice(offset, offset + 256);
        await globalThis.flushCopyProbe?.('before-commit');`,
    ],
    'audit-disagreement': [
      '/src/crdt/accountReceive.ts',
      'if (!sameAccountLedger(result, oracle)) {',
      'if (!sameAccountLedger(result, oracle) || globalThis.forceLedgerDisagreement) {',
    ],
    'self-decision-refusal': [
      '/src/crdt/accountDelivery.ts',
      'recordResponse: async (position: number, answer: Bytes) => {',
      `recordResponse: async (position: number, answer: Bytes) => {
        if (globalThis.selfDecisionRefusal) {
          globalThis.selfDecisionCalls = (globalThis.selfDecisionCalls ?? 0) + 1;
          globalThis.selfDecisionProof = answer;
          return { kind: globalThis.selfDecisionRefusal, recorded: false };
        }`,
    ],
    'verification-order': [
      '/src/crdt/accountReceive.ts',
      'async validate(task, records, route, counter, view) {',
      `async validate(task, records, route, counter, view) {
        await globalThis.verificationOrderProbe?.();`,
    ],
    classification: [
      '/src/crdt/accountReceive.ts',
      "throw new AdmissionError('receive-refused', 'Self-stream history differs', {\n                  cause,\n                });",
      'throw cause;',
    ],
    self: [
      '/src/crdt/accountSyncState.ts',
      'if (!local || hex(local) !== hex(envelope))',
      'if (false)',
    ],
    dispatch: [
      '/src/crdt/accountDelivery.ts',
      'context.canSubmit?.() === false',
      '(globalThis.syncDispatchBoundary?.(), false)',
    ],
    'dispatch-baseline': [
      '/src/crdt/accountDelivery.ts',
      'context.canSubmit?.() === false',
      '(globalThis.syncDispatchBoundary?.(), context.canSubmit?.() === false)',
    ],
  };
  const target = targets[control];
  const result = await build({
    configFile: false,
    logLevel: 'error',
    define: {
      ...(process.env.ACCOUNT_AUTHORITY_REUSE
        ? {
            'import.meta.env.VITE_ACCOUNT_AUTHORITY_REUSE': JSON.stringify(
              process.env.ACCOUNT_AUTHORITY_REUSE,
            ),
            'import.meta.env.VITE_ACCOUNT_LEDGER_PROFILE': JSON.stringify('1'),
          }
        : {}),
      ...(process.env.ACCOUNT_BACKGROUND_FLUSH
        ? {
            'import.meta.env.VITE_ACCOUNT_BACKGROUND_FLUSH': JSON.stringify(
              process.env.ACCOUNT_BACKGROUND_FLUSH,
            ),
          }
        : {}),
      ...(process.env.ACCOUNT_SELECTIVE_LOADS
        ? {
            'import.meta.env.VITE_ACCOUNT_SELECTIVE_LOADS': JSON.stringify(
              process.env.ACCOUNT_SELECTIVE_LOADS,
            ),
          }
        : {}),
      ...(process.env.ACCOUNT_RECORD_OWNERSHIP
        ? {
            'import.meta.env.VITE_ACCOUNT_RECORD_OWNERSHIP': JSON.stringify(
              process.env.ACCOUNT_RECORD_OWNERSHIP,
            ),
          }
        : {}),
      ...(process.env.ACCOUNT_BATCH_MODE
        ? {
            'import.meta.env.VITE_ACCOUNT_BATCH': JSON.stringify(process.env.ACCOUNT_BATCH_MODE),
            'import.meta.env.VITE_ACCOUNT_LEDGER_PROFILE': JSON.stringify('1'),
          }
        : {}),
      // Omit the define entirely to exercise the source default, not an explicit opt-in.
      ...(mode === undefined
        ? {}
        : { 'import.meta.env.VITE_ACCOUNT_LEDGER': JSON.stringify(mode) }),
      'import.meta.env.VITE_ACCOUNT_LEDGER_AUDIT': JSON.stringify(
        process.env.ACCOUNT_LEDGER_AUDIT ?? '',
      ),
    },
    plugins: control
      ? [
          {
            name: 'sync-control',
            enforce: 'pre',
            transform(code, id) {
              if (
                control === 'r01-old-writer' &&
                [
                  'account-protocol/envelope.ts',
                  'src/crdt/accountEnvelopePreparation.ts',
                  'src/crdt/accountDelivery.ts',
                ].some((p) => id.endsWith('/' + p))
              ) {
                hits++;
                if (id.endsWith('/account-protocol/envelope.ts')) {
                  const anchor = 'plaintext = admittedBody(h, body);';
                  if (code.split(anchor).length !== 2)
                    throw Error('Missing historical sealer anchor');
                  return code.replace(anchor, 'plaintext = encodeEnvelopeBody(body);');
                }
                const path = id.slice(resolve('.').length + 1);
                return execFileSync(
                  'git',
                  ['show', '4bb09042f37f68ec31f0d82587af608f599eb096:' + path],
                  { encoding: 'utf8', timeout: 5000, maxBuffer: 2 * 1024 * 1024 },
                );
              }
              if (
                control === 'r01-no-preflight' &&
                id.endsWith('/src/crdt/accountEnvelopePreparation.ts')
              ) {
                const anchor =
                  'assertAdmittedEnvelope({ ...networkRoute(route), seq: number }, body);';
                if (code.split(anchor).length !== 2) throw Error('Missing R-01 preflight anchor');
                hits++;
                return code.replace(anchor, 'void body;');
              }

              if (control === 'witness' && id.endsWith('/src/crdt/spoolRecord.ts')) {
                const pattern =
                  /(export async function verifySpoolWitness\([\s\S]*?\): Promise<void> \{)/g;
                if ([...code.matchAll(pattern)].length !== 1) throw Error('Missing witness anchor');
                hits++;
                return code.replace(pattern, '$1 return;');
              }
              if (!target || !id.endsWith(target[0])) return;
              if (code.split(target[1]).length !== 2)
                throw Error('Missing mutation anchor ' + control);
              hits++;
              if (control === 'flush-copy-boundary') {
                const after = 'task.step(() => {\n          for (const entry of batch)';
                if (code.split(after).length !== 2) throw Error('Missing flush cleanup boundary');
                code = code.replace(
                  after,
                  `await globalThis.flushCopyProbe?.('after-commit');\n        ${after}`,
                );
              }
              return code.replace(target[1], target[2]);
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: { entry: resolve('test/account-sync/browser.ts'), name: 'Harness', formats: ['iife'] },
    },
  });
  if (control && hits !== (control === 'r01-old-writer' ? 3 : 1))
    throw Error('Mutation did not apply');
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
const script = await syncBundle();
export async function configure(page, token) {
  await page.evaluate((token) => {
    window.openSync = async (item) => {
      window.opened = await Harness.openOwnedSyncingAccountWorkspace(optionsFor(item), token);
      window.editor = opened.workspace;
      window.surface = editor.text({ kind: 'master' });
      return editor.read();
    };
  }, token);
}
export async function native(t) {
  const f = await base(t),
    setup = f.setup;
  f.setup = async (page) => {
    await setup(page);
    await page.evaluate(script);
    await configure(page, f.testOperatorToken);
    await page.evaluate(() => {
      if (window.__syncInstrumented) return;
      window.__syncInstrumented = true;
      window.netBodies = [];
      const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
      crypto.subtle.encrypt = async function (alg, key, bytes) {
        if (
          alg.additionalData &&
          new TextDecoder().decode(alg.additionalData).includes('done/env/v2')
        )
          netBodies.push([...new Uint8Array(bytes)]);
        return encrypt(alg, key, bytes);
      };
    });
  };
  await f.setup(f.page);
  return f;
}
export const syncing = (page, item) => page.evaluate((item) => openSync(item), args(item));
export const syncStatus = (page) => page.evaluate(() => opened.sync.status);
export const retryLane = (page, lane) => page.evaluate((lane) => opened.sync.retry(lane), lane);
export const settled = (page) =>
  waitPredicate(
    page,
    async () => {
      if (opened.sync.status.send.phase !== 'idle') return false;
      const c = await opened.listCaptures();
      const expected = c.flatMap((c) => c.sources.map((_, index) => [c.id, index]));
      for (const item of c) Harness.eraseCapsule(item);
      const spool = await opened.spoolStatus();
      const refs = spool.positions.flatMap((p) =>
        [p.source, ...(p.additional ?? [])].map((s) => [s.id, s.index]),
      );
      return (
        opened.sync.status.send.phase === 'idle' &&
        JSON.stringify(refs) === JSON.stringify(expected) &&
        opened.sync.status.send.acceptedThrough === spool.positions.length &&
        opened.sync.status.receive.receivedThrough === spool.positions.length
      );
    },
    30000,
  );
export const requestWire = (route) => JSON.parse(route.request().postData())[3];
