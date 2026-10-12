"""Per-session results; no pooling of dependent keystrokes or unequal receive counts."""
import pathlib,json,subprocess,math,sys
root=pathlib.Path('/tmp/done-membership-work-20261012');out=pathlib.Path('docs/performance-experiments/2026-10-12-membership-work')
rows=[]
for rep in [1,2]:
 for mode in ['active','backlog']:
  for arm in ['reference','candidate']:
   name=f'{arm}-{mode}-{rep}';p=root/name
   if not (p/'result.json').exists():continue
   subprocess.run(['node','docs/performance-experiments/2026-10-12-final-apply/probe/analyze.mjs',str(p),str(root/arm)],stdout=subprocess.DEVNULL,check=True)
   a=json.loads((p/'analysis.json').read_text());r=json.loads((p/'result.json').read_text())
   a['warnings'][-1]='Shared instrumentation in matched comparison sessions; absolute instrumentation cost remains unmeasured.'
   (p/'analysis.json').write_text(json.dumps(a,indent=2)+'\n')
   calls=lambda prefix:sum(v['calls'] for k,v in r['stalls']['stats'].items() if k.startswith(prefix+' <- '))
   discoveries=sum(1 for q in r['requests'] if q['device']=='B' and q['phase']=='typing' and q['path']=='/account/membership/v2/discover' and q.get('status')==200)
   frames=sorted(s['frame'] for s in r['samples'])
   quant=lambda q:round(frames[min(len(frames)-1,math.ceil(len(frames)*q)-1)],1)
   costs={k:round(v['totalMs']-r['before']['costs'].get(k,{}).get('totalMs',0),1) for k,v in r['after']['costs'].items()}
   rows.append({'session':name,'arm':arm,'mode':mode,'rep':rep,'phase':r['phase'],'guardrails':a['guardrails'],
    'frames':{'n':len(frames),'median':quant(.5),'p95':quant(.95),'max':quant(1),'over100':sum(v>100 for v in frames)},
    'finalStages':a['finalStages'],'longTasks':{'n':len(a['longTasks']),'max':max((t['ms'] for t in a['longTasks']),default=0)},
    'proofs':{'discoveries':discoveries,'signatures':calls('admission.ts.verifySignature'),'receipts':calls('admission.ts.verifyReceipt'),'certifications':calls('contentDelivery.ts.verifyCertificationSuccessor'),'fullJoinedReads':calls('joinedAccount.ts.readJoinedAccount')},
    'costs':costs,'counts':a['counters'],'syncBefore':r['syncBefore'],'syncAfter':r['syncAfter'],
    'typingHttp':sorted({q['status'] for q in r['requests'] if q['phase']=='typing' and q.get('status') is not None})})
comparisons=[]
for rep in [1,2]:
 for mode in ['active','backlog']:
  arms={r['arm']:r for r in rows if r['rep']==rep and r['mode']==mode}
  if len(arms)<2:continue
  ref,c=arms['reference'],arms['candidate'];old=ref['finalStages']['read']['median'];new=c['finalStages']['read']['median']
  comparisons.append({'mode':mode,'rep':rep,'readMedianReductionPercent':round(100*(old-new)/old,1),'frameP95ChangePercent':round(100*(c['frames']['p95']/ref['frames']['p95']-1),1),'longTaskMaxReductionPercent':round(100*(1-c['longTasks']['max']/ref['longTasks']['max']),1),'signaturesPerDiscoveryReductionPercent':round(100*(1-(c['proofs']['signatures']/max(1,c['proofs']['discoveries']))/(ref['proofs']['signatures']/max(1,ref['proofs']['discoveries']))),1)})
operations={arm:json.loads((root/'operation'/arm/'result.json').read_text()) for arm in ['reference','candidate'] if (root/'operation'/arm/'result.json').exists()}
summary={'base':'b656553a','sessions':rows,'comparisons':comparisons,'completeOperations':operations}
if len(operations)==2:
 summary['completeOperationSignatureReductionPercent']=round(100*(1-operations['candidate']['signatures']/operations['reference']['signatures']),1)
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
for r in rows:print(r['session'],'read',r['finalStages']['read']['median'],'apply',r['finalStages']['apply']['median'],'frame p95',r['frames']['p95'],'max task',r['longTasks']['max'],'proofs',r['proofs'],'phase',r['phase'])
for r in comparisons:print(r)
