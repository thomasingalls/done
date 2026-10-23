# Phase25: trace proof work and receiver backlog

**Status:** diagnostic complete. Candidate23 remains held; no runtime repair, merge or deployment.

Phase24 isolated the components in eight uninstrumented mirrored journeys. Publication reuse raises distinct submissions to116–120 from61–78 and visible backlog to52–66 from5–12; request-local sharing alone also did not meet responsiveness. This phase follows each condition through native proof work and observed request/response positions. The four fixed new A,B,D,C journeys are mechanism evidence, not a performance comparison or proof of a population/mediator effect.

|Condition|Q1 read cache misses|Repeated read-authority signatures|Read authority wait, s|Discovery/history authority wait, s|Distinct submissions|Wait before request p95, s|
|---|---:|---:|---:|---:|---:|---:|
|A|79|6083|41.17|10.84|77|2.26|
|B|70|5390|36.87|18.42|71|5.25|
|D|68|5236|36.16|20.24|120|30.42|
|C|74|5698|38.16|13.90|120|29.56|

## Findings

Combined-D publication does one cold authority verification and119 cache hits. Receiving still has68 misses and5,236 authority signatures,77 per observed miss. Read authority occupies36.16s summed native wall wait; discovery/catalog authority adds20.25s. Fresh read census/served work totals3.48s, with another0.27s history/discovery census. Await spans and process CPU deltas can overlap; these are not exclusive CPU totals.

The native header audit independently captures every publisher's actual SQL header before and after each journey: all non-live inputs and pin stay exact after excluding only decision rows and the two live witnesses. Observed publisher/live-witness tuples and exact cache-context identities agree one-to-one. Stable publication context keys match those independently reconstructed stable headers. This supports reusing stable proof evidence for ordinary reads while verifying current live witnesses/ledger separately. It does not prove every intermediate native state or authorize weakening any guard. Absolute receiver miss counts did not rise with publication reuse; the writer sent more distinct envelopes into a receive path that still spent much of its time re-verifying authority.

Combined-D's120 publications independently match native accepted envelopes. Reply-to-first-request p95 is30.42s; reply-to-displayed-progress p95 is31.07s. For87 positions with a retrievable response body, body-to-display p95 is38.9ms; C has98 such positions and44.3ms. These latter statistics describe an observed subset, not the whole pipeline population. Coalesced inputs are not treated as one key per envelope. The existing UI progress is a notification proxy rather than a certified durable prefix. Negative observed clock/order differences remain visible.

The next bounded repair should reuse stable read authority with a precise purpose/input/ownership contract and all fresh witness/census/served/request/authorization/final native fences. Keep discovery/catalog reuse and flow control as subsequent bounded work. The existing pool checks verifier identity after key lookup; equal contexts with different verifier callbacks can replace each other, so the next design must handle that deliberately. No quota, cache-budget, retry cap or timeout increase follows from this trace. Request-local-only live latency remains unresolved.

## Method and source integrity

Original110 client files are byte-exact: no rebuild, client hook, extra network request or database polling. Same seeded H6/M2/Q2, four independent browser roots/10contexts per journey,1CPU/1GiB/zero swap/pids128 and16session64process policy.120 trusted focused keys at500ms, unchanged16ms local/2500ms complete-peer/30s foreground/120s continuation checks. Competition stops at intended90s; actual durations89999/90001/90000/90000ms are retained. Background replay is censored and establishes nothing about the600s gate.

Only disposable native copies have86 observational transformations over16 files: authority/census/served spans, cache hit/miss/context/witness hashes, bounded crypto counts and logical read cursor/tip stamps. Reversing every transform recovers original24 native bytes. An independent Babel AST transformation removes only observer imports/statements and await wrappers, then compares all underlying expressions/branches/calls exactly. A deliberate four-to-five-attempt guard change is detected. Four network-disabled native import checks pass. Common HTTP observation includes complete request-body SHA; Node-host Playwright observation parses only a closed, explicitly unverified frame metadata projection. It never supplies authority or advances progress.

## Independent evidence and limitations

All862 measured Q0/Q1 HTTP requests match unique native body identities, statuses and raw span/cache/crypto events in both directions. An independent review reconstructs reported counters and every position timeline stamp/missing value. Native OpenSSL validation checks ciphertext/envelope/wrapper/accepted signatures, per-publisher prefixes, every original seed row, distinct accounts/workspaces/credentials and unchanged background accounts. Available returned envelope and proof bytes match those native accepted rows. Non-live native headers remain exact. All original/pending writing, automatic continuation, actual same-profile offline cold reopen without reinjection, retained encrypted records, whole exports, reverse/UndoRedo and isolation checks pass.

Some browser response bodies cannot be retrieved:63/58/72/68 missing projection observations all coincide with requestfailed events. Retrieval and decoder failures were represented by one raw flag; the exact body-retrieval cause was not recorded. Do not erase this limitation or claim full body timing. The actual transport cancels/drains on cleanup; that code is context, not proof of each missing observation's cause. Independently matching submitted envelope hashes to cryptographically checked native records recovers acceptance/position coverage for all77/71/120/120 submissions without inventing any response-body time. Body-stage statistics retain55/53/87/98 position samples respectively.

Thirteen deliberate evidence/native/guard controls are detected: altered trusted input, cold archive, retained records, replay claim, peer time, progress offset, ciphertext, cache-hit flag, authority span, request time, missing native match, native header byte and retry guard. Ten standalone frame-projection regressions use real codecs with synthetic unverified frames; they check batching, cursor/identity/privacy allowlist, malformed/noncanonical/oversize input, missing bodies and unrelated bodyless streaming routes. These cases are preserved for reproduction and receive no qualification credit. The17 standard analyzer regressions from24 remain unchanged.

Preflight mistakes remain: an ambiguous commit-hook anchor stopped before measurement, then all variants were reset and hooked at the unique verification point; an unavailable parser import was corrected to the installed Babel core. The initial frame fixture lacked the bodyless-streaming case; its source/log and added regression remain. The strict90000ms analysis initially rejected89999ms; the raw outcome and failure stay, with only diagnostic timer-resolution qualification. No measured journey was substituted. Original held uninstrumented results are still the performance record.

## Artifacts and closure

protocol.md is prospective. Four journeys retain raw/partial results, resource/image/mount identities, commands and logs. analysis.json.gz and trace-analysis.json.gz retain all keys/positions and missingness. Native/header/trace reviews and controls are separate evidence; transforms, exact native snapshots, frame fixtures and reproduction scripts preserve source identity. SHA256SUMS/provenance and a36-known-private-value decompression/path audit protect correspondence. Private fixture, databases, profiles, keys, codes and browser error contexts are excluded; the privacy audit is not universal DLP.

All4 owned containers and16 recorded roots are stopped/absent, with no owned profiles or localhost53781 gateway. Actual production/protocol/client/old-test files and all883 obligations/339 unresolved entries are byte-exact24. General qualification remains paused. Append-only completed was written before decisions/performance. Sequential25 follows24, unsigned/uncommitted; no actual stage/sign/commit/push/preview8443/merge/deploy.
