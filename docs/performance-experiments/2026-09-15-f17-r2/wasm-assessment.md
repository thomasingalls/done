# Rust/Wasm scope assessment

The preceding combined profile still shows repeated Yjs document/history construction, complete-state comparison, editor projection and UI rendering. Moving its dominant stateful work to Rust would be a substantial data-engine/integration migration. It need not rewrite every React component or invent a CRDT algorithm from scratch, but it would require replacing the direct Yjs object/history assumptions and reproving delivery-order, pending-update, undo/selection, detached preparation and recovery behavior at the boundary.

The project already uses the narrow-component approach: `wasm/journal-seal/src/lib.rs` implements the synchronous journal seal with RustCrypto and fixed byte buffers, imported by `src/crdt/journalCodec.ts`. `scripts/build-wasm-seal.mjs` builds the inlined module. Its inputs/outputs are bytes, making ownership and transfer costs explicit. That preceding combined profile contains only about11ms of self samples in Wasm/module glue over60 instrumented keys; that is an attribution observation, not a complete exclusive cryptography accounting or a native speedup estimate.

A partial port can be counterproductive if the owning objects remain in JS and every edit reconstructs them in Wasm. The ordinary wasm-bindgen `String` interface copies through TextEncoder/TextDecoder between JS and Wasm memory; eliminating such encoding round trips is one of our current improvements. A large win would likely require keeping the relevant document/history data resident in Rust and crossing the boundary less often. Rust also cannot remove unchanged text scans, unnecessary editor transactions, or browser rendering work simply by recompiling them.

Yrs/ywasm exists and aims for Yjs binary/protocol compatibility. That provides a starting point, not evidence that our integration's private codecs, patched pending behavior, history identity and editor observers are interchangeable; its own feature table notes observer API differences. An engine migration could be a later measured architectural experiment if profiling shows the remaining target requires it. This round continues small composable changes and does not add a Rust migration to the plan.

Primary references, checked2026-09-15:
- https://wasm-bindgen.github.io/wasm-bindgen/reference/types/string.html
- https://github.com/y-crdt/y-crdt (README, including ywasm and compatibility scope)
