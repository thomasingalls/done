from pathlib import Path
import json
root=Path('/Users/thomasingalls/.codex/worktrees/c030/done');here=Path(__file__).parent
analysis=json.loads((here/'analysis.json').read_text())
s=(here/'report-draft.md').read_text()
lead='''**The larger workspace is the clearest cost in this experiment.** Doubling seeded cards from300 to600 increases paired deep-block medians by **59.3% with history retained /45.2% with history cleared**. Clearing history has a modest benefit at600 cards and mixed results at300. This supports prioritizing whole-document work; it does not establish that history copying is free or predict the speedup from persistent buffers.

All **eight main sessions /1,280 measured keys** pass exact text, actual history-depth checks, one-key undo/redo and cold reopen, with context/browser/server and owned process groups drained. Two native smoke branches, six focused hook cases and both discriminating faults pass in their intended roles. The original setup failure and its distinct passing reproduction remain preserved.

'''
s=s.replace('2026-09-15, following',lead+'2026-09-15, following',1)
table='''## Observed application latency

| Seeded cards | Runtime history before deep warmup | Early median | Deep median | Deep p95 |
| --- | --- | ---: | ---: | ---: |
'''
for c in analysis['cells']:
 table+=f"| {c['seededCards']} | {'Retain1,002 groups' if c['condition']=='retain' else 'Clear to0 groups'} | {c['earlyP50']:.2f} | {c['deepP50']:.2f} | {c['deepP95']:.2f} |\n"
