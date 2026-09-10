# Obsolete day-journal compatibility — 2026-09-10

On `9c2c48f` plus the uncommitted compatibility repair. The author's first personal capture refused
`unsupported-legacy-day`. Read-only inspection of the existing relay backup and historical commit
`a11194e` established that removal of the day-journal feature left its `journal: Y.Text` fields behind.
The author explicitly permitted omitting that removed feature from the import; see
[row 21](../selections/row-21-development-cutover.md). This is unrelated to the localStorage durability
journal, whose updates and dependencies remain required.

The strict projection now accepts only the known plain-text field and omits its prose from Markdown.
Source storage and original recovery update bytes remain intact. Unknown fields, wrong types, formatted
text, text attributes and embeds still refuse. Already accepted packet projections/import plans do not
change. The utility explains the omission before capture or enrollment.

| Executed check | Result |
| --- | --- |
| Synthetic reproduction before the runtime change | [Exact `unsupported-legacy-day` failure](./2026-09-10-obsolete-day-journal/before.json) |
| Export, import and private controller unit tests | [41 passed in 3 files](./2026-09-10-obsolete-day-journal/unit.json) |
| Source, selection, cleanup, coordinator and Yjs seam regressions | [54 passed in 5 files](./2026-09-10-obsolete-day-journal/adjacent.json) |
| Native private migration and editor handoff | [All four passed](./2026-09-10-obsolete-day-journal/native.json) with obsolete day-journal text in the synthetic source |
| TypeScript, focused oxlint/oxfmt, diff whitespace | Passed |
| Production build, budget, origin isolation and documentation gates | Passed; both ordinary entries remain at 326.6 kB gzip against the 350 kB limit |

The directed regression covers nonempty and empty old journals, an archived day and a journal-only day.
It compares projected entries with the independent input-string ledger, checks original recovery records
byte-for-byte, cold-replays the omitted fields from that packet, and rechecks the unchanged source digest.
The existing 100-case generated Unicode/multiline export property (seed 8941, shrinking enabled) now varies
obsolete journal prose independently of master/card/unfiled content; the expected current-content ledger
does not include that prose. No counterexample was found by this expanded property.

Two initial native runs ([first](./2026-09-10-obsolete-day-journal/native-initial.json),
[second](./2026-09-10-obsolete-day-journal/native-repeat.json)) each passed three cases but lost the first
page's execution context while seeding, before capture. A diagnostic focused rerun
[passed](./2026-09-10-obsolete-day-journal/native-focused.json) without an application change. The precise
reload trigger was not established. The rehearsal now uses a separate Vite dependency cache and explicitly
scans the fixture and UI entries, removing shared-cache interference and late fixture dependency discovery
from its setup. The complete campaign then passed from the new cache; no retries or waits were added to
hide a navigation inside a storage operation.

Separately, file-only replay of the unchanged personal relay backup passed the repaired strict projection
and prepared an import plan in memory. All 24 projected files matched the previously verified Markdown
backup byte-for-byte. That diagnostic used a synthetic envelope, not a browser source-bound packet: it
created no source authentication, destination write or cleanup authority. Private content and identifiers
remain outside the repository. The author must still retry actual capture in the original browser.

The [manifest](./2026-09-10-obsolete-day-journal/manifest.json) pins source and reports. Tests use synthetic
content and disposable browser contexts. The full unit/check chain, older native component
campaigns and mutation battery were not rerun. No personal import, selection or cleanup has occurred, and
no conformance debt, platform claim or independent-review obligation is paid by this repair.
