# Rebuilt signed checkpoint — November 5, 2026

This operator amendment supersedes the object-bearing commit IDs in the unchanged
original README. The original 335–443 history is preserved only on local branch
`backup/hardening-335-443-with-objects`; that branch must never be pushed.

The 108 replacement phase commits preserve order, complete messages and author
headers/dates. Each tree is exactly its original minus
`docs/development-evidence/2026-11-02-release-hardening/*/objects/`.
Every phase README and evidence.json remains byte-identical. The mapping in
[commits.json](./commits.json) names the replacement commits and trees and their
originals. Its patch hashes continue to identify the unchanged original frozen
patches. [rebuilt-signatures.log.gz](./rebuilt-signatures.log.gz) contains the new
independent signature checks; the former signature log remains historical evidence.

All 16,209 object files (677,905,859 bytes) remain unchanged on disk.
Only their tracking changed. The shared `.git/info/exclude` contains the anchored
object-directory pattern, so ordinary staging does not add them again. The local
before/after inventory is in `/private/tmp/done-hardening-rebuild-20261105`; its SHA-256 is recorded in verification.json.

The new [source identity](./source-identity.json) is computed with the existing
release-validation functions on a clean exact snapshot of rebuilt phase442
`b32b65ecb4725d74ebe7d05867223991bd2e9908`. It covers 45,563 source paths and has
digest `789370488d8486e50efdbb625347f6b6d9ba4a5837c14289088640e894dab8cd`. The old identity is deliberately not used as
an equality target. The complete final checkpoint's fresh identity is written
outside the hashed source closure to `/private/tmp/done-hardening-rebuild-20261105/final-source-identity.json` after signing;
embedding its own digest in a source file would be self-referential. Stage 5 must
capture its own fresh identity when explicitly resumed.

## Future evidence capture

Use [future_runner.py](./future_runner.py) in place of the earlier private runner.
Its CLI, display observer, display-on assertion, host logging, timeout and child
success logic are unchanged. The [inverse-byte/AST proof](./capture-storage-proof.json)
also detects a control that removes the display precondition.

Only power-log storage changes. `power-log-before.txt` and `power-log-after.txt`
contain dated events inside the command's start/end epoch window, plus their
indented continuation lines. Corresponding `.meta.json` files record the full
raw stdout's SHA-256 and size, window bounds, selected-event count and stored
window hash/size. Full logs are held in memory for hashing and are not written.
The one-second timestamps are compared inclusively, without widening the window.
An empty before-window file is valid; the full-before-log identity is still saved.

Use [future_recorder.py](./future_recorder.py) in place of the earlier private
recorder. A tracked repository input is referenced by exact commit SHA, path,
SHA-256 and byte size, with no gzipped source copy. It refuses to label a dirty
input as committed: exact input sources must be committed before packaging their
references. Untracked/private evidence may still have local ignored objects and
manifest hashes. This is a storage change, not new trust or acceptance credit.

Four portable storage tests pass in [capture_controls.py](./capture_controls.py):
window boundaries/continuations and full-log identity, timezone/fractional bounds,
on-disk storage, and exact committed references with dirty/untracked/outside
refusals. The first development attempt failed on macOS's `/var` versus
`/private/var` path spelling; it is retained beside the passing retry. No app or
Stage 5 journey was run. No push, publication or deployment occurred. Stage 5 remains
paused.
