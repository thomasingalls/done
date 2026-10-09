from pathlib import Path
import subprocess,json,hashlib
home=Path(__file__).parent
p=home/'build.mjs';s=p.read_text().replace("const from='    options,\\n  );\\ntype State';", "const from='    options,\\n  );\\ntype State';")
s=s.replace('activated++; return code.replace(from,', 'activated++; const transformed = code.replace(from,')
s=s.replace('\\n  );\\ntype State");\n}}}', '\\n  );\\ntype State");\nwriteFileSync(join(home,name+\'-activated-admittedWorkspace.ts\'),transformed);return transformed;\n}}}')
s=s.replace("'src','vite','public','index.html','local.html','vite.config.ts','pnpm-lock.yaml'", "'src','private','account-protocol','wasm','vite','public','index.html','local.html','vite.config.ts','package.json','pnpm-lock.yaml'")
p.write_text(s)
# Candidate patch includes only the incremental runtime change plus its focused tests.
selected=home/'selected';candidate=home/'candidate'
patch=''
for f in ['src/crdt/workspaceCommands.ts','src/crdt/admittedWorkspace.ts']:
 r=subprocess.run(['git','diff','--no-index','--',str(selected/f),str(candidate/f)],text=True,capture_output=True)
 assert r.returncode==1
 patch+=r.stdout.replace('a'+str(selected)+'/','a/').replace('b'+str(candidate)+'/','b/')
f='test/membershipEligibility.test.ts'
r=subprocess.run(['git','diff','--no-index','--','/dev/null',str(candidate/f)],text=True,capture_output=True);assert r.returncode==1
patch+=r.stdout.replace('b'+str(candidate)+'/','b/').replace('a'+str(candidate)+'/','a/')
(home/'membership-eligibility.patch').write_text(patch)
# Full reproducible combination, including the new untracked test.
full=subprocess.check_output(['git','diff'],cwd=candidate,text=True)
full+=r.stdout.replace('b'+str(candidate)+'/','b/').replace('a'+str(candidate)+'/','a/')
(home/'candidate.patch').write_text(full)
print('Prepared delta and full candidate patches.')
