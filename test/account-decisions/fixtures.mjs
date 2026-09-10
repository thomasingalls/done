import { build } from 'vite';
import { resolve } from 'node:path';
import { native as base, configure } from '../account-spool/fixtures.mjs';
export * from '../account-spool/fixtures.mjs';
export async function decisionBundle(control) {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    plugins: control
      ? [
          {
            name: 'decision-control',
            enforce: 'pre',
            transform(code, id) {
              const targets = {
                signature: [
                  '/account-protocol/positionDecision.ts',
                  "throw Error('Position signature refused');",
                  'void 0;',
                ],
                epoch: ['/account-protocol/positionDecision.ts', 'a.epoch === b.epoch', 'true'],
                link: [
                  '/account-protocol/positionDecision.ts',
                  'if ((await acceptanceLink(candidate, own.previous, subtle)) !== h.link)',
                  'if (false)',
                ],
                parent: [
                  '/account-protocol/submission.ts',
                  's.lineage, digest, parent)',
                  's.lineage, digest, ZERO_REFUSAL)',
                ],
                position: [
                  '/account-protocol/submission.ts',
                  'p.position !== envelope.seq',
                  'false',
                ],
              };
              const t = targets[control];
              if (t && id.endsWith(t[0])) {
                if (code.split(t[1]).length !== 2)
                  throw Error('Missing/ambiguous decision control ' + control);
                return code.replace(t[1], t[2]);
              }
            },
          },
        ]
      : [],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('test/account-decisions/browser.ts'),
        name: 'Harness',
        formats: ['iife'],
      },
    },
  });
  return (Array.isArray(result) ? result[0] : result).output.find((f) => f.type === 'chunk').code;
}
const script = await decisionBundle();
export async function native(t) {
  const f = await base(t),
    setup = f.setup;
  f.setup = async (page) => {
    await setup(page);
    await page.evaluate(script);
    await configure(page);
  };
  await f.setup(f.page);
  return f;
}
export const inspect = (page, position, bytes) =>
  page.evaluate(({ position, bytes }) => opened.inspectResponse(position, new Uint8Array(bytes)), {
    position,
    bytes: [...bytes],
  });
export async function subjects(page) {
  return page.evaluate(async () => {
    const out = [];
    for (const e of await opened.listEnvelopes()) {
      const h = Harness.decodeNetworkEnvelope(e.bytes);
      out.push({
        workspace: h.workspace_id,
        credential: h.credential_id,
        position: h.seq,
        digest: Array.from(h.digest, (b) => b.toString(16).padStart(2, '0')).join(''),
        epoch: h.epoch,
      });
    }
    return out;
  });
}
