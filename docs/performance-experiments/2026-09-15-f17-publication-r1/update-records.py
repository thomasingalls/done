from pathlib import Path
import subprocess,json
root=Path('/Users/thomasingalls/.codex/worktrees/c030/done')
home=Path(__file__).parent
base=json.loads((home/'start.json').read_text())['base']
title='## 2026-09-15 — F-17 incremental publication experiment'
outcome='''

## 2026-09-15 — F-17 incremental publication experiment

The membership-repair phase is signed and signature-verified as `e0a87263`. The next isolated candidate keeps a private accepted-revision projection cache, observes actual changed Yjs types, refreshes changed and normalization-sensitive fields, and falls back for structural/unknown changes or stale plans. Remote input invalidates before apply/publication, every public read remains detached, and full verification remains. Other owner modes retain the full reader. The new cache is not integrated into main runtime or default activation.

Final controls pass 218 unique tests in 13 files, including nine new cases /60 generated histories, prior normalization/editor controls, TypeScript and scoped formatting. Missing normalization refresh, ignored structural fallback and aliased output faults each trigger their designated assertion. A real candidate defect returned stale undo counts after the existing out-of-band history-clear diagnostic; reading the two current scalar stack lengths repairs it. A separate split-pair fixture had already normalized its input before the intended fork; its setup assertion is corrected using distinct writer items. Original source/tests/failures and final controls remain. Timing runs only after fault restoration and builds.

All six serial browser sessions /480 measured keys /624 warmups pass text, bounded undo/redo, existing corpus/edited-card reopen checks and owned process drain. Ordinary early median effects reverse sign; later medians regress 3.7% and 21.0% across opposite-order pairs, with p95 regressions 9.3% and 27.1%. Median paired ratios give 1.1% early /12.3% later median regression and 0.3%/18.2% p95 regression. The separate Unicode guard also regresses, by 8.2%/1.3% at the median. No sample is discarded or rerun. The small screen does not establish stable effect size, causality, memory/GC, deep-history or population claims.

Park this implementation as an optional patch; keep R3 preparation + comparison pool + editor shortcut + primitive value-string reuse + membership-repair eligibility as the selected combination. Preserve the new controls and useful source-work reduction. Public whole-snapshot cloning remains; no profile attributes the regression. Next persistent text-history buffers with full verification, then incremental verification's separate proof/policy. Native ownership/memory/Account composition and the unchanged application gate still precede RC entry.

Main runtime/tests/defaults and release counts remain unchanged: 618 obligations; 263 files /2,121 dispositions (11 not applicable); 0 test-file /96 command /63 campaign unresolved. F-17 stays partial; last actual gate remains 12.2/75.1 ms card p95 and 54.2 ms Android focus. All 416 frozen source/bundle/helper identities, the previous packet, 52 personal/package/vector pins, original control inputs, root perspective, signed append-only prefixes and L-2 verify unchanged. Personal app/server, phone, relay and deployment remain untouched. New phase is uncommitted. [Assessment](./f17-publication-r1.md); [source and evidence](./performance-experiments/2026-09-15-f17-publication-r1/README.md).
'''
# Close the record before replacing this seat's active slice.
for name in ['completed.md','performance.md']:
 p=root/'docs'/name
 assert title not in p.read_text(),name
 p.write_text(p.read_text()+outcome)