table+='''
Milliseconds; cells are medians of two session statistics. The conclusions use paired ratios, not ratios of rounded table values. Early samples cover10–90 undo groups in every condition. Deep samples cover1,010–1,090 retained groups or8–88 after clearing. Every diagnostic key contributes exactly one group.

All four individual600/300 median comparisons increase:by60.4%/58.2% with history retained and35.9%/54.5% with history cleared. At600 cards, retained/cleared median ratios are1.070 and1.036; at300 they are0.907 and1.012, with opposite signs. Both300-card cleared p95 observations are higher, so the smaller-workspace tail does not support a general benefit from clearing. Small session counts and frame-sensitive measurements limit causal interpretation.

The actual integrated struct counts are **2,797 at301 total cards /5,577 at601 total cards**. Those counts remain constant from early to deep in each session; encoded history length grows by1,001 bytes as the edited card grows. The retained sessions' early→deep median increases are2.5–5.0%. These are selected-R3 observations, not a reproduction of the reviewer's reference-path growth numbers. They do not qualify substantially longer, many-target or deletion-heavy histories.

The main campaign includes8,704 diagnostic keys:1,280 measured and7,424 untimed setup/warmup keys. The failed first attempt's80 measured keys, reproduction's160 and smokes'32 are retained separately and excluded from the factorial analysis.

'''
s=s.replace('## Interpretation limits',table+'## Interpretation limits')
s+='''

## Disposition and next bounded phase

Continue the adopted sequence. **Next implement the conservative membership-repair eligibility experiment** in an isolated candidate. Skip the text command's one pre-repair scan only when the exact accepted projection is known repaired. Conservatively invalidate that fact on remote delivery before publication, retain repair when the basis is dirty, and preserve system-source capture and refusal/retry/discard behavior. [Static boundary and discriminating controls](./performance-experiments/2026-09-15-f17-growth-r1/next-repair-boundary.md).

Incremental publication follows as a separate phase. Persistent text-history buffers remain the larger subsequent experiment, initially keeping full verification. This history-clear control does **not** measure their potential benefit:they would also eliminate a document fork still performed in both arms here. Incremental verification's proof, native deletion-set scans and detection-policy change remain separate. Keep the existing R3 improvements and both optional patches.

No product repair/optimization, full-suite campaign, new CPU/allocation profile, phone run or application-gate rerun occurs. The setup correction changes only an untimed immediate-read assumption after a discriminating reproduction. [Disposition](./performance-experiments/2026-09-15-f17-growth-r1/decision.md).

## Records and release position

F-17 stays partial. Local and Account defaults retain the reference. The latest actual application gate remains **12.2/75.1ms desktop/CPU4 card p95**, with Android focus **54.2ms**; it has a separate protocol and is not directly comparable with this diagnostic. Manifest and adapters remain **618 obligations;263 files /2,121 dispositions (11 not applicable);0test-file /96command /63campaign unresolved**. There is no immutable aggregate or added release receipt.

The signed base, measured source/bundle/helper identities,66 files in the previous R4 packet,52 personal/package/vector pins, root perspective, L-2 suffix and signed append-only prefixes verify unchanged. Main runtime/tests, personal app/server, phone, relay and deployment remain untouched. The new diagnostic, static prep and updated records are uncommitted.
'''
for a,b in [('from300 to600','from 300 to 600'),('at600','at 600'),('at300','at 300'),('Retain1,002','Retain 1,002'),('to0 groups','to 0 groups'),('cover10','cover 10'),('cover1,010','cover 1,010'),('or8–88','or 8–88'),('individual600','individual 600'),('increase:by60.4','increase: by 60.4'),('and35.9','and 35.9'),('are1.070','are 1.070'),('are0.907','are 0.907'),('Both300','Both 300'),('at301','at 301'),('at601','at 601'),('by1,001','by 1,001'),('are2.5','are 2.5'),('includes8,704','includes 8,704'),('keys:1,280','keys: 1,280'),('and7,424','and 7,424'),("attempt's80","attempt's 80"),("reproduction's160","reproduction's 160"),("smokes'32","smokes' 32"),('benefit:they','benefit: they'),('12.2/75.1ms','12.2/75.1 ms'),('54.2ms','54.2 ms'),('obligations;263','obligations; 263'),(';0test-file /96command /63campaign','; 0 test-file /96 command /63 campaign'),('identities,66','identities, 66'),('packet,52','packet, 52')]:s=s.replace(a,b)
(root/'docs/f17-growth-r1.md').write_text(s)
record='''

## 2026-09-15 — F-17 application workspace/history growth diagnostic

Following signed `ac0b84ce`, the operator adopts architectural cost reduction while retaining the R3 combination. Eight serial fresh encrypted Local sessions cross300/600 seeded cards with retained/cleared history after1,000 trusted editor keys, in two reversed blocks. A build-only hook proves identical canonical/history-document bytes, content, selections, revision/group/writer across clear. Actual deep undo ranges are1,010–1,090 versus8–88. All1,280 main timing samples and7,424 untimed setup/warmup keys survive; exact text, one-key undo/redo, cold reopen and owned process drain pass. Six real-Yjs hook cases include two discriminating faults; both small native smoke branches pass.

The first full attempt's immediate accelerated-setup text check fails; a separate reproduction observes delayed visibility settle within548.6ms, reaches1,002 groups and passes undo/redo/reopen. The original80 measured samples, repro160 and smoke32 remain separate from the main comparison. Before campaign-v2, only the untimed100-key checkpoint changes to a3,000ms bounded exact-text wait. Product deadlines, measured50ms gaps and all factorial conditions remain unchanged. No product input-loss repair is claimed.

Paired600/300 deep median ratios are1.593 with history retained and1.452 after clearing; all individual size comparisons increase. Retained/cleared median ratios are1.053 at600 cards and a mixed0.959 at300. Actual struct counts are2,797/5,577 and remain constant early→deep; the edited card adds1,001 encoded bytes. Whole-document work is the clearer priority, but this does not isolate individual functions or establish strict complexity. Clearing history does not measure persistent buffers' full benefit because both arms still fork the document. Accelerated setup, append typing, two selection targets, one host and few session replicates limit generalization.

Next:conservative repaired-basis eligibility for the text command's one pre-repair scan, preserving queued-remote, source, refusal/retry/discard and ownership behavior. Incremental publication, persistent buffers with full verification, then incremental verification's proof/policy follow separately. Static repair prep is retained; no optimization is implemented here. No full suite, CPU/allocation profile, phone campaign or application gate runs. Main runtime/tests/defaults and counts remain unchanged:618 obligations;263 files /2,121 dispositions(11N/A);0test-file /96command /63campaign unresolved. F-17 remains partial; last gate12.2/75.1ms card p95 and54.2ms Android focus remain. All66 previous-packet files,52 personal/vector pins, root perspective, L-2 and append-only prefixes verify. [Assessment](./f17-growth-r1.md); [evidence](./performance-experiments/2026-09-15-f17-growth-r1/README.md).
'''
for a,b in [('cross300','cross 300'),('after1,000','after 1,000'),('are1,010','are 1,010'),('versus8–88','versus 8–88'),('All1,280','All 1,280'),('and7,424','and 7,424'),('within548.6ms','within 548.6 ms'),('reaches1,002','reaches 1,002'),('original80','original 80'),('repro160','repro 160'),('smoke32','smoke 32'),('untimed100','untimed 100'),('a3,000ms','a 3,000 ms'),('measured50ms','measured 50 ms'),('Paired600','Paired 600'),('are1.593','are 1.593'),('and1.452','and 1.452'),('are1.053','are 1.053'),('at600','at 600'),('mixed0.959','mixed 0.959'),('at300','at 300'),('are2,797','are 2,797'),('adds1,001','adds 1,001'),('Next:conservative','Next: conservative'),('unchanged:618','unchanged: 618'),(';263','; 263'),('dispositions(11N/A)','dispositions (11 not applicable)'),(';0test-file /96command /63campaign','; 0 test-file /96 command /63 campaign'),('gate12.2/75.1ms','gate 12.2/75.1 ms'),('and54.2ms','and 54.2 ms'),('All66','All 66'),('files,52','files, 52')]:record=record.replace(a,b)
# Closed outcome precedes active-slice rewrite.
for name in ['completed.md','performance.md']:
 with (root/'docs'/name).open('a') as f:f.write(record)
