# Top-level primitive any-string exploration

This is a candidate-only patch above the selected round-two combination in the isolated checkout. It changes only `src/crdt/yjs.ts` and adds `test/exploratoryAnyStrings.test.ts`. The saved `selected-yjs.ts` is the exact pre-candidate runtime file. No main-checkout source, public format, default mode, or eligibility-probe changes were made.

## Mechanism

The existing owned selection-history fork can retain immutable strings in a paired, synchronous string tape. Its ordinary `writeString` fields already use that tape. Extend it to top-level primitive `writeAny` strings satisfying the same existing eligibility rule: primitive string, at least 32 UTF-16 code units, no surrogate code units. A shared predicate avoids scanning eligible any strings twice.

Pinned lib0's native any tags are 116 through 127. For this private paired fork only, tag 0 marks a retained string. The writer appends the value to the same ordered tape used by ordinary string fields; the paired decoder consumes tag 0 and reads the next tape field. The check for complete tape consumption remains. The decoder recognizes this marker only when the owning string tape exists. Non-owned `forkDoc`, public encoders and outgoing wire bytes continue to use native encodings. No nested object traversal or accepted/source mutable object reuse is added.

The comparison encoder emits the pinned native primitive string tag 119, then uses its existing lossless byte-position/string-field representation for the string. This preserves the reconstruction argument: native `writeAny(string)` is precisely tag 119 plus `writeVarString`. All nested and non-string values retain native `writeAny`; complete fallback reconstruction, full normalization, missing-dependency checks, scratch clearing and reentry behavior are unchanged. The bounded early-long-ContentString eligibility probe is unchanged.

## Evidence and limits

Eight directed/generated tests pass, including 150 deterministic generated histories (seed 193917). They compare the owning history fork against the existing native-any fork, compare exported V1 bytes, replay those bytes in an ordinary Yjs document, and differentially compare exact equality against an independent native-V1 normalization oracle. Mixed ordinary text fields and any string fields exercise the shared tape ordering through actual Yjs V2 integration. String values include length-boundary, FEFF, BMP, astral, and lone-surrogate inputs. Further controls cover string/type/order/byte-position differences at identical clocks, distinct lone surrogates with identical native UTF-8 output, split item boundaries, pending updates/missing dependency maps/delete bytes, boxed and nonplain runtime objects, nested mutable binary ownership, repeated pool use, getter reentry, and exceptions followed by successful reuse. TypeScript passes.

The first test run had one fixture-construction failure: Y.Array's public insertion path rejects undefined before any codec runs. The corrected control inserts a supported placeholder then installs undefined in the pinned ContentAny runtime value, as the nonplain controls already do. Seven tests passed in that initial run. The initial log is preserved; no implementation change was needed to repair it.

This does not qualify the candidate for production. It adds a private codec convention tied to pinned lib0/Yjs internals and would require explicit version-sensitive qualification if promoted. Existing affected regression checks, native application timing, adversarial fault controls, and the eventual release qualification are the parent's subsequent work. No performance claim is made from these unit results.
