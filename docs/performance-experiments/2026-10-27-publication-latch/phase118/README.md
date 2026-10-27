# Phase118 — Activate the accepted composed receive owner

Enable the guarded750ms quiet-publisher budget only for composed owners, matching the experimental
C owner that cleared all12 phase117 journeys. Other owners retain their original behavior; the
factory default stays off. The previously held phase111 outcome remains recorded as a failed
attempt, with its blocker repaired by publication-only deadline latching. No rate, backoff, local
flush, authority/history/signature/witness/authorization or commit policy changes.

Activated candidate checks:

| Check | Result |
| --- | --- |
| Full Vitest suite | 174 files,2082 pass,1 existing skip |
| Native batch/sync/group/projection cases | 67 distinct cases exercised across required modes |
| Metadata/wrapper/census tests | 152 pass |
| Types, changed-file lint/format | Pass |
| Build, size and origin isolation | Pass |
| Independent source comparison | 1653 runtime/test/dependency files checked |

The83 focused cases from115 are included in the full unit run; do not double-count them. All8 old
batching cases/helpers remain byte-exact, all7 additions retained. The omission control from115
still applies to the byte-exact scheduler: deleting only the latch causes5 failures, with the8
old cases passing. Native checks retain all malformed/tampered/oversized/expired/superseded reply,
atomic grouped commit, interruption, exact sealed retry, lost answer, custody change, cold reopen,
projection and local-journal barriers. Conditional authority/audit/hidden cases ran in their modes.

Rebuilt activation source snapshot12cf4bdb43e83998d2d9ae31ed2a44be1eff7ea2 is not a signed release.
All31548 exported blobs verified. Every executable/worker file matches measured C exactly;109/110
artifact files are byte-exact. One source map differs only in updated source comments, with exact
mappings and all other fields unchanged. The initial all110-byte assertion failed for that reason;
both the failed attempt and the explicitly bounded follow-up are retained. No benchmark repeated
or acceptance gate relaxed. Same controlled comparison label67288576/date/flags as116.

Broad optional lint fails on1213 errors in three archived mockup/reproduction files, all byte-exact
to signed HEAD. The failure is retained. Lint on all three changed code/test files passes; there is
no repository-wide lint pass claim and no unsolicited archived-file cleanup. The runner stopped
before native dispatch at that broad check, then continued with explicitly scoped checks.

Ordinary repository checks are recorded in ordinary-checks.json and their logs, after documentation
and retained paths are stable. The first normal loop refused the changed runtime census at the
authority and crypto checks; trace did not run. Preserve those results. Explicit reviewed recording
changes only accountReceive.ts source hash; classifications/labels and all other entries are exact. Frozen-source/performance identities live in116, all12 raw journeys
and independent native/timing audits in117. Known fixture-value/privacy review remains bounded,
not universal DLP. Private fixture, databases and profiles are not retained in Git.

The requested acceptance blocker is cleared and the tested owner activated for release preparation.
Next sign the unsigned sequence, then perform the repository's signed-source ARM64 artifact and
publication checks. No release image was built/published here; preview8443 and production untouched.
Android/physical-provider and full qualification are not established;912/367 remains paused.
Unsigned118 follows117; real index empty. No commit, push, merge or deployment.
