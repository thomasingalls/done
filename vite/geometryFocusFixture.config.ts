/** Test-only regression control. Ordinary application builds never import this config. */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import application from '../vite.config';

export default defineConfig(async (environment) => {
  const config = await (typeof application === 'function' ? application(environment) : application);
  let mutations = 0;
  let sourceHash = '',
    mutatedHash = '';
  return {
    ...config,
    plugins: [
      {
        name: 'geometry-immediate-goals-focus-regression',
        enforce: 'pre' as const,
        transform(code: string, id: string) {
          if (!id.endsWith('/src/ui/App.tsx')) return;
          const original = `    goalsFocusTimer.current = window.setTimeout(() => {
      goalsFocusTimer.current = undefined;
      goalsEditor.current?.focus();
    }, SNAP_MS);`;
          if (code.split(original).length !== 2) throw Error('Nonunique Goals focus timer control');
          const changed = code.replace(original, '    goalsEditor.current?.focus();');
          mutations++;
          sourceHash = createHash('sha256').update(code).digest('hex');
          mutatedHash = createHash('sha256').update(changed).digest('hex');
          return changed;
        },
        closeBundle() {
          if (mutations !== 1)
            throw Error('The immediate-focus regression must change exactly one module');
          const report = resolve('test-results/geometry-focus-control-build.json');
          mkdirSync(dirname(report), { recursive: true });
          writeFileSync(
            report,
            JSON.stringify(
              { mutations, sourceHash, mutatedHash, removed: 'Goals SNAP_MS timer only' },
              null,
              2,
            ) + '\n',
          );
        },
      },
      ...(config.plugins ?? []),
    ],
  };
});
