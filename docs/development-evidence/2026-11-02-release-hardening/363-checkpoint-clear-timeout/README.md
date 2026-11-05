# Stage 2 checkpoint: local-clear observer timeout retained — phase 363

The refreshed root check passed its first 26 commands, including all 292 unit files (2,927 passed and one existing skip, 110.71 seconds), storage lifecycle, ownership/custody/content/journal, contention, admission, editor/workspace, generated projection/delivery, startup and local genesis. It stopped at storage:clear; the remaining 56 commands were not reached. [Every result and identity](./evidence.json).

The failed clear stage passed all 17 positive cases, then three mutation controls timed out in the original 15-second settled-state observer. Its unchanged 120-second stage deadline expired at 120,712 ms; the other two controls had not run. Generic observer errors earn no mutation-detection credit.

The three cases pass on untouched signed 89b11fe2 with the same browser/environment, and all three mutations are detected. The same selected cases then pass on the current app with the original waits. Finally the complete current campaign passes all 17 positive cases and all five original named mutation controls in 85,619 ms, under the original 120,000 ms. Preserve the first failure. The successful rerun establishes neither its cause nor reliable deadline margin.

Patch 363 contains only a failure-only, content-free observation after the existing settled waiter throws: visibility, operation status/error code, gates and native lock inventory. It preserves and rethrows the original error. No diagnostic branch executed in the successful run; no wait, polling policy, deadline or app guard was changed. All 73 original assertion arguments and all case/mutation definitions remain. Formatting touched only that new block; the complete parsed AST equals the actual tested pre-format file, whose exact hash is independently matched to the native report. Application/protocol source hashes remain exact checkpoint-start bytes. Scoped lint, formatting and inventory pass.

The first record helper stopped at a stale inventory precondition. A shell sequencing error nevertheless froze the diagnostics alone as patch 363. That immutable patch is retained; patch 364 supplies this outcome and the reviewed source inventory. No test result is changed.

Known static observer concerns (default frame polling and Promise-valued native-lock predicates) remain observations, not a proven explanation for this timeout and not a claimed repair. A broader observer-policy change needs its own discriminating controls if pursued; it is not silently folded into this checkpoint. The temporary proof script's initial module-resolution error is retained too, with the corrected successful independent proof.

Continue with the 56 unrun root commands, keeping child deadlines and stop rules. Refresh the exact-tree receipts after this record. Stage 2 is not closed, and no single monolithic final pnpm check pass, Stage 5 credit, release preparation or deployment is claimed.
