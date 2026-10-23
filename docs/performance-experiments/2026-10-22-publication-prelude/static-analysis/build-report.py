from pathlib import Path
import json,hashlib,collections
root=Path('/private/tmp/done-publication-prelude-20261022/static-analysis')
repo=Path('/Users/thomasingalls/.codex/worktrees/7fda/done')
c=json.loads((root/'census.json').read_text())
# A site line is derived from the frozen runtime snapshot and the exact text, never from approximate rg output.
def site(file,needle,occurrence=1):
 s=(root/'source'/file).read_text(); pos=-1
 for _ in range(occurrence):pos=s.index(needle,pos+1)
 line=s.count('\n',0,pos)+1
 matches=[]; cursor=-1
 while True:
  try:cursor=s.index(needle,cursor+1);matches.append(s.count('\n',0,cursor)+1)
  except ValueError:break
 contexts=[{'callee':x['callee'],'owner':x['owner']} for x in c['calls'] if x['file']==file and x['line']==line]
 return dict(file=file,line=line,needle=needle,occurrence=occurrence,allMatchingLines=matches,astCallsAtLine=contexts,siteKind='call_expression' if contexts else 'definition_comment_or_algorithm_anchor',sha256=hashlib.sha256((root/'source'/file).read_bytes()).hexdigest())
def S(f,n,k=1):return site(f,n,k)
def F(id,title,confidence,priority,sites,trigger,repeat,analogue,prerequisites,falsifier,notes=''):
 return dict(id=id,title=title,confidence=confidence,priority=priority,sites=sites,runtimeTrigger=trigger,repeatsOrGrowth=repeat,existingAnalogue=analogue,authorityLifetimeInvalidationCorruptionPrerequisites=prerequisites,falsifierOrMeasurement=falsifier,limitations=notes)
