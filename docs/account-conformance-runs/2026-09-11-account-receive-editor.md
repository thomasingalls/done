# Ordered remote editor evidence — 2026-09-11

The prior native receive phase is committed as `f6e4cf4`. The
[private v9 editor](../account-receive-editor.md) now holds editor admission across signed-page verification,
atomic original content/evidence/witness commit, authenticated readback and ordered publication.

Final campaign: `test-results/account-receive-editor/2026-09-11T06-11-43.632Z`, run through
`node scripts/account-receive-editor/run.mjs` (`account:receive-editor`).
[Summary](./2026-09-11-account-receive-editor/summary.json),
[exact sources](./2026-09-11-account-receive-editor/sources.json),
[native results](./2026-09-11-account-receive-editor/native.log),
[generated histories](./2026-09-11-account-receive-editor/generated-editor.json),
[findings and limits](./2026-09-11-account-receive-editor/findings.json).

| Check | Result |
| --- | --- |
| Native ordered editor | 12 tests pass; original publication, raw input refusal, undo, duplicate/conflict, pressure/discard, before/after commit crashes, close/drain and callback closure, pending structs/deletions and compaction |
| Native generated inputs | 10 histories, seed 9202026; authored master text, durable received position and local source count checked after every action and cold reopen |
| Controlled admission/property tests | 54 pass, including 200 new queue histories (seed 9192026) and a deletion with unchanged SV that cannot be hidden by an empty source list |
| Effective source controls | Early promotion exposes unsaved text after transaction abort; relabeling remote bytes creates an extra local source capsule |
| Existing storage-only receive | 45 primitive/property and 17 native tests pass on the final source tree, including 12 generated native histories and original verification controls |
| Existing v8 delivery | Four properties and 19 native tests pass on the final source tree |
| Full unit suite | 957 tests in 84 files pass |
| Build/static checks | Isolated app build, TypeScript, scoped lint/format and 13 existing repository gates pass |
| AAD gate / aggregate | `check-aad-coverage.mjs` fails on the existing private-envelope generator (F-01); full `pnpm check` was not run or claimed green |

The new v9 owner omits truly source-free startup capsules (the bounded F-08 repair). Existing v6/v7/v8
factories and retained empty sources keep their historical behavior. Deletions still create sources.
Remote originals themselves create no source capsule, human undo item or local outgoing callback. A
subsequent independently admitted system repair is still an ordinary local action. Storage readback or
publication failure after commit closes the editor so a durable dependency cannot be discarded as pending.

A later return-value edit introduced a missing account binding. Native startup and TypeScript caught it;
the corrected destructuring and runner preflight now pass. The complete
[failing run](./2026-09-11-account-receive-editor/composition-before/summary.json) and
[exact failing source](./2026-09-11-account-receive-editor/composition-before/accountReceive.ts.txt) are retained.
Two earlier native harness errors are recorded separately: a census queued behind a deliberately held
receive caused a test timeout, and a generated invalid page was rejected for no outstanding request rather
than the message the test expected. The corrected test checks the typed refusal. These were harness defects,
not evidence that rejected input was admitted. The final generated campaigns found no additional defect.

[Storage regression](./2026-09-11-account-receive-editor/storage-regression/summary.json) uses
`test-results/account-receive/2026-09-11T06-14-08.403Z`;
[delivery regression](./2026-09-11-account-receive-editor/delivery-regression/summary.json) uses
`test-results/account-delivery/2026-09-11T06-14-11.142Z`. All three saved source inventories match the final
implementation. Unit/build/static results and the red AAD gate are retained alongside them;
[manifest](./2026-09-11-account-receive-editor/manifest.json) hashes every evidence artifact.

The review's F-01 and F-02 require a dedicated validation-baseline repair. Other accepted protocol,
capacity, recovery, authority and performance findings remain follow-up work; the annotations stay in the
uncommitted root packet. No v2 service route, live sender on v9, new member, personal Account, server start,
deployment, default-app activation or whole debt payment is claimed. The personal packaged release and
L-2 are unchanged. Restore/clone and OS/power-loss guarantees remain outside this evidence.
