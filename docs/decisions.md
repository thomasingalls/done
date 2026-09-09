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
