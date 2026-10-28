# Phase135 — preparation boundary review

This is a focused correctness/security-boundary review of the pending preparation work and its
build activation, not aggregate qualification or a repository security certification. Source bytes
are pinned in `review-source-identity.json`; the model/storage/composed regressions and deliberate
fault controls are recorded in phases127–130. Phase135's full unit run includes them. The
`account-local-preparation` construction remains **open**; no evidence adapter was awarded credit.

| Boundary | Source path and retained checks | Evidence / conclusion |
| --- | --- | --- |
| A receipt cannot assert arbitrary success | `retentionPreparation.ts`: closed result grammar, HMAC authentication before import, private WeakMap capability, slot/context/exact input capture; journal invalidation and late-callback guards | Receipt, ownership, binding and replay tests cover forged/pass-bit, input mutation, wrong context and late work. No direct proof-to-cut authority was found. |
| Cross-owner reuse requires fresh authority | `retentionPreparationBinding.ts`, `retentionPreparationIdentity.ts`: scope, implementation identity, installation/key context, authenticated counter and original native prefix; original source capture precedes optional-cache error handling | Source/authority/key/prefix changes invalidate reuse. Corrupt original counters are not downgraded to cache misses. The new build helper validates explicit dependencies. |
| Persistence does not reuse an AES allocation | `retentionPreparationStorage.ts`, `contentStore.ts`: sealed one-use task handoff; fresh serialized capture and authentication before allocating; existing global allocator burns chunks plus head; purpose/context/order/digest bound inside encrypted records | Storage and composed tests retain allocation on interrupted seal/exchange/readback, reject raced heads and expired owners. Existing nonce/AAD construction is retained. |
| Partial progress cannot retire writing | `contentStore.ts`, `localRetentionPlan.ts`, `localBaselineReplay.ts`: original logical rows remain while saving receipts; current authority, independent final candidate/reference checks, native exchange and readback remain | Cold continuation, appended writing, undo and interruption regressions pass. Phase134's separate native crypto/prefix audit retains original proof bytes and unrelated accounts. A cache is preparation evidence only. |
| Optional cache cannot become opening authority | `retentionPreparationStorage.ts`, `startupClassification.ts`: malformed encrypted cache falls back to originals; unknown layouts refuse overwrite; startup uses saved slot/known database selection rather than enumerating auxiliary names into accounts | Storage tests exercise bad head/chunk/ordering/layout. Supplemental actual-root tests separately verify opening/export with valid and corrupted unfinished caches; see `root-review.json`. |
| Removal and disposal stay scoped | `retentionPreparationDatabase.ts`, `deviceDataRemoval.ts`, `contentStore.ts`: credential-free exact derived auxiliary name, other accounts untouched, cleanup after successful reduction, queued handoffs disposed with owner | Removal/disposal tests pass. Cache cleanup introduces no account-wide or service deletion authority. |
| Activation cannot be inferred | `Dockerfile`, `accountRetentionFlags.ts`, `vite.config.ts`: explicit independent resume/service switches, both default0; resume requires reader/installer/writer1 | New build regression first fails missing Docker wiring, then old/new flag tests pass. Local automation does not enable service automation. Failed performance acceptance leaves resume default off. |

The new work has hard receipt/codec/chunk bounds (including32MiB/256 encrypted chunks); exceeding
them can stop preparation while preserving originals. These bounds are not proof of useful
progress for arbitrarily large histories. The2s new-work target is not a wall-clock slice bound:
phase134 observes three complete save cycles of2.76–2.90s. Phone behavior is explicitly deferred.

The supplemental root test initially expected the unlock form directly; the real synthetic joined
account correctly offered a saved connection in the chooser. Later offline-only auto waits timed
out with a retrying receive lane and zero maintenance attempts. The fixture's page reported
`navigator.onLine=true` despite the context network block; ordinary cached opening/export still
worked. Reconnecting is a distinct condition, not a passing rerun of that offline-only assertion.
Multi-case execution also exposed the inherited lab helper's uncleared10s shutdown fallback:
because it reads mutable `FAIR_OUT`, it can stop the next case's container. Frozen performance runs
use one journey per process and are not exposed to that cross-case timer. Supplemental corruption
continuation is therefore run in its own process. Failed attempts and source are retained.

No validated security defect was identified in this focused review. This does not close the open
construction or386 release obligations, establish phone performance, or overturn phase134's failed
local-input acceptance. Generalized release qualification remains paused.
