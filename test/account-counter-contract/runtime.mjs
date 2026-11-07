import { build } from 'vite';
import { resolve } from 'node:path';
export const controls = {
  root: ['contentRecord.ts', '  s.rootId,', ''],
  witnessState: ['contentRecord.ts', 'w.v, w.state, w.intent', 'w.v, w.intent'],
  counterSpool: ['contentRecord.ts', '...(c.v === 2 ? [[c.spool.events, c.spool.hash]] : []),', ''],
  equalMac: ['contentRecord.ts', ' && hex(a.mac) === hex(b.mac)', ''],
  reserve: ['contentStore.ts', 'if (await compareAndWrite(task, before, next)) {', 'if (true) {'],
  sum: ['contentRecord.ts', 'total !== next_seq - 1', 'false'],
  ceiling: [
    'contentRecord.ts',
    'c.reserved[String(generation)]! + count >= CONTENT_LIMIT',
    'false',
  ],
};
export async function bundle(control, native = false) {
  let hits = 0;
  const r = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'counter-controls',
            enforce: 'pre',
            transform(code, id) {
              const [file, from, to] = controls[control];
              if (!id.endsWith('/src/crdt/' + file)) return;
              if (code.split(from).length !== 2) throw Error('Control anchor moved: ' + control);
              hits++;
              return code.replace(from, to);
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve(
          'test/account-counter-contract/' + (native ? 'native-browser.ts' : 'browser.ts'),
        ),
        name: 'CounterContract',
        formats: ['iife'],
      },
    },
  });
  if (control && hits !== 1) throw Error('Control not exercised: ' + control);
  return (Array.isArray(r) ? r[0] : r).output.find((f) => f.type === 'chunk').code;
}
export const load = async (control) =>
  Function((await bundle(control)) + ';return CounterContract;')();
