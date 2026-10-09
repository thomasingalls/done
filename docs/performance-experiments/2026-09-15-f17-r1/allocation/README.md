# Allocation exploration candidate

Base: signed `20a535c44d2c33b394306fa67023c62d2d9c5f40`.
Checkout: `/private/tmp/done-f17-exploration-r1/allocation`.
Scope: isolated, uncommitted prototype. No main checkout, default activation, protocol format, registry, or release budget changed.

Hypothesis: repeated complete-state comparisons allocate and copy temporary encoder buffers and long-string field records. Reusing bounded, cleared scratch may reduce allocation churn and copying in the synchronous admission path. Whether these allocations materially affect browser latency or GC is unproven until the common screen/profile.

## Mechanism

The long-string comparison path borrows a `ComparisonEncoder` from a module-private pool, removing it before use. Its ordinary V1 byte writer and ordered long-string fields still reconstruct the same complete encoding; normalization fallback and all snapshot/pending-state checks remain. A warm, contiguous encoder buffer is exposed as a private subarray to the comparison, avoiding the otherwise fresh full-byte copy. The caller owns the encoder lease until both equality and any normalization fallback finish; no bytes from this encoder are exposed through the public API, wire transport, history, or storage.

At return, all active string fields are replaced with empty strings and zero offsets; all scratch chunks and the current scratch buffer are zeroed. Chunks are dropped, position reset to zero, and at most 1,024 field records retained. A current buffer larger than256KiB is replaced by a fresh100-byte buffer. At most two cleared encoders are retained; additional encoders created by recursive comparisons are cleared and discarded. Thus the pool retains at most512KiB of scratch byte buffers plus2,048 cleared field records and container overhead. This is a retained-capacity bound, not a peak allocation or whole-process memory bound.

## Pinned reset and ownership assumptions

Inspected the installed pinned Yjs13.6.31 `DSEncoderV1`/`UpdateEncoderV1` and lib0 `Encoder` implementation. `DSEncoderV1` has only `restEncoder` state; `resetDsCurVal` is a no-op, and its DS writes have no delta counters. `UpdateEncoderV1` adds methods without state. The ordinary encoder's mutable state is `cbuf`, `cpos`, and `bufs`. The candidate resets these plus its own string count and fields. This assumption must be revisited on dependency upgrades; V2 encoders have additional state and must not be pooled using this reset.

The integrated-state view explicitly nulls both pending fields. Pinned `encodeStateAsUpdateV2` therefore returns its single encoder-produced array without merging pending data. It calls `toUint8Array` after writing is finished. When there are prior chunks, the inherited method still returns a detached copy. On the contiguous fast path, the view is valid only while that encoder remains borrowed. No caller can access the view beyond `sameDocState`.

If content getters reenter comparison, active encoders are absent from the pool, so nested comparisons cannot overwrite outer scratch. If encoding throws before returning parts, `comparisonEncoding` clears and returns its encoder in `catch`. If the second encoding or subsequent comparison/fallback throws, the outer `finally` clears both completed leases. Excess nested encoders are cleared even when the retained pool is full. No Yjs-owned object, document, issued capability token, or asynchronous durable buffer is pooled.

## Focused evidence

`focused-tests.log`: `node node_modules/vitest/vitest.mjs run test/projectionEquality.test.ts test/pendingProjection.test.ts` passed2 files /24 tests in3.89s. Existing comparisons include150 generated reordered/pending/deleted/split transition histories and200 scalar/long-string histories against the frozen full-normalization oracle. Three new tests exercise nested encoding reentry, release after an encoded getter throws, and large-to-small reuse across field/buffer retention caps. Scoped formatting and `git diff --check` pass.

`focused-tests-initial.log` preserves one new test's erroneous expectation: after deliberately changing a nested document, its getter still expected equality while gc:false encoding revisited deleted content. The test now compares the nested result with the independent full oracle. The implementation did not change to address that test failure.

## Tradeoffs and remaining checks

Zeroing retained buffers adds work and may erase any allocation gain. The global pool retains bounded empty storage across workspace closes. Deep reentry may allocate more than two simultaneous encoders, though only two can remain afterward. Large documents exceeding the retained cap can still repeatedly allocate. Sampling may show that other allocations dominate; a negative or inconclusive browser result is a useful outcome, not evidence for broadening this prototype automatically.

No typecheck, full unit/native suites, allocation measurement, or release validation ran in this checkout. The parent owns common browser screening and candidate combinations. Before RC consideration this needs targeted review of plaintext scratch lifetime, native/browser equality and pending regressions, realistic retained-heap/allocation evidence, dependency checks, and the unchanged application gate. No throughput, GC, memory, or latency benefit is claimed yet.

## Read-only cross-review

Reviewed the publication prototype's revision-bound projection cache separately after packaging this allocation candidate. Ordinary local accept, structural invalidation, remote invalidation, snapshot detachment, and rebase basis checks appeared coherent. Identified a likely cache mismatch where a detached fork normalizes lone UTF-16 surrogates but change tracking starts after the fork; an edit to another target could retain pre-fork text in `read()`. Reported a focused master-surrogate→other-card-edit reproduction to the parent and publication agent before any promotion. This concern belongs to the publication prototype, not the allocation patch; no publication files were edited here.
