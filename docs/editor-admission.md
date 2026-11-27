# Goals editor admission — implementation phase six

This checkpoint connects a real CodeMirror Goals text surface to phase five's ordered owner.
`openAdmittedText` opens the real encrypted carriers. `createAdmittedEditor` renders accepted text and
queues semantic input commands; it does not lend a writable Yjs document to an editor or provider.
The current application startup still uses its earlier store. Card/workspace commands, actor/bootstrap,
whole-workspace undo, onboarding, exact trim and migration remain subsequent work.

The adapter uses existing formatting, task and Markdown list commands against a private CodeMirror
state only when their intent reaches the admission head. History becomes accepted with its completed
carrier. Each input is an undo step; bounded slices of one paste group together. Remote changes map
history without entering it. Reopen starts a fresh runtime history. Queued input normally follows its
predecessor's caret; explicit selections use relative positions captured against accepted text.

Ordinary typing, paste, cut, formatting, list actions and undo/redo enter this boundary. Paste slices
contain at most 1000 UTF-16 code units, preserving surrogate pairs, and use the owner's forced content
path. The 16 KiB encoded-update guard still applies; high-fragmentation deletions or multi-selection
commands that exceed it are refused as one action (phase 548) rather than acknowledging an oversized
update or blocking the queue, and the editor says the text is too long for one action. Other
extension commands require semantic adapters and are refused visibly. Native composition is provisional;
its final text passes admission. The browser harness probes Blink composition, not a native IME population.
CodeMirror reconciliation can cancel Blink's native preedit without `compositionend`; the adapter also
handles the final non-composing `insertText`. This preserves the tested commit, but candidate-window,
preedit presentation and mobile/dead-key behavior still require platform testing before editor acceptance.
Backspace uses Markdown-aware removal followed by logical grapheme deletion; layout-dependent deletion
shortcuts need separate adapters. Large undo/redo results also remain subject to the encoded-update limit.

The accepted projection supplies the existing Markdown/ZIP export functions. A same-origin,
slot/principal/workspace-scoped BroadcastChannel sends only accepted local bytes. Received bytes enter
the content-commit queue; they are not echoed. The channel does not verify Account envelopes or certify
remote authorization. A required receive validator remains the caller's responsibility. Dropped/refused
channel input is reported to the caller; this adapter is not a reliable network delivery protocol.

The real editor displays storage pressure and offers retry or explicit pending-suffix discard. Repair
and close disable ordinary editing, copy and export. Full-profile forensic memory erasure is not claimed.
The public text facade owns exactly one Goals command/history stream. Card and actor-scoped cross-surface
history require the later workspace adapter; opening multiple editor views on one text facade is outside
this checkpoint's interaction contract.

The full-clone preparation strategy remains unchanged. The profile includes compact text at 1 KiB,
100 KiB and 1 MiB, 2000 middle inserts from one writer, and an intentionally extreme 2000-writer case.
History shape affects cost even when visible text is small. Optimizing preparation and measuring the
complete input-to-paint path are still required before accepting this implementation against the low-end
interaction budget. This checkpoint does not revise that budget or enable the new path by default.

[Core repair phase 2](./pending-projection.md) replaces the initial pending-state serialization with a
detached runtime fork. Every accepted transition checks the Yjs projection's integrated content and
pending bookkeeping against canonical before updating the public surface. Runtime mismatch disables
ordinary access while preserving durable originals; it does not classify valid pending data as storage
corruption. These extra state scans/copies are outside the historical preparation profile below.

`node scripts/editor-admission/run.mjs` runs isolated Chromium cases, source mutants and a preparation
profile, with optional `--case`, `--output` and `--no-mutants`. All production source, fixtures and relevant
contracts are hashed and the executed source copy is immutable. Faults use actual content transactions,
native crypto gates and renderer crashes. Synthetic custody identity and authority callbacks remain
explicit fixture assumptions. Profiling records individual clone/prepare samples on this host; it is a
scaling diagnostic, not keystroke-to-paint, a low-end-device result, or a release-budget pass.
