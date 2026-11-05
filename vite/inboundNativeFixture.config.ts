/** Test-only interior-cut probe; ordinary builds never import this config. It lowers only the
 * live page's remaining record allowance. Every native/authentication/commit guard stays intact. */
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import application from '../vite.config';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export default defineConfig((environment) => {
  let repeatedExactTransform = 0;
  const originalSource = readFileSync(resolve('src/crdt/accountReceive.ts'), 'utf8');
  const identities: { source: string; mutated: string }[] = [];
  const cut = (): Plugin => ({
    name: 'native-dense-interior-cut',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/crdt/accountReceive.ts')) return;
      const anchor =
        '{ bytes: MAX_BATCH_BYTES - bytes, records: MAX_BATCH_RECORDS - writes.length },';
      const replacement =
        '{ bytes: MAX_BATCH_BYTES - bytes, records: Math.min(3, MAX_BATCH_RECORDS - writes.length) },';
      if (source === originalSource.replace(anchor, replacement)) {
        repeatedExactTransform++;
        return;
      }
      if (source !== originalSource || source.split(anchor).length !== 2)
        throw Error('Expected one exact live dense record allowance');
      const changed = source.replace(
        anchor,
        '{ bytes: MAX_BATCH_BYTES - bytes, records: Math.min(3, MAX_BATCH_RECORDS - writes.length) },',
      );
      identities.push({
        source: createHash('sha256').update(source).digest('hex'),
        mutated: createHash('sha256').update(changed).digest('hex'),
      });
      return changed;
    },
  });
  return mergeConfig(application(environment), {
    plugins: [
      {
        name: 'native-dense-cut-identity',
        closeBundle() {
          if (!identities.length) throw Error('Dense cut control did not reach actual owners');
          const out = resolve('test-results/inbound-native');
          mkdirSync(out, { recursive: true });
          writeFileSync(
            out + '/cut-build.json',
            JSON.stringify(
              {
                identities,
                repeatedExactTransform,
                onlyChange: 'live remaining record allowance capped at3; no guard omission',
              },
              null,
              2,
            ) + '\n',
          );
        },
      },
    ],
    worker: { plugins: () => [cut()] },
  });
});
