import { build } from 'vite';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
export const controls = {
  refusalId: ['old ?? e.refusalId', 'e.refusalId'],
  finalCutoff: ['s.finalThrough ??= n;', 's.finalThrough = n;'],
  prefix: ['Math.max(s.acceptedThrough, n)', 'n'],
  closure: ['s.refusals.set(n, old ?? e.refusalId);', 'void old;'],
  refusalAfterHead: ['n <= s.acceptedThrough ||', 'false ||'],
  headAfterRefusal: ['if (position <= s.acceptedThrough) s.conflict = true;', 'void position;'],
  headAfterFinal: [
    'if (s.finalThrough !== null && n > s.finalThrough) s.conflict = true;',
    'void n;',
  ],
  finalAfterHead: ['|| s.acceptedThrough > n)', ')'],
  finalState: ['s.finalThrough ??= n;', 'void n;'],
  conflict: ["if (e.kind === 'conflict') s.conflict = true;", "if (e.kind === 'conflict') void 0;"],
  submissions: [
    "if (e.kind === 'conflict')",
    "s.submissions.clear();\n  if (e.kind === 'conflict')",
  ],
  responses: ["if (e.kind === 'conflict')", "s.responses.clear();\n  if (e.kind === 'conflict')"],
};
export async function bundle(control, native = false) {
  let controlHits = 0,
    observationHits = 0;
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: [
      {
        name: 'delivery-oracle-observation',
        enforce: 'pre',
        transform(code, id) {
          if (control && id.endsWith('/src/crdt/deliveryRecord.ts')) {
            const [from, to] = controls[control];
            assert.equal(code.split(from).length, 2, control);
            code = code.replace(from, to);
            controlHits++;
          }
          if (native && id.endsWith('/src/crdt/accountDelivery.ts')) {
            const from = 'export function describeDelivery(s: DeliveryState) {';
            assert.equal(code.split(from).length, 2);
            observationHits++;
            code = code.replace(
              from,
              from +
                `
          globalThis.__deliveryObservation = {
            acceptedThrough:s.acceptedThrough,finalThrough:s.finalThrough,
            refusals:[...s.refusals],conflict:s.conflict,publication:publicationState(s),
            submissions:[...s.submissions].map(([n,b])=>[n,[...b]]),
            responses:[...s.responses].map(([n,bs])=>[n,bs.map(b=>[...b])])
          };
        `,
            );
          }
          return code;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-delivery-oracle/' + (native ? 'browser' : 'runtime') + '.ts'),
        name: native ? 'Harness' : 'DeliveryOracle',
        formats: ['iife'],
      },
    },
  });
  assert.equal(controlHits, control ? 1 : 0);
  assert.equal(observationHits, native ? 1 : 0);
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
export const load = async (control) =>
  Function((await bundle(control)) + ';return DeliveryOracle;')();
export function report(name, value) {
  if (!process.env.ACCOUNT_REPORT_DIR) return;
  mkdirSync(process.env.ACCOUNT_REPORT_DIR, { recursive: true });
  writeFileSync(
    join(process.env.ACCOUNT_REPORT_DIR, name + '.json'),
    JSON.stringify(value, null, 2) + '\n',
  );
}
export const fullStatus = (page) =>
  page.evaluate(async () => {
    await opened.deliveryStatus();
    return globalThis.__deliveryObservation;
  });
export const census = (page, item) =>
  page.evaluate((item) => Harness.compositionCensus(item.slotId, item.code), {
    slotId: item.slotId,
    code: item.code,
  });
