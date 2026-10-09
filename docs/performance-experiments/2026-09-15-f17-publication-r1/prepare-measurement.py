from pathlib import Path
import subprocess,shutil
home=Path(__file__).parent;selected=home/'selected';candidate=home/'candidate'
def diff(a,b):
 r=subprocess.run(['git','diff','--no-index','--',str(a),str(b)],text=True,capture_output=True);assert r.returncode==1
 return r.stdout.replace('a'+str(selected)+'/','a/').replace('b'+str(candidate)+'/','b/').replace('a'+str(candidate)+'/','a/')
patch=''
for f in ['src/crdt/admittedWorkspace.ts','test/workspaceAdmission.test.ts']:patch+=diff(selected/f,candidate/f)
for f in ['src/crdt/workspacePublication.ts','test/workspacePublication.test.ts','test/admittedEditorProjection.test.ts']:patch+=diff('/dev/null',candidate/f)
(home/'incremental-publication.patch').write_text(patch)
full=subprocess.check_output(['git','diff'],cwd=candidate,text=True)
for f in ['src/crdt/workspacePublication.ts','test/workspacePublication.test.ts','test/admittedEditorProjection.test.ts','test/membershipEligibility.test.ts']:full+=diff('/dev/null',candidate/f)
(home/'candidate.patch').write_text(full)
p=home/'build.mjs';s=p.read_text().replace("['ls-files','src'", "['ls-files','--cached','--others','--exclude-standard','src'");p.write_text(s)
old=Path('/Users/thomasingalls/.codex/worktrees/c030/done/docs/performance-experiments/2026-09-15-f17-repair-r1')
s=(old/'batch-native.mjs').read_text().replace('native-comparison','comparison').replace('native-unicode','unicode').replace("'native-'+mode","mode").replace('frozen-native.json','frozen.json');(home/'batch.mjs').write_text(s)
s=(old/'freeze-native.py').read_text().replace('membership-eligibility.patch','incremental-publication.patch').replace('batch-native.mjs','batch.mjs').replace('frozen-native.json','frozen.json').replace("'candidate/test/membershipEligibility.test.ts'", "'candidate/test/membershipEligibility.test.ts','candidate/test/workspacePublication.test.ts','candidate/test/workspaceAdmission.test.ts','candidate/test/admittedEditorProjection.test.ts'");(home/'freeze.py').write_text(s)
s=(old/'analyze.mjs').read_text().replace('native-${mode}','${mode}').replace('native-comparison','comparison').replace('native-unicode','unicode');(home/'analyze.mjs').write_text(s)
print('Complete and incremental patches ready; new runtime/test source will be included in freeze.')
