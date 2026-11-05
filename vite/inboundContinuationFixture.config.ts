/** Test-only entry and fault. Ordinary application/Docker builds never import this file. */
import { defineConfig, mergeConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import application from '../vite.config';
export default defineConfig((environment) => {
  const fault = process.env['INBOUND_CONTINUATION_STARVATION_CONTROL'] === '1';
  const original = readFileSync(resolve('src/crdt/receiveSelection.ts'), 'utf8');
  const anchor = '        next = index + 1;',
    replacement = '        next = progress ? index : index + 1;';
  if (original.split(anchor).length !== 2) throw Error('Expected unique exhausted-turn control');
  const identities: { source: string; mutated: string }[] = [];
  const control = (): Plugin => ({
    name: 'native-continuation-starvation-control',
    enforce: 'pre',
    transform(source, id) {
      if (!id.endsWith('/src/crdt/receiveSelection.ts')) return;
      if (source !== original) throw Error('Expected exact native selector source');
      const mutated = source.replace(anchor, replacement);
      if (mutated.replace(replacement, anchor) !== source) throw Error('Fault scope differs');
      const sha = (s: string) => createHash('sha256').update(s).digest('hex');
      identities.push({ source: sha(source), mutated: sha(mutated) });
      return mutated;
    },
  });
  return mergeConfig(application(environment), {
    ...(fault ? { worker: { plugins: () => [control()] } } : {}),
    plugins: [
      {
        name: 'native-continuation-control-identity',
        closeBundle() {
          if (fault && !identities.length) throw Error('Control did not reach real Worker');
          const path = process.env['INBOUND_CONTINUATION_BUILD_RECORD'];
          if (!path) throw Error('Expected declared build identity output');
          mkdirSync(resolve(path, '..'), { recursive: true });
          writeFileSync(path, JSON.stringify({ fault, identities }, null, 2) + '\n');
        },
      },
    ],
    build: {
      rollupOptions: {
        input: {
          app: 'index.html',
          local: 'local.html',
          continuation: 'test/inbound-continuation/driver.html',
        },
      },
    },
  });
});
