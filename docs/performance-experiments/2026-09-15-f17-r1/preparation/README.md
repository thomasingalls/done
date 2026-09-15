# Preparation lane: scoped primitive-string reuse

Exploratory candidate against signed `20a535c4`. No main-checkout changes, commits, default
activation, full-suite run, native campaign, or independent performance claim.

## Hypothesis and mechanism

The remaining history fork writes long Y.Text strings into a private compressed V2 update,
then parses those strings into a detached Y.Doc. The previous browser profile attributed a
substantial inclusive portion of preparation to that document fork. Primitive JS strings are
immutable, so serializing their code units is unnecessary for mutable-object isolation.

The patch preserves structural V2 encode/decode and all existing object/binary detach paths.
Only the private selection-history owner asks its document fork to capture a scoped tape of
`writeString` calls. A primitive string of at least 32 code units containing no surrogate code unit is
retained directly. Short strings and any surrogate-containing string retain the old path;
the tape stores null for those calls. The paired decoder consumes precisely the corresponding
entry, otherwise reads the old stream. Key encoding/decoding stays on its existing V2 path.
The tape is cleared on every completion/error and cannot escape as a wire/archive format.

The expected improvement is less copying and UTF-8 encoding/decoding in long-text forks.
It does not avoid document struct traversal/integration, history copying, canonical comparison,
admission work, publication, or rendering. Fragmented short text or surrogate-containing text
may see overhead without a gain. The shared browser experiment must decide whether it helps.

## Semantic and lifetime scrutiny

- UTF-8 changes isolated surrogate code units. This prototype avoids reimplementing normalization:
  *any* surrogate-containing field goes through the existing paired codec, including ordinary
  emoji pairs. The existing edge replacement remains intact for adjacent small fields/keys.
- Direct BMP strings preserve leading BOM literally, as the existing lib0 decoder does with
  `ignoreBOM: true`. No Unicode normalization is introduced.
- Mutable objects, binary leaves, Yjs items/types, delete sets, metadata maps, and pending bytes
  remain detached by the current paths. Only immutable primitive strings are reused.
- Encoding can invoke getters in application content and reenter another fork. Every invocation
  owns its tape/decoder; the new directed nested-fork test exercises this. There is no module-global
  tape, pool, cache, shared cursor, or long-lived registry.
- An encoding failure clears its tape even before a destination document exists. A decoding or
  consumption failure destroys the allocated document. Temporary structural bytes are cleared.
- The paired stream is meaningful only with its tape. Keeping it confined to the synchronous fork
  is a hard requirement. Yjs' integrated struct writer is assumed to emit dependency-complete
  integrated state, as the existing implementation assumes; pending carriers are excluded and copied
  afterward unchanged. The pinned generic codec/generated pending tests still pass.
- Primitive string sharing does not promise lower retained heap. An engine can retain ropes or
  larger backing strings; the former UTF-8 round trip may have flattened them. Measure allocation,
  GC and retained heap before RC consideration. Clearing the tape drops references; it cannot erase
  JS string memory or establish forensic erasure.
- This changes private runtime use of pinned Yjs codec hooks. An upstream codec change would need
  compatibility review even if its public update format stays unchanged.

## Focused evidence

One run, no retries: formatter passed; `git diff --check` passed; five focused Vitest files,
115 tests passed in 6.57 seconds (`focused.log`). Tests include current owned history/selection,
workspace accepted/pending isolation, undo/redo, complete-state equality, pending delivery, and
codec oracle tests. Three new tests cover mixed field ordering and mutable content isolation,
150 generated mixed BMP/surrogate/string cases (seed 150917), and reentrant nested forks.

The new candidate checks compare against the unchanged generic fork; that generic codec retains
its existing direct V1 oracle controls in the same test run. This is focused exploratory evidence,
not a complete protocol/native/memory qualification or a performance result.

## Remaining checks if retained

Use the common browser workload and useful combinations to establish a repeatable latency effect;
include a short-fragment and Unicode-heavy guard workload. Observe allocation/GC/retained heap to
check backing-string retention. Before RC admission, add deliberate tape ordering/length and
cleanup fault controls, broaden source-type/throwing-getter coverage, run typecheck and the affected
owned/native recovery and pending histories, then the selected combination's standard qualification.
Do not activate publicly solely from this prototype's unit results.

`candidate.patch` includes the new test file. `summary.json` pins baseline, patch, resulting sources
and the test command. There are no benchmark results in this lane; root owns serial measurements.

## Adversarial follow-up

A read-only codec trace found an additional defensive requirement: the `string` TypeScript
annotation alone cannot establish primitive ownership at runtime. A boxed String could pass
length/regex checks and be returned directly, whereas the old codec coerces it into a primitive.
The final patch checks `typeof value === 'string'` before reuse; all other values keep the
baseline path. A directed boxed-string test confirms no mutable wrapper crosses the fork.
The original patch and summary are retained as `candidate-before-primitive-guard.patch` and
`summary-before-primitive-guard.json`; the initial 115-test log is unchanged.

The final five-case exploration file passed in 490 ms (`focused-adversarial.log`), including
both new directed cases. The compact codec-interleave case adds legacy ContentJSON, long
subdoc GUIDs, long map parentSub keys, XML node/hook keys, a BOM and a trailing lone surrogate.
No broader repeat or performance run was performed in this lane.

Exact pinned codec trace:

- `UpdateEncoderV1.writeString` and `writeKey` call lib0 `writeVarString` independently;
  matching reads call `readVarString`. lib0's native decoder is configured with
  `fatal: true, ignoreBOM: true`, retaining a leading BOM. Its polyfill also preserves BOM.
- V2 `writeKey` writes a key clock plus `stringEncoder.write` directly; `readKey` consumes
  its key clock plus `stringDecoder.read` directly. Neither dispatches to our overridden
  string methods, so keys correctly occupy the baseline stream but no tape slot.
- Matched string-method fields are Item root names/parentSub names, ContentString,
  ContentJSON JSON text, and ContentDoc GUIDs. XML element/hook names and format keys
  instead use the key methods. Client and struct traversal orders match at writer/reader;
  integration happens only after those ordered fields have been read.
- The fallback V2 StringEncoder joins its fields before UTF-8 conversion. Every remaining
  field and key already passes `forkString`, which replaces an ending high surrogate or
  starting low surrogate. Removing a direct primitive field from between two fallback fields
  cannot create a new cross-field pair. Interior pairs/lone surrogates stay on the old path.
- For eligible BMP primitives, UTF-8 encode/decode is an exact code-unit identity, including
  NUL, BOM and BMP noncharacters; there is no normalization or mutable object identity to lose.

No remaining concrete codec mismatch was found in that trace. This does not prove all runtime
inputs, error paths or future upstream codec versions equivalent.