findings=[
F('S01','Publication and v1 read-back rebuild native authority on each request','static_hypothesis','next_measurement',[
 S('account-service/delivery.ts','auth = selectPublisher(await verifyCurrentWorkspaceAuthority(s, issuer), s.publisher);'),
 S('account-service/delivery.ts','const auth = selectPublisher(await verifyCurrentWorkspaceAuthority(s, issuer), s.publisher);'),
 S('account-service/membershipHistory.ts','const anchor = await verifyWorkspaceAuthority(')],
 'Every submission or v1 self read-back, and each of at most four competing-commit retries.',
 'Retained authority chain verification grows with membership/rotation history; reconstructs keys, histories and cuts before prefix verification. Exact retries also redo this work.',
 ['inboundAuthorityReuse: exact native-context verified evidence with fresh issuer.check','accountAuthority: positive authentication evidence, never transaction authority','historyCheckpoint.memberships: reuse branded timeline'],
 ['Fresh custody and native commit/authorization fences remain independent.','Existing inbound cache includes live witnesses: blindly wiring it here will miss across writes. Any normalized immutable context needs an explicit proof of which inputs are independent of ledger evidence.','Preserve branded AdmissionHistory and all rotation/certification/boundary inputs; bounded bytes/entries, verifier identity, asynchronous revision and close/clear checks, mutation/corruption controls.','Do not cache member signatures, grants, responses, expiry checks or accepted-position decisions.'],
 'On runtime20, attribute submit/read-back time to header capture, full authority reconstruction, wire verification, prefix census, guard retries and transport. Compare unchanged-history and append-heavy requests across 1/2/10 devices. Reject as first repair if reconstruction is minor or every safe context changes; measure end-to-end peer latency and typing, not cache microseconds.',
 'Prior read authority attribution is evidence that the pattern can matter, not a measured publication saving.'),
F('S02','Discovery verifies the membership chain twice within one native snapshot','static_hypothesis','after_S01',[
 S('account-service/membershipLocator.ts','const auth = await verifyCurrentWorkspaceAuthority(before, issuer),'),
 S('account-service/membershipLocator.ts','{ history, proofs } = await verifyMembershipChain(membershipProofChain(before), base);'),
 S('account-service/membershipLocator.ts','await verifyCurrentWorkspaceAuthority(before, issuer),',2),
 S('account-service/membershipLocator.ts','{ history, proofs } = await verifyMembershipChain(membershipProofChain(before), base);',2),
 S('account-service/membershipAuthority.ts','const anchor = await resolveMembershipDeliveryAuthority(snapshot, issuer);'),
 S('account-service/membershipAuthority.ts','const prefix = await verifyMembershipChain(')],
 'Membership bootstrap/discovery; pending membership ceremony checking.',
 'The authority resolver already builds a verified chain; locator then runs full verifyMembershipChain to obtain a canonical proof bundle. Pending ceremony requires an earlier prefix, not simply the final membership.',
 ['phase17 branded timeline reuse','accountReceive DiscoveryHandoff transfers answer.history into installMembership without another chain verification'],
 ['Need exact correspondence of native row metadata/boundaries and canonical proof bundle, not only matching head.','Retain requesting publisher complete-history interlock, signed request/response and final unchanged/authorization guards.','Pending ceremony must select its exact admission prefix and independently verify transfer/cancellation, not substitute current or later membership.','Expose proof construction from the same verified owner or carry an explicit immutable result; a new generic shape-only cache is unsafe.'],
 'Instrument signature/hash/chain-extension counts within one discovery. Demonstrate duplicate full proof walks and compare a same-snapshot branded transfer against the existing independent verifier under corruption, cancellations, rotations and pending connections.',
 'Explicit structural repetition is present; no measured CPU saving in this census.'),
F('S03','History catalog prelude still reconstructs current authority','static_hypothesis','after_S01',[
 S('account-service/historyCheckpoint.ts','const auth = await verifyCurrentWorkspaceAuthority(before.original, issuer),'),
 S('account-service/historyCheckpoint.ts','for (const head of eligible) {'),
 S('src/crdt/accountReceive.ts','historyDue = Date.now() + 5000;')],
 'Required-history clients poll the authenticated catalog before content reception, at five-second eligibility intervals.',
 'Each catalog reconstructs current authority then examines eligible publisher heads and retained checkpoints; membership timeline reuse and late live-head capture are already present.',
 ['phase17 late catalog capture and complete timeline reuse','phase18 inbound immutable proof reuse','publisherTips incremental full-ledger proof'],
 ['Do not remove authenticated catalog anti-regression/fork checks or verifyCuts completeness.','Any reuse must bind exact retained checkpoint/admission/authority bytes; live heads, fresh request, expiry and final full snapshot comparison remain fresh.','Cross-publisher catalog proof is wider than a single read prefix; do not omit other eligible publishers.'],
 'Measure catalog count/time and percentage of receive-lane blocking on runtime20 with 1/2/10 publishers and differing checkpoint history. Counterfactual skip only in a diagnostic build must leave no adoption or progress authority; if prelude time is negligible, keep current checks.'),
F('S04','Repeated header capture and serialization survive successful crypto cache hits','static_hypothesis','after_S01',[
 S('account-service/delivery.ts','export function snapshotWorkspaceAuthority('),
 S('account-service/publisherTips.ts','const header = snapshot(db, workspace, publisher, Number.MAX_SAFE_INTEGER);'),
 S('account-service/publisherTips.ts','const s = snapshot(db, workspace, publisher, prefix?.count ?? 0)!;'),
 S('account-service/inboundAuthorityReuse.ts','return serialize([issuer.pin, { ...snapshot, rows: undefined }]);'),
 S('account-service/membershipStore.ts',".prepare('SELECT * FROM membership_admissions WHERE workspace_id=? ORDER BY epoch')")],
 'Every hot read/write: before authentication, cold-lane check, publisher capture and final guard may each reconstruct native headers.',
 'Full native membership/rotation/transfer rows are loaded, sometimes twice inside one coherent read, then serialized/hashed. Cache lookup still scales with header bytes; SQL history arrays are bounded by protocol limits, not constant size.',
 ['prepare one coverage baseline per owner call','selectVerified/ContentSelection: detach small answers','purpose-specific capture as in phase20'],
 ['First try factoring duplicated synchronous capture inside the same native transaction, not caching database rows across requests.','Any reuse across awaits must re-establish full native context/version/custody and guards; cannot use only account ID/head/version or omit unknown future fields.','Storage size/layout/corruption/unknown-record checks must remain; native views must not alias caller buffers.'],
 'Count exact SQLite statements and serialized bytes per request on cache hit vs miss; attribute allocations/CPU under realistic membership depth. Test native mutation between each capture and cross-connection data_version. If most time is crypto or waiting, defer this repair.'),
F('S05','Envelope allocation rescans all prior positions and sources','static_hypothesis','first_client_candidate',[
 S('src/crdt/accountEnvelopePreparation.ts','export async function selectEnvelopeSources('),
 S('src/crdt/accountEnvelopePreparation.ts','for (const position of state.positions) {'),
 S('src/crdt/accountEnvelopePreparation.ts','for (const [id, bytes] of state.sources) {'),
 S('src/crdt/incrementalAccountLedger.ts','used: Set<string>;'),
 S('src/crdt/incrementalAccountLedger.ts','sources: Map<string, SourceIndex>;')],
 'Every new publication envelope when durable local source capsules await allocation.',
 'Rebuild used references from all positions, then decode sources including consumed ones to select a bounded run. Selected capsules can then be decoded again to form original update frames.',
 ['incrementalAccountLedger bounded source metadata and used index','parse-once cold census','owner-private verified selections and scalar metadata'],
 ['Use only exact same verified ledger/route/epoch/generation and original-byte source identity; a counter/high-water mark alone is insufficient.','Keep order, same actor/kind/epoch grouping, batch/source/byte bounds, exact whole-capsule digest, retry/refusal/reservation and journal-before-exposure behavior.','Owned index must invalidate on adoption, source replacement/retirement, error/close and reference fallback; selected update bytes remain detached and erased.','A custom verified-selection hook must not lend raw history or claim committed allocation before native append.'],
 'Hold pending source size fixed and grow consumed positions/capsules; count source decodes, visited positions, bytes and prepare-envelope wall/CPU. If slope remains negligible beside server delay, defer. Validate complete ordered original bytes and refused/retried positions against full reference, including index-bound fallback.'),
F('S06','Receive request preparation copies complete inbound state to select one publisher','static_hypothesis','after_S05',[
 S('src/crdt/accountReceive.ts','const { inbound: all, pendingSelf } = await readState('),
 S('src/crdt/accountReceive.ts','const publishers = base.history?.readers.map((r) => r.id)'),
 S('src/crdt/verifiedRecords.ts','const result = structuredClone(project(value!));')],
 'Each receive group, even a one-page request for one publisher.',
 'readState projects v.inbound as a whole, then structured-clones all peer states/retained receipts before publisher selection. Growth follows retained inbound proof maps and device count, not only requested page.',
 ['ContentSelection/selectVerified already copies only selected results','accountDelivery withSelection for small pending/status queries'],
 ['Scheduling can pick a publisher from immutable owner roster, but prefix/pending-self/conflict/observed-through must come from one current verified selection.','Do not return borrowed peer state, alter four-page fairness or skip self reconciliation with an unresolved submission.','Selection lease, fresh custody check and request expiry ownership must remain.'],
 'Instrument cloned byte/object counts and prelude time by publisher count/history; compare selector returning only chosen peer plus pending-self. Mutation/erasure tests must prove no retained-view alias and all cursor/routing/fairness guards remain.',
 'Whole inbound copy is a concrete shape-level observation; runtime clone cost is unmeasured here.'),
F('S07','Verified history checks still perform repeated complete byte comparisons','static_hypothesis','after_client_profile',[
 S('src/crdt/verifiedRecords.ts','export const sameRecords ='),
 S('src/crdt/verifiedRecords.ts','while (prefix < Math.min(before.length, records.length)) {'),
 S('src/crdt/incrementalAccountLedger.ts','export function appendedRecords('),
 S('src/crdt/inboundLedger.ts','if (rows && sameRecords(rows, content)) return')],
 'Warm storage validation, own-append continuation, coverage preparation and full-record readers.',
 'Semantic/crypto append reuse is present, but independently checking exact old records remains O(total retained bytes), potentially more than once per task. Word comparison and CPU cooperation already improve the primitive.',
 ['verifiedRecords identity-bound ContentSelection','warm owner local append reservation evidence','createInboundCoverage.bind binds one exact candidate within a call'],
 ['This equality is the proof joining prior authenticated memory to current detached input; deleting it globally is unsafe.','Elide only inside a single authenticated carrier lease/known owner append or already established exact comparison, with opaque owner identity and current revision.','Do not enlarge the accepted warm corruption window, replace full byte equality with digest/count/head, or suppress audits/resume/cold full reads.'],
 'Count full-span compare bytes per single carrier task and link each to the proof it establishes. Establish duplicate comparisons of the same immutable candidate; mutate one interior/tail byte at every reuse boundary. Rerun combined client/server flow-control workload because faster comparison previously increased request pressure.'),
F('S08','Full cold/reference reducers retain repeated linear position lookups','static_hypothesis','cold_path_profile_first',[
 S('src/crdt/spoolRecord.ts','const p = positions.find((p) => p.position === e.position);'),
 S('src/crdt/deliveryRecord.ts','p = active.positions.find((p) => p.position === event.position)!;'),
 S('src/crdt/deliveryRecord.ts','const p = active.positions.find((p) => p.position === entry.position)!;')],
 'Cold/reopen/full reference ledger rebuild, independent audit or incremental fallback, not every optimized warm edit.',
 'One linear position search per event/response can be O(events × positions). Existing prefix-hash repair made another portion linear but does not make these searches indexed.',
 ['incrementalAccountLedger expected/envelopes Maps','source parse-once and lookup-table cold repairs'],
 ['Maintain transition order, duplicate/missing-position/refusal/retry behavior; constructing a lookup must not overwrite duplicate identities silently.','Reference oracle must remain independent enough to detect new map mistakes; bounds/fallback/error behavior stay.','No live-owner state transfer across startup or audit trust boundaries.'],
 'Generate signed histories of increasing position count with fixed response count per position; count comparisons and profile cold/audit CPU. Use differential corrupted/reordered/duplicate events. If crypto dominates or reachable bounds are tiny, do not optimize solely for theoretical complexity.'),
F('S09','Canonical and exact-byte comparisons still convert to hexadecimal strings','static_hypothesis','small_bounded_followup',[
 S('src/crdt/deliveryRecord.ts','if (hex(encodeDeliveryEntry(e, historical, issuance)) !== hex(b))'),
 S('src/crdt/spoolRecord.ts','if (hex(canonical) !== hex(bytes))'),
 S('src/crdt/accountDelivery.ts','if (s.responses.get(position)?.some((b) => hex(b) === hex(bytes)))'),
 S('src/crdt/accountDelivery.ts','hex(retained) !== hex(prepared.bytes)')],
 'Full carrier decoding and publication response/retry checks.',
 'Temporary strings double binary representation and are allocated for equality; work repeats with retained records or responses. Other source/custody paths already compare canonical bytes directly.',
 ['sameBytes exact bounded span comparison','phase cold-census direct byte comparison','Buffer.equals in service exact duplicate admission'],
 ['Preserve exact canonical framing, length/offset/tail/detached-buffer semantics and route checks.','Decoded bytes and canonical temporary copies retain existing erase/lifetime rules.','Use measured hot sites first; short strings/low-frequency paths may be negligible.'],
 'Count conversion bytes/allocations and profile decoder/submit prelude; compare exact equality across offset/alignment/length/tail faults, canonical negatives and native detached views. A lower micro cost without end-to-end gain does not justify broad churn.'),
F('S10','Per-page served proof work and key import repeats intentionally','static_hypothesis','measure_before_reuse',[
 S('account-service/delivery.ts','export async function verifyServed('),
 S('account-service/delivery.ts','const key = await crypto.subtle.importKey(',3),
 S('account-service/deliveryVerification.ts','async check<T>(')],
 'Every signed read page, including on a verified-prefix cache hit.',
 'The predecessor signature and actually served rows are freshly authenticated. Public key import and exact immutable signature verification may repeat across overlapping pages; small page bound limits count.',
 ['deliveryVerification exact context plus byte-input evidence','verified publisher prefix with independent worker audit'],
 ['Freshly served bytes must be checked against the exact context, including acceptance epoch, scope, generation/refusal and predecessor link.','A prefix cache does not itself authenticate current served payload bytes; no skip based only on count or position.','If reusing pure signature evidence, exact bytes/key inputs and verifier identity remain bound; semantic reducer/final guard always rerun.'],
 'Profile importKey vs signature verify vs decoding per served page with disjoint and overlapping requests; count cache hits and invalidation. If bounded crypto is minor, leave fresh verification. Mutate served and predecessor bytes independently of retained prefix.','The selected importKey location is derived by occurrence and must be reviewed in source-identity.json; this candidate is not an instruction to skip row verification.'),
F('S11','Authority cache hits still invalidate on live witness changes','already_optimized','context_design_only',[
 S('account-service/inboundAuthorityReuse.ts','// Only decision rows are outside WorkspaceAuthoritySnapshot verification.'),
 S('account-service/inboundAuthorityReuse.ts','if (previous?.context.equals(captured) && previous.verify === verify) {'),
 S('account-service/delivery.ts','function inboundAuthorityHeader(s: Snapshot) {')],
 'Any inbound read while either represented live delivery witness changes.',
 'The reusable authority cache excludes only decision rows. Header stage comparison excludes live witnesses too, but that does not broaden the cache key. Concurrent old witness contexts can consume bounded cache slots.',
 ['phase18 exact verified evidence','phase20 late capture with separate immutable comparison'],
 ['Two projections protect different promises: a permissive stage comparison cannot automatically become cache equivalence.','Need prove witness-dependent branches of verifyWorkspaceAuthority/membership resolver and retain late fresh census before effect.','Maintain future-field inclusion, native shape distinctions, mutation checks and fresh issuer.check.'],
 'Trace cache misses by exact changed field and prove which fields verifier actually consumes. Compare with/without appends. Fault the witnesses/rows and require the fresh census to refuse. If safe normalized contexts cannot be defined without weakening the contract, accept misses and optimize construction instead.'),
F('S12','Grant issuance and rare service lifecycle paths reverify full chains','static_hypothesis','defer_until_frequency_measured',[
 S('account-service/grants.ts','const auth = await verifyCurrentWorkspaceAuthority(captured.authority, issuer);'),
 S('account-service/rotation.ts','await verifyCurrentWorkspaceAuthority('),
 S('account-service/lostDeviceRecovery.ts','await verifyCurrentWorkspaceAuthority('),
 S('account-service/membershipCheckpoint.ts','await verifyCurrentWorkspaceAuthority(')],
 'Scoped grant acquisition/renewal, membership transitions, rotation/removal/recovery and setup ceremonies.',
 'Some full chains repeat across staged operations/retries, but these generally happen at lifecycle boundaries rather than per content page. Grant expiry/change frequency was not measured.',
 ['verified immutable evidence owners; caller-specific fresh authorization','prefix verifiers inside accountMembership/accountSuccessor'],
 ['Never cache fresh login/passkey/grant proof or infer unchanged revocation from retained chain.','Lifecycle transitions must establish new authority and revalidate their exact before/after native state.','Do not optimize rare destructive/recovery operations on the basis of static call density.'],
 'Measure calls per normal edit/reconnect/onboarding and per grant renewal; only pursue a visible prelude or measured heavy case. Retain wrong authority, expired/revoked grants, rotation and interruption coverage.'),
F('S13','Repeated client membership proofs across connection/recovery stages','static_hypothesis','defer_lifecycle',[
 S('src/account/membershipConnection.ts','verifyMembershipChain('),
 S('src/account/deviceRemovalVault.ts','verifyMembershipChain('),
 S('src/crdt/rotationObservation.ts','verifyMembershipChain('),
 S('src/crdt/membershipSource.ts','verifyMembershipChain(')],
 'User-driven connect, removal, recovery, retention and key rotation stage boundaries and cold restart.',
 'Same base/prefix may be rebuilt in multiple stages; call count alone does not establish redundant authority because stages can reopen storage, realm or session.',
 ['createAdmissionPrefixVerifier in membership/successor/localBaselineAuthority','DiscoveryHandoff within a single current owner'],
 ['Only transfer branded proofs through an explicit live owner with exact base, scope, prefix and context; cold reopens still verify from durable source.','Do not carry storage permits, keys or capabilities through a generic proof cache or past lock/recovery/rotation.','Public persisted JSON cannot recreate private brand authority.'],
 'Trace one complete user-visible flow with per-stage exact proof identities, crypto counts and custody reacquisitions. Establish no intervening authority boundary before sharing. If wait is dominated by transfer/typing/provider prompts, leave repeated verification.'),
F('S14','Receiver control-plane preludes can monopolize a shared send/receive pass','static_hypothesis','measure_after_S01',[
 S('src/crdt/accountSyncDriver.ts','/** Two lanes, one pass.'),
 S('src/crdt/accountSyncDriver.ts',"name === 'receive'\n            ? await options.receive()"),
 S('src/crdt/accountReceive.ts',"const authority = await refreshAuthority(operatorToken ?? '');"),
 S('src/crdt/accountReceive.ts','if (await receiveHistory()) {')],
 'A due receive turn runs discovery then optional history before content; the scheduler waits for that whole turn before selecting sending.',
 'A slow control-plane round-trip/proof delays due publishing despite local typing being responsive. Five-second prelude eligibility and fresh failure retry clock exist.',
 ['local journal-copy work separated from editor FIFO','prepared remote handoff: preserve commit dependencies while moving discretionary waits','late volatile capture reduces repeated work before retry'],
 ['Do not parallelize owner storage or permit send under stale/removing authority; authority transitions must stop sending synchronously.','A scheduler split needs explicit per-lane current context, bounded work, cancellation and immediate authority invalidation.','Preserve durable retry byte identity, request deadlines, fairness and no unbounded preparation queue.'],
 'Trace send-due→start wait with cause-labelled receive subspans, network wait vs CPU vs native queue. Demonstrate delay after server prelude repair before adding concurrency. Validate simultaneous authority change, removal, offline, lifecycle close and pending retries.'),
F('S15','Empty-publisher sweeps may repeatedly consume a four-page turn','static_hypothesis','measure_with_device_count',[
 S('src/crdt/receiveSelection.ts','next(publishers: readonly string[]'),
 S('src/crdt/receiveSelection.ts','const skipOwn ='),
 S('src/crdt/accountReceive.ts','for (let remaining = publisherCount(); ; remaining--) {')],
 'Workspace notification or catch-up with many eligible readers/publishers but writing concentrated on a subset.',
 'Round-robin sweep still probes quiet peer publishers. Own-stream skip is already bounded to five seconds and disabled by unresolved own submit. Peer hints do not identify the publisher.',
 ['existing own-stream scheduling suppression','four productive pages per publisher then rotate','SSE workspace hints never grant authority'],
 ['Scheduling-only negative hints need bounded repair polling and invalidation on authority/visibility/reconnect.','Do not skip unknown prefixes on an unsigned through hint or let a hot publisher starve quiet peers.','Preserve genuine multi-account fairness; per-account D-device fanout grows differently from tenant count.'],
 'Offer one hot publisher among 2/10/limit devices and count empty pages, bytes, p95 live peer lag and convergence after quiet peer resumes. A per-peer recent-empty hint is useful only if it reduces overhead without delayed new writing or starvation.'),
F('S16','Existing receive batching remains bounded and sequential','already_optimized','do_not_tune_blindly',[
 S('account-service/inboundBatch.ts','for (const request of requests) {'),
 S('account-service/inboundBatch.ts','if (now() - started >= INBOUND_BATCH_WORK_MS) break;'),
 S('src/crdt/accountReceive.ts','limit: 1,'),
 S('src/crdt/accountReceive.ts','for (let i = 0; i < count; i++) {')],
 'Ordinary backlog receive fetches up to four limit-one signed replies in one bounded route.',
 'Wire permits larger pages, but product owner deliberately consumes original signed limit-one receipts; every subrequest retains transaction authority. 250ms service budget may return fewer replies.',
 ['ordinary receive grouping/prefetch with exact request receipt ownership','concurrent exact duplicate batch exclusion'],
 ['Larger page/parallel reads require separate proof, memory, work-charge, deadlines, atomic receipt, prefix ordering and cancellation design.','Do not simply raise group size/time: it can occupy shared scheduler, increase queueing and hide peer fairness regressions.'],
 'Attribute group truncation, subrequest service CPU and transport RTT before proposing a format/owner change. Compare peer latency, typing, total CPU, 429s and exact full data guards, not replay time alone.'),
F('S17','Retry delay can dominate after otherwise cheap transient refusals','already_optimized','diagnostic_not_rate_change',[
 S('src/crdt/accountSyncDriver.ts','Math.min(1000 * 2 ** (lane.failures - 1), 30000)'),
 S('account-service/requestBudget.ts','sessionPerSecond: 16,'),
 S('account-service/scoped-http.ts','if (!reservation.reserveWork(requests.length))')],
 'Unknown/expired/network responses, including native snapshot races; admission top-up refusals under pressure.',
 'Retries wait 1/2/4/8/16/30 seconds. Same-byte duplicate groups already excluded from concurrent work; current quotas unchanged. A faster local path can generate more traffic.',
 ['phase12 refuse attribution, phase13 scoped duplicate exclusion','late ledger capture removes native false-race cause before retry tuning'],
 ['Distinguish authenticated business refusal, unknown transport, capacity and integrity; unsigned feedback may schedule only, never settle/delete durable writing.','Do not retry storms, spend one tenant budget on another, drop exact persisted retry or let typing bypass failure clock.','Numeric policy change needs multi-account fairness evidence, not internet bandwidth assumptions.'],
 'For every pause record original refusal predicate, started/charged work, byte-identity, actual eligibility/start times and post-load recovery. Re-evaluate rates only after avoidable proof work/races are removed; zero429 current heavy runs falsify rate-limit causation for those runs.'),
F('S18','Independent publisher audit is intentionally a separate full authority boundary','unsupported','retain',[
 S('account-service/publisherAudit.worker.ts','await verifyCurrentWorkspaceAuthority('),
 S('account-service/publisherTips.ts','// The worker re-establishes branded public authority in its own JavaScript realm.')],
 'Rolling background audit after publisher prefix reuse or explicit audit request.',
 'It reopens real native storage in another worker/realm and fully reconstructs authority/ledger to challenge foreground reuse.',
 ['reference audits of incrementalAccountLedger and separate full cold startup'],
 ['Reusing foreground proof/cached rows here would destroy the independent corruption detector and private brand identity.','Only scheduling/IO mechanics that preserve independent full input acquisition and verification could be considered.'],
 'No speedup candidate established. If audit scheduling delays input, measure cadence/resource contention while keeping the complete oracle; do not make audit share the proof it challenges.'),
F('S19','Client authority and prepared-membership reuse already avoid tempting duplicate work','already_optimized','retain',[
 S('src/crdt/accountAuthority.ts','inventory = await task.wait(() => options.read(task));'),
 S('src/crdt/accountAuthority.ts','if (retained !== undefined && equal(retained, inventory)) {'),
 S('src/crdt/accountReceive.ts','checkedHistory = prepared.history;'),
 S('src/crdt/accountReceive.ts','history: answer.history,')],
 'Ordinary assertCurrent calls and discovery-response installation in default membership-work mode.',
 'Complete fresh custody inventory still read and compared, but authentication is memoized; response verified history is explicitly transferred to installation. Full fallback remains for forced/reference or public input.',
 ['existing owner-local exact positive memo','private branded timeline transfer'],
 ['Do not count both branch call sites as simultaneous duplicate proof on the default path.','Fresh custody read and expected owner state are still authority; removing them changes guarantees.','Foreign/plain shape copies or stale payload/context cannot install membership.'],
 'Use existing authorityAuthentications/authorityReuses/membershipProofTransfers counters on actual default build. If authentication remains one per unchanged owner and proof transfer counts increase, the static duplicate suspicion is falsified.'),
F('S20','Editor text path already has a bounded ordinary-text fast path','already_optimized','separate_typing_phase',[
 S('src/crdt/admittedWorkspace.ts','const prepareText:'),
 S('src/crdt/admittedWorkspace.ts','const plan = planWorkspaceText('),
 S('src/crdt/admittedWorkspace.ts','if (!direct && (!localHandoff || event.source === \'remote\')) verifyProjection();')],
 'Ordinary supported text editing versus structural/selection/remote changes.',
 'Text planning, transaction-revision tracking and direct admitted updates already avoid full workspace/history forks for eligible ordinary input. Remote complete page still verifies canonical projection.',
 ['admitted-text bounded eligibility','selection-snapshot private tokens and shared UI card lookup','prepared remote pages publish once'],
 ['Do not infer server sync delay comes from editor forks without measuring; local echo and peer arrival are different outcomes.','Structural/remote/normalization/undo/pending-dependency paths retain their full fallbacks.','Snapshot/publication optimization prototypes historically regressed; parked experiments are not runtime defaults.'],
 'Profile local offered→handler→admitted→frame separately from publish/peer arrival, with long Goals, backspace, Unicode, undo and concurrent receipts. Preserve full projection equivalence and history; avoid a broad editor refactor in this server phase.'),
F('S21','History retirement can reduce growth but installation/retirement are separate gated features','unsupported','separate_product_protocol_phase',[
 S('src/crdt/localBaselineMode.ts','export const hasBaselineReader'),
 S('src/crdt/localBaselineMode.ts','export const hasRetentionWriter'),
 S('src/crdt/localBaselineReplay.ts','export async function prepareLocalBaseline('),
 S('src/crdt/localBaselineReuse.ts','/** Private reduced-owner continuation.')],
 'Accounts with authenticated retired-history baselines, and explicitly enabled maintenance writers.',
 'Reducing physical retained history can remove recurring scan/copy cost rather than optimize its constant factor, but writers are gated and baseline/recovery/rollback contracts are wider.',
 ['authenticated baseline plus suffix verification','bounded incremental reduced-owner continuation'],
 ['Do not infer build flags/deployed activation from source comments alone.','Existing reader must preserve pending/unallocated source coverage, counters, keys, epoch cuts and cold recovery.','Automatic retirement/writer activation requires separate product/protocol approval and durable rollback/qualification work.'],
 'Read exact build flags and measure reachable baseline-plus-suffix vs full history before claiming this removes current delay. Treat changing retention lifecycle as a separately bounded task, not a quick cache repair.'),
F('S22','Per-session budget cleanup is a bounded static loop, not demonstrated bottleneck','unsupported','low_priority',[
 S('account-service/requestBudget.ts','for (const [id, item] of this.#sessions) {'),
 S('account-service/batchReadAdmission.ts','for (const entry of active) if (entry.scope === scope && entry.body.equals(body)) return;'),
 S('src/crdt/accountSyncDriver.ts','if (JSON.stringify(next) === JSON.stringify(value)) return;')],
 'New admitted session key, concurrent batch admission, status notification.',
 'Budget map cleanup bounded to1024sessions; active duplicate comparisons bounded16; status snapshots small fixed shape. Loops/JSON here do not imply meaningful slowdowns.',
 ['bounded bookkeeping instead of general unbounded cache'],
 ['Quota churn must not reset spent tokens; exact body equality prevents duplicate admitted work.','Keep status equality/error isolation; optimize only if actual profile supports it.'],
 'Profile under session churn/high active count before changing. If below1% CPU and no correlated tail, leave it; an indexed body digest must still compare exact bytes and bind scope.')
]
# Every authority call is explicitly dispositioned; call-count groups are not cost claims.
authority=[]
for x in c['calls']:
 if 'authority_evidence' not in x['categories']:continue
 f,l=x['file'],x['line']; group='S13'
 if f.startswith('account-service/'):
  if f=='account-service/publisherAudit.worker.ts':group='S18'
  elif f=='account-service/delivery.ts':group='S11' if l>=1300 else 'S01'
  elif f=='account-service/membershipHistory.ts':group='S01'
  elif f in ['account-service/membershipLocator.ts','account-service/membershipAuthority.ts']:group='S02'
  elif f=='account-service/historyCheckpoint.ts':group='S03'
  else:group='S12'
 elif f=='src/crdt/accountReceive.ts':group='S19' if l>2100 or 1900<l<2000 else 'S13'
 authority.append({**x,'finding':group,'disposition':'reviewed as member of named contract/runtime group; no per-call measured cost claim'})
