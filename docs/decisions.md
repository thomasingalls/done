# done — Decision journal

**Append-only.** Entries are never edited or deleted once written. A decision that turns out wrong is
superseded by a _new_ entry that says so and names the one it replaces; the original stays, because the
reasoning is the point and a record you can rewrite is not a record.

**Chronological, oldest first.** New entries go at the bottom. This is the opposite of the app's own Done
section, and deliberately so: Done is a record of _what you finished_ and reads newest-first, whereas this
is a record of _why the project is shaped the way it is_, and that only reads in order. To find what is
currently true, do not read this file — read the PRD and the TRD.

**What this file is not.** It is not the current state of the project, which is
[progress.md](./progress.md); not the record of what shipped, which is [completed.md](./completed.md); not
the plan, which is [sequencing.md](./sequencing.md); and not the product and architecture decision history,
which is [sessions.md](./sessions.md). `sessions.md` records the _product and architecture_ settlement that
the PRD and TRD consolidate. This file records _implementation_ decisions taken while building — the ones
that would otherwise be discoverable only by reading a diff.

## The entry format

Four fields, in this order:

- **Date** — the day the decision was taken.
- **Commit** — the commit that carries it, so the code and the reasoning can be read against each other.
- **Orientation** — where the project stood when the question arose, and what made it live. This is the
  field that decays fastest and matters most: a decision read five versions later is unintelligible without
  the state of the world that forced it.
- **Decision** — what was chosen, and what was given up to choose it.

Each entry also names the **PRD and TRD versions it was taken against**, because section numbers move and a
reference that silently resolves to the wrong section is worse than one that obviously does not.

```markdown
### A short sentence naming the decision

**Date:** YYYY-MM-DD · **Commit:** `abc1234` · **Against:** PRD v9 / TRD v8

**Orientation.** What was true when this came up.

**Decision.** What was chosen, and the cost accepted.
```

**Horizontal rules mark PRD/TRD version boundaries**, not the passage of time. Everything between two rules
was decided against one pair of document versions, and its section references resolve in _those_ versions.

---

## Era: PRD Draft v6–v8 / TRD Draft v4–v7 — the phase-numbered project

**These entries predate this journal.** They were the README's decision record, written between
`d3284da` (2026-08-06, Phase 2) and `0ef0e7b` (2026-08-11, Tailscale), and are migrated here verbatim so
the reasoning survives the README's reduction. They are preserved as written, including claims that were
true when written and are not now.

**They carry block-level provenance rather than per-entry provenance.** The README recorded decisions
without dates or commits, and attributing each one to an exact commit after the fact would be invention.
Per-entry `Date` and `Commit` begin below the next rule, where the journal starts.

**Two things to know before reading them.**

**Their section references are to superseded numbering.** The TRD deliberately preserved its §0–§12
numbers across the v8 rewrite, so every `TRD §x` below still resolves. The PRD did not. The references
that actually appear below map as:

| Reference as written             | Was (PRD Draft v6–v8)     | Now (PRD v9)                                                               |
| -------------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| `PRD §3`                         | Documents vs. collections | §4.1 — and principle 5, which now states the cap/replication rule directly |
| `PRD §4`                         | Item movement             | §4 The workflow                                                            |
| `PRD §11.3`                      | Actors → what v1 ships    | §5 Identity, attribution, sessions and presence                            |
| `PRD §12`                        | Explicit non-goals        | §9 Explicit non-goals                                                      |
| `PRD §13`                        | Phasing                   | §10 Phasing                                                                |
| `PRD principle 1`, `principle 3` | Design principles §2      | §3 Design principles — **numbers unchanged**                               |

**"This phase" meant Phase 3: sync.** The phase framing is itself superseded: PRD v9 §10 keeps the phase
numbers but no longer organises the work that way, and [sequencing.md](./sequencing.md) supplies the
dependency order the project actually runs on.

### Decisions taken in Phase 3: sync

**The websocket transport is imported eagerly, but constructed conditionally.**
TRD §7.1's invariant is that no provider exists until an endpoint is configured;
`createSync` still enforces that. This transport is already scheduled for
replacement, and keeping its small module in a separate lazy chunk was not worth
special-casing that chunk in the service-worker precache and bundle accounting.

**A bare loopback host defaults to `ws://` when the page is insecure.** The
default scheme is otherwise `wss://`, because the token is a bearer credential
and TRD §7.2 puts it over TLS. But `localhost` typed into a page that is itself
being served over plain HTTP is a `pnpm dev` session and nothing else: there is
no certificate on either side, and `wss://` there produces a connection that
fails with nothing the browser is willing to explain. Loopback only — a LAN
address or a real hostname still gets `wss://`, and downgrading either has to
be typed. The same reasoning gives `0.0.0.0` its own refusal ("an address to
listen on, not one to connect to") and turns an abnormal close on
`wss://localhost` into the sentence that names the actual cause.

**The sync configuration is local and unsynced.** It sits with the actor id and
the device in `localStorage`, not in `meta.settings`. Two reasons, and the
second is the one that settles it: a bearer token is a secret that belongs to
the browser it was typed into, and an endpoint reachable from one device is not
necessarily reachable from another — a laptop on the LAN and a phone on mobile
data do not agree about `box.local`. The cost is that each device is set up by
hand once, which is also the only way a token gets onto a device at all.

**The relay is its own package, with its own lockfile and its own tests.** Not
a workspace member of the app's. It ships separately, has a different dependency
set, and — the property being protected — **the app builds, tests and runs with
`relay/` deleted**, which is the same thing TRD §7.1 asks of the sync code
inside the app. The one file the app does reach into is `relay/src/auth.ts`,
which is dependency-free on purpose: authorization rules enforced only in a
package nobody runs are rules that drift.

**A refused connection is a completed handshake and then a close code.** The
obvious implementation rejects the upgrade with a 401. A browser cannot see
that: `WebSocket` reports a generic error and the provider retries forever, so a
mistyped token is indistinguishable from a tunnel, and a device silently never
syncs. Codes in the 4000–4999 range do reach the client, so the relay accepts
the upgrade, sends nothing, and closes with 4401 — which the menu turns into
"The relay refused the token."

**Sync appears in the menu and nowhere else.** PRD principle 3 makes offline the
normal state rather than a degraded one: no reconnecting banner, no spinner, no
read-only mode, nothing that interrupts writing to report on a network. Someone
who wants to know goes and looks. The one concession is that "offline" is drawn
as an ordinary muted state rather than as a warning, because it is not one.

**"Last synced from ⟨device⟩" comes from the update envelope, not the document.**
A device name in the synced document would contradict TRD §4.8, which keeps
device identity local. Each connection announces its local device metadata to
the relay; the relay attaches that metadata when it forwards opaque update
bytes, without inspecting them. Awareness still drives the current peer list.
State loaded from the relay's stored copy has no originating live connection,
so it says how long ago and nothing about where.

**The relay keeps a file, and it is still not a backup.** Every device holds a
full replica, so a relay that forgets everything loses nothing — the next device
to connect hands it the document back. What the file buys is that a restart
inside the window between "the phone wrote it" and "the laptop opened" is
invisible rather than a wait for the phone to come back. It is the difference
between "eventually" and "when you open the laptop", and it is deleteable at any
time.

**The relay's message loop is a fork of `@y/websocket-server`, not a dependency
on it.** Depending on the package was the first choice — PRD §12 rules out
inventing local-first techniques, and `setupWSConnection` is the sync and
awareness loop. It did not survive contact with a laptop: version 0.1.1, the
last built against Yjs v13, statically imports `y-leveldb` for a persistence
backend this relay does not use, and `y-leveldb` pulls in the native
`leveldown`. On Node 26 and an arm64 Mac there is no prebuilt binary and the
process does not start. No install flag helps — the import is static, so the
module loads whether or not the package is wanted — and the release that
removed it moved to Yjs v14, which is a migration to make on both sides of the
socket at once (TRD §10.1) or not at all. Upstream describes the server as
living in a forkable repository; `relay/src/connection.ts` is that fork, typed
and trimmed. The protocol is still imported: `y-protocols/sync` and
`y-protocols/awareness`, at the versions the client uses. What went is the
leveldb backend, the webhook machinery, and the environment variables that
configured them.

**The device name is editable.** It was a read-only guess from the user agent in
Phase 2, when nothing could see it. It is now the label that shows up on your
other device, and "Android" is a worse answer than "the phone in the kitchen".

**The cap is enforced once, where adding happens.** Every write path refuses to
exceed three, which covers paste, multi-line insert, split and drag at the point
of the mistake. Two devices each adding a third card while apart is not a
mistake anyone made — both were under the cap when they wrote — so PRD §3 keeps
every card: the merged day shows more than three and nothing runs to tidy it up.
The rule does not soften, and an expanded Next takes nothing new until the user
has moved it back under three, one card at a time, to Scheduled. _Phase 2 shipped
a system-actor repair that relocated the overflow to Scheduled by itself. It
converged and it deleted nothing, but it was the app deciding which of two
devices' legitimate writes stopped being Next, and the PRD has now decided that
the other way._

**A card whose position was destroyed goes back by the section's own rule.** The
one place an order is recomputed rather than merged is a day two devices created
at once: they mint a `Y.Map` each, one wins the key, and the loser's arrays are
deleted with it. The cards survive in the canonical registry, and the membership
repair puts them back — appending to Next and Scheduled, where intent is not
stored anywhere, and above everything completed earlier in Done, where it is.
That makes `Card.createdAt` load-bearing rather than decorative, and it has to be
strictly increasing per device: `Date.now()` reads milliseconds, a device can
write several cards inside one, and two cards sharing a timestamp is that
device's own order gone from the document. A reading that has not moved is nudged
a nanosecond, which is a resolution instants have and clocks do not.

_This is a mitigation, not a design._ Yjs orders concurrent insertions into one
array exactly; the order is lost because the schema lets the array itself be
created twice, and a `Y.Map` key is last-write-wins over whole values. Addressing
a day's collections as root types (`day:ISODate:section`) would make them merge
instead of race, and would let all of the above be deleted. It is deferred rather
than rejected, with the costs written down in TRD §10.8 — the load-bearing one
being that root types are never reclaimed, which is the bound TRD §4.5 rests on.

**The initial bundle is 300.3 kB gzipped**, of the 350 kB §12 budget — up 5.7 kB
from Phase 2, none of which is the provider itself: `y-websocket` is a 2.3 kB
lazy chunk, and what landed in the initial bundle is the `lib0` and `y-protocols`
modules it shares with code that was already there.

### Decisions carried from Phase 2

**Cards are markdown list items when serialized.** TRD §9 says "collections
serialize as lists of cards separated by blank lines." Read as blank-line
delimited blocks that is ambiguous the moment a card contains a blank line —
which it can, since the split gesture is three returns and two of them leave one
behind — and §11 requires `compact → parse` to reproduce arbitrary collections
exactly. Writing each card as a list item makes card boundaries the only lines
at column 0, whatever the card holds. The alternative was to forbid blank lines
in cards by dropping the split threshold to two, which would make the storage
format depend on a number the PRD explicitly calls a tunable.

**A day is materialised when you look at it, not only when you write.** A
`Y.Text` has to exist before an editor can bind to it, so opening a day creates
it. Days you never navigate to still occupy nothing, which is the property TRD
§4.2 was protecting. Binding on the first keystroke instead would lose that
keystroke or need a second editor to catch it.

**Day materialisation is a system-actor write.** It has to be: deleting a
`Y.Map` deletes everything under it, so if the day map belonged to the human's
first write, undoing that write would take the whole day with it — including
anything added since, by anyone.

**Done reads newest-first; Next and Scheduled do not.** A record you only ever
append to is read from the top, and the thing you just finished is the thing you
want to see. Next and Scheduled are ordered by intent rather than by time, so an
arrival goes to the end and the order stays yours. The compose field stays at
the foot of Done, where PRD §4 puts it — worth a second look on a real device,
since typing at the bottom now produces a card at the top.

**Reading order is not storage order.** `DISPLAY_SECTIONS` is what the day panel
renders; `SECTIONS` is what the serializer writes and what every iteration over
a day's contents takes. Keeping them apart is what stops rearranging the layout
from changing the file format.

**A card move is its own undo step.** `Y.UndoManager` merges transactions that
land within half a second, which is right for typing and wrong for a move:
pressing Done a moment after typing a card would otherwise make one undo revert
both. Every structural operation brackets itself with `stopCapturing`.

**Card content has one canonical home.** Collections order stable card IDs;
the corresponding content and current collection location live in separate
root maps. This keeps the no-date-on-card rule while making a concurrent move
resolve to one visible location without copying or losing a simultaneous edit
to the card's `Y.Text`. Existing Phase 2 documents migrate from embedded cards
to this schema when opened.

**Dates are Temporal, with a ponyfill for now.** A day key is a calendar date
with no instant behind it, and `Date` has no type for that — every operation on
one has to be talked out of applying a timezone. `Temporal.PlainDate` and
`Temporal.PlainDateTime` say exactly what is meant. Neither Chromium 141 nor
Node 22 ships Temporal yet, so `temporal-polyfill` stands in behind
`src/lib/temporal.ts`, used as a value and never installed on `globalThis`. It
costs about 21 kB gzipped (the initial bundle is 300.3 kB of the 350 kB §12
budget); when the platform ships the API, deleting one import is the whole
migration, and `test/seam.test.ts` keeps that true.

**Export ships now, import does not.** Not named in the phase list, but the
serializer exists for compaction, the exit criterion is two weeks of real data,
and until sync exists the export is the only backup (TRD §10.5). Import needs
the same parser, which is tested, plus file handling and a merge policy; it can
wait for a phase that has a reason for it. _Sync does not change this: the relay
is a pipe, not a backup, so the export is still the whole backup story._

### Deliberately not built, as of this era

_From the README's "Not in this phase" section, migrated with the rest._

**No presence chrome.** Awareness carries the local actor and device and `yCollab` already consumes it, so
two of your own devices editing at once is the two-cursor case and it works. What is deliberately absent is
anything built _on top_ of that: no presence panel, no "also editing" chrome, no avatars. PRD §11.3 asks
for none, and one person's two devices are rarely both in front of them.

**Also absent at the time:** the SQLite search index, the command palette, a full calendar picker, import,
presence UI and agents. _The phase assignments this section carried are superseded — see
[sequencing.md](./sequencing.md) for the dependency order that replaced them, and note that the in-memory
search index has since displaced the SQLite one (PRD §10, Phase 4)._

---

## Era: PRD v9 / TRD v8 — the current documents

**The journal starts here.** Entries below carry their own date and commit, and their section references
resolve in PRD v9 and TRD v8 as they stand.

**Two decision records sit outside this file, deliberately.** [sessions.md](./sessions.md) holds the
product and architecture dispositions that the PRD and TRD consolidate, and
[sequencing.md](./sequencing.md) §5 holds the sequencing and cutover decisions — including the three that
are settled (§5.1–§5.3) and the one that is open (§5.4). Neither is migrated here: `sequencing.md` cites
its own §5 throughout, and moving those entries would break the document that depends on them. This file
is for implementation decisions taken while building.

**An entry that describes its own change** names the commit it was written against and the branch carrying
it; the merge commit is added when it lands. The base commit is what `Orientation` needs anyway.

### Project state moves out of the README and into four purpose-specific files

**Date:** 2026-08-18 · **Commit:** `e4969a0`, on `claude/docs-tracking-structure-7c6b31` · **Against:** PRD v9 / TRD v8

**Orientation.** The README had accumulated four jobs: it announced the current phase, explained how to run
the project, indexed the codebase, and carried the decision record. Three of those decay on different
schedules and the fourth should never change at all, so every one of them was wrong at once. It opened
with "**This is Phase 3: sync**" and an exit criterion citing `PRD §13`, at a point where PRD v9 had
renumbered phasing to §10 and `sequencing.md` had replaced the phase ordering with a dependency order. It
reported the initial bundle at 300.3 kB; the build measured 306.2 kB the same day.

**Decision.** The README keeps only what the app is and where to look. The rest splits by how fast it
decays: [development.md](./development.md) for running the project, [codebase.md](./codebase.md) for the
map and the standing departures from the TRD, this file for decisions, and
[progress.md](./progress.md) plus [completed.md](./completed.md) for state.

**Four files rather than one**, because they have incompatible write rules and merging them means the
loosest rule wins. Decisions are append-only and never edited. Completed work is append-only and never
edited. The active slice is _overwritten wholesale_ whenever the slice changes — it is the one file that is
supposed to lose its history, because a to-do list that accretes is a to-do list nobody reads. Keeping
those in one file would either freeze the working document or make the record editable.

**The cost, accepted:** six documents in `docs/` instead of two, and a reader who wants the whole picture
now follows pointers. The alternative kept one file that was reliably out of date, and the failure mode of
a stale README is that a reader believes it.

### "Now" stops being a stage in the sequencing plan

**Date:** 2026-08-18 · **Commit:** `e4969a0`, on `claude/docs-tracking-structure-7c6b31` · **Against:** PRD v9 / TRD v8

**Orientation.** `sequencing.md` opened its stage table with a stage called **Now** — select the storage
scope, build the latency harness, book both design reviews. As a description of the first work it was
right. As a row in a permanent document it was a trap: "now" is true on the day it is written and false
immediately after, and nothing in the document would ever say so. Stage 1 would begin and the table would
still read **Now**, with no way to tell whether the reviews had been booked.

**Decision.** `sequencing.md` describes **Stage 0**, which is a body of work with an exit condition like
every other stage, and says nothing about whether it is currently running. Current status moves to
[progress.md](./progress.md), which is allowed to be wrong for a day and is rewritten rather than amended.

The plan keeps what it is good at — what has to exist before what, and why — and gives up the one claim it
could not maintain. **The critical-path warning survives the move**: §4 still says that a review booked
late becomes the critical path, because that is a property of the dependency order and not of the date.

### The performance budget history is checked in, and seeded before encryption lands

**Date:** 2026-08-18 · **Commit:** `e4969a0`, on `claude/docs-tracking-structure-7c6b31` · **Against:** PRD v9 / TRD v8

**Orientation.** `scripts/check-budget.mjs` enforces one of TRD §12's fourteen rows — initial JS — and
enforces it well: build-failing, on every build. But it prints the number and forgets it. The trend lives
nowhere, so a regression is visible only as a threshold crossing, and by then it has no author. Every
latency row has no harness at all. `sequencing.md` §3.1 asks for a baseline taken **while the store is
still plaintext**, on the argument that Stage 1's encrypted store will absorb a key-store read, an unseal
and per-record decryption into cold start, and that without a recorded before-number the regression is
"both invisible and unattributable".

**Decision.** [performance.md](./performance.md) is an append-only measurement history, checked in, one row
per measurement with the commit that produced it. It is seeded now with the one number that has a harness —
**306.2 kB of the 350 kB budget** at `e4969a0` — and lists every other budget row explicitly as _no
harness_, so the gap is a visible absence rather than a silent one.

**Seeding it now with one real row is the point.** The file's value is entirely in having a plaintext
number recorded before the encrypted store exists, and that window closes at Stage 1. A history started
afterwards can show that cold start is 3 s but not that it used to be 1.2 s.

**The cost, accepted:** a file that must be appended to by hand until the latency harness exists, and which
will be forgotten at least once. That is worth less than the baseline is.

### Membership repair is called _unfiled_, so `recovery` can mean one thing

**Date:** 2026-08-18 · **Commit:** on `claude/project-next-steps-e36a77` · **Against:** PRD v9 / TRD v8

**Orientation.** Selecting TRD §15 row 14 — the recovery code's entropy — put the words `R_priv`,
_recovery envelope_ and _recovery code_ next to a tree in which `recovery` already meant something else
entirely. `RecoveryCard`, `recoveryCards`, `recoverCardTo` and `RecoveryPanel` were the **membership
repair** surface: cards retained because no collection can currently show them. A third use had also
appeared without anyone choosing it — `persistence.ts` called the synchronous write-ahead log a _recovery
journal_, while row 2's selection and its commit both call it the **crash journal**.

So one word carried three unrelated meanings, none of which was wrong on its own, and Stage 4 was about to
make the most load-bearing of them ambiguous. The account sense could not move: _recovery code_, _recovery
keypair_ and PRD §7.7's _four recovery objects_ are standard vocabulary already threaded through the PRD,
the TRD and `sessions.md`, and renaming them would be renaming the domain rather than our code.

**Decision.** The card sense becomes **unfiled** — `UnfiledCard`, `unfiledCards`, `fileCardTo`,
`UnfiledPanel`, the `unfiled-*` classes — and the journal becomes the **crash journal**, which is what its
own selection document already called it. `recovery` now means account recovery and nothing else.

**The verb is the reason for that particular word.** The panel's entire job is putting a card into Next,
Scheduled, Done or Goals, which is _filing_ it, so the noun and the verb come from one root and the copy
reads as an inbox rather than an incident: **Unfiled 3**, _File into Next today_.

**The export filename changed with it, and that is the only one-way part.** The archive now writes
`unfiled.md` rather than `recovery.md` — normative in PRD §8.1 and TRD §9.1. [sequencing.md](./sequencing.md)
§2.1's argument applies exactly: a format change is free before the first deployment carries anyone's data
and a compatibility question afterwards. There is no deployed data, so it was free today and would not have
been after Stage 2.

**The cost, accepted:** a rename touching twenty files and every user-visible string on that surface, taken
for a collision that had not yet caused a defect. It is bought against Stage 4, which introduces the second
meaning into the same tree; the alternative was qualifying every use forever (`cardRecovery` /
`accountRecovery`) and still shipping an archive whose filename said the wrong thing.

**[completed.md](./completed.md) is deliberately not rewritten.** Its 2026-08-10 row still reads "membership
repair, recovery, and local durability", because that is what shipped that day under that name, and a record
that gets retro-edited to match current vocabulary is not a record.

### Every field in an AAD gets a negative that changes that field and nothing else

**Date:** 2026-08-19 · **Commit:** on `claude/project-next-steps-8c0460` · **Against:** PRD v9 / TRD v8

**Orientation.** Selecting TRD §15 row 13 turned up a defect in the shape of the vector files rather than in
any construction: **a negative that changes two things at once tests neither.** `factor`, `principal_id` and
`workspace_id` are bound in the HKDF `info` _and_ in the AAD, so the obvious negative — change the field,
re-derive the key, watch it fail — passes whether or not the AAD binds anything. Deleting `factor` from row
13's AAD entirely left every one of its negatives still failing correctly. Row 13 was fixed by hand and the
rule was written down in [progress.md](./progress.md), which is the file that gets deleted and rewritten;
the same note recorded that **rows 2 and 3 had never been checked against it**, five days before review 3a.

**Decision.** The rule is a convention of record rather than a note in a disposable file: **every field bound
in an AAD needs a published negative that changes that field and nothing else**, named `aad-only-*` so the
group is visible in `must_fail`. All four composition generators were audited against it by removing each
field from each AAD in turn and re-running, and the thirteen negatives that were missing were added —
bringing the `aad-only-*` group to sixteen across the four files.

**What the audit found, and it was worse than the two rows the note named.**

| Construction              | Fields with no isolating negative |
| ------------------------- | --------------------------------- |
| Row 2, journal record     | the label, `workspace_id`         |
| Row 3, content record     | the label                         |
| Row 3, **key envelope**   | **all six**                       |
| Row 13, device-lock seal  | the label                         |
| Row 14, recovery envelope | the label, `principal_id`         |

**Two patterns, and neither was visible from any one file.** The **domain-separation label was untested in
every construction** — the one field whose only job is separation. And row 2's `workspace_id` and row 14's
`principal_id` were untested for exactly row 13's reason, each having a negative that changed the derived key
instead; row 3 had already got that case right, with `wrong-workspace-subkey` and `wrong-workspace-aad` as
separate entries, so the correct pattern was in the tree the whole time and had not been generalized.

**Row 3's key envelope is the finding that matters.** Its only negatives were whole-AAD swaps against the
content record — which change every field at once and keep failing on the structural difference whether or
not any individual field contributes anything. So `purpose` was untested, and `purpose` is the field whose
justification in the generator's own comment is that **§13.4's device credentials share `L_local` and are
otherwise structurally identical to this envelope**. The claim was written down and never exercised. A second
purpose (`device-signing-key`) now exists solely so the substitution it prevents can be performed and fail.

**Each label negative substitutes another construction's real label rather than a nonsense string**, because
that names the confusion the label actually prevents. Row 13's seal AAD and row 3's key envelope are the
sharpest case: both are six length-prefixed fields with `principal`, `workspace` and `v` in the same three
positions after the label, so the label is the whole of what separates a device-lock seal from a key
envelope — and row 13's seal is now offered row 3's envelope label and must fail. Row 3's two carriers are
crossed against each other, and row 14's envelope against row 13's device-lock label, since both seal a key
under a 125-bit generated code.

**Row 2 is the exception and gets two**, because it has no other construction's label to borrow inside its own
file: one substitutes its own HKDF label, which is what a single constant reached for twice produces, and one
renumbers it. The second matters because **that construction has no separate `v` field** — its label is the
only cryptographic binding of its version, and `wrong-version-prefix` tests the `"2:"` prefix by parse rather
than by tag.

**Rows 2 and 14 also gained the published-versus-asserted reconciliation** that rows 3 and 13 already had.
Row 2 established that a `must_fail` entry which quietly stops failing is worse than no entry, and then never
checked the converse — that every published entry is actually run. Sixteen new entries is exactly when that
gap starts to matter.

**The cost, accepted, and it is the honest limit of this entry.** The audit was performed by mechanically
removing each field and re-running, but **that procedure is not in the build**: `pnpm vectors:check` proves
every published negative still fails, not that the set of negatives covers every bound field. A future
construction can still arrive with an untested field and a green check. Making the mutation pass automatic is
the obvious follow-on and is deliberately not taken here — it is a change to how every generator is
structured, and Stage 0 is five days from a review that reads these files as they are.

### The browser support floor is Baseline newly available, and it does not answer either question that wanted it

**Date:** 2026-08-19 · **Commit:** on `claude/project-next-steps-8c0460` · **Against:** PRD v9 / TRD v8

**Orientation.** Two selection rows independently recorded the same gap and both asked for it to be closed once
rather than twice: row 1 could not verify that Ed25519 is available, and row 13 could not verify that WebAuthn
PRF is, because the project had never written down which browsers it supports. `docs/development.md` names a
Playwright profile, which is a test target and not a floor. So "shipped across the current engines" and "where
available" were both doing work that no document defined, five days before a review that reads both records.

**Decision.** The floor is **Baseline _newly available_** — supported in the current stable release of Chrome,
Edge, Firefox and Safari, desktop and mobile — rather than _widely available_, which is the same bar thirty
months later. There is no installed base to strand, so the stricter floor costs nothing; it keeps the design out
of polyfills for capabilities the platform is about to supply, which was already one of §13.10's selection
criteria; and it **bounds the device population from below**, which is the only thing §12's low-end journal
budget can be argued against now that the handset it names will not be acquired.

**The floor does not resolve either question that asked for it, and that is the finding.** Baseline tracks
`web-cryptography` as a single feature, widely available since 2015 — a decade before Ed25519 was in it — and has
no per-algorithm entries. It tracks `webauthn` as a single feature since 2021 and has **no entry for PRF or for
any WebAuthn extension**. So the rule both rows wanted written down answers the platform question and neither of
theirs. TRD §10.11 therefore carries a second rule: where Baseline does not resolve a capability the design
depends on, the floor is stated for that capability specifically, with its evidence and the date it was taken.

**Ed25519 clears the floor** — Chrome and Edge 137, Firefox 129, Safari 17.0 on desktop and iOS — so the fallback
path an earlier §13.10 anticipated is not a state that exists, and there is nothing to select for it.

**PRF has no floor to state, and that is a result in the design's favour rather than an obstacle.** Its
availability is not a browser version but a matrix of operating system, browser and authenticator kind, and
roaming authenticators cannot be reached from iOS or iPadOS at all, because the platform does not pass extension
data to external keys whatever the key supports. Row 13 had already made the generated code the root and the PRF
output an additional seal of the same key, on the argument that PRF's optionality must not become a product
branch. **A design that had made PRF the root would need a floor that does not exist.** The gap was real and
closing it strengthened the construction instead of qualifying it.

**The cost, accepted.** The floor is a statement of intent and a record of evidence, not a test: nothing in the
build asserts Ed25519 is present, and row 1's owed item is therefore only half closed — the floor is written, the
primitive is still unchecked against it. Signatures are first used in Stage 4 and that conformance test belongs
there. **_Newly available_ is also a moving bar**, so the section is dated and will need re-reading rather than
trusting, which is why the evidence is recorded beside the rule instead of behind it.

### The journal budget is exceeded at 4 kB, and that is a Stage 1 defect rather than a revision

**Date:** 2026-08-19 · **Commit:** on `claude/project-next-steps-8c0460` · **Against:** PRD v9 / TRD v8

**Orientation.** TRD §12's `< 1 ms p95` journal budget was specified on a low-end device and had never been
measured on one. A browser benchmark closed the Node caveats but could not supply the budget's own
statistic — a p95 of one write — because CPU throttling stalls the thread and its stalls become the tail. A
Pixel 9a on the tailnet supplied it. **The budget is met at the payloads the journal actually sees and
exceeded by about twice at 4 kB**: 145 µs and 295 µs at 18 and 419 bytes, and **1 930 µs at 4 kB**.

**The result is not an artifact, and both ways it could have been one were checked.** Every level reproduces
within 1.4% across two independent runs. Sizes are measured smallest-first, so the largest payload is also
the latest and a warming phone would look exactly like a payload effect — so the runner now repeats the 18 B
and 4 kB seals at the end. They came back 7% and 2% slower, well inside threshold. The 4 kB figure is the
payload.

**Decision.** **Record it as a defect Stage 1 must answer, not as a budget revision.** [performance.md](./performance.md)
already offers the revision route — a budget is met or consciously revised — and this deliberately declines it
for now. Large pastes and unusually large documents are outside what the specification currently considers,
and they will have to be treated eventually; deciding the budget's payload qualifier before that thinking has
happened would be settling the easy half of a question whose hard half is still open. **The caveat is recorded
with the defect: a specification revision may turn out to be the right answer, and this is not a finding that
it is not.**

**What Stage 1 inherits, therefore, is a defect with a known cause and no known fix.** The journal write is
synchronous by construction, WebCrypto is async, so no hardware-accelerated route exists — TRD §10.10's "one
new primitive, and it is on the crash path", now with a number against it.

**The emulated profile was not conservative, it was wrong, and that is the transferable finding.** The 4×
CPU throttle predicted 265.7 µs at 4 kB against an actual 1 498.3 µs — understating by 5.6× — and understates
the common case by 2×. It would have let this breach ship. The ratios say why: against desktop the phone runs
the **cipher** 12×, 19× and 43× slower as the payload grows, while the **base64-and-storage** path runs only
1.3×, 2.3× and 5.3× slower. **A phone is not uniformly N× slower**, which is precisely what row 2's
extrapolation assumed when it reasoned from a 128× margin. Pure-JS arithmetic degrades on a phone; paths that
reach native code do not. No single scalar could have predicted this, so no amount of care with the
extrapolation would have caught it.

**The cost, accepted.** A budget that is currently exceeded is carried into review 3a rather than resolved
before it. That is the intended trade: the reviewer reads a measured breach with a known mechanism, which is a
better artifact than a budget quietly revised to fit the first number that failed it.

### The AAD coverage audit goes into the build, by eliding each field and watching the negatives

**Date:** 2026-08-19 · **Commit:** on `claude/project-next-steps-cc23b5` · **Against:** PRD v9 / TRD v8

**Orientation.** The entry above that adopted the rule — every field bound in an AAD needs a published
negative that changes that field and nothing else — closed by naming its own limit. The audit behind it had
been performed by hand, by removing each field from each AAD in turn and re-running, and that procedure was
not in the build. `pnpm vectors:check` proves every published negative still fails; it cannot see a field that
no negative ever touches. The follow-on was deliberately declined at the time on the grounds that it changes
how every generator is structured and Stage 0 was five days from a review that reads those files as they are.

**Decision.** **Take it now, and mechanize the hand procedure rather than a proxy for it.**
`scripts/check-aad-coverage.mjs` runs each generator once per bound field with that field removed from the
AAD, at seal time and open time alike, and watches which negatives stop failing. A negative that stops failing
differed from the base vector in that field and nothing else, which is what _isolating_ means; a field where
none stops failing is bound by the construction and tested by nothing. It is wired into `pnpm vectors:check`,
so it is inside `pnpm check`.

**A cheaper structural alternative was considered and rejected.** The AAD encoding is injective, so the
published AADs could be parsed and compared field by field with no cryptography at all. It is faster and it is
weaker: it counts a negative that changes the derived key _and_ one AAD field as isolating that field, which
is exactly the confusion that produced the rule — row 13's `factor` was bound in the HKDF `info` as well, and
its obvious negative passed whether or not the AAD bound anything.

**The converse is checked too, because it was free once the first was.** A negative named `aad-only-` must be
rescued by exactly one field. One rescued by none is isolating nothing — it is failing on a wrong key, or on a
second field it also changes — and its name asserts the opposite. That is the original defect, and it now
fails the build instead of waiting for someone to notice.

**Generators are discovered rather than listed**, by glob over `scripts/generate-*-vectors.mjs`, and one that
does not report its constructions fails the audit. A hand-maintained list is precisely how the next
construction would arrive untested, which is the thing this exists to prevent. The suite generator has no AAD
composition and reports that emptiness rather than staying silent, because silence and omission are otherwise
the same signal.

**It agrees with the hand audit**, which is the only result available on the first run: 27 fields across five
constructions, each isolated by a published negative. Both failure shapes were confirmed by injecting them —
a new AAD field with no negative, and an `aad-only-` negative rewired to fail on a wrong key. **No published
vector changed**; all five files regenerate byte for byte, which was the constraint worth keeping three
working days before review 3a reads them.

**The cost, accepted.** Four generators now route their AAD field lists through a shared module, so the field
_names_ live one indirection away from the encoding, which stays in the file a reviewer reads. Each audit is a
subprocess, because a generator seals and asserts in one pass and re-running a mutation means re-running the
process; 31 node starts is 0.3 s wall clock against the eight-way pool, which is cheap enough to sit in
`pnpm check` without anyone weighing whether to skip it.

### The finalization shape is a per-credential chain, and §7.5's three candidates were two

**Date:** 2026-08-19 · **Commit:** on `claude/project-next-steps-742b29` · **Against:** PRD v9 / TRD v8

**Orientation.** Stage 0's item 2 — drafting review 3b's scope — was the only body of work left in the slice
and the one [sequencing.md](./sequencing.md) §4 names as most likely to become the critical path. §15 already
said which rows to take first: row 5, because revocation's guarantee against a hostile relay was
specified-but-not-designed, and row 11, because it changes what 3b is reviewing. §7.5 listed three candidate
shapes for row 5 and called the middle "the closest fit", which is a preference rather than a construction.

**Decision.** **An append-only per-credential accepted chain of SHA-256 links, with service-signed heads
amortized over a batch.** `final: true` on a head is the finalization boundary. A separate acceptance-signing
key `K_accept`, certified by the authorization key in the epoch, because evidence is required before a client
applies anything and whatever signs heads is therefore on the delivery path — the key that admits and revokes
credentials should not have to be there.

**The three candidates turned out to be two, and that reframing is the useful part.** Writing the shapes side
by side shows that the checkpoint-plus-suffix candidate _is_ the chain with a checkpoint carrying the head
vector, and per-envelope receipts are the chain with the chain removed. So the real question was never
three-way: it was whether evidence for position _n_ says anything about position _n-1_. A bag of independent
receipts has the defect that every subset of it is as well-formed as the whole, which is §7.5's own argument
against a numeric high-water mark, one level along.

**The cost, accepted.** Two carriers gain a field — the epoch payload and the checkpoint manifest each carry
the accepted-head vector — and neither is on-disk, so §2.1's deadline does not apply. Thirty-two bytes per
envelope on the wire, one SHA-256 per envelope on the client, no bundle at all.

**Non-equivocation is bounded, and the bound is stated rather than left to be discovered.** The chain is
non-equivocating per credential and within one client's view. A service maintaining two consistent forks and
showing each device only its own is undetectable by cryptographic means alone. What narrows it is that the
epoch binds the head vector, so sustaining a fork means forking the serialized authorization lineage; what
does not narrow it is anything selected here. A transparency log or client gossip would close it and is
declined as a larger commitment than the rest of the design, for a workspace with two devices and one person.
This is §13.5's treatment of rollback applied to the same class of problem — the protection holds within a
view and detects across views rather than preventing forks.

**One thing it surfaced that is not a selection: §12 has no row for the latency this creates.** An envelope
arriving ahead of the head covering it is held, so _remote edit → visible on the second device_ is bounded
below by head cadence, a service parameter. §12's `envelope verify on receipt < 2 ms` measures the client,
which is not where the cost is. That is the shape of budget that gets discovered after it is missed: every
existing row green, the client fast, the product slow.

### The enrollment ceremony is a typed short string, and QR is an accelerator rather than a root

**Date:** 2026-08-19 · **Commit:** on `claude/project-next-steps-742b29` · **Against:** PRD v9 / TRD v8

**Orientation.** §15 row 11 offered a QR code carrying the key or a short-authentication-string check over an
in-band agreement, and noted they are "different protocols, different failure modes". §13.6's second gate is
what either has to discharge: service authorization alone must never cause an existing client to release a
content key.

**Decision.** **A short authentication string over an in-band agreement, with both nonces committed before
either is revealed, five Crockford Base32 symbols displayed on the new device and typed into the existing
one.** The wrap is HPKE base with `info` binding the transcript hash, so a wrap made for one ceremony opens
under no other. **QR is an accelerator of the same transcript where `BarcodeDetector` exists, never a second
protocol** — same bits, same failure mode, no forked security argument.

**QR is declined as the root on row 13's own reasoning, applied a third time.** Row 13 found WebAuthn PRF's
availability to be "a matrix of OS, browser and authenticator kind rather than a version" and concluded that a
capability that ragged cannot be a root. Camera access is the same shape and worse: `BarcodeDetector` is in
neither Safari nor Firefox, so the product would ship a JS decoder against **43.7 kB of gzipped headroom that
row 2's WASM candidate already wants 24.3 kB of** — competing for headroom with the fix for a measured defect.
And the direction is wrong: the device that must be convinced is the existing one, which is the laptop, which
is the device least likely to have a usable camera pointed the right way.

**Typed rather than compared is a real decision and not presentation.** A comparison is satisfied by pressing
the affirmative button, which is what a person enrolling their own phone does. A transcription is not: the
check moves from _did you compare_ to _can you produce_. It costs one input field that row 14 already built,
at one group of five instead of five — so one alphabet, one normalization, one uniformity proof, rather than a
second short-code format invented later that happens to include `O`.

**The commitment is what makes 25 bits mean 25 bits, and the vectors demonstrate it rather than assert it.**
Whoever reveals second and is uncommitted can grind their nonce until the string comes out as they like. The
generator does exactly that with the substituted wrapping key in place and **forces the honest ceremony's
first two symbols in 566 tries**; all five is the same search at 2²⁵, which is seconds. Without commit-reveal
the string carries zero bits against a service that speaks second, and zero is the arithmetic rather than a
rhetorical flourish.

**The strength is per admitted credential, not per attempt**, which is what makes 25 bits enough: a mismatch
refuses the enrollment and spends the credential, so a second attempt is a second admitted credential and a
second visible failure in front of the person who just watched the first one. That requires the refusal path
to reach the authorization service rather than merely close a dialog, and Stage 4 owes that.

**The cost, accepted.** Enrollment needs both devices awake, where §13.7's rotation is deliberately
store-and-forward. That asymmetry is the price of an out-of-band channel made of a person looking at two
screens, and the escape hatch is already in §13.6's gate 2 — an independent recovery factor needs no second
device.

### The envelope carries one position, because row 5 cannot verify anything otherwise

**Date:** 2026-08-19 · **Commit:** on `claude/project-next-steps-742b29` · **Against:** PRD v9 / TRD v8

**Orientation.** §7.4 had already settled the envelope's hard part as a product constraint — clear routing for
the relay, the actor inside the seal, one signature over both — so row 4 looked like an encoding task with
row 3's conventions to inherit. Two things in it were not.

**Decision.** **Two bound field lists rather than one, and `seq` as a single number meaning both the
credential's outbound position and its accepted position.**

**The second list exists because the first structurally cannot reach two fields.** The nonce is the AEAD's own
input and the digest is a function of the ciphertext the AAD helps produce, so neither can sit inside the AAD —
and both are cleartext a reader trusts, which is precisely what row 3's rule says must be authenticated. The
signature is what covers them, so its message is a separate list rather than the header repeated, and the
negatives come in two families: a header differing from what was **sealed** is one attack, differing from what
was **signed** is another.

**The one number is forced by row 5 and would have been a mistake to decide on its own merits.** Row 5's first
client rule is _verify a head against the link you replayed yourself_, and a client can only replay unaided if
it computes each chain position itself. A service-assigned position would mean it cannot verify anything until
told where its own writes landed — the exact trust the rule exists to remove. **Two numbers would quietly undo
row 5**, and nothing local to row 4 would have shown that.

**The cost, accepted.** A client cannot skip. A refused envelope stalls that credential's chain until it is
re-minted at the same position; what is stuck is the position rather than the bytes, and the case where it
cannot be re-minted is a revoked credential, whose chain is finalized anyway. In exchange `seq` also bounds the
12-byte random nonce's per-generation budget in one comparison, which is §6.1's argument transferring unchanged
and conservatively.

### Chain-head discovery narrows what brand-new means, and states what is left

**Date:** 2026-08-19 · **Commit:** on `claude/project-next-steps-742b29` · **Against:** PRD v9 / TRD v8

**Orientation.** §13.5 records that a brand-new client trusts the service to identify the current head and that
no mechanism fixes it. That was a footnote about fresh installs until the accepted chain was selected, at which
point the whole finalization guarantee came to be stated relative to a head the client believes.

**Decision.** **Narrow what _brand-new_ covers, then bound what is left — and do not present either as a fix.**
Two of the three arrival paths turn out not to be brand-new at all. A device enrolling through §13.6 is talking
to one that already knows where the lineage is, so **row 11's transcript is amended to bind the epoch head** and
the five typed symbols now authenticate that too. A device restoring from a user-held migration package has an
anchor from outside the service for the same reason, and §14.2 gains that requirement. What is left is recovery
with no surviving device, and it gets a **nonce-bound signed head assertion**.

**The nonce buys a boundary rather than a guarantee.** It does not stop a service holding the authorization key
from signing whatever it likes. What it removes is the standing artifact: without it, an assertion is signed
once and re-servable forever by any relay, cache or intermediary, so **replay requires no key at all**. With it,
replay requires the authorization key — which moves the residual from _anyone in the path_ to _the
authorization service itself_. That is the same move §7.5 makes, and it is the pattern this design keeps
reaching for: not eliminating a trusted party, but shrinking the set until only the one already named remains.

**The residual is bounded by §7.5 rather than by anything invented here.** Revocation is atomic with rotation,
so **a hidden revocation is a hidden generation**: a device served a stale head is served a stale key and cannot
read anything written since. The attack cannot present a stale authorization state and current content at the
same time; it degrades to a partition, which is availability, and whose symptom is exactly what a person running
a recovery is looking at. **It is weakest on a workspace quiet since the rotation, and it is a bound rather than
a guarantee.**

**Three narrowings were declined.** Two independent sources, because §16 has one operator behind both and
§11.3 test 9 exists because the provider account is a single failure domain. A user-held fingerprint the person
compares, on row 11's own reasoning and worse — on this path there is nothing to compare against. Binding the
head into the recovery envelope, which is impossible rather than unwise: the envelope is sealed once at account
creation and the head advances, which is why no static user-held secret can carry freshness.

**Amending row 11 one commit after selecting it was the cheap moment and is recorded as such.** Nothing has been
built, so it cost a regenerated vector file and a changed short string. After the first deployment it would have
cost a protocol version.

**And the coverage audit earned itself again, on the field this row exists for.** The obvious replay negative —
offer a device an assertion answering another device's nonce — fails on a string comparison between what was
sent and what is carried, **which fails whether or not the nonce is signed at all.** It was testing the client
rule and nothing about the binding. The isolating negative rewrites the carried nonce to match so only the
signature can refuse it, which is also the actual attack, since an unsigned nonce could simply be overwritten in
transit.

### Attribution moves into the content root, and the unbounded retention floor closes

**Date:** 2026-08-19 · **Commit:** on `claude/project-next-steps-742b29` · **Against:** PRD v9 / TRD v8

**Orientation.** §15 named rows 8 and 7 as next and said the order was forced: a checkpoint must preserve
attribution, and nothing yet said what that attribution was made of. §13.7 had a candidate family and a warning
that the obvious shape — copying an original envelope signature beside a newly assembled tuple — does not work,
because that signature authenticates the original envelope rather than the new tuple. §10.4 recorded the cost of
having no answer: **the retention floor was unbounded in practice**, since nothing retires a card and verifying
any claim meant opening the envelope that made it.

**Decision.** **A standing signed claim, minted by the writing credential at card creation, living in the content
root beside the card it attributes.** The record binds the card, actor, actor kind, credential, epoch and a
commitment to the body as created; the writing credential signs the tuple directly.

**Two constraints fix the minting moment between them, which is most of the design.** §13.7 says the claim
cannot be extracted from an envelope later, so it must be signed over the tuple; §7.4 says a source may sign
only its own operations. So the claim is made by its author at the time of the write, and **no checkpointing
device can mint these afterwards** — which is the same rule §7.6 states for checkpoints, arriving from the other
direction.

**The residence is the result, and §7.6 had already written it while talking about something else.** It requires
attribution evidence to be portable workspace material — checkpointed, stored and restored with the workspace,
with no separate channel and nothing the vanished operator must still be alive to do. **Taken literally that
says put it in the content root**, and doing so deletes the separate store, the sixth subkey, the
re-encryption-per-generation machinery and the separate migration path this row was expected to need. §6.1's
trim collapses the store to one state record under the current generation and the records come with it, so
**verifying historical authorship stops requiring historical generations** and §13.7's two retention questions
stop being different sizes — one of them shrank to the other.

**The body commitment is for falsifiability, not unforgeability**, and that distinction is the row's other
useful half. The card id already stops a record being moved to another card. What the commitment adds is a
checkable statement the product currently cannot make: §4.8's attribution answers _who created this_, so a card
rewritten wholesale still shows its creator. `verified` and `exact` are reported separately, and **provenance
mode owes three states rather than two.**

**One binding was declined that row 3's rule would ordinarily take.** The envelope's accepted position is not
bound: verifying it would tie every claim to row 5's chain and therefore force chain retention, and **a binding
whose verification forces retention is not free in a row whose purpose is to reduce retention.** It is also
unnecessary — a record only reaches the content root through an accepted envelope. Row 3's rule is about
costless bindings, and this one has a cost that is not measured in bytes.

**The cost, accepted.** One Ed25519 signature per card creation — not per keystroke, not per update — and about
260 bytes per card. Attribution becomes a constant multiple of what the cards already cost, and retires on
exactly the event §4.5 already names: compaction deleting the card. One trigger rather than two that must agree.

### The checkpoint is a container its producer signs, and nothing inside it

**Date:** 2026-08-19 · **Commit:** on `claude/project-next-steps-742b29` · **Against:** PRD v9 / TRD v8

**Orientation.** §7.6 sets three _must not happen_ rules for the checkpoint, and the third — no checkpoint that
re-signs another credential's operations — is described there as the forbidden shape _"arriving through a
performance optimization"_, which is to say a rule somebody has to remember every time.

**Decision.** **One full snapshot sealed under one generation, plus a manifest signed by the producing
credential** binding the epoch and its head, the generation, the checkpoint digest, `sv` and `ds` separately,
row 5's accepted-head vector and the producer's own name.

**The third rule is discharged by row 8 rather than by anything here, and stops being a rule.** With attribution
as standing records each signed by its own author, sitting in the content the snapshot covers, the producer
signs the container and nothing inside it. There is no step at which anything could be re-signed, so the
forbidden shape is unreachable rather than prohibited. That is the whole justification for taking row 8 first,
and it held.

**Both coverage halves are bound, separately, and the audit is what forced the pair.** §7.6 is explicit that two
replicas can agree on a state vector and disagree about deletions. The first pass had a negative changing `ds`
alone and none changing `sv` alone — **reproducing the exact asymmetry §7.6 warns about, inside the file written
to test for it.** Both are also bound _opaquely_, so §10.1's deferred Yjs v13 → v14 upgrade changes what the
bytes say rather than what this format is.

**One cadence rule is forced and the rest are honestly tunable.** A checkpoint is openable only while its
generation is retained, so **a rotation must produce a checkpoint under the new generation before the old one may
be dropped** — otherwise dropping a key destroys the recovery path in the course of tidying up. It is an
ordering constraint between two operations that look independent, and it is the kind found at a restore rather
than at a review. The other triggers are a position count and an interval whose ground is first-sync cost, and
naming numbers before there is a service to measure would give them an authority nothing supports.

**Retention is at least two, because §11.3 test 8 requires falling back to the next-newest.** A policy of one
makes that test unpassable by construction, which is worth checking a policy against before writing it.

**And the head-vector sort is load-bearing rather than tidy.** Two devices checkpointing the same accepted state
must produce the same digest; a map iterated in insertion order would not, and the disagreement would present as
a corrupt manifest rather than as a canonicalization bug.

### The anti-replay rule needs four conditions and a mark, not five and a log

**Date:** 2026-08-19 · **Commit:** on `claude/project-next-steps-97c4e1` · **Against:** PRD v9 / TRD v8

**Orientation.** §7.5's _must not happen_ list ends with **no second link accepted at a position already held,
however well signed**. Written out as a client rule that reads as a condition needing its own state — a record
of every link ever admitted at every position — and a client that believed it would keep a log growing with
every accepted write, forever, beside a chain the same section says may be replayed from a checkpoint.

**Decision.** **Four conditions**: the envelope verifies; the position is exactly one past the mark; the link is
computed from the link the client itself holds; and a signed head at that position verifies against **that**
link rather than the one it carries. **The fifth is implied and is deleted.** A second envelope at position _n_
can only arrive when the mark is at _n_ or beyond, and the second condition refuses anything that is not exactly
one past it. There is no moment at which a client holding a mark has to consult a history.

**So the carrier is one `(seq, link)` per credential**, in a §6.1 record with `kind: 'heads'` — and that
proportion is the result rather than the rule being weakened. The rule as stated sounds like it needs the log;
what needs it is nothing.

**The mark carries a link and not just a number, and that is the same sentence §7.5 already wrote one level
up.** _A numeric high-water mark is not a finalization boundary_ — and one position down, a numeric mark is not
an anti-replay state either: a client that advanced a counter without keeping what it replayed cannot tell a
chain it walked from one it did not. There is a negative for exactly that client.

**The theorem underneath all of it is published as the first vector.** A chain replayed from genesis and the
same chain replayed from a checkpoint's head vector reach the same link at the same position. It reads as
bookkeeping and it is the entire justification for the retention floors: the chain has no memory beyond its last
link, so **a checkpoint's head vector is a chain state rather than a summary of one**, and replaying from a
checkpoint is the same loop with a different starting value rather than a second code path.

**Row 3 had already paid for the carrier.** It bound `kind` in the record AAD against a stated attack — a
`state` record supersedes everything before it, and IndexedDB properties are editable by anyone holding the
profile — and that binding is what lets a third kind arrive at no cost and what stops a heads record being
reinterpreted as a `state` record and swept into the trim. No sixth subkey, no new format. Row 8 declined a
sixth subkey by finding where its records already belonged; this is that move at a smaller object.

**Two consequences that are not the selection.**

**§7.4's retention depth was one checkpoint too shallow, and the correction needs no protocol field.** It said a
device retains its own outbound envelopes _at least back to the last checkpoint it has seen admitted_. §7.6
retains **two**, because §11.3 test 8 falls back to the next-newest; §14.3 has each device re-envelop its own
suffix from whichever checkpoint it applied. Compose them and the ordinary case breaks: everyone falls back to
the next-newest and a device trimmed to the newest cannot supply its suffix. The fix is that a device counts
two locally — no retention parameter on the wire — and the failure it prevents appears at a restore rather than
at a review, which is where the last three of these have been.

**And the obvious recovery from row 4's stall is what breaks the chain permanently.** Row 4 recorded that a
refused envelope stalls a credential until it is re-minted at the same position, and priced that as a delay. A
client that minted position 7, waited, heard nothing and re-minted over fresher content produces a second link
at a position the service may already have accepted — which every other device refuses under §7.5 and reads as
a compromised credential. **An honest client frames itself, and nothing distinguishes it from the attack,
because there is nothing to distinguish them by.** So _a definite refusal is the only thing that licenses a
re-mint, and a timeout is not one_ is a **must not happen** in §7.4 rather than a note in an implementation.

**One residual is published as a demonstration rather than as a negative, because it succeeds.** A heads record
can be rolled back to an earlier, genuinely sealed one; an AAD authenticates a record and cannot order two valid
ones. It routes into a bound that already exists rather than adding one — exploiting it needs a second link
accepted at a re-opened position, which needs the service to sign one, which is §7.5's stated equivocation bound.
Worth noting that §6.1's _an attacker who can write your journal can write your JavaScript_ does **not** dispose
of it: §13.3's profile-copy attacker never runs the origin's code.

### One package format at three lineage states, anchored where the user holds something

**Date:** 2026-08-19 · **Commit:** on `claude/project-next-steps-97c4e1` · **Against:** PRD v9 / TRD v8

**Orientation.** §15 row 10 asks for _terminal-package and portable cutover-package formats_, plural, and §9.3
describes a fidelity archive with its own contents list. Three artifacts, two of them owed by §14 and one by §9.

**Decision.** **One format, at §13.5's three lineage states** — never established, live, retired — and the TRD
had already said so twice without the sentence being collected. §14.4 does not describe a second artifact; it
describes the service _populating the portable package_: "every participating replica **and the verified
portable package** receive that record plus…". And its offline replica "keeps its last signed **live** head"
until "importing the package later **upgrades** its knowledge" — upgrades, not replaces. §9.3's archive is the
same list minus the parts a lineage would have supplied. The saving is not the format count: it is that §11.3
tests 4, 5, 7, 8 and 9 exercise one code path, and that the state a device is holding is a field it reads rather
than a shape it infers from which parts are present.

**The real work was §14.2 item 1: the old trust root, _bound so it cannot be substituted_.** Every other item in
that list is service-signed, so a forger who supplies their own authorization key can re-sign the epochs, and the
credentials come from the epochs, and row 8's attribution claims verify under the credentials. The result is an
internally consistent package that says whatever the forger likes about who wrote what. **A signature over the
package does not help, because it is signed by something the same substitution replaces.**

**So the chain has to terminate in material the user holds, and §13.8 makes exactly one thing mandatory.** The
recovery code opens `R_priv`; `R_priv` opens the generation wraps. Bind the root in the **HPKE `info` of every
generation wrap** and a substituted root derives a different key schedule, so the wrap opens nothing and there is
no content left to re-attribute. **Two fields in an `info` that had none specified** — no new key, no new
signature scheme, no new secret, and row 14's envelope untouched.

**In `info` rather than in the AEAD's associated data, deliberately.** `info` is never transmitted: a reader must
**supply** the root it believes, so a wrong belief fails to open where an AAD would let the reader take the root
out of the package and fail only to match. Row 11 bound its transcript hash the same way for the same reason.

**Per generation, which §14.1 makes correct rather than convenient.** Migration rotates forward under a new
lineage, so generations written before it stay anchored to the root that was in force when they were written —
which is the root their attribution should be verified against. A per-package binding would have had to pick one
root for material written under two.

**And the anchor is needed by exactly one reader, which is row 9's argument a fourth time.** A surviving device
knows the root from its own enrollment; a device enrolled through §13.6 receives it through the person. Recovery
with no surviving device is the case that asks, and it is the case that must hold the code. **The anchor and its
audience arrive together**, which is what makes the construction available rather than circular.

**Row 8 deleted a part, and that is where the size went.** §14.2 item 3 implied an attribution part with its own
digest, retention rule and disagreement-with-the-snapshot question. With the claims in the content root they are
inside the checkpoint already carried, and all three stop existing — which is what §7.6 had required of
attribution evidence in the first place. Item 4's generations are **not** deleted by it, and the distinction is
worth keeping: row 8 closed the _attribution_ floor, while the package still needs generations to open the
ciphertext it carries, which is §6.1's separate question and §13.7's warning against conflating the two.

**HPKE is implemented in the generator rather than pinned as a string, and that is a change from row 11.** Row 11
pinned only its `info` because its claim was about the transcript rather than the seal. This row's claim _is_ a
binding inside the seal, so a pinned string would be the claim asserted rather than tested and the coverage audit
could not reach it. The generator carries RFC 9180 base mode and **reproduces A.1.1 before using it**, on every
invocation — the same discipline row 2's benchmark used when it bundled a construction that did not exist yet.
A.1.1 is an AES-128-GCM vector against this suite's AES-256-GCM, which is a reason to run it rather than not: the
AEAD identifier is inside `suite_id`, so reproducing it exercises every label, length prefix and schedule step,
and the only thing left unchecked is the constant the file passes for its own AEAD.

**One thing this changes that is not in its scope.** [sequencing.md](./sequencing.md) §5.4 prices migrating the
first deployment through the fidelity archive as _pulls a Stage 5 item into Stage 2_. That price is now smaller
than it was written — the archive is one state of a format Stage 4 builds regardless, so the marginal cost is
that state and an export path rather than a whole artifact. **§5.4 is not thereby decided**: it is one input, the
question is the author's, and its other half is about attribution rather than cost.

### The journal's cipher becomes a compiled wasm module, and the 4 kB breach closes

**Date:** 2026-08-19 · **Commit:** `9b49b74` · **Against:** PRD v9 / TRD v8

**Orientation.** The entry above carried §12's 4 kB journal breach into review 3a as a defect with a known cause
and no known fix: 1 930 µs p95 against a 1 ms budget, caused by pure-JS 32-bit arithmetic rather than by one
library's code shape, on a write that is synchronous by construction where WebCrypto is async. libsodium in wasm
had priced the ceiling at 24× and was 3.4× too large to ship. A Rust-compiled module had been _sized_ at 24.3 kB
gzipped and judged to fit — but **that figure came from an off-the-shelf package exposing only the 12-byte-nonce
construction**, where row 2 selected the 24-byte nonce and the width is load-bearing. `performance.md` said so
plainly and called it a proxy for what the category weighs, not a candidate. Nothing had been built.

**Decision.** **Build it.** `wasm/journal-seal` compiles the audited RustCrypto `chacha20poly1305` crate to a
`no_std` module with no allocator, no wasm-bindgen, fixed static buffers and one exported `seal`, inlined as
base64 and instantiated synchronously. **The measured result closes the breach at every payload**: on the same
Pixel 9a, in a session that reproduces the JS baseline to 0.8%, the full write is **35 µs, 65 µs and 240 µs p95**
against 1 930 µs, the last with 4.2× of margin.

**The size estimate was wrong by 6×, and wrong in the direction nobody was defending against.** The real module is
6 465 bytes raw and **4.5 kB gzipped through the bundler — 0.7 kB _less_ than the `@noble/ciphers` it replaces.**
The whole WASM question had been framed as buying speed with bytes, and there is no trade: it is faster and
smaller. It is also faster than the ceiling that priced it, at 45.3 µs against libsodium's 51.8 at 4 kB, on
1/34th of the bundle.

**Optimising for size was spending the wrong currency, and the first build got it wrong.** `opt-level = "z"`
reached only 1.17× over `@noble` — a module that would have fitted the bundle and not fixed the defect. Sweeping
the setting showed size barely responds (5.2 kB to 6.9 kB raw across the whole range) while speed doubles. **The
transferable form of this is that a size-first default is a speed decision taken silently**, and it is taken in a
file nobody reads twice.

**Two things §12 asserted are now checked rather than trusted.** Compilation _does_ have a synchronous form:
Chromium caps synchronous main-thread compilation at 8 MB and the module is 6 465 bytes, with instantiation
verified in Chromium, Firefox and WebKit. And the resulting instantiation cost is **not a window** — 1.5 ms paid
inside bundle evaluation, against libsodium's 36.4 ms behind an `await`. The difference is the whole reason an
inlined synchronous module was the only shape worth considering: there is no interval in which the app can accept
an edit the journal cannot write.

**The cost, accepted, is a second toolchain in the trusted path**, and it is left in front of the reviewer rather
than argued away. §13.10 asks for _reviewed and widely implemented_; the crate is both, and the artifact a user
runs is not the artifact anyone reviewed. **That is a criterion question and it is review 3a's**, now the only
item in 3a's scope that is not a construction. What could be done about it was done: the crate is pinned, the
module regenerates reproducibly, and `pnpm wasm:verify` runs inside `pnpm check` against
draft-irtf-cfrg-xchacha-03 §A.3.1 and row 2's composition vectors — so an artifact computing something other than
XChaCha20-Poly1305 fails the build rather than shipping. **The check verifies the generated module rather than the
crate's build output**, so it needs no Rust toolchain and the thing checked is the thing that ships.

**One platform dependency is added, and it fails hard rather than degrading.** `+simd128` is what takes the module
past libsodium, and a SIMD module _fails to instantiate_ where SIMD is absent. It is inside §10.11's floor — wasm
SIMD is Baseline from Safari 16.4 against that floor's binding constraint of Ed25519 at Safari 17.0 — so there is
no fallback state to design, but it is a floor commitment and is recorded as one.

**What this does not settle.** §12's payload qualifier is still open: large pastes and unusually large documents
remain outside what the specification treats, and the previous entry's reasoning for not settling it early still
holds. What has changed is that the question is no longer forced by a failing number. **And the cipher has stopped
being the dominant term** — at 4 kB the write is 240 µs of which the seal is 70 µs, so base64 and `setItem` are
now more than twice the cryptography. Further work against this budget is base64 work.

---

### The slot verifier checks a signature, so there is no secret to stretch and one to substitute

**Date:** 2026-08-20 · **Commit:** `b9ff071` · **Against:** PRD v9 / TRD v8

**Orientation.** §13.10 carried one role as a candidate — "an Argon2id-derived verifier" — and §15 row 12 asked
for the account-credential and slot-verifier construction "including offline-guessing resistance". Read together
they ask how much stretching. **They only ask that if the verifier is a function of a secret held in the profile**,
and interrogating that premise was most of the row. It is the third time a row's apparent question was not its
real one: row 14's "Argon2id or none" and row 13's "PRF- or high-entropy-code-derived" both read as menus until
the thing underneath them was designed.

**Decision.** **The account credential is a WebAuthn discoverable credential, and the verifier checks a signature
rather than a secret.** No stretching, no KDF, no password, and — for the first time in the three rows that have
answered this question — **nothing in the profile to grind at all.** Rows 13 and 14 said _none_ because a
generated 125-bit code leaves no entropy deficit; this row says _none_ because the private key is in the
authenticator and "guessing" the verifier means forging Ed25519.

**§16.1 had already decided half of it, in a table nobody was reading as a selection.** The inventory row says the
service stores "Account authenticator **public material** and slot-verifier parameters", visibility "None — public
material". A password verifier is a server-held secret, not public material. **The inventory foreclosed the
shared-secret shape before the row was asked**, the same way row 2 had already spent the synchronous slot before
row 1 noticed it had one primitive left to choose. The transferable form: _a data inventory is a design
constraint, not a compliance artifact, and it can answer questions the design has not got to yet._

**The clause about offline guessing protects the network credential rather than the slot, which is why it sits in
§13.9.** A grindable local verifier would let a profile holder recover the thing that authenticates to the
service — §13.2 forbids this artifact supplying that offline. The local gate against the person at a shared
keyboard is a lesser and different thing, and §13.3's scoping sentence already applies to it.

**Removing a secret introduces a substitutable public key, and that is where the work went.** The slot index is
IndexedDB — a structured clone whose properties the load path trusts — so an unbound public key is one property
edit from a slot that opens under the attacker's own passkey. Row 3's rule about editable fields applies at a
different store. **Each credential therefore gets a service-signed binding**, verified against the lineage §13.5
already has the client retaining, which makes substitution need the service's private key rather than write access
to IndexedDB. **The gate is then stronger than the custody beside it**: `L_local` yields to anyone who can run the
origin and the binding does not.

**One role can root on the authenticator where §13.3's could not, and the distinction is worth keeping.** Rows 11
and 13 both concluded that a ragged capability cannot be a root. **PRF is an extension; a signature is the core of
the API**, and this row uses no extension at all. Underneath that: the device lock needs _key material_, which
only PRF returns, and this row needs a _proof_. **A signature is checkable offline without being guessable
offline; a derived key is not.** One consequence — one of §13.4's four factor roles turns out not to consume a
factor output, so row 13's reserved `done/slot-verifier-prf/v1` label is now recorded as unused. That cost a
regenerated comment string in a published vector file and no vector value, on row 11's precedent.

**Row 1's agility rule bends here, once, and is preserved rather than abandoned.** WebAuthn credential creation
_is_ a negotiation: the relying party offers an ordered `pubKeyCredParams` and the authenticator picks. So the
suite gains **ES256**, under §13.10's own criteria and on the asynchronous path only, and the offer
`[-8 Ed25519, -7 ES256]` is part of the carrier version. **What replaces _no algorithm field_ is _one algorithm
field, signed, written once_** — frozen at creation inside the binding, so nothing renegotiates afterwards. This
is the first time a 3b row has amended a 3a row, and §15 says so rather than leaving it to be noticed.

**The coverage audit removed a field, on the argument it was built to make.** An earlier draft bound `alg` beside
the public key. `pnpm vectors:coverage` reported it _bound in the AAD and isolated by no negative_, and it was
right: the algorithm is a function of the key encoding, so changing it alone leaves a key that verifies nothing
and changing it consistently changes the key too. **A field that cannot be varied independently is not an
independent binding.** Storing SubjectPublicKeyInfo puts the algorithm inside bytes already bound, and the audit
went from complaining to silent with nothing argued at it. **Two more fields — `rp_id` and `public_key` — failed
for the neighbouring reason**: both are read by the verifier as well as bound in the signed message, so the
obvious negative fails twice and proves neither. Each was fixed by supplying a _consistent_ ceremony for the
substituted value, which is also what the real attacker would do. **`aad-only-binding-public-key` is the negative
this whole row exists to justify, and its first version was passing for the wrong reason** — row 9's finding,
holding a fourth time.

**Which review holds it is answered rather than reassigned.** `progress.md` had carried the question with two rows
pointing at it: the verifier looked storage-shaped and 3a is the engagement with the context. It looked
storage-shaped because _offline-guessing resistance_ implied a secret at rest. There is none. What the row
contains is network-facing throughout, so it stays in **3b** and **3a's closed scope stays closed** — the outcome
worth having with both reviews three working days out.

**What this does not settle.** Whether a usable authenticator deserves a floor statement is offered to 3b with the
measurement it would need (§10.11); the service's challenge-issuance and rate-limiting semantics join the two
things row 14 §5 already handed over; and account-credential recovery is deliberately unspecified, because
§13.8's four-object table is what lets it be ordinary — **email can restore an account and can never restore a
content key**, which is the same separation that makes the recovery code mandatory.

---

### An interrupted transition must not be able to read as a completed lesser one

**Date:** 2026-08-20 · **Commit:** `4259822` · **Against:** PRD v9 / TRD v8

**Orientation.** §15 row 15 asked for "interrupted-rotation and downgrade behaviour", constrained to "fail closed
without changing the confidentiality promise (§11.2 test 11)". Test 11's list reads as five unrelated failures:
unsupported PRF, interrupted enrollment, duplicate recovery, concurrent authorization changes, a half-completed
account deletion. Written out side by side they are one shape.

**Decision.** **One intent-and-outcome protocol at three kinds** — `rotate`, `replace-recovery`, `retire` — because
every item in that list is a multi-step transition **whose interrupted middle can be mistaken for a completed
_lesser_ transition.** A rotation that did not settle reads as no rotation being needed; an unsettled revocation
reads as still authorized; a deliberate downgrade reads as account deletion. **So _fail closed_ is one property
rather than five**: the intermediate state must be representable, distinguishable and resolvable, and must never be
a valid representation of an endpoint. Three constructions would have argued the same argument three times and got
it right two of them.

**PRD §6.10's sentence turned out to be a binding requirement rather than interface guidance.** _Deliberate
downgrade is the same mechanism, and it must not silently become account deletion_ reads as a warning about a
screen. A `rotate` and a `retire` intent are **the same eight fields** — same workspace, lineage, parent epoch and
target — differing in `kind` and in the payload it selects, so an unbound `kind` is a way to submit one and commit
the other. **Row 3 found this about a `StoredRecord`'s `kind`** and the trim path; this is that finding at a third
object, one level larger: there a store deletes its own history, here a lapse retires a lineage that §13.5 says
stays live. The vectors publish both messages with the byte at which they first diverge, because the claim is
easier to believe as a diff than as an assertion.

**Row 6's outbound rule extends by one case, and the new case is why the answer must be signed.** Row 6 had two
states — a definite refusal licenses a re-mint, silence does not. A transition has three, because it carries an
**exclusion set**: the loser of a concurrent rotation must _discard and rebuild_, never resubmit, since its
exclusion set was computed against an epoch that has moved and resubmitting would revoke the wrong credential.

**That closed a gap row 6 left, and left by its own rule rather than by oversight.** Row 6 never said where a
definite refusal comes from. For an envelope the cost of a forged one is bounded. **Here a fabricated _superseded_
outcome makes an honest client discard a live content key** and rebuild against an epoch the attacker timed;
repeated, it is a rotation that never completes, so a credential the owner is excluding stays able to read while
the interface reports progress. **That is test 11's confidentiality promise changing silently, achieved with no key
material at all.** So the outcome is signed by the lineage authorization key and **everything that is not a
verified outcome is silence** — a timeout, a reset, an unsigned error body. Folded back into §7.4 beside row 6's
rule, which is where an implementer will look.

**A client that cannot reach the service stays pending, and that is the fail-closed direction.** Timing out and
rebuilding is the same attack performed by the network instead of by an attacker. It is a liveness cost and it is
taken deliberately.

**The rotation promise is narrower than the obvious one, and PRD §6.5 was not quite right.** _Removal governs the
future, never the past_ omits the propagation window: a device that has not observed the commit keeps writing under
the old generation, §11.2 test 6 requires admitting a late old-epoch update from a still-authorized offline device,
and an excluded credential can read those writes. **It cannot be closed without a device refusing to accept edits
while it is unsure whether it is current**, which is §7.1's rule inverted and PRD §2.3's promise with it. So the
honest form is written into both documents: _from the moment a device learns of the revocation, what that device
writes is closed to the removed one_, with the window bounded by that device being out of contact.

**Two fields are absent for the third instance of one rule**, and it is now a rule rather than a coincidence. No
`from_gen`, because §13.5's epoch already binds the current generation. No `state` flag, because whether a client
won is `committed_id == its own id`. Row 10 left out a part count and row 12 an algorithm field on the same
argument: **a second binding of a derivable fact is a thing that can disagree with it**, and an implementation
reading the flag rather than comparing would discard a live key.

**Row 7's cadence rule is violated by exactly this class.** _A rotation must produce a checkpoint under the new
generation before the old one may be dropped_ is easy to satisfy in the happy path and easy to break in the
interrupted one, because the obvious implementation clears the obligation when the epoch commits — which is before
the checkpoint exists. The retention condition is therefore three rather than one, and row 7's warning that its
rule is found at a restore rather than at a review is what makes writing the third one down worth doing.

**The coverage audit refused three passes, and the third is a new failure mode worth recording.** Four intent
negatives failed twice because the settlement rule compares four fields across both messages — **row 12's fix,
needed a second time**, which settles that a field read on both sides of a comparison is the ordinary case rather
than an unusual one. Then `aad-only-outcome-committed-id` was rescued by _two_ fields: the substituted id was the
rival rotation's, and the rival differs from the base intent in `payload_digest` alone, so eliding that one field
made the two ids equal and the negative passed for a reason unrelated to the signature it was testing. **A negative
built from a near neighbour is isolated by the neighbourhood.** The fix is to substitute an object two fields away,
and the tell is a rescue list with an unexpected second entry rather than an empty one — which the audit reports
but does not name.

**What this does not settle.** Whether the service rate-limits intent submission joins the two service behaviours
rows 12 and 14 have already handed to 3b, and the three are one question about what the account service promises.
How long a pending transition may stay pending before the product says something is copy with a cryptographic floor
of _forever_, and is deliberately not a timeout. And `replace-recovery`'s target counter is treated as
client-chosen and monotone, which is enough for at-most-once and leaves two devices able to race to counter 1 —
resolved by the same three-way rule, at the cost of one wasted keypair.

---

### The web-security baseline is ASVS 5.0.0 at L2 as a floor, and the exclusions are the profile

**Date:** 2026-08-20 · **Commit:** `5bd9552` · **Against:** PRD v9 / TRD v8

**Orientation.** §15 row 17 asked which web-security baseline profile and version, constrained by §10.9 and by
§13.11's level 2, which wants "a recorded profile and repeatable verification of every applicable requirement".
It reads as picking a name and a number, and [progress.md](./progress.md) had been describing it that way — a
published profile and a version — while listing it beside two rows that genuinely are not work.

**Decision.** **OWASP ASVS 5.0.0, at L2 as a floor**, plus eight named L3 requirements pulled up, five addendum
controls, and one recorded deviation. 218 of the standard's 345 requirements in scope; 55 excluded with reasons,
two of the three exclusions conditional with a trigger.

**There is one real candidate, and finding that out was the cheap part.** ASVS is the only requirement-level,
versioned, levelled, machine-readable option: the Top 10 is an awareness document with nothing to verify, SSDF is
process rather than product, CIS is infrastructure, SOC 2 and ISO 27001 audit an organisation, MASVS is mobile.
**All of the row's actual content is in the three things a version and a level do not say** — which requirements
apply, what happens where the product cannot satisfy one, and what the standard does not cover at all.

**A level is a floor rather than a profile.** §10.9 already lists the controls that matter here, and in ASVS
5.0.0 they land at L1, L2 **and L3**: external-asset integrity, CSP violation reporting,
Cross-Origin-Opener-Policy and dependency provenance are all L3 in a standard whose L2 most applications take.
So eight L3 requirements are pulled up by name. **Going to L3 wholesale is worse than it looks** — it adds 92
requirements weighted toward chapters this product structurally does not have, producing a higher number and more
unrecorded inapplicabilities, which is the direction that makes a baseline decorative.

**The exclusions are the profile, and one is a tenth of the standard.** V10 OAuth and OIDC is 36 requirements
dropped on one sentence — there is no third-party identity provider anywhere in the design — and that sentence is
written down for exactly that reason. **The assurance value of a baseline is in the exclusions being recorded,
not in the inclusions passing**, and an unrecorded exclusion is how a profile becomes decoration. V6
Authentication is the largest applicability question and is deliberately left for verification, because many of
its requirements are inapplicable **not because the feature is absent but because row 12 chose a shape they do not
contemplate** — and "we do not do that" and "we do something the requirement did not anticipate" are recorded
differently.

**The measurement that decided the shape, and it is blunt.** Searched against the published requirement text,
ASVS 5.0.0 mentions browser storage in **one** requirement and Trusted Types, service workers and offline
operation in **none**. **The standard does not model an application of this shape** — a fact about what it is for
rather than a criticism, since it is written for applications with a server that holds and processes user data,
and here the server is content-blind by construction and frequently absent. So `V14.3.3`, which forbids sensitive
data in browser storage, is **a recorded deviation with a compensating control** rather than a disposition: it is
the one requirement the standard has about the thing this product structurally is, and the product formally fails
it. The honest response is that plus a named addendum, **not a level chosen high enough to look thorough**.

**The addendum was already written, in §10.9**, which is most of the argument for it — five controls the standard
carries at no level, none of them invented here. **A1 is stronger than the requirement it supersedes**: no remote
subresource at all, rather than external hosting with Subresource Integrity, because SRI pins a byte string and
does not remove the party from a boundary that same-origin code is already inside.

**"Repeatable" is the word doing the work, so the profile is generated rather than written.** Chapters are
discovered from a pinned index rather than a list beside it — the argument that made `check-aad-coverage.mjs`
glob for generators; every exclusion needs a reason and every conditional one a trigger; every pull-up must
exist, be genuinely L3 and sit in a chapter that is in scope; every addendum control must cite a section that
exists in the TRD and, where it claims CI verification, name a check that exists. **That last rule bit during
construction**: A4 was written as a Stage 1 CI control with no check named, which was true in spirit and a claim
with no address in fact, and the generator refused the profile until it named the §11.1 test it is waiting for.

**One control is verified now rather than promised**, and it is the one §10.9 names first.
`scripts/check-origin-isolation.mjs` runs inside `pnpm build` and fails if any built file fetches a subresource
from outside the origin. It scans the built output rather than the source, because a dependency that injects a
CDN URL at build time is the case a source scan misses; it was tested in both directions. `check-budget.mjs` is
the precedent for a build-failing check that needs the built artifact.

**The standard is pinned, not fetched, and that is deliberate.** `pnpm check` never reaches the network — a build
step that does turns a third party's release schedule into a build failure. `pnpm asvs:pin` compares against the
published file when someone wants to know. **Identifiers and levels are pinned; requirement text is not**: ASVS
is CC BY-SA 4.0, a derived index of identifiers is what the profile needs, and reproducing the prose would be an
obligation taken on for nothing.

**What this does not settle.** Whether ASVS is the right instrument at all, given the measurement above, is
offered to 3b — and if a reviewer thinks it is not, the alternative is probably _no external standard and a
longer addendum_ rather than a different standard, which is the sort of question level 2 exists to have asked.
The CSP directive set is where A1, A2 and V3.4.3 meet and is a Stage 4 artifact. And the 218 in-scope
requirements are still to be verified, which is level 2's cost rather than this row's: **selecting the profile is
Stage 0 and verifying it is a gate before Stage 4 ships.**

---

### A deferral that outlives its row is checked against the register, not against its own owner string

**Date:** 2026-08-20 · **Commit:** `449db30` · **Against:** PRD v9 / TRD v8

**Orientation.** A separate branch fixed a stale provider name in row 1's vector file: §13.10 had said the journal
cipher was the RustCrypto crate compiled to wasm since `9b49b74`, and `algorithm-suite.json` still published the
pure-JS library it replaced. Bringing that commit into this branch made the same class visible one field over, and
it had three instances rather than one.

**What was wrong.** `SUITE_1` carried the selected roles and `DEFERRED` carried the ones row 1 had passed to a
later §15 row: recovery-code stretching to row 14, the slot verifier to row 12, device-lock derivation to row 13.
**All three rows have since been answered** — 13 and 14 some time ago, 12 in `b9ff071` — and nothing noticed, so
the file went on publishing three roles as unfilled after they were filled. A reviewer opening
`algorithm-suite.json` in the week of the 24th would have read the slot verifier described as _assigned to review
3b, so it is not this row's to take_ by a document that row 12 had already taken it out of.

**Decision.** **`DEFERRED` is empty, the two roles §13.10 carries and this file lacked are in the suite, and
`checkCoverage` reads §15.1 out of the TRD.** A deferred role whose owning row appears in the register's selected
half now fails the build, with the reason spelled out rather than a bare assertion.

**The interesting part is why the old check did not catch it.** It asserted that a deferral _named a row_ —
`/row \d+/` against the owner string. That is a check on the sentence rather than on the claim: a row number
stays well-formed forever, and the thing that goes stale is whether the row is still open. **A fact about another
document, copied here, with nothing checking the copy** — which is exactly what the provider name was, and
finding two of them in one file within a day of each other is what makes the shape worth naming rather than the
instances worth fixing.

**It is the row-17 rule arriving from the other direction.** That row required every addendum control to cite a
section that exists in the TRD, and refused the profile when one claimed a check with no address. The same
argument applies to a deferral: a claim about §15 is checkable against §15, and anything less is a comment.

**What it cost:** two roles added to the suite, both answering _none_ — credential stretching from rows 13 and 14,
slot-verifier stretching from row 12 — and one read of `docs/TRD.md` in a generator that already reads two other
files. The primitive set, the separation check and every published vector are unchanged.

**What it does not settle.** `DEFERRED` is now empty, so the new check has no subject and is a guard rather than
a result. That is the honest description of it, and it is the same standing the separation check had on the day
it was written: nothing shared a primitive across the two paths then either.

---

### Hosted retention is twelve months, and the row was conditional on one bit of the pricing question

**Date:** 2026-08-20 · **Commit:** `cdd2069` · **Against:** PRD v9 / TRD v8

**Orientation.** Review 3b is booked for the week of the 24th and §13.11 holds each review until its own scope is
closed. Two rows of that scope were open: the network half of 14, which is a fold, and row 16 — the
hosted-content retention duration after a lapse. Row 16 was filed in §15.2 as **conditional** on PRD §11's
pricing question, which is deferred, blocks nothing, and which no sentence in the PRD may be written to depend
on. Read that way it could not be taken at all until a business model existed, and the plan was to present it to
the reviewer as conditional rather than closed.

**The condition was on a larger question than the row needed.** Question 1 asks what hosted sync costs and how it
should be priced. Row 16 needs only whether a **lapsed-but-retained state can exist** — one bit, with no price in
it. Taking that bit closes the row and leaves every pricing sentence exactly as deferred as it was. **This is the
fourth row in 3b's scope whose apparent question was not its real one**, after row 5's three candidates that were
two, row 12's secret that did not exist, and row 15's operation that was a class. The habit worth keeping: when a
row is filed as conditional, check whether it is conditional on the _whole_ of the thing it names.

**Decision. Twelve months, measured from the moment hosted synchronization stops** — the end of the grace period,
not the missed payment, so grace is not deducted from retention. Argued from the failure rather than from a cost
model: the scenario is conjunctive, _lapsed **and** every device gone_, and someone in it is not reading email
from a service they stopped paying. A shorter number optimises storage the service cannot read against a loss
that is total and permanent, and the retained artifact is ciphertext under a key the service never holds — so
what a long retention costs is bytes and a promise, not the accumulation of readable personal data that the rest
of §16 is shaped to prevent. Beyond a year the protection falls off rather than the cost rising: a workspace
untouched for twelve months either has a fidelity archive or does not, and §9.3's archive **does not inherit this
deadline**, which is what bounds the whole question.

**A floor alone would have been a defect, so it is a ceiling too.** The decision was taken as a floor a plan may
lengthen and may not shorten, which is right about the promise and, alone, wrong about the data: a retention
stated only as a floor is unbounded above, and §16.6 requires every row's deletion event to be _exercised_, of
which there is none in _at least twelve months_. So the same number binds both directions — the promise floors,
the data ceilings, and expiry **deletes** rather than making the copy eligible for deletion.

**One number for two paths, and the reason is not that they happen to be equal.** Three things are retained
together: ciphertext, wraps, sealed `R_priv`. Resuming needs the first; total-device-loss recovery needs all
three; only the first is expensive. So a shorter recovery window saves nothing and produces exactly the state
§6.10 refuses — the service holding bytes it will not return — and the second promise is free once the first is
made.

**A number has no vectors, so the artifact is a check on its copies.** `scripts/check-retention.mjs` reads the
requirements rather than restating them: every place the PRD or TRD states a hosted-retention duration must state
this one, and every `unselected` cell in §16 must be bounded and must not point at a closed row. That second half
extends `checkCoverage`'s rule — _read the somewhere else_ — from row 1's deferral entries to the data inventory,
where §16.6 and [sequencing.md](./sequencing.md) §3.7 already required it and nothing was enforcing it. Both
halves are demonstrated against mutations rather than asserted: a changed number, a deleted one, a cell repointed
at a selected row, and a cell declaring no kind.

**It found more than it was written for, which is the argument for writing it before the fold rather than after.**
Four cells pointed at §15 rows that had since been selected — the preamble's rows 7 and 16, acceptance evidence's
rows 5 and 7, and both checkpoint rows. Rows 6 and 7 had answered them **positionally**: _two checkpoints_, _that
checkpoint's head vector forward_, _a mark, not a log_. And the acceptance-evidence row still described a
per-credential accepted-set **log** — a data class row 6 had replaced with a mark. **A stale pointer is the small
version of this; a data class the design has deleted, sitting in the inventory a reviewer reads, is the large
one.**

**And §16.6's own rule was already false of its own table.** It said each `unselected` occurrence points at the
§15 row that closes it; four cells named no row, because a metrics, log, backup or support-material retention is
bounded by a **deployment** choice that no selection was ever going to close. So `unselected` now has two declared
kinds and the check enforces the declaration. **This is row 17's A4 finding a second time** — a control true in
spirit with no address in fact, refused until it named one.

**What it cost.** One binary taken early: if hosted sync is never priced, §6.10 and this row become dead code in
the requirements rather than wrong, which is the cheap direction. A promise the service must be built to keep and
to execute. A number argued rather than measured — §4 of the record is honest that there is nothing to measure
yet, and that it is falsifiable only in one direction, by an incident. **No protocol field, no key, no format, no
client change**: nothing in §6, §7 or §13 moves.

**What it does not settle, and one thing it asserts that no row stated.** The grace period's own duration stays
open and is a billing parameter; the only constraint placed on it is that retention starts when it ends. The
disclosure copy belongs with PRD §11 question 11's. And closing the acceptance-evidence cell required writing a
retention that rows 5 and 6 **imply but never state** — one `(seq, link)` per credential plus its cutoff, for the
life of the lineage, on row 6's theorem that the chain has no memory beyond its last link. It is recorded here
rather than presented as a quotation from those rows, and it is the one line in the fold a reviewer should be
invited to disagree with.

---

### The step-up challenge gets a nonce and binds the transition id, which closes review 3b's scope

**Date:** 2026-08-20 · **Commit:** `ff0b48f` · **Against:** PRD v9 / TRD v8

**Orientation.** One row was left in 3b's scope — the network-facing half of row 14, the step-up that gates
recovery replacement — and both the register and the working file described what remained as _a fold rather than
a construction_. It was not. Part of it had already been folded, and the part that landed had two defects that
only showed on reading the tree rather than the summary.

**What was wrong.** `test/vectors/recovery-code.json` published
`SHA-256( LP("done/recovery-replace/v1") || LP(principal_id) || LP(hex SHA-256(new r_pub)) )` and described it in
the same file as **a single-use service challenge**. Every field of it is a function of the operation, so it is
the same challenge every time it is asked for: there is nothing for the service to retire, and nothing an
assertion can be fresh relative to. An assertion collected for a replacement that never completed stays
presentable indefinitely. **That is row 9's finding at a different message** — without a nonce a signed artifact
is a standing artifact and replay needs no key at all — and §13.9's slot-unlock challenge, written _later_ and
citing row 14 §5 as its source, already carried `LP(hex nonce)` with 32 fresh bytes per attempt. The omission was
visible from the other end of the design before it was visible from this one.

**And its bound fields were isolated by nothing.** The generator declared one construction to the coverage audit,
`'recovery envelope'`, so the challenge was one worked example with no negatives at all. **The audit could not
catch this one, because the construction had never been declared to it** — the gap rows 9, 12 and 15 each found
from the inside, here found from the outside for the first time.

**Decision, and three parts of it.** The challenge is
`SHA-256( LP("done/recovery-replace/v1") || LP(dec v) || LP(hex intent_id) || LP(hex nonce) )`, answered by an
assertion from the account credential, with 32 service-issued nonce bytes retired on use.

- **The nonce makes _single-use_ true rather than said.** It is the whole of the defect and most of the fix.
- **It binds row 15's transition id rather than the new public key**, which is a change from §5's draft and is
  row 15's doing: when §5 was written the operation had no name, so it named the operation's target instead. The
  id already covers `kind`, workspace, lineage, parent epoch, target and the payload digest — the new public key
  among them — so binding the key beside it would be **a second binding of a fact already inside it**, which rows
  10, 12 and 15 each refused. What it buys beyond tidiness: `kind` is inside the id, so a `replace-recovery`
  step-up **cannot be redirected to a `retire`**. That is PRD §6.10's _a deliberate downgrade must not silently
  become account deletion_, one level further out than row 15 took it.
- **It binds no principal and no credential id, where §13.9's slot-unlock challenge binds both.** That reads as an
  inconsistency and is a difference in provenance: the slot-unlock challenge is client-constructed for a
  device-local gate and names device-local things, while this one is service-issued for a service operation and
  names the operation as the service knows it. A service-issued challenge naming a device-local identifier takes
  the client's word for it, which is the shape row 12 spent its length removing. Binding a credential id would
  also forbid answering from a second passkey the account has registered, which is a feature rather than an
  attack.

**Every negative rewrites `clientDataJSON`, and that is row 9's other lesson made structural.** An assertion
collected over the wrong challenge, presented unmodified, is refused by a **string comparison** between the
challenge it carries and the one the service issued — a comparison that would refuse it just as readily if the
challenge were signed by nobody. Each of the four `aad-only-stepup-` negatives rewrites the carried challenge to
the one the service wants, which forces the refusal onto the signature and is also exactly what a real attacker
would do. The unmodified replay is published as a **demonstration** with the message it stops at asserted on every
run, because the four are only legible beside the check they are deliberately not making.

**The ceremony moved to `scripts/lib/webauthn.mjs` rather than being copied.** Two rows now put an assertion in
front of an operation — row 12's slot unlock and this — and they are different challenges over one ceremony.
`authenticatorData`, `clientDataJSON` and what the credential signs are shared; **row 12's published vectors are
byte-identical across the extraction**, which is what makes it a move rather than a change. Neither challenge
moved: a challenge is the selection, it is what each row's negatives isolate field by field, and it belongs beside
the record that argues it.

**The audit refused the first run, and on a failure mode nothing had hit before.** Not a binding — the four
isolations passed first time, because rows 9, 12 and 15's lessons were applied while writing rather than after.
What broke was the **demonstration's own assertion**: it requires two challenges to differ, and with the nonce
elided they do not, so the subprocess threw and the audit reported a crash with a stack trace where it expected a
rescue. `refuses` was already elision-aware and nothing else was. **`eliding()` is now exported**, and the rule is
recorded: an assertion about a _difference_ guards on it, an assertion about a fixed fact does not.

**What it closed.** 3b's scope, with three working days before the week it was booked into. Eighteen rows are
selected and four are open, and row 20 is the only row left appearing in both halves of §15. **What is left for
3b is a question rather than a row**, and the difference matters because §13.11 gates on the second: whether the
service rate-limits envelope fetch. It should, and it changes nothing about the code's entropy, because the
attacker who matters has already fetched the envelope. It is put to the reviewer as a question rather than left in
the register as an open row.

**What it does not settle.** The confirmation and mismatch copy is still PRD §11 question 12's, and it is the part
Stage 4 will get wrong first. The residual §5 names is unchanged and accepted: a party holding a device _and_ the
account credential can replace the recovery envelope and destroy the owner's recovery path — an availability loss,
strictly less than deleting the account outright, surfaced at the explicit confirmation rather than prevented.


---

### Encrypted-store contracts corrected before implementation synthesis

**Date:** 2026-09-08 · **Base:** `af8941e` · **Branch:** `codex/encrypted-store-contract-corrections`

The three implementations inherited contradictory or incomplete prose. The spec assessment and bounded
counterexamples showed why an IndexedDB fence cannot exclude a stale localStorage writer, unique sequence
numbers cannot prove snapshot coverage, and a journalled local Yjs edit may require an unpersisted remote
predecessor. An empty Yjs replica does not erase a populated peer by ordinary synchronization. Treat the
old closure/model claims as evidence of represented cases, not authority for these omitted states.

**Product decision.** The user selected factor unlock for protection against copied profiles. Require the
generated 125-bit code at persistent Local and Account genesis and cold start; PRF adds a seal. Narrow the
claim to supported copied profiles without the external factor, after complete custody/receiver protection.
Non-extractability alone is not filesystem confidentiality. Existing copies retain history; migration and
remote observation can leave forward protection pending. No ordinary disable-lock downgrade remains.

**Selected storage rules.** SC-01–09 in [storage-contract.md](./storage-contract.md) now own the detailed
boundary: shared writer-lifetime permits and exclusive slot transitions; journal-inclusive fresh retirement
census after every restart; remote/cross-tab commit before canonical promotion; ordered private pending
input; exact authenticated trim; repair-required refusal of unreadable persisted state; classified partial
genesis; resumable authorized clear; mandatory factors and qualified nonce accounting/restore. A frozen
writer may delay transitions indefinitely. No timeout or stale census supplies safety. Pressured local
input becomes ordinary document content only when durable; IME preedit remains provisional native input.

**Metadata and bytes.** Custody lifecycle metadata becomes v2 (`creating | migrating | protected`), with
verified durable intent and per-root seal reservations. Factor authority remains principal/workspace-scoped
inside the local user slot; the coordination permit is wider than that key authority. Record, journal,
LockSeal and transition cryptographic encodings are unchanged. The older generation-only custody budget
counted stored rows but omitted encryption retries and multiple purposes; reserve every custody-root seal
before encryption instead. All random-nonce counter claims assume unrewound, unbranched histories.
Supported writable restore uses verified import with a fresh store/key scope, never a restored counter.

**Five ambiguity dispositions.** Partial genesis resumes a verified intent or refuses; unreadable load
refuses ordinary open; unreadable trim refuses the whole trim; pending input stays private until durable;
clear includes the journal and preserves recovery material when content deletion fails. A durable clear
intent and terminal marker prevent resurrection after interrupted cleanup.

**Evidence and next gate.** [storage-conformance.md](./storage-conformance.md) separates finite models,
real Yjs components, production adapters and browser evidence. New model/component tests expose the losing
schedules; all production obligations remain pending. Register adapter conformance at L-1, complete
writer/generation lifetime at L-3, and supported factor/profile evidence at L-4. A prose check or primitive
vector cannot pay these debts. Next build one shared harness against each candidate's actual paths, then
synthesize deliberately around a rebuilt coordinator. This decision does not select a whole branch as
correct, recertify the full protocol, or authorize the live Stage 2 cutover.


---

### Phase-two local custody: authenticated v2 metadata and root-sealed credentials

**Date:** 2026-09-08 · **Branch:** `codex/encrypted-store-contract-corrections` · **Context:** mandatory-factor custody implementation

The corrected contract requires authenticated resumable creation and per-root invocation accounting,
while retaining the selected v1 factor and generation-envelope bytes. A cleartext count or intent whose
fields are not authenticated would reintroduce trust in editable profile metadata. The new component
therefore binds its complete closed v2 metadata tuple with HMAC-SHA256 under a separately derived key;
[the exact encoding](./custody.md#v2-local-encodings) and production parser own its field order.
Transactional comparison retains the observed identity and bytes before each mutation. The MAC prevents
unauthenticated edits, not replay of authentic old states: the unrewound/unbranched-history condition
remains necessary.

New operational credentials use a separately labelled v2 local credential seal directly under the random
custody root. It authenticates principal/workspace, role, credential id and public key. This makes all
three creation encryptions — generation, wrapping scalar and signing seed — direct counted invocations
under that root. The count is committed before encryption and includes abandoned attempts. The historical
code-sealed wrapping-credential vector remains a historical byte fixture; the new representation does not
mislabel a custody root as a PRF output or require a credential reseal when an additional root factor is
implemented. Existing v1 LockSeal, generation KeyEnvelope, record, journal and wire bytes are unchanged.
This concretizes the new local v2 lifecycle rather than modifying a deployed carrier.

The custody descriptor exposes no private capability. Generation 1 can decrypt selected content records
through live task checks; encryption awaits the content allocator, and signing/receiving await their
protocol authority. The v2 custody state does not independently authorize workspace readiness: startup
must still retain and complete its own cross-carrier genesis intent before acknowledging edits or
reporting whole-workspace protection. Phase-two fixture checks do not substitute for that production
owner. The browser controls are bounded evidence, not a supported-platform or independent security review.

### 2026-09-08 — content allocation has authenticated metadata and a custody-side initialization witness

Phase three retains the selected v1 record and generation-envelope bytes. Its counter is scoped to the
store id already minted by custody; all four record kinds share one global sequence and per-generation
reservation history. AES-GCM runs only after an exactly sized reservation transaction completes.
Metadata authentication uses a distinct HKDF-SHA256-derived HMAC key under `K_g`, empty salt and
`LP("done/content-metadata/v1") || LP(slotId) || LP(principalId) || LP(workspaceId) || LP(storeId)`.
The counter and witness use separate labelled, closed JSON tuples binding every trusted field and the
slot/principal/workspace/store/root identities. [content-store.md](./content-store.md) specifies them;
[contentRecord.ts](../src/crdt/contentRecord.ts) owns the actual ordered encodings.

A `creating`/`ready` witness at `[slotId, principalId, workspaceId, "content-v1"]` in `done.custody/entries`
precedes content initialization and remains when its database is deleted. This leaves v2 custody entries
unchanged and makes missing initialized content a refusal instead of a zero-count replacement. The
exclusive owner resumes the same unused intent; ordinary open never initializes. Fresh genesis still
requires the startup owner's cross-carrier authorization. The witness is not a complete workspace-ready
receipt or a detector of arbitrary multi-carrier rollback/removal, which remains outside SC-09's history.

A counter is read/authenticated outside IDB, then compared byte-for-byte inside the updating transaction;
conflicts retry with fresh authentication. Record insertion uses `add` in a transaction spanning metadata
and all record stores, and validates the generation there. This phase refuses ceiling/generation changes;
successor activation and automatic re-reservation are later transition work. Full snapshots authenticate
all records and never use a state record to hide predecessors. The bounded API accepts 256 records/4 MiB
per batch, independent of the journal's measured limit; total input queue policy remains admission work.

The [executed component evidence](./storage-conformance-runs/2026-09-08-content.md) supplies browser
counterexamples and mutations for these choices. It does not pay full startup/admission/trim obligations.


### 2026-09-08 — journal recovery captures before content, and cleanup owns the completed handoff

Phase four keeps the selected row-2 HKDF/AAD and generation-bearing journal bytes. The mandatory-factor
owner derives the raw journal subkey once while holding the shared writer lifetime and disposes both
that key and its synchronous WASM instance before releasing the permit. The existing RustCrypto module
now opens authenticated ciphertext and clears staged buffers; whole-instance disposal is a logical
owned-memory guarantee, not an engine/OS forensic guarantee. The independently registered toolchain
provenance debt remains open after the rebuild.

The new byte journal reports synchronous success only after localStorage setItem succeeds. Its immutable
entry identity combines the existing database namespace, custody store id, random runtime writer id and
monotonic ordinal. Oversize, pressure and unavailable writes refuse without queueing or promotion. A
full scoped read authenticates every entry and rechecks its captured identities/bytes; unreadability
refuses ordinary open/recovery/flush and preserves entries. Unknown generations remain opener references,
not absent data. The interim 16 KiB bound precedes nonce generation and sealing; the observed origin-wide
UTF-16 character watermark is advisory because storage events can lag.

Full recovery captures the journal before reading content. Reversing those reads allows a concurrent
flush to move an update out of the journal after the content snapshot and before the journal read,
leaving neither copy in the result. Recovery therefore accepts duplicate carrier coverage. Flush owns
its captured private bytes and invokes the actual content allocator/commit, then checks each completed
chunk's exact journal identity/value before removal. No public receipt assertion can authorize cleanup.
A failed content chunk leaves its journal entries intact; an earlier completed chunk may already be
cleared. Changed values are retained and require repair.

There is no atomic localStorage compare-and-delete. The equality cleanup relies on conforming writers
never overwriting or reusing an identity; it does not exclude an arbitrary older/hostile writer between
individual storage calls. Shared lifetimes block exclusive transition/retirement while a cached journal
writer survives, including freeze. Supported-version cutover, a fresh journal-inclusive retirement census
and complete owned startup/clear remain later obligations. The [component guide](./journal-store.md)
and [executed evidence](./storage-conformance-runs/2026-09-08-journal.md) record these limits explicitly.

The next owner is ordered admission over both carriers. This checkpoint has no canonical document,
editor, transport, pending-intent queue or batching timer and cannot itself guarantee causal closure of
arbitrary caller bytes. The raw content/journal API is an internal integration boundary, not permission
for a production receive path to promote memory-only dependencies.


### 2026-09-08 — ordered admission owns canonical state, intent preparation and durability barriers

Phase five introduces [one admission owner](./ordered-admission.md) over the real factor-unlocked journal
and content capabilities. Canonical Yjs state is private; callers receive detached accepted snapshots and
post-carrier update events. Local input queues encoded intent rather than updates prepared against a
possibly uncommitted predecessor. At the head, a required synchronous command adapter prepares on a
private clone. The owner captures its exact delta and never publishes the clone. Transport-specific
receive validation and private Yjs validation precede persistence; content completion precedes remote
canonical application. Pending structs/delete sets are retained, without state-vector coverage shortcuts.

A successful single-slice journal append retains synchronous promotion. A refusal forces journal-prefix
flush and then candidate content commit; these are separate transactions. Failed content retains the
prepared bytes and the pending suffix. Retry remains forced to content even if journal availability has
changed. A rejected inbound message can leave the queue because it never became authorized input; failed
local preparation or storage instead holds the suffix until retry or explicit whole-suffix discard.
Known repair-required persistence cannot be hidden by retry/discard or an ordinary snapshot.

Commands that need slicing return a strictly smaller remaining byte intent. Every prepared update stays
within the selected interim 16 KiB limit; oversized adapter output blocks before sealing. Each slice of a
large command completes content persistence before promotion and next preparation. This is a resumable
accepted prefix at the carrier boundary, not persisted ownership of an arbitrary import's remaining source.
The application adapter supplies command semantics, slicing and product-level source recovery.

Initial queue policy is 256 jobs and 4 MiB of conservative byte reservations: local input reserves twice
its byte length plus 16 KiB for input/remainder/update, and receive reserves captured input bytes. These
are explicit implementation bounds, not population measurements or a Yjs/process-memory bound. Full draft
cloning buys an isolated candidate here; profiling its document-size cost and improving the preparation
seam as necessary precede low-end/editor acceptance.

The 250 ms timer and `whenDurable()` use FIFO flush barriers. A barrier covers every prior observed input,
including pending intent, and may finish while later input is still journal-only. Storage failure rejects
barriers observably and blocks automatic retry. Closing invalidates input/publication, erases the pending
suffix and drains the guarded underlying lifecycle before document disposal and permit release.

[Executed evidence](./storage-conformance-runs/2026-09-08-admission.md) exercises this production owner
with synthetic command/receive authorities and accepted-event projections. It does not certify actual
CodeMirror/IME/undo/export/transport adapters, full startup/clear/migration, generation/reference composition
or the old-writer cutover. The application remains on its previous persistence until the integrated unit
is ready. No release obligation or debt status changes at this component checkpoint.


### 2026-09-08 — integrate the Goals command/history boundary before the whole workspace

The next [bounded integration checkpoint](./editor-admission.md) is the real Goals text surface. The
existing application's writable Y.Doc is shared by editor bindings, card/workflow operations, actor
repair, undo and the legacy provider. Replacing that capability everywhere is a broader workspace change;
this checkpoint supplies a text command boundary and its actual browser observation surfaces first.
The default application's persistence and startup remain unchanged.

CodeMirror commands run against private state at the admission head. The accepted CodeMirror state owns
history; a prepared transaction/history state remains private until the exact Yjs candidate promotes.
Remote Y.Text deltas rebase that history with addToHistory disabled. Each submitted action is an undo
step, while a paste's completed slices group together. This is one Goals history stream, not the final
actor-scoped cross-surface history. The later workspace adapter must preserve that broader contract.

Input normally follows the preceding accepted command's selection. An explicit UI selection is encoded
as relative positions against accepted Yjs text and resolved when the intent reaches the head. Therefore
queued typing can continue while earlier input is private without precomputing CRDT updates against an
unaccepted document. Text projections, copy/export and outgoing bytes observe only accepted state.
The same-origin BroadcastChannel adapter sends accepted local bytes and never lends a writable doc to
its receiver. Caller-supplied receive authority and later Account envelope verification remain distinct.

Native composition stays provisional. Blink may reconcile away preedit without a compositionend event;
its final non-composing insertText must still enter admission. The CDP probe demonstrates the corrected
commit route, not native IME/candidate-window usability or supported-device acceptance. Large paste
slices stay below 1000 UTF-16 units without breaking surrogate pairs. All commands, including undo/redo,
still face the owner's 16 KiB encoded-update limit; unsupported large command output refuses visibly.

The preparation profile is diagnostic. Compact text size and fragmented Yjs history both affect full
clone cost; the extreme 2000-writer case measured 6.1 ms p95 on this Mac before journal, view and paint
costs. This does not prove the low-end budget holds or justify changing it. Preparation optimization and
complete interaction measurement, plus native IME validation, remain prerequisites for editor acceptance.
The [execution record](./storage-conformance-runs/2026-09-08-editor-admission.md) distinguishes passing
cases and mutations from corrected/incomplete development runs. No release gate is paid by this checkpoint.


### 2026-09-08 — one admitted workspace history, with private system transactions and tab bootstrap exchange

The [phase-seven workspace adapter](./workspace-admission.md) reuses existing semantic application commands
at the ordered admission head. Goals/card text and human structural operations share a runtime content
undo scope. Metadata remains outside that scope, as in the existing application. Day materialization,
bulk work and membership repair keep their system origins. Received work persists before promotion and
never enters human undo. Application actor/schema initialization itself enters admission and completes a
content barrier before the factory returns. Identity is supplied by the owner; this does not introduce
legacy localStorage actor/device side effects or solve scoped identity onboarding.

Preparation uses a private history document separate from the ordered owner's draft because its outer
transaction would swallow nested origins. The pinned Yjs seam copies delete sets, selection metadata and
Item.redone links that wire encoding omits. The browser mutant demonstrates the latter dependency by
removing a card, restoring it and undoing an earlier text edit inside it. gc:false retains deleted runtime
content and this design adds a second full clone. Those costs and version-sensitive internals are explicit
acceptance/review work, not a performance optimization or a claim that arbitrary runtime history is proved.

The workspace facade exposes detached projections, accepted export/update bytes and shared text surfaces.
Text surfaces do not own session close or transport. Each command receipt preserves its business result,
including false/null/zero; a completed no-op/refusal must not be confused with an applied mutation or a
storage failure. Storage-blocked preparation retains the pending candidate and history for retry/discard.

Joining same-origin tabs exchange accepted snapshots in both directions: actor initialization can happen
before a channel opens, so future-only update delivery can omit dependencies permanently. Snapshots and
subsequent bytes all enter the receiver's durable FIFO path. The channel remains a bounded participating-tab
adapter with explicit error reporting, not Account authorization, reliable delivery or a trim certificate.

[Execution evidence](./storage-conformance-runs/2026-09-08-workspace-admission.md) covers real editor surfaces,
commands, aborts, joins and renderer death. It leaves the default application on its earlier store. Full
startup/classification/clear, scoped identity/index, migration/cutover, exact trim and the release/review
obligations remain subsequent work; no debt status changes at this checkpoint.


### 2026-09-08 — retained-workspace startup rereads under the eventual writer lifetime

The next [bounded checkpoint](./owned-startup.md) owns retained-workspace opening. A read-only preflight
can offer an unlock-required or refusal disposition; it cannot authorize a later open. Actual open repeats
the scoped index/carrier census inside the underlying writer's shared permit, before custody reads/key
selection, and holds that lifetime through authenticated replay, admitted application initialization and
runtime use. Editor and transport construction follow only a ready result. The independent Local/Account
identity verifier runs under the permit and does not turn a raw index row into authority.

Known-name IndexedDB probes abort would-be creation, settle record reads at transaction completion, and
close eventual abandoned connections. Missing initialized material, conflicting routes and orphan carriers
are typed refusals; an undefined-valued retained row still counts as material. Structurally consistent
preflight is not authentication: a correct factor and full carrier/replay validation remain required.
Unsupported application schema is rejected before admitted actor/schema initialization.

This phase deliberately has no genesis, clear or migration execution API. Fresh means observed absence of
requested known carriers, not authorization to mint an identity/root or reset a counter. Creation-pending
requires the later owner to authenticate its immutable cross-database intent and expected stages. Extra
scoped rows bearing clearing/cleared/migrating tags give refusal-only hints, not validated transition
formats, proof of completion or cleanup authority. Other unknown controls require repair.

[Browser evidence](./storage-conformance-runs/2026-09-08-owned-startup.md) tests a clear marker installed
between preflight and the eventual lock grant, cancellation while crypto is pending, and renderer death
before the initialization barrier. Reacquisition and complete replay precede exposure; cancellation cannot
release exclusion ahead of owned native work. The fixture's enrollment, identity and index installation
are explicit synthetic assumptions. Verified Local genesis and lifecycle-owned indexing are next, before
application cutover; no debt or release gate is paid by this checkpoint.


### 2026-09-08 — Local genesis atomically claims identity/custody and authenticates cross-database progress

The [Local genesis owner](./local-genesis.md) uses a fixed per-slot claim in the custody database, committed
with the first factor-sealed custody record in one add-only transaction. The signed initial record binds
principal/workspace, root/store and credential IDs. Keeping that immutable anchor lets interrupted work
verify the winner without minting a replacement identity or reconstructing a used custody counter.
The content initialization intent is the same signed intent ID; expected stages and layouts are versioned
by this Local protocol. No Account binding is fabricated for Local access.

A separately authenticated `custody` → `content` → `ready` progress field prevents missing later carriers
from looking like permission to initialize again. Its HMAC derives from the factor-opened root under the
documented Local metadata domain and binds the initial record MAC plus stage. Crypto and transaction
completion stay within one exclusive slot lifetime; cancellation drains them before release. The final
index is added only after authenticated empty content initialization and ready progress. A loser obtains
the winner's valid factor or receives the existing locked disposition. Normal Local startup rereads and
verifies the claim under its eventual shared writer permit before replay and application initialization.

The retained initial record is an authentication anchor, never a live-custody restoration source. It
contains another copy of the same factor-sealed opener bytes and therefore belongs in later clear and
rotation/reference accounting. The added progress construction needs independent review; these tests are
bounded evidence rather than proof of the full protocol or copied-profile support population.

Earlier index APIs now serialize slot writes, await transaction completion and refuse Local-owned rows
or claims. The new picker requires factor verification and returns a detached, slot-scoped route list.
This checkpoint handles the first workspace in a fresh Local slot; additional-workspace registration,
Account onboarding, Local close/reopen/delete, migration, clear and default-application cutover remain
subsequent owners. [Browser evidence](./storage-conformance-runs/2026-09-08-local-genesis.md) exercises the
nine creation boundaries, two factors/creators, cancellation, transaction aborts and legacy interference.
No obligation or debt status is paid by this checkpoint.


### 2026-09-08 — Local clear authenticates resumable progress after removing every content opener

The [Local clear owner](./local-clear.md) handles the first completed active Local workspace in its slot.
Read-only preparation verifies the generated factor and returns an immutable target for the host's explicit
deletion confirmation. The exclusive action rereads ownership after grant, rejects unknown references and
persists a scoped intent before any deletion. It waits for native content deletion success before touching
the journal; blocked native deletion keeps exclusion until settlement, including after cancellation.

Exact observed journal removal and verified absence precede opener cleanup. Live custody, the content
witness and the genesis claim's retained factor seal are removed in the same transaction as advancement
to index cleanup. Index removal and terminal progress span databases, so a crash can leave no content
opener with cleanup still pending. An independent HKDF/HMAC construction derives only from the existing
high-entropy generated factor, salt and domain-separated intent context. Its authenticated payload binds
the full target and stage. No derived key or code is persisted; the terminal record retains no content
opener. Initial authority additionally requires the existing factor-authenticated Local genesis claim.
The guide records the exact construction and its independent-review requirement.

Every resumer reacquires exclusion and verifies current progress and surviving carriers. A pending content
stage may observe absence after an interrupted native success; a surviving database must still match its
bound counter/layout. Later stages refuse reappearing residue. Normal custody access, Local genesis,
startup and legacy index writes observe the fixed control before proceeding. Structural observation only
authorizes refusal, never deletion. Terminal state blocks automatic fresh genesis; explicit reuse of a
cleared slot needs a later owner. The action has no rollback after intent commit.

The browser preparation exposed that the legacy `done` journal prefix includes modern encrypted
namespaces. The legacy-only census now excludes only complete modern key framing; ambiguous keys still
refuse. Namespaces and stored data remain unchanged. [Execution evidence](./storage-conformance-runs/2026-09-08-local-clear.md)
records native blocked deletion, cancellation drain, seven crash boundaries, partial journal failure,
transaction aborts and five detected mutants. Account/shared-custody clear, migration/cutover and independent
review remain owed. Exact-coverage content compaction is next; no debt status changes here.


### 2026-09-08 — content compaction commits a disk-union replacement and rechecks exact coverage

[JournalSession compaction](./content-trim.md) is explicit maintenance under its existing shared writer
lifetime. The public call accepts no live document, state vector, watermark or deletion set. It validates
and authenticates a consistent snapshot of every content store, merges content wire updates including
pending structs/delete sets, and publishes a state using the existing durable allocator. Heads/outbound
are authenticated but remain outside the replacement/deletion set. The journal is authenticated and retained.

The owner keeps the observed encrypted record identities and bytes in memory, and a completed publication
receipt precedes deletion. A new authenticated census checks that replacement and covered inputs still
match. The deleting transaction compares the entire census and counter before synchronously checking the
journal and deleting only exact covered content identities. Changed material requires reevaluation; known
unreadable material refuses the entire trim and closes ordinary use. Persistent keys remain. A removed input
or replacement may reflect another completed compaction, so this invocation returns `retained` without
its own deletion. Concurrent new records/replacements are never covered merely by their sequence.

There is no persisted trim watermark. Interrupted publication/deletion leaves recoverable input or safe
duplication; a fresh invocation starts again. Eight conflicting censuses bound one deletion attempt's retry
loop. A replacement above the existing 4 MiB limit refuses before reservation. These choices bound output
and contention, not input memory or low-end latency: the full union remains an in-memory scan and merge.
Automatic scheduling, streaming/chunking and default-app integration need later acceptance work.

[Execution evidence](./storage-conformance-runs/2026-09-08-content-trim.md) includes the late-sequence
counterexample, overlapping compactors, byte replacement after authentication, final journal damage,
native request-success/abort distinctions and actual renderer death. The selected record crypto and key
formats remain unchanged. Storage/crypto review and full reference/Account/checkpoint composition remain
owed. Next is legacy migration/cutover preparation, before any real-data or default-application switch.
No debt status changes at this checkpoint.


### 2026-09-09 — generate production carrier histories; defer compaction over unresolved dependencies

The [property harness](./storage-properties.md) exercises the real encrypted carrier with a separate source
operation ledger. Pending text structs/deletions are checked by decoded wire inventories, and complete
semantic bases by replay plus a plain string model. Partial visible equality is not a preservation oracle:
pinned Yjs can expose different portions of incomplete information depending on update framing/order.
The suite still requires every pending clock/payload and deletion range to survive, and every fully supplied
history to recover. It also requires maintenance to complete once its basis is actually persisted.

Generated cross-client histories exposed a stronger failure in the previous compactor: merging a partial
union could strand text even after all dependencies were delivered. The bounded correction retains the
original content records whenever validation leaves pending structs or deletion sets. It returns `retained`
with no reserved state sequence and no persistent mutation; later flush/dependency delivery and a fresh
compaction can proceed. This is valid pending material, not damage. The guard is read through the pinned
Yjs seam and must be reevaluated on a dependency upgrade. The native counterexample and standalone complete-
delivery control are recorded in [execution evidence](./storage-conformance-runs/2026-09-09-storage-properties.md).

Exact identity/byte coverage, journal authentication, transaction-completion receipts, invocation accounting
and mandatory-factor custody remain unchanged. Deferral can retain growing input while dependencies are
absent; streaming, memory limits and scheduling remain acceptance work. Source mutants must repeat a named
property failure and pass the same minimized history on unmodified production; exceptions/timeouts do not
count as sensitivity. JSON replay accompanies seed/path metadata. No debt is paid, and migration/default-app
cutover remains subsequent work.


### 2026-09-09 — migration preparation observes the predecessor without treating observation as authority

Phase twelve is committed as `a0811e2`. The next bounded [migration preparation](./legacy-migration-prep.md)
uses a separate read-only source observer: ordinary `openStore` and its predecessor provider perform writes
on startup and cannot serve as a source survey. The observer captures original `done` update rows, `1:` WAL
entries and four known ancillary keys; it refuses unknown/unreadable supported-carrier material, detects
observed journal drift, and retains pending dependencies without merging away their original framing.
The observation digest is unkeyed and authorizes no destination, active selection or deletion.

[Native evidence](./storage-conformance-runs/2026-09-09-legacy-source.md) confirms that the real legacy
provider can journal and commit while the new exclusive slot lock is held. Matching scans cannot exclude
that writer. The next seeded harness therefore needs controller-owned exclusion of every old execution
context and route across restart. That test precondition is not a production fence; supported-version
exclusion for the actual installation remains an explicit implementation/acceptance requirement.

The preparation plan orders verified source/export, mandatory-factor pre-active destination creation,
bounded idempotent import, cold verification, selection and resumable exact cleanup. It inventories old
journal/DB, ancillary credentials/device names, cached executable shells and transport paths. Fresh writable
store/key/counter history is mandatory; imported writable keys/counters never become a second live instance.
The plan does not define a new authenticated progress format or implement those transitions yet. Existing
Local genesis absence checks must not be bypassed to build migration. The next bounded implementation is
verified export capture under controlled seeded exclusion, before the destination/import owner.

The open Markdown/system-attribution versus fidelity-archive decision still gates the real Stage 2 cutover;
this reader does not choose it or change ordinary application routing. Matrix evidence and its three pins
advance without changing obligations/debt status. The independent L-2 record is preserved.


### 2026-09-09 — verify seeded source recovery before designing pre-active destination authority

Phase thirteen is committed as `e64cd2a`. The next bounded [capture checkpoint](./legacy-export-capture.md)
keeps original legacy update records in a diagnostic JSON packet and exercises Markdown only as an explicit
preview adapter. It does not choose the Stage 2 Markdown/system-attribution versus fidelity-archive policy.
The packet omits ancillary local credentials, carries no destination keys/counters and is not a portable
encrypted archive. Its separate SHA-256 checksum establishes integrity relative to an expected digest, not
authenticity if both can be replaced. A future migration owner must bind source, policy, intent and authority.

Capture requires complete CRDT dependencies and a supported schema-4 projection; unknown shapes and omitted
registry membership refuse without repair or deletion. A new test exposed that valid array ContentAny items
can disappear from pinned Yjs Text projection. The correction checks live text item kinds through the Yjs
seam before exporting. This is a defect discovered while building the new private path, not evidence of an
executed migration or deployed data loss. Version-sensitive guards require reevaluation on a Yjs upgrade.

A seeded Node controller owns browser-context shutdown, route admission and invalidatable observation epochs.
It stops the known old page/dedicated worker before capture and detects new execution attempts across cold
replay. This controlled fixture precondition does not exclude arbitrary supported historical installations,
SharedWorkers, profiles or remote devices. Matching source observations and a new lifecycle lock still do
not fence the real predecessor. No boolean assertion, packet or digest grants production exclusion.

[Native evidence](./storage-conformance-runs/2026-09-09-legacy-export.md) combines generated delivery/content
histories, independent input-string and ZIP readback, saved-file replay, renderer deaths and seven named
sensitivity controls. The default application remains on the legacy provider. Next is an authenticated
pre-active destination/import owner with mandatory-factor fresh writable scope and bounded idempotent slices;
it must not bypass Local genesis absence checks or publish a ready index row before verification. Selection,
resumable exact cleanup, production exclusion and the complete cutover kill matrix follow. Source recovery
material survives until verified encrypted selection. No obligation/debt status changes at this checkpoint.


### 2026-09-09 — separate reproduced core failures from unproven routine schedules

Phase fourteen is committed as `da5def9`. Further migration integration pauses for the three user-selected
[core reproductions](./core-reproductions.md). Production code remains unchanged. A completed investigation
report is not a conformance pass: it records observed violations separately from passed controls and treats
unexpected exceptions as harness failures.

Journal-changed puts the real owner into human-retry pressure when a paused native snapshot observes a
peer append or completed cleanup. Neither uninterrupted synchronous overlap nor the simultaneous keyboard
campaign reproduces that interleaving on this Chromium host. A debugger-induced event-processing opportunity
must not be used to claim ordinary two-tab typing commonly blocks. Cross-platform/routine frequency remains
unproven, while the error propagation and retained pending input are reproduced.

The pending-clone corpus reproduces canonical/editor/export divergence after later dependency delivery;
visible texts and integrated state vectors can agree before the missing basis arrives. Therefore a cheap
visible comparison only at promotion is not an adequate acceptance condition for the proposed repair.
Independent reopen and a later Undo both heal this corpus, but neither is yet a general recovery design.
The original-framing Yjs campaign also finds delivery-order failures; no observed sender-ordered or complete-
join failures imply no proof outside those narrow alphabets. Saved original bytes, minimized schedules and
external string oracles are retained for the next bounded repair phase. No migration or debt payment follows.


### 2026-09-09 — retry journal acquisition within one live operation, with a finite budget

The core reproductions are committed as `a292103`. Repair phase 1 changes journal read acquisition only:
three total capture attempts, counting the existing synchronous invocation capture. Only an actual
`JournalError('journal-changed')` retries, after 0 ms then 8 ms scheduling delays. The same live task and
permit cover the wait and each read; cancellation removes its timer and prevents another capture. Delays
are scheduling requests, not wall-clock guarantees. Failed decoded attempts are erased.

The successful invocation fast path keeps its exact set. On churn, a replacement capture can include
later peer entries. Journal-first recovery still precedes the content read. Content reservation/sealing/
publication/cleanup begins only after acquisition and executes once; content failure is never fed back
through this retry. The synchronous compaction preflight remains outside the helper so no later mutation
operation is accidentally repeated. Cleanup remains exact identity/value matched and commit dependent.

During acquisition, later local input stays behind the pending barrier. Three changed captures produce
`journal-busy`; the admission owner then retains input for explicit Retry/discard, without indefinite
background attempts. Startup classifies this as `busy` / `journal-read-contention`, with cancellation
precedence and no creation/deletion/migration authority. Unavailable storage and malformed/unopenable
entries fail immediately. An observed replacement of an immutable captured value latches repair-required;
disappearance can be conforming completed cleanup and remains retryable churn.

[Native and generated evidence](./storage-conformance-runs/2026-09-09-journal-contention.md) covers bounded
capture, ordering, preservation, cancellation/permit release and no repeated content writes, with four
focused sensitivity controls. This does not strengthen the earlier unproven routine-typing frequency
claim. No Yjs/projection repair is included. Phase 2 must preserve or recover pending information and verify
projection agreement when later dependencies arrive; then migration preparation can resume. Evidence and
three matrix pins advance without paying any obligation or changing debt status.


### 2026-09-09 — preserve pending runtime state and verify projection before publication

Journal contention repair is committed as `fc1ff41`. Core repair phase 2 copies integrated state through
a detached read-only view of the pinned Yjs encoder and then copies exact pending structs, missing-clock
bookkeeping and pending deletion bytes. Reapplying the encoder's merged pending snapshot changed that
bookkeeping in the saved corpus. The runtime copy neither mutates source fields nor aliases source buffers.
Workspace undo stacks/redone links retain the existing seam; initial projections use admission's owned
detached fork. Canonical state itself is never lent to commands, projections or observers.

Every accepted local/remote transition checks integrated clocks/deletions, normalized integrated content,
pending bytes and the missing-clock map before publishing views or outgoing local updates. Checking only
visible text or integrated vectors at promotion would miss the reproduced later divergence. Normalization
accounts for undo-only deleted content and split Item boundaries; it adds whole-state scans/copies and
still needs memory and low-end latency acceptance. Version-sensitive encoder/store/history details remain
inside the pinned seam and need reevaluation on a dependency upgrade.

An unexpected mismatch closes ordinary access with `projection-mismatch` while preserving durable
originals. Startup reports unavailable / runtime-projection-mismatch; valid pending data is not thereby
classified as corrupted storage. A fresh open constructs a new runtime projection. No silent active undo
reset, carrier rewrite or deletion is authorized. A directed test caught initialization replacing this
failure with its later inactive-session barrier error; the owner now preserves its original failure.

[Native, generated and mutation evidence](./storage-conformance-runs/2026-09-09-pending-projection.md)
covers pending startup, later dependencies, local typing/undo, pressure/privacy, renderer death and explicit
projection faults. It does not establish arbitrary original-record Yjs ordering or pending donor snapshot
handoff. Those are the next core gates before destination/import work resumes; no new wire/storage format
or migration is introduced here. Evidence and three matrix pins advance without obligation/debt payment.


### 2026-09-09 — repair Yjs dependency wake-ups before pending handoff

Phase 2 is committed as `0399567`. Core repair phase 3 uses an exact-version local Yjs 13.6.31 patch to
repair the reproduced integration mechanism. A transport-only ordering rule would leave already stored
original records and serialized pending unions dependent on delivery assumptions. The patch keeps the
existing wire format and receive/storage owners and changes the underlying wake-up conditions instead.

Every missing cross-client dependency records its current lower bound before the integration routine
follows an available reader. That reader can start too late; retaining only its later same-client gap loses
an earlier wake-up. The saved seven-record fixture demonstrates this at client 102 clocks 0 and 5.
After the routine merges the newly parked and previously pending unions, it tests all resulting wake-ups,
including when there was no previous pending union. Satisfied wake-ups are retried before returning.
The native property generator required this second change: canonical/history copies otherwise retained
identical pending bytes but different bookkeeping and the strict projection guard closed access.

No comparison is weakened, no complete-basis redelivery is introduced, and no original-record archive is
added. The existing snapshot update carries unresolved structs and deletion sets. A receiver can finish
a pending handoff from missing original basis after its donor closes, while preserving receiver-local
input and human-only undo. Snapshot acceptance remains an ordinary encrypted receive transaction; it is
not authenticated trim coverage, Account authority or old-writer exclusion.

[Saved, generated, native and mutation evidence](./storage-conformance-runs/2026-09-09-yjs-delivery.md)
holds the patch to original bytes and independent input ledgers. Source/ESM/CJS hashes, lock/workspace
pins, peer resolution and a clean frozen install make the local patch reviewable and reproducible. It is
not an upstream-reviewed release. Existing recursive integration, version-sensitive history/fork internals,
whole-state comparison, memory and input-to-paint acceptance remain independent obligations.

The previous serialized-startup control and semantic partial-merge control now exercise recovered behavior
and are retired from those fault batteries. Their historical evidence remains; current properties require
complete external-string recovery in every generated original order. Conservative incomplete-content
compaction deferral is unchanged and still has its directed policy control. Migration, carrier choice,
pre-active destination/import ownership, source exclusion and default-app cutover remain separate work.
Evidence and three matrix pins advance without obligation/debt payment.


### 2026-09-09 — bind pre-active imports to fresh custody and immutable encrypted receipts

The Yjs delivery repair is committed as `a465310`. The next bounded owner accepts a verified diagnostic
source packet, separately held digest, expected origin/source observation and explicit `markdown-system-v1`
policy. Generated-factor confirmation binds these choices to a fresh Local principal/workspace/store/root
and reservation history. This locally authenticated intent is not source authenticity or old-writer exclusion.
The real carrier/attribution choice in sequencing §5.4 remains open; no downloaded fidelity archive or writable
key/counter restoration is implemented by this preparatory adapter.

The factor-sealed initial custody record and import claim install atomically. A domain-separated HMAC
binds that initial custody MAC, input/plan/policy, immutable timestamp and coarse custody/content/importing/
imported stages. The owner checks exact previous progress and all scoped destination carriers under the
existing exclusive permit. It never writes a Local genesis claim or ready index row. Ordinary custody,
startup, genesis/index mutation and Local open refuse retained pre-active import state. Internal composition
seams retain their trusted-owner responsibility; they are not a sandbox against unlocked same-origin code.

Each bounded action writes its receipt and content in one encrypted update/native commit. Resume validates
consecutive, intent-bound receipts from authenticated disk records before preparing the next action. Final
semantic verification rereads committed ciphertext into a new private document, rather than checking only
the document used to prepare writes. Missing/unknown material refuses; reservations abandoned after failure
remain spent. Every invocation admits at most 1–32 actions, with an authoritative 16 KiB encoded-update guard.
Whole-input planning/history replay still needs memory and latency acceptance.

A directed stress probe rejected the original mutable cursor at action index 2296: overwriting one meta key
under successive Yjs client ids accumulated deletion metadata until a tiny slice exceeded the update limit.
The correction writes immutable per-action receipt keys. A generated restarted-writer regression and an
explicit mutable-receipt control retain this failure mechanism. This is a discovered preparation defect,
not a claim about production prevalence. The separate native repeated-write property is shrunk and saved.

The explicit adapter preserves master/card text, all day files and unfiled bodies, without consulting freeze
or cap. It assigns fresh intent-scoped ids, system authorship, null origin and the import timestamp. Nonempty
archives become collections; empty archive files retain their empty representation to preserve file presence.
Old actor/device/settings/history metadata and unfiled provenance are not promoted into destination authority.
The [construction and evidence](./legacy-import-preparation.md) leave selection, source exclusion and cleanup
to subsequent owners. No obligation/debt status or payment changes with this component.

### 2026-09-09 — make the custody handoff the imported Local active decision

Pre-active import (`a0072e8`) has its own durable marker and freshly generated writable identity. Selection
must not remove that protection based only on an `imported` claim. The new internal owner replays freshly
factor-opened disk records into a new private document, validates every slice receipt and verifies the
selected logical projection against the same source/policy/plan binding. Current source observations
must still match before verification and before the final custody commit. They detect change, not source
authenticity or old-writer exclusion; the host's exclusion precondition remains independently owed.

A signed `selecting` intent precedes the exact Local index route. The route alone leaves ordinary access
blocked. After requiring the exact route to remain present, a single custody transaction compares the
selecting claim, adds the authenticated ready Local claim and deletes the import marker. That transaction's
completion is the active decision. Imported Local provenance has a distinct signed payload domain, including
its presence, source/plan/policy, timestamp and selecting MAC. Existing fresh Local claims keep their format
and payload. Neither selection nor resumption restores live custody, writable keys, content or counters.

Before the active decision, resume always repeats cold destination verification. After it, resume verifies
the recorded selection and current route/census without reimporting or requiring today's document to equal
the old payload; later admitted edits must survive. Ordinary open still owns current record/journal recovery.
A missing completed index refuses rather than being recreated. A directed omitted-route fault exposed the
need for the explicit last route-presence check; its native regression and control are retained with evidence.

The default application does not call this owner. The explicit Markdown/system adapter does not settle
sequencing §5.4. The existing Local clear owner refuses imported selections until source cleanup can be
composed, avoiding a clear result that leaves the original app-managed plaintext behind. Authenticated,
resumable source DB/WAL/ancillary cleanup is the next bounded phase under seeded exclusion; production
exclusion and real cutover acceptance remain separate gates. No obligation/debt status or payment changes.

### 2026-09-09 — Version cleanup bulk MAC framing; preserve existing signed v1 intents

The native cleanup campaign exposed a source accepted by the reader/importer but rejected by cleanup's
65,535-byte MAC field encoding. Database hex JSON, local values and full manifests can all exceed that width.
New cleanup intents use manifest version 2 with dedicated domain-tagged UTF-8 JSON-array MAC messages and a
versioned fingerprint KDF domain. The shared custody `fields()` construction stays unchanged. Existing v1
intents retain their original MAC/fingerprint bytes and version while resuming; there is no cross-version
verification fallback. The manifest version is authenticated and unknown versions refuse. This is an internal
preparatory format change, not approval of old-writer exclusion, default cutover or maximum-size performance.
See [focused evidence](./storage-conformance-runs/2026-09-09-legacy-cleanup-size-repair.md).

### 2026-09-09 — Derive migration restart state from existing authenticated owners

The bounded native source-cleanup campaign now passes in full; the next coordinator is specified in
[legacy-coordinator-preparation.md](./legacy-coordinator-preparation.md). It will inspect one explicit Local
slot and dispatch one requested component step, with fresh permit-bound verification. Existing import,
selected Local, cleanup and clear records remain the durable authority. No separate coordinator cursor,
index-as-active decision, source-binding replacement or completion certificate is introduced.

After selection, current edits belong to the destination and cannot be checked against or overwritten by
the old source payload. Once cleanup begins, resumption uses the authenticated exact manifest, not a new
whole-source capture. The original externally saved/cold-verified packet and factor remain required by
maintenance APIs; missing input does not authorize reminting or rollback. Ordinary selected Local open has
its existing independent recovery path and need not wait for cleanup or possession of that packet.

The composed seeded host must retain exclusion between calls, invalidate restart epochs, cancel on observed
loss and wait for native draining. A blocked deletion can still settle after cancellation; neither an epoch
assertion nor a timeout cancels it. No in-page exclusion flag/token supplies production browser authority.
Production supported-version exclusion, a real recovery-save/readback ceremony and sequencing §5.4 remain
default-app/live-cutover gates. This is a preparation decision, with implementation and falsifiers still owed.

Reread the three conformance debts after adding this execution checkpoint to the matrix. Their requirements,
owners, gates, statuses and payment conditions still apply unchanged. Re-pinned only their
`docs/storage-conformance.md` inputs to `7e3f4cce55f1`; the bounded component pass does not pay any of them.

### 2026-09-09 — Separate terminal observation from deletion in the private migration coordinator

The private coordinator is implemented against the existing authenticated import, selected Local, cleanup and
clear records. It stores no second durable phase. Inspection releases its lifecycle permit before entering
public owners, which reacquire exclusion and recheck their own state. Wrong/missing input and a lost selected
route never fall back to fresh identity creation. Selected editing remains independent of the recovery packet.

Added `verifyLegacyCleanup` as a read-only entry point to the existing cleanup owner. It requires terminal
signed progress under its own permit before reaching any deletion loop, repeats current destination DB/WAL
and source-absence checks, then the coordinator separately opens/closes ordinary Local recovery. This avoids
a stale inspection accidentally authorizing resumed deletion. The resulting observation is not persisted as
a completion certificate; the external host still needs a current unbroken exclusion epoch.

The seeded controller now reports first exclusion loss, allowing the harness to cancel the coordinator and
stop dispatch. Close remains pending while native deletion drains; a competing writer stays excluded.
[Native evidence](./storage-conformance-runs/2026-09-09-legacy-coordinator.md) tests these gaps and later edits,
including source/route/clear changes after inspection. The generated failure was a harness assumption about
which bounded call reaches import completion; its corrected schedule and exact replay are retained.

Production supported-version exclusion, host recovery-save/readback, real carrier choice and default-app
cutover remain separate work. Reread all three conformance debts; only their matrix input hashes advance to
`0d492c62fe48`. Requirements, owners, gates, statuses and payment conditions are unchanged.

### 2026-09-09 — Test host feasibility before bridging production migration

The next bounded build is the [persistent-profile host preflight](./legacy-host-preparation.md), limited to
measuring predecessor exclusion, preserving source and independently rereading the recovery file. It may
control a disposable seeded browser, but cannot enroll/import/select a destination or delete source/site
storage. The private coordinator is committed as `7d238ee`; its existing authenticated owners stay private.

Do not promote service-worker client enumeration, new Web Locks, request blocking, after-creation callbacks
or a branded epoch into browser authority. Investigate an external pre-execution controller with explicit
target/version coverage and loss/restart falsifiers. A missing capability or counterexample means unsupported;
it does not justify default-app integration. No production utility/platform choice is made by this test.

The source inventory must cover the conditional lib0 localStorage broadcast fallback before claiming full
cleanup. Preserve unsupported keys; an authenticated extension requires its own bounded work. Also preserve
the distinction between disk-recoverable legacy data and unflushed visible edits before terminating old
contexts. Recovery save/readback is a host-owned disk boundary, with the mandatory factor held separately.

Keep current same-origin binding checks. A deployment-origin move, remote-source reconciliation, durable
retirement of old routes and the real carrier/attribution choice need later explicit contracts. No new host
progress record or success token may replace authenticated component state. The existing conformance matrix,
three input pins and all debt requirements/statuses remain unchanged by this preparation.

### 2026-09-10 — Reject the measured host candidate; retain the whole-browser persistence boundary

The [persistent-profile preflight](./storage-conformance-runs/2026-09-10-legacy-host.md) returns no production
migration authority. The tested CDP auto-attachment controller allowed first-script page/frame writes and a
crash-restored cached old application at a maintenance URL. Keep this implementation as a diagnostic tool;
revise the host strategy before any coordinator bridge. A completed test campaign means the observations
and refusals were checked, not that exclusion succeeded. Finite paused-worker observations, history reload
and a rejected second process cannot fill BFCache, installed-window or production-profile coverage gaps.

Native generation also invalidated an implicit assumption that successful localStorage writes/removals force
physical persistence across whole-browser kill. Define the readonly carrier baseline after a clean profile
reopen, including after deliberate source drift, and retain separate unsettled-source counterexamples plus
their exact saved inputs. An external saved packet still recovers its captured ledger. This is an explicit
fixture/protocol-acceptance boundary, not a justification to erase failures or silently extend earlier
renderer-death evidence to browser/power loss. Whole-browser acceptance and preservation of visible unflushed
legacy work remain owed before a live migration procedure.

The dependency fallback's native plaintext carrier remains unsupported by the current cleanup manifest.
Preserve/classify it; do not expand deletion by heuristic URL keys. No deployed carrier footprint, production
utility/origin choice, migration-carrier decision or debt payment follows from this experiment. Mandatory
factor custody, authenticated component progress and same-origin binding contracts remain unchanged.

### 2026-09-10 — Move the next host experiment's denial before browser startup

Use [cold-start global execution denial](./legacy-host-cold-start.md) as the next seeded experiment, in a
disposable Linux runtime with mandatory browser policy installed before the source profile launches. Keep
policy independent of the debugger/controller lifetime. Origin-scoped blocking leaves the documented
cross-origin top-level embedding case; more target callbacks do not repair the measured pre-attachment gap.
No website or maintenance path gets a JavaScript exception. The first observer uses narrowly permitted storage
protocol commands; an inability to read exact bytes with execution denied is an unsupported result.

This selects a falsifiable prototype, not a supported production profile/platform, cleanup capability or
migration authority. Pin and verify the real runtime/browser/policy; do not install global policy on the
user's host or clone a real profile to make the test possible. Missing/ignored policy, worker/background gaps,
controller/browser death and second-process entry need native controls. No current browser API documentation
is treated as proof that every restored worker is stopped. Offline reading/custom hosting remain alternatives
if denial or bounded exact observation fails.

Require the explicit clean-reopened source basis for this first experiment. A later live procedure must
preserve or settle all visible old edits before termination; uncertain settlement refuses first intent.
Successful temporary denial still cannot be removed to enable the modern app until lasting old-executable
and transport retirement has its own owner/evidence. Source binding, mandatory factor custody, full residue,
real carrier choice and all debt payment conditions remain unchanged. No runtime implementation or new native
campaign accompanies this preparation.


### 2026-09-10 — Keep cold-start denial as a private readback experiment, not host authority

The [bounded native diagnostic](./storage-conformance-runs/2026-09-10-legacy-host-cold.md) supports further
readonly source/packet parity work in the measured synthetic Debian/Chromium runtime. Mandatory global denial
preserved exact carriers through the exercised page/frame/worker-attempt, controller-death, cold restart and
cached/direct legacy executable cases. The source-only policy produced the foreign-top-level write and is
rejected as the containment boundary. Keep execution denial independent of debugger lifetime.

Credit only exercised controls: four invalid-policy canaries write; recommended-only configuration refuses
but its user-override write remains unproven. Worker/background delivery, actual BFCache, installed windows,
dynamic late policy installation/removal and wider profile entry are not established by this result. Passing
bounded diagnostics does not issue production authority or pay whole conformance obligations.

The protocol reader must continue to refuse moving/unsupported source and must never enable source JavaScript
as a fallback. Positive controls deliberately run writers and may wait for a complete read after recording
metadata drift; denied reads fail on drift immediately. Native generated sequences preserve first inputs and
executed prefixes without shrinking a contaminated profile. The separate byte/pagination property tests retain
shrinking. No unsettled browser-death observation becomes a lossless live-shutdown promise.

Next, reuse/extract the existing production parsing/digest/packet rules for private readonly parity. Keep
same-origin binding, mandatory factor custody and authenticated owners intact; a protocol census alone cannot
permit capture substitution, selection or cleanup. Releasing denial, lasting executable/transport retirement,
real carrier/attribution, remote-source reconciliation, whole-profile residue and review remain separate gates.


**Runtime ownership refinement.** The readonly mount must be paired with inherited `NoNewPrivs=1` for the
browser/controller process tree: Lima's default guest account otherwise retains passwordless sudo. Native
checks now reject elevation via `sudo -n true` while the sandbox and full campaign still pass. Credit the
rerun with that boundary; an ordinary permission error on a policy file alone is insufficient evidence that
the controller lacks policy-removal privilege. The separate privileged namespace/watchdog owner remains trusted.


### 2026-09-10 — Personal development cutover through the existing importer

There is no deployed instance or external user to migrate. The author accepts the existing private
`markdown-system-v1` semantics, including system attribution and metadata/history losses. Record this as
[TRD row 21](./selections/row-21-development-cutover.md) and sequencing §5.4's selected product choice. Stop
expanding automatic migration-host experiments into requirements for this one-person cutover. Preserve the
experiments and their limitations; they do not become supported host authority. The author operates the
personal browser. Retain verified recovery backups and use an explicit operator-assisted procedure through
the existing authenticated owners. A ZIP or relay snapshot alone is not a source-bound import packet or
cleanup capability. Conformance and review requirements are unchanged.

### 2026-09-10 — Stage Local startup before switching the main editor

Use `/local.html` for the first bounded application integration: classify, confirm a generated factor,
unlock/resume, and expose a read-only verified preview. Keep the ordinary app entry until every editor mutation
surface is routed through admission. The Local actor is the authenticated principal; its device label is
Local attribution only, not an Account credential. Do not use the legacy plaintext identity cache or attach
transport. Lock/cancel drains the owner, including a late open. Both HTML entries must have packaged offline
coverage and pass the existing initial-JS budget separately. Real import/cutover follows editor integration.

### 2026-09-10 — Make the admitted Local workspace the application editor boundary

With [bounded editor evidence](./storage-conformance-runs/2026-09-10-local-app-editor.md), switch both built
entries to Local startup and the existing editor UI through admitted text surfaces and workspace commands.
The active UI consumes read snapshots and does not open a legacy Store or writable transport document.
Pending editor input remains owned by admission, with retry/discard; compose retains its draft until
acceptance. Preserve local CodeMirror selection across accepted operations that do not change its text.
Destroy editors before lifetime close and remove visible content on lock/invalidation. Recoverable storage
blockage must not lock the user out of retrying or discarding the pending work.

Save identity/preferences explicitly through separately acknowledged commands. Store the device's display
label in encrypted metadata keyed by the Local device ID, without changing authenticated identity or using
the legacy plaintext cache. Actor/device-label/rollover metadata remain outside content undo. The menu's
Markdown export covers accepted writing and is not an authenticated migration packet. No relay is attached
to Local; Account/transport and automatic compaction scheduling retain separate integration work.

This local build switch does not perform the author's browser cutover or revive automatic migration-host
research. Rehearse the existing private capture/recovery/import/selection procedure next, retaining verified
backups and author-controlled browser interaction. Real source cleanup and all remaining conformance/review
obligations are unchanged.

### 2026-09-10 — Keep the personal migration page private and stop at a recoverable selected destination

Use the [development-only operator page](./private-migration-procedure.md) to connect the existing coordinator
to the sole personal cutover. The author owns stopped editing, disconnected relay and closed old clients.
The page refuses an observed service-worker registration/controller, but that observation and the operator
checkbox never mint general old-writer exclusion authority. Keep automatic policy-host research stopped.
Serve the page explicitly from the existing source origin; exclude it from the normal build/menu/precache.

Download a recovery packet and separate binding record outside browser persistence, restart and reselect the
saved files before enrollment. Preserve the generated-factor confirmation boundary and original factor/input
on restart. Import calls remain bounded to eight actions; selection and editor opening are separate actions.
No UI checkpoint, URL parameter or saved plaintext copy replaces authenticated component progress.

This page ends at ordinary Local unlock/recovery and subsequent edit/export verification. It exposes no
source-cleanup action and does not label selected metadata as complete migration. Retain the source and
external backups until the separate operator cleanup step has its existing preconditions. The seeded UI
rehearsal changes no conformance debt, real-profile residue claim or independent review requirement.

### 2026-09-10 — Separate network positions from seal attempts and retain source at admission

Private outbound preparation reproduced two defects in the older network budget model: repeated crashed
mints reuse one position count, and separate credentials derive the same v1 key. New private envelopes
therefore require v2 with workspace, signing credential and generation in the key derivation. Retain v1
vectors as historical readback and refuse v1 minting or implicit downgrade. Every future encryption
attempt must have its own durable reservation; retries of persisted envelopes reuse the exact bytes.
This is a construction correction, not native spool or relay completion.

A real Account journal/crash reproduction also shows that accepted-update observers cannot supply
outbound durability. Build encrypted source capsules into admission before allocating network positions.
Preserve capsule identity, attribution and exact updates through journal flush and content compaction;
retain remote envelopes under their original source credentials. Start the initial capture implementation
at verified frozen genesis with an authenticated reader-version fence. Already-edited v5 Account histories
need a separate verified catch-up checkpoint before publication; do not infer their source history from a
compacted snapshot. No real Account exists yet, and the author's Local migration remains intact.

The [outbound contract](./account-outbound.md) records the concrete bytes, proposed transaction boundaries,
remaining refusal-proof carrier and required native evidence. Public Account receive, relay publication,
rotation and second-device enrollment remain disabled until their owned integrations exist.


### 2026-09-11 — Pin private first-genesis bytes before expanding Account authority

Keep the current private first-epoch genesis's accepted-head vector empty. Local writing enters via the
checkpoint; no Account network position has been accepted. The certified member still exists, and the
first envelope starts from zero link. A member/position-zero vector hashes differently and is not an
alternate encoding. Apply the exception only to first genesis, with rows 5/7 and TRD amendments in the
next format/vector phase; do not infer sparse-vector behavior for later epochs or existing streams.

Preserve the current ordered first-authority JSON/LP/domain/hash bytes and receipt v2. Preserve the
strict recovery v1 payload as raw X25519 scalar, binary root commitment and raw Ed25519 bootstrap seed,
32 bytes each, sealed to exactly 112 bytes. The old scalar-only 48-byte vector is historical evidence,
not an accepted alternate payload. Publish amended vectors and normative homes before treating these
contracts as closed. No real Account receipt exists. The [prep](./account-crypto-prep.md) separates
source-inventory coverage from authority-map and independent-vector completion, in four bounded groups.


### Retire the intermediate Account v8 product paths

**Date:** 2026-09-12 · **Commit:** working tree after signed `1372c39` · **Against:** PRD v9 / TRD v8

**Orientation.** Review findings F-08/N-04 and N-09 concern the intermediate Account v8 sender/driver.
The user confirms that these paths have never held customer data or personal dogfood data and sees no
reason to ship an intermediate implementation. The current composed owner is v9; its preparation/tests
still use some v8 code. This stage number is unrelated to the TRD document's version.

**Decision.** Do not ship or support the v8 product entry points or promise compatibility with their
intermediate persisted workspace state. Dispose those v8-only findings by non-shipment, without further
hardening. Retain setup/test dependencies temporarily where v9 needs them; remove that scaffolding in
its own bounded cleanup. Requirements on code actually used by v9 remain in force. The historical review
responses stay unchanged; the current findings index records this explicit product disposition.

### Record the authorized unsigned phase boundary

**Date:** 2026-09-12 · **Commit:** assessment of `9ff48b5` (documentation intake follows) · **Against:** PRD v9 / TRD v8

**Orientation.** The user explicitly authorized successive unsigned commits through the sync-liveness,
privacy, failures/recovery and storage/responsiveness phases, with phase summaries and a reminder to
sign later. Q-06 asks that this intentional state be discoverable within the repository. The phase
records already state the authorization; an external reminder is not a repository gate.

**Decision.** Record the eleven unsigned commits after signed `1372c39`, from `0e07fe4` through
`9ff48b5`, with full original commit/tree IDs in the [Q intake record](./review/implementation/addendum-393ef43-9ff48b5.json)
and a readable [phase table](./review/implementation/findings.md#q-06-intentionally-unsigned-current-chain).
This records the user's existing temporary authorization, not a permanent waiver or a new signing
action. Signing remains outstanding. A later signing operation must preserve historical tested IDs,
source hashes and receipts, then add an original/replacement/tree crosswalk like P-04. Rewriting commit
metadata alone does not invalidate unchanged tested bytes; altered source trees need applicable fresh
validation. No history rewrite or additional runtime work is performed by this review intake.


## Preserve review identities through the next signing sweep — 2026-09-13

The user requests signing the outstanding unsigned commits after the R review intake, with an
explicit pause until keyboard confirmation. At `6ba7c22` the linear chain contains thirty unsigned
commits after signed `1372c39`. Prior eleven/seventeen-commit records describe their own historical
boundaries and remain intact. Signing has not started.

Use the prepared per-commit tree/parent/message/metadata inventory, preserve old objects under a local
backup ref, verify every signature and identical tree, and move the live branch only after the whole
replacement chain is verified. Keep historical evidence and review hashes unchanged with a permanent
old/new crosswalk. Migrate the three executable before-source lookups to equivalent signed IDs so a
future checkout does not depend on the unpublished backup ref; arbitrary unit-test labels can stay.
Reconcile current navigation and generated plans in a separate signed follow-up commit, with its own
applicable validation. Revision-bound receipts keep their original identity; signing does not turn
staged historical campaigns into an immutable aggregate. See
`docs/review/implementation/signing-prep-2026-09-13.md` for the execution and recovery checks.


## Complete the authorized signing sweep without relabelling evidence — 2026-09-13

The user confirmed keyboard availability, then all thirty reviewed unsigned descendants of `1372c39`
were replaced with verified signed commits ending at `3e53b4a`. Original trees, message bytes and
author/committer metadata are preserved; a local backup retains the original `6ba7c22` lineage.
The permanent crosswalk and current phase navigation distinguish original measurement identities
from signed branch locations. Historical review/evidence and intake snapshots remain unchanged.

Three executable before-source references now use identical signed counterparts so future checkouts
can run them without fetching the unpublished backup branch. Generated inventory/manifest data were
regenerated with unchanged coverage obligations. This is the narrow exception to preserving old IDs:
current executable dependencies and navigation move; historical source-bound evidence does not.
Focused affected controls pass, and the review/documentation/baseline reconciliation is a separate
signed checkpoint. Signing proves commit authorship and tree identity, not a new aggregate result.
The temporary signing-progress ref can be removed after the verified reconciliation commit; original
history backup refs remain. No remote push or personal-instance operation is part of this decision.


## Separate current envelope admission from historical readback — 2026-09-13

R-01 narrows new sender/sealer admission to the current receiver's exact complete-wire/count/decoded
bounds and applies the visible wire cap before any new service decision. Historical structural codecs
must remain broad because the service uses them to authenticate its existing ledger. Known local
oversize consumes no new position or invocation; an old sealed wire without a submission consumes no
new submission. Existing submissions retain exact retry because a lost acknowledgement may conceal
an earlier acceptance. An unsigned `envelope-size` service hint only stops automatic retry.

Current receive `inbound-size` and HTTP `response-too-large` retain durable state and need an explicit
retry. These observations never authorize replacement, skipping, re-sealing or deletion. The private
creating-member workflow trusts its member to produce conforming decryptable updates; the service
cannot prove encrypted counts, actors or Yjs semantics. A small 256-update service-to-receiver case
keeps that residual executable. General membership needs a malicious-member recovery policy under
F-09 and membership/revocation work; already accepted invalid positions cannot be silently overwritten.
A future compatible reader or authenticated baseline/lineage recovery is separate work. See
`docs/review/implementation/service-receiver-bounds.md` for boundaries and retained validation.


## 2026-09-13 — General validation begins with the five property-deadline suites

The first general adapter takes the concrete R-03/N-06 Vitest obligations before broadening general
Node/Vitest families. Only an explicit reviewed file allowlist resolves. Literal registration ASTs
provide an independent denominator; runtime collection, exit zero or a wrapper's prior green result
cannot define the expected population. The ordinary test config/setup stays in the frozen identity.
Whole package/wrapper selections remain separate obligations.

Use explicit 60-second limits for the five existing generated properties, preserving all 515 histories,
seeds and assertions. Sequential one-fork stages receive 180 seconds plus bounded drain. Current
1.1–6.2-second property measurements and historical loaded-host failures justify finite margin, not a
universal load guarantee. Keep partial progress, error message and stack, seed/path/counterexample and
explicit process-drain evidence. No automatic retry or deadline increase may turn a failure into credit.
R-04 live/archive style scope and the full immutable aggregate remain subsequent work.


## 2026-09-13 — General test credit requires an explicit fixture and process disposition

Supported registration syntax does not automatically qualify a discovered test file. Keep an explicit
reviewed policy for ordinary Vitest and Node protocol files, verify it against fresh inventory and
compute exact case identities from source before execution. Generated registrations, native browser
ownership and deliberate nested owners require separate reviewed adapters. A direct Node format-file
receipt does not discharge its wrapper's optional artifacts, mutation variants or prerequisites.

Node reports retain wrapped assertion errors, seed/path/counterexample diagnostics and completed-case
progress while running. Require terminal reporter completion for success; timeout progress remains
failed evidence after drain. Preserve the actual signed old reporter as the diagnostic-loss control.
The manifest's existing 700 kB limit stays in force; compact its representation before future adapter
expansion would exceed it, without dropping case identities or unresolved obligations.


## 2026-09-13 — Generated case identities come from finite declarations and pinned data

Generated registration is not permission to execute arbitrary test code while planning. Expand only
reviewed literal data, lexical bindings, for-of loops, tuple/suite tables and explicit JSON inputs.
Carry function metadata opaquely; helper invocations still need a separate disposition. Reject
ambiguous duplicate names and unsupported registration syntax rather than learning the denominator
from a green report. Bind vector bytes as well as names, check them before launch and reconcile every
runtime case. Registration-data metadata is defined only for Vitest; other stage types must reject it.
The own-field filter subset excludes inherited-property keys to avoid different JavaScript semantics.

Use one complete manifest obligation per line, retaining the schema and every parsed value. The
700 kB ceiling is unchanged; schema/coverage reduction is not a substitute for compact formatting.
The generated layout belongs to the manifest writer; R-04 must retain that explicit formatting scope.
Whole wrapper postconditions and historical partial-model limits remain separate from file receipts.


## 2026-09-13 — Label ambiguous scenarios and explicitly admit synthetic service fixtures

A tuple's first formatted value is not necessarily a unique case identity. Give distinct delivery
histories stable scenario labels; retain their exact event construction and assertions in opaque
builders executed only by the test. Do not broaden the planner into executing arbitrary helpers or
collapse duplicate scenarios to make the case census pass.

Temporary SQLite, synthetic credentials and copied-source mutants can use the ordinary Node file
adapter after explicit fixture review. Inherited IPC crash workers must stay under the same bounded
owner; an otherwise passing case with a leaked worker fails and drains. Parsing alone does not admit
other fixture files, browser owners or wrappers. Optional campaign exports and wrapper postconditions
keep separate obligations even after all their ordinary file cases have adapters.


## 2026-09-13 — Boolean data branches preserve existing service-test identities

Admit a conditional registration-data expression only when its guard resolves to a boolean under
the finite reader. Select its corresponding data branch with ordinary lazy semantics. Do not coerce
other values to truthiness or execute helpers. Conditional test registration itself remains outside
the adapter. This retains the activation race test's existing names without changing product tests.

Recovery, promotion, activation and handoff service files use the existing bounded inherited owner
after explicit import/fixture review. Preserve independent wrapper artifacts and native obligations;
passing an in-file mutation assertion does not grant its optional exported counterexample artifact.
Shared reader changes warrant actual Node/Vitest controls and the existing generated registrations
as regressions, while preserving every older stage contract and case identity.


## 2026-09-13 — Reviewed historical Git inputs must enter receipt identity

A current checkout hash does not bind bytes read by a test through historical `git show` expressions.
For explicitly reviewed Node fixtures, record the original reference, resolved full commit, source
path and SHA-256 in the stage contract. Read the exact expression used by the fixture, preserving
Git replacement semantics; bound each read's time and output. Validate metadata, check before
launch/reuse and after execution, and include it in the receipt key. Do not grant historical variant
credit based on a current checkout or an abbreviated revision alone. Other result adapters reject
this metadata until separately reviewed.

Synthetic replacement controls must demonstrate changed history with unchanged checkout identity,
refusal before launch/reuse, and a failed drained receipt when the case passes but its historical
input changes. Explicit replanning may adopt different bytes only under a different receipt key.
These cooperative pre/post checks have the same transient/hostile-change limits as source checks.
Service fixture admission preserves binary IPC ownership, exact cases and independent wrapper/native
obligations; old source used for compatibility or size fixtures does not revive retired v8 support.


## 2026-09-13 — Shared-account fixtures retain their mutation and wrapper boundaries

Admit the reviewed isolation service files under the existing Node owner without changing their
case bodies, generated populations or deadlines. Two accounts may share synthetic databases while
per-history cleanup closes handles and removes directories; crash/concurrent workers remain in the
inherited process group. Reconcile all five file denominators and keep wrapper obligations separate.

A test requiring a generated mutant history to fail and shrink is a passing detection case, not
its requested run budget of positive histories. Credit its actual assertions while leaving optional
exported histories/metrics/counterexamples to wrapper verification. Describe an oracle's dependence
on observed initial rows instead of claiming independent derivation of every field. A wrapper that
still calls a retired v8 fixture needs an explicit disposition before certification; direct current
file execution does not re-admit retired support.


## 2026-09-13 — Ledger runtime inputs and failed ownership evidence stay explicit

Admit reviewed in-memory ledger builds under the existing Node owner, keeping Vite configuration
loading and output disabled and every original test assertion/population intact. Pin the exact
historical spoolRecord source path used by the batch reader; do not broaden this to arbitrary src
paths. Vector-file reads enter ordinary source identity, while generator checks and optional
wrapper exports retain separate obligations. Preserve the witness's coordinated-rollback limitation.

Exercise historical drift controls on both old and newly admitted paths. Preserve an initial owner
failure even if later focused and unfiltered runs pass. Add optional pre-cleanup receipt capture to
the historical control helper without relaxing process rules or deadlines. An unreproduced orphan
classification has an unresolved cause, not an established fix; carry it into owner/aggregate
reliability work. Evidence packing must distinguish text from binary auxiliary output and retain
binary bytes with their encoding/hash, rather than silently dropping non-UTF-8 files.


## 2026-09-13 — Contract control/export file credit stays distinct from campaign exports

Admit the reviewed recovery, transport and service-custody control/export files under the existing
Node fixture owner. Keep generated names statically enumerable, test bodies unchanged and source
mutation anchors exact. Transport omission controls establish bindings at the actual verification
boundary; they do not establish all enclosing owner predicates. Private-export clearing assertions
cover captured owned buffers and must not be promoted to a forensic memory-erasure claim.

Keep two meanings of export explicit: these exports.test.mjs files test cryptographic provider
output; optional ACCOUNT_REPORT_DIR JSON and wrapper evidence inventories need their own saved-output
postconditions and ordered prerequisites. Passing ordinary cases does not discharge those wrappers.
Retain prior process-control evidence when the owner is unchanged, including the ledger phase's
unresolved initial orphan classification; later passing file selections do not establish its repair.


## 2026-09-13 — Review fixture effects independently of filenames and preserve existing bounds

A Node filename does not imply a browser-free fixture. Admission receipt/size evidence must use
stage-owned Chromium and temporary service ownership. Borrow the owned endpoint without fallback,
close each context explicitly, and register cleanup before setup. Keep standalone campaign launches
available when no release owner is active. Preserve existing six-minute campaign bounds and
individual test deadlines; do not derive a new bound from a passing or failing timing observation.

Extend static declaration evaluation only for the reviewed finite numeric >= comparison needed by
signed boundary titles. Pin every historical source the protocol fixture reads, with an exact new
protocol path, retaining prior stage contracts. Keep native descriptor injection, actual Yjs size
edges, earlier outbound models, registry obligation checks and runtime cryptographic evidence
separately described. None substitutes for the others or discharges a whole-wrapper obligation.


## 2026-09-13 — Pin reviewed declaration modules and historical test oracles as inputs

A test's expected case population may come from a helper, but planning must not execute that helper.
Admit only the reviewed delivery-oracle controls export through a finite literal reader, pin its full
bytes in the stage contract and verify them before launch/reuse and after execution. Changing only
patch values still invalidates the receipt. Keep Node module metadata restricted to that explicit
consumer/helper pair; this is not permission to import arbitrary registration modules.

Historical test code can determine expected outcomes just as historical product code can determine
runtime behavior. Pin the old delivery oracle test and every source in the parser baseline bundle.
Retain exact reference/revision/path/hash tuples through normal historical drift checks. Distinguish
expected-failure/shrinking controls, finite exhaustive model domains, structural parser acceptance
and cryptographic authorization when reporting the resulting evidence.


## 2026-09-13 — Keep admission limits distinct from historical readback in transport evidence

R-01's 512 KiB fresh-envelope admission rule does not narrow the historical decode/read/retry
contract. Repair the stale v1 size fixture by requiring fresh oversize refusal, seeding historical
accepted decisions with the actual signed pre-R-01 implementation, and using current code for all
readback and retries. Pin that historical source through the existing receipt metadata. Add a
separate exact current admission-edge case; do not reduce the old large-payload pagination assertion.

The historical fixture's added seeding and retry work needs the same finite 90-second test allowance
already used by the equivalent inbound historical fixture. Retain its earlier 40-second timeout as
failed evidence and keep the outer owner bound unchanged. Preserve the old wrapper/browser exclusions;
shared service evidence does not revive support for the retired v8 product lifecycle.


## 2026-09-14 — Receive-transport browser fixtures preserve their whole-file bounds

The three receive-transport test files enter the existing inherited-group adapter with an owned
Chromium/CDP fixture and an explicit selection. Preserve their original wrapper deadlines separately:
controls 90 seconds, generated 330 seconds and native 120 seconds. The two previously integrated
admission-evidence browser files retain six minutes. Browser ownership alone does not choose a
uniform test deadline. Finite case identities, per-test bounds, populations and assertions stay intact.

Reuse the reviewed promotion fixture's borrowed CDP connection and cleanup registered before setup.
No historical input contract is inferred from dormant mutation branches in shared helpers; the
selected calls do not use those branches and the owner clears ambient fixture-control variables.
Optional JSON exports, original wrapper ordering/prerequisites and saved-output postconditions remain
separate obligations. Distinguish real service HTTP, independently signed fixture pages, renderer
crash and same-context page reopen when stating the evidence's scope.


## 2026-09-14 — Separate receive scheduler and browser fixture ownership

The receive-driver selection explicitly admits four complete files. Its five scheduler omission
controls use a copied TypeScript module and virtual clock, with no browser; only generated histories,
final dispatch controls and native cases receive an owned Chromium/CDP fixture. Preserve each file's
reviewed whole-file bounds, rather than inferring ownership from the directory name. Existing case census and process ownership need no implementation changes.

The initial native run exhausted the original 120-second file bound after seven passing cases.
Signed history shows four R-01 cases were added after that bound was set for five cases. Use
180 seconds for the complete nine-case file in both adapter and wrapper; keep its individual
45-second limits and every assertion. Preserve the failure and partial report. Other file bounds
remain unchanged. This calibrates one fixture suite, not loaded-host aggregate reliability.

Generated fixture pages and simulated navigator connectivity remain distinct from the real service
polling case. Prior scheduler Vitest/property checks retain earlier evidence. Whole-wrapper ordering,
prerequisites and optional JSON exports require their own postconditions. Signing completed phase
commits reconciles navigation and the recorded staged tree without rewriting historical receipts.


## 2026-09-14 — Pin historical sync builders and preserve real scheduler imports

The Account sync/composition selection explicitly separates five virtual-clock Node scheduler
controls from four files that need owned Chromium. Preserve complete case identities, individual
case limits and generated seeds/populations. Use the four existing sync wrapper file deadlines and
300 seconds for the batch file, the limit previously shared by the liveness ownership group. The
single-file budget does not certify that multi-file group or its ordering/output prerequisites.

A copied scheduler with a newly added runtime import must resolve the real protocol module, including
its actual error class. Rewrite exactly that import in the fixture and retain the failing baseline;
do not remove the dependency or substitute an error stub to make mutation checks load.

The two actual historical sources used by the oversized-spool builder join the explicit historical
locator allowlist and native receipt. Keep bounded git reads and verify bytes before launch/reuse
and after execution, with real Git replacement controls for both paths. The current sealer mutation
is separately pinned in fixture source; this is a composite test builder, not a complete old app.
Dormant historical branches in other helpers receive no inferred execution credit. Batch reports
written inside the disposable checkout and optional JSON exports remain separate output obligations.


## 2026-09-14 — Preserve receive/editor fixture boundaries and pin the old reader

The core receive and ordered editor files enter the existing owned-CDP adapter as complete files,
retaining their distinct 300/480-second wrapper deadlines, individual test bounds and generated
populations. Pin the exact old promotionRecord reader in the core file's receipt and bound its Git
read; do not infer historical-input execution from dormant branches in other imported helpers.
The existing allowlist and historical drift controls already cover this path.

Keep distinct evidence claims for atomic receive storage and ordered visible publication. Core
histories check durable progress at each step and replayed text at the end; editor histories additionally
check writing and local source counts after each action. Independently signed fixture pages do not
establish service HTTP delivery. A new page in one browser context and CDP renderer death do not
establish whole-browser/power-loss or second-device behavior. Retain the v8 exclusion: seeding and
fencing an intermediate format in a fixture is not support for shipping that app. Wrapper output,
ordering and prerequisite postconditions remain separate from direct-file execution.


## 2026-09-14 — Preserve spool native crash oracles and historical identity

Admit the complete spool native file with its existing four-minute wrapper deadline and unchanged
case limits, assertions and generated population. Pin the exact historical promotionRecord reader
used by this file, bound its Git read, and reuse the existing owned-CDP and historical drift contracts.
Do not infer execution from dormant historical branches elsewhere in the imported fixture chain.

Keep exact-wire, source-coverage and external invocation-count observations distinct. Native transaction
cuts and a Node observer support the stated crash/accounting checks; they do not establish nonce
uniqueness, power-loss behavior or an independent cryptographic oracle. Generated histories check after
each step and final drain, with cold reopen only at selected crash boundaries. Preserve that limit
instead of describing a final cold replay that the test does not perform. Wrapper saved outputs,
ordering and prerequisites remain separate from direct-file execution; intermediate-format activation
fixtures do not revive retired product support.


## 2026-09-14 — Preserve durable delivery proof and restart fixture boundaries

Admit the complete delivery native file with its existing eight-minute wrapper deadline, unchanged
case limits and eight generated histories. Pin and bound the exact historical promotionRecord reader;
reuse existing owned-CDP and historical drift contracts. Dormant helper branches add no historical
execution claim. Intermediate-format activation in a fixture does not restore v8 as a supported product.

Keep independently signed response framing, separate derived-state oracles and native storage cut
observations distinct from actual service HTTP decision issuance. Exact-retry cases compare bytes;
commit-cut cases additionally establish entry counts and duplicate/retry behavior. Generated final
reopen compares status, envelope bytes and source capsules, not visible text. Authority-change controls
establish the checked boundary without promising atomicity against arbitrary out-of-protocol writers.
Wrapper outputs, ordering, prerequisites and complete immutable qualification remain separate obligations.


## 2026-09-14 — Preserve read-only decision evidence and mutation scope

Admit the complete decisions native file with its existing two-minute bound, case limits and eight
histories. Existing helpers and test bodies need no repair. Pin both runtime vector inputs in the
frozen source identity; do not infer historical execution from dormant helper branches or vector
regeneration from runtime reads. Retain whole-wrapper output and prerequisite obligations separately.

Describe the assertions actually made: inventory is unchanged after every generated inspection,
spool status is checked before close, and final reopen compares envelope bytes. Do not turn the case
title into an after-reopen source/counter/text assertion. Distinguish the parent mutation's shared
signing/verifying message change from replacing a signature made by unmutated code. Graceful close and
page reopen do not establish renderer crash or durable successor behavior. These scope limits preserve
the useful evidence without granting the primitive verifier broader authority.


## 2026-09-14 — Integrate capture with bounded history and precise retention claims

Admit the complete fifteen-case capture native file with its original three-minute bound, case limits
and sixteen generated histories. Pin the existing historical promotion reader and bound its Git read
at five seconds / 2 MiB. Keep the native test bodies, mutations and product code unchanged; existing
historical drift and browser-owner contracts need no expansion. Whole-wrapper output/prerequisites
remain separate obligations.

The generated map refreshes saved capsules after each edit, so same-ID changes during that edit may
be masked. Record boundary retention rather than universal first-observed immutability; keep a focused
oracle-strengthening follow-up visible. The route mutation only exercises decoding, synthetic pagehide
is not BFCache, and getText document instrumentation is not a full heap inventory. Capsule-overhead
recovery establishes recovered text length but its source-byte predicate lacks a separate length
assertion; atomic abort evidence comes from another case. These are evidence limits, not newly proven
product failures, and do not erase the actual journal, attribution, pending-frame and crash checks.


## 2026-09-14 — Separate native editing recovery from ancestry and provenance comparisons

The original two-minute file bound expired after twelve passing cases. A separate progress-instrumented
diagnostic retained the 90-second generated bound, completed nineteen histories and reached history
twenty before expiry; all fifteen other cases passed. Retain both failed/partial runs. Repair the wrapper
and adapter file allowance to five minutes and generated editing to three, without reducing the
200 ancestry comparisons / 24 native histories or their assertions. Pin the historical promotion reader and bound
its Git read at five seconds / 2 MiB. Product code, assertions, populations, owner and historical
drift controls remain unchanged; saved-output and wrapper prerequisite obligations remain separate.

Count only the two invoked guard mutations: ancestry omission and passkey refusal omission. The helper's
identity branch is dormant. State the generated assertions precisely: ancestry compares browser-memory
text and encoded state; native editing reopens after every step and compares writing plus custody and
logical progress, not all raw source/counter inventories. Request blocking is not whole-browser offline,
synthetic pagehide is not BFCache and getText instrumentation is not exhaustive memory accounting.
These limits preserve useful observed evidence without expanding its release claim.


## 2026-09-14 — Preserve handoff boundaries and distinguish virtual authenticator evidence

Admit the complete fifteen-case handoff native file, including all 24 generated histories, with its
unchanged case limits. The original two-minute file allowance expired during the final provenance
case after fourteen passes, including the entire generated campaign in 59.596 seconds. Preserve that
failed run and raise only the wrapper/adapter file allowance to three minutes; do not reduce the
population or raise case deadlines. Pin and bound only its active historical promotion
reader. The old-slot-verifier environment branch remains dormant; do not grant negative-control credit
for a branch that did not run. Existing core/ES256 sibling receipts and wrapper obligations stay separate.

The ES256 case uses actual navigator.credentials.get backed by a disposable virtual authenticator,
not a human/hardware ceremony. Directed post-commit cuts kill renderers; generated histories reload
pages after aborted commits or simulated response failures. Stable inventory excludes two authorized
rows, and independent crypto opening precedes handoff while Yjs decoding remains shared. Report those
actual assertions and their limits without broadening classification into editor/transport authority.


## 2026-09-14 — Preserve first-admission oracles and give the complete native file a finite budget

Integrate all fifteen Account admission native cases and all 30 histories, without modifying their
bodies, oracles, populations, seeds or case limits. Use a 180-second adapter/wrapper allowance based
on the preceding handoff's measured 121.212-second execution and admission's larger campaign, before
running this selection; do not represent this prospective choice as an admission timeout repair.
Pin and bound the active historical promotion reader, leaving inherited dormant controls uncredited.

Keep independent Node/OpenSSL message/signature/decryption evidence separate from shared Yjs semantics.
Report that filtered inventory excludes all application-upgrade rows, that generated retries reload
pages while three directed cuts kill renderers, and that activation uses synthetic assertions rather
than a browser authenticator ceremony. The receipt mutant must actually retain an invalid signature;
a generic failure does not establish detection. Wrapper siblings/outputs and Account handoff/editor/
transport authority remain separate obligations. Preserve the stale runner-assertion failure and rerun
the complete pure suite after correcting its obsolete blocked-file expectation.


## 2026-09-14 — Preserve genesis semantics and identify the independent oracle's actual reach

Integrate the complete fourteen-case genesis native file and all 40 histories. Keep their bodies,
oracles, populations, seed and case limits unchanged. Set a three-minute adapter/wrapper allowance
before running the file, informed by preceding admission/handoff timings and the larger population;
this prospective choice is not a genesis timeout repair. Pin and bound only the active historical reader.

Require the actual snapshot/wrap mutants to accept bad candidates, with independent decryption showing
missing state or inability to recover. Distinguish signed semantic forgeries from unsigned malformed
marker edits. Report that the independent Node/OpenSSL oracle opens the recovery path, while device
wrap opening, candidate signature verification and Yjs semantics are not independently implemented by
this native file. Filtered inventory excludes every promotion row, generated restarts reload pages,
and one directed cut kills a renderer. Keep crypto sibling and wrapper credit separate, and do not
broaden a prepared proposal into service admission or Account editing authority.


## 2026-09-14 — Keep promotion preparation evidence separate from broader recovery claims

Integrate all twelve promotion native cases and 45 generated histories with the existing two-minute
file allowance, 30-second directed and 60-second generated limits. Preserve product, fixture, wrapper,
case bodies, population and seed; this file has no historical-source or registration-data input.
Require the MAC mutant to actually return the substituted preparation identity after current-code
refusal, rather than treating any failure as mutation detection.

The generated scalar ledger checks reservation spending and stable credentials at preparation steps,
not full writing or every post-action invariant. Record command preconditions/fallthrough and the
main comparison's exclusion of the whole custody database; synthetic imported provenance does not
constitute an importer replay or explicit all-claim preservation proof. Recovery cleanup observations
remain scoped to the tested owner states; they do not establish same-slot re-registration, general
reset or key-loss recovery. Two directed cuts kill renderers, while generated restarts reload pages.
Keep core sibling, wrapper and later genesis/admission/index/editor/transport obligations separate.


## 2026-09-14 — Borrow the owned browser for authority preflight without broadening its evidence

Integrate all four authority native cases and forty generated histories under the existing shared
browser owner. Register fixture cleanup before asynchronous setup and close the context explicitly;
keep standalone launch, product code, every test body, seed/population and all deadlines unchanged.
The native file's expected cases are exact; whole-wrapper scheduling and optional output obligations
remain separate. No historical-source input or registration-data adapter is required.

Credit logical inventory preservation, configured authority proof, specific refusal boundaries and
observed context stability. Generated edits do not independently assert expected writing or journalled
status. Page reloads are not process deaths; input mutation does not force queued contention, and
cancellation delays a wrapper before its HTTP request. Keep service-only cryptographic mutations and
full recovery/adoption evidence separate. The next recovery native fixture genuinely restarts a
persistent browser profile and restores virtual credentials; its owner integration must preserve those
semantics, rather than substitute a page reload.


## 2026-09-14 — Preserve full browser restarts through bounded persistent-profile reopen

Reuse the custody profile owner's inherited process-group launch for Account recovery. Add at most
two reopens after clean prior exit, preserving its origin filter, pinned executable, startup/close
bounds and fresh endpoint publication. Keep all three generations on the same profile and require
three distinct PIDs, clean exits and predecessor links in the recovery scenario. Retain per-generation
records with the selection evidence. The ordinary stage CDP browser remains auxiliary.

Do not replace full restart with page reload or emulate IndexedDB persistence through storageState.
Keep the existing explicit virtual WebAuthn credential export/restore, all original recovery operations,
case identity and deadline, and standalone behavior. Run the changed profile owner's controls, including
cold-copy compatibility, reopen refusal and actual worker death after reopening. Do not credit virtual
credentials as hardware persistence, one row's literal-code check as forensic privacy, or pending-account
recovery-code confirmation as full account recovery/adoption. Wrapper and broader recovery obligations
remain separate.


## 2026-09-14 — Bound core WebAuthn evidence to the native ceremonies actually exercised

Integrate both Account core native cases under the existing shared CDP owner, with cleanup registered
before setup and explicit context ownership. Preserve both original scenario bodies, identities, limits,
product code, fixture utilities and wrapper. This file needs no historical or registration-data adapter.

Credit virtual resident-key registration/confirmation, repeated completion after same-process service
reopen, pending-account refusal, seeded-active authentication, browser cancellation and the specific
HTTP refusals. Record the direct SQLite activation setup and distinguish service-object reopen from
process death. These cases do not establish real activation, hardware passkey persistence or Account
content authorization. Keep broader sibling and wrapper obligations separate.


## 2026-09-14 — Require activation omission controls to reach the assertion callback

Integrate the unchanged five-case activation native file under its existing owned-CDP fixture chain
and three-minute wrapper bound, preserving 30 seconds per case. No historical reader or runtime
registration-data adapter is needed; optional helper branches do not grant historical execution credit.

The two omission controls must show current-code refusal with zero callbacks, then reach the callback
once after removal of the relevant target/signature check. Do not reinterpret that as forged admission
acceptance. Preserve real renderer death at held assertion and lost committed finish, and cancellation
with a pending competing lock and zero finish calls from the cancelled owner. Node-generated activation
assertions do not establish browser/hardware ceremonies. Keep generated service histories, wrapper
outputs/reproduction and subsequent index handoff separate.


## 2026-09-14 — Separate inbound HTTP interoperability from browser transport and writing recovery

Integrate the unchanged one-case Account service inbound native file under its existing 90-second
wrapper bound and owned-CDP fixture chain. Retain its sixty-second case limit. No historical input or
runtime registration-data adapter is needed for its baseline helper path.

Credit exact envelope bytes, repeated response bytes, directed HTTP refusals and receive-cursor
recovery after page replacement. The reader signs/verifies in the browser but sends reads with Node
fetch; browser transport and CORS are separate. Repeated queries do not establish injected response
loss or service-state immutability. Cold cursor recovery without a writing assertion does not establish
independent content reconstruction, particularly for locally authored envelopes in the same workspace.
Keep service-only controls/histories, wrapper postconditions and human Account work separate.


## 2026-09-14 — Admit boolean title concatenation without general coercion; retain full-state oracle controls

Extend finite registration only for string/boolean concatenation in either order. Keep arithmetic
booleans, object/function coercion, unknown calls and null/undefined concatenation outside the subset.
Require generated Node/Vitest identity checks and exact six-case native reconciliation. This changes
planning support, not native test bodies or product behavior.

The delivery-oracle native controls must expose a full-state mismatch even while publication remains
conflict. Preserve the unique first-refusal and first-final assignment mutations and the observation
hook used equally by baseline and mutants. Signed contradictory proofs come from synthetic acceptance
custody, not live service issuance. Credit logical proof retention, text/envelope preservation and orderly
page reopen/compaction within the existing two-minute wrapper bound. Do not credit physical-disk
immutability, crash recovery, all cryptographic activity or separate wrapper/oracle campaigns.


## 2026-09-14 — Credit native parser shape refusal separately from authenticated startup

Integrate the unchanged parser-conformance native case under its existing two-minute wrapper bound,
with thirty seconds per case. Its eight samples stay one exact reporter identity. No interpreter
extension or historical/data input is needed for its single literal declaration.

Credit real IndexedDB preservation of sparse-array holes, structural acceptance of the synthetic v9
positive and refusal of seven malformed records after reopening the connection. The zero-MAC fixture
is structurally valid only. The same page remains alive and parsePromotion is called directly; this is
not authenticated workspace startup or crash recovery. Keep the wrapper's broader parser matrices,
omission controls, old-source comparison and report postconditions separate.


## 2026-09-14 — Require omitted-binding controls to perform a real substitution

Integrate the three promotion-contract native cases under the existing three-minute wrapper bound,
with sixty seconds per case. Retain the current interpreter and owned browser fixture. Credit thirteen
stage/version carriers, ten inputs for one source-guard omission and three HMAC-message omissions
within those three reporter identities, separately from complete wrapper/vector qualification.

Repair the receipt substitution that could leave an `a`-prefixed value unchanged. Toggle and assert
inequality for all three target bindings, and force the pending receipt's old no-op edge before signing
on every native run. Preserve the source-extraction reproduction and 160 generated repaired checks.
The mutated verifier must still invoke real WebCrypto verification with the omitted message field;
unconditional verification success would not establish this control's effect.

Credit current reader authentication and source binding of directly installed synthetic marker rows.
Fixture stage/version carriers do not prove service-authorized lifecycle transitions or cold writing
recovery, and the v8 carrier remains a shared reader case rather than a supported product path.


## 2026-09-14 — Separate persisted checkpoint startup from full crash and wrapper qualification

Integrate the four unchanged checkpoint-contract native cases under the existing five-minute wrapper
bound. Keep forty seconds for each directed case and two minutes for the 24-history generated case.
Use the current literal declaration interpreter and owned CDP fixture; no historical/data input is
needed for this native path. Optional vector builders are imported but not called.

Credit independent ciphertext reconstruction, no reseal on retry, read-only startup after page
navigation, effective selected/active coverage omissions, wrong-KDF refusal and nested authority
refusal despite a recomputed local MAC. Navigation replaces the JavaScript realm but keeps the
browser and service alive. The generated histories compare seeded text independently, then test
classification and journal removal/restoration; full final editor/card equality is a separate claim.
Checkpoint observations and serialized storage equality do not establish whole-profile residue freedom.
Keep wrapper JSON/report postconditions and complete vector/regression chains as separate obligations.


## 2026-09-14 — Own counter fixtures before setup and distinguish reservation order from eventual refusal

Integrate the five counter-contract native cases under the existing five-minute wrapper bound and
forty-second case limits. Keep their bodies unchanged. Adapt fixture setup to the existing owned CDP
helper with an isolated context per instance and cleanup registered before resource acquisition.
Attempt later cleanup steps even if an earlier close fails, and reject loopback listen errors.
Retain the mocked setup-leak reproduction, nine cleanup scenarios and eight real browser-owner controls.

Credit independent metadata MAC bytes, semantic refusal of correctly authenticated lies, burned
reservations after final transaction abort and the browser's reported strict durability. Keep physical
power loss separate. The reserve omission is detected at the AES invocation: a late rewind refusal
cannot compensate for encryption before durable allocation. The fixture configures synthetic custody
directly; it does not establish Account admission, factor UX, profile restore or whole-wrapper coverage.


## 2026-09-14 — Preserve independent store bytes and qualify reopen terminology

Integrate all three store-contract native cases under their existing bounds, adapting only fixture
ownership to the established CDP lifecycle. Retain byte-identical test bodies and the independent
HKDF/AES/XChaCha oracle. Credit its storeId omission control separately from owner self-roundtrips.
Distinguish page navigation/reconfiguration from session reopen and crash recovery. Reuse the signed
counter fixture's identical cleanup block with pinned prior controls; do not claim those controls ran
again. Continue the remaining Account suite integrations in signed bounded groups as authorized, and
stop if signing needs unavailable interaction rather than falling back to unsigned commits.


## 2026-09-14 — Separate Local provenance consumption from custody registration work

Integrate the four unchanged provenance native cases with the existing owned promotion fixture chain
and five-minute wrapper bound. Credit independent Local claim authentication, guarded read-only Account
startup and twenty generated tamper/restoration histories. Imported/cleanup claims are synthesized;
creation and deletion remain obligations of their existing campaigns. A preflight claim-MAC omission
is effective before promotion, while the post-handoff winning-claim marker still refuses it.

The adjacent local-custody file uses nested Node subtests that both current census and reporter reject.
Keep that restriction unchanged in this phase and handle its registration/ownership explicitly next.


## 2026-09-14 — Give custody control scenarios explicit identities without broadening nested registration

Promote the two fixed custody comparison subtests to named top-level tests, preserving assertions
and their passing combined standalone report. Keep each scenario in an isolated fixture and split the
former shared forty-second limit into twenty seconds each. The enclosing container has no independent
assertion; it is removed rather than counted as another substantive case. Retain the source/AST and
modeled report-equivalence checks, and adapt fixture ownership to the already qualified CDP lifecycle.
Keep nested Node declarations refused by the general census/reporter. Credit logical buffer zeroing
and parser refusal precisely; neither establishes physical erasure or an owner authority bypass.


## 2026-09-14 — Bind both admission compatibility modules and bound their historical reads

Integrate the six unchanged admission-bounds native cases under their existing three-minute wrapper
bound. Pin both Git modules read by the old/current compatibility cases, allow only the exact new
promotionAdmission path and apply the established five-second/2 MiB limits to the fixture's Git reads.
Extend the historical owner controls to this path, preserving prelaunch/reuse/midrun refusal and
replanned receipt separation. Keep production code and native assertions unchanged. Credit the two
large deterministic coverage specimens, signed semantic lies and reduced-bound ordering control at
their actual scope; they do not establish the maximum supported workload or whole historical-app support.


## 2026-09-14 — Keep allocation-model power loss separate from native strict-durability evidence

Integrate all three reservation-durability files under their existing five-minute wrapper bounds,
adapting only the standalone native browser lifecycle. Preserve all test bodies and counters. Retain
the pure model's two shrunk weakened-policy counterexamples via a separate repeat run with optional
reporting enabled. That repeated seed adds evidence artifacts, not a new population or wrapper credit.
Distinguish the model's strict-persistence assumption and explicit counter rollback from observed native
transaction/AES ordering and API-reported durability. Keep physical power cuts, profile restore/clone
safety and second-device delivery outside these claims.


## 2026-09-14 — Qualify outbound observer recovery at the editing boundary

Integrate the two unchanged outbound native cases under the existing one-minute wrapper bound.
Retain exact signature/digest/route source-control anchors and pin the envelope-vector input with the
frozen sources. Credit the actual renderer crash and journal recovery at the lower-level editing
owner. An observer's absent replay/outbound record there explains a preparation constraint; it does
not establish a defect in the later captured/spooled sync composition. Keep full vector, wrapper,
relay, second-device and immutable release qualification separate.


## 2026-09-14 — Keep service-issued decision evidence distinct from arrival and crash campaigns

Integrate the two unchanged directed decision files with twelve cases under their existing five-minute wrapper bounds. Retain genuine issuer verification, exact response/source retention and the three uniquely anchored persistence/closure/conflict controls. Credit direct HTTP, sender retry/halt and shared scheduler assertions. Keep separate generated ordering and service/renderer crash fixtures blocked until their own integration; optional reports, full wrapper preparation and immutable aggregate qualification remain separate.


## 2026-09-14 — Qualify decision ordering with exact retained proof sets and native process cuts

Integrate the three unchanged restart/order/generated files under the existing five-minute file bounds. Credit four actual service SIGKILL and four renderer crashes, two directed proof-arrival orders and 28 fixed-seed property histories. Keep command-level optional reports, full wrapper output, physical power-loss guarantees and immutable aggregate qualification separate. Preserve the initially failed registration-order check and the passing correction.


## 2026-09-14 — Treat failure hints as diagnostics while retaining exact admission retry

Integrate five unchanged service/HTTP/admission failure cases, retaining null decision bytes or no receipt on diagnostic hints and exact retryable progress. Borrow the existing owned browser for the shared residue HTTP fixture, explicitly close its context and attempt each cleanup boundary independently. Keep broad diagnostic/privacy claims, full residue suites and the original combined wrapper allowance separate.


## 2026-09-14 — Keep liveness instrument and service-cache checks finite and independently observable

Integrate six Node instrumentation/cache cases with the existing one-minute file limits. Replace only equivalent checkpoint-size registration expressions with literal bytes, leaving the finite reader and test bodies unchanged. Preserve exact warm/cold signature counts, cache ownership/invalidation checks and instrument controls. Raise the compact manifest ceiling to 750 kB in writer and regression assertion while preserving schema, layout and all earlier contracts. Performance workloads and browser liveness remain separate.


## 2026-09-14 — Qualify local progress and cached-view refusal under controlled native boundaries

Integrate the two unchanged controlled/view browser cases using the existing owned-CDP helper with explicit context and finally cleanup. Retain their existing file/case bounds. Credit progress while genuine HTTP is held, fresh automatic retry after three expired reads, and refusal/recovery for seven IDB tamper modes. Preserve instrument/source pins. Keep performance reports, growing workloads, full wrapper outputs and immutable release qualification separate.


## 2026-09-14 — Qualify the ordinary-scheduling workload without manufacturing a latency guarantee

Integrate the unchanged 80-edit, 30-edit burst and post-growth recovery workload under its existing 750/720-second file/case bounds. Credit natural scheduler progress, bounded burst positions and cold text equality. Preserve ordinary versus measured bundle distinctions and exact case identities. Do not infer per-edit latency thresholds, loaded-host reliability or full performance-report/wrapper qualification from this case.


## 2026-09-14 — Keep growing-history liveness evidence tied to exact causal and source assertions

Integrate the unchanged 24-job growth case under its existing 930/900-second file/case bounds. Credit ordered source/spool correspondence, exact prefixes, one ordinary-read census per observed poll, local-admission/send-wake equality and cold text preservation. Keep collected performance/control samples distinct from asserted thresholds or full object equivalence. Wrapper outputs and immutable release qualification remain separate.


## 2026-09-14 — Bound the independent ZIP producer and retain residue matcher limitations

Integrate fourteen neutral matcher/container cases under 60-second file bounds. Bound host Python ZIP generation to five seconds and one MiB, retaining before/after observed tool pins. This evidence does not substitute for binding external tools into immutable runner identity. Keep fragmented records, limited static-import checks and raw-file versus logical SQL observations explicit; claim no forensic erasure or complete wrapper-output qualification.


## 2026-09-14 — Keep residue calibration credit tied to planted surfaces and fault controls

Admit the unchanged two-case native calibration file with its canonical 150-second file and 120/90-second case bounds. Credit all 144 applicable representation/surface cells, ten missing-surface controls and four collector faults. Keep opaque-key contents, physical-carrier completeness, wrapper outputs and immutable qualification outside this result.


## 2026-09-14 — Retain directed lifecycle and acquired service-file residue evidence without widening its claim

Integrate the unchanged three lifecycle cases and one service-file case under their existing 240-second file bounds. Credit exact journal/flush/cold content assertions, explicit recovery retry-key exposure rules, actual storage failure and plaintext side-record controls, and stable acquired DB/WAL file scans. Keep directed synthetic evidence distinct from process crashes, human Account qualification and forensic erasure. The initial empty-checkpoint refusal traced to a Chromium extension worker. Align the direct launcher with Playwright extension-disabling defaults, retaining worker refusal and a positive app-worker observation control. Rerun the 24 Node-owner and 14 native-owner controls; preserve the failed receipt and probe. Bound browser signal-denial retries within existing grace intervals, with transient/persistent denial controls. Preserve the earlier failed crash-cleanup receipt and require actual group disappearance for success.


## 2026-09-14 — Retain the generated residue population and its scoped recovery assertions

Admit the unchanged 24-history native property at seed 1121040, preserving 330/300/270-second file/case/property bounds and treating interruption as failure. Credit exact cold text and declared logical-carrier scans. Preserve the final operation histories as auxiliary observations, distinct from full wrapper-output or physical-profile qualification.


## 2026-09-14 — Complete Account suite integration with owned persistent-profile lifetimes

Use an explicit inherited-profile fixture kind to bind the installed browser without starting an unused CDP browser. Reuse the custody helper for real profile closure and reopen, keeping the packaged cases and existing time limits. Requalify the six profile-owner controls through this contract plus existing Node, Vitest and CDP controls. Distinguish acquired-file observations from the cases' narrower assertions and from forensic erasure. Close the authorized Account integration group; other suite, wrapper/output and immutable release gates remain.


## 2026-09-14 — Other Node marker, origin and legacy observer controls

Register only the four reviewed control files with exact static case identities and bounded inherited children. Preserve generated populations, retired-v8 exclusions, optional host experiment dispositions and separate wrapper obligations. Continue the authorized three suite groups with signed intermediate commits; stop if signing blocks.


## 2026-09-14 — Other native marker, maintenance and partial-recovery fixtures

Repair the shared fixture-name regression and qualify all four reviewed callers. Bind installed Chromium to the new native adapters, preserve existing case/file deadlines and all prior contracts, and distinguish partial read-only recovery from complete recovery or physical erasure.


## 2026-09-14 — Registered harness groups and current storage lifecycle fixtures

Replace obsolete port assumptions with current executable lifecycle checks rather than preserving false expectations. Keep the storage-properties startup refusal and all cleanup-supervisor assertions. Explicit owner sites may launch registered groups; ordinary detached launches still refuse. Publish an intent before creating a group, prevent payload execution until leader registration, fence late launch during teardown and refuse unresolved cleanup. Retain separate group-leader and actual-worker identities, inherited Chromium binding and failed-attempt evidence.


## 2026-09-14 — Runner self-test integration and nested stage environment ownership

Keep nested stage environment ownership explicit: an owned stage may reset its inherited Node-test marker and route violations to its own guarded scope; ordinary children cannot suppress violations by supplying a new environment. Accept the active guard or a guard inside the owned temporary tree, and constrain violation files to that tree or the disposable checkout output. Keep every registered leader in drain evidence and preserve the self-tests that reproduced the nesting failures. Resolve actual filesystem paths before checking the boundary; macOS aliases must not reject the same owned checkout, and a symlink must not extend ownership outside it.


## 2026-09-14 — Owned Playwright adapter and Local startup/editor fixtures

Introduce explicit single-file Playwright contracts and an independent static census before admitting browser suites. Retain default application case assertions and ordinary standalone behavior while owned runs supply browser and server lifetimes. Reject partial, repeated, filtered or unexpected-skip results, and retain bounded exact attachment bytes rather than losing generated histories. Preserve the failed fixture and metadata attempts.


## 2026-09-14 — Packaged Local, compatibility and private migration browser fixtures

Keep browser file admission explicit while adding disposable package builds and the original private migration Vite configuration. Serve exact build files with no missing-asset fallback or path escape; preserve application assertions, case bounds and standalone commands. Retain the native adapter regressions and seeded migration evidence without treating host Python or wrapper obligations as qualified.


## 2026-09-14 — Application upgrade browser fixtures

Admit the application upgrade file using two disposable builds and the existing fault server. Keep the supplied-predecessor variant visibly unexercised, represented by one exact identity/reason rather than general skip acceptance. Preserve standalone server behavior, all application assertions, wrapper obligations and strict failure/drain reconciliation. Report not-applicable cases separately from passing cases.


## 2026-09-14 — Integration of geometry layout and editor fixtures

Admit the four geometry layout/editor files through the owned packaged browser adapter with their original desktop/Android projects and unchanged assertions. Keep execution serial, retain complete case/project populations and preserve per-case bounds. Prospectively allow the finite remaining browser census within an 800000-byte manifest ceiling in both writer and independent regression control; do not alter runtime report limits or remove obligations.


## 2026-09-14 — Integration of geometry interaction fixtures

Keep the existing interaction semantics and platform applicability. Admit all four files through disposable packaged browser ownership and encode the ten device-specific non-applicable identities/reasons explicitly, retaining strict unknown-skip rejection and exact case/project reconciliation. Split the final latency work into journal microbenchmarks and application latency so obsolete plaintext startup/measurement setup can be repaired and validated separately.


## 2026-09-14 — Integration of journal latency fixtures and measurement retention

Require independent, exact project/metric reconciliation in addition to passing latency tests. Retain bounded measurement bytes beside the owned report and exercise partial-output survival under native timeout and cancellation. Pass the configured origin/device options to manual browser contexts, preserve the existing microbenchmark construction and budgets, and keep full production editing latency and real-device evidence separate.


## 2026-09-14 — Integration of current Local application latency fixtures

Finish application-latency adapter integration while keeping the measured budget failures explicitly open. Correct obsolete factor-free startup, absent-mark-as-zero behavior and legacy DB probing; preserve the workload and numeric budgets. Use guarded current-path timing marks and a locked encrypted payload census, and record factor-entry exclusion plus viewport/CPU interpretation. Collect timing failures at project teardown, enforce the same numeric predicates independently at the output boundary, and retain all observations even on failure. Diagnose timer calibration, frame scheduling and the editor/admission hot path in a separate bounded performance phase before claiming qualification; do not raise budgets or infer a handset regression from throttled emulation. Then continue the separate 96 command and 63 campaign adapter/output obligations, external-tool binding and immutable aggregate gates.


## 2026-09-14 — Calibrate Local input latency and isolate admission costs

Keep the original application performance gate failed. The diagnostic makes private Yjs preparation, workspace-history forking and full projection comparison the priority for a bounded performance repair; preserve isolated preparation, journal-before-publication, undo, pending-dependency and projection checks. Do not disable safety checks or subtract control quantiles. Bare CodeMirror block variability also leaves recorder/scheduler calibration open; current frame-plus-task timings are proxies, not proof that a particular character was displayed. Investigate the typing path first and treat focus/mount cost separately. A repair needs semantic controls and the unchanged timing workload before a performance claim.


## 2026-09-14 — Reduce complete projection comparison cost without skipping verification

Retain complete per-transition equality and its normalization fallback. Avoid repeated long-string UTF-8 encoding only when exact ordered string fields plus every remaining byte establish the same full encoding. A 64-item eligibility probe may forgo the optimization, never content coverage. The initial dense-history regression led to the ordinary encoder path for short fragments; retain the negative and mixed profiles. Useful comparison-only improvement supports this bounded repair, but neither timing thresholds nor staging checks are relaxed. F-17 remains partial; full document/history preparation, dense-history/device capacity and focus remain separate. Preserve the failed packaged application gate and proceed to a bounded fork-cost repair before immutable qualification.


## 2026-09-14 — Reduce detached document fork cost while preserving runtime semantics

Keep detached admission and history documents, complete per-transition verification and the existing undo copy. Use paired private codecs for cheaper runtime construction only: V2 struct compression, V1 legacy JSON conversions, independent UTF-8 edge replacement and detached binary leaves. Tests rejected the naïve swap and revealed a pre-existing V1 nested-binary alias with erased temporary bytes. Preserve that counterexample and repair the alias; do not propagate an existing defect for byte-equivalence. The final alternating fork checks satisfy the prospective acceptance rule, but whole-command samples remain mixed and no universal or device-capacity claim follows. Never publish the private codec bytes or relax an application budget. Keep F-17 partial and target the remaining undo-history/duplicate-preparation costs with fresh profiling before choosing a larger ownership change.


## 2026-09-14 — Profile residual preparation and undo-history copying

Browser stack attribution and fixed-document metadata scaling support a bounded selection-metadata clone attempt before a larger prepared-history ownership change. Preserve fully detached mutable graphs and per-item reference semantics, use structuredClone fallback outside the known shape, and require generated differential/undo/alias controls plus a deliberate sharing mutation before performance acceptance. Pin five warmups and twenty alternating baseline/candidate pairs in nine strata; require >=20% median improvement in both nonzero-metadata 1,000-group strata without consistent >10% regression in zero-metadata controls, then run the unchanged application gate. No production changes or release pass in this diagnostic phase. Retain raw profiles and resolved mappings in the bounded packet; full generated maps stay in the recorded raw run with hashes. F-17 and immutable qualification remain open.


## 2026-09-14 — History metadata optimization assessment

Keep the new generated graph/isolation, fallback and undo/selection oracles, but reject both shape-specific metadata copiers under the predeclared performance rule. The second version improves the heavy 100-target stress case by 30.5% but only 10.3% at one target, so do not lower the rule after seeing results or ship the added complexity on that basis. Restore the production seam exactly; preserve both candidates, all measurements and the sharing controls. No product speedup or new application/native pass follows. Next define the workspace preparation ownership and accepted-basis handoff before eliminating its duplicate admission draft; preserve canonical privacy, refusal isolation, source coverage and complete verification. F-17, physical-device capacity and immutable qualification remain open.


## 2026-09-14 — Workspace preparation ownership contract and baseline controls

Require a private identity-bound, one-shot preparation handoff before eliminating the duplicate canonical draft. Storage retry retains a consumed handoff; a new slice gets fresh authority even when a no-op left its state vector unchanged. Preserve the independent canonical document, complete post-promotion verification and the separate Account source probe. Keep the generic path as an integration reference, implement negative capability tests against the actual component before connecting Local, and qualify Account separately. The new baseline tests and four failing mutations establish sensitivity to existing lifecycle/coverage invariants; they do not establish correctness or performance of an unimplemented fast path. No threshold is relaxed; F-17 and immutable qualification remain open.


## 2026-09-14 — Private workspace preparation handoff component

Implement the private ownership component without activating it. Require a matching opaque context and verified local head, synchronous preparation, complete verification before capture and adoption, exact retained retry, and lease-aware cancellation cleanup. Treat post-promotion comparison failure as terminal. Keep the existing editor/generic path and all budgets unchanged. Actual component fault controls and generated Yjs histories precede Local integration; Account source/capture checks remain a separate gate. Preserve both resource-gap counterexamples and the initial mutation-fixture timeout. The full-suite standalone rerun passes at unchanged limits after two concurrent-run timeouts in unchanged tests; preserve that loaded-host observation rather than extending deadlines or declaring timing qualification.


## 2026-09-14 — Private Local preparation handoff integration

Keep the candidate an explicit private Local selection while retaining the generic/default and Account paths. Preserve one verified queue basis, leased prepared resources, exact retry, per-slice renewal and complete post-promotion comparison before workspace publication. Reject Account capture registration. Bind both publication revision and source; preserve terminal projection failure causes. The native initialization counterexample and three new discriminating faults remain in the evidence. Functional integration passes without changing latency budgets or claiming a speedup. Next compare against the retained reference and signed baseline under a prospective protocol before default Local activation. After the F-17 disposition, resume wrapper certification and immutable qualification.


## 2026-09-14 — Keep the faster Local handoff private while its application budget fails

Require both the prospectively specified relative command improvement and the unchanged application
budgets before default activation. The six-block comparison meets its criteria against current
reference and signed baseline, but CPU-4x Android card typing is 63.5 ms against <16 ms. Keep the
candidate private, preserve every observation, and leave F-17 partial. Do not relax the budget,
repeat a valid failing gate or infer a browser effect from separate historical runs. Diagnose the
candidate's remaining work before selecting a further repair; Account activation stays separate.


## 2026-09-15 — Keep Local handoff private after the physical-phone comparison

The Pixel 9a companion shows lower candidate card-typing p95 in both opposite-order pairs, but
86.9–87.1 ms remains above the unchanged <16 ms budget. Retain the candidate privately and keep
F-17 partial. Preserve every failed setup and diagnostic run, all four comparison sessions, delivered
input cadence and thermal observations. Do not generalize automated trusted keys to ordinary phone
keyboard composition or treat one device as fleet qualification. Finish the manual input/recovery
exercise, then profile the remaining candidate card cost before another repair. The 96 command /
63 campaign obligations and immutable qualification remain separate.


## 2026-09-15 — Close the phone comparison and resume candidate diagnosis

The operator cancels the remaining physical-device campaign, including the planned manual
keyboard exercise. Preserve its completed four-session evidence without claiming that exercise
passed. The fixture server exited cleanly after removing its five owned USB reverse forwards;
the dedicated ADB server on port 5047 is stopped. Keep the emulation reference values and use
roughly 1.5 times card-typing latency for planning only: C 87.0/63.5 = 1.37; R 108.1/69.4 = 1.56.
These separate sessions are not a controlled hardware calibration or evidence for other metrics.
Resume the [bounded private-candidate browser profile](./f17-local-profile.md) once, with unchanged
samples and source-mapped attribution before another repair. Default activation stays refused.


## 2026-09-15 — Attribute remaining private Local card work

The unchanged owned browser diagnostic passes once on the isolated Local handoff variant:
4 cases, no retries/skips, 1,440 raw timings, 4 CPU profiles, exact text/cold-reopen checks and
process drain (208.584-second stage). Full maps independently reproduce 2,168 mapped nodes;
79 mapped application source files match the activated candidate. Original workspace identity
is unchanged during execution. Card diagnostic p95 is 14.6/13.7 ms desktop and 80.5/68.7 ms
CPU-4x Android across the two blocks; these do not replace the prior 12.9/63.5 ms application
gate observation. The later bare-CodeMirror tail persists and limits timing interpretation.
Across separate 60-key profiles, full history copying takes 345.2/1,558.4 ms desktop/Android,
including document copying 170.3/770.1 and stack copying 172.4/778.8. Full comparison uses
190.2/804.8 ms and publication/listeners 61.4/489.9 ms. Nested totals overlap; callback self time
does not isolate structuredClone. Native/unmapped and GC samples are retained.

Next define and test an ownership contract for private immutable selection snapshots: detach
at capture, safely reuse only owned sealed values, detach on restore, and prove foreign/stale
reference, nested-alias, undo/redo and lifetime behavior. Keep generic history forks fully detached,
full verification and durable admission unchanged. Both rejected metadata copiers remain rejected;
no speedup or default activation follows from this diagnosis. F-17 is partial; adapter obligations
remain 0 test-file / 96 command / 63 campaign. [Protocol and next phase](./f17-local-profile.md);
[evidence](./account-conformance-runs/2026-09-15-f17-local-profile/README.md).


## 2026-09-15 — Selection-snapshot ownership contract and baseline controls

Define the [private selection-snapshot contract](./f17-selection-snapshots.md): capture a detached
payload once behind an owner-issued opaque token, reuse only same-owner tokens in explicitly owned
metadata, restore detached selections, and invalidate on owner close without erasing snapshots a
live sibling history still needs. Generic metadata forks remain fully detached. Weak-key lifetime
must not be replaced by a strong global registry; shallow freezing does not establish immutability.
The component and its owner/forgery/closed-token controls are the next phase, not implemented here.

Six owned suites pass 118 cases with no skips/retries and process drain. Four new registrations
cover 96 generated retained-branch histories, frozen/lookalike generic metadata, and 80 generated
master/card ledger histories under each current preparation strategy. The independent ledger
checks text, selections, undo/redo, revision, failed-write retry/discard, remote prefixes and cold
replay. Three faults are detected: shallow nested sharing, empty before capture and stale after
capture. The first sharing attempt failed earlier at prototype normalization; production-shaped
cloned fixture metadata makes the corrected control reach the intended alias assertion. Both
attempts remain. No production defect was identified and all runtime bytes remain unchanged.

All 17 selected runner/registration checks, TypeScript, scoped source style, inventory/manifest and
authority checks pass. Exactly four cases and one denominator-title update are reviewed; all other
contracts, deadlines and exclusions remain. General integration is 261 files / 2,077 dispositions
(11 not applicable). Wrapper obligations remain 0 test-file / 96 command / 63 campaign. Full unit,
native and timing aggregates are not rerun in this baseline-only phase. F-17 remains partial, the
application gate remains failed, and the rough 1.5× Pixel card estimate remains planning context.
[Retained evidence](./account-conformance-runs/2026-09-15-f17-selection-contract/README.md).


## 2026-09-15 — Unmounted private selection-snapshot owner

Implement [the private selection owner](./f17-selection-owner.md) without connecting it to the
editor. Capture detaches and validates a complete selection Map behind a fresh opaque token;
restore returns a fresh graph; metadata fork reuses recognized tokens in a new outer Map. Foreign,
forged, cloned and closed-owner tokens refuse. A private WeakMap supplies identity and lifetime,
with no strong inventory or per-branch revocation. Reentrant close during capture prevents issuance.
History-to-owner binding and workspace shutdown ordering remain explicit integration obligations.

Seven owned suites pass **127 cases**, including nine new component cases and the unchanged
adjacent history/admission/delivery regressions, with no skips/retries and process groups drained.
The component runs 200 generated graph/isolation examples (seed 150903), 160 independent branch/
group lifetime histories (150904), and 80 malformed sparse-array examples (150905). The last
property exposed a defect in the initial unmounted validator: extra properties could disguise
holes from a key-count/Array.every check. Requiring consecutive array indexes fixes the retained
minimal counterexample. Original source/test, failed run and repaired pass survive. Four deliberate
faults are detected: borrowed input, lent restore payload, shared owner registry and invalidation
of a token retained by a sibling branch. GC timing and forensic erasure are not claimed.

All 17 selected runner checks, TypeScript, scoped source format/lint, inventory/manifest, crypto
census and authority checks pass. One reviewed source and one nine-case adapter are added; prior
runtime files, contracts, deadlines, exclusions and crypto classifications are preserved apart from
the exact denominator-test title update. General integration is **262 files / 2,086 dispositions
(11 not applicable)**. The 96 command / 63 campaign obligations remain. Five prior phase packets,
52 personal/vector pins, append-only record prefixes and L-2 are preserved. No full unit, native
or performance aggregate is run in this unmounted phase; the application gate remains failed at
12.9/63.5 ms desktop/CPU-4x Android card p95. No default activation or speedup is claimed.

Next integrate an explicit private Local variant with workspace/history owner binding and all
metadata producers/consumers converted together. Retain the generic reference and current Local
handoff for comparison. Generated/native retry, discard, grouping, slicing, remote, reentrancy and
close checks precede a new prospective performance comparison and the unchanged application gate.
[Retained evidence](./account-conformance-runs/2026-09-15-f17-selection-owner/README.md).


## 2026-09-15 — Explicit private Local selection-snapshot integration

Integrate [owner-bound selection history](./f17-selection-integration.md) through the explicit
internal `local-snapshots` variant. Default Local/Account and the existing reference/Local-handoff
paths remain available. A workspace capability binds even empty histories to its live owner;
generic forks refuse owned histories. Group before/after capture, history fork, undo/redo metadata
transfer and detached restore now use recognized opaque tokens together. History documents, stacks,
ranges and restored selections stay detached. No token or history handle is exposed to the UI.
Private admission retains its complete comparison, revision/job/slice/writer binding, byte leases,
retry and source guards. Teardown disposes histories after write/preparation drain, then closes the
snapshot owner. A targeted startup check found a new cleanup gap: synchronous opener throws escaped
the initial Promise.catch. A surrounding try/catch repairs it; original source/test and red/green
runs are preserved. The defect preceded history allocation and is not evidence of content loss.

All **86 workspace cases** pass, including the same 27 shared cases under three variants, existing
Local controls, and new activation/startup/close checks. The new seam suite passes five cases,
including 120 generated retained-branch/cursor histories (seed 150906). Existing accepted-state
and independent master/card selection ledgers run 80 histories per variant (140925/150902).
Thirteen affected and timing-follow-up owned suites pass **215 cases** with no skips/retries and
process groups drained. Five deliberate faults fail their intended assertions: missing history
binding, cloned tokens, stale after capture, omitted undo transfer and premature owner close.

Native pending-state and original-order delivery campaigns each pass directed cases plus **100
generated histories** (seed 8941), explicitly selecting the new variant in disposable Chromium
profiles. The owned workspace catalogue passes **10 cases and all four mutations**, with browser
and process drain. The first native run passed all ten cases but its whole-state pending-history
mutation destroyed the active candidate and timed out before reaching the privacy assertion. The
replacement fault exposes the candidate undo stack without replacing the accepted document; the
original error run and both catalogue definitions remain, with the same assertion and limits. Full units initially pass 99 files / 1,141 tests before startup repair; the next
run times out in the same two unchanged five-second Account-liveness/position-decision cases noted
previously. Both pass in isolation, and one unchanged full repeat after repair passes **99 files /
1,141 tests**. All runs remain; the cause is not established and loaded-host qualification stays open.

All 21 selected runner checks, types, scoped source style, inventory/manifest, census and authority
checks pass. Registration adds five seam cases and thirty workspace cases while retaining every
previous case and contract except the denominator-title update and the reviewed pending-history
mutation target repair. General integration is **263 files /
2,121 dispositions (11 not applicable)**, with 0 test-file / 96 command / 63 campaign obligations
remaining. Only the Yjs seam, admitted workspace and the snapshot owner's descriptive comment change
runtime source bytes in this phase. Crypto classifications, six prior packets, 52 personal/vector
pins, append-only prefixes and L-2 remain intact. No performance measurement or default activation
occurs. F-17 remains partial and the application gate remains 12.9/63.5 ms desktop/CPU-4x Android
card p95, with Android failing <16 ms. Next specify and run a balanced comparison with the reference,
existing Local handoff and appropriate signed baseline before the unchanged application gate.
[Retained evidence](./account-conformance-runs/2026-09-15-f17-selection-integration/README.md).


## 2026-09-15 — Keep Local selection snapshots private after mixed timing evidence

The [prospective four-variant comparison](./f17-selection-performance.md) completes **64 fresh
sessions, 5,248 warmups and 4,096 measured insertions**, with all exact text/caret/revision/history
and canonical cold-replay checks passing. B is complete signed `0c84e5cc`; R/H/S share current
runtime/dependency bytes with explicit reference, Local-handoff and Local-snapshot selection.
Four balanced orders cover three 100,000-character document item-count strata plus a deeper
10,000-item history growing from 256 to 320 undo groups. The memory carrier excludes encryption,
IndexedDB and paint; this is a host engineering comparison, not fleet qualification.

The snapshot increment over H is **2.9%** at 10,000 items with shallow history and **10.3%** with
deeper history. The prospective rule requires >=10% in both, so the relative gate **fails**.
Cumulative S/R and S/B benefits and all median/p95 regression guardrails pass. At 100,000 items
S is 0.7% slower than H by median paired ratio; the substantial cumulative gain comes from the
existing handoff. Preserve the mixed result rather than declaring a broad snapshot speedup.

The unchanged application gate runs **once** on a disposable current-source build with exactly
one runtime patch selecting `local-snapshots` at the Local opener. All twelve cases execute and
all thirty measurement rows are retained; browser, process group and localhost server drain.
Card p95 is **12.2/75.1 ms desktop/CPU-4x Android** against <16 ms. Android focus is
**54.2 ms** against <50 ms; both Android budgets fail. The remaining budgeted metrics pass. The failure is reported through the deferred afterAll budget hook,
not a navigation correctness failure. The earlier H observation (12.9/63.5 ms) is a separate,
unpaired run; its difference from this run is not a controlled browser treatment effect.

Default Local and Account retain the reference. No runtime, adapter, manifest, census or registry
changes occur in this phase. F-17 stays partial; general integration remains **263 files / 2,121
dispositions (11 not applicable)** and unresolved obligations remain **0 test-file / 96 command /
63 campaign**. Seven preceding evidence packets, 52 personal/vector pins, append-only prefixes
and L-2 are preserved. The packet embeds all command observations, helper/protocol bytes,
application measurements/receipts and preservation data; large pinned inputs and bundles remain
under ignored local test-results with hashes. No personal app, phone, relay or deployment changes.

Next: Review and sign the accumulated bounded phases, then profile the snapshot application variant to separate remaining document/history fork, full comparison and publication costs before choosing another repair. Retain the unchanged budgets and failed measurements.
[Retained evidence](./account-conformance-runs/2026-09-15-f17-selection-performance/README.md).


## 2026-09-15 — Reconcile the F-17 signed commit backlog

Eight completed bounded phases are grouped into five newly signed descendant commits above
`0c84e5cc`: `67d31c75` Local handoff; `a245fb7f` its performance/Pixel/profile evidence;
`ffc0d370` selection contract and unmounted owner; `15eb389c` private Local snapshot integration;
and `e2d42fac` the final performance decision. All five signatures verify. A following documentation
commit carries this reconciliation. No existing commit or historical receipt identity is rewritten.

The final content commit contains all 219 original pending files byte-for-byte. The handoff,
component and integration checkpoints match respectively 1,059, 1,061 and 1,062 non-document
files of their retained frozen phase inputs, including tests/runners/configuration; corresponding
registry/census snapshots also match. The grouping uses exact saved versions where available,
combines related phases where useful, and recovers append-only records by verified byte prefixes.
Unavailable intermediate mutable summaries are not invented; the current checkpoint is reconciled
here. All 177 files across eight original evidence packets, 52 personal/vector pins and L-2 remain
unchanged. Three unrelated root files are left untracked and untouched.

[Commit map and reproducible checks](./account-conformance-runs/2026-09-15-f17-commit-backlog/README.md).
The original phase results are not reruns at the new commit IDs. F-17 remains partial, defaults
remain reference, and the latest application gate remains failed at 12.2/75.1 ms desktop/CPU-4x
card p95, with Android focus 54.2 ms. Counts remain 263 files / 2,121 dispositions (11 not applicable),
with 0 test-file / 96 command / 63 campaign obligations unresolved. No runtime or test changes,
measurement campaign, personal app operation or deployment occur during this bookkeeping turn.

The backlog through this performance phase is closed. Next profile the snapshot application's
remaining document/history fork, complete comparison and publication costs before another repair;
retain the unchanged budgets, failed observations and loaded-host uncertainty.


## 2026-09-15 — Separate F-17 exploration from RC qualification

Keep isolated, composable optimization prototypes behind a cheap focused-correctness floor and a common serial browser screen. Preserve credible small gains and negative/inconclusive observations; do not require every component to solve the whole overrun or rerun every release validator per prototype. Combine and compare before selecting a candidate for ownership/native/recovery/memory qualification and the unchanged application gate. No release budget or default activation rule changes. The [first round](./f17-exploration-r1.md) retains about a 9.4% median full-corpus improvement as experimental work, with all source patches and failed probes preserved.


## 2026-09-15 — Retain a simpler F-17 experimental combination

Keep preparation reuse and bounded comparison pooling, park the conservative publication cache, and add the editor projection shortcut for further exploration. Publication's measured ordinary-text gain remains useful evidence; the mixed requested-Unicode guard, incomplete condition assertion in those initial sessions and semantic complexity support preferring a simpler baseline, not a universal rejection of small gains. The editor contributes about 3–4% median improvement against that exact companion configuration. All patches and observations remain available. This does not establish a net speedup over round one's complete combination or change default/RC gates. [Comparison and limitations](./f17-exploration-r2.md).

Continue bounded profiling/optimization before paying for whole-release qualification. A Rust/Wasm migration is not part of this phase: the current stateful Yjs/history/editor boundary makes it a substantial engine/integration change, while journal encryption already uses a narrow Rust/Wasm implementation. Reconsider a resident kernel or engine migration only when a measured remaining target justifies the integration and behavioral proof work.


## 2026-09-15 — Extend private string reuse to primitive Yjs values

Retain the top-level primitive ContentAny string extension on the selected preparation + pool + editor combination. Two profiles identify the missed native encoding path, focused differential and fault controls preserve complete canonical comparison and ownership behavior, and both forward/reverse application pairs improve all median/p95 blocks. Paired median gain is about 13%, with about 30% p95 gain in this bounded screen; no candidate GC/heap benefit or release budget pass is established. Keep the pinned private marker/paired-decoder convention separate from published wire encoding and qualify that dependency before RC entry. Publication caching remains parked. [Evidence and limitations](./f17-exploration-r3.md).

Next target the repeated per-snapshot UI card index with a single lookup shared across Collections, preserving fresh detached projections and current editing/membership/status behavior. This is another bounded incremental experiment, not default activation or a reason to relax the full release gates. Broader context memoization, membership repair and byte-comparison changes stay separate.


## 2026-09-15 — Preserve optional UI indexing; retain the R3 baseline

The shared per-snapshot UI lookup removes repeated Collection Map construction in the emitted build and passes focused/generated/fault and browser correctness checks. Its ordinary later median improves 2.7%, but early p95 worsens 8% in both opposite-order pairs; the Unicode timing is also mixed. Preserve its small isolated patch and the favorable later result as an optional component, while retaining preparation + pool + editor + primitive value-string reuse as the selected baseline. This is a response to mixed tail evidence, not rejection of incremental gains below a fixed threshold. No GC/heap or release-budget benefit is established. [Evidence and limitations](./f17-exploration-r4.md).

Next refresh the selected combination's CPU/allocation profiles, then choose a bounded repair of measured remaining comparison-byte, document/history allocation or membership cost. Keep the existing full normalization/comparison and ownership guarantees; no need to rerun broad release qualification for each prototype. RC/default activation remains separately gated. The current round ends after the fixed comparison and disposition.


## 2026-09-15 — Prioritize architectural F-17 cost reduction

Following the perspective at `55ab217e` and its static assessment, the operator adopts a sequence that targets work proportional to workspace size and retained history. Preserve the selected R3 constant-factor improvements and the optional R4/publication patches. First run a bounded application growth diagnostic separating corpus size from retained history, including a disposable history-clear control whose document and canonical bytes must remain unchanged. Then address membership-repair eligibility and incremental publication separately; prototype persistent buffers for a restricted text path while retaining full verification; only then design incremental verification and its detection contract. This replaces another generic constant-factor profiling round as the immediate plan.

Do not inherit the perspective's numerical forecast or claim that native Yjs delta/snapshot helpers are O(edit): deletion-set construction still scans the struct store. Text commands run one pre-command membership-repair pass, not both syntactic callsites; skipping it needs a repaired-basis invariant because remote repair is queued. Stable UI identities need selective subscriptions, not just a new root snapshot API. Persistent buffers change the preparation ownership contract and must mirror redo invalidation, metadata and slow-path transitions. Incremental verification must establish which old state a transition can change and define delayed failure detection. Keep frame-sensitive end-to-end measurements; subtracting control p95 values is not a p95 overhead estimator. The reviewer's scratch probes remain reported evidence, not independently reproduced measurements here.

The first diagnostic uses the fixed R3 combination, adds no production optimization, and does not change defaults, budgets or release-adapter counts. [Protocol and outcome](./f17-growth-r1.md).


## 2026-09-15 — Growth diagnostic supports whole-document work as the next priority

The fixed R3 application comparison passes all eight sessions, actual history-intervention checks and 1,280 measured keys. Doubling seeded cards increases paired deep medians by 59.3% with history retained and 45.2% after clearing. Clearing history is modestly helpful at 600 cards and mixed at 300. This supports the accepted membership/publication phase order without treating history as free or predicting persistent-buffer speedup: the latter would also eliminate a document fork still present in both arms. Keep the R3 improvements and optional patches. No default activation or budget change follows. The immediate-read setup failure and bounded-settlement amendment are retained separately. [Evidence, limits and next boundary](./f17-growth-r1.md).


## 2026-09-15 — Retain conservative membership-repair eligibility in the F-17 experimental combination

The owner may reuse completed repair only for its exact accepted-history basis and trusted detached candidate. Successful preparation records the candidate alone; remote application invalidates before publication, regardless of whether that update appears text-only or pending. Failed/unaccepted work must not establish the accepted basis. Only membership-preserving text skips the pre-command scan; every other command retains current repair behavior. This is an internal sole-mutator contract, with no caller intent flag, state-vector inference or changed verifier policy.

The two-file runtime experiment passes focused/source/generated controls and both discriminating faults. Six serial browser sessions pass correctness/drain and consistently favor the candidate: ordinary paired median gains 5.5% early /10.1% later, with variable later pair effects and a passing Unicode guard. Retain this additive improvement without requiring it to close the entire latency gap. These small descriptive comparisons do not establish a budget, GC or population claim. [Evidence and limits](./f17-repair-r1.md).

The selected experimental combination is now R3 preparation + comparison pool + editor shortcut + primitive value-string reuse + membership-repair eligibility. Optional UI/publication patches remain separate. Next incremental publication with detached-read/status/remote semantics retained; persistent buffers keep full verification initially, and incremental verification remains a distinct proof/policy choice. Native ownership/memory/Account composition checks and the unchanged application gate still precede RC entry. Defaults, release counts and F-17's partial disposition are unchanged.


## 2026-09-15 — Park this incremental publication implementation

Preserve the new private projection cache and its normalization/detachment/history controls as an optional component. It passes 218 focused cases and the fixed six-session browser screen's correctness checks, but ordinary early timing is mixed and later median/p95 is slower in both pairs (median paired regressions 12.3%/18.2%). Unicode timing is also slower. The bounded source-work reduction is useful evidence, but does not justify adding this implementation to the selected combination. This declines selection on observed timing; it does not impose a minimum gain threshold or reject incremental publication generally. No profile identifies the regression's cause. [Evidence and limits](./f17-publication-r1.md).

Keep R3 preparation reuse, comparison pooling, editor shortcut, primitive value-string reuse and membership-repair eligibility. Keep optional UI and previous publication patches separate. Next persistent text-history buffers for a restricted text path, retaining full verification and defining ownership, reset, acceptance/refusal/retry/discard, remote/structural/undo/metadata and close behavior before measurement. Incremental verification remains a separate proof/policy decision; native ownership/memory/Account qualification and the unchanged application gate still precede RC entry. No default, release count or F-17 disposition changes.


## 2026-09-15 — Preserve the first buffer prototype; investigate its added costs

The private two-buffer candidate passes focused/generated/fault controls and its browser treatment receipts prove actual reuse on ordinary text. Nevertheless, every final ordinary median and p95 pair is slower: median paired regressions are 6.8%/4.0% early/later. Keep its retirement mechanism, normalization controls and complete patch as optional work while retaining R3 + membership-repair eligibility as the selected combination. This declines the measured implementation, not persistent buffers or small cumulative improvements. All earlier observations and the reference-lifetime correction remain recorded. [Evidence and limitations](./f17-buffers-r1.md).

Next use targeted cost accounting to separate full catch-up comparison and stack copying from the saved document fork. Specify the exact-predecessor, normalization, text-transition and runtime-history conditions under which replay produces the same preparation basis as a fresh fork. Only then consider replacing this prototype's added comparison with that proved invariant while retaining the existing full post-admission comparison. These timings do not attribute the regression or authorize simply removing a check. Incremental history mirroring and wider eligibility remain options; native ownership/memory/Account and the unchanged gate precede RC entry. Incremental verification of the existing canonical check remains a separate later proof/policy decision. Defaults, counts and F-17's partial disposition remain unchanged.


## 2026-09-15 — Recommend replay buffers and close the F-17 optimization round

Retain R3 preparation/value-string reuse, comparison pooling, editor projection shortcut and membership-repair eligibility; recommend adding Local replay buffers to the RC combination. Exact predecessor/accepted-delta ownership, conservative normalization and full copied history establish the restricted preparation basis. An idle transaction fence preserves pre-append transactional drift refusal. Raw private-field mutation remains outside that contract; every preexisting full canonical comparison stays unchanged. [Argument, controls and measured result](./f17-replay-r1.md).

Four diagnostic sessions identify the added comparison as about 11 ms against about 9 ms for a fresh document fork, with replay about 1 ms and relatively small stack copying in this corpus. The separate fixed six-session application screen favors replay in both ordinary pairs: median paired gains 21.1% early /20.5% later and p95 gains 21.5%/19.8%, with all correctness/drain checks passing. Emoji-bearing histories still use fresh forks. This is descriptive incremental evidence, not additive cumulative gains or a passing release budget.

The operator explicitly ends optimization exploration after this round and intends to accept the best supported combination for the RC while deferring a larger rewrite. Next choose/freeze and integrate this combination, then qualify its relevant native ownership/crash/memory/shared Account effects and run the unchanged application gate. Record any accepted performance shortfall as explicit release debt; do not relabel failing evidence. UI/publication alternatives, incremental history copying, wider normalization and incremental canonical verification stay out of this release integration. Defaults, F-17's partial status, release counts and immutable receipts remain unchanged in this phase.


## 2026-09-15 — Freeze the selected F-17 runtime and end exploratory selection

Integrate the exact measured R3 + membership-repair eligibility + Local replay candidate. Preserve
full canonical verification and full detached history copies. Keep the UI/publication alternatives
out. The candidate's six runtime files are unchanged during functional integration; the maintained
suite now includes the earlier codec controls missing from the combined patch. The full unit,
owned/native and nine discriminating fault checks pass. [Scope and evidence](./f17-rc-integration.md).

This selects the combination for qualification, without claiming default activation or release
acceptance. Shared comparison/editor/command changes enter source; Local replay remains private
and Account buffers remain excluded. Next qualify lifetime/memory and remaining native/Account
boundaries, then run the unchanged application gate and explicitly disposition any accepted
latency debt. Do not reopen optimization exploration or weaken the gate to make this integration
appear complete. The 96 command/63 campaign wrappers and immutable qualification remain ahead.


## 2026-09-15 — Keep selected F-17 runtime fixed; resolve native execution headroom before the next gate

The selected combination passes the bounded history/scratch lifetime campaign and three sensitive
fault controls. Do not turn those observations into a general heap or erasure guarantee: the
pre-existing canonical admission document remains reachable while its closed facade is retained,
and becomes collectible when that facade is dropped. No runtime change is made for that separate
hardening opportunity. [Evidence and scope](./f17-rc-lifetime.md).

Ten complete Account files pass 102 cases, but core receive twice exhausts its existing 300-second
stage limit. Its separately passing final authority-change case cannot replace a full-file receipt.
Keep both failures. Next diagnose and qualify that fixture's execution headroom with semantic/case
controls unchanged; do not blindly loosen the bound or restart product optimization exploration.
Then resume the unchanged application gate and Local activation decision. The selected runtime,
defaults, budgets and adapter counts remain unchanged here; whole-release qualification remains open.


## 2026-09-15 — Stop after one receive-fixture headroom repair

Following signed checkpoint `52a6aa80`, one measured fixture repair removes repeated ancestor
bundle evaluation only for receive's explicit full-bundle path. All test bodies, generated seeds,
crash operations and 300/480-second bounds stay unchanged. The single owned pass qualifies core
receive (17 cases/149.007s) and its ordered editor derivative (12 cases/150.515s). No second
repair or campaign round is undertaken. Earlier failed attempts stay preserved; this establishes
bounded fixture headroom, not application speed or full current-input Account qualification.
Return next to the unchanged application-latency gate and Local activation/debt decision. Keep
production defaults and the selected optimization combination fixed. Larger rewrites remain later
work; 159 wrapper obligations and immutable/loaded-host qualification remain open.
[Evidence and scope](./account-conformance-runs/2026-09-15-core-receive-headroom/README.md).


## 2026-09-15 — Activate the selected Local RC with open F-17 timing debt

Following signed `e38be54c`, retain the unchanged gate's failure: Android card p95 38.7 ms (<16 ms
required) and settled navigation 113.6 ms (<100 ms required). Desktop card is 9.0 ms and Android focus
35.4 ms; the other budgets pass. The initial card/focus-only exception rule refuses activation;
preserve that assessment. The operator's existing broader direction to accept the best combination
for the RC supports a separate explicit post-measurement navigation exception. Record both misses
as open implementation-review RC debt, with no altered test, threshold, receipt or automatic waiver.

The same measured candidate passes 147 owned unit cases, ten native workspace cases/four mutations,
and eight normal Local app cases with 20 generated histories. Apply its exact one-line Local factory
selection after those checks. Account and the internal constructor default stay reference. Keep
full canonical verification and complete detached stacks; stop optimization exploration. Return to
96 command/63 campaign wrappers, qualification repairs and immutable validation. The manual debt
disposition does not turn the failed gate green or claim a supported-device performance floor.
[Scope and closure criterion](./review/implementation/f17-rc-latency-debt.json);
[retained failed gate and functional receipts](./account-conformance-runs/2026-09-15-f17-rc-activation/README.md).

## 2026-09-15 — Preserve grouped wrapper semantics and passing-test evidence

The crypto preparation Node wrapper retains its reviewed two-file glob and default file concurrency.
Existing serial per-file receipts are different invocation contracts and cannot discharge that
command. Its real check-mode campaign is an explicit prerequisite, even in the bounded selection.
Vector aliases share only exact argv/environment contracts and same-owner, unchanged input/result
receipts. The final qualification includes an actual reused vector key rather than inferring reuse
from common source paths. Passing Node stdout/stderr/diagnostics enter the existing bounded stage
log; overflow fails instead of silently discarding success-path evidence. Campaign file outputs
remain a separate adapter obligation. [Evidence](./account-conformance-runs/2026-09-15-wrapper-preparation/README.md).

## 2026-09-15 — Retain report files under the execution owner

Opted-in report writers receive a fresh ACCOUNT_REPORT_DIR beneath the stage's retained output,
outside the disposable checkout. Required paths and byte/entry/depth limits are part of the receipt
contract. Inventory includes regular-file bytes and empty directories; both cache reuse and
prerequisite consumption recheck tree membership as well as hashes. Partial files remain after
failure/cancellation, while incomplete or oversized trees cannot establish passing output custody.
The first real report writer is a separate crypto probe variant, leaving package-command semantics
unchanged. Semantic report assertions and other output roots require their own wrapper review;
cooperative polling does not promise a disk quota or hostile-code confinement.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-file-output/README.md).


## 2026-09-15 — Account core wrappers require semantic report reconciliation

Execute the actual grouped Account core campaign with owner-issued process/browser/report resources.
A passing exit and intact report files alone are insufficient: require the complete terminal case
census, successful campaign summary, owned source hashes and discriminating baseline/mutant reports.
Keep spec/JUnit output as auxiliary evidence and exact per-file obligations separate from grouped
wrapper execution. Alias only exact command arguments and empty user environment. The first browser
startup abort remains a failed receipt; its passing retry does not erase it or establish a repair.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-core/README.md).


## 2026-09-15 — Recovery wrapper receipts bind persistent browser lifetimes

The owned recovery wrapper uses the existing inherited persistent-profile fixture and retains its
lifecycle report beside campaign evidence. Require three distinct clean browser incarnations, the
same owned profile and the complete reopen predecessor chain, along with exact terminal cases,
summary/source pins and recovery factor/root controls. Group drain is independently checked by the
owner; reported PIDs are cooperative observations, and virtual passkey restoration is simulated.
Keep the standalone wrapper and native report fallback intact. Previous blocked-wrapper assertions
must advance to explicit resolved-contract checks as adapters land, while unresolved rows still refuse.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-recovery/README.md).


## 2026-09-15 — Authority control evidence must distinguish trust and freshness

The authority wrapper's retained reports must show the specific controlled failures: a substituted
root with the requested nonce, and an old nonce with the expected root. Require baseline refusal,
mutant acceptance of the supplied pin and independently valid signatures over the archived message
bytes. A self-signature alone supplies neither the expected trust anchor nor a fresh challenge.
Preserve actual grouped execution and its exact case census; report labels and exit zero are
insufficient. [Evidence](./account-conformance-runs/2026-09-15-wrapper-account-authority/README.md).


## 2026-09-15 — Promotion controls retain actual mutation and acceptance observations

The promotion wrapper must retain the observed service eligibility result and all three intent
identities from its MAC control. Require baseline refusal, mutant acceptance of an actually
substituted intent, complete grouped test outcomes and bound source reports. Report labels alone
cannot establish that the mutation changed anything or that the mutant accepted that change.
These postconditions corroborate the existing native/service assertions; they are not independent
service or cryptographic replays. [Evidence](./account-conformance-runs/2026-09-15-wrapper-account-promotion/README.md).


## 2026-09-15 — Genesis wrapper credit includes historical inputs and semantic differences

A current source fingerprint does not replace explicit pins for the historical reader invoked by
the genesis fixture. Bind its actual Git expression and bytes through the existing before/after
history checks, including reuse. Retained controls must distinguish lost checkpoint state and a
wrong generation wrap while preserving unrelated candidate fields; recorded generated histories
must be complete and within their declared bounds. These checks corroborate the existing native
assertions and independent Node/OpenSSL oracle. They do not independently decrypt candidates or
regenerate the seeded schedule. [Evidence](./account-conformance-runs/2026-09-15-wrapper-account-genesis/README.md).


## 2026-09-15 — Admission controls bind observed activation and retained receipts

Require the approval controls' recorded active account and receipt target to match the exact account
and request subjected to the corrupted signature. Require the native receipt control to show offered
baseline refusal and exact retention of the invalid receipt after disabling verification. Replay
recorded service-history commands to check their final ledger state; preserve the separate native
receipt/coverage oracle. These report postconditions corroborate actual execution and do not replace
cryptographic verification, passkey checks or browser/database replay.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-admission/README.md).


## 2026-09-15 — Handoff reports bind credential substitution, routes and signature evidence

Require a refused credential baseline and an actually substituted public key with otherwise identical
binding targets; independently verify original and accepted service binding signatures. Require the invalid
passkey control's selected and classified routes to agree with its intended target. Verify retained P-256
DER signature bytes independently, while preserving the original test as authority for runtime conversion
and malformed-DER refusal. These report postconditions corroborate bounded execution; they do not replace
native state/content assertions or establish aggregate correctness.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-handoff/README.md).


## 2026-09-15 — Editing reports require observed outcomes and per-command recovery

Record the actual ancestry control's original writing and unchanged refusal baseline, and the passkey
control's invalid signature and unauthorized writing. Retain generated ancestry text and source hashes;
require the expected splice, descendant acceptance, missing-genesis refusal and no source mutation.
Reconstruct every generated editing/undo observation, not only the final result. Keep the native Yjs,
provenance and storage assertions as execution authority; a matching report is not independent ancestry
or browser/database verification.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-editing/README.md).


## 2026-09-15 — Multi-stage wrapper evidence keeps distinct child case domains

Use a completion trace for exact serial child invocations and nonce-bound reports for each Node/Vitest
child. Reconcile both only after producer drain and bounded output inventory. Retain exit-only vector
checks as such; a successful wrapper summary cannot stand in for terminal test outcomes. Preserve
standalone invocation and original concurrency, arguments and child deadlines. The complete planning
snapshot needs a 1,000,000-byte ceiling; runtime artifact bounds remain separate and unchanged.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-outbound/README.md).


## 2026-09-15 — Source-capture evidence preserves the first complete observation

Generated capture histories must compare every previously observed capsule before admitting new ones;
never refresh the expectation from the value being checked. Clone first observations to avoid aliases,
require retention of every prior record and compare both byte lengths and contents. Admit only the
existing v6 route-matching empty initialization capsule on reopen/crash, then retain its first observation. Retain actual admitted,
reopened and control outcomes so the wrapper can corroborate the native assertions with a separate map
and text fold. These checks repair the recorded map-refresh/byte-prefix weaknesses without changing
product admission or source-capture behavior.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-capture/README.md).


## 2026-09-15 — Spool evidence binds observed wire, grants and source coverage

Keep actual returned/persisted bytes and observed WebCrypto invocation counts in control and generated
reports. Reconcile complete grant events, immutable source positions, unchanged persisted wires and
exact final id/index coverage, with bounded allocation for malformed numeric fields. A missing-tail
control needs both the actual incomplete-ledger refusal and same-position changed-wire mutant. These
checks corroborate existing native/codec assertions; they are not independent decryption or storage replay.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-spool/README.md).


## 2026-09-15 — Decision controls pair normal and mutated verification on the same bytes

Retain actual normal-verifier unknown/rejection and mutated usable evidence/acceptance for each proof
control. Bind the recorded response/submission fields to the bytes used, require the specific intended
proof change and preserve observation/storage histories. Report checks corroborate native assertions;
structural framing and predecessor hashing do not independently verify signatures or replay storage.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-decisions/README.md).


## 2026-09-15 — Delivery wrapper evidence retains observed transitions and exact retry bytes

Persist generated observations before their assertions and pair fault outcomes with actual normal-code
persistence/refusal. Reconcile commit recovery, retries, proof-derived status, pending eligibility and
cold-reopened source/wire retention after producer drain. The event oracle corroborates native assertions;
it does not independently authenticate responses or replay storage. Preserve original native bounds,
case identities and intermediate fixture fencing without restoring retired v8 product support.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-delivery/README.md).


## 2026-09-15 — Service wrapper excludes its retired browser child and keeps full service evidence

The current service-delivery wrapper preserves its required Node files and removes the already-excluded
v8 HTTP interoperability invocation. Required v9 interoperability stays separate. New wrapper controls live
in another bounded infrastructure file; the existing manifest suite retains its cases and one-minute limit.
Retain observed baseline/mutant results and each generated command's ledger/response/recovery evidence.
Report reconciliation corroborates execution without claiming independent signature or database replay.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-service-delivery/README.md).


## 2026-09-15 — Inbound preparation preserves model scope and unordered module census

Transport and driver whole-wrapper exclusions already exist; retain their required shared tests rather
than reintegrating retired browser paths. Inbound preparation keeps original child commands/concurrency
and bounds. Reconcile exact multi-file Vitest census independently of scheduling order, preserving duplicate,
omission, mode and retry checks. Independently replay plaintext fixture updates and account for delivery
history while retaining crypto/full-state assertions in the actual tests. Atomic model evidence does not
establish IndexedDB safety or production receiver behavior.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-inbound-prep/README.md).


## 2026-09-15 — Codec wrapper evidence retains actual mutation and recovery observations

Keep codec and preparation evidence in separate existing namespaces. Preserve both Vitest child commands
and the exit-only Node import probe. Corroborate actual normal/mutant results, exact source edits and
live/cold byte agreement; generated wire faults retain their actual changed byte and refusal. Plaintext
Yjs replay and report framing supplement the executed crypto assertions without claiming independent
signature validation, compiled-bundle replay or native persistence.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-inbound-codecs/README.md).


## 2026-09-15 — Receive evidence retains exact committed wire; planning capacity is separate

Preserve original receive commands/cases/deadlines. Retain the request/page actually committed across
before/after cuts, and independently reconcile receipt progress and plaintext content coverage including
pending state. Cache only exact repeated unit-replay tuples within one report check, avoiding synthetic
Node async-resource exhaustion without skipping observations. The finite checked-in planning manifest
gets a four-MiB cap as explicit child contracts grow; exact round-trip/overflow checks cover it. Native,
process-report and archive limits are separate and unchanged.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-receive/README.md).


## 2026-09-15 — Ordered editor reports preserve first source observations

Retain original ordered-editor commands, case counts and bounds. Reconcile full source identities and
bytes against their first observation throughout generated actions and cold reopen, instead of relying
only on source counts. Require measured normal/crash and compiled-mutation observations to discriminate
early publication from durable recovery and remote relabeling from local authorship. Empty successful
typecheck output is permitted while command identity, completion and log presence remain required.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-receive-editor/README.md).


## 2026-09-15 — Owned transport wrappers keep descendants in the runner's group

Preserve standalone detached-child behavior while owned transport campaigns inherit the supervising
process group. Retain exact child invocations, case domains and deadlines. HTTP evidence distinguishes
the candidate signed page from the chosen response body or aborted transport, and checks actual durable
request positions plus first-observation source continuity across retries and cold reopen.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-receive-transport/README.md).


## 2026-09-15 — Polling evidence distinguishes transient gates from recovered progress

Keep original polling commands, effective mutations, generated counts and deadlines. Retain transient
failure/offline observations separately from the restored idle state, and bind cold restart queries to
durable receipt progress. Preserve exact source identities/bytes throughout. Scheduler control reports
must include disposal state and cleared timers, while original clock/authority properties remain the
scheduler oracle. A background empty poll may change idle/working status without changing progress.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-receive-driver/README.md).


## 2026-09-15 — Composition evidence binds sealed positions to actual request bytes

Retain observed encryption nonces and complete detached submissions, not only aggregate seal counts.
Reconcile their independently parsed positions/nonces, exact retry bytes, first source assignments,
authored text and both recovered lane counters. Distinguish server responses from replies actually
delivered to the client. Keep existing native cryptographic and scheduler oracles authoritative, and
save actual witness refusal/reopen observations in effective mutation reports.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-sync/README.md).


## 2026-09-15 — Service read evidence retains actual refusals and signed originals

Replace control success labels with the observed baseline and mutated results, retaining separate queries
when a simulated clock change requires them. Record exact pages/acceptances, generated inventory continuity,
process-death outcomes and HTTP/cold receipts. Verify signatures against observed keys as internal evidence
consistency, while retaining the independent fixture's authentication/authority assertions. Update planning
expectations when a wrapper becomes concrete without allowing unintegrated wrappers to borrow its receipt.
[Evidence](./account-conformance-runs/2026-09-15-wrapper-account-service-inbound/README.md).


## 2026-09-16 — Historical planning reuse is scoped; execution authority stays fresh

Deduplicate historical source reads only within one synchronous manifest compilation, keyed by root,
exact reference and path. Return independent pin objects, release the snapshot on every exit and make
all execution-time checks bypass it. Keep Git replacement semantics and existing deadlines unchanged.
The identical-manifest differential and real replacement/drift controls distinguish this optimization
from trusting a long-lived cache. Three new runner tests raise the reviewed disposition total to 2,201;
refresh the explicit census rather than suppressing them. Single-host timing headroom does not close
aggregate or loaded-host qualification.


## 2026-09-16 — Activation wrapper binds both historical and current evidence

Treat the older no-proof activation reproduction as an exact historical execution input, with 26 pinned
files and a closed population checked by the reproduction itself. Permit larger historical metadata
only for that complete reviewed set. Share revision reads only within one synchronous compilation;
execution checks remain fresh. Retain generated clocks, signed responses, observed state and actual
mutation/process/browser outcomes rather than replacing independent fixture assertions with labels.
Observed-key signature consistency is corroboration, not external authority. Keep the original child
commands, deadlines and counterexamples, including the manifest timeout that exposed duplicated work.


## 2026-09-16 — Batch historical planning reads without caching execution authority

Read the exact reviewed historical expressions in a bounded Git batch and hash the original blob bytes.
Require complete framing before publishing pins to the compilation-local snapshot. Keep the same
reference resolution and replacement semantics, with independent fresh reads at execution and reuse.
Use equal-manifest comparisons, binary/generated framing tests and real replacement controls to qualify
this optimization. Preserve unchanged deadlines and prior failures; single-host margin does not prove
loaded-host reliability. The two additional runner cases must enter both explicit census expectations.


## 2026-09-16 — Bounds evidence binds observed bytes and lifecycle states

Keep original command populations, deadlines and the report-custody ceiling. Retain complete long replay
updates with lossless encoding, and verify decoded descriptors independently alongside the original
cryptographic and native assertions. Distinguish historical parser and message-builder errors, and use
actual retained lifecycle states rather than convenience labels. Deduplicate only deterministic
signature work for exact byte triples within one reconciliation call. Before broader composed campaigns,
review child invocation identity, report namespaces, explicit retirements and prerequisite adapters;
source mentions and overlapping filenames cannot substitute for execution evidence.


## 2026-09-16 — Composed Account campaign preparation

Admission-bounds is signed and verified as `3af765d3`. Read-only inspection selects Account isolation
as the first composed pilot: 44 commands, 32 required Node files /205 cases, nine Node groups and
30 vector commands. Preserve exact order, grouping, 300-second child bounds and existing child report
namespaces. Its remaining retired v8 service-delivery browser child must be removed under the existing
exclusion; the four live service files and separate v9 interoperability remain required. Five invoked
historical blobs are identified from the selected leaf contracts. Standalone reproduction commands
absent from this wrapper do not acquire invented obligations or credit.

Four preserved generated reports alone total 5,932,919 bytes, exceeding the existing 4 MiB single-set
limit. This is a historical sample, not composed-run qualification. The next bounded phase is opt-in
namespaced report custody: independently bounded children and root metadata, a finite parent cap,
unchanged legacy single-set limits, complete retention and identity/reuse binding. The pilot will then
add the exact cooperative trace, semantic observations and owned qualification. Reservation-durability
remains separate: 50 commands, 15 direct Node files /133 cases plus three nested Local components and
full Vitest, whose postconditions cannot be replaced by successful exit codes.

A finite AST reader reproduces both frozen inventories without importing tests or campaigns. Its two
unknown-call probes refuse. The first draft counted a test filename supplied to lint/format; retain
that incorrect inventory, restrict cases to actual Node test invocations, and verify identical current
and signed-baseline output. No product tests or campaigns run in this documentation/preparation phase.
No manifest, runtime, package/dependency, vector, crypto-census, F-17 debt or prior archive changes.
The append-only records and L-2 checkpoint remain preserved. Counts stay **629 obligations /292 required
files /272 general files /2,203 dispositions (11 not applicable)**; **108 unresolved: zero test-file
/70 command /38 campaign**. Preparation does not resolve a wrapper. No personal operations occur.
[Plan](./release-validation-composed-campaigns.md);
[static evidence](./account-conformance-runs/2026-09-16-composed-campaign-prep/README.md).


## 2026-09-16 — Pause the release-validation campaign

The operator has paused the campaign: release validation was started prematurely, and the product
is not close to releasable. Preserve the completed runner work, composed-campaign preparation and
all existing evidence as a checkpoint. Do not start namespaced report custody, another wrapper
integration phase or an aggregate campaign under the previous standing instruction to continue.

The unresolved integration count remains 108 (70 commands /38 campaigns); this is bookkeeping,
not an estimate of product readiness or a mandate to finish validation before further product work.
The previously proposed validation-first sequence is deferred. Choose the next product work and any
resumption of this campaign explicitly with the operator. No gate is waived, no failure is relabelled
and no release claim is made.


## 2026-09-16 — Platform-specific UX follows the first RC

Per operator direction, platform-specific UX is work for after the first release candidate. This
includes native keyboard conventions and their platform-specific browser coverage. Keep the current
Goals keyboard integration; extending its Mac shortcut checks to genuine Windows/Linux and Android
behavior is deferred, not a prerequisite for the first RC. Describe existing coverage accurately:
the Mac shortcut suite does not establish other platforms' keyboard behavior. The release-validation
campaign remains paused.


## 2026-09-16 — Prepare second-device enrollment before advancing authority

Define the next backend product slice as a durable, freshly authenticated enrollment request, with an
explicit `prepared` result. The present service's delivery owner derives membership from the original
first-epoch promotion receipt. Therefore actual service admission must wait for a coordinated successor
format, current-authority owner and compatible delivery behavior; do not advance the head while leaving
its consumers unchanged. Account authorization and client-certified content recipients remain separate.
This bounds implementation rather than weakening the full enrollment contract. No backend implementation
or release-validation resumption is included in this definition.
[Phase contract](./account-enrollment-prep.md).


## 2026-09-16 — Coordinate successor admission with delivery and client adoption

Define the next backend phase against signed `d015210e` as one private epoch-1-to-2 admission of an
uncertified device. Preserve generation, acceptance key, principal, existing writer rights and the
effective certified recipients/recovery state. Admission alone carries the original client-approved
certification unchanged, including its original epoch context; the service cannot re-sign or reinterpret
that approval. Record this clarification in TRD §13.5.

Permit the creating publisher's exact already-sealed parent-epoch envelope across this explicitly
compatible transition, subject to the existing position/refusal rules. Newly issued acceptance names
the current epoch; the source envelope remains unchanged. Record the narrow rule in §7.4 rather than
treating an unsupported-epoch error as permission to re-mint. Historical proof verification and current
eligibility must become separate authenticated contexts, with ancestry and accepted-prefix checks.

The complete phase includes an atomic service current-head owner, delivery continuity and supported
v9 client adoption/cold reopen before enabling private consumption. First implement the distinct
successor bytes and pure verifier; retain unchanged first-epoch artifacts. Do not revive retired v8,
enable ordinary Account entry, generalize to multiple publishers or resume release validation.
The new device stays ineligible for content reads, publication and key delivery until later gates.

The later content-approval phase must settle SAS epoch restart versus installed-sibling certificate
rebasing with transcript-aware checks; the current state model omits that question. Do not silently
extend its assurance. [Definition, chunk boundaries and falsifiers](./account-successor-admission-prep.md).


## 2026-09-16 — Retain complete delivery evidence at successor admission

The admission head vector binds accepted stream positions, but not intervening permanent refusals.
Retain the original signed full-ledger witness at the transition boundary and re-sign the current
witness under the new head in the same transaction as the successor/pointer. Verify both complete
prefixes and the vector; never rewrite historical decisions. Consumption is the unique successor
record, so the original preparation receipt remains immutable and subsequent views report `admitted`.
Schema-6 upgrades preserve the original genesis preparation token shape. This private service result
does not enable the HTTP path before supported client adoption exists.
[Contract](./account-crypto/admission-successor.md#5-durable-service-consumption-and-delivery-chunk-b).


## 2026-09-16 — split successor client adoption at the historical replay boundary

Chunk C first supplies a read-only verified-history foundation (C1), then integrates ledger replay and
owned installation (C2). The current v9 owner assumes one head in captures, delivery rows and received
pages; installing a pointer before repairing that assumption would make retained writing unreadable.
Historical acceptance issuance is bounded by the signed successor prefix; refusal history cannot be
classified by that accepted-position vector. Complete signed-envelope prefix matching is necessary
but does not replace custody/content coverage or the eventual atomic lifecycle commit. Neither C1's
focused tests nor its runtime inventory qualify the new construction or resume release validation.


## 2026-09-16 — preserve capsule, mint, record and proof epochs separately

Successor client replay (C2a) resolves compatible historical bytes only through verified admission
history. A capsule's capture epoch, envelope's mint epoch, record owner's current context and signed
proof's issuance epoch can legitimately differ; rewriting them would change retained evidence or
lose pending work. Batch selection respects capture-epoch boundaries, while old unsealed captures
and interrupted allocations may use fresh current-epoch seals. Legacy readers remain strict without
that verified context. Current owner installation/dispatch stays disabled until C2b pays atomic
persistence, exact local boundary, cold reopen and late-response obligations.


## 2026-09-16 — authenticate the client's adoption boundary without replacing genesis

The supported private v9 promotion gains a closed optional successor field containing the full artifact
and its pre-install local ledger witness. Only markers containing that field extend the existing MAC
tuple. This preserves original receipt/slot custody evidence and all old marker bytes, while older
closed parsers refuse the new field. Installation writes only the marker under the existing exclusive
lifetime after complete prefix and coverage checks; no new key, content write or nonce reset is needed.
Cold replay verifies the same prefix and exact ledger cut. Historical source capsules are excluded from
the authority-event cut so an already-acknowledged old journal edit can flush after adoption.

A late old acceptance remains historical evidence in a current-context local record. A receive reply
bound to a superseded request is transiently discarded and polling resumes under the installed head.
Invalid adoption or precommit storage refusal cannot be reported as successful adoption or unnecessarily
close a valid editor. Complete-profile rollback still requires a surviving newer anchor; the marker MAC
and native transaction do not establish external freshness. HTTP discovery and qualification remain
separate obligations; no release-validation work resumes through this product phase.


## 2026-09-16 — separate discovery transport from authority installation

Split the remaining private integration into D1 service endpoints and D2 client reconnect ownership.
`/account/enrollment/admit` consumes the retained preparation capability and exact attempt/receipt;
`/account/authority/discover` requires an original certified member signature and binds the pinned
service, workspace, lineage, held head, nonce and deadline. Both have 4 KiB ingress bounds in addition
to the private same-origin/token gates. No operator-only enrollment or uncertified-device discovery
fallback is introduced.

Discovery validates the complete retained delivery census and rechecks the current snapshot, expiry
and custody after asynchronous verification/signing. It retries at most four snapshot changes and
otherwise refuses; signed locator bytes are not content/key/publication authority. A concurrent
transition after the final read remains an ordinary later state; the response and client anchor do
not provide an external freshness oracle. Automatic client adoption remains D2, under its existing
storage lifetime and the authenticated local prefix/ledger-cut checks.


## 2026-09-16 — reconnect discovery belongs to the existing sync lifetime

Run admission-only discovery in the composed owner's receive lane, retaining one automatic network
pass and existing offline/storage gates. Successful unchanged replies use a five-second monotonic
cadence, invalidated by reconnect; unavailable replies use the existing backoff. Stop discovery after
the single supported successor is installed instead of implying a general epoch-chain implementation.
Explicit refreshes share in-flight discovery and cannot create another storage or authority owner.

The exact creator-signed request remains owned until its root-signed reply verifies or the lifetime
ends. Expiry is checked again at the native marker comparison; a verified reply may expire while
waiting for asynchronous custody work. That online freshness condition is separate from the historical
successor signature and local prefix proof. A late empty reply cannot regress an already-installed
child, and an invalid locator cannot close a valid editor merely for being untrusted. No change to
ordinary Account entry, deployment or the paused release-validation decision follows from this result.


## 2026-09-16 — content approval restarts on a competing epoch

The operator selected restart rather than rebasing a typed-code approval onto a new epoch head.
Restart uses fresh credential identity/keys, admission, nonces, transcript and code entry; exact
resumption keeps the original transcript and durable decision. The ceremony's own exact verified
certification successor is completion. An untrusted stale-parent response cannot itself establish
a competing transition. The existing client retains the one-comparison budget under authenticated
custody as well as reporting terminal refusal to the service.

Already-delivered keys cannot be taken back by restarting. Retain pending delivery/certificate
evidence and refuse activation against another parent; do not claim erasure or revocation. The
current one-child admission runtime cannot offer fresh replacement admission, so the first private
ceremony may stop with restart-required. General admission/history and the delivery/install/
certification contract must precede a supported retry and second content reader.

TRD §13.6 and row 11 §7 now agree. The old enrollment state model is explicitly historical where it
asserts sibling-rebase liveness. [Phase-three preparation](./account-content-approval-prep.md) orders
primitive bytes, authenticated exchange, durable attempt/relay and two private owners before key
release. Existing cryptographic vectors and frozen release evidence are unchanged.


## 2026-09-16 — ceremony primitive agreement is not approval authority

Expose row-11 primitive derivation without a comparison or key-release API. Verifying nonce openings
after collecting all inputs does not prove both commitments preceded disclosure; that belongs to
the authenticated exchange and durable owner. Fixed historical vectors stay exact, while generated
properties compare the full transcript digest and independent HKDF result rather than asserting
that every mutation must change a 25-bit SAS.

Use bounded ASCII code normalization with O/I/L folding at five symbols; reject non-ASCII case
folding and invisible separators without changing the existing recovery-code parser. The private
runtime still supports one admitted child; a generic positive safe epoch in this byte helper merely
permits reproduction of the historical epoch-9 vector. Record the new runtime construction as open
qualification, not inherited closure or release credit.


## 2026-09-16 — first-device UI joins the private enrollment backend

Integrate `ea3a3ffb` locally alongside the ceremony work. Keep the first-device product preview's
existing owners and its explicit no-sync boundary. Account selection/verification supplies no
second-device content authority; committed exchange, durable approval and delivery/install/
certification remain required. Preview schema upgrades are explicit offline operations with backups,
not a side effect of normal startup or this source merge. The integration check uses disposable
schema-five service state and virtual authenticators, never the author's running installation.


## 2026-09-16 — bind nonce reveals to both signed commitments and a fixed attempt

Use separate fixed-purpose exchange domains around the unchanged row-11 primitives. Each
commitment signs the complete authority/participant/attempt/deadline context. Each reveal signs
that context identity and the hashes of both complete signed commitments, then opens its own
role-bound nonce. Resolve approver keys from original certification, candidate keys from verified
admission, and compare the caller's owned tuple. Service signatures cannot replace participant
signatures. A fixed ten-minute content-ceremony lifetime starts independently of account preparation.

Pure verified context/pair handles are private brands, not serializable persistence or approval
capabilities. C/D must retain exact signed records and reverify them after restart, enforce one
attempt/comparison per credential, and compare head/deadline/cancellation at native saves and
before disclosure. Model crash/resume and generated interleaving results are explicitly conditional
on those storage predicates. Competing authority terminates the attempt without erasing its record;
unsigned stale/error responses cannot establish that authority change.


## 2026-09-16 — stop at a usable private two-device approval flow

The operator's objective is an experiential milestone, not qualification. Replace the broad C/D
exit campaign with one real development path and focused crash/retry and authority checks, then
stop for operator use. Keep release validation paused and do not refresh inventories, run mutation
controls or invent additional qualification gates. Delivery/install/certification remains a later
product phase; approval alone must not open writing on the pending device.

Use the existing mandatory-factor custody and exclusive slot lifetime for both participants, with
a counted encrypted approval carrier and a local durable single-comparison record. The service is
an additional ordering/budget keeper, not the client's authority for comparison. The existing device
explicitly signs an invitation before historical account proof, including encrypted genesis, is
shared. Bootstrap is nonce-bound and root-signed; peer messages and outcome remain device-signed.
The service's single-child schema stores one immutable attempt per workspace and never resets it.

For the operator's requested physical-device trial, use a separate tailnet HTTPS origin on port
8443 and fresh development state. Preserve the existing 443 route and other services. The author
controls both personal browser sessions; automated checks use disposable profiles.


## 2026-09-17 — root splash precedes the shared-device chooser

The operator confirms that `/` should always start at the existing splash. **I already have a
workspace** opens the chooser, which contains saved accounts, device connections and retained
setup/enrollment progress. A remembered selection must not bypass the root splash. Selecting a
connection resumes its factor-gated state; an approved device still does not open writing before
delivery, installation and certification exist. Apply this to the private development entry;
the existing default-app deployment is not changed by this phase.

The older enrollment retained its approval but not the invitation needed for bootstrap. The
operator accepts reopening the original invitation and unlocking once on that development phone.
Retain the verified invitation in encrypted approval state for subsequent chooser-based resumes;
keep the existing workspace/slot navigation hint untrusted and recheck custody and authority.
New attempts save the invitation with their first encrypted enrollment progress. No service
authorization bypass, reset of comparison budget or implicit new-account creation is authorized.

Further product choices, including device names, QR entry, fewer prompts and factor simplification,
require operator input before implementation.


## 2026-09-18 — browser navigation within credential ceremonies

The operator selects TanStack Router and approves the 22 proposed Back dispositions in
[account-preview-navigation.md](./account-preview-navigation.md). In particular, Back from recovery
confirmation may redisplay the original generation result during the same unfinished in-memory
ceremony. This amends the earlier wording that forbade redisplay immediately after leaving the
save screen. It does not authorize persistence, post-completion redisplay or reconstruction on
reload. Leaving the ceremony warns before discarding the display; a signed confirmation retires
it because its outcome may already have committed.

Navigation changes presentation, not authority. Reversible save/confirm views retain one owner;
leaving an unlocked flow aborts/settles and drains it. Pending, terminal and approved attempts
resume their authenticated state without cancellation, budget reset or replaying completed
commands. Direct invitations get an internal parent. Native passkey cancellation remains owned
by the browser/OS. The root splash remains at `/`, and the chooser contains saved accounts and
connections. Other product decisions still require operator input. Release qualification remains
paused; this is bounded development usability work.


## 2026-09-18 — continue approved enrollment through durable key installation

The operator authorizes the next bounded product phase: delivery, factor-protected installation
and certification, followed by content bootstrap/opening and later sync integration. Continue the
already approved attempt without another passkey, code or comparison. Do not import or delete the
phone's previous writing. Keep the preview designation and release qualification paused.

The concrete continuation retains exact delivery bytes and a signed recipient-set successor
before releasing the generation key. The recipient durably saves the matching recovery state
and locally sealed key before signing installation. A service-serialized epoch 3 binds that exact
installation, certificate and original-writer accepted prefix. Unknown outcomes resume immutable
records. A competing parent cannot rebase the approval, and pending delivery evidence cannot be
removed to undo a disclosure. See [the implementation contract](./account-content-delivery-development.md).

The operator confirmed both devices locked and closed for the additive preview schema upgrade.
Back up the retained state and preserve the pin/origin, accounts and attempts; do not reset the
preview or change other Tailscale services. Product choices about fewer factors, device naming,
QR routing or broader enrollment remain separate and still require operator input.


## 2026-10-07 — activate the certified second device through the existing editor owners

The operator requested continuing through second-device editing and two-way delivery. The second
client retains its existing factor-protected enrollment custody and physical content scope, while a
new authenticated interlock explicitly binds them to the logical Account identity and certified
shared content key. It does not masquerade as an original Local-to-Account promotion or rewrite that
promotion's provenance. Installation is resumable; ordinary writers refuse its interlock.

Each certified device publishes a separate position sequence with its own completeness witness. The
original publisher's historical ledger remains unchanged. Receiving keeps per-publisher cursors and
proofs, and preserves the existing atomic durable receive and ordered admission boundary. The editor,
local journal, source capture and network spool are reused. This is the bounded two-device development
path, with focused retry/authority checks; it does not restart release qualification or introduce a
new generalized migration/sync framework.


## 2026-10-07 — remembered network login across Lock and its absolute lifetime

The operator selects **preserve login when locking**: Lock workspace closes live connections and clears
unlocked keys/access credentials, while the selected person's encrypted local custody retains the
credential needed to resume network access after unlock. Sign out instead ends that installation's
selected login and closes the person's local slot under PRD §6.6; it does not revoke the device or sign
out another person or another device. Offline sign-out cannot claim server completion before an
acknowledgement; local closure and disabled resumption do not wait for the service.

The operator selects **30 days from sign-in** as the maximum age of remembered network login before a
fresh online passkey check. This is an absolute service-side deadline, not an inactivity timeout; use,
locking, reopening and background renewal cannot extend it. Network expiry leaves otherwise-eligible
offline opening, reading and durable editing available. Existing local factor/verifier requirements
remain distinct from online login. No additional idle-expiry policy is introduced in this increment.

The recommended construction and bounded implementation sequence are in
[account-sessions-subscriptions.md](./account-sessions-subscriptions.md): account-specific factor-sealed
renewal, in-memory short access, stateful revocation and scoped fetch/SSE wakeups into authenticated
catch-up. These are design recommendations, not running-service capabilities. Prompt consolidation,
broader device/recovery journeys, Redis deployment and public hosting remain separate. Release
validation stays paused.


## 2026-10-07 — opportunistic combined local unlock and network login

The operator approves one fresh passkey assertion serving both local unlock and online login when
login is needed and an explicit combined challenge is already ready. Prepare the challenge in the
background while the unlock screen is visible. A valid remembered login keeps the ordinary local
unlock plus background renewal. Offline/slow service must not delay opening; later Connect/Reconnect
is explicit. The device-lock code and locally verified service-signed account binding remain required.
A server result alone cannot open writing, and an ordinary historical/offline assertion cannot mint
a network login. Sign-out must suppress automatic login even when reopening retained writing.

The implementation uses a separately sealed auxiliary login carrier under the actual slot writer,
derived from existing mandatory-factor custody with its own random salt, domain and reserved counter.
This avoids mutating the content owner's authenticated cached custody record. For unknown issuance,
offline sign-out retains only the attempt cancellation capability; it does not retain the assertion
or an unsealed renewal secret. The narrower cancellation endpoint can also revoke that attempt's
already-issued session. See [phase 2](./account-session-client.md). Live activation remains behind
phase 3's scoped route cutover; this is not a new release-validation campaign.


## 2026-10-07 — combine fresh enrollment and network login

The operator approves extending the joining device's already-required online enrollment passkey
assertion to establish network login, avoiding another prompt before content approval. This must use
an explicit combined challenge purpose and commit enrollment/session issuance atomically, with exact
retry recovery and factor-sealed client retention. An old enrollment receipt or assertion from the
ordinary enrollment purpose remains insufficient. Approval of this product choice is not an
implementation or live-cutover claim; it is the next part of sessions/subscriptions phase 3.

### Device lifecycle entry point and ordering

**Date:** 2026-10-08 · **Gate:** L-1

The operator chose additional devices and removal/revocation before lost-device recovery, and approved
a **Devices** entry in the editor’s Account menu. It opens one verified device list with connection and
removal actions. Keep the existing invitation/code-comparison ceremony and visibly distinguish pending
enrollment from approved content access. This is UI/order approval, not permission to weaken the
revocation/rotation/finalization contract or infer remote custody properties from a display label.


## 2026-10-08 — Serialize unfinished device connections (`L-1`)

The operator selected **one unfinished connection per account at a time** for the initial additional-device
flow. Devices offers Resume or Cancel for the pending connection before another invitation. Enforce the
same rule at the service boundary, not only in the interface. Preserve pending-versus-certified authority:
cancellation of an unapproved device must not revoke approved readers or rotate their content key. A
competing authorization change still requires a fresh transcript and human code comparison under the
existing ruling; serialization of enrollment does not allow rebasing an earlier approval.


## 2026-10-08 — Cancel before comparison approval; Remove afterward (`L-1`)

The operator selected **Cancel connection before approval**, then **Remove device after approval**.
After the human approves the comparison code, the new device may already have received a content key
even if certification/setup is unfinished. Removal therefore includes forward key rotation and explains
that existing copies cannot be erased. A pending roster alone cannot establish that no key was delivered.
Uncertain approval/delivery outcomes preserve the possible-access classification; an unsigned denial or
missing acknowledgement cannot downgrade removal into cancellation. Resume is offered where the actual
retained local attempt can be resumed, not by transferring another device's private signing authority.


## 2026-10-08 — First removal flow targets other devices (`L-1`)

The operator selected **other devices only initially** and renewed authorization for unsigned
intermediate commits and continued implementation. Keep the requesting device connected. Self-removal
and the last-device case remain local-clear/recovery work. This does not relax forward rotation,
authenticated finalization, exact retry or the existing-copy limitation. The implementation plan is
[other-device removal](./account-device-removal.md); no removal control is enabled yet.


## 2026-10-08 — Replacement admission uses current-key retries (`L-1`)

The operator chose **Require current-key retries; preserve offline edits** over distributing historical
content keys to replacement devices. The replacement snapshot must include already accepted writing.
Surviving devices retain original local edits and old openers, but still-unaccepted old-key uploads
must be retried under the current key at the replacement boundary, with signed evidence before
superseding an allocated upload. An unsigned denial, timeout or stale authority hint cannot authorize
that change. Exact accepted-envelope retry remains exact. This qualifies the earlier allowance for
late historical-generation survivor uploads; it does not authorize losing offline writing or retiring
historical keys. See [repeatable lifecycle](./account-repeatable-lifecycle.md).


## 2026-10-09 — First lost-device recovery scope (`L-1`)

The operator selected **Passkey plus recovery code first**: a person may lose every connected device
but must retain an account passkey and the saved recovery code. Loss of the passkey too remains an
explicitly unsupported account-access recovery path until separately designed. The code does not
silently become an account login credential.

The operator selected **Disconnect previous devices and rotate**. The explicit confirmation is
“Recover on this device and disconnect the previous devices.” The recovered device becomes the sole
approved content device; future writing uses a fresh content-key generation. Previous devices may
retain their old copies. This does not authorize erasing other local workspaces, replacing the account
passkey, or claiming that copies of old writing can be recalled. Exact UI placement and screens remain
for an operator walkthrough. See [the implementation plan](./account-lost-device-recovery.md).


### 2026-10-09 — Recovery screen sequence approved

The operator approved: Use another account → Recover with a saved recovery code → choose the
existing account passkey → enter recovery code → save and confirm a new device-lock code → review
“Recover on this device and disconnect the previous devices” → recover and open the editor.
Keep the account passkey and recovery code unchanged; retained recovery progress belongs in the chooser.
Implementation must still establish complete replay and atomic replacement before presenting success.


### 2026-10-09 — Recovery restart boundary before device-lock setup

The operator approved restarting the passkey/recovery-code steps if the tab or browser is closed or
killed before the new device-lock code is saved. Candidate private keys remain in memory in that
interval; switching to a password manager or backgrounding the page must preserve the ceremony.
After lock setup, recovery progress and exact pending intent must be protected durably by that lock,
including retries after a lost commit reply. No recovery code is retained for redisplay.


## 2026-10-09 — Upgrade now; defer walkthrough and validation until publication (`L-1`)

The operator authorized deploying the completed history-management build to the retained :8443
installation, deferred the personal history-management walkthrough, and instructed that release
validation remain paused until after a version is published. Publication does not automatically
resume the campaign; wait for operator direction. Focused deployment integrity/identity checks are
part of the requested upgrade, not a resumed qualification campaign. This does not select a public
host/domain or authorize moving existing passkeys/accounts to a different origin.


## 2026-10-09 — First public host, snapshot retention and separate operations (`L-1`)

The operator selected `done.oxidationlabs.com` on the existing `~/Code/ol-infra` Kubernetes/Flux
platform, with cert-manager and SOPS/Kubernetes Secrets. The Tailscale installation need not migrate;
the public deployment can start fresh. SQLite snapshots without Litestream, encrypted before upload
to B2, are accepted. Brief sync outages are acceptable. Target 30-second non-overlapping backups
while state changes; retain recent copies for five minutes, hourly for six hours and daily for seven
days, with no weekly/monthly tier initially. Slow/failed backups change the observed recovery point,
not the meaning of a successful local write.

The operator explicitly agreed that ordinary application updates, schema migrations and disaster
restores require different rules. The detailed implementation plan is [public deployment](./public-deployment.md).
Release validation remains paused until after publication and explicit resumption; the personal history
walkthrough remains deferred. Final destination credentials and public activation are separate steps.

For Git, the operator chose a signed explicit merge commit on local main to incorporate the long-running
branch while retaining its existing commit hashes, then a new deployment branch. No squash, rebase,
remote push or retroactive signing of the old history is implied.


### 2026-10-09 — Signed PR history replaces the direct-main integration route (`L-1`)

The operator identified main protections and authorized signing the outstanding commits to use the
PR route. GitHub rules require signatures, linear history and a pull request with squash as its only
merge method. Preserve those protections. Replace the 102 unsigned commits and re-sign the one merge
whose parent changes, preserving all trees, messages and author/committer metadata; keep original
objects under a local backup and commit a permanent hash crosswalk. Restore local main to the remote
base and update existing PR #41 without force-pushing. Retain the signed PR branch after squash so
phase objects remain reachable. Reconcile ancestry-dependent validation before its explicit
resumption on squashed main; do not alter historical receipts. Future PR/deployment commits are signed.
See [the signing record](./commit-history/README.md). This changes repository workflow, not the
agreed deployment or paused-validation scope.


### 2026-10-09 — Preserve validation ancestry through ordinary PR merges (`L-1`)

The operator chose to change GitHub's merge policy instead of adapting validation to squash history.
Linear history is disabled and ordinary merge commits are the only allowed method at repository and
main-ruleset levels. Required PRs, verified signatures and force-push/deletion protections remain.
This supersedes the squash route recorded immediately above. PR #41 merged as `8c6005f3`, preserving
all 398 signed PR commits and their ancestry. The original-to-signed crosswalk remains relevant;
the hypothetical post-squash ancestry repair is obsolete. Continue signed deployment work from the
merged main history. No validation requirement is relaxed and release validation remains paused.


### 2026-10-10 — Automatic restore reconciliation is a publication requirement (`L-1`)

The operator chose automatic reconciliation before publication over a verified restore that remains
quarantined pending operator reconciliation of newer client-held history. This expands deployment
step 4; archive authentication and session-custody reset alone do not close it. The subsequent proposal
to make externally visible durable decisions wait for an encrypted off-host commit log is **not
approved**: the operator requested discussion of recovery versus availability first. Preserve the
agreed 30-second snapshot plan while that choice remains open. Do not silently require B2 for sync,
weaken client rollback checks, resume release validation or publish a quarantined-only restore as
complete recovery. No maintenance or restore implementation was applied in this discussion.


### 2026-10-10 — Operator-led recovery replaces the automatic-reconciliation publication gate (`L-1`)

After discussing snapshot coverage, independent storage, VM-local logs and multi-node replication,
the operator chose to record those tradeoffs without choosing an architecture today. Build the
operator-required recovery version now, accepting possible loss of client writing. Automatic
reconciliation is no longer a publication prerequisite; the earlier same-day decision above is
superseded. Keep the current asynchronous snapshot policy, preserve rollback/access protections,
and require explicit operator disposition of uncertain restored history. No synchronous B2 log,
second volume/node, production reset or client deletion is authorized by this choice. The options
and limits are recorded in [recovery choices](./recovery-options.md).


### 2026-10-10 — First public schema maintenance is explicit and operator-owned (`L-1`)

The first deployed public schema is 26; no private intermediate schema is being supported as a
public upgrade path. Maintenance preparation uses the source image and stable ownership lock,
keeps a crash-persistent serving fence, and verifies a protected encrypted off-host recovery set.
The saved age identity is supplied only to offline preparation for decryption/cold-open verification,
never to the API or routine backup worker. Resumption in this image is allowed only for unchanged
source files including nonempty WAL. A future actual transition must add explicit target-image
migration, interruption/retry and preserved-authority checks before deployment. Resolved backup
expiry is an operator command after seven days, requiring a newer verified routine recovery set;
unresolved or unverifiable copies remain held. Application-image updates and quarantined disaster
restore retain their separate rules. [Procedure and scope](./public-maintenance.md).

### 2026-10-11 — Verified service publisher tips with asynchronous integrity audits

The operator approves replacing repeated full delivery-ledger scans with bounded verified tips,
subject to a fresh witness/count check on every request, fresh verification of served rows, and
new signatures derived only from verified chain state. Fully verify first use after startup and
invalidate on authority or external-connection changes. Run full audits off the request path,
triggered by appended-row cadence and backup cycles, rather than an inline five-minute stall.
On mismatch quarantine the publisher, emit fixed `ledger-integrity`, signal the operator and
attempt no repair. Late audits may not restore invalidated/closed state.

An old unread row changed without altering witness/count or SQLite change tracking may remain
undetected until audit. Signing an extension of the previously verified prefix before detection
does not authenticate the altered bytes; it also cannot promise that all latent corruption stops
new signing immediately. Indexed COUNT avoids loading blobs but is not literally constant-time.
The [implementation/measurement protocol](./performance-experiments/2026-10-11-service-verified-tips/plan.md)
records these limits. The [implemented service slice and focused evidence](./performance-experiments/2026-10-11-service-verified-tips/README.md)
retain the full reference for exceptional lifecycle/retry paths and audit public authority in a
separate read-only worker. This is not a release-qualification result or a deployment receipt;
release validation remains paused.

## 2026-10-12 — Exclusive Account warm-load verification window

The operator accepts replacing per-task old-row rereads in the exclusive Account owner with an
owner-local authenticated view. Check the authenticated counter and per-store count plus first/last
key on each warm load; an unexpected counter requires a full read. Do not describe IndexedDB count
as constant time without measurement. Only completed owned commits extend the view.

Old same-count interior corruption can be detected at a later audit/open; the live owner continues
using previously verified memory. Roll through bounded old-row checks and, after a row/time trigger,
complete audit slices even during activity. Full verification remains mandatory at acquisition and
before reuse after hidden/frozen-page resumption. Counts/bounds cannot prove all interior bytes.
Refuse detected damage without repair. Workers may be considered later; no worker is required by
this decision. See [the bounded implementation contract](account-warm-ledger-loads.md) and
[the local-retention design](account-local-retention-design.md), which changes no stored format yet.

## 2026-10-13 — Define immediate-use final receive authority; runtime unchanged

The operator requested a freshness/invalidation contract before moving the final authority read
out of the editor queue. The [bounded design](account-final-apply-authority-design.md) recommends a
complete fresh check on the serialized storage owner, followed by a single-use permission consumed
immediately only if the editor can apply synchronously without overtaking older input. It must not
wait in the FIFO. Any later storage-task request invalidates it conservatively, as do authority and
lifecycle changes; revocation begins before effects/awaits, not only after successful writes.

A scheduling miss after successful verification discards the permission and takes the existing
full queue-head check once. Verifier failure, changed proposal authority, close or repair keeps the
existing refusal/cold-replay disposition. Keep journal-before-apply, current undo history, complete
projection verification and all receive-commit/readback checks. No task/transaction survives the
handoff, and no new online freshness or protection against bypassing the exclusive writer is claimed.

This records design work, not implementation or authorization for a general reusable authority
cache. No new seconds/minutes custody-corruption window, format change, release campaign or deployment
is selected. The current runtime still checks authority at the final FIFO head; physical account
performance remains pending its separate disposable-credential fixture.

## 2026-10-13 — Implement immediate final authority; retain the measured limits

After signed design `742e1c14`, the operator requested implementation. The private gate preserves the
complete fresh inventory check, native settlement, current authority/lifetime, FIFO predecessor order,
journal-before-apply and undo. It allows one synchronous application only in the immediate successful
continuation; every other storage request invalidates at enqueue. A miss uses the old queue-head
check once; a failed verifier closes/refuses. No format or longer-lived authority cache is introduced.

The [bounded comparison](performance-experiments/2026-10-13-immediate-authority/README.md) passes all
correctness guards and establishes shorter final queue-held work with few extra checks, but receiving
input-p95 contrasts are mixed. Retain the implementation in the working candidate on that bounded
mechanism/progress evidence, without claiming a repeatable typing-latency gain or authorizing
publication. The measured rejection conditions did not occur. Keep the reference switch, preserve
all runs, and investigate remaining synchronous costs separately. Physical account performance and
release qualification remain pending/paused.

## 2026-10-13 — Prepare the accumulated performance work with host-load uncertainty explicit

The operator reported heavy VM use during recent testing and requested release preparation. Preserve
the timing packets and all observations, adding the unknown external-load overlap as a limitation.
No measured slowdown is explained away, and no unobserved speedup is claimed. Proceed with bounded
publication checks on an immutable signed candidate; do not restart the paused release-validation
campaign or treat the pending physical-phone comparison as completed.

## 2026-10-13 — Select local retirement evidence rules before deleting history

After signed non-deleting lifecycle work `cf16e61a`, the operator requested that old network reads,
checkpoint cuts and restored journal/database pairs have explicit dispositions. The
[retirement evidence contract](account-local-retention-evidence.md) selects:

- Invalidate/refetch volatile reads at the retention boundary. Drain already committed receive
  promotion or skip the cut; preserve all unresolved publication/retry evidence.
- Keep terminal receipts/frontiers and the exact latest installed checkpoint with its cuts and
  historical verification material. Unknown older links require history, never trust learned from
  the incoming response. Durable maintenance/lifecycle attempts postpone retention.
- Introduce a versioned Account journal wrapper binding exact capsule bytes to an authenticated
  random retirement era and local database identity/intent. Change the era atomically with source
  retirement under the existing empty-journal/admission fence. First enforce it without deletion.
- Preserve/refuse cross-era or otherwise incompatible journals. Matching eras do not establish
  complete dependency or nonce continuity for a partial restore. Known raw rollback is quarantined
  for explicit recovery; coherent whole-profile rollback remains undetectable without an external
  witness. This does not change the separate operator-required server restore policy.

A focused executable counterexample confirms why this is necessary: legacy source recovery treats
an accepted capsule as new once its exact identity has been retired, despite unchanged Yjs state.
The real owner continues using full history. This is a design selection plus characterization,
not implementation of the new guards, permission to erase acknowledged work, product activation,
or authorization to delete history. Preserve live undo, journal-before-apply and complete fresh
authority checks; old/private readers need explicit format fences before new writers activate.

### Bound the passkey repair by independent Local access and a real provider walkthrough

**Date:** 2026-10-15 · **Commit:** pending after signed `42ebdd12` · **PRD/TRD:** v9/v8,
with their 2026-10-14 onboarding amendments.

**Orientation.** The operator reproduced failed passkey setup in Firefox private browsing with
Bitwarden: the extension saved a credential, then setup failed and later local access appeared to
reject the copied unlock code. Focused Chromium/virtual-authenticator success had not established
this journey. The working tree is clean and the earlier product changes have signed boundaries,
so the repository procedure can be adopted without rewriting their history or recertifying them.

**Decision.** First repair passkey response compatibility and independent protected Local access.
Establish counterexamples before implementation, retain existing verification and custody checks,
add new regressions without editing old tests, and require an actual Firefox-private/Bitwarden
walkthrough before calling the repair fixed. Record implementation, automated evidence and device
observation separately in the [bounded packet](account-conformance-runs/2026-10-15-passkey-local-access/README.md).
Do not relax CSP or authenticator verification to accommodate a provider. Retain the other seat's
active checkpoint. Removal/migration UX and unissued-code routing are separate subsequent repairs;
general qualification and publication stay paused.

### Preserve foreign recovery progress and fence the selected setup lifecycle

**Date:** 2026-10-15 · **Source:** follow-up to signed `5afdd0ad`.

**Evidence.** The failing preview had a confirmed account passkey and a matching service pin, but
its unscoped recovery draft belonged to another account/retry and another Local workspace. A new
packaged regression reproduces both exact errors while the same code independently opens Local.
The real Firefox-private/Bitwarden walkthrough reproduces the pair after an older Local removal.
Fresh two-tab setup with the other tab locked succeeds; an unlocked editor can instead delay the
required exclusive permit. Two-tab timing alone is not the identified cause of the retained-state
error.

**Decision.** Keep matching legacy drafts at their current keys. Preserve a structurally valid
foreign draft atomically under its account/retry identity before saving a new current draft; refuse
destination collisions and changed sources. Retain current-key reader compatibility and never use
foreign recovery material as authority for the new attempt. Fence metadata operations against the
selected setup and removal, including writes staged before removal. Explicit removal cleans only
its scoped or identified attempt records. A post-verification continuation failure offers retry and
independent Local access, without claiming the valid factor was rejected. A waiting writer barrier
explains that other tabs need closing.

**Tradeoff and bounds.** Unrelated legacy orphans remain preserved rather than being erased to make
setup proceed. Older readers cannot resume retained foreign attempts through the new identity key;
their current-key owner mismatch remains a refusal. Active matching drafts, protected workspaces,
factor verification, account verification and crypto byte formats retain their previous behavior.
No persisted unlock cache or credential fallback is introduced. The
[bounded packet](account-conformance-runs/2026-10-15-multi-tab-setup/README.md) records failing evidence,
new regressions, compatibility and removal checks, actual provider results and remaining limits.

## 2026-10-15 — Keep optional receiver discovery separate from required authenticated history

**Scope.** The operator authorizes receiver compatibility, then blocked-bootstrap hint writes.
Old tests still require explicit approval; merge, deployment and aggregate qualification stay paused.

**Decision.** A legacy session host without continuation may use ordinary delivery without the
unsupported history endpoint. Read the live host hint inside the serialized authenticated state
task, and require history whenever installed/inherited history, a later membership epoch or a later
generation requires it. Once required in that owner lifetime, keep requiring it even if the public
hint changes. A failed required endpoint still withholds ordinary receiving. Keep the existing
signature, prefix, coverage, native commit, readback and final-application verifiers unchanged.

**Bootstrap.** Save startup discovery hints only after acquiring the existing shared Local permit
and repeating compatibility, after the network wait. Refused compatibility omits optional cache
writes; public configuration may still locate an Account whose own factor/passkey owner understands
the authenticated promotion interlock. A failed native probe never grants writes. Recheck a pin
which another opener may have retained before changing metadata. Keep live capability refresh
independent of optional persistence so an active Account's exclusive permit cannot hide an upgraded
host. The hint is scheduling information, never authority to skip retained history or open writing.

**Evidence and tradeoff.** Initial regressions reproduce failed legacy delivery and exact-census
changes under both absent and present account services. A hint-only fault build is detected by the
retained-history test. Unit cases cover queued upgrades, unknown/undefined intents, failed probes,
fresh/offline discovery and changed pins. A refined case caught the need to retain a freshly read
capability in memory when persistence is correctly refused. The new promoted-Local browser fixture
explicitly proves its interlock and authenticated reopen. Original failed attempts, a mistaken
separate-Account fixture, and pending old-fixture updates are retained in the
[bounded packet](account-conformance-runs/2026-10-15-receiver-compatibility/README.md).

## 2026-10-15 — Compile application source without recompiling optimizer output

**Scope.** Repair development compiler loading after committing the separately approved account
fixture updates. Preserve protected custody, authority checks and crypto formats. Existing tests
still require explicit approval; publication and aggregate qualification remain paused.

**Decision.** Anchor Babel's React Compiler include filter to this repository's actual `src/`
directory, resolving the configuration URL and escaping path segments/separators. Keep the compiler
preset and its ordinary dependency exclusions. Optimized dependencies must not be compiled again,
including when their cache lives outside `node_modules` or under an unrelated directory named `src`.

**Reason and evidence.** The traced optimized TanStack Router response gained a named compiler-runtime
import after Babel processed it. Vite omits ordinary-source CommonJS interop inside optimizer output,
whose compiler runtime exports a default. Explicit interop metadata alone did not fix that boundary.
Both new browser regressions fail before repair. A first generic source-segment filter passes ordinary
cache paths but fails both cases with an unrelated `src` cache path. The final anchored filter passes
that challenge while actual application output still invokes the compiler runtime. Fresh and retained
caches, identical retained optimizer metadata, Local writing, reload and server restart are exercised
under both ordinary and private-migration configurations. No dependency upgrade or runtime shim is
introduced. The [packet](account-conformance-runs/2026-10-15-compiler-loading/README.md) preserves those
failures and the final evidence; broader release and default-worker timing obligations remain open.

## 2026-10-15 — Restore executable source and historical harness closures

**Scope.** After signed compiler repair `a6fa2298`, restore the bounded H1/H2 harness paths. The
operator explicitly approved the existing-file patches, source-evidence updates and layout of their
new blocks. Application, service and protocol source, test assertions, mutation targets and existing
deadlines remain. Merge, deployment, preview refresh and aggregate qualification stay paused.

**Decision.** Include and hash all `account-protocol` files in the four frozen legacy campaigns.
Bundle the actual mutated scheduler with its dependencies. Retain every emitted native chunk/asset
under its emitted filename, hash the output inventory and import its declared entry. Do not read
missing snapshot dependencies from the live checkout or infer an entry from output order.

For receive/admission-bounds historical checks, rebuild complete production source from the original
full Git revisions, reject loaded production files outside that snapshot, record module/source/bundle
identities, and keep raw current census observers separate. The receiver bridge invokes the genuine
historical v8 delivery owner because a receive owner did not exist at that revision. It does not export
a current owner or substitute a parser. The old revision also predates v2 admission; a positive control
runs its original service, creation fixture and owner together. Modern signed receipts are not rewritten
to construct purported old data. Independent regression checks compare archive files against Git blob
identities and require fresh output, so a prior successful artifact cannot satisfy a new run.

**Limits and tradeoff.** These are historical source rebuilds using the current installed toolchain,
with unchanged historical runtime dependency declarations and recorded lock identities. They do not
reconstruct historical binaries. New direct regressions remain required but blocked from aggregate
credit pending execution-denominator and process/browser-custody review. The separate issuance-boundary
mutation anchor still fails before applying its fault; a load error is not sensitivity evidence. No
security guard or assertion is weakened to clear that H3 obligation. The original failed attempts and
subsequent results belong in the [bounded packet](account-conformance-runs/2026-10-15-source-harnesses/README.md).

The existing historical execution adapters also require review of expanded archive and module-report
custody. Their retained narrow module pins remain useful identities, but do not attest the complete
rebuilt source graph. Direct native passes do not supply that missing aggregate evidence; no process
guard or report policy is relaxed here.

## 2026-10-15 — Functional repairs as an ordered unsigned patch series

The operator explicitly authorized cautious changes to old tests and harnesses without individual approval, then superseded the request to commit with a request for sequential patch files to apply and sign later. Keep tests, meaningful security assertions, fault sensitivity and original deadlines; resolve contract disagreements before changing security expectations. Freeze each bounded phase against its preceding Git tree using a separate index, verify clean sequential application independently, and retain its evidence and limitations. Do not create even temporary commits, sign, push, merge, deploy or refresh the preview. General qualification remains paused; the previously deferred unrelated formatting patch stays separate.

The first control repair updates the issuance-boundary policy at both enforcement sites, retains independent signing and exact plaintext/refusal checks, and requires actual forbidden cleanup before crediting cleanup mutants. A different refusal or failure to load is not evidence that the intended control works. Production application/service/protocol source is unchanged in this phase.

## 2026-10-15 — Keep explicit protected-startup checks alongside automatic first-run fixtures

The four existing protected-startup cases retain their original confirmation-before-creation, legacy no-write refusal, plaintext disposal and interrupted-genesis assertions. A test-only HTML entry mounts the unmodified current LocalApp with its retained explicit protected-startup option; it is not the default shipped entry or a production artifact. Current packaged root/Local entries use the actual optional-protection UI before requiring lock/offline cold unlock. Account and reader fixtures must accept only the documented direct saved-factor entry or explicit chooser; preserve actual authentication, rollback and unchanged-storage assertions. This avoids relabeling a credential-first fixture as proof of the agreed automatic first run.

## 2026-10-15 — First Local bootstrap does not start hint-writing discovery

The preserved future-document-schema census exposed another bootstrap write: an unauthenticated service response added public cache hints before Local refusal. Keep the exact assertion. For public Local entry with no known saved Account entry, defer service discovery until explicit sync/account navigation. Preserve the existing pinned Account bootstrap and all factor, compatibility, replay and document checks. Saved-entry read failure must refuse rather than infer a fresh workspace; reuse the existing error panel as its single UI home. This is a bounded first-Local repair, not generalized qualification of every cached-pin state. Add native public-entry and full-census regressions and normal CI coverage without resuming the paused aggregate. Dedicated injected-router setup tests and packaged main-bootstrap tests are separate evidence populations.

## 2026-10-16 — Successor stage expectations follow authenticated checkpoint transitions

Retain the original closed pre-checkpoint, malformed successor, invalid cut and stripped-field checks. Correct only the obsolete v8 structural refusal to the actual pre-checkpoint v5 boundary, after independently exercising a genuine retained v5 → authenticated v6 checkpoint → cold v9 receiving transition. Add unsigned v6/v7/v8 and field-removal cold-open regressions with exact no-write inventories. Parsing a supported stage is not authentication. This reconciles the old C2b prose with the later checkpoint implementation rather than relaxing a security guarantee; protocol, custody and runtime code are unchanged.

## 2026-10-16 — Nonvisual lifecycle observers do not depend on animation frames

A Local-genesis wait timed out even though its captured creation was resolved and no slot locks remained. Observe promise state and lock queues on bounded timer polls, preserving the original deadlines, fault definitions and exact refusal/no-write assertions. Preserve timeout state/lock artifacts and full failed sequences; selected passes do not erase full-run failures. Dependency-custody symlink refusals remain enforced, and bounded functional checks remain separate from aggregate qualification.

## 2026-10-16 — Bound the default unit gate's independent file workers

Use at most two concurrent Vitest files while retaining all cases, existing deadlines and concurrency explicitly exercised inside a case. Earlier default Node 26 timeouts remain evidence; fresh default passes do not erase them or establish a deterministic current failure. This is a repeatable gate resource budget with a local speed cost, separate from performance measurement and aggregate qualification. Compare complete case identities/statuses on pinned Node 24 and the local runtime rather than crediting a filtered fast run.

## 2026-10-16 — Re-pin protected custody homes after reviewing recovery-only amendment

The two §13.3 authority-map pins predate the signed recovery-progress isolation amendment. Independent old/current section extraction shows no other difference; both entries already scope protected custody and invocation accounting, and the amendment explicitly grants no opening/passkey/service authority. Refresh only those content pins with a dated review, retain every disposition/blocker, and challenge the unchanged checker with temporary section drift plus exact restoration. Do not pay implementation/platform debt by refreshing a documentation hash.

## 2026-10-16 — Resume authorized removal; distinguish refusal from an unfinished deletion

**Against:** PRD v9, TRD v8 and storage contract SC-06/07/08.

**Decision.** A durable device-removal intent is authorization to resume its exact target automatically when the removal screen reopens. Reading progress is not new authorization: failed reads offer only a read retry, and absent workspaces do not claim erasure started. Unassigned legacy database/journal carriers refuse before any intent or deletion; verified legacy import cleanup/exclusion remains mandatory. The UI explains the refusal and preserves the old installation/export requirement. Ordinary removal failures retain a retry and actionable storage/tab guidance, with the content → journal → metadata ordering unchanged. An identified setup-only attempt may install a non-content removal fence even if genesis never created custody; it creates no workspace, key or opener. Cold removal URLs serve the existing immutable shell, retaining the same CSP and supported-slot grammar. A cancelled inspection releases its queued permit; it does not cancel or roll back authorized destructive work.

**Bounds.** No legacy-writer exclusion is inferred, no origin-wide erasure is offered, and no protected opening, account deletion or remote revocation authority changes. General qualification and publication remain paused.

## 2026-10-16 — Storage refusals are not unlock prompts or fresh-account authority

**Against:** PRD v9 onboarding amendment, TRD v8 and SC-06/08.

**Decision.** Account setup distinguishes a fresh store, an established factor-bearing store, and a refusal. Inspect migration/repair/removal/availability states before selecting a code screen, and repeat classification before issuing a new code. A saved setup hint alone authorizes neither genesis nor replacement enrollment. Automatic Local custody routes back to explicit protection rather than asking for a code that was never issued. Read-only classification changes presentation only; all factor, claim, genesis, promotion, passkey and service verifiers remain. Connected/confirmed account ceremonies retain their authenticated continuation. Failed inspection offers a storage/account-selection path instead of the restart action that itself requires a code.

**Bounds.** Unconfirmed codes may be regenerated only while existing genesis reports fresh; any completed or resumable claim requires its established factor. Valid-code continuation failures keep their separate retry classification. Legacy carriers are preserved, not bypassed to create a new account. Billing, remembered unlocking and generalized qualification remain separate.

## 2026-10-16 — Setup-only removal requires the pre-registration shape

**Against:** SC-06/07, PRD v9 / TRD v8.

**Decision.** Narrow phase 1's metadata-only removal to the existing v1 fresh attempt with null view and proof. A later registration, non-fresh or malformed hint with no custody/index identity cannot establish that encrypted content is absent, so preserve it and refuse before creating an intent. A presentation hint never supplies missing content identity. Existing identity-bound removal and the newly supported valid pre-registration cleanup remain. Three discriminating counterexamples fail on the broader phase-2 composition and pass after this restriction. Apply the whole sequential series; intermediate snapshots are not release candidates.

## 2026-10-16 — Integrate functional regressions without granting aggregate qualification credit

**Against:** repository development/evidence procedure and paused release-validation contract.

**Decision.** Run the five new regression files through normal CI (unit discovery, explicit packaged browser selection and bounded application/gateway tests) while retaining required blocked manifest rows until their independent execution adapters are reviewed. Preserve every preceding obligation/deadline and every old test file. Review only the six changed crypto census source hashes; labels, sites, constructions and exclusions are unchanged. Fix the new auto-resume callback's hook dependency rather than suppressing React lint. Source pins and failure logs bind these local checks; final patch replay is a separate verification, and signing/publication remain later operations.

## 2026-10-16 — A retired account coordinator cannot present an unlock form

**Against:** SC-03/SC-08, the existing lock/drain lifecycle and the bounded publication procedure.

**Decision.** Keep account setup in working/locking presentation from synchronous retirement through native cleanup. Only the successor coordinator may offer a code form. The former form belonged to an aborted owner and silently ignored input while its close promise was pending. Do not delay retirement, skip drainage, retain an unlock capability, or weaken factor verification to repair presentation. A held-request unit counterexample and a held native metadata-lock browser counterexample discriminate; the isolated Linux old-state control fails at the exact UI boundary.

**Fixture and evidence bounds.** The competing setup tab uses the explicit Check again action before reclassification and still must enter the established factor. Retain every prior assertion, case and deadline. Add one unit and one browser case; update only the resulting exact denominator/source metadata. Hosted CI's other two timing failures are preserved; local Mac/Linux passes and the proven race do not by themselves establish their exclusive cause. Rerun hosted CI on the signed repair before publication. The earlier exact-image preflight artifact is superseded for publication and must be rebuilt from signed source. General qualification remains paused; no production change is made by this repair.

## 2026-10-16 — Keep unit deadlines and exact bytes while bounding hosted contention

**Decision.** Run the ordinary hosted unit population with one file worker and preserve every case workload, the five-second default and the 20-minute job limit. Serialization alone is insufficient in the retained Linux control. Replace only five large binary comparison sites in the two timed-out cases with Node's strict deep equality, retaining all bytes/types, state copies, mutation/isolation checks, generated histories and seed/run parameters. No production code or crypto contract changes. Changed-byte controls must still fail; the projection reporter's wrapped/shrunk error is its actual evidence, not an inferred inner stack.

**Bounds.** Full local functional passes do not erase the hosted failures or establish a successful AMD64 rerun. All obligation rows and release blocks remain. Hosted CI must pass on the signed phase before publication; qualification stays paused.


## 2026-10-16 — An empty legacy placeholder is not retained legacy writing

**Against:** storage contract SC-03/06/08 and the existing verified fresh-genesis owner.

**Decision.** Fresh genesis may proceed beside the known `done` database only when its version is exactly 1 and it has zero object stores. Leave that database untouched. A store with zero rows is deliberately not this exception; recognized, unfamiliar and unsupported layouts still require migration, as do all legacy journals and read failures. Repeat the observation under the existing creation lifetime before the first custody claim. This neither migrates/removes source material nor supplies old-writer exclusion; legacy import/cleanup and factor/binding verification are unchanged. An observed late schema upgrade or journal refuses creation and retains its data. Presentation alone remains no authority to create.


## 2026-10-16 — Connection preparation reports its actual startup refusal

**Decision.** Keep the startup kind/reason when device preparation refuses and describe that state. Only a factor-bearing or resumable creation reports a saved device setup. A migration or unreadable store is not evidence of a saved attempt; cancellation, removal and compatibility also retain their actual requirements. The error authorizes no code generation, route replacement, repair, erasure or bypass. Fresh preparation and verified enrollment authority remain unchanged.


## 2026-10-16 — Preserve qualification blocks while integrating the empty-placeholder repairs

**Decision.** Normal CI executes the two new unit files and packaged browser regression. Review their independent case census, retain the old tests/deadlines, and refresh only the affected source identities and exact fixture counts. Preserve every preceding obligation; the new browser file stays required but blocked from aggregate credit until its execution adapter is reviewed. Firefox/Chromium disposable checks are evidence for the bounded startup behavior, not a new platform/provider or release-qualification claim. Publication remains separately authorized and is not performed here.


## 2026-10-16 — A preserved Chromium upgrade is not a resolution of Firefox account disappearance

**Decision.** Investigate the recorded testing actions separately from application upgrade behavior. Audit original call/response identities and origins without opening production browser storage. Reproduce the actual previous and deployed release sources/frontends with a full backend/gateway restart, retained service identity and independent persistent browser profiles. Establish old-worker control before the baseline and await the new document when comparing refresh-boundary storage. Use the existing virtual-authenticator convention without changing application cryptography or storage owners. Archive the operational probe as evidence text, outside ordinary discovery and aggregate qualification credit.

**Bounds.** Passing fresh-account and promoted-Local Chromium histories narrows the disappearance hypothesis; it does not disprove the reported normal-Firefox failure or earlier account histories. Retain incomplete attempts and the unresolved early-bootstrap offline-unlock failure alongside the passing result. Distinguish online navigation followed by offline unlocking from entirely offline launch, and descriptor digests from exported CryptoKey material. The prior repair series stays immutable; no production change follows from this investigation.


## 2026-10-16 — Reduce device-approval round trips while preserving independent replay

**Decision.** Attribute the original-device busy interval before choosing a repair. The additional-device path constructs a replacement snapshot by independently replaying accepted prefixes; simply trusting the already-open document would lose that evidence. Test a transport-only group of up to four unchanged signed one-position requests/pages. The server must execute them in order through existing transaction-time authorization, and the client must retain the existing sequential per-page verifier, prefix/cut/byte/event bounds and expiry. Framing provides no authority. Preserve old-server fallback and existing work budgets. Establish the gain with restored, alternating matched fixtures and complete Markdown-content agreement, not different fresh-account timings.

**Bounds.** This is a measured desktop experiment and bounded implementation sequence. Phone/WAN behavior, progress presentation, interrupted long-replay resumption and the earlier Firefox account disappearance remain separate. No production change or generalized release qualification follows from the result.


## 2026-10-16 — A read group preserves each request's authorization and the existing work ceiling

**Decision.** Use a bounded unsigned transport carrier around the exact signed v2 requests/pages. Execute inner reads sequentially through the original domain owner and transaction-time grant checks; a failed subread returns no partial group. Reserve four existing work/inflight units conservatively and preserve the ten-second HTTP deadline. Return a nonempty prefix on aggregate-size pressure or after 250 ms of completed work, without preempting an ongoing cryptographic read; the client must issue fresh requests for the remainder. This avoids multiplying slow completed reads within one deadline. Do not introduce parallel login owners, unordered through observations, persistent verification caches or a private-bearer fallback.

**Qualification.** The new carrier remains an open construction, with independent literal framing and actual scoped-HTTP controls. Updating exact open-count/list fixtures retains every old security assertion and the aggregate block; it grants no full qualification credit. The transport contract lives in account-receive-transport.md and all earlier construction statuses remain.


## 2026-10-16 — Group additional-device reads without relaxing the existing replay owner

**Decision.** Activate grouping only through an optional history-source transport callback for additional-device snapshot preparation. Preserve the same native source permit, one login-owner callback per group, exact captured request-to-page pairing and original verifier sequence. A nonempty returned prefix advances only through individually verified positions; its remainder receives fresh nonces/expiries. Only a 404 selects the original first request on the original route, with a coordinator-local unsupported hint. Other refusals retain normal failure/retry ownership. Grouping grants no ability to skip accepted writing, change authority, keep a factor longer, install a key early or mint another comparison.

**Evidence and limits.** Retain all raw matched observations and compare complete ZIP entry contents rather than container timestamps. Expired saved comparisons must be replaced with fresh real test fixtures, preserving the ten-minute deadline. The final workload median improves 25.4%, with mixed pairwise attainment of the prospective 20% target and no population/phone claim. Directed regressions and normal-CI integration leave every preceding qualification block in place; new test files remain blocked from aggregate execution credit pending their adapter review. Prepare separate attribution/server/client patches, preserve failed attempts and independently replay/stage the sequence before signing.


## 2026-10-16 — Show verified enrollment work without turning progress into authority

**Decision.** Following signed transport commits `e31b5eaf`, `1f2d9cd2` and `465c5e07`, expose transient stage/count observations from the actual additional-device replay and handoff owner. Count sources and accepted changes only after their existing verification/application; distinguish those substeps from journal-inclusive local replay, snapshot construction/publication, key delivery, installation and certification. Unknown work uses an indeterminate bar. Callback failures cannot interrupt protocol work, and retirement/completion clears observations. Do not persist progress, add polling, show invented time/overall percentages, or promise work through phone screen lock. Keep exact saved-approval resumption and every existing check.

**Performance boundary.** Existing owner-local exact-byte reuse, shared census, cooperative preparation and bounded receive prefetch provide concrete follow-up patterns. The local source already uses baseline census reuse. An editor document or a memo from another owner cannot replace independently authenticated accepted-prefix/source completeness; parallel ceremony login calls remain forbidden. Attribute deeper original/joined replay costs before selecting a new reuse or pipelining mechanism. This phase establishes truthful presentation and fault/lifecycle behavior, not another speedup. The [contract](./account-enrollment-progress.md) and [bounded evidence](./account-enrollment-progress-evidence/2026-10-16/README.md) retain this distinction and all prior qualification blocks.


## 2026-10-16 — Attribute repeated authority work before reusing it

**Decision.** After signing the requested progress indicator as `2f1d0b0f`, update only the port-8443 frontend from its clean signed tree. Preserve the existing API identity/state, route and public configuration. Attribute original and joined additional-device approval using disposable fixtures before choosing another optimization. The local recovery path already reuses its baseline census; an editor document cannot replace authenticated source completeness. The new diagnostic evidence selects repeated service historical-authority verification within an existing sequential read batch.

**Fixture boundary.** A stale-authority injection must cover the optional batch route as well as the original route. Independently reproduce both old failures on signed source and repair only the route glob; retain every assertion and deadline. Keep diagnostic results distinct from ordinary timing, preserve failed attempts and leave generalized qualification paused. [Evidence](./performance-experiments/2026-10-16-enrollment-authority-reuse/01-attribution/README.md).


## 2026-10-16 — Reuse exact historical authority only inside one sequential read group

**Decision.** Adapt the existing exact-input/short-lived-owner reuse pattern at the repeated service authority verifier identified by attribution. Each inner read still captures its own native snapshot. Reuse only for the same verifier and serialized pin/header bytes, excluding independently checked decision rows; repeat every native issuer check and retain subsequent authorization, signature, expiry, ledger, SQL-commit and far-side checks. Retire the private lease in the batch finally, detach mutable output and fall back to full verification on changed, oversized or unsupported context. Retain one entry, no persistent cache or private signing/login capability. The 2 MiB bound describes retained context bytes rather than the whole derived graph.

**Challenge and evidence.** Preserve the failed JSON/Map counterexample; use process-local V8 bytes with no persisted format. Thirteen new Node controls, a real capacity/exact-retry browser case and final-source rotation journeys exercise the boundaries. Fourteen ordinary matched connections meet the prospective owner-specific target and retain exports/two-way writing/reopen. Small local-desktop samples do not establish phone/WAN performance. The later API optimization remains an unsigned sequential patch and is not on the preview. Keep all prior qualification obligations/statuses/deadlines/blocks and the new tests blocked from aggregate credit. [Evidence and limits](./performance-experiments/2026-10-16-enrollment-authority-reuse/02-reuse/README.md).

## 2026-10-16 — Account for actual sequential read work without spending phantom concurrency

**Decision.** After the immutable authority-reuse series, retain numeric rate/burst ceilings while separating a live HTTP request from the sequential reads inside it. Charge admission before bounded-body input; atomically top up to the exact validated batch count before execution. A refused top-up charges admission only, never a partial extra tail. Refund only reads never started; failed/refused/discarded started work remains charged. A batch uses one live-request slot, with one inner read active at a time and the unchanged global/session live-request and byte bounds. Account/session identity stays service-held, and all native cryptographic/transaction authorization remains independent.

**Evidence and staging.** New counterexamples demonstrate small-batch overcharging, same-session slot starvation and unused-tail charging. Fourteen new cases and preceding budget/batch/reuse/authentication/retry cases pass (58 total). Correct only the old single-page exact-budget loop, preserving all assertions and adding an explicit full-four-read companion. Keep initial sandbox/Host-header fixture failures and pre-fix defects separate. Freeze this phase before the sustained-load comparison; do not infer a safe numeric rate from policy algebra. New test obligations remain blocked from aggregate credit; general qualification remains paused. See the throughput phase evidence and prospective protocol.


## 2026-10-16 — Keep numeric admission rates while testing page density

**Decision.** Six restored native API runs demonstrate that explicit replay backoff accounts for 56–63 seconds of a 67–70-second, 1,024-position limit-one replay. Exact accounting reduces same-session writer worst waits from about three seconds to about one, while the second account sees no 429s. It also increases observed process CPU and sampled RSS, so preserve those costs. A first-epoch content-blind fixture cannot establish deeper-membership/global production capacity. Retain numeric rate/burst limits and test up to eight independently verified entries per page next, avoiding fixed strides over short pages.

**Evidence boundary.** Live replay/peer pages are independently checked. Every interactive write completes after bounded retries; its authored bytes and stored acceptance proof are independently verified by a cold SQL audit, while live write reply bytes were not retained. Keep failed pilot/shutdown/grant captures and all completed observations. This phase adds evidence only, grants no qualification credit and changes no publication state. [Evidence](./performance-experiments/2026-10-16-enrollment-throughput/04-sustained-load/README.md).


## 2026-10-16 — Verify denser history pages without changing durable receipts

**Decision.** Use the existing eight-entry transport width only for transient accepted-history reconstruction, sharing scope, signature, envelope/proof/decryption and actor validation with ordinary single-entry receiving. Keep the durable codec and every original guard-removal assertion. Verify a whole page before progress/application, preserve exact cut and total event/byte limits, and use its actual cursor for the next request. One adaptive page per carrier retains old-server fallback without guessing a short-page stride. Numeric admission values remain.

**Evidence and boundary.** Nineteen unit/seven source cases, preceding codec/controls/history cases and nine unique packaged journeys pass after three narrow fixture corrections. Fourteen restored browser connections preserve exports/writing/reopen and meet the >=10% owner-specific target. The 1,024-position API follow-up has no 429s, but exposes same-publisher cache-invalidation contention; keep that guardrail issue and require a separately falsified reuse repair before final acceptance. Two native harness failures reproduce on phase-A source and need fixture repair, not suppressed assertions. [Evidence](./performance-experiments/2026-10-16-enrollment-throughput/05-dense-pages/README.md).


## 2026-10-16 — Defer append-prefix reuse after the concurrent-write falsifier

**Decision.** Retain the measured accounting and transient page-density changes as reviewable development patches, but defer the extra append-prefix cache implementation. Its bounded corruption controls pass and censuses fall, yet all six fixed-offer concurrent-writing replay arms still refuse with unknown/state-changed. Phase C's final writer acceptance condition remains unmet. Do not treat reduced repeated work, passing narrow tests, or a failed run's lower duration/CPU as reliable completion or release readiness.

**Next boundary.** Reproduce the actual client's state-change/retry handling, then establish replay completion and bounded offered-input write latency without changing authority, exact cuts, expiry, byte/work or corruption guarantees. All six runs have zero 429s; raising rates is not supported as a remedy. Preserve the failed attempt, prospective amendment, prototype identities and six outcomes. [Evidence](./performance-experiments/2026-10-16-enrollment-throughput/06-concurrent-writing/README.md).


## 2026-10-16 — Exercise a complete pre-group reader and count actual fresh counter reads

**Decision.** Replace the mixed three-file historical graph with the full pinned `534252e1` production archive through the existing source-identity helper, preserving its real reference mode. Replace the obsolete warm-content getAll probe with actual content-counter reads, retaining the half-count and exact transaction assertions. A new independently pinned closure/definition regression replaces the insufficient transform-hit count. Preserve every native compatibility, receipt, crash, refusal, bound and deadline assertion.

**Evidence.** Both defects reproduce on the frozen earlier runtime. All 14 affected native cases and nine complete source-owner/unsigned-successor checks pass; individual/group counter reads are 36/9 and readonly/readwrite transactions remain 92/23 and 8/2. The helper's new closed/captured mode tests fail against its predecessor. [Final functional evidence and limits](./performance-experiments/2026-10-16-enrollment-throughput/07-native-fixtures/README.md). The phase-D concurrent-writing failure remains an open acceptance blocker, and no rate or release-guarantee change is justified.


## 2026-10-16 — Retry exact history reads after bounded state-change refusal

**Decision.** Preserve the service's safe raced-snapshot refusal and retry scheduling at the additional-device history owner. Four extra read attempts are shared across one load, with 200 ms abortable delay and one existing ten-second deadline per logical request. Capture independent exact request bytes before awaiting; fallback uses the same captured inner request, budget and signal. A closed unsigned state-change hint schedules bounded work only and grants no content, progress, key, membership or cut. Do not retry writes, other faults/refusals or changed authority; preserve every verifier, native guard, corruption check and rate/format contract.

**Evidence/boundary.** The actual frozen coordinator stops after one refused read. Fourteen directed unit controls, all 74 preceding transport/codec/guard-removal controls, 50 existing native/scoped/history checks, 37 adapters and six final packaged journeys pass after repair. A retained negative caught aliasing Buffer.slice copies in the prototype; detached Uint8Array construction repairs it. [Evidence](./performance-experiments/2026-10-16-enrollment-throughput/08-history-read-retry/README.md). The finite concurrent-writing workload remains a separate acceptance test before claiming its blocker cleared.


## 2026-10-16 — Accept bounded continuation for the identified history-read race

**Decision.** Accept patch 08's exact read retry for the named failure boundary and finite workload, preserving safe native refusal, the four-extra-attempt/load cap and original ten-second logical deadline. Do not claim arbitrary writer liveness or revive the failed prefix-cache implementation. Persistent contention still stops with saved setup.

**Evidence and qualification.** All three repaired 1,024-position runs finish, including one genuine state-change exhaustion followed by an exact-body retry and independently verified success. All nine offered writes per arm and peer proofs succeed within the chosen 2.5 s input-write ceiling. The three old-client arms also finish; changed parser/native schedules make this unsuitable as a failure-rate or speedup estimate. Preserve the earlier six raw-probe failures. One paired input maximum rises 23.49%; inspection shows its queue existed before the first refusal/retry, and its native request remains within the unchanged census range. All 15 functional browser journeys and four restored export/writing/reopen comparisons pass. [Evidence, raw schedules and limits](./performance-experiments/2026-10-16-enrollment-throughput/09-concurrent-continuation/README.md).

**Release boundary.** This closes the identified bounded client-continuation blocker, not generalized qualification, physical-phone/WAN or global capacity obligations. Every construction status and old gate remains; new tests stay blocked from aggregate credit. No commit, preview update, push, merge or deployment is authorized by this evidence phase.


## 2026-10-21 — Attribute ordinary synchronization before borrowing enrollment optimizations

**Decision.** Prioritize ordinary catch-up as the next bounded repair, using the branch's bounded read-batch/short-lived authority pattern as a hypothesis while retaining original single-entry signed requests/replies and durable receipts. Measure against a current-branch baseline before accepting an implementation. Transient dense enrollment pages are a different consumer and cannot be presumed compatible with durable receiving. Keep every authorization, exact-prefix/request, expiry, actor, cancellation, fairness and durability guard; preserve old-server/short-reply fallback. Retain numeric limits pending measured capacity evidence.

**Evidence and limits.** On release `faf465f7`, a restored 121-card/13,000-character Goals pair missing exactly 600 accepted updates takes 33.691 seconds locally and 57.919 seconds with 75 ms added request delay. The receiver makes 620/622 signed limit-one reads; the slower arm has zero 429s. Its transport-interval increase closely tracks the backlog increase. Four primary and two separate diagnostic journeys retain complete exports, both-way writing, Undo/Redo and locked offline document reopening. Preserve failed constructors, the two smaller-Goals pilots and the corrected diagnostic clock analysis. These are descriptive local Chromium journeys, not phone/WAN/population or release qualification evidence.

**Separate follow-up.** Foreground publication eligibility accounts for roughly 300 ms before send preparation and continuous typing retains two-second tails. Content hints arrive promptly in the diagnostic, so changing SSE is not the first repair. Later compare publication timing independently of local disk flush, verifying actual durability/typing behavior rather than assuming they can be decoupled. [Protocol, raw results, source identities and next boundary](./performance-experiments/2026-10-21-live-sync-attribution/README.md). This phase changes no runtime, old test, guard, rate, format or gate and authorizes no publication.


## 2026-10-21 — Batch ordinary catch-up without changing durable receipts

**Decision.** Use the existing optional four-read transport and its request-local native authority lease for the ordinary receiver's already-owned limit-one request set. Retain original signed request/page bytes, per-entry verification, current native/custody checks, unchanged group commit, cold compatibility and publisher turn. Reserve a 4 MiB aggregate ceiling; drain a successful-binary overflow or absent-route response before using the existing individual collector under the same ten-second logical deadline. A downgrade lasts only for this owner. Error hints and invalid evidence cannot select fallback. Preserve individual retry/refusal classification after discarding the superseded aggregate-size observation. No service source, persistent cache/format, rate, scheduling or security-guarantee change.

**Evidence and rejected alternatives.** All fourteen final restored journeys pass. Three +75 ms pairs improve 32.3–33.9% (median paired improvement 33.7%; arm medians 59.389/39.233 s); loopback arm medians are 33.727/33.675 s. Every local/peer typing guard and full export/two-way/Undo/offline-reopen check passes. Preserve V1's 70.691 s regression, V2's insufficient 48.788 s result, V3's two classification falsifiers and interrupted comparison. The final scheduling source is byte-identical to the signed base. All 34 new regressions pass, including production prepared receiving, alongside affected native/crash/authority/historical-reader, service-budget, omission-control and planning checks. Narrow old-fixture repairs retain every assertion and deadline. [Protocol, identities, raw results and limits](./performance-experiments/2026-10-21-ordinary-receive-batching/README.md).

**Next boundary.** Loopback candidate runs see 6–8 HTTP 429s versus 1–4 for reference, while +75 ms runs see none. This motivates a separate capacity/rate intervention and does not establish a safe policy increase or complete causal attribution. Foreground publication timing remains a separate follow-up. These are local Chromium observations, not handset/Firefox/WAN, production adoption or generalized qualification. Two new test files remain blocked: 878 obligations / 334 unresolved, with every old obligation and construction status exact. Prepare sequential patch 02 after immutable patch 01; no signing, preview restart, push, merge, deployment or qualification resumption.


## 2026-10-21 — Separate scoped rate cost from capacity and contention

**Decision.** Keep shipped 16/session and 64/process work-unit refill rates while investigating their measured cost. Temporary service-only literal interventions use the identical patch 02 client, retaining bursts, concurrency, work/byte/deadline and all authorization/verification guards. Raising only the session refill to 64 shortens two loopback 600-update journeys 33.243/33.743→22.575/23.088s (31.6–32.1%); raising only process refill to 256 does not help this fixture. Three predeclared combined-rate pairs improve 30.5% at the paired median. A +75ms pair improves only 2.54%. All 14 ordinary browser journeys preserve complete exports, two-way writing, Undo/Redo, offline reopen and every predeclared typing guard.

**Capacity boundary.** All six separate first-epoch contention arms stop on 409 state-changed before 429, including defaults. The hot writer completes none of its offered writes; an unrelated account completes 6–7. Reader-only controls pass 64 positions/single reader and 384/six readers. The raw probe stops on a state-change reply and does not establish whether the app's outer continuation would recover. Thus neither safe production rates nor maximum capacity is qualified. Every stored seed/interactive wire and proof passes cold independent SQL verification.

**Next investigation.** Test actual continuation and isolate shared publisher-tip invalidation under competing commits before altering that mechanism. Source guard revision is shared and detected fingerprint races invalidate all captures, but the exact initiating race is not yet isolated. The browser diagnostic independently attributes five 429s to session work top-up, with roughly 1s retry gaps and no process/concurrency refusal. Do not remove those guards or add a blanket 409 retry. After contention review, test a smaller session step as an unqualified candidate; the process-only result does not justify a blanket global increase. [Protocol, raw failures, source/resource evidence and limitations](./performance-experiments/2026-10-21-sync-capacity/README.md). This phase is evidence-only; every runtime byte/test/qualification block and prior patch remains.


## 2026-10-21 — Distinguish client continuation from shared invalidation

**Decision.** Keep shipped guards/rates unchanged. The real packaged client continues automatically across targeted remote-read and submit state-change refusals under bounded duplicate-read pressure, retaining identical pending-submit bytes and all full data guards. Those refusals are injected; natural browser loads do not expose state-changed and the exact native contention workload is not thereby qualified as an actual-client population.

**Mechanism and limits.** A native trace and a separate deterministic whole-snapshot comparison confirm that a stale fingerprint on one publisher can invalidate unchanged captures for another account through the shared revision. Original traced/default failures agree. Eight shorter controls pass, while the full-size own-writer discriminators retain later failures despite useful progress; cross-publisher invalidation is not the sole contention surface. Raw adapters still abort on409, so no indefinite-starvation, production-frequency or safe-rate claim follows. Retain the initial single-read controls, wrong self-read label, corrected batch-source invocation and observer-flush limitation. [Raw source, proof, browser and failure evidence](./performance-experiments/2026-10-21-sync-continuation/README.md).

**Next bounded candidate.** Review per-publisher invalidation for detected fingerprint races while preserving global external/unknown-state invalidation, changed-publisher rejection, every fresh transaction/authority/signature check, exact receipts, bounds and effective quarantine/corruption controls. Demonstrate a failing desired-behavior regression before changing the mechanism, then repeat full contention and actual-client controls. Own-publisher append races remain separate. This is evidence for that repair review, not its implementation, a numeric rate promotion or resumption of generalized qualification.


## 2026-10-21 — Isolate publisher fingerprint races with bounded capture ownership

**Decision.** A failed fresh snapshot fingerprint discards only that account/publisher's preliminary owner, tip and queued audit. Other captures remain subject to their own complete transaction-time comparison. Retain the global revision/data_version fence for external changes, explicit clears, close and applicable audit failures, and retain quarantine. Bound the owner map to128 LRU keys; unique object identities prevent old captures, delayed remember and active audit results from becoming current after eviction or key recreation. Keep all authority/signature/custody/grant/expiry checks, exact original receipts, numeric rates, work/byte/concurrency/retry/deadline bounds and stored/wire formats unchanged.

**Evidence.** The new independent unchanged-capture assertion fails against the old source. All114 affected native/protocol/budget cases pass after repair, including six new cases, and six omission controls fail at the intended assertions. The full unrelated-writer+reader discriminator now completes all1536 positions and20 other writes. Both matched reference arms stop before any hot write; repaired arms verify545/554 read positions and24/27 hot writes, but still fail with409. A separate same-publisher-writing arm also fails. These are censored raw runs, not speed or capacity passes. All six stopped stores pass independent wire/proof verification. Three actual packaged-client journeys pass complete exports, both-way writing, Undo/Redo and locked offline reopen; known refused remote batch and pending submit continue autonomously after1136/1038ms, with identical submitted bytes. [Evidence, failures, source identities and limits](./performance-experiments/2026-10-21-publisher-isolation/README.md).

**Boundary.** Same-publisher contention remains the next acceptance investigation before rate/capacity promotion. Keep all five raw failures, the new SQLite no-op fixture correction, sandbox listener refusals, stale exact mutation anchor, initial planning-audit assumption and stale crypto census. Retarget only the omission anchor around current authority reuse, and refresh only reviewed source pins; domains/classifications remain exact. All109 planning regressions pass. Every old obligation and97 construction contracts/statuses remain exact; the new test stays blocked:879 obligations /335 unresolved. General qualification remains paused. Prepare unsigned sequential patch05 after01→04; no stage/sign/commit/push/preview restart/merge/deployment.


## 2026-10-21 — Preserve authenticated prefixes after known native appends

**Decision.** After a newly proposed verified native decision actually commits, replace a private publisher commit marker. Reject older captures and late memo installation without deleting their authenticated pre-append prefix. The marker advances no ledger count, witness, accepted cut or link; fresh requests still authenticate appended rows/current witness and pass the original full transaction-time authority/fingerprint/signature/custody/grant/expiry checks. Unknown changes, global/version/close/eviction fences and quarantine remain. Keep audit ownership distinct so continuous writes cannot suppress a real audit's corruption result. No queue, persisted/wire format, extra retry or numeric policy change.

**Evidence.** The old source fails the new prefix-survival assertion;13 new regressions and all127 affected cases pass. Eleven intended omissions fail. Two narrow old-fixture changes distinguish unannounced mutation from the new known-commit boundary; all50 assertion ASTs and registration/options remain exact. All109 planning tests pass. In two clean warm pairs, candidate replay completes1536 positions at20.179/20.002s with40/39 hot writes, hot offered-to-proof p95 576/563ms under2500ms; references fail at the120s replay ceiling or409. No completed paired percentage improvement follows from censored references. All three unchanged packaged-client journeys preserve exports/writing/Undo/offline reopening and known-refusal continuation. [Protocol, raw outcomes, identities and limits](./performance-experiments/2026-10-21-publisher-commit-races/README.md).

**Open acceptance boundary.** Both original COLD mixed arms still fail: initial verification delays the first hot write about2.5s, then five queued writes drain in84/92ms and exhaust the unchanged four read attempts. One stopped arm also misses the additional2500ms input-write p95. The original cold completion condition remains open. Preserve all16 raw runs/11 failures, the initial potentially overlapping warm block, fixture distinction and missing CDP refusal body. All16 stopped stores pass independent original-wire/proof audits. Next isolate/coalesce concurrent first verification with its own bounded owner/lifetime/authority/interruption contract; do not silently add that mechanism here. Keep shipped16/64 and all97 construction contracts/statuses. New regression stays blocked:880 obligations/336 unresolved. General qualification stays paused; prepare unsigned sequential patch06 only, with no publication or preview change.


## 2026-10-21 — Admit bounded cold publisher groups without sharing authority

**Decision.** After independent authority/request checks, serialize only a cold publisher's admitted group until its queued burst drains. A waiter then recaptures and authenticates afresh before its first native guard attempt. Keep original four competing-commit attempts and every proof, custody/grant, freshness, signing, expiry, quarantine/audit and bound. Cap128 lanes/128 waiting entries,10s scheduling wait, owned idempotent release and close cleanup. Capture the scheduling header in a short synchronous native transaction and end it before waiting. Warm concurrency resumes when the group is empty; no full census maps, request authority, signing results or progress are shared.

**Evidence and corrections.** Original first reads repeat verification; the first candidate blocks an unchanged paused-authority/concurrent-append case. Narrow admission rather than changing that regression. The next candidate passes first-epoch load but fails real membership-enabled browser capture outside a transaction; retain600s failure and interrupted repeat, keep store guards, add full-schema regression and repair the scheduling capture. Final original cold candidates complete1536 positions/41+40 hot writes/20+20 other writes, replay20.574/20.068s, p95 hot offered-to-proof1014/574ms (guard2500ms). References fail at450/474 positions. Two final browser journeys preserve all data/edit/offline guards.

**Limits.** This clears the named local cold acceptance condition, not a rate policy, universal starvation guarantee, population latency estimate or generalized qualification. Preserve all initial/final failures, native proofs, source identities and fixture corrections. Existing16/session64/process refill and every original limit remain. [Protocol, raw evidence and reproduction](./performance-experiments/2026-10-21-cold-verification/README.md). No publication or preview change; prepare sequential patch07 after immutable01→06.


## 2026-10-21 — Revisit refill policy after cold admission, retain current defaults

**Decision.** Keep16/session64/process in the application. Temporary D16/64,S32/64,P16/128,B32/128 variants change only refill literals, with all burst/concurrency/work/byte/deadline/auth/verification/queue guards fixed. All17 unchanged budget/accounting cases pass per variant. The original eight cold contention runs now all finish; session-only S stays near20–21s, while P is near11s and B near10s. All10 native stores, including the asymmetric D/S1024-position pair68.654→31.686s, pass independent original-wire/proof audit.

**Blocker.** S misses the prospective local native fairness gate: median per-run hot-write p95 182→315.5ms and unrelated peer p95 607→1133.5ms; all absolute2.5s and resource bounds still pass. Preserve the miss and small-quantile/1s retry caveat. Three actual-client catch-up pairs improve 31.46% at median; all10 client data/edit/offline journeys pass. Full primary/foreground/pressure typing-gate result: False. Pressure local input-to-DOM p95 also misses its16ms gate (12.0→17.8ms), despite faster134.359→29.156s pressure catch-up. Browser speed cannot override either miss. P/B native results are diagnostic, not automatic global policy selection.

**Next boundary.** Isolate the pressure typing cost, then test coupled32/128 with actual client and distinct cold publishers under identified container CPU/memory bounds before adoption. Higher global allowance alone is not a demonstrated typing fix. No safe global capacity, universal fairness or hardware/platform claim is established. [Protocol, all results, source identities and artifact limitation](./performance-experiments/2026-10-21-rate-review/README.md). Evidence-only patch08; runtime/old tests/881 obligations/97 construction statuses remain exact, qualification paused and no publication/preview change.


## 2026-10-21 — Retain default policy after coupled capacity/typing investigation

Temporary32/session128/process passes the prospectively constrained six-distinct-publisher gate with exact original security/work/expiry/native guards; it roughly halves this cold workload. [Phase09](./performance-experiments/2026-10-21-coupled-capacity/README.md) also retains a16.8ms local composite typing miss against16ms in the first pressure pair, despite a later9.2ms arm and all eight data journeys passing. Keep 16/64. Neither constrained synthetic capacity nor a favorable later sample overrides the declared guard or establishes deployment sizing.

Decompose host keyboard-offer→beforeinput separately from beforeinput→DOM. The candidate pressure miss has16.3ms offer→event p95 and0.7ms event→DOM p95; quantiles are not additive and CDP offer is not a physical key timestamp. Use explicit browser-process/focus ownership, a plain-input control and scheduling traces as the next discriminator. Avoid speculative crypto/editor changes. Retain both-renderer sampled profiles and their perturbation/native-process limits; policy adoption still needs foreground/platform/history evidence. All existing contracts/statuses and qualification pause remain.


## 2026-10-21 — Target renderer-side sender verification work after dispatch controls

[Phase10](./performance-experiments/2026-10-21-dispatch-calibration/README.md) finds all inputs focused/visible even under original ordering, and no consistent>=3ms+20% gain from independent browser roots in two reversed blocks. Keep the prior typing misses; neither focus nor a later favorable sample clears them.

The larger editor delay lies between browser keydown timestamp and renderer capture; driver timer gaps are smaller and beforeinput→DOM is 1.4–1.8 ms. Native controls omit local editor admissions, so the evidence supports a sender-background-work hypothesis and does not isolate editor parsing or one verifier. Together with phase09's sampled record comparisons/projections/cleanup, select a bounded owner-local verification/comparison reuse investigation and repair. Preserve exact-byte change detection, fresh authority/inventory, owner invalidation, buffer cleanup and detached projections; use the established authenticated carrier/view selection patterns only where justified. Establish a discriminating regression before implementation.

Keep 16/64 and every qualification obligation. This phase changes measurement evidence only.80ms sensor faults at 2.5% of inputs show why per-event maxima/known-fault sensitivity accompany p95. No hardware input-to-paint, production capacity, runtime repair or adoption claim.


## 2026-10-21 — Hold the faster comparison candidate until catchup non-regression

[Phase11](./performance-experiments/2026-10-21-word-comparison/README.md) confirms that exact word comparisons can reduce comparison time and sender input queuing in this fixture without weakening byte/metadata/ownership checks. It also demonstrates a repeatable53–56s versus34–37s pressure catchup regression. Passing correctness and lower local input latency do not erase failed peer/catchup guards. Restore the original helper and retain the candidate as reproduction material, six regression cases and every failed result. No numeric-rate adoption.

Candidate capacity refusals increase28–31versus10–12. Existing explicit-capacity waits are1s/2s; the next bounded investigation should identify rate/concurrency refusal causes and request/retry timing before choosing pacing/admission changes. This is a hypothesis, not proof that removing a limit is safe. Preserve byte-identical retry, captured authority, current/freshness checks, queue ownership, deadlines and fairness. All general qualification remains paused; runtime/defaults16/64and old assertions stay intact.


## 2026-10-21 — Target concurrent duplicate admission without changing authority or rates

[Phase12](./performance-experiments/2026-10-21-capacity-trace/README.md) joins all corrected refusals to the session budget and all29client failures to extra batch-work reservation; actual retry waits explain large measured portions of receiver delay. The faster candidate changes feedback traffic and spends more work on overlapping exact duplicates. Ordinary and fixed3-read controls do not reproduce the large regression. This selects a bounded scheduling candidate rather than numeric-rate adoption: scoped concurrent identical read exclusion before extra work reservation, with the original>=1admission unit retained and no response/verification-result reuse. Pair it with the held typing helper, preserve native/auth/current/expiry checks and bound/retire all scheduling state.

No repair is accepted yet. Retain all phase11misses, observer failures and actual3-versus-intended4control limitation; explicitly require a true4-read independent control in the repair. Working runtime/default16/64and all security/qualification state remain unchanged; no publication.


## 2026-10-21 — Pair exact comparison with duplicate read admission at existing policy

Accept [phase13](./performance-experiments/2026-10-21-duplicate-read-flow/README.md) as a bounded local candidate at unchanged16/64 after all prospective actual-D timing and data guards pass. Match only full exact immutable batch bytes and the server-held budget identity; overlapping duplicates get the existing generic capacity refusal before extra native reservation. Spend original admission, release the owned entry in existing finally, and retain every original authority/proof/freshness/native check. Share neither result nor verification permission. Bound the transient collection by the existing active limit and retain the original handler lifetime; no queue, persisted state or deadline/rate/retry change.

This permits the exact-word helper previously held in phase11 to be tested as a new combined candidate. Pressure catch-up falls about52–53% and pressure typing improves, while ordinary catch-up and foreground typing remain roughly unchanged. Keep the old word-only failures and all current small slowdowns. Temporary B32/128 remains diagnostic and unadopted even though its pair passes. A local fixed headless workload is not physical-device or generalized capacity proof. Keep all881 obligation rows/337 unresolved/97 construction statuses and crypto contracts/sites; appended native regressions receive no aggregate credit. General qualification and publication remain separate and paused.


## 2026-10-22 — Retain the multi-account fairness blocker at the final candidate

Use genuine independent device enrollment and distinct account/principal/workspace identities, rather than multiplying sessions of one credential. Prospectively amend H4→H6 before seeding so five H catch-up devices plus M1 can challenge the shared allowance. Keep exact c1177575 source/client/policy, ten profiles, four roots and fixed reversed B,S,U,U,S,B at1CPU/1GiB.

[Phase14](./performance-experiments/2026-10-21-account-fairness/README.md) does not clear fairness: both heavy runs miss the original quiet writing guard with10/41 peer keys unobserved, while both baselines and lighter controls pass. The baseline drift check passes. Preserve incomplete peer samples and censored replay; do not substitute observed-only p95 or a successful later run. Native accepted-state/signature checks pass, but the test does not establish pending local durability or eventual recovery.

Keep16/64 and the security/source contracts. Quiet failures show membership409 and grant403 insufficient-scope, with no quiet429; trace those boundaries before selecting a scheduling/rate repair. Lighter-load large replay330–354s is also a separate observed responsiveness concern. No causal server-only, production-user capacity, physical-device or generalized qualification claim. No runtime/test changes or publication; evidence-only patch14 and qualification remains paused.


## 2026-10-22 — Trace transient discovery separately from removal authorization

[Phase15](./performance-experiments/2026-10-22-membership-continuation/README.md) identifies four failed snapshot comparisons per quiet discovery, with only the first publisher's promotion witness observed changing. The resulting removal-scope403 is a correct fallback refusal for this active member. Keep that authorization boundary; select a separate bounded discovery/continuation repair rather than loosening scope checks or adopting larger rates. Re-establish all membership/current-authority/complete-history checks independently before narrowing the capture's dependency.

Treat post-load recovery and durability as separate outcomes from the original responsiveness failure. The exact-source and observer-only runs retain the failure while full original writing and a separately guaranteed-offline pending edit pass automatic continuation and genuine same-profile cold-reopen checks. Preserve the four pre-workload harness failures, importer round-trip observations and unavailable-Vite loader results. This finite graceful-reopen test does not close crash durability, large-history responsiveness, physical-device or generalized qualification obligations. Evidence-only patch15; no runtime adoption or publication.


## 2026-10-22 — Isolate discovery's irrelevant witness, hold acceptance at the next refusal boundary

Use an explicit purpose captured privately and checked again at discovery commit. Omit only promotion.delivery_witness for an actual joined publisher; retain its own complete ledger and all current-authority/ownership fences. Keep full ordinary comparisons and the original serializer interface. [Phase16](./performance-experiments/2026-10-22-discovery-dependency/README.md) demonstrates the defect on original code, passes13new regressions and detects12deliberate implementation omissions without modifying old case bodies or security contracts.

Do not infer performance acceptance from removal of one refusal chain. Both candidate heavy journeys eliminate membership409/removal403 but miss the original delivery guard with smaller visible peer prefixes than either reference; history-checkpoint409s now block the next receive stage. Retain the implementation as a held local development candidate and preserve the original failures. A separate checkpoint trace must establish coherent-head/history/current-authority behavior before choosing its repair; do not copy discovery's projection into that response or raise rates. Automatic post-load and offline-cold-profile durability guards pass, which does not clear responsiveness,16existing broad-case failures or generalized qualification. No publication.


## 2026-10-22 — Phase17 history checkpoint and receive gating

Keep receiving behind its authenticated history gate. Remove redundant membership verification and, for catalog reads, move live publisher capture after expensive immutable authority verification. Require exact current header agreement except the live witness/rows which the fresh complete census verifies. Reuse proof identity only, never session or commit authority. Other history actions and full final fences remain. [Evidence](./performance-experiments/2026-10-22-history-checkpoint/README.md) records accepted for the scoped checkpoint repair; heavy fairness remains held; heavy acceptance False. Do not raise rates, extend deadlines, skip403s or turn failed/censored histories into success. The mount regression is now checked independently before startup.


### Phase17 acceptance clarification

The scoped checkpoint retry mechanism is repaired, but the **candidate remains held**: complete peer p95 is8,993.5ms and5,090.8ms against the unchanged2,500ms guard, and all five H receivers miss600s. Both candidates deliver120/120 within the original writing deadline with zero history409s; this does not satisfy the full performance decision. “Accepted for the scoped repair” above must not be read as runtime promotion, merge, deployment or qualification acceptance.


## 2026-10-22 — Phase18 ordinary receive progress under contention

[Decision and evidence](./performance-experiments/2026-10-22-ordinary-receive/README.md): reuse full verified authority proof only inside one bounded core, keyed by exact serialized pin+all native header fields except rows, with verifier identity and fresh custody checks. Retain all live witnesses and current transaction/session/expiry/ledger/snapshot checks. Do not widen rates or deadlines or coalesce first verifications in this slice. Private cache reset/close/eviction never supplies commit authority. Replace the cold scheduler-display proxy with exact retained encrypted delivery-record equality plus authenticated export; preserve the UI observation separately. Current status **HELD: backlog replay improves, but live peer latency regresses to20–21s p95 versus10.5–11.9s reference (target2.5s)**.


### Read conflict repair targets stale capture exposure before changing retry policy

**Date:**2026-10-22 · **Status:** next bounded repair proposed; phase19 evidence only.

The returned conflict consumed four native verification attempts because actual committed writing invalidated snapshots; its subsequent one-second client backoff matched the established schedule. The other diagnostic journey had no Q409 yet remained slow. Keep rates, the four-attempt cap and failure pacing unchanged while separating verified authority from fresh live ledger capture, as the earlier history-catalog path does. Any such repair must compare all current authority inputs before using fresh ledger evidence and retain exact final ordinary snapshot, owner/version/commit, custody/grant/session, history/served-proof and expiry checks. No cache projection widening or concurrent-lane authority change is approved by this evidence. Submission round-trip cost is also material but still needs native stage attribution. [Evidence](./performance-experiments/2026-10-22-read-pacing/README.md).


### Capture live inbound ledger only after current authority/request verification

**Date:**2026-10-22 · **Status:** implemented bounded development candidate, performance status in phase20 packet.

Take immutable native authority evidence first, verify it and the signed reader, and then capture the selected live ledger. Compare every non-live native authority field, including future fields, before consuming that fresh ledger. Only the two ordinary live witnesses and rows differ across this stage boundary; fresh witness/census/served proof checks and the final complete ordinary snapshot, owner/version/commit, custody/grant/session/completion and expiry checks still govern issuance. Keep the exact existing cache context and limits; do not broaden reuse or retry policy here. Real post-capture races and real removal rotation remain refusals. [Evidence and original gates](./performance-experiments/2026-10-22-late-ledger/README.md); publication/receiver-prelude optimization remains separate. No qualification or publication authorization.


### Reuse authority/history evidence by explicit ownership and input contract, not a generic cache

**Date:**2026-10-22 · **Status:** next bounded repair informed by phase21; no implementation here.

The [trace and static map](./performance-experiments/2026-10-22-publication-prelude/README.md) support repeated proof reconstruction in publication and receiver preludes. Target one service-owned verified authority/history result and eliminate duplicate same-operation reconstruction before attempting broader publication reuse. Existing inbound cache contexts include live witnesses, so using that cache unchanged may miss after each write; phase20's stage projection alone does not prove cache equivalence. Enumerate exact authority inputs, brands, size/lifetime/clear/close/inflight fences, canonical proof correspondence and independent corruption checks. Keep fresh request/signature/scope/expiry, live ledger/served proofs, custody/grant/session, native owner/version/commit and transaction checks. Retain independent auditors and cold lifecycle boundaries. Static call counts are a finite census, not measured cost or proof every opportunity has been found. No rate/clock/limit change or qualification/promotion is inferred.


### Keep request-local verified history separate from early publisher dispatch

**Date:**2026-10-22 · **Status:** implemented in sequential22; cross-publication reuse separate.

Use normal complete-history verifiers as the proof owner for locator/catalog requests, retaining independent native recovery eligibility and exact native delivery/artifact correspondence. Keep the history as a separate result from early delivery authority so existing generation/ledger dispatch does not change. Later membership resolution consumes that same complete early anchor and retains all native row/boundary stitching. No public accepted-proof flag or unbranded result can bypass verification. Protocol verifier internals, cold lifecycle, independent audits and final native authorization/transaction guards remain. The precise old operation-count test is strengthened to require one complete history; no security assertions are removed. [Contract/evidence](./performance-experiments/2026-10-22-request-authority/README.md). Broader publication reuse requires its own exact-input/volatility/lifetime/invalidation contract and coupled final measurement.


### Keep publication proof reuse bounded, and hold failed end-to-end acceptance

**Date:**2026-10-22 · **Status:** sequential23 development candidate held; qualification/publication separate.

Reuse successful mathematical native authority evidence through the existing128-entry/16MiB visible-projection pool,2MiB context limit, exact v8 context, verifier identity, private proof brands, detached mutable projections and clear/close/inflight fences. The shared projection body is unchanged: it omits only rows and promotion.delivery_witness/publisherWitness. Those live fields are absent from the authority proof dependency closure; fresh witness/full-ledger verification still consumes the original unmodified snapshot. Publisher, service pin, all remaining current/future native inputs and immutable boundary witnesses stay in context. Existing inbound policy stays strict; missing publication cache uses the old full-verification path. No shared request/grant/session/transaction authorization, new cache budget, rate/retry/deadline change or delayed corruption check.

The combined22+23 heavy comparison fails the original peer-latency gate. Preserve the structural implementation and evidence as held development patches, not a promoted speedup. Faster writer requests coexist with120 rather than72–77 submissions and worse peer latency; that is a lead, not an established cause. A next bounded investigation should isolate the22/23 contribution and trace publication/receiver work under the changed submission cadence before tuning flow control. Do not extend gates or infer deployed behavior. [Full evidence](./performance-experiments/2026-10-22-publication-authority/README.md); all old tests,882 obligations/338 unresolved remain.


### Isolate component effects before treating faster publication as faster sync

**Date:** 2026-10-22 · **Status:** phase24 diagnostic complete; phase23 remains held.

Keep request-local history sharing and publication reuse as separate factors. The fixed mirrored eight-journey study shows increased distinct submissions and displayed receiver backlog whenever publication reuse is enabled, with request-local sharing also failing to improve live peer latency under this load. This does not establish a population effect or the mediating mechanism. Preserve all outcomes rather than promote cryptographic work counts or request p95. [Evidence](./performance-experiments/2026-10-22-phase-isolation/README.md).

Next trace all four native conditions with identical original client bytes and closed observational metadata. Follow submission acceptance, requested/returned publisher prefixes, existing displayed progress and authority-cache/proof/census work. The UI progress probe is not native-commit or durable-receive authority. Treat live-witness invalidation of the existing strict receive cache as a hypothesis to test, not permission to broaden reuse. Retain every current authority/history, witness/served, custody/session/grant/expiry, snapshot/owner/version/commit and retry fence; no quota, retry or timeout tuning. Ninety-second replay censoring is diagnostic only; the original heavy acceptance and general qualification remain held/paused.


### Target stable read-authority proof reuse before changing quotas

**Date:** 2026-10-22 · **Status:** phase25 trace complete; proposed next bounded repair, not implemented.

The [trace](./performance-experiments/2026-10-22-receiver-backlog/README.md) identifies repeated immutable authority verification as substantial receive-path wall wait under the fixed contention workload. Faster publication produces116–120 rather than61–78 distinct submissions in the uninstrumented isolation, while receiving still repeatedly checks authority and periodically rebuilds discovery/catalog history. Do not describe this as increased absolute cache misses or exclusive CPU attribution. Read-context identities vary with live witnesses while non-live inputs remain exact at the recorded native endpoints; fresh ledger/served verification is a separate, much smaller measured stage. This supports a next read-purpose contract separating stable mathematical authority evidence from live ledger witnesses, retaining every fresh request/role/signature/grant/session/custody/expiry, full census/served-byte and native owner/version/commit/retry guard.

Retain one bounded private proof owner and existing limits rather than adding an unbounded cache. Review verifier-identity policy too: equal serialized contexts with distinct callback identities can replace each other's entries in the existing pool, so common evidence ownership or explicit separation must be proven, not assumed. Cover changed authority/native/future fields, live append races, cache lifecycle/clear/close, exact retries, corruption and all original fences before running original coupled acceptance. Discovery/catalog reuse and flow control are separate follow-ups after this bounded repair. No rate or retry-clock increase is selected by this evidence; request-local sharing still has no demonstrated end-to-end win.

Body projections are unverified diagnostic metadata, never protocol authority. Browser body retrieval is incomplete; independently match accepted envelopes and retained proofs from native state and leave missing body timings missing. Do not turn the observed-body subset or90s replay censor into whole-population/600s acceptance. All current application/old-test/security-contract bytes stay unchanged in25.


### Share stable read proof evidence without sharing live authority

**Date:** 2026-10-22 · **Status:** phase26 HELD: original heavy-case gate still fails; qualification/publication separate.

Use one private mathematical verifier identity for normalized publication and v2-read headers in the existing core-owned pool. The pool key is exact serialized context, while verifier identity is checked after lookup; separate callbacks over equal normalized inputs would replace each other's entries. The pure projection is unchanged and drops only decision rows and promotion.delivery_witness/publisherWitness. Its proof producers/resolvers do not consume those live fields. Retain all other native/future fields, pin, publisher and immutable history boundaries. Missing pool keeps original strict verification, not an implicit global or group cache. Retain private brands, detached mutable projections, fresh custody replay, bounds/LRU/revision/input/clear/close fences.

A hit provides mathematical evidence only. Resolve reader/publisher roles and verify each request/signature/extent/expiry afresh, recapture live ledger after authority, compare stable headers, verify original live witnesses/full census/served bytes and perform all final native transaction/authorization/custody/completion checks. No quota, retry clock, corruption-detection window or four-attempt increase. [Evidence](./performance-experiments/2026-10-22-read-authority/README.md). Existing old tests retain their assertions; publication fixtures now explicitly own their cold authority state rather than depend on read-purpose separation.

The four fixed whole journeys are the original acceptance comparison, including600s background replay, not the90s diagnostic from24/25. Preserve every outcome and all prior17 affected failures; keep general883/339 qualification paused. Discovery/catalog reuse and flow control remain separate follow-ups. The candidate remains held despite verified proof reuse; investigate the remaining measured bottleneck without promoting operation counts or extending the gate.


### Reuse complete prelude proof evidence only through an explicit owner

**Date:** 2026-10-22 · **Status:** phase27 mechanism evidence; no runtime repair in this patch.

The [trace](./performance-experiments/2026-10-22-prelude-delay/README.md) separates the remaining receiver's discovery/catalog authority/history work from ordinary read-proof reuse and fresh live ledger/served work. Native verification counts are method-specific (complete history costs differ from ordinary authority); do not substitute one count or overlapped process CPU for another. Current26 HTTP read p95102/119ms versus discovery2150/2603ms and catalog2145/1448ms motivated this trace, but do not by themselves establish exclusive authority cost. All future repair candidates retain the2.5s original gate and fixed uninstrumented comparison.

A complete `{authority, history}` proof has different early-epoch output semantics from standalone delivery authority. Never attach a complete history to early public delivery authority and accidentally switch ledger dispatch. Equal native contexts with distinct verifier purposes must coexist within one existing bounded core pool rather than evict each other or allocate another full budget. Keep all native/future fields, publisher, pin and immutable boundaries in the stable context; omit only proven non-authority rows/live witnesses. Continue fresh request/role/signature/scope/time, live witness/full census/served/cut, grant/session/custody/completion and final native ownership/version/commit/four-attempt checks. Bootstrap and checkpoint mutations/source paths need separate scope decisions; no automatic broadening.

Preserve the initial Docker EOF failure as incomplete, including unrun cold/pending checks and unknown cause; a new predeclared pair is additional evidence, not an erased failure. Host-only child-exit logging improves observability without changing native/resource/timing policy. General883/339 qualification remains paused, and prior17 failures remain named; local full functional tests precede any future push.14–26 signed locally is distinct from published or deployed.


### Reuse complete history evidence through the existing bounded authority pool

**Date:** 2026-10-23 · **Status:** phase28 passes the original finite measured heavy-case gates; publication and general qualification remain separate.

Extend reuse to discovery and catalog-read only. Complete protocol history and ordinary delivery authority have different mathematical proof purposes, so retain distinct weak code identities in a single original bounded pool rather than replace equal-context entries or add a new budget. The private complete carrier uses the existing detached projection copier and preserves immutable protocol brands. Compute canonical needsMembershipHistory on the captured stable native header before awaiting; retain early authority.history absence and later history-bearing dispatch. No-pool consumers use the original complete producer over the original snapshot. Bootstrap/source/other reads and checkpoint mutations are unchanged.

A hit is mathematical evidence only. Every native/pin/publisher/future-field and immutable boundary input still participates in exact serialized context; only rows and two live witnesses remain outside that proof. Keep fresh actual-snapshot ledger/census/witness/served coverage, independent request/signature/role/scope/expiry, current grant/session/custody/completion and final native owner/version/commit/four-attempt checks. Clear/close/revision/input/failure/custody/LRU and all shared bounds remain. Whole-module AST reversal independently checks all original guards after only the reviewed adapter/call sites/weak namespace are reversed. [Evidence](./performance-experiments/2026-10-22-prelude-proof-reuse/README.md).

Retain the original2500ms complete-peer gate and full600s replay, all120 focused trusted inputs and finite whole-journey unit. No timing-based security window, quota increase, deadline/retry extension, native/client instrumentation or aggregate credit. Keep every prototype and broad-environment failure qualified; only corrected frozen tests establish the before/after counterexamples. Next investigate and resolve17 existing failures with coherent historical source and separate bounded repairs, then local functional full-suite checks before any push. General883/339 qualification remains paused; no new signature or publication here.


### Restore historical regression fixtures without relaxing native security contracts

**Date:** 2026-10-23 · **Status:** phase29 closes16 fixture cases; cold-clear native repair remains separate.

Treat the historical case as evidence, then identify its contract change through adjacent coherent source and exact case AST/options/signatures. Preserve the distinction between complete historical snapshots and explicit fixed test-bridge counterfactuals; fix current dependencies for both arms and claim no archived-CI result. All17 cases now have a passing parent/failing boundary. Four earlier contract changes explain16 fixture cases; core cache51c17a93 introduces the remaining liveness regression after released sourcefaf465f7. [Evidence](./regression-evidence/2026-10-23-native-fixtures/README.md).

Keep current valid epoch2 recovery enrollment and schema26 offline fences. Extend the test-only current history/snapshot owners rather than fabricate successful replies, omit binding verification or force a retained legacy delivery onto a fresh flow. The same-realm browser factory performs real snapshot encryption/signatures, and the native service issues binding/history responses. These coordinator fixtures model custody and source writing; they do not replace the separate real native-custody/coverage tests. Detected publisher corruption stays quarantined even when bytes are restored; require explicit reopen/full verification in those restoration fixtures and keep independent publisher isolation. Preserve all old cases, assertions, deadlines, wrong-code, lost-reply, replay and retained-byte checks; update only the precise obsolete literals/interfaces.

Keep runtime and all883/339 qualification facts unchanged; ordinary CI/functional checks are separate from the paused general campaign. Complete the native cold-clear repair and local functional CI surface before push, then separately prepare signing/publication. Do not use a passing fixture rerun to erase failed source/bridge attempts. Sidecar identity facts must be checked directly against immutable Git objects: patch28's corrected origin fact has its own retained post-v2 audit and does not rewrite the canonical patch or measurements.


### Retry cache retirement only after distinguishing it from hard authority invalidation

**Date:** 2026-10-23 · **Status:** phase30 bounded native repair and final finite acceptance.

A generic evidence owner must refuse retired work; its native read caller may retry only a typed revision clear with live/exact input. Partition the existing invalidation predicate with hard close/input conditions first, keep the four-attempt loop and original request clock, then perform full fresh capture/verification. Never classify close, custody, signature, authorization or expiry as transient, or waive the generic proof fence. One old native whole-request-unknown expectation is explicitly aligned with fresh continuation using immediate two-proof and independent page checks; preserve its cut and all other old assertions/deadlines. [Evidence](./regression-evidence/2026-10-23-cold-clear/README.md).

Clock-invalid primary measurements stay held even when a different clock suggests fast typing. A separate predeclared pair on exact native/client bytes, original gates/anchors and extra clock-validity observations establishes the final finite result; preserve both series separately, do not replace or pool runs or relax16ms/2.5s. Host-only observations reverse to the original harness AST and do not change runtime. Detect deliberate clock/evidence/native faults independently. Source/metadata agreement does not award qualification credit: all883/339 stay exact; routine functional CI is separate from paused aggregate qualification. Complete local tests before pushing, then request later signing/publication separately.


### Keep new sync regressions in routine CI and repair fixture clocks without weakening the freeze

**Date:** 2026-10-23 · **Status:** phase31 local functional surface passes; qualification remains paused.

Use Git's changed-test population as an independent coverage check, not just the cases recalled from the current phase. One new serial routine step runs all five changed sync files since signed13 plus the cold/isolation guards. Preserve every existing workflow byte outside that block and keep manual qualification manual. Compare native/client/lock bytes directly with the accepted candidate before carrying its performance evidence. [Evidence](./regression-evidence/2026-10-23-functional-ci/README.md).

A fixed calendar fixture must supply the existing today seam. Keep the three-day product freeze and original protection/refusal assertions; assert every intended fixture card exists before copying/removal so empty state cannot satisfy a retention test. Use unchanged-body calendar counterfactuals and per-case failed assertion evidence. Source-site metadata is a precise location fact, not authority: re-pin only its line after independently locating the unchanged native literal. Keep count assertions exact through independent old-prefix/AST/runtime evidence; preserve all883 obligations,339 unresolved and security contracts rather than waiving registration checks.

Record all failed runs, zero-test closure errors and corrected auditors. Local routine checks establish exactly their executable surface, including the one existing named skip, not general qualification, Linux CI or production/device behavior. Finish documentation before refreshing tree-bound receipts; keep final closing evidence beside the immutable patch to avoid self-referential receipt packaging. Later signing, exact-artifact testing, pushing, merging and rollout are distinct operations.


### Use local acceptance evidence for the sync catch-up publication

**Date:**2026-10-23 · **Authority:**operator instruction in this conversation.

The operator directs committing the release evidence and preparing production,
and explicitly permits hosted GitHub Actions results to be non-blocking if local
tests passed, because hosted runs time out. Select the recorded passing local
routine/unit and exact-image functional/load evidence for this release. Preserve
the original hosted results, Linux no-Git harness failure, host completion, named
unit skip, finite-platform limits and all qualification obligations. No test,
workflow, branch protection, cryptographic check or product security contract
changes. This is an operator publication decision, not a claim that local tests
prove universal safety or that failed hosted runs passed. Source/image identity,
rollback, private registry, offline infrastructure checks and rollout verification
remain required. Operator retains both merge buttons; generalized qualification
remains paused. See [handoff](./account-sync-catch-up-publication.md).


### Native editing gestures keep semantic admission

**Date:** 2026-10-23 · **Commit:** pending sequential patch37 · **Against:** PRD §4.8 / TRD §5.4

**Orientation.** Default CodeMirror word-delete, bracket-indent and Shift-Enter transactions were rejected
by the admitted editor, while Cmd-Enter unexpectedly toggled tasks.

**Decision.** Adapt known text semantics through the existing private preparation/admission path. Never
accept arbitrary extension document transactions to make shortcuts work. Explicitly consume Cmd/Ctrl-Enter
so disabling task toggle cannot expose the default blank-line command. Keep click-to-toggle and its
semantic command. Mobile pauses remain a separate profiling task.


### Card Enter returns focus to the same card

**Date:**2026-10-23 · **Commit:**pending sequential patch38 · **Against:**PRD §4.8 / TRD §5.4

**Orientation.** The operator wants Enter to finish card editing and Shift-Enter to allow multiline text.
They explicitly retain the old split behavior on three Shift-Enters.

**Decision.** Completion focuses that card's static surface and retains its caret for deliberate Enter
reopening. Pointer blur continues to respect its actual destination. A held Enter cannot repeatedly
reopen a newly completed card. Goals Enter/list behavior and admitted mutation/undo semantics stay.


### Sidebar collapse changes organization, not session lifetime

**Date:**2026-10-23 · **Commit:**pending sequential patch40 · **Against:**PRD §6.6 / sidebar clarification

**Orientation.** Account, protection and personalization fragmented related controls; sync lane details
and export/history were mixed. The operator asked whether switching/sign-out could be combined.

**Decision.** Use native initially closed disclosures with mounted children. Keep dates/update availability
outside settings disclosures. Keep both switch and sign-out because their remembered-login effects
are intentionally different; explain that distinction. Group service-history maintenance with export,
while Devices retains membership/lifecycle history. No implicit sign-out, revocation or cancellation.


### Duplicate reads its admitted predecessor and reuses card creation

**Date:**2026-10-23 · **Scope:**bounded UX patch44

Choose a semantic duplicate-by-card-ID command rather than composing from the UI’s text snapshot.
Writing queued before the click must be included when admission runs. Use the existing compose
mechanism to create a fresh Scheduled card on the source’s current day, with the complete text,
current actor attribution and source ID provenance. This reuses freeze, discrete undo and canonical
registration instead of cloning CRDT identity or inventing a second creation path.

Done’s unlock protects editing/moving its source; duplication does neither. No new action appears
on frozen days, no arbitrary destination capability is added, and unfiled/missing sources refuse.
The source’s creation timestamp/author are not copied as though a new action were historical writing.


### Whole-line Cut copies accepted writing before admitted deletion

**Date:**2026-10-23 · **Scope:**bounded UX patch50

Extend the native Cut event rather than intercept Cmd-X with an asynchronous clipboard prompt.
When every selection is empty, copy complete logical lines, unioning duplicate/adjacent ranges;
include an existing following newline. Use existing semantic selection replacement for deletion.
Successful event clipboard writing/read-back precedes submission. A missing/refused clipboard,
closed/frozen surface, active composition or queued predecessor cannot delete writing.

Choose a visible wait/refusal while earlier input is pending instead of extending relative
selections over uncopied queued text or adding a new conditional-mutation protocol in this slice.
This can require retrying Cut during storage stalls; the invariant is more important than hiding
that refusal. Local admission can still delay the deletion after copying; retry admits it once.


### Repository bookkeeping remains authoritative during release preparation

**Date:**2026-10-23 · **Commit:**follow-up to `d1c2784b`, sequential patch59 · **Against:**PRD v9 / TRD v8

**Orientation.** PR57's ordinary CI failed its authority-map runtime census. Eleven edited
editor/sidebar sources and one new presentation component had not been reviewed and recorded.
The final distroless/release evidence was also retained only in an external tool's artifact store,
instead of the repository's established evidence directories. The operator explicitly reaffirmed
that the repository's procedure takes precedence over optional third-party tooling.

**Decision.** Review the complete census delta against original and current Git objects, then use
the existing recorder. Preserve all197 domain definitions/sites and the registry, construction
dispositions and authority-map bytes. Keep the tool's original artifacts as historical snapshots
but copy their exact bytes and independently verify their archive populations/hashes in the
repository. This adds portable compressed evidence rather than a competing registry or closure
claim. Run the ordinary contract/bookkeeping gates; paused generalized qualification and an
operator's earlier acceptance of local tests do not waive these checks. Complete the append-only
records before closing this seat's active slice or refreshing tree-bound receipts.

The follow-up changes documentation and the reviewed census snapshot only. Keep the exact tested
ARM64 image bound to signed `d1c2784b`; compare every allowlisted build input independently before
carrying its evidence across the bookkeeping commit. Publishing, operator merges and deployment
remain separate actions.


### Expanded bookkeeping review requires a fresh artifact after fixture corrections

**Date:**2026-10-23 · **Commit:**sequential patch59 · **Against:**PRD v9 / TRD v8

**Orientation.** After the preceding decision, the broader checks found a stale execution manifest
and two stale adapter count fixtures. This expands that entry's documentation-only scope; its
1651-file context-equality observation remains valid only before these additional test-file edits.

**Decision.** Review additions against independent runtime collection and preserve every old
obligation, contract and blocker. The two fixtures take three literal corrections only; no case,
assertion or deadline is removed. Keep the earlier image bound to signed `d1c2784b`. Since the
fixture changes enter the allowlisted test context, rebuild and check the final signed source
rather than carrying the earlier whole-context equality claim beyond its observed scope.
Publishing, operator merges and deployment remain separate actions.


### Keep the refreshed artifact bound to its signed build source

**Date:**2026-10-23 · **Commit:**sequential patch60 · **Against:**publication procedure / patch59

**Orientation.** Patch59's two fixture count corrections enter the allowlisted build context.
A new native ARM64 artifact is therefore built and checked from clean signed d8b3f22b. The
hosted contract, inventory and adapter steps pass that exact source; their longer unit step
is still running in the retained snapshot.

**Decision.** Preserve the new image/source identities and exact observations in the established
repository evidence packet. This follow-up changes documentation only. Keep the image labeled
with its actual signed build source and compare the full allowlisted context before carrying
it across the evidence commit or application merge. Do not rebuild merely to relabel a docs-only
head. Keep all lower package findings, earlier failed attempts, browser/server boundary limits
and the open AMD64/generalized qualification boundaries. Operator merges, exact private image
publication, infrastructure review and deployment remain separate.


## 2026-10-23 — Specify heading context and scanning before changing Goals

**Commit:** pending sequential design patch61. **Orientation:** the operator withdrew the gather-tray
direction as too rigid and requested visual alternatives for automatic parent-header card context,
scanning/folding and near-cursor Copy/Move before application coding. Two read-only subagents reviewed
interaction/storage boundaries and mobile formatting feasibility.

**Decision:** build a standalone fictional-data sketch, retain it in the repo with the product queue,
and keep every interaction/format choice explicitly proposed. Compare heading breadcrumb/compact label,
in-place folds/compact source-order reading, and gutter popover/attached actions. Recommend captured
context from the admitted source item, but do not select a metadata format, export policy or live-link
contract. No gather workflow, task database, new dependency or app implementation is authorized by
this study. Preserve old tests/runtime, the other seat’s progress document and release qualification pause.

**Tradeoff:** interactive HTML makes scope and geometry concrete without establishing real editor,
phone, encryption or admission behavior. Parent-header context needs a later encrypted-format/export
decision; the existing viewport breadcrumb alone cannot supply transfer provenance. [Design packet](./product-design/2026-10-23-goals-context/README.md).


## 2026-10-23 — Scope mobile formatting as an in-app editor strip

**Commit:** pending sequential design patch62. **Orientation:** the operator knows the intended
heading/list toolbar appearance, but asked whether cross-browser/OS/keyboard requirements make it
unreasonably large or whether an established library settles them.

**Decision:** preserve a primary-source feasibility report before selecting implementation. Existing
CodeMirror panels and semantic commands are the starting recommendation; new heading/list adapters
remain needed. Treat keyboard geometry, focus and provisional text as separate boundaries. A Goals-only
strip with stable editor-attached fallback is a bounded proposal; neither universal keyboard docking
nor a native wrapper is selected. No new dependencies, permissions or mutation bypasses.

**Tradeoff:** a small formatting UI is practical, but no reviewed library removes app-specific
composition/admission obligations. Current Android composition can begin by placing a caret in a word,
so disabling controls for every composition is not automatically usable. A real-keyboard exploratory
slice should choose safe command ordering before implementation, separately from paused release
qualification. [Report](./product-design/2026-10-23-goals-context/mobile-formatting.md).


## 2026-10-23 — Keep scanning assistance inside the formatted editor

**Commit:** pending sequential design patch64. **Orientation:** browser review approved only card
breadcrumb placement, rejected incidental card styling, and clarified that Goals must retain its
formatted live-preview editing behavior without an outliner or separate scan mode. Nearby controls
added clicks/clutter; existing footer controls may already be better on phones.

**Decision:** supersede the earlier visual recommendations with one fictional editable CodeMirror
study using existing rendering/theme/command/CSS modules. Compare gentle context color, per-crumb
menus, experimental scroll-opening and a reading rail without selecting one for app implementation.
Preserve existing card styling and footer placement; retain desktop shortcuts and context-based
return to Goals as separate candidates. No new binding, metadata format or return command is selected.

**Tradeoff:** a real editor makes caret reveal/geometry visible, while its memory-only writes establish
no app admission/IME/persistence guarantee. Longest-prefix return matching also needs an insertion
contract: subtree-end append can misfile text under the last child. [Revision](./product-design/2026-10-23-goals-context/editor-study.md).


## 2026-10-25 — Select gentle context and preserve both outline navigation levels

**Commit:** pending sequential design patch65. **Orientation:** the operator found viewport-edge
and fixed-percentage activation unrelated to reading attention, favors gentle context plus breadcrumb
menus, and explicitly wants the current full-page outline dropdown retained. The rail is distracting.

**Decision:** select gentle context with a settings-sidebar toggle defaulting on, add per-crumb local
navigation without replacing the full outline, and park scroll-opening/reading rail as historical
experiments. Retain formatted editing/caret reveal and the existing footer. This is a design selection,
not authorization to start application coding. Card-context capture defaults/format remain separate.

**Tradeoff:** coordinate thresholds do not name the attended text; damping can reduce toggling but
does not establish intent. Explicit caret/focus/navigation actions are stronger candidate signals,
with the editing caret and reading location kept distinct. Offscreen dimming fallback and exact
preference/contrast detail remain proposals. [Selection](./product-design/2026-10-23-goals-context/selection-2026-10-25.md).


## 2026-10-25 — Gentle context remains a bounded, transient view projection

**Commit:** pending sequential implementation66. **Orientation:** the operator authorized default-on
gentle context, settings toggle/offscreen fallback and breadcrumb menus retaining the full outline.

**Decision:** first implement the decoration and one browser-only presentation Boolean. Keep the
workspace format, admission/crypto/sync owners and card rendering unchanged. Bound parser-node
lookup, avoid forced parsing/title-catalogue reconstruction per keystroke, and coalesce visible-area
measurement. Dispatch only after CodeMirror measurement completes, with owner/state/generation fences.
Storage refusal affects remembering this choice only. Menus and final bookkeeping are separate phases.

**Tradeoff:** incomplete parser coverage or pathological scope lookup shows ordinary contrast rather
than guessing or blocking typing. The preference applies to this browser, without sync semantics.
[Phase66 evidence](./development-evidence/2026-10-25-goals-navigation/phase66/README.md).

## 2026-10-25 — Keep two navigation levels in the one Goals editor

**Commit:** pending sequential implementation patch67. **Orientation:** the operator selected per-crumb
menus while retaining the complete page outline and formatted editing.

**Decision:** retain Goals as the full-outline control; give each heading a direct jump and local
child/sibling menu. Capture its document identity and catalogue once, close on accepted edits, and
independently reject stale destinations. Display ancestry/line context for duplicate headings. Menu
selection focuses the stable Goals control because a leaf trigger can disappear when navigating to
siblings; Escape returns to the original trigger. Neither action moves the editor caret or opens it.

**Tradeoff:** this is ephemeral navigation over authored headings, not a new outline model, section
identity or content command. Bounded parser availability remains the existing outline limit. Native
horizontal breadcrumb scrolling worked in the disposable touch check, so no shell gesture change is
needed. [Bounded evidence](./development-evidence/2026-10-25-goals-navigation/phase67/README.md).

## 2026-10-25 — Keep new Goals tests required without inventing release credit

**Commit:** pending sequential patch68. **Orientation:** phases66–67 implement the selected Goals
presentation features; the repository's local bookkeeping and cautious old-test discipline still apply.

**Decision:** refresh source hashes and add exactly five required test-file obligations. Keep every
existing unresolved identity and the aggregate release block; new files remain uncredited until a
separate adapter/process review. Cryptographic labels, ownership and construction dispositions stay
unchanged. Existing outline fixtures wait for the complete admitted document, and card-reopen tests
assert completed quick-entry submission before reload. Every old assertion and timeout remains.

**Tradeoff:** broad functional success is recorded as execution evidence, not security qualification.
The stale-menu regression is challenged with a one-guard-defective disposable build; earlier fixture,
receipt and card-reopen failures remain visible alongside final passing results. Physical phone/IME,
other engines and general qualification are outside this slice. [Evidence](./development-evidence/2026-10-25-goals-navigation/phase68/README.md).

## 2026-10-25 — Card heading context is an advisory encrypted snapshot

**Commit:** pending sequential patch70. **Orientation:** the operator asked to implement card heading
breadcrumbs with an account-menu off option and a simpler symbol treatment, retaining card styling.

**Decision:** capture bounded authored heading paths with the selected text as optional versioned
card metadata through the existing admitted command. Preserve Markdown and crypto mechanisms. The
forthcoming default-on browser display switch hides paths without deleting them or stopping capture.
Keep supported lifecycle operations/undo consistent; clear differing merged paths. Export an optional
versioned sidecar without changing Markdown or assigning live paths to archived positions.

**Tradeoff:** the field is advisory, with no task/backlink/authority claim. Old clients can omit it
or retain an older merge snapshot; a schema fence is not added for optional presentation provenance.
Unavailable parse coverage/overlong headings omit the label, not the transfer. Sidecar import and
whole-subtree transfers remain separate. [Evidence](./development-evidence/2026-10-25-card-breadcrumbs/phase70/README.md).

## 2026-10-25 — Close card breadcrumb implementation without expanding qualification

**Commit:** pending sequential patch72. **Decision:** preserve all existing crypto domains, construction
ownership, obligations, deadlines and release blocks while registering the five new test files as
required/uncredited. Keep failed counterexamples and their repairs beside final regression results.
The account setting controls browser display only; paths remain encrypted content. Prior unlabeled
cards stay unlabeled. Metadata fidelity with older clients and sidecar import remain explicit limits.

**Evidence:** 1,981 full unit passes/one existing skip; 216 browser passes/24 existing platform skips;
109 bookkeeping regression passes. Scope and identities are in the
[final record](./development-evidence/2026-10-25-card-breadcrumbs/phase72/README.md). No release qualification
resumption, real profile/8443 replacement, commit, push or deployment is implied by these checks.

## 2026-10-26 — Reuse retention measurements; automate the private owner first (phase73)

**Commit:** pending sequential patch73. **Orientation:** the operator reports increasing account-open
and sync delay, asks about automatic history maintenance, and explicitly asks to reuse earlier
measurements where sufficient before starting the next bounded phase.

**Decision:** reuse the history-depth, outside-admission handoff, private evidence-reuse and later
preparation-task studies. The latter already fixed the known remaining preparation stalls; an earlier
recommendation to repair them again was stale. Implement an event-driven private scheduler over the
existing removal owner, with a cheap authenticated revision/record-count hint, one flight, quiet and
cooldown windows, paced refusals, lifecycle cleanup and halt on unexpected owner failure. Preserve
all final proof/mutation boundaries. Keep automatic policy, installer and writer disabled in public
builds behind separate opt-ins; compatible reading remains enabled.

**Tradeoff:** reuse selects the next mechanism without diagnosing today's account or claiming new phone
performance. The 1,024-record/10-second/30-minute policy is a conservative initial private policy, not
an empirical optimum. Refusals may be reconsidered after reopening because policy state is ephemeral.
Server pruning, public capacity/refusal UX, compatible activation and physical-device observations
remain separate. [Contract and evidence](./account-local-retention-automatic.md).

## 2026-10-26 — Quiet local-maintenance status and bounded explicit retry (phase74)

**Commit:** pending sequential patch74. **Orientation:** the operator asked to work through capacity/
refusal UX and activation in bounded patches, authorizing routine product choices.

**Decision:** keep ordinary deferrals invisible; show persistent problems in Data, with “Maintenance
paused” on its collapsed summary. Describe capacity without asking people to delete writing. Offer
Check again for pre-mutation refusals, retaining quiet/backoff and all existing owner checks. A storage
or verification halt requires lock/reopen; no retry clears it. Reuse the existing DeviceRoster
presentation boundary for a narrow, optional local status/retry port; service history stays separate.

**Tradeoff:** session status is not persisted across reopening, and ordinary waiting gets no progress
banner. The status port exposes no authority/evidence. Public conversion stays gated until the
activation build/runbook phase. [Evidence](./development-evidence/2026-10-26-automatic-local-retention/phase74/README.md).

## 2026-10-26 — Explicit coherent activation with an automatic user experience (phase75)

**Commit:** pending sequential patch75. **Orientation:** status/refusal behavior is frozen in74; the
operator authorized product decisions while preparing bounded sequential work toward activation.

**Decision:** keep routine builds reader-only and provide one explicit release build opt-in that
sets compatible reader/installer/retention/automatic capabilities together. Reject contradictory
zero overrides. Expose that opt-in to Docker's frontend build. The selected release is automatic for
users, with no extra consent/settings chore; retain the initial threshold/quiet/cooldown policy.
Prove current-source reader-only rollback after actual conversion, editing and cold reopening.

**Tradeoff:** activation is compiled into immutable client code, so changing server/runtime environment
cannot instantly stop cached clients. Rollback needs compatible readers and client adoption; it does
not reconstruct removed operational history. Keep public conversion off in ordinary builds until the
explicitly selected image is signed, tested and published by the existing procedure. No remote kill
switch, live document shrinkage, automatic server pruning or new authority is introduced.
[Runbook](./account-local-retention-activation.md).

## 2026-10-26 — Preserve signed-series routine evidence before image preparation

**Commit:** documentation-only checkpoint after signed `92034c11`.
**Orientation:** the operator requested committing the prepared series and asked what is wise before
release preparation. Focused maintenance evidence followed an earlier full UI/unit run.

**Decision:** sign the15 exact prepared trees, then run full routine unit/browser and current CI
contract/adapter surfaces on the final signed source. Preserve those results and the phase-to-commit
map in the repository. Reuse exact-tree native maintenance evidence and historical performance work;
keep general qualification paused. Recommend a targeted physical-phone first-conversion/lifecycle
walkthrough and exact signed ARM64 artifact/compatible reader rollback as the next publication work.

**Tradeoff:** the full local pass uses Node26 and Android emulation, so it does not establish target
Node24/container or physical-phone behavior. Keep these limits explicit rather than calling the
whole paused campaign complete. No product/source changes or publication are made in the checkpoint.

## 2026-10-26 — Prepare automatic-maintenance activation with the deployed reader fallback

**Orientation:** the operator authorized release preparation, chose to defer a physical Android
walkthrough for the two-user beta, and requested HSTS while noting the infrastructure reorganization.

**Decision:** build the clean signed `dc53fecf` source as an ARM64 distroless image with the coherent
automatic-maintenance opt-in. Test the unchanged extracted frontend using the actual deployed
`d8b3f22b` reader, real growth/quiet thresholds and automatic reduction on both original/joined
profiles, followed by reader rollback and two-way writing. Retain that reader's immutable digest.
Carry this tested artifact across documentation commits only after independently comparing every
allowlisted input byte/mode. Keep both merge buttons with the operator and general qualification paused.

Prepare host-only one-year HSTS in the current ol-infra HTTPS route rules, including the notification
stream, without broadening subdomain scope or changing stream timeouts. Preserve the new `infra-core`
Flux dependency and independently reconciled application/public route ownership. Image publication,
infrastructure PR, reconciliation and client adoption follow after application merge.

**Tradeoff:** a desktop real-threshold walkthrough does not establish physical-phone responsiveness or
screen-lock behavior. Reader adoption stops future maintenance but cannot reconstruct removed local
operational rows. The original public TLS probe's Docker DNS failure remains beside a successful
default-trust DNS control. HSTS is sticky until expiry or HTTPS `max-age=0`; no preload is requested.
[Exact artifact, failures, limits and handoff](./development-evidence/2026-10-26-ux-retention-release/README.md).


## 2026-10-26 — Incremental context without changing the editing model (phase82)

The operator reports Goals-only typing slowdown partly relieved by disabling Gentle context.
Reuse numeric ownership intervals across parser-proven ordinary paragraph edits and suppress unchanged
view effects. Invalidate on structural/parser/coverage changes; retain bounded fail-open lookup and
actual offscreen/lifetime guards. Keep the toggle default on; no content or security guarantees change.
The browser timing probes do not establish the16ms gate or explain all lag, and preserve a separate
final-text failure on both predecessor and candidate. [Evidence](./performance-experiments/2026-10-26-goals-context/README.md).


## 2026-10-26 — Storage arrivals interrupt preparation, not final exchange (phase83)

The operator asks to repair maintenance contention while preserving security. Separate the read-only
preparation queue-priority generation from retained evidence's input/lifecycle guards. Foreground
storage arrival stops the next preparation effect/yield boundary, after native settlement; final
mutation/readback retains its existing exclusive lifetime. Three native regressions distinguish the
two boundaries. Offline-start fixture schedules keep their original storage/reader assertions rather
than expecting discretionary maintenance to defeat a new sync flight. [Evidence](./performance-experiments/2026-10-26-maintenance-contention/phase83/README.md).


## 2026-10-26 — Sync readiness and user quiet are separate clocks (phase84)

The held-receive regression disproves the initial maintenance start guard; its timeout also exposes a
retry gap. Defer automatic starting through starting/working/retrying lanes. Let offline/idle/blocked
states use the existing proof path, and preserve all network deadlines. Refreshing readiness must not
reset user quiet or routine polling can starve local reduction. This favors foreground convergence and
can postpone discretionary maintenance on a continually busy account. No hint supplies authority.
The current backup cap remains unchanged at the operator's request; no readback bypass. [Evidence](./performance-experiments/2026-10-26-maintenance-contention/phase84/README.md).


## 2026-10-26 — Explicit release hold; distinguish local Account replay from service pruning (phase86)

The operator explicitly defers release preparation until a later request. Continue bounded development
and sequential patches only. Clarify that automatic **local** reduction applies to synced Accounts'
device storage. The confirmed manual service prune removes covered ciphertext but retains proof
metadata and does not rewrite the phone's existing replay ledger. A reported minute before editing
selects startup-phase attribution, not another generic catch-up sweep. Backup cap/cadence and exact
readback remain unchanged; daily verification is a discussed option, not an implementation decision.
[Source-backed cadence and next bounded questions](./development-evidence/2026-10-26-account-startup-and-backup-cadence/README.md).


## 2026-10-26 — Visible mobile grip and explicit post-hold scroll ownership (phase87)

The operator asks to retain the mobile grip and reports immediate drag cancellation. A real sustained
scrollable-list test reproduces native pointercancel after capture. Keep both activation paths: expose
the grip with its initial touch-action and capture-phase claim; for body holds cancel native touchmove
only after activation using a scoped listener installed at gesture start. Ordinary scrolling remains;
editor input is excluded. Retain primary ownership and existing single release operation/cancellation.
No backup/startup or security-contract mechanism changes. [Red/green and preservation evidence](./development-evidence/2026-10-26-mobile-reorder/README.md).

## 2026-10-26 — Goals menu ownership (phase88)

The operator selects the Goals word for the full outline and a trailing caret for that heading's
children. Root children are H1s; leaves do not fall back to siblings. Selection drills into the chosen
heading while preserving editor selection and the captured-document guard. Adopt the former outline
indicator's24px centered geometry/2px corners, retaining current colors. This supersedes the previous
leaf-sibling and close-on-select presentation only, not writing/admission behavior.

## 2026-10-26 — Done contrast is per card (phase89)

The operator selects33% resting opacity and100% while interacting. Apply this to the individual
card, including focus within and explicit editing/reordering state, without changing layout or guards.

## 2026-10-26 — Hourly backup verification, five-minute local checks (phase90)

The operator selects one remote verification cycle/hour, including unfamiliar retained keepers. Uploads
remain independent and prompt; receipt credit is distinct from exact-readback backup credit. Keep
immediate verification for explicit maintenance backups. Local checksum checks cannot prove restoreability
without the separately held recovery key and cannot grant pruning. Keep every anchor/keeper/listing fence.
A download cap pauses reads/pruning until UTC reset, allowing new uploads; broader caps pause provider
calls. Transient failures back off. Caches/backoff remain process-local: restart requires a fresh proof.
Health means the selected upload/local-check/hourly-remote-check policy, with pending verification and
actual verified recovery-point age exposed; it does not mean every newly uploaded byte is verified.

## 2026-10-26 — Separate passkey presentation from authenticated opening (phase91)

Provider return ends the prompt presentation, not proof verification. Show access/saved-writing
progress while existing owners continue; retain Back as cancellation, never removal. A late owner
must drain before the setup lease is released and cannot publish ready after cancellation. Add only
opt-in fixed-label numeric phase metrics; do not remove fresh census/replay checks or claim the actual
phone's delay has been attributed. Reuse the prior depth evidence, then profile the actual slow phase.

## 2026-10-27 — Project receiver cursors before detached copying (phase93)

Reuse existing verified-owner selection and certified publisher resolution for a narrow request/status
projection. The source and fixed synthetic probe support removing whole retained-history copies from
these read-only consumers. Keep full retained evidence on page verification/application/history paths,
scheduling order, fresh authority/commit checks and all original latency gates. This is a bounded
client-copy repair, not another service proof cache or permission to infer phone-opening attribution.

## 2026-10-27 — Read cursors are scheduling data, not retained proof (phase94)

Narrow the detached request projection to prefix/conflict/starting point per publisher and pending-self,
inside the existing freshly authenticated selection; retain the exact checked publisher resolver.
Compute scalar status there too, then retain its frozen public shape. Type-only cursor support does
not make hints eligible for page verification/history installation: those paths keep full retained
evidence and every existing check. Confirm the default path via real receiver clone observations,
old-source failure and cold/conflict regressions; keep whole-client latency acceptance separate.

## 2026-10-27 — Compare rebuilt whole clients with maintenance enabled (phase96)

Use two complete rebuilt clients differing only in the receiver projection repair against one identical
current service and freshly regenerated disposable seed. Preserve current automatic retention policy,
unequal device/history load, original latency gates and cold durability/native signature checks. Fixed
R,C,C,R journeys bracket drift; correlated keys do not create independent replicates. Bulk replay and
non-overlapping-session timing stay separate from the complete-peer2.5s realtime gate. No Android/
phone-opening or generalized qualification inference follows from this finite native desktop study.

## 2026-10-27 — Repair self-read ordering before broader idle-peer scheduling (phase99)

The native trace confirms repeated empty publisher reads and capacity retry gaps. Exact source
replay shows a smaller defect in existing self-check reuse: an intervening empty peer clears the
productive flag and defeats a still-recent own check. Select that as the next bounded repair, with
fresh retained backlog hints, pending-self reconciliation and original non-self turns preserved.
No implementation or timing win is claimed yet. Keep the bulk-custody reader opt-in because its
previous adoption criterion failed. A broader remote-peer delay requires its own discovery-latency
contract and must retain the2.5s acceptance gate, not inherit a delay merely because a poll constant exists.

## 2026-10-27 — Fresh peer backlog preserves only the existing own-check optimization (phase100)

Use already authenticated retained cursors to show that useful peer work remains despite an
intervening empty peer. The hint can preserve an existing recent own check, never create one or
suppress pending-self reconciliation. Keep all other publisher opportunities and the original
five-second own recheck boundary; no new remote-peer silence cache or polling interval. No crypto,
format, authority, rate, concurrency or failure-backoff contract changes. Validate whole-client
behavior separately, retaining the2.5s complete-peer gate and every preservation check.

## 2026-10-27 — Separate publisher payload size from endpoint availability (phase103)

The old owner-wide downgrade was safe but too broad for aggregate size. Keep404 owner-wide; bind a
successful aggregate-limit hint to the publisher decoded from the owned request. Keep unscoped
byte-only callers conservative. Bound scheduling hints to128 fixed-size IDs, evicting to re-probe
rather than downgrading another publisher. This changes no account-size limit or authority cache.
All original byte/ownership/deadline/verifier/commit boundaries remain. The frozen100 comparison
measures only the self-read repair; do not attach its timing result to this separate size repair.

## 2026-10-27 — Bound remote quiet rechecks without borrowing the self window (phase108)

Keep unchanged-peer discovery explicit: four certified remotes are checked roughly1024 times per
1024-position catch-up. Neither permanent silence nor the5s self window is justified for independent
writers. Select750ms as the next experimental fixed per-publisher budget while other verified backlog
exists, with target/context binding, immediate wake/reset invalidation and per-attempt generation
fences; do not slide with unrelated work, key to aggregate progress, reset own freshness or weaken
verification/backoff. This is a proposed candidate, not an implemented/adopted default. Full original
gates and a same-account late-writer case under real contention must pass before adoption. A broader
mixed-publisher cohort needs its own outstanding-request/group-commit contract.

The two guarded baseline observations are below2.5s with normal/withheld wake frames; no p95 or
causal hint-performance claim. Preserve both earlier failed/interrupted fixtures. Correct106's
missing-receipt inference: displayed0 is the scheduler's initial counter, not a local-storage census;
receipt replay was not established. Native seed-tip+1 and original byte identities are the reliable
guard. No runtime or qualification change. [Evidence/next contract](performance-experiments/2026-10-27-quiet-publisher-probes/phase108/README.md).

## 2026-10-27 — Fixed quiet deadlines require captured generation, not reset-on-completion (phase109)

Implement750ms only after verified empty completion and while other authenticated backlog remains.
Bind target primitives and stable public authority, not aggregate revision or detached object identity.
Use the existing baseline cursor resolver for sparse streams; do not persist empty scheduling state.
Opaque captured tokens fence pre-wake replies; a notification clears scheduling only, not valid I/O,
own freshness or fairness. The actual composed one-fault race detects a missing token-generation
fence. Full performance/data gates remain required; no adoption or release claim from units/race.

## 2026-10-27 — Throughput does not override the peer-latency gate (phase111)

Candidate gains16.8%/38.8% replay throughput and passes original eight cases, but new two-receiver
complete peer p95s2532.0/2739.1ms miss2.5s. Reference withheld also misses; do not infer a causal
regression from single observations. Retain every failed gate, disable optional quiet scheduling
in the product default, and investigate active-writer discovery/publication pacing before adoption.
Keep2.5s and full120 keys; no outcome-driven timing rerun, threshold relaxation or release preparation.

## 2026-10-27 — Preserve the failed candidate without enabling it (phase112)

Use the original selector default in composed product owners while retaining optional750ms machinery
for the next bounded repair. The actual composed guard distinguishes active and held builds, rather
than relying only on a source flag. Keep every failed p95 and unchanged2.5s gate. A recent-writer grace
period is only a hypothesis; trace publication versus receiver delay before selecting it. No release
preparation, threshold relaxation or production/default feature activation from this experiment.

## 2026-10-27 — Repair expired publication urgency before broad capacity policy (phase114)

Retained full-series attribution finds both source pre-HTTP wait and capacity-induced receiver pauses.
All over-gate keys map uniquely; no partial p95 or HTTP-only acceptance inference. The existing
scheduler can postpone an already-due window when later input arrives during receive/prelude work,
confirmed as a possible mechanism by pinned fake-clock histories. Prefer publication-only deadline
latching next; the shared helper also serves local flush, which needs its own typing evidence.

Keep existing persisted retries, durability, authorization/final checks and refusal backoff. If
latching fails the unchanged whole-client2.5s/gain/data gates, pace capacity before refusal rather
than bypass it or infer a safe larger quota. These traces identify capacity but not the exact quota
branch; policy limits are not measured machine capacity. No runtime repair/default activation or
release preparation in this diagnostic.

## 2026-10-27 — Latch at the publication call site, preserving local flushing (phase115)

Use the scheduler's existing close/clear semantics when a local wake finds an overdue window.
Later input may extend a not-yet-due window, but cannot erase an expired opportunity while receiving
or a send prelude runs. Keep the shared batchWindow helper untouched because local journal flush
has a separately measured policy. A deadline remains urgency, not persistence or allocation authority.
Existing failure clocks and sealed retries stay; one-statement omission proves expiry sensitivity.
Full rebuilt-client gates still decide acceptance; do not enable quiet reuse from model/unit results.

## 2026-10-27 — Accept combined publication latch and guarded quiet budget for adoption

Phase117 meets all prospectively retained2.5s/16ms/data/continuation gates in the four two-receiver
and eight broader journeys. Both throughput paired directions exceed reference drift; native bytes
and independent signature/prefix checks pass. Permit a separate activation of the exact tested
composed owner, retaining all quiet-target/authority/cursor/frontier/baseline/generation fences and
the750ms expiry. No change to local flush policy, verification, server limits, concurrency or retry
backoff. This replaces the product hold from112 only after activation and affected checks;111 failed
attempts remain historical failures. Signed-source/artifact release checks are a later operation.

## 2026-10-27 — Activate only the measured composed-owner budget (phase118)

After all12 fixed journeys and the activated-candidate regressions pass, replace112's product hold
with the exact measured composed-owner constructor. Keep factory/noncomposed defaults,750ms expiry,
all target/authority/cursor/frontier/baseline/generation fences and pending/idle/own-stream handling.
Publication latch changes urgency only; durable barriers, wire allocation, verification, local flush
policy, limits and retry backoff retain their existing authority. Accept the comment-only source-map
difference through exact-field inspection, without claiming all110 artifact files are byte-identical.
Release preparation begins with signed-source identity and artifact checks; it is not accomplished
by this unsigned comparison. Retain optional broad-lint archive failures outside this bounded repair.


## 2026-10-27 — opt-in exact baseline reuse inside startup recovery (phase122)

Reuse a completed v5 baseline proof only within the same carrier and after exact fresh physical
evidence and verifier-owned authority checks. Require an explicit immutable-capability opt-in;
original/joined startup hold that contract, other one-shot readers do not implicitly acquire it.
Keep live warm reference audits and cross-owner initialization separate. This removes duplicated
verification without adopting a scalar revision/hash as authority or retaining an expired task.
[Contract and evidence](performance-experiments/2026-10-27-maintenance-continuation/phase122/README.md).


## 2026-10-27 — one verifier owns first-conversion reference and candidate (phase123)

Keep full input verification inside the paired builder instead of accepting caller-supplied
preverified state. Share its owned reference with first-conversion planning while retaining the
independent compact-candidate replay and exact survivor/reference comparison. Keep reference
failures outside candidate refusal classification. The standalone builder erases its unused
reference; no proof crosses owner lifetimes or authorizes a broader cut.


## 2026-10-27 — phase progress is presentation, not a retained proof (phase124)

Show real local-maintenance stages and definite counts only for the record-reading subphase.
Coalesce updates without adding polling; keep an indeterminate indicator for work with no honest
total. Only the verified removal outcome may publish completion. Keep diagnostic attempt/stage
facts volatile, separate from future authenticated resumable work, and preserve observer isolation.


## 2026-10-27 — retain verified work before changing the retirement format (phase125)

Choose closed authenticated preparation checkpoints with unchanged originals as the first durable
resumption slice. Fixed earlier cuts plus later chunk reservations need a separate compatible
representation; do not reinterpret v5 or persist a bare verification success. Keep normal factor
unlock/erasure, fresh current authority, exact prefix evidence and final independent readback.
Provisional slice/fence targets need implementation evidence; no phone bound is asserted.


## 2026-10-27 — automate existing commands without enabling long unattended work (phase126)

Keep service automation default-off until bounded/preemptible preparation and the unchanged2.5s
peer gate permit activation. Choose1024 observed records and an hour between creations per lifetime
as conservative policy, not measured optima or a durable global quota. Keep numeric scheduling debt
across local cuts/custody refresh, with all real owner checks fresh. Preserve pending manual work: no
automatic discard, no substituted second-device admission and no weakening the local retirement pin.
Existing control events replace periodic catalog polling; network failures require events plus
backoff and unknown/integrity failures halt. Phase125's durable resumption remains a design.


## 2026-10-28 — derive the frontier again from exact completed evidence (phase127)

Refine125's continuation design: preserve authenticated, exact-input verifier receipts and rebuild
semantic ordering/authority/coverage frontiers on resume. Do not deserialize an accepted ledger or
use a generic success flag. This uses the existing per-check memo seams while keeping independent
candidate/readback paths separate. Native binding must include the verifier implementation closure,
current keys/authority and an exact physical prefix; source upgrades cannot silently inherit old
acceptance. The standalone model is not native durability or a time bound on indivisible work.

## 2026-10-28 — Preparation storage and handoff

Derive an auxiliary database name from the existing canonical content name; preserve original stores and schemas. Reserve every encryption invocation in the existing authenticated main allocator before sealing, atomically append encrypted receipt chunks plus head, and check exact readback. An old read task may export only a MAC-protected delta; a fresh serialized task reauthenticates context/prefix/delta before allocation. Bind receipt reuse to conservative runtime/build-source closure so changed verifier code cannot inherit old acceptance. Unknown layouts refuse overwrite; interrupted saves retain the old head.

## 2026-10-28 — Fresh serialized preparation saves; readiness is distinct from input

A read preparation task may export only its locally authenticated delta before settlement. A new serialized task rechecks owner/context/prefix and authenticates the delta before allocating any seal; disposal expires the handoff. Cached individual checks do not confer deletion authority; final candidate and strict cut/readback stay independent. Useful persisted slices yield and continue, but no service automation is enabled.

Native automatic testing found each whenDurable barrier reset the editing quiet clock through admission status observers. Treat those notifications as readiness refreshes, as the service policy already does. Actual accepted writing, keyboard/beforeinput/pointer activity and visibility still wake/reset quiet; pending/blocked/non-durable admission still refuses work. Preserve both failed deadlines and the passing discriminating run. Keep the new resume flag off until the existing2.5s peer p95/typing/catch-up contention gate is met; a2s new-work target and tiny native fixture do not establish phone wall-clock bounds.

## 2026-10-28 — Qualify explicit resumable preparation before release activation

Release candidate covers the entire branch since recorded dc53fecf, retaining backup/UX/sync repairs rather than considering only the last five patches. Keep Docker default switches off; test explicit local auto1/resume1/service auto0 against identical source with resume0. Reject contradictory writer capabilities before building. Phone evidence is deferred by the operator, not replaced by desktop emulation. Preparation/typing/catch-up acceptance remains2.5s peer p95 and existing guardrails. General qualification stays paused.


## 2026-10-28 — Phase135: keep acceptance failure separate from successful local checks

The ordinary checks and focused authority/storage review may close independently of performance
acceptance. Retain both normal input failures and the six unexecuted cases, with resume default0
and service automation0. Do not substitute handler-only latency for the unchanged16ms end-to-end
local gate. The next discriminating study is controlled trusted dispatch versus editor scheduling;
a passing baseline rerun alone cannot erase the failed comparison. The operator defers today's
phone walkthrough. A stale14→15 open-construction fixture is repaired while independently naming
the new open construction and retaining the zero-open release block. Supplemental root/cache
review runs variants in separate processes to avoid the inherited mutable-path shutdown timer;
offline retry deferral and the failed attempts remain evidence rather than discarded results.


## 2026-10-28 — Phase142: reduce repeated verified-view work before changing the byte kernel

Current original-workload input11.9/7.6ms remains below16, while the full-history card condition
reproduces20.6ms with17.6ms browser queueing and0.7ms mutation. Static drift blocks timing promotion;
a separate paused-maintenance profile and concrete helper-code match select whole-record cache
matching/projection and ownership traversal. The existing word comparator is already optimized.
Prefer a bounded adoption of the existing synchronous ContentSelection/verified.select contract
where fresh carrier authority already exists, after a discriminating call-count/ownership proof.
Do not widen leases across awaits, treat a revision/hash as authority, remove exact fallback/audits,
or change buffer erasure casually. Cleanup traversal is a separate mechanism. This records an
investigation choice, not an implemented repair or passing acceptance; all failures/default holds
and the operator's phone deferral remain. No publication or generalized qualification.


## 2026-10-28 — Reuse private verified selections at metadata-only publication loads

Adopt the existing carrier lease only synchronously, returning detached projections before async
work. Delivery retains separate census/state ownership; envelope independently refreshes the
publication predicate. Keep speculative proposal verification and native/witness/final-commit
checks unchanged. Selection refusal fails closed; only capability absence uses the original raw
record path. This first bounded repair does not combine ownership cleanup or broaden proof
lifetimes. Retain the full-history input and peer gates before making any performance claim.


## 2026-10-28 — Reject mixed wall/monotonic timing and repair the apparatus separately

The145 candidate has an empty constant-offset clock intersection and cannot receive timing credit.
Keep its raw results and stop rule. Measure future driver offers/scheduling/brackets on a monotonic
clock, test a controlled wall-clock step, and keep the original1ms bound and all performance gates.
Use fresh profiles and a new frozen comparison; do not widen the allowance to fit an observed run.


## 2026-10-28 — Separate accepted publication from peer discovery before blaming maintenance

The147 follow-up is already in the server’s accepted history; copies discover it with no new
submission and unchanged native proofs. Reframe the blocker as receiver discovery after a missed
last hint. A healthy60–65s idle repair policy predates143; deterministic controls reproduce a
30s miss without maintenance. Do not claim an exact original live-state replay or silently
reclassify the frozen failure as a fixture success. Preserve30s/16ms/2.5s gates while deciding a
bounded reconciliation repair with an explicit network/capacity budget.


## 2026-10-28 — Bound healthy idle reconciliation without changing hints or backoff

Choose15–20s healthy idle checks to leave nominal10s for discovery/receive under the existing30s
post-backlog peer guard; preserve jitter and the5s unhealthy path. Hints remain non-authoritative
scheduling inputs. Accept3–4 idle passes/minute instead of~1, retaining per-operation authority
checks, rate refusals and retry backoff. This does not promise idle2.5s delivery when all hints
are lost, nor arbitrary server capacity. Reuse existing before failures; require actual after
edit/undo/cold/native and unchanged16ms/2.5s gates before accepting the bounded repair.


## 2026-10-28 — Omit unused envelope history at the existing projection boundary

Keep the complete authenticated private view, but detach only the four envelope-preparation fields
it reads. Do not spread/rest the full object, prolong a selection lease across await, omit fresh
authority/native/witness checks or change erasure ownership. A narrowed type on nextSpoolPosition
states its existing inputs without changing arithmetic. Keep reference readers and proposal
verification independent; use measured zero-history traversal plus original actual-client gates
rather than claiming speed from the field count alone.


## 2026-10-28 — Accept the bounded projection candidate for signed-artifact preparation

Four fixed actual-client after journeys clear the unchanged16ms local,2.5s peer/every-marker and
30s late-edit guards with actual preparation, Undo, complete/offline writing and independent native
proofs. Lift this candidate's measured performance hold for explicit local-auto1/resume1/service-auto0;
do not activate source defaults or service automation. The next release boundary is a signed-source,
identified ARM64 artifact with selected switches and its own tests. Keep prior failures as evidence,
phone deferral and generalized qualification paused. No universal latency/capacity inference from
these four journeys and no authorization to merge or deploy is inferred from this acceptance.


## 2026-10-28 — Select the measured resumable profile for exact-artifact release preparation

The operator authorizes signing the canonical bounded series and starting release preparation.
Use explicit local-auto1/resume1/service-auto0/coordinated-2000, matching accepted phase156; leave
ordinary source defaults and experimental service-history automation off. Preserve the exact tested
ARM64 image rather than rebuilding after documentation. Reuse source-identical unit/performance
runs as such; run exact-artifact functional/upgrade/rollback and fresh bounded native/contract checks.
Phone testing remains deferred and general qualification paused. Both operator merge buttons and
exact private-registry image approval remain separate later publication boundaries.


## 2026-10-28 — Extract fixed page environment endpoints before selecting worker execution

Phase163 proves a native owner can execute in a worker, but its experimental shared-memory and
cohort adaptations are not a production journal/admission integration. Extract activity, actual
native lifetime/retirement and fresh journal storage/events into typed ports backed by a frozen
internal page adapter. Leave execution, Account/joined exclusive modes, compatibility, SessionTask
guards/drain and synchronous sealed local acknowledgment unchanged. Do not add an input option or
global setter through which callers can replace coordination/storage authority.

Accept one explicit cleanup improvement: activity unsubscribe closes over the original registration
target. Do not capture journal contents/storage availability or cache lock authority. Require exact
remaining owner bodies, original native mutation controls, authority/cache resume checks and ordinary
bookkeeping. Future worker integration must implement the mixed-owner cohort/refusal and admitted
Window mirror contract separately; this refactor alone earns no latency or qualification credit.


## 2026-10-28 — Prove worker release through a native barrier, not its message

The mixed-owner cohort needs distinct supervisor, incarnation and single-member leases while
retaining the existing slot lock domain. A completed worker message is not a native release proof:
the initial Chromium control catches separate-channel ordering. After withdrawing new joins and
draining, cross the actual member-release barrier before releasing the Window endpoint. A5s refusal
deadline keeps the slot fence held on failure. Preserve the ordinary exclusive Account factories;
the coordination primitive alone grants no decryption/admission authority or activation permission.


## 2026-10-28 — Keep synchronous admission in the Window when native I/O moves to a worker

For phase166, retain the existing admitted workspace/command/Undo pipeline and real journal codec in
the Window. Accept locally only after its synchronous sealed append; a worker acknowledgment cannot
replace it. Retain the original ordered commit-first fallback when the journal refuses. Share only
necessary domain-separated journal subkeys, never root/content-generation/signing keys. Bind their
trusted handoff to the actual live cohort and account scope, register cleanup before awaiting and
erase incoming copies. Coordination tickets carry no cryptographic verification authority.

Authenticate the entire native recovery in the worker before projecting original admission content;
private ledger/outbound records remain there. Check full/projected replay including unresolved Yjs
state. Use the original shipping reader as the recovery oracle across lost contexts/replies. The
successful isolated proof does not select shared memory, require isolation headers or activate the
product. Production-compatible storage messaging, large-message strategy and actual Goals/peer gates
must precede activation. Keep all existing guards and16ms/2.5s/30s gates. No service automation.


## 2026-10-29 — Complete the worker conversion before measuring acceptance

The operator authorizes continuing bounded phases/sequential patches through the actual conversion,
then measuring the unchanged performance targets. Replace the experimental shared-memory storage
mailbox with bounded asynchronous ciphertext paging and exact cleanup. Keep sealed local acceptance
and command/Undo ownership in Window; keep account authority, native history/verification, scheduler
and maintenance together in the worker. A raw capture or message identifier grants no proof authority.
Final native changes must retain the actual Window admission fence where synchronous journal/route
checks require it; cached storage or serialized verification success cannot replace that fence.
Preserve page-bound passkey/lifecycle endpoints, compatibility, cancellation and uncertain recovery.
Service automation remains off, general qualification paused, no release or publication authorized.


## 2026-10-29 — Observe native state independently of rendering and await actual predicates

Native coordination/storage campaigns use a bounded host-side evaluation loop, preserving their
existing observation deadlines. The installed waitForFunction implementation accepts a truthy Promise
before a false async predicate settles; state observation must not credit that as successful native
evidence. Rendering frames are also unrelated to lease/storage truth. Preserve original assertions,
schedules, faults and source identities, including the executed observer helper. The separate frozen
probe did not reproduce absent RAF; do not promote that hypothesis into a proved historical cause.
Complete original admission/journal/lifetime campaigns pass after this change. [Phase173](performance-experiments/2026-10-28-worker-owner/phase173/README.md).


## 2026-10-29 — Rebind Window journal context under its actual final admission head

Worker ownership must not leave Window source-capture epoch or journal era fixed at opening. A genuine
carrier-bound journal-flushed fence holds input through replacement; existing canonical/Undo stays
owned by the original admission queue. Captured Worker material still requires native authentication
and fresh authority checks; the fence and private32-byte subkey equality fingerprint do not replace
those proofs or authorize new account scope. Hashing only the journal subkey avoids retaining a raw
JS key copy after WASM import; the hash stays private and is erased on close. Authorized mismatch
aborts the root, with drain outside its own callback. [Phase174](performance-experiments/2026-10-28-worker-owner/phase174/README.md).

## 2026-10-29 — keep Worker history mutation reserved through Window acknowledgment

For the internal Worker owner, retain its actual final reservation until the same branded Window
controller consumes and installs the freshly authenticated journal context. A monotone data message
identifies a handoff but grants no native authority. An uncertain reply closes/drains the root, since
resuming with the previous sealing context would be unsound. Explicit manual first conversion may
occupy this fence; automatic preparation must retain its existing input-priority/resumable design.
See [phase175](performance-experiments/2026-10-28-worker-owner/phase175/README.md).

## 2026-10-29 — keep Worker receive data separate from native authority

The native owner retains actual prepared-promotion capability and its fresh checking task through
Window apply acknowledgment; only bounded original update bytes and lifecycle identifiers cross the
port. Construct original NetworkLogin inside the Worker, fulfilling its signed passkey challenge on
the Window without exporting its session/grant state. Reuse the existing actual context fence/rebind
protocol for manual authority refresh and baseline conversion. This is an internal functional bridge;
it does not activate a new scheduler or claim input latency. The sender-closed regression must prove
acceptance of every source in the specific new edit: idle can also mean publication batching.
[Evidence and limitations](performance-experiments/2026-10-28-worker-owner/phase177/README.md).

## 2026-10-29 — joined coordination preserves both physical and logical namespaces

A joined device's physical Local custody identity differs from its logical Account capture identity.
Retain original native verification, physical journal keys/database/era bindings and logical certified
source route; the Window mirror must validate both and bind UI identity to the logical actor. Because
physical equality no longer implicitly fixes logical route fields, rebind explicitly fixes workspace
and principal. A targeted missing-guard control and actual joined native/cold-reader checks establish
that boundary. [Phase178](performance-experiments/2026-10-28-worker-owner/phase178/README.md).
