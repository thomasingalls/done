import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
import base from '../../2026-10-12-authority-read/probe/build.config';

// Comparison only: no runtime switch, alternate credential policy or authority shortcut.
export default defineConfig(async env => {
  const config = await (typeof base === 'function' ? base(env) : base);
  return {...config, plugins: [{name:'status-reference', enforce:'pre' as const,
    load(id: string) {
      if (process.env.STATUS_ARM !== 'reference') return;
      const file = ['src/ui/workspaceUi.tsx','src/ui/Goals.tsx'].find(file => id.endsWith('/'+file));
      if (file) return execFileSync('git', ['show','e730ac57:'+file], {encoding:'utf8'});
    },
  }, config.plugins]};
});
