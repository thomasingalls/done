/** Test-only creation of an approved binary retained reading, using unchanged signed originals. */
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import application from '../vite.config';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export default defineConfig((environment) => {
  const original = readFileSync(resolve('src/account/contentReader.ts'), 'utf8'),
    anchor = '          const wire = hex(result.record);',
    replacement = '          const wire = retainBinaryFixture(state, base, bytes, page, result);',
    changed =
      original.replace(anchor, replacement) +
      "\nimport { retainBinaryFixture } from '../../test/inbound-installation/retained';\n";
  if (original.split(anchor).length !== 2) throw Error('Expected one verified ceremony result');
  const identities: { original: string; mutated: string }[] = [];
  const fixture = (): Plugin => ({
    name: 'retained-binary-installation-fixture',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/account/contentReader.ts')) return;
      if (source !== original) throw Error('Expected original Worker reader');
      identities.push({
        original: createHash('sha256').update(source).digest('hex'),
        mutated: createHash('sha256').update(changed).digest('hex'),
      });
      return changed;
    },
  });
  return mergeConfig(application(environment), {
    plugins: [
      {
        name: 'retained-binary-fixture-identity',
        closeBundle() {
          if (!identities.length) throw Error('Fixture did not reach an actual Worker');
          const out = resolve('test-results/inbound-installation');
          mkdirSync(out, { recursive: true });
          writeFileSync(out + '/build.json', JSON.stringify({ identities }, null, 2) + '\n');
        },
      },
    ],
    worker: { plugins: () => [fixture()] },
  });
});
