from pathlib import Path
import subprocess,shutil
home=Path(__file__).parent;selected=home/'selected';candidate=home/'candidate'
old=Path('/Users/thomasingalls/.codex/worktrees/c030/done/docs/performance-experiments/2026-09-15-f17-publication-r1')
def diff(a,b):
 r=subprocess.run(['git','diff','--no-index','--',str(a),str(b)],text=True,capture_output=True);assert r.returncode==1
 return r.stdout.replace('a'+str(selected)+'/','a/').replace('b'+str(candidate)+'/','b/').replace('a'+str(candidate)+'/','a/')
runtime=['src/crdt/admittedWorkspace.ts','src/crdt/workspacePreparation.ts','src/crdt/admissionQueue.ts','src/crdt/yjs.ts']
new=['test/historyRetirement.test.ts','test/textBufferBasis.test.ts','test/textBufferNormalizationProbe.test.ts','test/admittedEditorProjection.test.ts']
patch=''.join(diff(selected/f,candidate/f) for f in runtime+['test/workspaceAdmission.test.ts'])+''.join(diff('/dev/null',candidate/f) for f in new)
(home/'persistent-buffers.patch').write_text(patch)
full=subprocess.check_output(['git','diff'],cwd=candidate,text=True)+''.join(diff('/dev/null',candidate/f) for f in new+['test/membershipEligibility.test.ts'])
(home/'candidate.patch').write_text(full)
for f in ['batch.mjs','analyze.mjs']:shutil.copy2(old/f,home/f)
s=(old/'build.mjs').read_text()
s=s.replace('const transformed = code.replace(from,', 'let transformed = code.replace(from,')
needle="writeFileSync(join(home,name+'-activated-admittedWorkspace.ts'),transformed);return transformed;"
assert needle in s
s=s.replace(needle,'''const hook = `const recordTextBuffer = (reused: boolean) => {
 const host = globalThis as typeof globalThis & { __textBuffers?: {prepares:number;reuses:number} };
 const counts = host.__textBuffers ??= {prepares:0,reuses:0};
 counts.prepares++; if(reused)counts.reuses++;
};\n`;
transformed = transformed.replace('type State =',hook+'type State =');
const fresh='scope?.ownState(state);';
if(transformed.split(fresh).length!==2)throw Error('Fresh counter seam');
transformed=transformed.replace(fresh,'recordTextBuffer(false); '+fresh);
if(name==='candidate'){
 const reuse='scope!.ownState(state);';
 if(transformed.split(reuse).length!==2)throw Error('Reuse counter seam');
 transformed=transformed.replace(reuse,'recordTextBuffer(true); '+reuse);
}
'''+needle)
(home/'build.mjs').write_text(s)
shutil.copy2(old/'screen.mjs',home/'original-screen.mjs')
s=(old/'screen.mjs').read_text()
s=s.replace('const samples=await type(key,40,true);', '''const before=await page.evaluate(()=>({...globalThis.__textBuffers}));
const samples=await type(key,40,true);
const after=await page.evaluate(()=>({...globalThis.__textBuffers}));
assert(Number.isSafeInteger(before.prepares)&&Number.isSafeInteger(after.prepares));
assert(after.prepares-before.prepares>=40,'Measured input must prepare');
const reused=after.reuses-before.reuses;
if(name==='candidate'&&!result.unicode)assert(reused>=40,'Ordinary candidate must reuse');
else assert.equal(reused,0,'Selected/Unicode must keep fresh forks');
(result.bufferReceipts??=[]).push({block,before,after,reused});''')
(home/'screen.mjs').write_text(s)
s=(old/'freeze.py').read_text().replace('incremental-publication.patch','persistent-buffers.patch')
s=s.replace("for f in ['screen.mjs','measure.mjs','recorder.mjs']:", "for f in ['measure.mjs','recorder.mjs']:")
s=s.replace("'candidate/test/workspacePublication.test.ts',", "'candidate/test/historyRetirement.test.ts','candidate/test/textBufferBasis.test.ts','candidate/test/textBufferNormalizationProbe.test.ts',")
s=s.replace("'screen.mjs','measure.mjs','recorder.mjs','build.mjs'", "'original-screen.mjs','screen.mjs','measure.mjs','recorder.mjs','build.mjs'")
(home/'freeze.py').write_text(s)
print('Patches and symmetric build-only treatment counters ready; input measurement and recorder unchanged.')
