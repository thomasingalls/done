import { execFileSync } from 'node:child_process';
import { relative } from 'node:path';
import { defineConfig } from 'vite';
import base from '../../2026-10-12-online-typing/probe/build.config';
export default defineConfig(async env => {
 const ref=process.env.HISTORY_REF;
 if(!['08a82089','02829405'].includes(ref??''))throw Error('Unspecified historical build');
 const config=await(typeof base==='function'?base(env):base);
 return {...config,plugins:[{name:'exact-historical-runtime',enforce:'pre' as const,
 load(id:string){const file=relative(process.cwd(),id);if(!/^(src|account-protocol|private)\//.test(file)||! /\.(tsx?|css)$/.test(file))return;
 return execFileSync('git',['show',ref+':'+file],{encoding:'utf8'});
 }},config.plugins]};
});
