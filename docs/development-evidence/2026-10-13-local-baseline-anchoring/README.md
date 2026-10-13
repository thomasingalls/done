# Local baseline anchoring — focused development evidence

Base: signed `43fe12aa` (full commit/signature and source hashes in [evidence.json](./evidence.json)).
This packet describes the uncommitted private carrier phase in the [contract](../../account-local-baseline-anchoring.md).
No product installer, history deletion, release campaign or publication.

- 108 focused Vitest cases, including 31 new carrier checks.
- Four native Chromium carrier cases: success, death after reservation, transaction abort, death after commit before the caller receives its reply.
- Each native case cold-checks exact unchanged history and current/frozen-predecessor refusal or ordinary v2 recovery.
- TypeScript, lint, format, Yjs patch, ordinary build, size/origin, whitespace and private-writer bundle absence pass.

Logs are gzip-compressed; the manifest records compressed and original SHA-256 and byte lengths.
`native-initial.log.gz` retains the two initial crash-harness timeouts; the corrected final run is
`native.log.gz`. That initial problem was waiting for a debugger command reply after killing its renderer.
Other exploratory unit outputs were not retained as a complete iteration history. The final logs and
source hashes identify the tested result. Disposable generated keys and content only.

These tests establish the carrier boundary, not live Account installation, journal freezing, undo
continuity through installation, later rotation or a baseline-aware editor. Existing baseline replay
and shadow-owner evidence remains separate. No performance conclusion follows from the timings.
