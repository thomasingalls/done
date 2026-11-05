/** Native regression instrumentation only; never imported by an application entry. */
import { build } from 'vite';
import { resolve } from 'node:path';
import { native as base, configure } from './fixtures.mjs';
export * from './fixtures.mjs';
const omission = process.env.WARM_AUDIT_TEST_OMISSION;
if (omission && !['foreground', 'oracle'].includes(omission))
  throw Error('Unknown warm-audit test omission');
const hooks = [
  [
    '/src/crdt/accountCapture.ts',
    '    scheduleAudit = auditScheduler.refresh;',
    `    scheduleAudit = auditScheduler.refresh;
    const events = [];
    const audit = owner!.carrier.auditWarm.bind(owner!.carrier);
    owner!.carrier.auditWarm = async (task) => {
      events.push({kind: 'start', at: performance.now()});
      try {
        const complete = await audit(task);
        events.push({kind: 'end', at: performance.now(), complete});
        return complete;
      } catch (error) {
        events.push({kind: 'error', at: performance.now(), code: error.code});
        throw error;
      }
    };
    const clock = performance.now.bind(performance);
    let offset = 0;
    Object.defineProperty(performance, 'now', {configurable: true, value: () => clock() + offset});
    globalThis.warmAuditTest = {
      events,
      expire() { offset += 300001; scheduleAudit(); },
      pressure: () => owner!.carrier.pendingWarmAuditRows(),
      closed: () => live.signal.aborted,
      hold() {
        const gate = new Promise(resolve => { globalThis.releaseWarmForeground = resolve; });
        globalThis.heldWarmForeground = run(task => task.wait(async () => {
          globalThis.warmForegroundEntered = true;
          await gate;
        }));
      }
    };`,
  ],
  [
    '/src/crdt/localBaselineReuse.ts',
    'if (!sameAccountLedger(prior, full.ledger))',
    omission === 'oracle'
      ? 'if (false)'
      : 'if (!sameAccountLedger(prior, full.ledger) || globalThis.forceWarmAuditMismatch)',
  ],
  [
    '/src/crdt/warmAuditScheduler.ts',
    '    active = true;',
    "    globalThis.warmAuditTest.events.push({kind: 'scheduled'});\n    active = true;",
  ],
  ...(omission === 'foreground'
    ? [
        [
          '/src/crdt/accountCapture.ts',
          "!preparation && kind === 'foreground' ? auditScheduler?.foreground() : undefined;",
          'undefined;',
        ],
      ]
    : []),
];
let bundle;
async function instrumented() {
  if (bundle) return bundle;
  const hits = hooks.map(() => 0);
  const output = await build({
    configFile: false,
    logLevel: 'error',
    define: Object.fromEntries(
      ['BASELINE_READ', 'BASELINE_INSTALL', 'RETENTION'].map((key) => [
        `import.meta.env.VITE_ACCOUNT_${key}`,
        JSON.stringify('1'),
      ]),
    ),
    plugins: [
      {
        name: 'native-warm-audit-regression-hooks',
        enforce: 'pre',
        transform(source, id) {
          let changed = false;
          for (const [index, [path, anchor, replacement]] of hooks.entries()) {
            if (!id.endsWith(path)) continue;
            if (source.split(anchor).length !== 2) throw Error('Missing unique warm-audit hook');
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
  if (hits.some((count) => count !== 1)) throw Error('Warm-audit hooks not each applied once');
  bundle = (Array.isArray(output) ? output[0] : output).output.find(
    (file) => file.type === 'chunk',
  ).code;
  return bundle;
}
export async function warmNative(t) {
  const f = await base(t),
    setup = f.setup,
    script = await instrumented();
  f.setup = async (page) => {
    await setup(page);
    await page.evaluate(script);
    await configure(page, f.testOperatorToken);
  };
  await f.setup(f.page);
  t.after(async () => {
    await f.page.evaluate(() => globalThis.releaseWarmForeground?.()).catch(() => {});
  });
  return f;
}
