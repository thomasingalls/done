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
