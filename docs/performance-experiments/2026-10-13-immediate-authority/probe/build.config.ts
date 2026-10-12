import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
import base from '../../2026-10-12-authority-read/probe/build.config';
const files = ['src/crdt/accountCapture.ts','src/crdt/accountLedgerMetrics.ts','src/crdt/accountReceive.ts','src/crdt/admissionQueue.ts'];
export default defineConfig(async env => {
  const config = await (typeof base === 'function' ? base(env) : base);
  const plugins = (config.plugins ?? []).flat(Infinity).filter(Boolean).map((plugin:any) => {
    if (plugin.name !== 'final-apply-attribution') return plugin;
    const transform = plugin.transform;
    // All unchanged span probes stay matched; the old final closure anchor is obsolete.
    return {...plugin, transform(code:string,id:string) {
      if(id.endsWith('/src/crdt/accountReceive.ts')) return;
      return transform.call(this,code,id);
    }};
  });
  return {...config, plugins:[{name:'signed-immediate-reference',enforce:'pre' as const,
    load(id:string) {
      if(process.env.IMMEDIATE_ARM!=='reference') return;
      const file=files.find(f=>id.endsWith('/'+f));
      if(file)return execFileSync('git',['show','5c7ba18a:'+file],{encoding:'utf8'});
    },
  },plugins]};
});
