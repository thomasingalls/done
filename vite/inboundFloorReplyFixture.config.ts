/** Native reply-loss control only; ordinary builds never import this configuration. */
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import retained from './inboundInstallationFixture.config';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export default defineConfig((environment) => {
  const config = retained(environment),
    original = readFileSync(resolve('src/crdt/joinedAccount.ts'), 'utf8'),
    anchor =
      '  await writeJoined(task, state, next, state.record, () =>\n' +
      '    requireAccountFormatSessionTask(task, slotId),\n' +
      '  );\n  return next;',
    omission = process.env['INBOUND_FLOOR_REPLY_OMISSION'];
  if (omission && omission !== '1') throw Error('Unknown floor reply control');
  if (original.split(anchor).length !== 2) throw Error('Expected one private floor CAS');
  const effect = omission
      ? "  if (phase !== 'installing') {\n" + anchor.slice(0, -'  return next;'.length) + '  }\n'
      : anchor.slice(0, -'  return next;'.length),
    changed = original.replace(
      anchor,
      effect +
        "  if (phase === 'installing') throw Error('test-only floor acknowledgment reply lost');\n" +
        '  return next;',
    ),
    identities: { source: string; mutated: string }[] = [];
  const replyLoss = (): Plugin => ({
    name: 'native-floor-reply-loss-control',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/crdt/joinedAccount.ts')) return;
      if (source !== original) throw Error('Expected original native floor source');
      identities.push({
        source: createHash('sha256').update(source).digest('hex'),
        mutated: createHash('sha256').update(changed).digest('hex'),
      });
      return changed;
    },
  });
  return mergeConfig(config, {
    worker: { plugins: () => [replyLoss()] },
    plugins: [
      {
        name: 'native-floor-reply-control-identity',
        closeBundle() {
          if (!identities.length) throw Error('Floor reply control did not reach Workers');
          const out = resolve('test-results/inbound-floor-reply');
          mkdirSync(out, { recursive: true });
          writeFileSync(
            out + '/build.json',
            JSON.stringify({ omission: !!omission, identities }, null, 2) + '\n',
          );
        },
      },
    ],
  });
});