with (root/'docs/decisions.md').open('a') as f:f.write('''

## 2026-09-15 — Growth diagnostic supports whole-document work as the next priority

The fixed R3 application comparison passes all eight sessions, actual history-intervention checks and1,280 measured keys. Doubling seeded cards increases paired deep medians by59.3% with history retained and45.2% after clearing. Clearing history is modestly helpful at600 cards and mixed at300. This supports the accepted membership/publication phase order without treating history as free or predicting persistent-buffer speedup:the latter would also eliminate a document fork still present in both arms. Keep the R3 improvements and optional patches. No default activation or budget change follows. The immediate-read setup failure and bounded-settlement amendment are retained separately. [Evidence, limits and next boundary](./f17-growth-r1.md).
'''.replace('and1,280','and 1,280').replace('by59.3','by 59.3').replace('and45.2','and 45.2').replace('at600','at 600').replace('at300','at 300').replace('speedup:the','speedup: the'))
p=root/'docs/progress.md';s=p.read_text();sep='\n---\n\n## Active slice: Stage 4';l1,l2=s.split(sep,1)
a=l1.index('**Just completed.**');b=l1.index('\n\n**Previous qualification attempt.**',a)
l1=l1[:a]+'''**Just completed.** The [application growth diagnostic](./f17-growth-r1.md) above signed `ac0b84ce` passes **eight main sessions /1,280 measured keys**, six focused hook cases with two fault controls, and both native smoke branches. Verified history clearing preserves document/content/canonical state; deep samples cover **1,010–1,090 versus8–88 undo groups**. Doubling seeded cards300→600 raises paired deep medians **59.3% retained /45.2% cleared**. The history-clear effect is modest at600 and mixed at300. Whole-document work is the clearer priority; the experiment does not estimate the full gain from persistent buffers, which would also remove a document fork. The initial accelerated-setup immediate-read failure, its passing settlement reproduction and all samples remain. No input-loss repair is claimed. Main runtime/tests/defaults and release counts remain unchanged; this diagnostic and its static next-phase prep are uncommitted.'''+l1[b:]
a=l1.index('**Current bounded phase.**');b=l1.index('\n\nThe eight-phase commit backlog',a)
l1=l1[:a]+'''**Next bounded phase.** Membership-repair eligibility, in an isolated candidate on the retained R3 combination. Skip the text command's one pre-repair scan only when its exact accepted projection is known repaired; conservatively invalidate that fact before remote publication. Preserve queued-repair interleaving, system-source updates, pending/refusal/retry/discard, undo/redo and ownership. The [static boundary](./performance-experiments/2026-09-15-f17-growth-r1/next-repair-boundary.md) names dirty-basis and unaccepted-cleanliness controls. Use focused semantic checks and the common short browser screen before any RC decision.

**Following phases.** Incremental publication separately; persistent buffers for a restricted text path with full verification; then incremental verification's proof, hidden scans and detection-policy decision. Preserve existing improvements and optional UI/publication patches. Native ownership/memory/integration qualification and the unchanged application gate remain ahead of RC entry.'''+l1[b:]
for a,b in [('versus8–88','versus 8–88'),('cards300→600','cards 300→600'),('at600','at 600'),('at300','at 300')]:l1=l1.replace(a,b)
p.write_text(l1+sep+l2)
p=root/'docs/release-validation-execution.md';s=p.read_text();old="Next refresh the selected combination's CPU/allocation profiles before targeting one remaining comparison-byte, document/history allocation or membership cost.";assert s.count(old)==1;s=s.replace(old,'The operator subsequently adopts the architectural sequence below. R4 is signed as `ac0b84ce`.')
insert='''

The [application growth diagnostic](./f17-growth-r1.md) keeps R3 fixed and crosses300/600 seeded cards with retained/cleared history after1,000 trusted keys. All eight main sessions /1,280 samples, actual intervention/state/depth checks, one-key undo/redo and cold reopen pass with process drain. Six focused hook cases include two fault controls; both native smoke branches pass. A failed immediate-read setup attempt and its passing bounded-settlement reproduction remain separate. Doubling seeded cards raises paired deep medians59.3% with history retained and45.2% after clearing; the clear-history effect is modest at600 and mixed at300. Prioritize whole-document work while retaining the existing improvements. Next:conservative membership-repair eligibility, then incremental publication, persistent text-history buffers with full verification, and incremental verification's proof/policy. No product optimization, full gate or release-adapter change occurs in this diagnostic. Its small, accelerated, one-host workload does not qualify general long sessions, memory or handsets.
'''
for a,b in [('crosses300','crosses 300'),('after1,000','after 1,000'),('medians59.3','medians 59.3'),('and45.2','and 45.2'),('at600','at 600'),('at300','at 300'),('Next:conservative','Next: conservative')]:insert=insert.replace(a,b)
s=s.replace('\n\nOnce the application gate',insert+'\nOnce the application gate',1);p.write_text(s)
