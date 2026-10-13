# Owned local baseline shadow — focused evidence

[Phase contract](../../account-local-baseline-shadow.md). Parent is signed `c50e3741`; this phase was
checked as uncommitted changes. `evidence.json` records exact source/fixture hashes and commands.
These are synthetic disposable accounts, not personal data. No history removal, persistent baseline,
application activation, generalized conformance campaign or release qualification occurred.

| Check | Result |
| --- | --- |
| Focused Vitest | 89 tests across ten files pass, including the existing 30 generated replay histories |
| Native opted-in shadow | Six Chromium cases pass; ordinary-mode case intentionally skipped |
| Ordinary-mode boundary | One Chromium case passes; the shadow method is absent and ordinary editing persists |
| TypeScript and changed-source lint/format | Pass |
| Yjs patch, Vite build, initial-JS budget and origin isolation | Pass; initial JS 137.4 kB gzipped |
| Diff whitespace | Pass |

The opted-in native cases cover:

1. Full census under the original-device owner; unchanged persistent database/journal contents across
   repeated shadow calls; offline/unallocated and service-accepted suffixes; resume and cold reopening.
2. Input while baseline authentication is held; abandoned comparison, preserved writing, new candidate
   on retry, and a real editor undo afterward. No live document is swapped by shadow replay.
3. A journal entry whose content is durable but whose cleanup failed: the shadow skips it without
   attempting flush/removal. Ordinary cleanup retry remains the path to an eligible cut.
4. Close during pending baseline crypto: the writer permit remains held until settlement, a contender
   cannot acquire it early, and the old operation cannot publish a candidate into the new lifetime.
5. A custody inventory change after initial verification: the final fresh check refuses it.
6. A preceding content flush with its native completion callback held: the shadow remains queued,
   then starts only after completion and exact journal clearing have finished.

Three additional fake-IDB cases prove the fresh all-store read, rejection of changed old ciphertext
or bad metadata before comparison, aborted-read behavior, isolated caller buffers/counters,
domain-limited authentication and callback expiry. The full existing baseline and shared-reader tests
remain in the focused set. No native joined-device/rotation/checkpoint-install journey is added here;
those protocols retain their pure-fixture evidence and remain a later integration boundary.

The initial native run exposed a real draft defect: named slot IDs were rejected because the codec
required hexadecimal identities. The parser now uses the established custody identity contract for
slot/principal/workspace. An initial cleanup assertion also incorrectly expected `whenDurable()` to
succeed while removal was deliberately failing; the fixture now expects the refusal and explicitly
retries after restoring removal. Native setup first required sandbox escalation for loopback servers.
The ordinary Babel build required moving an async ternary's TypeScript return annotation to its
binding; the final build succeeds. Final logs are retained; these exploratory failures were observed
in tool output and their overwritten logs are not represented as retained artifacts.

All `*.log.gz` outputs are complete for their final command. Node emits its existing experimental
localStorage/WebCrypto warnings. TypeScript/lint have empty output and zero exit status. Native
opt-in and ordinary-mode checks run sequentially on disposable loopback services. Durations are
functional-test bookkeeping only; the busy host was not controlled for performance measurements.

The shadow candidate stays private to one owner lifetime. No operation acquires permission to delete,
replace a live reader, retire keys, or claim durable rollback protection from a `matched` report.
