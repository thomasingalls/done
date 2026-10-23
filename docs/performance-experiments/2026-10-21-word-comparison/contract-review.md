# Bounded implementation challenge

The existing content-selection lease already permits synchronous owner-selected projection without a full byte walk. It is not permission to reuse a validation result after mutable input changes. Extending it across awaits would change authority and interruption behavior, so this phase tests an exact-comparison implementation only.

The candidate compares the same view ranges and record metadata, checks each four-byte word and every tail byte, and preserves early mismatch refusal, short/unaligned byte paths, empty/self/detached semantics. Word equality is independent of native endianness because both views use the same native representation. No digest, retained view or memo is introduced. Existing comparison was already early-exit and is not a constant-time primitive.

Cooperative comparisons keep each 65,536-byte span and the per-record checkpoint. No owner queue, invalidation/revision, current callback, source identity, erasure or detached-projection decision changes. New tests independently compare against Buffer, visit every mismatch position in bounded slices, cover metadata and final-word/tail/chunk boundaries, invalidation during a yield, and caller/projection ownership. Mutation controls must detect each deliberate word/tail/checkpoint omission. All old test bodies are preserved.

The helper has broad callers including authority, custody, memo and baseline comparisons; the affected unit selection includes those owners. Full build/typecheck and origin/bundle checks cover module integration. Real packaged-client journeys check complete exports, all offered editor keys at the peer, reverse-direction writing, Undo/Redo and locked offline reopen. This does not resume generalized qualification or prove mobile/Firefox input-to-paint behavior.

Micro improvements cannot justify adoption by themselves. Original fixed app non-regression guards and reference drift remain binding. Preserve each failed prototype and app journey. A failed acceptance leaves the production helper unchanged; the candidate and observations remain reproduction evidence, not enabled behavior.
