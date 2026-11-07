/** Regression stimuli only; ordinary builds never import this configuration. */
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import application from '../vite.config';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
export default defineConfig((environment) => {
  const hooks: [string, string, string][] = [
    [
      'src/crdt/accountReceive.ts',
      '  const api = Object.freeze({',
      `  globalThis.nativeReceiptAuditControl = {
    stale:false,
    baseline:() => baselineReading,
    closed:() => carrier.signal.aborted,
    input:() => globalThis.nativeReceiptAuditInput(),
    expire() { auditedAt = performance.now() - WARM_AUDIT_MS - 1; auditWake?.(); },
    note(kind) { console.info('native-receipt-audit:' + kind); }
  };
  carrier.signal.addEventListener('abort', () => globalThis.nativeReceiptAuditControl.note('closed'), {once:true});
  const api = Object.freeze({`,
    ],
    [
      'src/crdt/accountReceive.ts',
      "          countLedger('audits');",
      "          globalThis.nativeReceiptAuditControl?.note('start');\n          countLedger('audits');",
    ],
    [
      'src/crdt/accountReceive.ts',
      "            countLedger('auditCompletions');",
      "            globalThis.nativeReceiptAuditControl?.note('passed');\n            countLedger('auditCompletions');",
    ],
    [
      'src/crdt/accountCapture.ts',
      '    extension?.audit?.schedule(scheduleAudit);',
      '    extension?.audit?.schedule(scheduleAudit);\n    globalThis.nativeReceiptAuditInput = () => auditScheduler!.input();',
    ],
    [
      'src/crdt/inboundLedger.ts',
      '  const localCoverage = reuse',
      '  let staleOriginal: { envelope: Bytes; proof: Bytes } | undefined;\n  const localCoverage = reuse',
    ],
    [
      'src/crdt/inboundLedger.ts',
      '              envelope: selected.original.envelope,\n              proof: selected.original.proof,',
      `              envelope: (globalThis.nativeReceiptAuditControl?.stale
                ? (entry.extent ? (staleOriginal = selected.original) : (staleOriginal ?? selected.original))
                : selected.original).envelope,
              proof: (globalThis.nativeReceiptAuditControl?.stale ? (staleOriginal ?? selected.original) : selected.original).proof,`,
    ],
  ];
  const originals = new Map(hooks.map(([path]) => [path, readFileSync(resolve(path), 'utf8')])),
    identities: { path: string; source: string; mutated: string; anchors: number }[] = [];
  const fixture = (): Plugin => ({
    name: 'native-mixed-receipt-audit-control',
    enforce: 'pre',
    transform(source, id) {
      const path = [...originals.keys()].find((p) => id.endsWith('/' + p));
      if (!path) return;
      if (source !== originals.get(path)) throw Error('Expected exact original audit source');
      let changed = source,
        anchors = 0;
      for (const [file, anchor, replacement] of hooks) {
        if (file !== path) continue;
        if (changed.split(anchor).length !== 2) throw Error('Expected one audit control anchor');
        changed = changed.replace(anchor, replacement);
        anchors++;
      }
      identities.push({
        path,
        source: createHash('sha256').update(source).digest('hex'),
        mutated: createHash('sha256').update(changed).digest('hex'),
        anchors,
      });
      return changed;
    },
  });
  return mergeConfig(application(environment), {
    worker: { plugins: () => [fixture()] },
    plugins: [
      {
        name: 'native-audit-control-identities',
        closeBundle() {
          for (const path of originals.keys())
            if (!identities.some((x) => x.path === path))
              throw Error('Missing actual audit Worker');
          const out = resolve('test-results/inbound-audit');
          mkdirSync(out, { recursive: true });
          writeFileSync(out + '/build.json', JSON.stringify({ identities }, null, 2) + '\n');
        },
      },
    ],
  });
});
