/** Native regression hooks only; no application entry imports this module. */
import { build } from 'vite';
import { resolve } from 'node:path';
import { native as base, configure } from '../account-sync/fixtures.mjs';
export * from '../account-sync/fixtures.mjs';
const omission = process.env.UNREDUCED_AUDIT_OMISSION;
if (omission && omission !== 'comparison') throw Error('Unknown unreduced audit omission');
let script;
async function bundle() {
  if (script) return script;
  const hooks = [
    [
      '/src/crdt/accountCapture.ts',
      '    scheduleAudit = auditScheduler.refresh;',
      `    scheduleAudit = auditScheduler.refresh;
    const clock = performance.now.bind(performance);
    let offset = 0;
    Object.defineProperty(performance, 'now', {configurable:true, value:() => clock() + offset});
    globalThis.unreducedAuditFixture = {
      events: [], mismatch:false,
      expire() { offset += 300001; scheduleAudit(); },
      closed:() => live.signal.aborted,
      pressure:() => extension?.audit ? ({rows:extension.audit.pendingRows(), positions:extension.audit.pendingPositions(), due:extension.audit.due()}) : undefined,
      hold() {
        const gate = new Promise(resolve => {globalThis.releaseUnreducedForeground = resolve;});
        globalThis.heldUnreducedForeground = run(task => task.wait(async () => {
          globalThis.unreducedForegroundEntered = true;
          await gate;
        }));
      }
    };`,
    ],
    [
      '/src/crdt/accountReceive.ts',
      "          countLedger('audits');",
      "          globalThis.unreducedAuditFixture?.events.push('start');\n          countLedger('audits');",
    ],
    [
      '/src/crdt/accountReceive.ts',
      '            if (!sameAccountLedger(result, oracle)) {',
      omission === 'comparison'
        ? "            globalThis.unreducedAuditFixture?.events.push('compare');\n            if (false) {"
        : "            globalThis.unreducedAuditFixture?.events.push('compare');\n            if (!sameAccountLedger(result, oracle) || globalThis.unreducedAuditFixture?.mismatch) {",
    ],
    [
      '/src/crdt/accountReceive.ts',
      "            countLedger('auditCompletions');",
      "            globalThis.unreducedAuditFixture?.events.push('passed');\n            countLedger('auditCompletions');",
    ],
    [
      '/src/crdt/accountReceive.ts',
      '  const api = Object.freeze({',
      '  globalThis.unreducedOwnerUsesBaseline = () => baselineReading;\n  const api = Object.freeze({',
    ],
  ];
  const hits = hooks.map(() => 0),
    output = await build({
      configFile: false,
      logLevel: 'error',
      define: {
        'import.meta.env': JSON.stringify({
          VITE_ACCOUNT_BASELINE_READ: '1',
          VITE_ACCOUNT_BASELINE_INSTALL: '1',
          VITE_ACCOUNT_RETENTION: '1',
        }),
      },
      plugins: [
        {
          name: 'unreduced-native-audit-regression',
          enforce: 'pre',
          transform(source, id) {
            let changed = false;
            for (const [index, [path, anchor, replacement]] of hooks.entries()) {
              if (!id.endsWith(path)) continue;
              if (source.split(anchor).length !== 2)
                throw Error('Missing unique unreduced audit hook ' + index);
              hits[index]++;
              source = source.replace(anchor, replacement);
              changed = true;
            }
            if (changed) return source;
          },
        },
      ],
      build: {
        write: false,
        minify: false,
        lib: { entry: resolve('test/account-sync/browser.ts'), name: 'Harness', formats: ['iife'] },
      },
    });
  if (hits.some((n) => n !== 1)) throw Error('Unreduced audit hooks not applied exactly once');
  script = (Array.isArray(output) ? output[0] : output).output.find((x) => x.type === 'chunk').code;
  return script;
}
export async function nativeUnreduced(t) {
  const f = await base(t),
    setup = f.setup,
    code = await bundle();
  f.setup = async (page) => {
    await setup(page);
    await page.evaluate(code);
    await configure(page, f.testOperatorToken);
  };
  await f.setup(f.page);
  t.after(async () => {
    await f.page.evaluate(() => globalThis.releaseUnreducedForeground?.()).catch(() => {});
  });
  return f;
}