(root/'opportunities.json').write_text(json.dumps({'schema':1,'sourceIdentity':'source-identity.json','census':'census.json','findings':findings,'authorityCallDispositions':authority,'classificationLegend':{'static_hypothesis':'Structure verified; savings/cost at this site not established by this analysis.','already_optimized':'Mechanism already implemented; remaining adjustment needs distinct evidence.','unsupported':'No justified speedup or unsafe-to-remove boundary; preserve unless new evidence.'}},indent=2)+'\n')
# Save the exact supporting contract/evidence prose and the one consulted protocol implementation.
support=['README.md','docs/development.md','docs/account-crypto/transport.md','docs/account-crypto/account-ledger.md','docs/account-warm-ledger-loads.md','docs/account-bulk-custody-reads.md','docs/account-authority-authentication-reuse.md','docs/account-prepared-remote-handoff-design.md','docs/performance.md','account-protocol/admissionHistory.ts']
ident=[]
for f in support:
 p=root/'support'/f; b=p.read_bytes() if p.exists() else (repo/f).read_bytes();p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b);ident.append({'file':f,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)})
(root/'support-identity.json').write_text(json.dumps(ident,indent=2)+'\n')
# Raw syntactic inventories remain separate from the human-selected hypotheses.
for name,key in [('authority-calls.tsv','authority_evidence'),('reconstruction-calls.tsv','state_reconstruction_or_full_validation'),('serialization-calls.tsv','copy_serialization_or_bulk_bytes')]:
 rows=['file\tline\tcallee\towner\tlexical_loop_lines']
 for x in c['calls']:
  if key in x['categories']:rows.append('\t'.join([x['file'],str(x['line']),x['callee'],x['owner'],','.join(map(str,x['loopAncestors']))]))
 (root/name).write_text('\n'.join(rows)+'\n')
print(json.dumps({'findings':len(findings),'authorityDispositions':len(authority),'supportFiles':len(ident)},indent=2))
