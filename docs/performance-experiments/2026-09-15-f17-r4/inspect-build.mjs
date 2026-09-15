import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {SourceMap} from 'node:module';
const home=import.meta.dirname,observations=[];
for(const variant of ['selected','candidate']){
 const assets=join(home,'builds',variant,'assets');
 for(const name of readdirSync(assets).filter(n=>n.startsWith('main-')&&n.endsWith('.js'))){
  const code=readFileSync(join(assets,name),'utf8'),map=new SourceMap(JSON.parse(readFileSync(join(assets,name+'.map'),'utf8')));
  for(const match of code.matchAll(/new Map\b|cardById/g)){
   const at=match.index,prefix=code.slice(0,at),line=prefix.split('\n').length-1,column=at-(prefix.lastIndexOf('\n')+1),entry=map.findEntry(line,column);
   if(!entry.originalSource?.endsWith('/ui/Collection.tsx')&&!entry.originalSource?.endsWith('/ui/workspaceUi.tsx'))continue;
   observations.push({variant,bundle:name,offset:at,generatedLine:line+1,generatedColumn:column,token:match[0],source:entry.originalSource,line:entry.originalLine+1,snippet:code.slice(Math.max(0,at-150),at+240)});
  }
 }
}
const count=(variant,suffix)=>observations.filter(r=>r.variant===variant&&r.source.endsWith(suffix)&&r.token==='new Map').length;
if(count('selected','/ui/Collection.tsx')!==1||count('candidate','/ui/Collection.tsx')!==0||count('candidate','/ui/workspaceUi.tsx')!==1)throw Error('Inspect unexpected compiled Map sites');
const result={note:'Source-mapped static compiled sites, not counts of runtime executions or measured allocations. React may rerender or discard a memo; correctness must not depend on caching.',observations};
writeFileSync(join(home,'compiled-index.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