p=root/'docs/decisions.md'
decision='''

## 2026-09-15 — Park this incremental publication implementation

Preserve the new private projection cache and its normalization/detachment/history controls as an optional component. It passes 218 focused cases and the fixed six-session browser screen's correctness checks, but ordinary early timing is mixed and later median/p95 is slower in both pairs (median paired regressions 12.3%/18.2%). Unicode timing is also slower. The bounded source-work reduction is useful evidence, but does not justify adding this implementation to the selected combination. This declines selection on observed timing; it does not impose a minimum gain threshold or reject incremental publication generally. No profile identifies the regression's cause. [Evidence and limits](./f17-publication-r1.md).

Keep R3 preparation reuse, comparison pooling, editor shortcut, primitive value-string reuse and membership-repair eligibility. Keep optional UI and previous publication patches separate. Next persistent text-history buffers for a restricted text path, retaining full verification and defining ownership, reset, acceptance/refusal/retry/discard, remote/structural/undo/metadata and close behavior before measurement. Incremental verification remains a separate proof/policy decision; native ownership/memory/Account qualification and the unchanged application gate still precede RC entry. No default, release count or F-17 disposition changes.
'''
assert '## 2026-09-15 — Park this incremental publication implementation' not in p.read_text()
p.write_text(p.read_text()+decision)
p=root/'docs/progress.md';text=p.read_text()
start=text.index('**Just completed.**');end=text.index('\n\nThe preceding [growth diagnostic]',start)
text=text[:start]+'''**Just completed.** Membership-repair eligibility is signed and signature-verified as `e0a87263`. The [incremental publication experiment](./f17-publication-r1.md) passes **218 tests in 13 files**, including nine new cases /60 generated histories, TypeScript and three discriminating faults. All **six browser sessions /480 measured keys** pass correctness and process drain. The candidate fixes a stale history-counter defect caught through the existing diagnostic; its initial Unicode fixture correction and all observations remain. Ordinary early timing is mixed; both later pairs regress, with median paired regressions **12.3% median /18.2% p95**. Unicode timing is also slower. Park this optional publication patch and retain R3 + membership-repair eligibility. Main runtime/tests/defaults, counts and the last actual gate remain unchanged; this new phase is uncommitted.

The retained [repair-eligibility increment](./f17-repair-r1.md) passes 176 tests /nine files and two faults in four owner modes. Its six sessions favor the candidate with ordinary paired median gains 5.5% early /10.1% later, though later pair effects vary. These remain descriptive incremental results, not additive percentages or release qualification.''' +text[end:]
start=text.index('**Next bounded phase.**');end=text.index('\n\nThe eight-phase commit backlog',start)
text=text[:start]+'''**Next bounded phase.** Persistent text-history buffers for a restricted text path, in an isolated candidate on retained R3 + membership-repair eligibility. Keep full document verification. Define accepted/candidate ownership, reset and fallback first: acceptance, refusal, retry, discard, remote delivery, undo/redo, structural commands, metadata and close. Retain detached public reads and existing source capture. Use focused semantic/fault controls and a bounded application comparison; the optional publication/UI patches remain separate.

**Following phases.** Incremental verification's proof, hidden scans and detection-policy decision. Native ownership/memory/Account composition qualification and the unchanged application gate remain ahead of RC entry. No new immutable aggregate or release receipt is claimed.''' +text[end:]
p.write_text(text)
p=root/'docs/f17-repair-r1.md';text=p.read_text()
assert text.endswith('This new phase is uncommitted.\n')
p.write_text(text.removesuffix('This new phase is uncommitted.\n')+'This phase is signed and signature-verified as `e0a8726347b75d8c57a89afcbdf9ca34ed829b39`. The archived packet retains its original pre-commit identity.\n')
p=root/'docs/release-validation-execution.md';text=p.read_text()
old='This new phase is uncommitted; main runtime/tests/defaults, adapter counts and the last actual application gate are unchanged. Next incremental publication, then persistent buffers with full verification, then incremental verification\'s proof/policy. Native ownership/memory/Account composition qualification and the unchanged gate still precede RC entry.'
assert old in text
new='This repair phase is signed and signature-verified as `e0a87263`; main runtime/tests/defaults, adapter counts and the last actual application gate are unchanged.'
text=text.replace(old,new)
needle='\n\nOnce the application gate has an acceptable disposition'
assert needle in text
text=text.replace(needle,'''\n\nThe [incremental publication experiment](./f17-publication-r1.md) then passes 218 tests /13 files, including nine new cases /60 generated histories, TypeScript and three discriminating faults. It preserves detached reads, actual-change classification, remote/structural fallback and full verification, with explicit fork-normalization refresh. A diagnostic history-clear check catches stale cached undo counts; the scalar-count repair and original failure remain. All six browser sessions /480 measured keys pass semantic and process-drain checks, but early ordinary timing is mixed and later median/p95 regresses in both pairs (median paired regressions 12.3%/18.2%). The Unicode guard is also slower. Park the optional publication patch; keep R3 + repair eligibility selected. This new phase is uncommitted. Defaults, counts, release receipts and the last actual gate remain unchanged. Next persistent text-history buffers with full verification, then incremental verification's separate proof/policy; native ownership/memory/Account qualification and the unchanged gate remain ahead of RC entry.''' +needle)
p.write_text(text)
for name in ['completed.md','performance.md','decisions.md']:
 old=subprocess.check_output(['git','show',base+':docs/'+name],cwd=root)
 assert (root/'docs'/name).read_bytes().startswith(old)
print('Completed outcome appended before L-1 replacement; performance/decision/checkpoint reconciled.')
