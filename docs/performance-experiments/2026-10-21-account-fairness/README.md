# Phase14: final-candidate multi-account fairness

**The final candidate does not clear this workload's fairness gates.** Both heavier-load runs fail quiet-device delivery, while both baselines and lighter-load controls pass. Source, old tests and16/64 policy remain unchanged. This evidence-only unsigned patch14 includes no merge, deployment or generalized qualification.

## Design and complete results

The prospective [protocol](protocol.md) and demand amendment predate fixture creation and fairness data. Three independently created accounts have distinct principals/workspaces and6/2/2 genuinely enrolled workspace device credentials. Actual editor input adds1024/256/32 independently observed accepted source positions (total stored accepted positions1034/262/38 including setup). Passkey access to one account is distinct from a workspace device credential; no copied workspace credential substitutes for another device.

B edits only the quiet Q pair. S adds H1/M1 catch-up. U adds H1–H5/M1. H0/M0 retain current source state offline; ten separate native profiles exist in every arm. Four browser roots keep quiet sender/receiver apart from other accounts' parents. Each fresh-service journey restores the same fixture, warms Q for3s, offers120 genuine keyboard keys every500ms and keeps original10s request/30s new-writing/600s replay checks. Fixed B,S,U,U,S,B runs have no retries, pressure injection, tracing hook, profiler or favorable substitution.

| Run | Outcome | Local p95 ms | Peer p95 ms | Large replay seconds |
|---|---|---:|---|---|
|1-B|passed|2.6|738|—|
|2-S|passed|4.1|1219.2|354.39|
|3-U|failed|2.5|incomplete (110/120)|censored at writing failure|
|4-U|failed|2.2|incomplete (79/120)|censored at writing failure|
|5-S|passed|3.5|1151.9|330.252|
|6-B|passed|2.9|743.8|—|


Baseline peer p95 drift is0.786%, within15%. Lighter-load local/peer gates pass, though peer delay rises from about0.74s to1.15–1.22s and large replay takes330–354s. The medium history takes15.390/15.901s in the lighter arms. Both heavy cases fail after60s typing plus the original30s writing guard: peer snapshots contain110 and79 of120 new keys. Local observers see all120 in every arm and all720 inputs are trusted/focused/visible. Heavy observed-subset p95 values are retained only as incomplete observations. Their H replays are cancelled when the quiet guard fails and are censored at that outcome, not600s replay failures. No successful-only reruns or moved criteria.

[Summary](summary.json), [raw analysis](analysis.json.gz), [independent review](evidence-review.json), [partial-observation review](partial-observation-review.json), [all-run fidelity](all-run-fidelity-audit.json) and [quiet refusal sequence](quiet-refusal-sequence.json) preserve every denominator and failure. Each heavy Q1 records six membership-discovery409s and six grant-begin403 insufficient-scope replies, beginning around5s; the409 reason was not captured and remains unknown. Quiet accounts record no429 in any arm. These observations select a membership/grant continuation trace; they do not prove which component causes the delay or that higher rate limits would fix it.

## Integrity and source evidence

[Measurement identity](measurement-identity.json.gz) binds all804 production/build/helper inputs, existing enrollment helper, client, protocol and private fixture hashes. The service uses original c1177575 domain handlers under Linux Node24.18.0,1CPU,1GiB,zero swap,pids128 with current modules mounted read-only. The cached image supplies dependencies; its older labels do not identify the current overlays and it is not a deployable candidate image. Per-run inspect/cgroup/mount/CPU/RSS/eventloop records are under runs/. Host gateway and browser/driver costs lie outside that cgroup.

Actual clients retain original authority, signature, scope, freshness, custody, receipt and durable-apply checks. The laboratory adds only transport and numeric observation wrappers outside production. Independent cold [native audits](native-audit.json.gz) verify Node/OpenSSL envelope/wrapper/accepted-head signatures and exact prefixes in all six stores, including failures. Every seed wire/response is retained exactly; H/M accepted writing is unchanged and new accepted records belong only to Q. A [participant audit](participant-identity-audit.json) checks distinct principals/accounts/workspaces across seed and outcomes. Three disposable corruption controls fail the intended digest/signature assertions; the genuine seed is unchanged.

This does not establish data loss or its absence for pending local writing. Failed arms close contexts at their original writing guard without preserving final storageState. Local DOM and native accepted records do not by themselves establish pending durability or eventual recovery. Successful arms separately pass complete exports, every key, reverse writing, Undo/Redo, locked offline reopening and absence of other accounts' synthetic markers. HTTP200/decoded positions are not treated as durable receipt by themselves.

Preflight34 Linux service/native and16 host scoped-client cases pass, along with type/build/budget/isolation/new-lab typing. The cached production dependency image lacks Vite needed by one browser-fixture loader; that initial failure and all NEWlab type failures/source versions remain in [operational notes](operational-notes.md). No old case is edited. Original881 obligation rows,337 unresolved,97 construction statuses/contracts, crypto sites, source/old-test bytes and prior artifacts remain. The experiment grants no aggregate qualification closure; general qualification is paused.

## Reproduction and limitations

Start from signed c1177575801a8eeab60b63883a3c701625ada215, Node24.18.0 and pinned dependencies. Reproduction scripts/frozen lab sources are archived as.txt under reproduction/, including the exact seed versions before type/cidfile-only harness fixes. Build/preflight first; generate fresh disposable accounts via the existing packaged virtual-passkey convention, seed/check exact accepted deltas and account exports, cold-audit and test observer corruptions. Freeze identities before the fixed six runs, await all real process exits, then analyze/audit/check planning. No validators/profilers overlap measured journeys. Original random credentials, database, profile/storage and fixture archives are deliberately excluded; fresh data/machine/browser can change precise timing. Scripts retain original absolute scratch paths rather than claiming one-command portability.

The snapshot includes build tools and packaged test helpers, not804 exclusively executing runtime modules. Results are descriptive whole-journey engineering comparisons; per-key observations are dependent. They cover three synthetic accounts, finite histories and one resource envelope, not a broad tenant population, supported active-user count, persistent overload, diverse membership/rotation/recovery/churn, cache eviction, physical Firefox/Android/WAN or actual production CPU supply. End-to-end delay includes client/IDB/browser/driver costs; no server-only causal function is isolated.

Preserve all six results, failed guards, partial prefixes, uncaptured reasons and setup failures. Additional post-outcome read-only audits strengthen missing/censored/resource/principal checks without changing frozen primary scripts, source, deadlines or gates. Next bounded work should trace membership/grant continuation under the heavy schedule and the slow large-history replay before selecting a repair. No rate increase or runtime repair is hidden in this packet.

runs/ and seed-attempts/ hold whitelisted compressed results/reports/logs; checks/ retains passing and failed verification; reproduction/ contains exact sources/scripts. Artifact provenance, privacy audit and SHA256SUMS bind the packet. Known private values are scanned after decompression, not a universal DLP guarantee. No fixture/DB/profile/browser storage/private key/unlock code/token/environment file is included. Patch14 and independent application receipts live outside the packet to avoid circular hashes. Earlier artifacts and other-seat progress remain untouched. No real staging, signing, commit, push, preview8443 change, merge or deployment.

The first packaging rehearsal and packet are retained as packaging history, including the complete superseded patch. Its temporary index lacked stat refresh despite exact base blobs. The same patch passes after metadata refresh; v2 independently checks the unchanged base tree before applying. See packaging-history/stat-refresh-proof.json.gz. Use the final patches-v2 manifest.
