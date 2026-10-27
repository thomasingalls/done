# done — Product Requirements

**Onboarding amendment 2026-10-14:** new Local lists open automatically with encrypted storage.
Local protection is optional; sync requires it. Existing protected Local and Account lists retain
their unlock requirements. Automatic opening makes no copied-profile confidentiality claim.
The [storage contract](./storage-contract.md) defines the custody transition and removal boundaries.
Goals and Next retain their names. Remembered unlocking and the mascot remain separate work.

**Status:** v9 — current and normative. Supersedes v8 in full, consolidating it with the settled product and
architecture decisions recorded in `docs/sessions.md`.
**Date:** 2026-08-17
**Audience:** the author, and any agent implementing or reviewing one part of this without reading
the rest.
**Companion to:** [TRD.md](./TRD.md)

---

## How to read this

**Each subsection is written to be read alone.** It states its invariant, what the user sees, what is
deliberately not promised, and how it behaves when something fails or the lifecycle moves — and it
repeats whatever it needs from elsewhere rather than pointing at it. The repetition is deliberate: an
agent implementing device revocation should not have to reconstruct the honesty rule, the key rotation
and the lapse semantics from four other sections first.

**References resolve inside this document unless they say TRD.** `§7.4` means §7.4 of this document;
`TRD §4.5` means §4.5 of the technical requirements, which is the sole companion — there is no earlier
technical draft to reconcile against and nothing here describes one. Where a subsection ends with a **TRD**
line, that line names where the companion carries the requirement, or what it still leaves open. It never
asserts that the companion is behind: the two documents are reviewed together and land together.

**No decision register appears here.** `docs/sessions.md` records the options, arguments, withdrawn answers and
history behind the settlement consolidated into this document. Use it to re-open a decision on the evidence it was
made on. It is not the place to find out what is currently true: this document is normative and the record
preserves the reasoning.

**This document stands alone.** It cites no plan, ordering or schedule, and nothing downstream of it may become a
premise for it. An ordering document reads this one; this one does not read it back. The only upward reference
here is to the companion TRD, and the only backward one is to the decision record above.

---

## 1. Terminology

Nine concepts. Picking the wrong level is the whole category of bug this vocabulary exists to prevent —
a list that says "You" is asking a different question from a list that says "last synced from".

| Term                      | Answers                                                                    | Example                                  |
| ------------------------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| **Account**               | your _optional_ relationship with the service                              | contact, account recovery, billing if any |
| **Local user slot**       | whose retained local state this person may open on this installation       | Thomas's closed slot on a shared laptop  |
| **Principal**             | which human several devices belong to                                      | you                                      |
| **Workspace**             | which content root and authorization boundary                              | your list and its grants                 |
| **Workspace content root**| the synchronized, persisted data set a workspace holds                     | the master list plus every day's collections |
| **Member**                | a workspace-scoped grant for a principal or an agent, carrying capabilities | you as owner; an editing agent           |
| **Actor**                 | the concrete identity attributed with a write                              | you-on-your-phone; an agent; the system  |
| **Device**                | which install                                                              | your phone                               |
| **Session**               | which tab, this run of it                                                  | the tab you are looking at               |

**Principal** is an unnamed human identity that groups its actors. It exists from local genesis even
when it groups only one actor, and for most people it only ever groups one. No account and no server is
required for it to exist; what an account adds is the ability to bind a *second* device to it. This is
what "you" means in any list, and what a caret's colour identifies.

**Member** is a relation, not another word for a writer. It connects a principal or an agent to a
workspace and carries capabilities such as read or edit. Membership deliberately does not attach to the
account, so admitting an agent does not require inventing an account for the agent.

**Actor** is narrower than "anything that can write". A human actor is the writing identity for **one
member on one device**; one install can carry several. An agent actor acts for an agent member and may
have no device at all. The system actor is not a member: it is a constant used for app-generated
operations — compaction, import, bulk resolution — authenticated through an authorized credential when
those operations replicate.

**Device** is a browser profile, not a machine. Chrome and Firefox on one laptop are two devices. Two
Chrome profiles are two devices. A private window is a third.

**Local user slot** is a device-local privacy and selection boundary containing the workspaces,
principals, credentials and keys one person may use on that installation. It is not another synced
identity and makes no claim about identity anywhere else. It may hold two principals; sign-out closes
the whole slot; a different person never reaches its workspace picker merely by becoming the active
account.

**Workspace content root** is the synchronized and persisted unit. "Document" stays narrower and means
the master-list surface; Next, Scheduled and Done are collections. One workspace holds exactly one
content root.

**"Freeze"** is a UX rule: a surface becomes read-only. **"Compaction"** is a storage optimization with
no user-visible effect. They are deliberately independent — see §4.4.

**"Room"** is transport vocabulary and must not become architectural. The product word is **workspace**.
The wire may keep "room" if the transport insists; nothing above the wire may.

**Local** and **Account** are configuration labels defined in §2.3. They describe a workspace's service
relationship, never a person, a device or a session.

---

## 2. What this is, and where its boundary sits

### 2.1 The product

A local-first PWA that reifies a task-management workflow the author already practices. It is not a
general task manager and should not grow features to become one. Four moving parts:

1. **A master list** of tasks and projects, loosely structured. No forced hierarchy, no mandatory
   metadata, no required dates.
2. **A Next list** for the current day: at most **three** items, task-shaped rather than project-shaped.
3. **A Done record** for the current day, of _what actually got done_. What lands here is often not
   lifted from the master list — frequently it's a subtask, incidental work, or something that only
   became visible once the day started.
4. **Scheduled items** attached to specific days, today and forward.

The entire value of the tool is in how well it supports **writing and reading text**. Everything else is
subordinate.

### 2.2 One person per workspace; many isolated people per service

**Invariant.** A workspace has one human owner. The service is multi-tenant; a workspace is not.

**What the user sees.** Their own list, their own devices, and no evidence that anyone else exists.

**Not promised.** No human collaboration: no sharing, no invitations, no comments, no second human in a
workspace. That is a separate product decision requiring its own document, and it is not reached by
growing anything here.

Two axes that are easy to run together, and must not be: **many isolated principals may each hold an
account and a workspace without any two humans sharing one.** An individual service account is
not a "multi-user account". Agent membership is anticipated (§5.8); another human joining is not.

**Failure and lifecycle.** The architecture must not make human sharing impossible — capacity in the
model, restraint in the interface (§2.5) — but nothing about the current product may be shaped as if it
were coming.

**TRD.** TRD §2 and TRD §7.2 carry the relay this implies: one that authenticates per credential rather than
through a single shared bearer token, which cannot separate tenants at all, and whose threat model is a
multi-tenant service rather than "one person's task list". See §7.5 below.

### 2.3 Local and Account

**Invariant.** The label is derived from exactly one fact: **does this workspace have a live service
authorization lineage?**

| Label       | Meaning                                                                              | Does **not** imply                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Local**   | No live service authorization lineage — either never established, or permanently retired | Plaintext storage; a single device; a particular epoch; that no other independent local replica exists                 |
| **Account** | A live service authorization lineage attached to an account                          | An authenticated session, active billing, an extant hosted copy, working sync on this replica, or an attached grant   |

**What the user sees.** Nothing, in the ordinary case. Local is the complete application and asks for
nothing, ever. Account is what you get by creating an account, which is what you do when you want your
list on a second device.

**Not promised.** The labels are not rungs on a ladder and not a status the app displays as a badge. They
do not track billing, hosted bytes, login state or whether this particular device is still enrolled.

**The internal state is the product of six independent axes.** None may silently stand in for another:

| Axis                              | States                                                              | What changes it                                                              |
| --------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Current authorization lineage** | never established · live · retired                                  | account creation, account deletion, migration                                |
| **Hosted content**                | absent · current · retained read-only snapshot · expired            | first upload, lapse, resumption, retention expiry, deletion                  |
| **Service entitlement**           | active · grace · suspended · ended                                   | billing or service policy; never identity                                    |
| **Replica grant/attachment**      | local-only · enrolled/attached · revoked/detached · removed          | enrollment, revocation, local removal                                        |
| **Local user slot**               | active · signed out/closed · removed                                 | slot unlock, sign-out, remove-from-device, whole-device reset                |
| **Account session**               | authenticated · expired · signed out                                 | login/session management; never workspace custody by itself                  |

Three consequences that fall out of keeping them apart, and each has been got wrong at least once:

- A **lapsed** account whose hosted content has expired is still **Account**, because its lineage is live.
- **Account deletion** produces Local replicas with a *retired* lineage — which is a different fact from a
  lineage that was never established, and a signed terminal record is what preserves the difference.
- A **revoked device** holds a detached local copy of a workspace that may still be Account everywhere
  else. Calling that copy Local would confuse a replica's attachment with the workspace's global state.

**Failure and lifecycle.** Every transition is enumerated in §6 — genesis, promotion, start-fresh,
enrollment, sign-out, remove-from-device, revocation, lapse and expiry, deletion — except **migration**,
which changes the same axes and is enumerated with the rest of service continuity in §8.5. Two constraints
hold across all of them:
**Local is free and permanent** — an account is never required to keep using the complete local
application on one device — and **hosted synchronization requires an account**, because a server-held copy
needs a stable identity to attach to, a credential to retrieve it, and somewhere to keep revocation state.

Whether hosted sync is free, paid, bundled or metered is a business-model question that is deliberately
open (§11). Nothing in this document may be written to depend on its answer.

**Peer-to-peer is not built** — not as a configuration, not as a second authorization path, and not yet as
a transport optimization. It would return only beneath the one envelope protocol, never as a tier or a
pricing boundary, and only on measured evidence that relay egress is worth attacking, that real
phone-and-laptop device pairs are simultaneously reachable often enough, and that a failed direct path
falls back without changing document meaning.

**TRD.** TRD §7.1's `SyncProvider` null-implementation default is what enforces this: a workspace with no live
lineage constructs no provider at all, and the full suite runs with the provider absent.

### 2.4 Eight properties, not one promise

**Invariant.** "Local-first", "synced" and "backed up" are each three or four of the following at once. A
claim assembled out of them is not testable, so the product makes these claims separately.

| Property                 | The question it answers                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| **Local availability**   | Can an existing installation read and write with no network and no service?                |
| **Synchronization**      | Can changes move between devices, including devices never online at the same time?         |
| **Durability**           | Do usable bytes remain after one — or every — local device is lost?                        |
| **Recoverability**       | Does the user hold both the ciphertext and the means to turn it back into a workspace?     |
| **Portability**          | Can another program read the data, and can another installation of this one import it?     |
| **Service independence** | Can the user continue after the app origin, relay, account service or company disappears?  |
| **Safety**               | Can an unauthorized or revoked credential produce an accepted future write?                |
| **Confidentiality**      | Who can turn stored or transmitted bytes into plaintext?                                   |

**Where the two configurations land:**

| Property             | Local                                                       | Account                                                                                                 |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Local availability   | Yes                                                         | Yes — never awaits a *network* credential                                                               |
| Synchronization      | No live service path                                        | Relay-mediated while entitlement, hosted state and this replica's grant permit it                       |
| Durability           | Surviving local replica(s) only                             | Encrypted hosted copy while current or retained; otherwise surviving replicas only                      |
| Recoverability       | A surviving replica or export                               | A surviving content-holding device; otherwise only while ciphertext **and** an independently unsealable recovery private key both survive |
| Portability          | Markdown export; import is owed                             | Same, plus a fidelity archive                                                                           |
| Service independence | Existing install: **total**. Reinstall/recovery: needs the survivability package | Requires the survivability package                                             |
| Safety               | No live admissions; lineage never established or terminally retired | Live service authorization, signed epochs, revocation                                           |
| Confidentiality      | Ciphertext at rest, opened locally                          | End-to-end; the relay holds ciphertext; live presence metadata is relay-visible and ephemeral           |

**Not promised.** The combinations that mislead, each of which has caught a draft of the design:

- A cloud copy improves **durability** without improving **recoverability**. Ciphertext whose content-key
  wraps or recovery private key are gone is not recovered data.
- Plain-Markdown export provides **portability** without preserving CRDT identity or continued
  **synchronization**.
- A cached PWA provides **local availability** on a device that already has it, and no way to install on a
  replacement device.
- Peer-to-peer would provide **synchronization** without providing **service independence**.

**Failure and lifecycle.** Recoverability at Account is conditional, always: *you can recover this, with
the code you saved*, never *we can recover this for you*. Anything the product says about the hosted copy
has to carry that dependency in the same breath as the reassurance, because the two readings differ only
for the user who has lost everything — the only user who will ever test the sentence (§7.10).

Service independence is highest at **Local**, for an installation that already exists. But the property
includes surviving the loss of the app origin, and a Local user who clears their browser store or replaces
their laptop needs somewhere to install from. The honest split: *existing installation, total independence;
reinstallation and recovery, dependent on the survivability package* (§8.4).

### 2.5 Capacity in the model, restraint in the interface

**Invariant.** The architecture represents more than the interface reveals, and the gap is deliberate.

**What the user sees.** Inside an active local user slot, a principal is presented with exactly one home
workspace at a time. There is no workspace creation flow and no management UI. Where a slot holds more
than one workspace, a picker appears and nothing else does (§6.8).

**Not promised.** Multi-workspace *navigation* — several live, synced, possibly shared workspaces reached
through memberships, with invitations and permissions — is reserved for the human-sharing document and must
not be reached by growing the local picker into a membership list. The two look identical in a list and are
nothing alike underneath: one asks *which of my old lists*, the other asks *which of the workspaces I am a
member of*.

| Relationship                             | Cardinality                                           |
| ---------------------------------------- | ----------------------------------------------------- |
| account → principal                      | 1 : 1                                                 |
| principal → home workspace               | 1                                                     |
| principal → membership                   | **many** (reserved; one is revealed)                  |
| membership → principal or agent          | exactly 1                                             |
| agent → membership                       | **many**                                              |
| membership → workspace                   | exactly 1                                             |
| workspace → content root                 | 1                                                     |
| workspace → membership                   | **many**                                              |
| device → local user slot                 | **many**                                              |
| local user slot → principal              | **many**                                              |
| local user slot → workspace              | **many**                                              |
| local user slot → live account binding   | 0 or 1 — retired evidence is not a live binding       |
| device → principal                       | **many**                                              |
| device → human actor                     | **many** (one per human membership represented on it) |
| principal → human actor                  | **many** (one per membership × device)                |
| human actor → membership                 | 1                                                     |
| human actor → device                     | exactly 1                                             |
| device → session                         | **many**                                              |
| session → device                         | exactly 1                                             |
| device → workspace stored                | **many**                                              |
| active local user slot → workspace shown | 1, selected where that slot holds several             |

**Failure and lifecycle.** Building the 1:1s as invariants would make human sharing a rewrite. Revealing
only the home workspace makes it a feature.

**TRD.** TRD §4.2 describes one workspace content root and states the constraint that follows: the tree it
draws is *a* workspace rather than *the* workspace, so a device may hold several of them in separate stores, and
every code path addressing one takes a store handle (§6.7 below).

---

## 3. Design principles

Ranked. When two conflict, the higher wins.

1. **Text entry is the product.** If a feature makes the editor worse, the feature loses.

2. **Structure is opt-in, never demanded.** Never block the user from writing something down because they
   haven't said what kind of thing it is.

3. **Offline is the normal state, not a degraded one.** No spinner, no reconnecting banner, no read-only
   mode when the network is gone. Precisely: **nothing on the read or write path may await a _network_
   credential.** The qualifier is load-bearing in both directions — an expired session must degrade to
   "sync is offline" and never to "the app is locked", and a purely *local* unlock ceremony is not a
   network wait and is therefore not forbidden by this principle (§7.2).

4. **Your data outlives the app.** Plain-markdown export is a requirement, not a checkbox — and so is
   **import**, on equal standing. An export without an import preserves the writing and not the continuity
   of the application.

5. **Constraints are the feature.** The three-item cap is not a limitation to work around; enforcing it is
   a core function — by refusing the fourth item, never by rearranging what is already there. The cap binds
   the paths that *author*; it does not bind replication, so a day may legitimately hold more than three
   (§4.1).

6. **The past is written, not read.** The value is in the act of recording, not in the archive. Assume
   history is essentially never revisited. This is why the freeze has no escape hatch (§4.4), why
   compaction is safe, and why retrieval is weighted toward recent days and the master list rather than
   deep history (§10).

   **This is a statement about user behaviour and what to build for it. It is not an integrity or retention
   rule**, and it has already been misread once as licensing the product to display an author it can no
   longer verify. It does not license that. What it licenses is *retiring* a claim — which is exactly what
   destructive compaction does, by deleting the cards that carry authorship (§7.4).

7. **Don't build a calendar.** The author has one. Nothing here tracks deadlines, durations, reschedule
   counts, or completion rates.

8. **The user never manages workspaces, and never chooses between them until their active local user slot
   holds more than one.** It is not a task to make pleasant; it is a task to remove. Anything requiring a
   person to know what a workspace is, name one, reconcile two, or copy one between devices has failed.

   **One verb is permitted, under one condition.** *Select* — choosing between local workspaces one person
   already holds in one slot — is allowed once that slot holds more than one, and it reads as an account
   switcher rather than as storage administration. **Name, reconcile and administer stay absolute**, and
   they are what "know what a workspace is" actually consists of.

   The corollary, worth stating because it cannot be fully achieved: **security cannot be hidden as
   completely as workspace management can.** This product's irreducible security surface is exactly three
   screens, and each addition must name the requirement that forced it — the list of your own devices, the
   recovery surface, and device-lock enrollment for anyone who opts into it. That other systems have a
   fourth is not an argument for a fourth here.

   Where the app seems to need the user to choose between workspace states, **the first question is whether
   anything in the model already determines the answer**, and the second is whether the states are genuinely
   in conflict or have only been made to share a store. An apparent exception to this principle is usually a
   missing rule.

9. **The interface never promises anything about a remote device that cannot be kept.** No auto-hiding a
   member as though they were gone, no "removed" that does not remove, no presence claim that outlives the
   connection it was inferred from. Where the truth is unknown, show it as unknown — a muted colour for a
   device not seen in a while is honest; omitting it is not.

---

## 4. The workflow

### 4.1 Documents vs. collections

The central structural decision, and the answer to "how much structure where."

One surface is a **document**. The unit of interaction is the whole text; you write prose in it; structure
is whatever you typed. Strong structure makes it worse.

- **Master list** — freely-structured markdown outline. Everything: tasks, projects, someday-maybes,
  notes-to-self. Nesting allowed, never required.

Three are **collections**. The unit of interaction is the _item_. They have a cardinality rule (Next takes
at most three), membership that moves between them, per-item state, and per-item interaction.

- **Next**, **Scheduled**, **Done**.

A day shows them in the order **Next, Done, Scheduled**: what you are doing, what you did, and the tail of
intentions that have not come up yet. **Done reads newest-first** — whatever was completed most recently is
on top, and a record you only ever add to is read from the top. Next and Scheduled are ordered by intent
rather than by time and keep the order you put them in. All three collections can be reordered on
writable days, using the visible grip on touch or desktop, arrow keys on the grip, or a touch/pen
hold followed by a drag. The grip remains available on mobile.

**The cap bounds what you can add, not what a day can hold.** Three is a rule about the act of putting
something in Next, and it is enforced by refusing: at three, the app does not take a fourth. It is not a
length a day is trimmed back to. Two devices that have been apart can each have filled Next legitimately —
each was under the cap every time it accepted a card — and when they meet, the day shows all of them.
Keeping them is the decision: they are things you wrote, on your own devices, and relocating half of them
would be the app overruling one device's afternoon on behalf of the other's. The rule itself does not
soften. **An expanded Next accepts nothing new until it is back under three**, and the way back is to move
items to Scheduled by hand, one at a time — the same deliberate act the cap exists to force.

**The cap binds authoring, not replication, and that is deliberate.** Remote updates never consult it, so
*n* synced devices can produce up to *n* × 3 Next items on one day and the interface shows what is there.
An over-cap day is a true statement about what several devices did rather than a defect to repair. Import
sits on the replication side of that line for the same reason it sits outside the freeze (§8.2).

**Done's order is part of the record, not a way of drawing it.** Newest-first is what makes the list
readable, so it has to survive replication rather than only hold on the device that did the writing: a day
assembled from two devices reads as one record of what got done, with each device's completions still in the
order that device completed them. Where there is genuinely no order to preserve — two devices finishing
something in the same moment with no connection between them — the app may pick one, but it must pick the
same one everywhere.

Collection items are **cards**: an independently-editable block of markdown with its own chrome. Within a
card, the first line is the **title** (high contrast) and everything after is the **description** (lower
contrast). This is presentation over markdown, not a schema — the card contains ordinary text.

Everything remains markdown at the bottom. The difference is only whether the app tracks identity and
ordering for you, and it does that solely where the workflow demands it.

**TRD.** TRD §4.2 (the workspace content root), TRD §4.3 (why collections are arrays), TRD §4.9 (section
order, and where an arrival lands).

### 4.2 Item movement

Moving items between surfaces is the workflow's actual mechanic, so flows are specified by difficulty on
purpose.

| From → To                        | Difficulty                   | Flow                                                                                                    |
| -------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| _nothing_ → Done                 | **Trivial. Non-negotiable.** | Persistent compose field at the foot of Done. Type, Enter, done.                                        |
| _nothing_ → Scheduled            | Trivial                      | Persistent compose field at the foot of Scheduled, including when empty. Type, Enter, scheduled on the focused day. |
| Next → Done                      | **Trivial.**                 | One gesture on the card. Single atomic move.                                                            |
| Next → Scheduled                 | Easy                         | One gesture on the card. Also the only way back under the cap once sync has expanded Next (§4.1).       |
| Scheduled → Next / Done          | Easy                         | One gesture.                                                                                            |
| Master → Next / Scheduled / Done | Explicit Copy or Move       | **Copy** keeps the original; **Move** transfers the selected lines in one undoable action. **Remove** remains independent. |
| Done → editable                  | **Deliberately hard**        | Long-press or explicit unlock. See §4.3.                                                                |
| Done → Next / Scheduled           | Deliberate                   | Unlock the card, then use Next or Later. Next remains disabled at the three-item cap.                    |
| Any collection → reordered        | Deliberate                   | Drag the visible grip with touch/mouse, use its arrow keys, or hold then drag on touch/pen. Writable days only. |

**Duplicate** on a live card in Next, Done or Scheduled creates a new Scheduled card on the
same writable day, preserving the complete multiline Markdown and leaving the source unchanged.
It is one undoable action with a new card identity and the source ID as item provenance. A locked
Done card can be duplicated without unlocking because its writing and membership are unchanged.
Creation still passes storage admission and frozen-day checks.

The master list is **not** expected to stay 1:1 with what appears in daily views. Copying out of it does not
remove from it. Clearing completed items from the master list is **manual only** — no auto-archive.

**Product trial, 2026-09-16.** Goals defaults to Copy. A Copy / Move selector shares the three destination
buttons and returns to Copy after a successful transfer. Move removes only lines that become cards,
and refuses the entire transfer when the destination cannot accept them all or the selected source
has changed before admission. One Undo restores the source and removes the destination cards together.
In either mode, Next is disabled unless every selected item fits on the focused day. A “…” menu beside
the Copy / Move selector contains workspace Undo, Redo, and Remove selected lines. The menu opens above
the footer so the destination buttons stay in place and the footer stays at two rows on mobile.

**TRD.** TRD §4.7 (movement operations).

### 4.3 Done items are guarded

Done is a record. Once written, editing it should require intent.

Creation is easy and editing is hard, and these don't conflict because they're different affordances. A done
card renders as static text and does not become editable by tapping it; unlocking is a stationary long-press
(mobile) or explicit action (desktop). Moving after the hold reorders the card instead. Meanwhile the compose
field is always live at the foot of the list, so recording something new is a single uninterrupted keystroke
path.

While unlocked, a Done card also offers Next and Later to correct its placement. Focus can move from the
editor to those controls without relocking; leaving the card locks it again.

**TRD.** TRD §4.4 (cards render static until focused), TRD §8.4 (gestures).

### 4.4 Days go read-only

Unfinished Next items are **left where they are** at midnight. Not carried forward, not dropped, not
prompted about.

**Freeze:** three days after its date, a day's **Next, Scheduled, and Done become permanently read-only.**
There is no unfreeze, no override, and none will be added later. Per principle 6, the past is not going to
be read again; a freeze with an escape hatch isn't a freeze.

The **master list never freezes.** It is a living document with no date attached.

**What the freeze governs is operations that author the past** — a distinction that has to be in the
sentence, because the obvious implementation gets it wrong:

- **Replication is outside it.** Remote updates never consult the freeze, so a frozen day still merges
  normally. The freeze has never been a barrier to another device's history and must not become one.
- **Every app-level write path is inside it**, for every actor including the system one. The recovery path
  declines to rewrite frozen history on purpose, and that is correct rather than an oversight.
- **Compaction is outside it, by explicit design**, and neither mechanism may consult the other.
- **Import is outside it**, because a migration import is the app reconciling histories rather than a
  person editing the past. This has to be decided rather than defaulted: an import gated the way an edit is
  gated silently discards everything older than three days, which on a ten-day export is most of it (§8.2).

Before the freeze lands, a passive indicator (dot, banner — something ambient, not modal) surfaces that
there are stale Next items in recent days, with bulk actions:

- **Move all to Scheduled for today**
- **Move all to the master list**

The three-day window is deliberately coarse so nothing depends on knowing precisely when the user's midnight
is (§4.6).

**Compaction is a separate concern.** How the app stores frozen days internally is a storage decision with
no user-visible behaviour, it happens on a different schedule, and it must never be conflated with the
freeze rule.

**TRD.** TRD §4.5 carries the three-way split above as a table, and TRD §4.5 and TRD §10.4 both record the
consequence that matters here: compaction deletes cards, therefore deletes `Card.author`, therefore **retires an
attribution claim**, so whoever re-enables it is moving a security boundary as well as a storage one (§7.4
below).

### 4.5 Layout and navigation

#### Narrow — a spatial plane

Today is the origin. Every view is a fixed direction away. No navigation stack, no back button semantics,
no nested screens.

```
                    ┌──────────┐
                    │   PAST   │   (drag down)
                    └────┬─────┘
   ┌────────┐       ┌────┴─────┐       ┌────────┐
   │  MENU  │───────│  TODAY   │───────│ GOALS  │
   └────────┘       └────┬─────┘       └────────┘
   (drag right)     ┌────┴─────┐       (drag left)
                    │  FUTURE  │   (drag up)
                    └──────────┘
```

Days run vertically, diary-style: past above, future below. Menu (calendar picker, search, settings) sits
left; Goals sits right. Movement is continuous and interruptible — the adjacent view is partially visible
during the drag, and releasing below threshold snaps back. It should feel like moving a sheet of paper, not
a page transition.

#### Gestures: swipe navigates, long-press-then-drag selects

A plain swipe anywhere is navigation, including over text. Text _selection_ requires long-press first, then
drag. Tapping to place a cursor is unaffected.

This prioritizes the frequent action over the rare one, which is right for a phone. The cost is that
selection becomes a two-stage deliberate act, and the long-press entry point overlaps the Done-card gestures
— those disambiguate by context. Long-press in live text starts selection; a static Done card arms
reordering, with movement dragging it and a stationary release unlocking it.

#### Wide — three panels

```
┌──────────┬─────────────────────────┬──────────────┐
│          │   ╰──── yesterday ────╯ │              │
│   MENU   │  ┌─────────────────────┐│    GOALS     │
│          │  │ Wed 5 Aug           ││              │
│ calendar │  ├─────────────────────┤│   master     │
│ search   │  │                     ││   list       │
│ settings │  │       TODAY         ││              │
│          │  │                     ││              │
│          │  └─────────────────────┘│              │
│          │   ╭──── tomorrow ─────╮ │              │
└──────────┴─────────────────────────┴──────────────┘
```

Today and Goals each fill viewport height and scroll internally — the page itself never scrolls or
overflows. Above and below Today, adjacent days peek through as faded, rounded, dimmed panel edges that hint
at their existence and act as click targets to move a day.

#### The Today panel header

The Today panel is **header plus scrolling body**, in that order, with the day peeks bracketing the whole
unit:

```
   ╰──── yesterday ────╯     ← faded peek, click target
  ┌─────────────────────┐
  │ ☰  Wed 5 Aug        │    ← header: pinned, never scrolls away
  ├─────────────────────┤
  │  next / done /      │    ← body: scrolls internally
  │  scheduled          │
  └─────────────────────┘
   ╭──── tomorrow ─────╮     ← faded peek, click target
```

The header shows **the date of the day being viewed**, which matters as soon as you can navigate to an
arbitrary day. **The menu trigger lives in this header**, present at the narrow and medium breakpoints and
absent at wide, where the menu is already a visible panel.

The header is **pinned** — outside the scrolling region, not merely sticky within it. If it scrolled away,
the menu would become unreachable from a scrolled position at exactly the breakpoints where it's the only
non-gesture route to it.

Ordering matters and is easy to get backwards: the yesterday peek sits _above_ the header, not below. The
header belongs to Today, so `[peek: Tue] / [header: Wed] / [body: Wed] / [peek: Thu]` reads correctly, where
header-above-peek would not.

#### Medium — two panels, menu behind the trigger

At half-screen width the menu collapses behind the header trigger. Today and Goals stay side by side; half
width is still enough for text-only content to remain usable in both.

```
┌─────────────────────────┬──────────────┐
│   ╰──── yesterday ────╯ │              │
│  ┌─────────────────────┐│    GOALS     │
│  │ ☰  Wed 5 Aug        ││              │
│  ├─────────────────────┤│   master     │
│  │                     ││   list       │
│  │       TODAY         ││              │
│  └─────────────────────┘│              │
│   ╭──── tomorrow ─────╮ │              │
└─────────────────────────┴──────────────┘
```

The opened menu overlays rather than pushes — pushing would reflow Today and Goals, and at this width
neither has room to give.

#### Keyboard

Desktop is keyboard-first: arrow keys or `h j k l` with a modifier move along the axes, `Cmd/Ctrl-K` opens a
command palette, `t` returns to today.

**TRD.** TRD §8.1–§8.5 (responsive shell, layout constraints, CSS approach, gestures, keyboard).

### 4.6 Time

Dates are stored in UTC and displayed in local time. Day rollover happens in the user's last-known timezone.
Rollover hour is configurable, but this is an affordance, not a feature.

**Any feature leaning heavily on knowing precisely when the user's midnight is requires serious
justification.** The three-day freeze is coarse enough that ±1 day of timezone ambiguity is immaterial, and
that is the standard for anything time-dependent.

### 4.7 Scheduled items

A scheduled item means **"I think I'm going to do this task on this day."** That is the whole semantic. It is
not a due date, not a calendar event, not a commitment being tracked.

Consequently a scheduled item is simply a card living in a day's collection. **The day it lives in is its
date** — there is no separate date field, and therefore no reschedule history, no slip counter, and no
distinction between cut-and-pasting an item forward and leaving it behind while re-adding it tomorrow. Both
are ordinary card operations and the app has no opinion about which you use.

One-off tasks can be entered directly in Scheduled on any writable day, independently of Goals. Enter
adds a task, Shift-Enter adds a line, and Add offers the same submission on touch.

For the same reason there is **no inline date syntax** (`📅2026-09-01`) and **no completion timestamps**
(`✅2026-08-04`) in documents. Both are deadline-tracking scaffolding for a system this explicitly isn't.
Anything the user genuinely wants to note can be typed as plain text and found by search.

**TRD.** TRD §4.6 (item identity in documents).

### 4.8 Editing experience

The bar is Obsidian's Live Preview, and it's a hard requirement:

- The document is **plain markdown, always**. What's stored is what you typed, byte for byte. No rich-text
  model, no lossy round-trip.
- Formatting renders **while you edit**.
- Syntax characters are **visible on the line the cursor is on**, hidden elsewhere.
- **Line heights must not shift** when syntax reveals or hides. Text must never jump under the cursor.

Supported: headings, bold/italic/strikethrough, inline code, code blocks, links, blockquotes, bullet/numbered
lists, task checkboxes, rules. **No images. No tables in v1** — tables are both a live-preview implementation
cost and genuinely unpleasant to author by hand, which is precisely the case agent assistance would change
(§5.8).

Behaviors that matter disproportionately: list continuation on Enter in Goals, `Tab`/`Shift-Tab` and
`Cmd/Ctrl-]` / `Cmd/Ctrl-[` indentation, checkbox toggle by click, clean selection across formatting marks.
On macOS, Option-Backspace deletes the preceding word or selection. With no selection, Cmd-X cuts
the current complete line (including its following newline when present); selected text still cuts
normally. Clipboard refusal keeps the writing. Cut waits for pending writing/composition to finish
so it cannot delete text that was not copied. Deletion remains one admitted, undoable edit. Cmd/Ctrl-Enter does not toggle
checkboxes or insert a blank line. Shift-Enter inserts an admitted plain newline.

Inside a card, **Enter finishes editing and focuses that same static card**; a second Enter reopens it
at the preceding caret. Shift-Enter adds a plain newline. **Three consecutive Shift-Enters split into a
new card**, retaining the existing split behavior on the explicit multiline gesture. Goals retains list
continuation on Enter. Escape also returns focus to the static card. Completion does not move writing or
change its Done guard, frozen-day rules, storage admission or undo history. Outside focus movement consumes any split/merge focus
request, so leaving by mouse or Tab cannot reopen the editor or reclaim focus.

**TRD.** TRD §5 (editor).

### 4.9 Long-document navigation

The master list is expected to become long. That is not evidence that it should become a set of documents:
choosing a document, its name, and the granularity of the thought before writing is exactly the
organizational cost the one-document model avoids. The distinction is when structure is demanded:

- Multiple documents ask **where does this belong?** before writing.
- A temporary view asks **what do I need to see?** after the text and its optional structure already exist.

So the master list remains one physical markdown document and gains projections over that document as its
authored structure earns them. Writing never requires choosing a projection first, projections never create
another source of truth, and returning to the whole document is one action rather than back-navigation
through a stack.

The ordered product sequence is:

1. **Location — scroll-aware breadcrumb and heading outline.** The pinned Goals title shows the heading
   ancestry of the text at the top of the viewport. It follows scroll position, not the cursor, so editing
   does not move the user's location label. The title eventually opens an outline derived from the same
   headings; choosing a heading navigates without changing the document or opening the mobile keyboard.
2. **Attention — explicit section focus.** A heading subtree can become the temporary visible working set.
   The title bar shows its ancestry and provides the one-action route back to any ancestor or the whole
   document. Navigating to a heading and focusing it are distinct actions: finding text must not silently
   change the shape of the editor around it.
3. **Progressive disclosure — heading folding.** Manual folds hide a heading's subtree without changing
   markdown. Everything begins expanded. Focus may remove enough noise that extensive fold-state management
   is unnecessary, so folding follows rather than precedes it.
4. **Lifecycle — archive as a destination.** Archiving deliberately moves selected markdown or a heading
   subtree to an archive area at the bottom of the same document. It is not automatic, not an invisible
   status flag, and not a second store. Archived text remains exportable and, when search arrives,
   searchable; its default presentation may be de-emphasized or collapsed.
5. **Retrieval — search.** Search over the master list and recent days is Phase 4 work. It answers a
   different question from the outline: known text rather than authored structure.
6. **Trust — observe duplicates without inventing task identity.** Exact or similar occurrences may
   eventually be surfaced for review, but are never automatically merged. Similar lines can be separate
   intentions, contextual reminders for one intention, or accidental copies. The app must not claim that a
   master-list line is complete merely because similar text appears in Done.

The last constraint marks a product boundary. Authoritative completion propagation, duplicate merging, or
relationships between occurrences require stable task identity. That would turn the master list from a
document containing intentions into a task database rendered as text. Do not cross that boundary as a side
effect of improving navigation; make it as a separate product decision if accumulated use eventually
justifies it.

**TRD.** TRD §8.6 (long-document projections).

**Selected 2026-10-25 — gentle context.** Goals retains the same formatted, editable document.
The caret's current heading section and its two nearest authored heading ancestors stay clear;
unrelated writing becomes quieter without hiding or reflowing it. Selected text remains clear.
When the caret is outside the visible editing area, ordinary contrast returns throughout the view.
“Gentle context” is on by default and has an immediately applied settings-sidebar toggle for this
browser. Unavailable preference storage affects saving that cosmetic choice, never writing.
The root word Goals opens the whole page outline without an icon. A caret immediately after Goals
lists all H1 headings. Each heading word navigates to it; its following caret lists its immediate
authored children, preserving order and skipped heading levels. Leaf menus report no subsections.
Choosing a menu row navigates there and keeps the menu open at that heading's child level. Duplicate labels include ancestry and line location in the local
menu. These controls scroll without moving the caret or opening the mobile keyboard. Document
changes dismiss an open menu rather than reuse stale heading positions.

This is separate from inherited heading labels on cards. It does not select automatic folding or
a separate scanning mode, and does not alter text, placement, attribution, undo or synchronization.

### 4.10 Goals heading context on cards — selected 2026-10-25

Cards copied or moved from Goals retain a snapshot of the source item's authored heading ancestry.
The selected heading itself is not its own parent; list nesting does not invent additional tags.
The path appears beneath card writing, without a leading icon and without restyling the card.
Existing line-based transfer granularity remains; whole-subtree transfer is a separate follow-up.

“Goals breadcrumbs on cards” is on by default in the account settings menu. It hides or shows paths
in this browser, without deleting them or changing future capture. Directly composed and existing
unlabeled cards have no inferred path; never backfill by matching equal text. Source renames and
reorganization do not rewrite historical snapshots. Bounds or incomplete parse coverage omit optional
context while preserving the requested writing transfer.

Moves, duplication and splitting preserve captured context on supporting clients. Merging different
or labeled/unlabeled contexts clears the ambiguous path; undo restores the original metadata.
The context is advisory provenance, not task identity, attribution, access authority or a live backlink.
Older clients can ignore or omit this optional metadata and do not implement its merge policy; writing
and existing protection remain compatible. Full cross-version metadata fidelity is not promised.

Snapshots live with encrypted workspace content and sync through its existing admitted path. Browser
preferences hold only the display Boolean. Export keeps Markdown unchanged and adds an optional
versioned goals-context.json sidecar identifying the exported file, section and zero-based card index.
The sidecar is portable data, not a new import/restore promise or an automatic return-to-Goals command.

---

## 5. Identity, attribution, sessions and presence

This section replaces the former "Actors" section in full. One user is not one actor, and never was.

### 5.1 The principal is what "you" means

**Invariant.** A principal exists from local genesis, groups every actor the person writes through, and
requires no account and no server to exist. What an account adds is the ability to bind a *second* device
to it.

**What the user sees.** "You", everywhere a human is named. One entry per person in every ordinary list,
whatever device the writing came from, however many devices there are.

**Where the name and the colour live, since exactly one surface owns them.** Both are facts about the
**person**, not about the install, and the settings menu is where they are changed — the same menu that
edits them today, reading one level up. Before an account there is no name to change: "You" is what every
list says, and only the colour is set, generated and editable. Account creation is where a name first
exists (§6.1), and **it is editable afterwards like any other setting** — asking once is a rule about when
the app *demands* an answer, not a rule that the answer is frozen. The device name is a separate axis with
a separate home, the device list (§6.4), because it answers a different question for a different audience
(§5.2).

Colour reaches the person level by dependency rather than immediately: it is stored per actor today, so it
is one colour per device until enrollment gives it a principal to hang on, which is the same dependency
the caret rule carries (§5.5).

**Not promised.** The principal is not an account and never becomes one. It is not named at first run, not
named at first sync, and carries no address, credential or service relationship. Most principals never
acquire an account at all — local-only is the whole free product, and principal-without-account is the
steady state rather than a transitional rung.

**Not promised.** Editing a name or colour is the whole of the identity surface. There is no roster to
administer, nothing to add or remove, and no actor management of any kind (§9).

**Failure and lifecycle.** The principal survives events that end service relationships. Deleting an
account retires the workspace's service lineage; it does not retire the person. Each device keeps its
principal, its actors stay grouped under it, and cards written on the phone still read as **You** on the
laptop. The alternative — minting a fresh principal per device at deletion — would orphan every actor
entry already written and reproduce the roster of duplicate "You"s that this model exists to remove.

What must be said out loud at that moment is the other half, and the two are separable: **the same person,
no longer the same list.**

**TRD.** TRD §4.8's storage split carries the principal row. The actor roster syncs; the local actor/device
binding does not, and that is deliberate — each install must know which credential and actor it actually
controls rather than trusting the roster, which TRD §4.8 also rules out as evidence of anything.

### 5.2 The actor is per member, per device — always

**Invariant.** A new device is a new actor. Always. Browser, profile, phone, computer: each install that
writes gets its own writing identity, and none of them ever claims another's. A human actor is the writing
identity for **one member on one device**, so one install can carry several.

**What the user sees.** Nothing. Actors are internal. The device is never disclosed to another principal
and never appears in the ordinary presentation of who is present or who wrote something.

Your own devices are shown to you deliberately, in exactly three places:

| Surface                     | Shows the device to you   |
| --------------------------- | ------------------------- |
| "Last synced from ⟨device⟩" | Yes, in the ordinary case |
| Merge provenance mode       | Yes, deliberately, rarely (§5.7) |
| The device list             | Yes, and it must (§6.4)   |

**Not promised.** There is no mechanism to claim an existing actor, merge two, or pick "which of these is
me" from a roster. Picking from a roster is trivially impersonable and incompatible with authenticated
attribution; a device is never asked to pretend to be another.

**Not promised.** Actor and device are **not** one fact stored twice, and their identifiers must not be
merged. A device may host several principals, so one install can carry several human actors. The 1:1 that
holds today holds only because there is exactly one member per install today.

**Failure and lifecycle.** Where storage is denied or evicted, a new actor and a new device are minted
silently, and if that context ever syncs, each leaves a permanent entry in the roster. That is a real
defect and its resolution is §6.11, not a graceful degradation to design around.

Roster entries are never auto-pruned: a person, agent or actor never silently disappears from a list
because the app inferred they were gone. Showing staleness is honest — a device not seen for a while may
be **muted** rather than removed — and the surfaces that can carry staleness are the ones that have
devices on them, which is the device list and the authorization roster. Person-level lists have nowhere to
put it: five devices of which three are stale are still exactly one "You".

Deleting a roster entry would remove the *name*, never the attribution. Cards carry an actor id. There is
no version of pruning that unwrites history.

**Naming.** "Actor" is being asked to carry both *who is writing* and *which install is writing*. A working
name for the human per-install kind is owed before it reaches the UI (§11).

**TRD.** TRD §0's Actor row and TRD §4.8 carry the per-member-per-device formula, that an agent actor may have
no device, that the system actor is not a member, and the prohibition on merging the actor and device
identifiers.

### 5.3 Attribution is authenticated

**Invariant.** **Every mutation admitted to the shared lineage is authenticated by a credential authorized
at the referenced authorization epoch. Its attributed actor is derived from that credential, or is an actor
that epoch explicitly authorizes the credential to represent.**

**What the user sees.** "Written by" means what it appears to mean. Cards record their author, and that
record is evidence rather than a label.

**And it stays evidence after the history that produced it is gone**, which is the part that needed work
(`S0-5`). The record lives in the shared document, and a document entry can be overwritten by anyone who may
write to the document — so a compromised device could replace an author entry with one naming itself, sign it
perfectly well, and once older history had been trimmed away nothing remaining would contradict it. **A card's
identifier is therefore derived from its creator**: a different device produces a different card rather than a
replacement claim on an existing one. Nothing has to be kept in order to check it, which is exactly why it
survives the trimming that defeated the previous arrangement.

**What that does not change.** A card edited after creation still reads as *written by X, and edited since* —
the honest answer, and unchanged. Attribution remains card-level. Nor does this make a first author
undeletable: a card and its authorship are destroyed together or not at all, and whether a card may be
destroyed remains a separate question (§4.5's paused compaction).

The indirection is deliberate and covers three cases that "actor equals signer" would collapse:

- A **human** write is signed by a device credential and attributed to the human actor bound to that device
  and membership.
- An **agent** write is signed by the agent member's own credential and attributed to its agent actor. It
  needs no device.
- A **system** operation — compaction, import, bulk resolution — is not a member at all; an authorized
  device, agent or hosting credential may be granted the narrow ability to represent the system actor.

**Not promised.** Attribution granularity is **card-level**. The master list is not attributed per
character: that would require a parallel mark structure maintained alongside every text edit, real cost on
the keystroke path, for a question nobody asks until an agent is actually editing prose (§11).

**Not promised.** Nothing about attribution is recoverable from a CRDT update stream. A transaction origin
is an argument the *receiver* supplies locally and is never encoded in the bytes; what the bytes carry is a
client id that is random per document instance — per tab, per page load — identifying neither a device nor
an actor durably. Any design that assumes coarse attribution can be recovered from update bytes is assuming
a guarantee that does not exist.

**Failure and lifecycle.** Authentication is a property of the **transport boundary**, not of local
storage. Three consequences:

- The synchronous crash journal stays unsigned, and that is correct: it never leaves the device, and an
  attacker who can write your local store can write your JavaScript.
- **Local replay must not verify.** Verify at receipt, trust the disk thereafter, and the load path is
  untouched — otherwise cost lands on cold start and grows with history.
- **Source-authenticated envelopes are preserved end to end.** No relay, store or future transport may
  combine mutations from several credentials into new bytes and sign the result as itself. A source may
  batch its own mutations when actor, credential and epoch are the same; forwarded mutations retain their
  original envelopes. First sync therefore needs either the signed envelope history or an authenticated
  checkpoint whose construction preserves attribution.
- **A device restoring from a checkpoint checks that checkpoint's coverage itself**, rather than believing the
  claim attached to it. A signature proves who assembled a checkpoint; it does not prove the checkpoint
  contains everything it says it does, and a wrong-but-signed answer is worse than an unsigned one because it
  is believed. The one thing a restoring device cannot recompute — that nothing accepted was left out — is
  attested by another device that checked it while the evidence still existed. **Where no second device
  exists, the product says so rather than implying a second opinion it never had.**
- **A device retains its own outbound envelopes**, at least back to the last checkpoint it has seen
  admitted. Attribution lives in the envelope, so an operation separated from its envelope can never be
  re-attributed.

Signing does not sit on the keystroke path, and the shape of the API makes that hard to get wrong by
accident: `crypto.subtle.sign` returns a promise and cannot complete before a synchronous input handler
returns.

**TRD.** TRD §4.8 states that nothing about attribution is recoverable from an update stream, and draws the
three consequences: `Card.author` is forgeable without authenticated writes, a delta cannot be filtered by
signing credential, and origin is trustworthy only because it never leaves. TRD §7.4 carries the
authenticated-envelope requirement and the table of where verification does and does not run; TRD §12 budgets it
at the boundary only — envelope sign, envelope verify, first-sync checkpoint — never on the keystroke or
local-replay path.

### 5.4 Sessions and undo

**Invariant.** A session is one tab, this run of it. It is created by opening a tab, is never persisted,
and is not the CRDT's client id — that is an implementation detail, random per document instance, and is
what a naive peer list mis-counts.

**Undo is per tab, and never crosses devices.** The ceiling is the device; the floor is the tab.

**Undo is scoped to the acting actor, so system operations are never in your stack.** Compaction, import and
bulk stale-item resolution all mutate the workspace without you typing. If they shared an undo stack with
your typing, pressing undo after a compaction would revert it — silently, and days after the fact — and undo
after a bulk resolution would unwind dozens of card moves as one confusing step.

**This is why every change carries its originating actor from v1, agents or no agents.** The actor model is
not paying forward for a future feature; it is the correct solution to a problem that exists now, and it
happens to be the thing agents need later.

**What the user sees.** What every tabbed editor does. Undo in this tab undoes what happened in this tab —
and only what *you* did in it.

**Not promised.** No distributed undo, no cross-device undo stack, no undo of another device's work, and no
count of how many tabs you have open (§5.6).

**Failure and lifecycle.** A restored or resumed tab — bfcache, discard restore — must re-establish its
view, because it has no way to know what it missed. (This is tab lifecycle, not the day freeze; the words
collide and this one is the browser's.)

**Undo is an append and is not exempt from authentication.** Undo does not remove history; it appends a new
transaction whose ops invert earlier ones. That mutation crosses the boundary and is signed like any other
write. The narrower thing that is true is why undo is safe: **the undo stack is assembled from in-memory
transaction origins, which never travel.** No document content can insert an entry into your undo stack, no
matter what it claims. Origin is trustworthy precisely because it never leaves — and that same property is
exactly why it cannot serve as cross-device attribution.

One thing this forecloses: because undo appends, **undoing a revoked member's content is not a way to
exclude them.** An inverse op is just another op, and they can write again. Exclusion is key rotation
(§7.4); undo is housekeeping.

**TRD.** TRD §0 carries the Session row, and TRD §4.8 scopes undo by origin, to the local human, *in this
tab*. TRD §11's undo-scoping test — undo immediately after a compaction, an import or a bulk stale-item
resolution reverts the user's last *typed* change — is what keeps this honest as the codebase grows new system
operations, and it stays required.

### 5.5 Carets

**Invariant.** **A caret represents an input surface in the document, so it exists wherever input can
happen.** Whether the input belongs to you is not part of the test.

**What the user sees.** One caret per tab, **including your own tabs**. **All of your carets share your
colour**, because the question a caret answers is *whose is it*. Each is labelled with the person's name —
never with the device, never with the tab. Separately, **the caret where input is actually happening gets a
distinguished treatment**, and that treatment is the same for everyone rather than per-person.

Four tabs showing four carets in one colour is clearer than four colours, not less clear.

**Not promised.** No global recency modelling. "The active caret" means **locally active** — the caret in
the tab you are looking at, which is your own cursor. There is no last-input timestamp in awareness, no
cross-client agreement about recency, and no highlight that travels between devices. Each tab already knows
whether it is the one being typed in, and no tab needs to know anything about the others to render this.

**Failure and lifecycle.** Colour is currently an actor property, and an actor is per device — so "all of
your carets share your colour" holds within one device immediately and across devices only once a principal
exists to hang a colour on. That arrives with device enrollment (§6.3), by dependency rather than by choice.

A design check is owed rather than a decision: that the local native cursor reads as *deliberately* distinct
from remote-caret decorations, in both themes, rather than merely happening to differ (§11).

**TRD.** TRD §4.8's awareness plumbing is what this rides on, including the dedupe rule — by device id today,
by principal once enrollment exists, never by name.

### 5.6 The peer list, and never a tab count

**Invariant.** The peer list answers **whether someone is present**, not how many times. It is
deduplicated.

**What the user sees.** One entry per person. Not `Mac, Mac`.

**Not promised.** The app never tells you how many tabs you have open. A count may be shown only when it
explains something the user is otherwise owed *and* the justification is strong enough to write down at the
time. The preference is always to solve the underlying thing invisibly: **if a tab count is the answer, the
question was probably wrong.**

Two candidate exceptions have been examined and neither survives. A PWA that cannot update because other
tabs are open is not this app's behaviour — a downloaded release waits until all current windows close or
the user chooses **Reload to update** in the sidebar. That action saves pending writing and reloads this
tab; other tabs keep writing and receive their own reload control. Their previous hashed assets remain
cached for offline use.
Checks run on foreground, reconnect and restored-page events, without polling. A search index holding an
exclusive lock yields the useful sentence *"search is unavailable in this tab"*, which needs no count
either — and does not currently arise at all, because the first search
index is in memory (§10).

**Failure and lifecycle.** Deduplicate **by device id** while that is all there is — awareness already
publishes one, and it fixes the two-tabs case exactly — and **by principal** once device enrollment lands.
**Never by name**: two different Macs are both called `Mac`, which is why device names need disambiguating
at all (§6.4).

### 5.7 Provenance of merged content

**Invariant.** This is a post-merge orientation aid, **not document history**. It answers *which of my
devices put this here* for as long as that is a live question. It does not answer *what did this look like
last Tuesday*, and building that is a different project.

**What the user sees.** A mode that is off nearly always, enabled from an appropriately buried settings
menu. While it is on, the **off switch appears in the main interface** so it can be dismissed immediately
rather than hunted for.

**Not promised.** No document history, no timeline, no per-revision diff.

**The bound is the divergence, not the freeze window.** The merge this mode exists to explain is the one
that follows a long separation — a device offline for a month, a lapsed subscription, a service migration —
and all of its mess lands *outside* three days, where a freeze-bounded mode would show nothing. The useful
bound is *since this device last converged*, which is the same thing the merge is defined against. It stays
a bound, which is what keeps this an orientation aid.

**Failure and lifecycle.** **Cards are available now**: card creation already records an author, and a human
actor is bound to one member on one device, so "which device created this" is recoverable from that binding
with no new card data. **The master list and Goals are not**: line-level tinting there needs per-character
document attribution, which is deferred (§11). The card half is cheap and can ship with sync; the text half
waits on a different question.

### 5.8 Agents, later

**Invariant.** An agent is a **member** — a workspace-scoped grant with explicit read or edit capabilities —
not an actor that can necessarily write everything. Its writes are signed by its own credential and
attributed to its agent actor.

**What the user sees.** Nothing in v1. Later: an agent working, its edits attributed, and its changes
undoable without touching yours.

**Not promised, and this is the part to state where the feature is described rather than discover later:**

- **Agent membership requires the owner to have an account.** Admitting an agent changes authorization, only
  the service changes authorization, and a Local workspace has no service. Agents therefore live at Account
  and the free product has none. Sync requires local protection (§7.2); archive portability separately asks for
  nothing and correspondingly delegates nothing.
- **Edit cryptographically implies read.** Under one symmetric content key per generation, an agent cannot
  construct an encrypted update without the key, and a holder of that key can decrypt the document. So the
  feature may offer read and read+edit; it **must not** promise cryptographic write-only isolation. A
  nominal write-only agent could sign a *proposal* that a read-capable device validates and encrypts, but
  then it is not independently editing while that device is offline.
- **Granting an agent edit discloses the entire workspace** — every day, the whole master list — to that
  agent and to whatever service executes it. The relay is blinded by construction and the model provider is
  not. The interface that grants agent membership has to present it as what it is.
- **Permissions inside the document are not enforceable by the data layer.** "The agent may edit the master
  list but not Done" is a property of the agent's own code, enforced by trust. What *is* enforceable is
  membership and read access, cryptographically, by rotating the content key (§7.4); and accountability,
  because attribution is authenticated (§5.3), scoped undo makes damage reversible, and export makes it
  recoverable.

**Failure and lifecycle.** Removing an agent's read access rotates the content key; it keeps everything up
to the rotation and nothing newer (§7.4). The motivating case remains authoring assistance where markdown is
tedious to write by hand — tables being the clearest example, and the reason tables are excluded from v1
(§4.8) rather than permanently.

The roles, delegation rules and management UI belong in the agent feature document. What this document fixes
is the shape they must take.

**TRD.** TRD §10.6 separates enforcement from plaintext authority, which are two axes rather than one, and
names the three things that *are* enforceable without costing the relay's content-blindness: read exclusion
cryptographically, attribution client-verifiably, and accepted-write authority at the service. What remains
unenforceable is the semantic-capability case, and it is unenforceable because edit implies read — not because
the relay is dumb.

---

## 6. Accounts, devices, workspaces and lifecycle

### 6.1 What an account is, and when it is asked for

**Invariant.** The app never asks who you are until there is a service relationship to attach the answer to.
**Account creation is the only moment a name is requested**, and there is no earlier one — not at first run,
not at first peer, and not at any later device enrollment. *Requested* is the operative word: the name is
an ordinary setting afterwards and can be changed whenever the person wants (§5.1).

**What the user sees.** First run asks nothing and starts in the editor. Local genesis silently creates an
unnamed principal, a home-workspace membership, a device, a human actor and the workspace's first
content-key generation, exposing none of those concepts.

The account boundary arrives at one place only: **the moment you want your list on a second device.** At
that moment the app asks for three distinct things in one flow:

1. **A name** — a label, and the small half.
2. **An account credential** — proves identity to the service, and leaves an offline-verifiable local
   slot-unlock binding on this device. **It is a passkey rather than a password** (TRD §13.9): the ceremony is
   the device's own — a fingerprint, a face, a PIN — and there is no password to choose, reuse, or be phished
   for. This is the same refusal §7.6 makes about recovery, arriving one step earlier.
3. **A saved, re-entered, high-entropy recovery code** — seals a content-recovery power the service never
   receives (§7.6). This is the heavy half.

**Not promised.** No commercial step is implied by the account requirement; pricing is open (§11). And an
account is never required to keep using the complete local application on one device.

**Failure and lifecycle.** The recovery code makes this boundary sharper than a name prompt, and that is
accepted rather than absorbed: it is **the whole of what non-custodial costs, paid once, at the only moment
the user has a reason to care.** The alternative is not a lighter version of the same product — it is a
service that can decrypt your list, or an all-device loss that is unrecoverable.

Three things make it defensible. It is **honest** — the questions arrive with the service that needs them,
and *never ask at first run* survives completely intact for the entire free product. It is **not a
manufactured obstacle** — nothing was made worse to create it. And it is **load-bearing rather than
procedural** — unlike a name, the code is what later makes *we cannot recover this for you* a true sentence
instead of an evasion.

**TRD.** The account and authorization service is a new component, and TRD §1's summary table, TRD §7.3's
component split and TRD §13 all carry it.

### 6.2 Account creation: promote this list, or start fresh

**Invariant.** **Account creation asks the list question once. Signing in never asks it.** The account has to
be able to accept an identity that predates it — a design where signing up mints a fresh identity and attaches storage to it
cannot do this, and that is the design an ordinary implementation drifts into.

**What the user sees.** One question, on the device that has a list in front of it: *promote this list, or
start fresh.*

- **Promote** moves the Local workspace's contents into the account workspace. The existing principal,
  device identity, home-workspace membership and content root carry over; the account becomes the service
  binding rather than minting a replacement identity. The account binds fresh signing and wrapping
  credentials to that device identity.
- **Start fresh** mints a new principal and workspace and **leaves the Local one untouched** — still there,
  still openable, still exportable, one selection away in the same local user slot (§6.8).

**Not promised.** Nothing is adopted, merged, replaced, re-parented or adjudicated — at account creation or
ever. There is no preview of two histories, no merge/theirs/ours/abort choice, no confirmation of loss, no
automatic export fired as a safety net, and no "create the account on the device whose list you want to
keep" advice. There is no ordering that loses anything.

**Promotion is a move, not a copy**, and the difference is not fastidiousness. A copy leaves a stale
duplicate of the promoted list in local storage, which a user will find months later — after it has diverged
by everything they have written since — and reasonably believe is a second copy of their data. Moving means
the same workspace and database acquire the live lineage, so no earlier duplicate exists.

**Failure and lifecycle.** The one product choice has two key paths, selected from authenticated lineage
state rather than from the Local label:

- A workspace whose **lineage was never established** follows promotion: retain its existing content-key
  generation, create the first recovery keypair and authorization head, and admit its current state as the
  lineage's authenticated genesis checkpoint — the enrolling device attests the one-device history it is
  promoting, and future shared mutations use ordinary per-mutation envelopes.
- A workspace with a **signed terminal lineage record** follows migration instead: preserve its historical
  verification material, retain its recovery keypair where available, rotate to a fresh content-key
  generation, and create a new lineage (§8.5). A terminal-lineage workspace cannot use the genesis-checkpoint
  shortcut, because its historical writes already have several admitted sources.

Both read as *use this list*. The distinction exists so that broadening "Local" to include retired workspaces
does not make the promotion procedure silently apply to them.

**Promotion is a finite key and admission operation, not a data transformation.** Every workspace is already
ciphertext from genesis, so there is no whole-document encryption pass to make crash-safe. What promotion does
is: keep the workspace and its current content-key generation; create the device's signing and wrapping
keypairs; create the recovery keypair; seal the recovery private key to the confirmed code; wrap the content
generation to the recovery public key and the device's wrapping key; sign the genesis checkpoint; establish
the first authorization head; erase the unsealed recovery private key.

**Which workspace a database belongs to is a single committed fact**, and an interrupted promotion resolves
to exactly one of the two states on next launch. A half-completed promotion that leaves identity and the
content root out of step is precisely the state §6.11 says must never be manufactured.

**TRD.** Stores are keyed by _(principal, workspace)_, a device holds several at once, and no provider may
ever be constructed against a content root belonging to a different workspace — in either direction, including on
teardown, retry and error paths. **This is the single largest implementation consequence of this document.** It
is also why the store cannot merely be adapted: `y-indexeddb` persists raw update bytes and applies them back on
load, so encrypting its records makes its own load path fail on its own data. TRD §6.1 replaces it with a
first-party encrypted store keyed that way, and TRD §11.1 tests the isolation on teardown, retry and error
paths.

### 6.3 Enrollment: adding a device

**Invariant.** **Discovery is implied by signing in.** Nobody types an endpoint, a workspace identifier or a
token, on any device, ever. Sign-in *assigns* the workspace identifier, which is the strongest evidence that
the identifier belongs at the wire level and nowhere near a user.

**Enrollment has two independent gates, and they must never collapse into one:**

1. **Authorization.** Account authentication lets the service admit the new device's credential and sign a
   successor authorization epoch. No existing device needs to be online.
2. **Content-key delivery.** The new device receives a content key from an existing device or unwraps it
   with an independent recovery factor. **Service authorization alone must never cause an existing client to
   release a content key** — otherwise a malicious service could authorize its own credential and turn
   authorization authority into decryption authority through the back door.

**What the user sees.** They sign in. If an existing device is available, a short out-of-band ceremony
between the two devices delivers the key — the *existing* device delivers, so enrolling a laptop from a
phone needs the laptop to be the one that can read a code. If no device survives, the saved recovery code is
the path (§7.6).

**Not promised.** Signing in does not deliver content — **and it does not make this device a recipient of
content keys later, either.** That second half is the one worth stating, because the first was always true and
still left a gap: a device the service admitted and no person enrolled would have been indistinguishable, at
the next unrelated key rotation, from one whose ceremony had actually succeeded. Enrollment completes when the
ceremony does, and only a completed ceremony makes a device a reader. A sign-in that is interrupted before the
short code is confirmed leaves a device that can be signed in and cannot read, which is the honest outcome
rather than a failure. Signing in does not adopt, merge, replace or re-parent anything already on that device
(§6.2). And signing in never repeats **account setup**: the name and the
recovery code are established once, at account creation, and no later enrollment asks for a name or generates
a new code.

**Setup and use are different, and conflating them is the easy mistake here.** Ordinary enrollment — where an
existing device survives to deliver the key — never touches the recovery code at all. **Recovery enrollment,
where no device survives, is the case the code exists for, and does ask the user to present it** (§7.6, §7.7).
So *the app asks for the code exactly once* is true of generating and confirming it, and false of using it.

**Failure and lifecycle.** A device that has been used locally arrives at enrollment already holding an
anonymous workspace. Both persist afterwards, in separate local stores, so enrollment is **additive** rather
than a transition the device passes through and leaves behind. The device then holds two workspaces and two
principals in one local user slot, shows one at a time, and offers a picker (§6.8).

The out-of-band ceremony is a content-delivery option, not a second authorization root: the service admits
the device and signs the epoch, and the ceremony transfers a key beneath that.

Enrollment ends at the same artifact revocation operates on — a list of your own devices (§6.4).

**TRD.** Which ceremony it is, is **selected** (TRD §13.6, TRD §15 row 11): a **short authentication string over
an in-band key agreement**, both nonces **committed before either is revealed**, five Crockford Base32 symbols
**typed** from the new device into the existing one. The choice mattered for the reason this section already gave:
*show a QR and scan it* is a one-way out-of-band transfer carrying the key, while *show a short code and confirm
it* is a check over an in-band agreement that needs the relay as a channel — different failure modes, different
review scope, and not interchangeable in the security contract. What the selection settles is that there is only
one protocol. **QR is an accelerator of that same transcript** where a decoder exists, never a second one. The
transcript binds the epoch head as well as the wrapping key, and the wrap's HPKE `info` binds the transcript hash.

### 6.4 The device list

**Invariant.** The list of your own devices exists, is reachable, and is honest. It is the same artifact
enrollment ends at, the same one revocation operates from, and one of the three screens that make up this
product's irreducible security surface.

**What the user sees.** Their devices, distinguishable from each other, each showing which key-storage tier
it is on — because a two-tier assurance bar is acceptable and a silent one is not (§7.9). A device not seen for a
while may be shown **muted**.

**A device that is signed in but has not completed enrollment is shown as such, and not as a device that can
read.** This follows from the invariant above rather than adding to it: a list that shows an admitted device
identically to an enrolled one is not honest, and it is the screen a person would use to notice a device they
do not recognise. The distinction is the same one §6.3 draws — admitted is not enrolled — carried onto the
surface where someone can act on it.

The sidebar's **Identity and preferences** shows this device's public **Device code**, matching the code
on every connected device's list. It is the first eight characters of the verified device ID, independent
of the editable name. Defaults use ordinary browser and OS hints, for example **Firefox - macOS** or
**Chrome - Android**, falling back to **This device** when those hints are unavailable. Browser profile
names, client hostnames and exact hardware models are not available to a normal tab. Custom names complement the code rather
than replace it, and sync through encrypted workspace content so each device shows the same names.
Existing names are associated with the verified ID when that device next opens its workspace.

Names do not establish membership. The code comes from the held account owner's verified device ID,
never from a name or machine characteristics. **No fingerprinting:** naming and disambiguation do not
derive identifiers from hardware or browser attributes. Browser and OS hints only suggest an editable
display name; the verified code remains independent (§11).

**Not promised.** A stale device is never **hidden**. Omitting a device because the app inferred it was gone
is exactly the dishonesty this list exists to avoid. The staleness interval is an open parameter (§11).

**Not promised.** Device names are never shown to another principal, which lowers the bar for them
considerably: the audience is one person.

**Failure and lifecycle.** The list is **not deferrable and does not follow sync**. The first device to
enroll is also the first byte of ciphertext on a server, so the list and the thing it protects arrive
together.

The authorization service's **signed state** — not the mutable, unauthenticated display roster — is the
source of this list.

### 6.5 Device revocation

**Invariant.** **The unit of revocation is the device, not the session.** A session is a tab, and revoking a
tab is meaningless; the thing someone with bad intentions uses is a device.

**Revocation has three states and only the middle one may be presented as revoked:**

| State                          | What is true                                                                                       | What the UI may say               |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------- |
| **requested**                  | recorded locally; the service may not know; the device can still push                              | "Pending — not yet active"        |
| **committed**                  | the service accepted the authorization successor **and** a client-produced content-key generation with its reader and recovery wraps, **and** published an authenticated finalization boundary for the removed credential's accepted writes | "Revoked" |
| **acknowledged** by every device | every remaining replica holds the new generation and knows the finalized cutoff                   | "Revoked, all devices up to date" |

The implementation may make the three parts of *committed* one transaction; the product semantics may not
omit one. A request that has not reached the service — or a successor whose content cutoff has not been
finalized — is still pending.

**What the user sees.** They revoke a device from the device list. Once committed: "Revoked". Where devices
are still catching up: "Revoked — 2 of 3 remaining devices are up to date", which is honest and actionable.

**How exclusion actually works.** Content is encrypted; on lost read access the key rotates. The new
generation is generated by an authorized client, wrapped only for **the devices a person actually enrolled**
and the recovery key those enrollments named, and committed by the service alongside the authorization
successor. That set is approved by a device that already holds content, which is what stops the service from
adding a recipient to it (§7.3). The removed device
retains a key that opens history and nothing newer. Rotation keeps the workspace identifier and changes
readability going forward, which is why it is the mechanism rather than forking to a new document identity —
a fork per membership edit is a new document identity per membership edit, and the user must never have to
think about that.

**The revoked device becomes a detached local copy.** It keeps its last replica and every content-key
generation it already held, remains readable and writable locally, can export, and receives neither new
generations nor synchronization.

**Not promised — and this is the sentence that must not be softened.** **A revocation cannot reach a device
that is not connected, and the interface must not imply otherwise.** There is no remote wipe, no remote
freeze, no blur, no disable. A local clear happens only on a device that actually receives and honours a
cleanup request, so it is never part of the remote guarantee. **A member who has already synced keeps their
copy forever: removal governs the future, never the past.**

**Not promised.** Nothing accepted before the finalized cutoff is discarded. Between *requested* and
*committed* the removed credential's writes may still be accepted, and those writes are **kept** — a revoked
device's accepted history up to the cutoff is part of the document in the same way a departed colleague's
writing is part of a file. There is no filtered replay (you cannot remove one participant's operations from a
CRDT history without losing what was built on them) and no two-lineage adjudication.

**Not promised, and it is one propagation delay wide.** *Removal governs the future* is not quite the whole
sentence, and the remainder has to be said rather than discovered. Your other devices start sealing content
away from the revoked one **when each of them learns the revocation happened**, not at the instant it is
committed — a phone that is asleep or in a tunnel keeps writing under the key the revoked device already
holds, and those writes are readable by it. This cannot be closed without a device refusing to accept your
edits whenever it is unsure whether it is current, which is the local-first promise inverted (§2.3). **So
the honest form is: from the moment a device learns of the revocation, what that device writes is closed to
the removed one.** The window is a device being out of contact, and it ends when that device reconnects
(TRD §13.7).

**Failure and lifecycle.** Three behaviours follow and each is easy to miss:

- **The excluded credential has to be told.** From its side the document simply stops updating, and "no new
  changes" is a false statement. Silence is the wrong answer, so the rotation carries a signal the excluded
  credential can still read even though the content is closed to it. That is a protocol requirement falling
  directly out of an honesty rule, and it is easy to miss because the cryptography works fine without it.
- **Remaining devices are stale on authorization, not broken**, between the rotation and receiving the new
  key. They still hold the old generation, and they may still apply the removed credential's **pre-cutoff,
  acceptance-proven** writes — which is correct rather than a gap, because nothing accepted before the cutoff
  is discarded. **What a stale device does not do is apply an unaccepted write**, even before it has learned
  of the revocation: every applied envelope requires authorization-service evidence that it entered the
  accepted set, and a relay that withheld a write from that set cannot manufacture evidence for it. Every
  remaining credential is reachable through the relay, which holds the wrapped key until that device next
  connects — a store-and-forward problem rather than a both-devices-awake problem.
- **Checking for revocation gates sync, not startup.** "Check before anything on reconnect" must never
  become "block startup on a network call". Unknown or offline means full local function; *known revoked*
  detaches the replica and explains that it no longer converges. Reading and writing locally never waits on
  the answer.

Signing out does **not** request revocation. Removing an account from a device does, and only the service
commit completes it (§6.6).

**Pending work that the service had not accepted by the cutoff stays only on the detached copy.**

**TRD.** The authenticated finalization boundary is **selected** (TRD §7.5, TRD §15 row 5): an **append-only
per-credential accepted chain** of SHA-256 links, with **service-signed heads amortized over a batch** rather than
one receipt per envelope, and `final: true` as the cutoff. Of the three shapes §7.5 named — per-envelope
acceptance receipts, an append-only accepted log with inclusion proofs, or a checkpoint plus an authenticated
suffix — the chain is what the client can compute unaided, which is what made it the one to close first. The
requirement it had to meet is unchanged: every shape ends in a committed cutoff, and a bare numeric high-water
mark is not one, because a compromised credential can sign two envelopes at the same sequence and the accepted
stream must be non-equivocating from a client's point of view. See §7.5 below.

### 6.6 Sign out, remove from this device, reset for handoff

**Invariant.** Four operations with **distinct** semantics that overlap in no destructive side effect. Their
labels must carry the difference rather than trying to make two buttons converge.

- **Sign out** ends account and relay sessions and **closes this person's local user slot**. It retains the
  slot's encrypted workspaces, identity, device credentials and content keys, and it does **not** revoke the
  device grant.
- **Remove this account from this device** clears that person's slot — session, slot index, identity,
  capability and stores — and **requests** revocation of this device's grant. Local clearing is immediate;
  revocation is complete only at the service commit. The account lineage continues elsewhere.
- **Reset for handoff** clears **every** local user slot on the installation and requests revocation of all
  account grants it can identify. It is the honest "there was never anyone here" action.
- **Remote revocation** withdraws a device grant but cannot promise erasure on the remote device (§6.5).

**Network login lifetime (operator decision, 2026-10-07).** Lock workspace closes live connections and
clears unlocked capabilities while preserving this slot's resumable network login. Sign out instead
disables that resumption; it does not sign out other devices or another person's local slot. A remembered
login lasts at most **30 days from sign-in**, with no sliding extension from activity or renewal. After
that, a fresh online passkey check is required for network access, never for continuing otherwise-eligible
offline reading or editing. Offline sign-out closes the local slot immediately and reports server
revocation as pending until acknowledged. See the [session design](./account-sessions-subscriptions.md)
for the construction and its implementation status. When online login is needed, a ready fresh
combined challenge may let the existing local passkey prompt also establish it. Otherwise local unlock
proceeds without waiting for the service; later Connect/Reconnect is explicit. The device-lock code,
local verification and offline access rules remain unchanged (operator decision, 2026-10-07).

**Six local facts these operations act on**, and the first two are the ones an earlier four-object framing
omitted:

1. **Account and relay session** — cookies, refresh state, scoped bearer tokens, in-memory account state.
2. **Local user slot** — the device-local index that makes one person's retained stores discoverable and
   keeps another person's outside their picker.
3. **Identity** — the local actor and device records. Display-level.
4. **Capability** — this device's signing and wrapping credentials, any seals protecting them, and the
   content-key generations it holds. This is what lets the device write as itself **and read the workspace**.
5. **The document** — the encrypted stores and the crash journal beside them.
6. **External recovery material** — any copy of the recovery code the user stashed on this device.

**What the user sees.** Sign out says this person's local data stays on the device and can be reopened by
signing back in. Remove from this device says which local-only or unsynced work will be destroyed, clears the
named slot, and reports revocation as committed or unconfirmed. Reset says every slot is cleared, warns that
external recovery-code copies cannot be recalled, and never promises that an offline remote device was wiped.

**Not promised.** **Object 6 is a warning, not an action.** The recovery code deliberately has no home inside
the app, so surviving copies are in a notes app, a password manager, a screenshot or on paper — none of which
this button can reach. A reset says what a person may still be relying on and claims to clear only what it can
actually see.

**Not promised.** Sign-out is not erasure. Mandatory factor custody protects the declared copied-profile
case (§7.2), not hostile code in an already unlocked runtime. An untrusted handoff uses **remove this
account from this device** or whole-device reset, with journal-inclusive resumable cleanup (SC-07).

**Failure and lifecycle.** Four shapes to avoid, all of which have been reached by reasonable-looking
implementations:

- **Clearing identity and document but not capability.** "There was never anyone here" is not achieved by
  removing the name and the list while leaving an authorized credential and a live content key in the
  profile. That hands the next person a device that can still read and still write, while telling the
  departing user the machine is clean. A shared-device reset clears session, slot, identity, capability and
  document together, and should revoke at the service as well.
- **Clearing only one slot on a handoff.** A device may hold an anonymous Local workspace and an account
  workspace at once, each with its own identity, document and capability. Removing an account clears one
  slot; a handoff reset clears every slot. Otherwise "there was never anyone here" hands the next person a
  readable pre-sign-in list while truthfully reporting that the account is gone.
- **Clearing capability without the document.** Capability includes the content key that opens the local
  store, so this **orphans the document**: the ciphertext stays on disk and nothing can open it. At Account
  that is recoverable — sign in, and the content key returns through the content-delivery gate — but at a
  never-admitted Local workspace it is total and final. A reset that offers to "clear my identity" while
  leaving the data must not take the content key with it.
- **Clearing the document without knowing what it costs.** With capability retained, the device reconnects
  and decrypts what it re-receives. With capability gone too, signing in restores authorization and
  ciphertext **and not the ability to read it** — the content key comes back from an existing device or the
  recovery factor. It is **total loss for any Local workspace whose last readable replica this is**, and it
  loses whatever has not reached the hosted accepted set at Account. The app knows the lineage, hosted state,
  pending work and local replicas it can see, and warns from those facts rather than from the label.

**Two warnings, and they are different warnings.** The document warning is conditional and checkable — say it
when it is true, stay quiet when the service holds a current copy. The recovery-material warning cannot be
conditioned on the fact that matters, so it says what it destroys and asks the user to confirm they still have
the code elsewhere. Neither may ride along silently with a reset that is otherwise recoverable.

**Local clearing and service revocation are two commits.** When the service is reachable, remove-from-device
commits revocation first and then clears. If it is unavailable, the app may still clear locally for a handoff,
but it must report *local data removed; revocation not confirmed* and direct the user to revoke that device
from another signed-in device. Destroying the only local credential makes this copy inert; it does not revoke
a credential that may already have been copied. Neither a queued request nor a button press may be labelled
**revoked** before the service commit.

**Destructive clears must be crash-safe** across the slot index, keys and encrypted stores. Clearing IndexedDB
is asynchronous and interruptible; navigating away mid-clear must resume or roll back rather than
manufacturing a document with no identity (§6.11).

### 6.7 Local user slots

**Invariant.** A local user slot is a **device-local privacy and selection boundary** containing the
workspaces, principals, credentials and keys one person may use on this installation. It is not a synced
identity, it merges nothing, and it makes no claim about identity elsewhere.

**Encrypted local stores are keyed by _(principal, workspace)_.** A separate device-local slot index says
which of those stores the currently authenticated person may discover and open.

**Invariant — isolation.** **Neither workspace's provider may ever write to the other**, in either direction,
including on teardown, retry and error paths. This is the whole of the isolation guarantee and is stated
rather than left implied by the storage key, because **a connection *is* the merge**: the only defence is
that two workspaces never share a store.

**Two workspaces never merge; one workspace's replicas always do.** The distinction is mechanical rather than
a policy choice, and it is what makes holding several workspaces on one device cheap:

- **Replicas of one workspace that have diverged share an ancestor** — two devices on one account with one
  offline for a month, a lapse, a migration cutover. The CRDT converges them without choosing or discarding
  anything. That is the ordinary offline-sync case and it is what the CRDT was selected for. A long
  separation makes the merge *large*, not lossy.
- **Two histories with no common ancestor** can be merged mechanically, and the result is meaningless:
  interleaved text and both sets of cards in arbitrary order. So they never are. They are two workspaces, in
  two stores, and nothing points a provider at the wrong one.

**"Two histories meet" is therefore never by itself a problem statement.** The question is always whether
they share an ancestor, and the two answers want opposite treatments.

**What the user sees.** Nothing, in the single-person case — which is every user who never signs in and most
who do. On a shared installation, one person's picker never shows another's workspaces.

**Not promised.** A slot is not an account, does not sync, and does not group two principals into one person.
It may contain two principals after *start fresh* retains an earlier Local workspace; that grouping neither
merges them nor asserts they are the same person.

**Failure and lifecycle.** **Sign-out closes the whole slot without deleting its rows.** Authenticating a
different person opens or creates another slot and exposes none of the first person's workspaces. A full
handoff reset removes all slots.

**Reopening a closed slot is local and requires proof.** Account enrollment leaves an offline-verifiable
slot-unlock binding on the device. Reopening requires proof of the same account credential, plus the required
local content factor; knowing that a closed slot exists is not enough. That proof reopens
already-local state and grants **no relay token, no account session and no authorization change.** When the
service is reachable it separately authenticates the account and restores those network capabilities. This
separation is why account session and local slot are different axes, and it preserves offline local use after
sign-out without pretending a cookie is a content key.

**A purely accountless Local slot has no account credential**, so the product does not present account
sign-out as though it could protect it. On a shared installation its honest handoff operation is export if
needed, then reset — unless a separate local-profile unlock is deliberately added later.

**A device with no usable authenticator gets the same sentence rather than a weaker gate.** An account cannot
be created there, and a slot on it has no local verifier; the product says so instead of offering a
password-shaped stand-in that would protect nothing while looking as though it did (TRD §13.9, §10.11).

**Two forcing cases, and the ordinary one is not the shared laptop.** After the account boundary, every synced
user has a Local workspace before they have an account, and often one on each device. A device that signs in
therefore holds an anonymous workspace **and** an account workspace — two principals on one browser profile,
with no second human anywhere near it. That is the ordinary path. Two people on one installation additionally
need two non-overlapping slot views over those stores.

Without the slot index, parallel storage would prevent merges while still leaking the previous person's
retained Local workspace through the picker.

**TRD.** TRD §4.8's storage-split table carries the slot rows and TRD §6.1 the per-(principal, workspace) key
(§6.2 above). TRD §6.5 is the slot index itself, including the store-naming rule that stops a picker enumerating
by construction rather than by lookup — a name guessable from a workspace identifier would defeat the boundary
the index exists to enforce.

### 6.8 Workspace selection

**Invariant.** The user never has to think about workspaces **until their active local user slot holds more
than one.** At that point — and only then — the app shows a context indicator naming the current list and a
picker listing the local workspaces in that slot.

**What the user sees.** Below the threshold: nothing. No indicator, no picker, no concept. Every user who
never asks for a hosted service lives there permanently.

Above it: an **account switcher**, not storage administration. That is a UX statement with a product reason
behind it — a switcher asks *whose list is this*, which is an identity question people already have a model
for, while a workspace manager asks what a container is, which is the thing that must never need knowing.

**Not promised.** No workspace is named by a user, no two are ever merged or adjudicated, and nothing is
created, configured or shared from a management surface. **Select is the only permitted verb.**

**Not promised.** The picker is scoped to the **active slot**. It never lists a signed-out slot or another
account's local state, and it is not multi-workspace *navigation* — several live, synced, possibly shared
workspaces reached through memberships. The two look alike in a list and are nothing alike underneath (§2.5).

**Failure and lifecycle.** The threshold is a slot-local count the app can evaluate, and it is reached only by
an act the user took deliberately: creating an account and choosing *start fresh*, signing in on a device that
had been used locally, or deleting an account.

There is no committed "current workspace" fact and no rule about how it is set. The picker is the
disambiguator; what remains is only which workspace was open last, which is ordinary interface state.
**Account sign-in state is not load-bearing for workspace selection** — it disappears when an account is
deleted, which is exactly the case that needs the picker most. **Local slot state** is what is load-bearing,
and it survives.

**The retained Local workspace ends by export or deletion**, offered where a person would look for their own
earlier data rather than in anything resembling workspace administration. There is no deadline. If it is
never touched again it sits there, costing storage and nothing else, and the app must not dress it up as a
second list the user is meant to maintain.

### 6.9 Account deletion

**Invariant.** Deleting the account **permanently retires the service authorization lineage**. Each device
becomes an independent Local install and they stop converging. Nothing is locked; what ends is
synchronization. That is the free product, arrived at from above.

**Retirement stays distinguishable from genesis.** Before the service deletes its copy it commits a **signed
terminal lineage record**, and absence and retirement remain different facts thereafter (§6.11).

**What the user sees.** A confirmation that names which device the list continues on, names the devices that
have not appeared, and says plainly that from this moment the devices stop converging.

**Every device keeps its copy.** Most people deleting an account want to keep using the app, not to
consolidate onto one machine. The nominated device says *your list continues here*; the others say *copy as
of ⟨date⟩; your list continues on ⟨device⟩* and offer their own export and deletion.

**Not promised.** Deletion does not prune the other devices, and could not: a device that is offline keeps its
replica whatever was chosen. Any such promise would be a "removed" that does not remove.

**Not promised.** "Each device keeps a complete copy" is **false**. A device holds **its last local replica** —
whatever it had synced when it last connected. A device offline for a month, or enrolled and left in a
drawer, is missing everything since, and once the lineage and hosted copy are retired there is nowhere left to
get the remainder. Its gap is permanent.

**Two requirements are the price of deletion being safe rather than merely available:**

- **Destructive deletion requires either a verified-current device or a fresh export.** Deleting while every
  reachable device is stale is a silent data loss with no survivor, and it is the one shape of this that
  cannot be undone.
- **A catch-up window before retirement.** Sync should continue long enough for enrolled devices to converge
  before the service copy goes, and devices that never appear are named in the confirmation rather than
  quietly abandoned.

**Failure and lifecycle.**

- **Nothing decrypts.** Every store was already ciphertext from genesis, so there is nothing to decrypt *to*.
  Each device opens its last replica with content-key generations it already holds, and simply stops syncing.
- **Nothing on the device depends on a service-held root.** Enrollment already copied the recovery public key
  and the opaque code-sealed recovery private key into every workspace package, so the service can remove its
  copies while each device keeps those artifacts and the content keys its last replica had.
- **The principal survives.** An identity that predates the account is not retired by ending it, and a
  service relationship ending is not the app forgetting who someone is (§5.1).
- **An offline replica cannot receive the terminal package, and deletion must not pretend otherwise.** It
  keeps its last signed **live** head — stale, but still sufficient to prove the workspace is historically
  admitted and must not silently re-mint identity. It keeps working as a detached last replica but cannot
  locally claim to have observed retirement or show the continuation pointer. Importing the terminal package
  later upgrades its knowledge; lacking that import loses labelling and verification material, not data.
- **A slot that was closed at deletion is a local-unlock case, not a service-sign-in case.** It may still be
  unlocked with its account-bound local verifier, but that cannot restore an account session. Importing the
  signed terminal package completes its Local status and historical evidence; if the ordinary unlock proof is
  lost, the terminal package plus the recovery factor may rebind it locally. The confirmation names those
  dependencies, and a user holding neither proof must reopen or export any device they intend to keep before
  deleting.
- **If the devices are ever reconnected it is a merge, not a contest.** Both replicas descend from the state
  the workspace was in when sync stopped, so they converge and nothing is chosen or discarded. A long
  separation makes that merge *large* — both devices' cards on shared dates, the master list merged at
  character granularity, more than three Next items where both devices used them — and large is the honest
  word for it rather than lossy. Provenance mode exists for exactly this reading problem (§5.7).

**What travels before deletion.** Every participating replica and the verified portable package receive the
terminal record plus the recovery public key, the code-sealed recovery private key, enough public
authorization history, verification keys, accepted-set evidence and recovery wraps for every content-key
generation needed to support the historical attribution claims they retain. Those artifacts travel with the
workspace rather than requiring the deleted account to remain queryable. They verify the past and authorize
no future — so they must be synchronized before deletion, not invented during it.

**And something has to have *received* them, which is now a receipt rather than a wait** (`S0-6`). Sending is
not receiving, and a window that has merely elapsed is time being read as evidence — so hosted bytes were
previously destroyable while every remaining copy was stale, incomplete, or absent. A device is counted as
having the workspace only when it can show either that it already holds the final state, or a verifiable
account of what it was missing **with the gaps named rather than summarised**. It signs that, and only that
signature releases each class of hosted data.

**If the acknowledgement is lost, the bytes stay.** That direction is chosen rather than accidental: keeping
data nobody asked to keep is a recoverable mistake and deleting data somebody still needed is not, so the
ambiguous case keeps it and the record says the handoff never completed rather than claiming it did. **A
device that never appears is named and never counted**, which is the promise §6.9 already makes about the
confirmation screen, now true of the deletion underneath it.

**They do not stay forever, and the deletion request itself is what says so.** *Deleted* cannot quietly mean
*kept because nobody confirmed* — that is the product holding data the user asked it to destroy, and holding
it for a reason the user never hears. **Asking for deletion is accepting deletion** (TRD §14.7): the signed
request carries that acceptance in its own bytes — if no device confirms receipt within the window, the copy
is destroyed anyway — and the window is measured **from the request itself**, twelve months from the deletion
rather than the tail of some earlier clock, so it is never already over at the moment of asking. The
confirmation says both halves: the bytes go as soon as a device confirms it has them, and by that boundary in
any case — and when the boundary does the deleting, the record says `deleted-without-receipt`, never that a
device received what it did not. **A user who wants them gone sooner has one lever and it is the honest one**
— open a device, let it converge, and confirm.

### 6.10 Lapse, grace and hosted read-only

**Invariant.** *Conditional: this applies only if hosted sync is ever priced as a subscription (§11).* **A
failed payment is a billing event, not an identity event.** A lapse does not retire the authorization
lineage and does not touch the enrolled devices.

**What the user sees.** A grace period during which everything continues. After it, the account goes
**read-only**: the server-held copy is retained and remains recoverable; ordinary synchronization transfer
stops. Every device keeps working locally exactly as it always did, because nothing on the read or write path
ever awaited a credential.

**Read-only means the service's copy, not the app.** The app is fully writable on every device throughout.

**Not promised.** The retention duration must be a **stated number** — "retained" without one is a promise
nobody can plan around. That number bounds two things at once and is the same number for both: how long
resuming restores the hosted history, and how long the service-hosted total-device-loss recovery path remains
possible. An independently held fidelity archive is a separate ciphertext source and does not inherit this
deadline (§8.3).

**The duration is twelve months** (TRD §15 row 16), and it is measured **from the moment hosted synchronization
stops** — the end of the grace period — rather than from the missed payment, so grace is not deducted from
retention. It binds in both directions, and both are promises: **a floor**, in that a plan may offer longer
retention and none may offer shorter; and **a ceiling**, in that at expiry the hosted copy is *deleted* rather
than merely eligible for deletion. A retention stated only as a floor would be unbounded above, which is the
one thing §7.11's inventory calls a defect rather than an omission.

**During retention, three things are retained together** — ciphertext, every needed content-key wrap to the
recovery public key, and the recovery private key sealed to the saved code — because omitting any of them
produces a copy nobody can recover.

**Resuming is not recovery.** A user who starts paying again from a device they still have simply resumes
sync, presenting no code and performing no ceremony. The code is needed only if every device is gone as well,
and that path has to keep working for as long as the copy is retained — otherwise read-only is a state in
which the service holds the user's bytes and cannot give them back.

**Failure and lifecycle.**

- **What expiry ends is the hosted copy, not the account or lineage.** Hosted ciphertext and its
  per-generation wraps are deleted. The dormant account retains the recovery public key and the code-sealed
  recovery private key, so a surviving device can later re-seed the hosted workspace, wrap its current
  generation to the same recovery public key, and resume **without creating or confirming a new recovery
  code**. **That is a rule the deletion machinery refuses to break rather than a convention it observes**:
  the recovery material is a deletion class of its own, and expiry is not allowed to reach it (TRD §14.7).
  Deleting it would make this promise false in the one situation it exists for.
- **Expiry does not change the Account label.** The lineage remains live but dormant, hosted content is
  absent, and the devices' stores remain ciphertext exactly as before. This is the case that proves hosted
  content and authorization lineage are different axes (§2.3).
- **Resuming after expiry converges; it does not choose.** The devices' replicas are the workspace, they
  share an ancestor — the state the workspace was in when sync stopped — and they merge. Nothing is
  discarded. The merge is as large as the separation was, which is a legibility problem rather than a data
  one. Treating a workspace whose hosted copy expired as a workspace with no history would replace one
  device's months of work for no reason; **the hosted store losing its copy does not dissolve the ancestry between
  the devices.**
- **What expiry genuinely destroys** is narrower and still has to be said in advance: the service-hosted
  total-device-loss recovery path, and the gap held by any device that was offline across the whole lapse —
  its replica is short everything since it last synced, and after expiry there is nowhere left to get the
  remainder. This is why the grace period is a real mechanism rather than a courtesy, and why retention
  should outlast it.
- **Deliberate downgrade must not silently become account deletion.** Stopping payment and deleting an
  account are different acts with different consequences, and the interface has to keep them apart. **That is
  a binding requirement and not only an interface one**, and it is now carried by a mechanism rather than
  asserted about one (TRD §14.7). A lapse and a deletion differ in exactly one artifact — the terminal
  lineage record — and **a lapse is not a request at all**: it is a signed service record on a separate axis,
  which is what *a failed payment is a billing event, not an identity event* means once it is built rather
  than stated. An interrupted deletion leaves a retired lineage whose hosted content is still there; the
  reverse order would leave hosted content missing with nothing signed to account for it, which is
  indistinguishable from an expiry nobody was told about.
- **What resuming costs depends on one thing: whether anything was deleted yet.** Before the deadline, and
  after it right up until the first byte goes, resuming restores everything and asks for nothing. Once
  deletion has started, resuming rebuilds the hosted copy from a device that still has one — the workspace is
  not gone, but the hosted copy has to be re-seeded rather than switched back on, and a device has to be
  present to do it. **Both cases keep the account and the lineage**; only the second involves work.
- **A billing failure cannot delete anything early, and cannot end the lineage.** The service that records
  entitlement can stop hosted synchronization and can do nothing else: the deadline is measured by the
  retention machine from the moment sync actually stopped rather than from any date the billing side supplies,
  a deletion the user later asks for gets its **own** boundary measured from the request — which no billing
  event can move in either direction (TRD §14.7) — and the recovery material it would take to lock someone out
  is the one thing expiry is forbidden to touch. **So the worst a billing mistake reaches is read-only** —
  loudly, with every device still writable and every deadline stated — rather than anything permanent.

**One thing must be said out loud when sync stops**, because it is the part a user will not infer: **from
that moment the devices stop converging, and each one's edits are its own.** **What is shown is a signed
record rather than a sentence the interface composed** (TRD §14.7): the date sync stopped and the date the
copy goes are fields the service committed to, so what the user is told and what the service will act on
cannot drift apart, and a device that has already seen a later version of that record will not accept an
earlier one. The honest copy for what happens
on resumption is *these will come back together, and there will be a lot to come back together* — not a
warning that something is at stake. **The twelve-month deadline belongs in that same moment**, because a
duration measured from an event nobody observes is not something anyone can plan around, and *plannable* is
what makes it a number rather than a reassurance.

### 6.11 Local identity is gone but the workspace remembers it

**Invariant.** Identity loss with a surviving workspace is **not a configuration to support gracefully.** It
should not be reachable, and where it is reached the app says so rather than papering over it by minting a
replacement.

**The policy turns on whether an authorization lineage has ever existed**, and this is asked **per
workspace**, never per device — a device that has signed in can hold a lineage-absent Local workspace and a
live-lineage Account workspace in the same browser profile:

- **No authorization lineage — local genesis.** Nothing has been admitted and there is no authorization
  epoch. The actor id has no external audience, so minting a replacement is harmless and is just first run
  with extra steps.
- **Live or retired lineage — historically admitted.** The service has authorized something. A fresh random
  identity appearing and beginning to write is precisely the unapproved-writer problem, and the app must
  **not** silently mint one. A live lineage may offer sign-in; a retired one cannot pretend the old service
  relationship can be resumed.

**Detection reads authenticated lineage state, and nothing else.** It is a separate signed object beside the
workspace, not a field in it. **Absent means never-admitted genesis; a signed live head or terminal record
means historically admitted.**

**Not promised.** The roster is not evidence of anything. A `kind: 'human'` roster entry is written on every
ordinary first run, before any sync exists, so a never-synced workspace already satisfies any
roster-existence test; counting entries does not rescue it, because two storage clears on a purely local
workspace leave two orphaned human entries and that is indistinguishable from two devices having synced. The
roster is mutable, unauthenticated and written by genesis.

**Not promised.** The Local/Account label is not the test either. Local now includes both never-admitted
genesis and replicas whose former lineage is retired.

**Failure and lifecycle.** How this state is reached, and the shape of the list is the argument:

- a bug, including any sync-collision case that produces it — also a bug;
- deliberate mischief, where someone deletes the identity keys and leaves the workspace;
- **a feature built carelessly** — a sign-out that deletes identity while retaining an undiscoverable
  workspace, a remove-from-device interrupted between keys and ciphertext, or an id scheme clever enough to
  keep local state while re-linking identity.

The third is the only one under our control, and it yields the constraint: **sign-out does not clear identity,
capability or workspace at all; it atomically closes their local user slot** (§6.6). The destructive
operations do clear, and must be crash-safe across the slot index, keys and encrypted stores.

**What the app does on detecting a historically admitted workspace with no local identity is open** — refuse
to write, offer sign-in or recovery where the lineage is live, or quarantine until the human chooses. It is a
UX decision about a rare and alarming state and it blocks nothing (§11).

**TRD.** The signed authorization lineage is one object serving several requirements at once, and designing it
once is a consequence rather than a deferral. It must bind the workspace's membership grants, device and
agent credentials, capabilities, and content-key generation; be signed and verifiable without a local secret;
carry enrollment admissions; be serialized by the authorization service so concurrent successors resolve to
one accepted epoch; and leave a signed terminal record at deletion. Generation is broader than membership,
because admitting a second device changes authorization without creating a second member. TRD §13.5 designs it
against exactly that list, and states the bound on rollback protection that comes with it: a returning client can
reject an ancestor of the newest head it has seen, and a brand-new client cannot.

---

## 7. Security, privacy, recovery and the service data boundary

### 7.1 Everything persisted is ciphertext, from genesis

**Invariant.** **Every workspace has a content-key generation from genesis, and no app-managed persistent
store ever holds user-content plaintext.**

Four properties, kept separate because bundling them is what made this question look undecidable for four
drafts:

| Property                                               | Answer                        |
| ------------------------------------------------------ | ----------------------------- |
| Persisted user content is ciphertext                   | **Always, from first run**    |
| Opening it requires a **user-held factor**             | Optional for Local; required for protected Local and Account (§7.2) |
| Plaintext exists in memory while the workspace is open | Yes, unavoidably              |
| A copied profile without its external factor is resisted | Protected mode only; supported-browser custody tests gate the claim |

**What the user sees.** First Local use opens Today and saves automatically, without names, credentials,
installation requests or a tour. Empty Next reads “The three most important things to focus on next.”
Done reads “Anything you finished counts, planned or unplanned.” Scheduled reads “Things planned for
this day.” Goals reads “Your running list of tasks, projects, someday-maybes, notes to self, and ideas.”
An in-place introduction is dismissible and retires after writing begins. The sidebar offers Install,
Personalize, Protection and Sync independently. Adding protection explains loss consequences, saves
and confirms a generated unlock code, then applies the durable transition before reporting completion.
Existing protected lists never acquire an automatic opener.

**The subject is every app-managed store**, not the main database alone — encrypting one of them is theatre:

| Store                        | What it holds                                                                 | Requirement                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| The workspace database       | The workspace content root                                                    | Each update stored as an authenticated encrypted record: ciphertext plus non-content routing metadata |
| The synchronous crash journal | Each update, written synchronously so a page kill between transaction and commit cannot lose it | Encrypted too — see below, this is the sharp edge                              |
| Any persistent derived index | The derived text of everything searchable                                     | May ship **only** when its on-disk representation is encrypted (§10 below)                             |

**The protected-mode copied-profile promise has a precise boundary.** A supported browser profile without its external
unlock factor or an already unlocked runtime cannot recover content through the application's persisted
custody paths, including credentials that receive future keys. Complete-profile tests must substantiate
that claim; ciphertext scans and non-extractable key flags alone cannot.

**Not promised.** This does not resist hostile same-origin code after unlock, a compromised OS, memory/swap
images, historical plaintext, old promptless copies or secure erasure of freed blocks. A generated code
stored unprotected inside the copied profile is not an independent factor. WebCrypto non-extractability
restricts API export; it does not guarantee disk-key protection (TRD §13.3).

Two things this retires: *"the plaintext sits in the database on every device by design — that is what
local-first means"* was doing unearned work. **Local-first means the data is on your device, not that it is
unencrypted on your device.** And the browser's origin sandbox is a boundary between web origins, not an
at-rest boundary: the database is ordinary files in the profile directory, readable by any process running as
the same OS user.

**A very large paste or import arrives in pieces, and that is a promise rather than an implementation
detail** (`S0-3`, TRD §6.1). Every edit is made durable before the app accepts the next one, and the work that
guarantees it has a size beyond which it stops fitting inside a keystroke. So an operation larger than that is
applied in bounded pieces — **nothing is refused**, a very large paste appears progressively rather than all at
once, and an interruption part-way leaves the pieces that finished rather than nothing at all. The alternative
was a single operation too large to make durable, which fails silently and completely.

**Failure and lifecycle.** **No lifecycle event decrypts persisted content.** Account creation adds recovery
and reader wraps for generations that already exist and is never a whole-document transformation. Account
deletion retains locally held keys. Retention expiry changes only hosted custody. Migration rotates to a fresh
generation. The stores stay ciphertext throughout, and there is nothing to decrypt *to*.

**Key representation is explicit and separate from device credentials.** A generated factor seals the
local-custody root; that root seals retained generation keys and protects every future-content receiving
credential. Opening briefly unseals keys into live session memory and derives separate store/journal
subkeys. No persisted promptless or remember-unlocked fallback remains. Account authentication and
content recovery are distinct roles, never implicit consequences of local unlock.

**TRD.** Three things TRD §6.1 and TRD §6.2 carry. `y-indexeddb` persists raw updates and cannot be retained at
any layer, so TRD §6.1 replaces it, with each update stored as ciphertext plus format version, nonce, generation
and sequence. **The journal is the one genuinely new cryptographic obligation in the plan**: it exists so content
survives a page kill, so it holds recent content by design, and it is written *synchronously* while WebCrypto
is promise-based. **The crash-safety contract is preserved rather than redesigned** — that requires a reviewed
**synchronous AEAD**, JS or WASM, on that one narrow path, with a low-end-device latency benchmark. The
journal subkey exists only in live slot memory, is cleared at sign-out or lock, and is re-derived at unlock;
it is the narrow exception to non-extractable runtime keys, and it never receives a content-key generation
secret or a device private credential. This is the only place the design adds a primitive rather than
composing reviewed ones, so the independent design review must cover it specifically (§7.12 below).

**Migration machinery and the live cutover are separate.** Stage 1 builds the resumable legacy move: preserve
the selected plaintext carrier, create factor custody, import and verify the encrypted store, atomically
select it, and remove legacy carriers only after verification. Execute its kill matrix against a seeded
installation. Stage 2 performs the author’s real-data cutover after the carrier decision and review 3a;
shipping before external users exist does not remove Stage 1’s obligation to build and test recovery.

### 7.2 Optional Local protection; required protection for sync

**Invariant.** Protected Local and Account workspaces require local unlock at cold start.
The generated 125-bit unlock code is enrolled when protection is selected; supported PRF factors
add seals of the same custody key. Code-only use works offline. A user-chosen password is not substituted.
The factor must be held outside the copied-profile exposure domain. The app does not retain the code
for redisplay or offer an ordinary disable-lock downgrade.

**What the user sees.** Confirm the generated code before enabling protection; later cold starts
ask for that code or a supported enrolled authenticator. The ceremony is local, not a network wait.
Account login neither replaces it nor becomes a requirement for Local. Pending edits are not ordinary
editor content until durable (SC-01–02); no interface labels provisional input saved.

**Failure and lifecycle.** Losing the last Local factor, with no independent readable replica/archive,
can mean final loss. State this when adding protection and require code confirmation. At Account, login alone
still cannot recover content: the separate recovery material or a surviving authorized device can
re-enroll a new device. Recovery never bypasses this locked slot. Local unlock does not authenticate
an account, sign mutations or implicitly become an account recovery factor.

**Existing promptless profiles require migration.** Confirm a factor, stage sealed custody, replace
all promptless future-content receivers, and settle the required forward-generation transition.
Non-extractable old credentials cannot simply be exported and resealed. The UI reports **protection
pending** until the durable local custody/receiver/rotation predicates hold. Suspended local writers can
delay that transition; timeouts do not authorize key retirement. Remote devices can still use an old
generation until they observe its successor, so the interface does not promise instant global change.

Earlier copies retain their old keys and readable history. Migrating current custody does not erase those
copies or make prior plaintext confidential. Fresh factor-sealed genesis has no such promptless phase.
Factor replacement leaves at least one valid enrolled factor. Sign-out/lock clears live capabilities
through coordinated session teardown; it does not assert forensic erasure of runtime memory.

**TRD.** §13.3, row 13 and SC-03/04/08 define the construction and resumable migration. §11.1 and
[storage-conformance.md](./storage-conformance.md) test the actual persisted profile, future receiving
credentials, first-run and interruption paths. Seal vectors alone do not certify these product behaviors.

### 7.3 The authority split: the service authorizes, the user recovers

**Invariant.** **Authorization and decryption are different powers and must never silently collapse into
one.** The service is the sole authorization authority. The user holds the sealed recovery private key. **The
service cannot decrypt a workspace under any proof or any order.**

| Artifact                                   | May do                                                                                                   | Must not do                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Account authenticator / local verifier** | Authenticate the person to the service; prove locally that a closed slot belongs to them                 | Decrypt content, sign mutations, create a relay session while offline, or change authorization by itself |
| **Relay admission token**                  | Open a scoped transport connection for a bounded time                                                    | Decrypt, sign content, admit a device, change capabilities or recover an account                         |
| **Device or agent signing credential**     | Sign mutations as its authorized actor                                                                    | Receive a content key merely because it can sign; change service authorization                           |
| **Device or agent wrapping credential**    | Unwrap content keys if read-capable                                                                       | Sign mutations, change authorization, or represent an arbitrary actor                                    |
| **Legacy promptless local-custody key**           | Open predecessor envelopes only while an explicit migration remains pending                                     | Sign, authenticate an account, unwrap the recovery private key, or travel to another device              |
| **Required factor custody**           | Open this slot's envelopes through the enrolled user-factor gate                                    | Sign, authenticate an account, or become a recovery factor implicitly                                    |
| **Certified recipient set**                | Name the devices a new content key may be delivered to, and the recovery key it may be wrapped to        | Be written or amended by the service; grant a capability; decide what the service has accepted           |
| **Recovery-bootstrap authority**           | Authorize one replacement device when no device survives, from the saved recovery code alone             | Be held by the service; exist outside what that code protects; be used a second time                     |
| **Service authorization authority**        | Admit and revoke credentials, choose capabilities, sign authorization epochs, finalize accepted sets     | Decrypt content, sign a device's mutations, represent its actor, or deliver a content key by authorization alone |
| **Content-key generation secret**          | Derive domain-separated encryption subkeys for one workspace generation                                  | Admit or revoke anything; authorize its own distribution; be reused across stores or protocols           |
| **Recovery public key**                    | Wrap each content-key generation for recovery                                                            | Unwrap any generation, or authorize anything                                                             |
| **Recovery private key**                   | Unwrap recovery copies of content-key generations after device loss                                      | Admit or revoke anything, sign mutations, or recover the service account                                 |

**The device rows make two cryptographic jobs explicit.** Signing proves who sent an envelope; public-key
encryption or key agreement lets a content key be wrapped for one reader. A library may represent them
together; the contract may not assume a signing key can also receive an encrypted key.

**The asymmetric recovery shape is load-bearing.** A symmetric root present on every device would let a
later-revoked device derive future generations; a symmetric root absent from ordinary devices could not wrap
those generations without being re-entered. A recovery **public** key resolves the contradiction: an
authorized client can create a new random generation and make a recovery wrap during ordinary operation,
while only the sealed private key can open it. The service may retain the public key, the ciphertext and the
wraps without acquiring content custody.

**What the split trusts the service for, and what it does not.** It trusts the service for **authorization
integrity and availability**. A compromised authorization service can admit or revoke credentials, change
capabilities, freeze an account, or lie about which authorization state it recognizes. It still cannot decrypt
the workspace, forge an existing device's signature, or produce a meaningful encrypted mutation.

**Not promised.** There is **no** break-glass administration secret, surviving-device quorum, delegated
administration credential or witness-succession operation. **No credential changes authorization outside the
service.** If the service disappears, recovery creates a new service relationship and a new lineage; it does
not appoint a successor to the vanished authority (§8.5).

**Not promised.** **Service escrow is excluded by construction.** The objection is not cryptographic taste: a
decryption capability is a *compellable* capability, and a service that can turn a customer's ciphertext into
plaintext can be ordered to, with a gag attached. Escrow's convenience and its liability are the same
mechanism seen from two directions, and no internal policy separates them — policy is exactly what a court
overrides.

The opt-in variant is rejected in the same breath, because it is the form the idea returns in. It converts an
**architectural inability** into a **per-user policy**, and *we cannot* and *we cannot for this one* are
different answers under pressure. And the client code that seals to an escrow key would ship to every user,
making enablement a configuration change rather than an attack.

**Recorded: an escrow add-on may be built, opt-in, and it must not be operated by the legal entity that
operates the service.** Its scope is **recovery only** — a separately sealed copy of the recovery private key
and nothing else. It may not admit or revoke credentials, change capabilities, sign authorization state or
operate the account. Split across two entities, the service holds ciphertext, wraps and a user-code-sealed
private key; the escrow agent holds a separately sealed private key and no ciphertext. **Neither party alone
can produce plaintext**, so compelled disclosure requires two demands against two entities, potentially in two
jurisdictions.

That separation answers the first objection and not the second: the escrow agent's public key still ships to
every client, so a hostile or coerced release could seal a non-opted-in user's private key to it. **That
residual is accepted, and what carries it is release integrity rather than custody** — the reproducible,
checksummed release artifacts required for other reasons (§8.4), and the independent implementation audit that
the add-on holding a real key triggers (§7.12).

**Building it deliberately rather than early-or-never.** The situation that produces demand for escrow is an
enterprise buyer with an administrative-recovery requirement, mid-sale. Designing custody for the most
security-sensitive path in the product under contract schedule pressure is the worst available condition for
that work. Recording the boundary now costs a section; discovering it during a sale costs the boundary.

**Failure and lifecycle.** Rotation is **client-produced and service-committed**: an authorized owner device
generates the next generation, wraps it to **exactly the devices in the certified recipient set** and to the
recovery key that set names — never to a roster of everyone the service has admitted — and submits those wraps
with the authorization successor and accepted-set cutoff. The service atomically
commits and signs that package; it never generates or learns a content key. Removed credentials receive no
wrap. **No construction may give the service the key in order to simplify its commit.**

### 7.4 Content keys, generations and exclusion

**Invariant.** Read exclusion is enforced by the **key**, not by the door. Content is encrypted; on lost read
access the generation rotates; the removed credential retains a key that opens history and nothing newer.

**What the user sees.** Removing a device or an agent's read access takes effect and stays taken (§6.5).

**Not promised.** **Removal governs the future, never the past.** A member who has already synced keeps their
copy forever. There is no mechanism that unwrites what was already read.

**Not promised.** **Edit implies read.** Under one symmetric content key per generation there is no
cryptographic write-without-read; that would need a different content construction, not a capability flag. So
granting an agent edit discloses the entire workspace to it and to whatever service runs it (§5.8).

**Not promised.** **Server-side anything that reads content is impossible, permanently and by construction.**
Server-side search, server-side export, server-rendered anything: gone. Local search is unaffected because it
is local. That is probably a feature.

**Failure and lifecycle.**

- **Rotation does not remove the propagation problem, it moves it** — from "tell everyone the new room name"
  to "get the new key to every enrolled reader". Every such credential is reachable through
  the relay, which holds the wrapped key until the device next connects: store-and-forward, not
  both-devices-awake.
- **The excluded credential must be told**, explicitly, because "no new changes" is a false statement. The
  rotation carries a signal it can still read even though the content is closed to it.
- **Key management becomes the hard problem**, which is a reason to read the prior art rather than invent.

**Generation retention has a conservative floor, and it comes from an interaction between two decisions.**
The attributed actor sits **inside** the seal, so verifying authorship requires decrypting — which means a
workspace that rotated keys and discarded old generations has signatures it can still check and attribution it
can no longer read. **Retain enough to open every generation whose attribution the product still claims — or
stop claiming it.**

That floor is *for the lifetime of the claim*, not forever. **Destructive compaction is the sanctioned way to
retire a claim**: it deletes cards, therefore deletes card authorship, therefore ends the attribution claim
for the days it compacts and makes the corresponding generations droppable. Two things stop that being as
reassuring as it sounds and should be said rather than discovered: **the bound is currently inert**, because
destructive compaction is safety-paused and nothing else retires a card, so every card ever written still
carries a live claim; and **exporting discharges nothing**, because the export drops attribution while the
workspace keeps showing the author, and the workspace is what makes the claim.

**TRD.** TRD §4.5, TRD §10.4 and TRD §13.7 all carry the consequence: **re-enabling destructive compaction is
an attribution-retirement event as well as a storage one**, so the replica-acknowledgement protocol TRD §10.4
requires is gating two boundaries rather than one. TRD §13.7 also keeps the two retention questions apart —
local store retention and attribution retention are different objects, and conflating them over-retains.

A smaller retention floor is possible in principle and is **not** selected here. A candidate family is a
stable signed attribution record, encrypted as a complete signed object and re-encrypted under each new
generation; the signed record would need to bind at minimum the exact attributed unit or mutation, actor,
credential, authorization epoch, and a canonical commitment to the content. If a checkpoint collects those
under one commitment, verification also needs an authenticated proof binding each retained claim to that
checkpoint. **Copying an original envelope signature beside a newly assembled tuple does not work** — that
signature authenticates the original envelope and ciphertext, not the new tuple or its association with the
current card. The TRD must select granularity, canonical record, binding to CRDT content, checkpoint
commitment and proof, rotation and migration behaviour, and an explicit storage bound; produce test vectors;
and pass independent design review. Until then the conservative floor stands.

### 7.5 The service, relay and client boundary

**Invariant.** A narrow **service-authoritative control plane** around an **end-to-end-encrypted data plane**.
**No service component parses document content or receives a content key.**

| Component                 | Responsible for                                                                                                                                                                                 | Must not become                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Authorization service** | Authenticate the account; admit and revoke device/agent credentials; assign capabilities; sign and serialize authorization epochs; issue authenticated acceptance/finalization evidence          | A content-key holder, mutation signer or document-semantic authority                                    |
| **Client envelope layer** | Encrypt outbound updates; bind workspace, epoch, credential and digest in the clear and **the attributed actor inside the seal**; sign over both; verify inbound authorization, signatures and acceptance evidence; wrap and rotate content keys | A second authorization authority, a network dependency on the local edit path, or a place where an actor identifier crosses in the clear |
| **Relay and durable store** | Authenticate transport; validate opaque envelope fields, authorization epoch and signatures; sequence and store ciphertext; carry service-signed acceptance evidence                            | A plaintext processor, CRDT merger, or source of authorization by itself                                |
| **The CRDT**              | Represent and merge document content locally **after** an envelope has passed verification                                                                                                       | An identity, authorization or recovery system                                                           |

**What the relay may decide.** Who connects, and whether an envelope's *workspace, epoch, credential,
signature, replay and revocation* metadata is valid. **What it may not decide** is whether the meaning of a
mutation is allowed. Clients remain authoritative for semantic capability and attribution checks.

**Not promised — and this correction matters, because sealing the actor is easy to over-read.** Sealing the
actor achieves something narrower than "the relay cannot tell who wrote". The relay sees a **credential
identifier** per envelope, because it validates per-credential authorization and cannot do that blind, and the
authorization state it validates is precisely what binds credentials to members and capabilities. So a relay
that can read the epoch can generally map credential to member, and can tell a device's writes from an
agent's. **The honest claim is that no actor identifier crosses in the clear**, leaving the relay to infer
from authorization state rather than read a label.

**Not promised.** This is not unlinkability. Buying that would mean an unlinkable credential-to-member
boundary — the relay able to verify that a writer is authorized without learning which member it is — which is
a much larger cryptographic commitment than anything else here, nobody has asked for it, and it is recorded as
what *would* be required rather than quietly implied by a weaker mechanism. Traffic analysis at credential
granularity — write times, rates, volumes — remains visible either way.

**Failure and lifecycle. Refusal at the relay is not the same as finalization**, and a design that stops at
refusal has a hole:

1. A credential — or an attacker holding it — signs an update referencing an epoch it legitimately holds keys
   for.
2. A hostile relay **withholds it from the accepted set** rather than refusing it, and delivers it to another
   device after that credential's revocation has committed at the next epoch.
3. The receiving client sees a validly signed envelope under a past epoch — and **must accept genuine
   late-arriving old-epoch updates**, because a device offline across a rotation produces exactly that shape.

So the epoch field cannot distinguish "accepted before revocation" from "withheld until afterwards".
**Authenticated acceptance evidence plus a content finalization boundary is what closes it**, and the
acceptance proof is needed *before* revocation too: requiring a receipt or inclusion proof on every applied
envelope means a hostile relay may hide the new authorization head but cannot supply acceptance evidence for
the withheld write. If it withholds the proof as well, synchronization stops — which is availability rather
than integrity.

**Against a relay that behaves, divergence cannot form. Against one that does not, divergence is prevented by
the finalization boundary**, which is a specified requirement rather than a designed mechanism.

**A relay can also lie in the other direction, and that one costs the user their writes rather than their
privacy.** Withholding an acceptance and returning an error is a claim that a write was refused — and a client
that believes it re-sends different bytes for the same position, which every other device reads as a credential
signing two things at once. **So an error is not an answer.** Only a signed refusal from the service, naming
that exact write, licenses a second attempt; everything else means *unknown*, and the client re-sends **the
same bytes** rather than new ones (TRD §§7.4–7.5, `S0-4`).

**That is why a device keeps its own outbound writes rather than only the edits behind them.** An edit can be
re-made; the write that carried it cannot be re-made identically, because part of it is random. A device that
kept only the edit would have nothing safe to re-send after a crash, and its choices would be to stall or to
equivocate. **A write is retained until it is answered**, and after that for as long as §8.5's migration needs
it — which is the same store, not a second one.

**One principle holds regardless: authorization reconciles before content.** Two devices settle the current
epoch, credentials and capabilities before they exchange a single document update — the same shape as the
load-before-connect rule, and it deserves the same status.

**TRD.** This is a bespoke **protocol integration**, and the distinction matters: the project owns the message
schemas, state transitions, downgrade rules, key rotation and finalization construction, and does **not**
invent cryptographic primitives, distributed authorization or a new CRDT. Standard reviewed signatures,
authenticated encryption and key-wrapping constructions are the inputs.

Three finalization shapes are available: per-envelope acceptance receipts; an append-only accepted log with
inclusion proofs; or a checkpoint plus an authenticated suffix. The middle is the closest fit to structures
already required. **A numeric high-water mark by itself is not a finalization boundary** — a compromised
credential can sign two different envelopes at the same sequence, or fill a gap the service never accepted, and
a hostile relay could then choose which to show. The accepted stream must be **non-equivocating** from a
client's point of view.

**Four things the relay is not**, each of which an ordinary local-first architecture assumes it is. It is not a
dumb pipe holding no authority and running no application logic: it validates opaque envelope metadata and carries
service-signed acceptance evidence. It is not absent-able for a workspace using hosted sync. It is not secured by
a shared bearer token, which cannot separate tenants at all. And the hosted copy is not nothing: it is a
server-held encrypted replica and a real recovery source while its retention window survives — though relay
transport by itself supplies no durable copy, and a device holds its **last** replica rather than a full one.
**The dumb-pipe property survives only in the sense that matters — no service component reads content.**

### 7.6 The recovery code

**Invariant.** **At account creation, the recovery private key is sealed to a high-entropy code the user saves
outside the enrolling device. Every account has one, and there is no account without one.**

**What the user sees.** At account creation: a generated code, an explanation of what it is for, an instruction
to store it somewhere that is not this device, and a **re-entry step before the account exists**.

**That is the only moment the code is generated and confirmed, and it is not the only moment it is used.** No
later enrollment generates a new one. But a user who has lost every device is asked to present the saved code on
a replacement device, which is the whole reason it exists (§7.7); and ordinary enrollment, where a surviving
device delivers the key, never asks for it at all (§6.3).

**Additional independent seals may be added** — PRF-capable passkeys, preferably in more than one ecosystem.
Each is a complete path to the same private key **only if it remains available after loss of the device it
protects**.

**This is 1-of-N, not k-of-n.** No threshold, no quorum, no lockout when a threshold cannot be met.

**Rejected as recovery factors**, each for a specific reason: a password or passphrase, because server-held
sealed data permits offline guessing; email or support proof, because it is escrow wearing a different label —
if a fresh device can decrypt after email alone, the service had enough capability to make that happen and the
design is custodial whatever the UI calls it; and threshold splitting, which buys nothing over 1-of-N at this
scale while adding setup, explanation and a new way to be locked out.

**Not promised — and this is a limit on the mechanism, stated rather than papered over.** **Re-entry proves
transcription and possession — that the code was recorded accurately and the user can reach it right now — and
nothing about where.** A user who pastes the code into a note on the same phone passes every test the app can
run. Claiming that enrollment confirms "an independently available copy" would let a mechanism take credit for
a property only the *copy* can carry.

**Which puts the weight on the copy, and dictates one interface choice.** The moment of generation is the only
moment the user is thinking about this, so it is where the *where* has to be said, in concrete terms: **not on
this device, not only in this browser, somewhere you would still have if this device were stolen tonight.** And
the app should assume it failed — a phone and everything bound to it is one loss event — so the device list,
the recovery surface and the durability copy should all be written for a user whose "independent" copy is on
the device in their hand.

**Not promised.** **The code is never re-displayed.** Re-display would require retaining a recoverable copy,
which this design deliberately does not do. **Replacement exists and recovery-by-re-display does not**, and
calling replacement "recovery" would hide the distinction.

**Replacement** is allowed only from a device that already has content access: after fresh account
authentication and an explicit confirmation, it creates a new recovery keypair, seals the new private key to a
newly confirmed code and optional independent factors, rewraps every required content-key generation to the new
public key, and asks the service to atomically replace the old public key, wraps and sealed envelope. **It
cannot help after the last content key and the old code are both gone.**

**Replacing an *exposed* code rotates the content key forward; replacing a merely *lost* one need not.**
Rewrapping re-encrypts the same keys to a new recipient, so whoever holds the old private key keeps everything
it already opened — including what is written after the replacement. Where the user is replacing because the
code was **seen**, that is not a repair, and the flow rotates. Where it was mislaid and no copy is believed to
exist, the rotation may be skipped — but only if the product can tell those two situations apart and says
which one it acted on. **Offered as the answer to an exposed code, "replace your code" must rotate**, or it
promises something it has not done.

**Failure and lifecycle.** **PRF's optionality is not a product branch here, and that is a consequence of
making the code mandatory.** An authenticator that returns no PRF result costs its owner an optional
convenience wrap and nothing else: no branch, no device-dependent security bar, no silent downgrade. A
device-bound PRF wrap may still protect that device's persisted key without counting as an all-device-loss
recovery factor.

**What this leaves genuinely unserved, said plainly rather than engineered around.** A user who will not take
custody of anything has **no non-custodial recovery path** — not from a second code, not from a second passkey,
not from an archive. That is not a gap in the design; it is what non-custodial *means*. The answer for that
user is the separately operated opt-in escrow add-on (§7.3), and it is the only honest answer that exists.
Every product that appears to serve that user without escrow is either custodial and not saying so, or is
about to lose someone's data.

**TRD.** Code entropy and generation are **selected** (TRD §13.8, TRD §15 row 14): the code is **generated at
125 bits and shown as five groups of five**, in an alphabet that omits the characters people confuse, so that a
correct transcription of a badly rendered code still opens the workspace. **It needs no stretching**, and that
rests on an invariant this document should hold too: **the code is generated by the app at full width and is
never user-chosen, never user-extended, and never displayed or accepted truncated.** Step-up authentication is
**selected** with it: a **bound challenge rather than a freshness window**, answered by the account credential and
binding the transition's own id, so an assertion collected for a `replace-recovery` cannot be redirected to a
`retire`. **Confirmation UX remains open** and belongs to the protocol review.

### 7.7 Recovery: four separate objects

**Invariant.** Four different things may be missing, and no mechanism supplies another's:

1. **Account access** — can the service recognize the person again?
2. **Authorization** — will the service admit a new credential as a legitimate device and establish a new
   epoch?
3. **Content-key access** — can the current and stored generations be decrypted?
4. **Ciphertext availability** — does any copy of the encrypted workspace still exist?

**Who supplies what.** Account recovery supplies 1 and 2. The saved code or another independent wrap supplies
3. A surviving device, the hosted copy or a fidelity archive supplies 4.

**What the user sees.** After losing every device: account recovery restores authorization on a replacement
device; the independently stored code unseals the recovery private key; the hosted copy supplies ciphertext
and the generations wrapped to the recovery public key. Together those complete workspace recovery.

**Not promised.** **Authorization does not decrypt.** A recovery code cannot recover a workspace that no
longer exists, and a server backup cannot recover one whose only recovery private key is gone. There is **no
honest "forgot password" flow** for a content key the service cannot recover.

**Not promised.** **Artifacts count by independent failure domain, not by name.** A lost phone commonly takes
its device credential, a device-bound passkey, its local ciphertext and any recovery text saved on that phone
with it — four artifacts and **one** loss event. A recovery path counts only if it remains available after the
loss it is supposed to recover from; several wraps synchronized by one credential ecosystem are similarly not
several independent paths.

**Not promised.** **The fidelity archive is not a recovery factor.** It answers object 4 and never object 3. A
user who holds an archive and has lost the code has an encrypted file and no way in. Keeping those two objects
distinct is what stops the survivability package from looking complete while a whole class of loss remains
unaddressed (§8.3).

**Failure and lifecycle.** Where recovery genuinely fails, the true answer is that the workspace is
unrecoverable, and **that sentence is only survivable if nothing earlier implied otherwise** (§7.10).

### 7.8 What is promised, and what is not

**Invariant.** This is the minimum claim the product's other decisions already imply. **A protocol that cannot
meet every claim in the middle column reopens the decision that forced it.**

| Attacker or event                                       | What must remain true                                                                                                                            | What is **not** promised                                                                                                                    |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Knows the relay URL and workspace identifier            | Cannot decrypt content, become a member or create an accepted mutation. **A workspace identifier is an identifier, never a bearer secret.**       | Preventing anyone from reaching a public endpoint; rate and resource abuse are a service-availability problem                               |
| Passive network observer                                | Learns no content or reusable credential from traffic; transport security applies outside the content encryption                                 | Hiding that traffic exists, its rough volume, or the network addresses involved                                                             |
| Relay reading envelope metadata                         | The attributed actor is not directly present in envelope metadata — it is inside the seal                                                        | **Not unlinkability.** The relay sees a credential identifier per envelope and validates authorization state binding credentials to members, so it can generally tell which device or agent wrote. Write times, rates and volumes per credential are visible |
| Relay reading awareness metadata                        | Awareness contains no document plaintext or content key and is not persisted by default; its state expires with the live connection              | Concealing names, colours, cursor positions, workspace association or connection timing from the relay while live                            |
| Malicious or compromised relay                          | Cannot read content, forge an accepted mutation, sign an authorization epoch, make an already-seen older epoch look current, **or land a revoked credential's withheld old-epoch write after the commit** | It can delay, omit, reorder or refuse bytes. End-to-end encryption supplies confidentiality and integrity, not availability |
| Malicious or compromised authorization service          | Cannot decrypt content, forge an existing device's mutation, or cause content-key delivery by authorizing a credential                            | It can admit or revoke credentials, change capabilities, choose the authorization state it recognizes, suspend the account or deny service   |
| Leaked relay bearer token                               | Does not decrypt content, sign a mutation, authorize a device or recover an account; it is scoped, expires and can be refused independently       | The holder may consume relay service and obtain ciphertext or metadata until refusal or expiry                                              |
| Compromised authorized device or agent                  | Cannot impersonate another actor, exceed its capability, or survive revocation by inventing authority it was never granted                        | It can read everything its capability permits, copy it forever, and make every malicious edit its capability permits until revoked           |
| Revoked credential                                      | After the applicable commit point, cannot add an accepted write or decrypt a later content-key generation                                        | Erasure of any plaintext, key or ciphertext it obtained before revocation                                                                   |
| **Copied browser profile** | Required factor custody prevents a supported copied profile without its external factor from opening retained content or receiving successor keys; full-profile tests gate the claim (§7.2) | Live hostile origin code after unlock, OS memory/swap artifacts, historical plaintext, older promptless copies and secure erasure; non-extractability alone proves none of these |
| Unlocked device or running app                          | After the service revokes its credential and the content key rotates, the attacker cannot extend access into the new generation                   | Protection while the attacker can run the app as the user, read its plaintext or exercise its current device capabilities                    |
| Same-origin XSS, compromised dependency or bad release  | The recovery private key remains absent during ordinary operation. After hostile code is removed, the service can revoke operational credentials and a clean device can recover content and rotate its keys | Confidentiality or integrity **while** hostile code runs with the app's origin and privileges, including any recovery material entered then. Client-side encryption cannot provide that |
| All devices and authenticators lost, ciphertext remains | Account recovery restores authorization; the independently stored factor unseals the recovery private key; the hosted copy supplies ciphertext and wraps | Authorization does not decrypt, the recovery factor does not restore the account or missing ciphertext, and no party substitutes for a lost content factor |
| Service outage or disappearance                         | Existing local workspaces remain readable and writable; no local operation awaits the service                                                    | Server-mediated sync, server-held recovery material, or a promise that the service's copy remains reachable after the service disappears     |

**Two phrases carry more work than they appear to.** **Already-seen** is the bound on rollback protection: a
returning client can remember the newest authorization head it has seen and reject an ancestor, but a
brand-new client trusts the service to identify the current head. And **accepted mutation** is stronger than
"valid signature": a removed device can sign an update under an old epoch and lie about when. The answer is
authenticated acceptance evidence plus the service's committed ordering (§7.5); a client-supplied timestamp is
not an answer.

**Copied storage and a running device expose different capabilities.** Ciphertext beside a usable
persisted opener remains decryptable; a non-extractable API handle alone does not prevent filesystem
recovery of its underlying key. Required factor custody closes the persisted opening paths within
§7.2’s supported-profile scope. It does not contain hostile code in an already unlocked runtime.

**One thing is deliberately not required: forward secrecy.** A read-capable device must be able to materialize
the current workspace, including its accumulated content, which is persisted as ciphertext that device can
already open. A per-update ratchet therefore does not hide the current workspace from an attacker controlling
an unlocked authorized device. It should not be built by default; a stronger historical-confidentiality claim
would have to reopen the question explicitly.

### 7.9 Where device secrets live

**Invariant.** Device signing and wrapping private keys are **non-extractable at runtime**. Persistent custody distinguishes current stores from migration input:

- **New persistent credentials** are sealed under required factor custody; a separately role-bound
  device-key PRF can additionally protect them without adding a promptless route. They are imported as
  non-extractable runtime keys after unlock.
- **Legacy promptless credentials** are migration input only and require replacement when they can
  receive future content keys (SC-08). PRF absence never selects a promptless fallback.

A non-extractable target key is **not** described as "wrapped": wrapping is an export operation and cannot
wrap a key whose extractability forbids export.

**What the user sees.** **The device list shows which tier a device is on.** A two-tier bar is acceptable; a
silent one is not.

**This unlock gates sync, not the app.** Reading and writing locally never waits on it, because these
credentials sign envelopes and receive new keys — they do not open the local store. Local custody is a
separate role and requires factor unlock at cold start (§7.1, §7.2).

**Not promised.** `extractable: false` is a useful misuse guard, **not an XSS containment boundary.** The
specification explicitly allows a key to be shared across origins with structured clone and warns that
injected script may post it to an attacker-controlled origin, which can then keep using it. It also makes no
normative promise that the underlying material is hardware-backed, encrypted on disk, or inaccessible to
another process with the user's privileges. **Non-extractable means one API refuses to export the raw bytes;
it does not mean the capability cannot leave.**

**Not promised.** WebAuthn is not a drop-in mutation-signing key. Assertions are user-agent-mediated ceremonies
over a challenge; the workable shape is to derive a wrapping key from a PRF output and unlock an ordinary
device credential, not to invoke WebAuthn per update. The PRF output is deliberately returned to the client,
which is why it strengthens storage at rest without changing the same-origin-code boundary.

**What the PRF wrap buys, precisely.** It protects the *persisted wrapper* against an attacker who has the
browser profile but cannot produce a platform assertion — a stolen laptop, a copied profile, an OS backup. The
value is concentrated in the window *before the owner knows to revoke*. It buys nothing against live
same-origin code.

**Failure and lifecycle.** This was chosen against a smaller threat than the option space implies: a
compromised device key cannot change service authorization and cannot unseal the recovery private key. What it
can do is read what its capability permits and write as its actor until revoked. So the real question is *how
much should it cost to protect a write capability that revocation already bounds*, and the answer is "the cheap
options, both of them" — not the one that changes the distribution model.

**Four factor roles are distinct even where one authenticator ceremony supplies more than one**, and their
outputs are domain-separated and never substituted: the account authenticator / local slot verifier, the
device-key PRF, the required content device lock, and any optional recovery-factor PRF. Opening a slot is not
creating an account session; unlocking an operational signing key is not recovering the recovery private key;
and recovering the recovery private key is not an account assertion. Sign-out clears their live outputs with
the rest of the slot's in-memory state; it does not destroy their persisted representations.

### 7.10 What the user is told about durability

**Invariant.** An app whose central claim is local-first **must not be quiet** about a context where the data
is not durable. Three conditions, and only the first is a warning at all:

| Condition                                                  | Clears?                             | Treatment                                                                    |
| ---------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| **This context is not durable** — persistence not granted  | Yes — grant it, export, or move     | Prominent, persistent, names the reason and the action                       |
| **Only this device is known to hold a copy**               | No — export or sync creates another | Stated once, at the moments it is actionable; never a recurring banner       |
| **The hosted copy needs your code** — by construction      | No — it is what non-custodial *is*  | Stated once at account creation, and again wherever recovery is described    |

**A single edit can be in the first condition too, and the right response is silence rather than a warning**
(`S0-3`). The crash journal is what makes an edit durable the moment it is accepted; when it cannot take one —
an operation too large, an exhausted store, storage that is not there — that edit is *not durable yet*, and it
becomes durable when the database commits a moment later. **So what is withheld is the acknowledgement, not a
banner shown.** On the refusal path the document itself waits for its carrier, so the screen never shows what
this section would have to disclaim: under storage pressure an edit lands late and durable rather than instant
and precarious (`P-3`). A warning for a condition that clears in milliseconds would be exactly the noise the
table above refuses; a *saved* that is not yet true is the thing this section exists to prevent. The three
causes reach one state deliberately, so no path can handle two of them and believe it has handled the case.

**Warn about the property, not the diagnosis.** "You are in private browsing" should be resisted: private-mode
detection is unreliable and every reliable-ish technique is a fingerprinting vector browsers are closing.
What is knowable is the consequence — the storage-persistence API answers it directly. Likely causes may be
offered as explanation without being claimed as fact.

The reasons that need distinct copy, because they have different actions:

| Situation                    | Detectable?                    | The action                         |
| ---------------------------- | ------------------------------ | ---------------------------------- |
| Persistence never requested  | yes                            | request it                         |
| Requested and denied         | yes                            | explain; route to sync             |
| Storage API absent           | yes                            | route to sync                      |
| Insecure context             | yes                            | fix the deployment; dev-only       |
| Private or ephemeral context | **not reliably**               | report the property, not the cause |
| Eviction risk on an old OS   | engine-inferable, not directly | route to sync                      |

**Not promised.** A warning that can never be cleared is noise rather than information. Where persistence
cannot be granted there are **two** honest resolutions and the local one is named first: **export**, which is
free, immediate and already built; and hosted sync. **A storage warning must not function only as an
account-acquisition surface.**

**Not promised.** The grant interaction is not ours to design — one browser shows a permission prompt in a
location we do not choose, another decides silently on engagement heuristics, and an installed PWA may simply
be persistent without ever asking. Re-check on every launch rather than trusting a past grant.

The sidebar's **Install** button explicitly checks and requests persistent local storage. It also opens
the native app installation prompt when the browser makes one available. On browsers with manual-only
installation, show applicable instructions; on combinations without installation, offer the storage
check alone. In particular, desktop Firefox on macOS has no browser-menu installation instruction.

**The second row is a description, not a deficiency.** A single local device holding the only copy is what a
local application on one computer *is* — the same kind of statement as a text editor saving to one disk. It
is a measured or known property of this workspace, not something inferred from a label, and it belongs to the
surfaces that describe setup and to the moment the user is about to do something that assumes a second copy.

**The third row is the one that will be got wrong, because the mistake is silence rather than a false
sentence.** Nothing has to claim "we can restore your data" for an account-holder to believe it; *"your list is
backed up to our servers"* is true, and a reasonable person reads recovery into it. So the copy has to carry
the dependency in the same breath as the reassurance — **the hosted copy is real, and the code is what opens
it** — at account creation, in whatever describes the account's storage, and at the moment the code is
generated.

**Failure and lifecycle. The sentence that has to exist before it is needed:** for a user who has lost every
device and cannot find the code, the true answer is that the workspace is unrecoverable. **That sentence is
only survivable if nothing earlier implied otherwise.**

**One test to apply to any copy written here**, because it is the test an outside reading will apply: *would
this sentence exist if the product had no business model?* "This is the only copy of your data — export it, or
turn on sync" passes. "Your data is not safe until you create an account" does not.

**TRD.** The storage state is currently reported into a menu the codebase itself describes as usually closed —
honest and invisible at the same time, which is the gap.

### 7.11 Presence, metadata and the service data boundary

**Invariant — presence.** **Awareness remains outside content encryption.** The relay may learn who is editing
which workspace and when, while learning nothing about the text. It is **ephemeral by default and must not be
durably retained.**

**Not promised.** Presence does not conceal names, colours, cursor positions, workspace association or
connection timing from the relay while a connection is live. Encrypting awareness later is a permitted
strengthening; **retaining** it requires a separately stated product purpose and retention rule. This is a
threat-boundary claim, not an interface detail, and it must not disappear inside a content-encryption decision.

**Invariant — the service data boundary.** Seven constraints, fixed now because they are the things expensive
to retrofit. They constrain the technical design without prescribing its service split, tables, vendors,
retention durations or backup mechanism:

1. **No synchronization, account or authorization component receives document plaintext, a content key, an
   unsealed recovery private key or a recovery factor.** Ciphertext, the recovery public key, generation wraps
   and sealed private-key envelopes are not exceptions. A user may still deliberately send exported content to
   someone, including support; that is an explicit disclosure, not a decryption capability in the service.
2. **Every subject-bearing persisted record has a deletion scope.** Account-, workspace-, device- and
   credential-related data must be attributable to the subject whose deletion, export or correction acts on
   it. Aggregated operational measurements must not quietly retain subject identifiers.
3. **No reusable credential or recovery secret enters logs, telemetry or support artifacts, and no plaintext
   document content is collected there automatically.** Diagnostics use an explicit allowlist rather than
   attempting to redact arbitrary objects after collection. User-supplied support material is an explicit,
   separately scoped disclosure with its own retention rule.
4. **Service suspension and service-side deletion never disable an existing local replica.** Deletion can
   remove service-held material and future access; it cannot recall bytes already copied to an offline device
   or agent.
5. **Operator powers are explicit, least-privilege and auditable.** Support may diagnose service state but
   cannot bypass content encryption; authorization changes, suspension and exceptional access to account
   metadata leave an audit record.
6. **The necessarily visible metadata surface is bounded and named.** To authenticate and route, the service
   may process account and workspace identifiers, credential/device/agent identifiers, membership and
   capability state, authorization-lineage state, connection addresses, and per-credential connection and
   write times, rates and volumes. Those facts are not content, but neither are they harmless or licensed for
   blanket retention.
7. **Presence is relay-visible while live and ephemeral by default**, per the invariant above, and must not
   inherit the retention of workspace ciphertext.

**Failure and lifecycle.** **The inventory follows the architecture, not the other way round.** As a store,
queue, log, telemetry event, backup or processor is introduced, its design record adds one compact row:

> data class · purpose · subject/deletion scope · storage or recipient · retention · deletion event ·
> operator visibility · third parties

That record lives beside the schema, service or infrastructure definition that makes it true and changes with
it. An exhaustive prior inventory would be speculative and would immediately drift; surveying only at the end
is too late where storage topology has already made deletion, isolation or least privilege expensive.

**The as-built review is a release gate, not a design gate.** Before availability is widened beyond development
or a deliberately bounded test audience, review the deployed inventory, processor list, operator roles, backup
expiry, deletion/export behaviour, incident path, and jurisdiction- and audience-specific legal surface. **The
evidence is generated deletion and export tests and a reconciliation against deployed infrastructure**, not the
existence of a long policy document.

**TRD.** The inventory starts with the TRD's proposed stores and flows: **TRD §16 is the register**, with a row
per store, queue, log, backup and processor that its architecture introduces, scoped to service-held data
because device-local stores are ciphertext under keys the service never holds. Implementation reconciles it
to what is actually deployed, and moves each row beside the definition that makes it true. Vendors, processors,
backup behaviour, log fields, support workflows and retention periods are decided there rather than guessed
here; a row that says `unselected` is the placeholder this review checks against.

### 7.12 What counts as evidence

**Invariant.** A threat table does not make a claim true. The contract needs conformance tests for its own
invariants and a declared level of independent scrutiny.

**And a passing check does not make a claim true either, if the claim is larger than the check.** That is the
same failure one step along, and it is harder to see, because the evidence is real — it is simply evidence for
something narrower than the sentence printed beside it. Three of this project's own controls had it at once
(`S0-1`): the suite's separation check classified roles by matching labels, so a role labelled with a word it
did not recognise entered no bucket and could not be caught; the origin scan failed on seven ways of writing a
remote URL and passed a `fetch()`; and the WebAuthn verifiers read three fields of client data and not the two
the specification adds for a relying party to judge. **Every one of them reported green while enforcing less
than it said.** So the rule this section owes itself is that **a check's conclusion states what it tested**, and
where it cannot test the whole claim, it names what covers the rest.

**Fifteen test cases, stated as tests rather than prose:**

1. A client with only an endpoint and workspace id cannot retrieve usable content or add an accepted envelope.
2. A relay token cannot be used as a mutation credential, content-wrapping key or recovery proof; expiry and
   refusal do not block local use.
3. Changing the workspace id, actor, capability, epoch, ciphertext or update digest invalidates an envelope;
   an envelope cannot be replayed into another workspace.
4. A client that has witnessed an epoch rejects an ancestor as current, and the service serializes successor
   commits so two concurrently produced successors resolve to one accepted epoch with the loser refused rather
   than forked.
5. After a committed revocation — authorization successor, key rotation and finalized cutoff — the removed
   credential cannot decrypt a new generation or create a newly accepted write, while its historical local copy
   remains usable.
6. **A hostile relay withholds an envelope signed by the revoked credential that is absent from the committed
   accepted set, then delivers it after revocation; every client refuses it.** **The mirror case is tested
   too** (`S0-4`): the relay withholds an acceptance and returns an error instead, and the sender re-sends the
   identical bytes rather than re-minting — a crash between minting and sending, and between sending and the
   reply, each resolve to one accepted write and never two. An envelope from that credential
   included in the pre-commit accepted set is still admitted, as is a genuine late-arriving old-epoch update
   from a still-authorized offline device.
7. **Authorization alone cannot cause content-key delivery.** A malicious authorization service admits a
   credential it controls and presents a valid successor epoch; every existing client refuses to wrap or send a
   content key without a separate user-mediated content-delivery proof.
8. **A workspace is migrated, not succeeded, with the original service unreachable.** A clean device restores
   independently held ciphertext using the content-recovery factor, creates an account at a replacement service
   under a new lineage, then admits and revokes a device. Nothing claims the new service inherited the old
   one's authority.
9. A relay or durable-store snapshot contains ciphertext, the recovery public key, content-key wraps, public
   authorization material and explicitly accepted metadata — **no** unwrapped content key, plaintext, reusable
   device secret, PRF output, recovery code or unsealed recovery private key. A code-sealed private key may be
   present and is not a finding; the test is that nothing in the snapshot **opens** it. **Repeated against the
   escrow agent's store, which must contain a separately sealed private key and no ciphertext** — the two-party
   property is real only if neither store alone is sufficient.
10. Every recovery path is exercised after loss of one device, all devices, a device-bound passkey, an
    independently synced passkey, the account session and the service, with the result checked separately for
    all four recovery objects. A device plus every artifact bound only to it is treated as **one** correlated
    loss; loss of every independent content factor is an expected permanent-loss outcome, not a bug.
11. Unsupported PRF, interrupted enrollment, duplicate recovery, concurrent authorization changes and a
    half-completed account deletion fail closed without silently changing the confidentiality promise.
12. Mutation verification and first-sync checkpoint verification meet the latency and history-size budgets
    without moving cryptography onto the keystroke or local-replay path.
13. **No app-managed persistent store yields user-content plaintext.** A profile snapshot taken after ordinary
    use — every database, the journal, and any derived index — is inspected for recognizable content at genesis,
    at Local, at Account, and after deletion, expiry and migration. The journal is checked specifically for an
    unencrypted window between transaction and commit, and the synchronous AEAD against its latency budget on a
    low-end device. **Copied-profile custody is tested separately**: without its external factor, a restored
    supported-browser profile executing the app's origin cannot open retained content or obtain successor keys;
    with the factor, offline recovery succeeds. A deliberately planted promptless opener must make the attack
    succeed, proving that the test detects that failure. A plaintext scan alone does not establish this property
    (§7.2, TRD §11.1, SC-08).
14. The web application is verified as part of the cryptographic boundary: no unreviewed third-party script
    executes in the key-holding origin; injection controls, CSP, Trusted Types where supported, dependency
    integrity, service-worker update integrity, cookie attributes and origin checks are tested. **Two halves,
    and each names what it does not cover** (`S0-1`): the build fails on any remote origin appearing literally
    in shipped output, and **CSP is what covers a URL assembled at runtime or code fetched and evaluated**,
    which no static scan can see. **Origin checks include the embedding policy** — an assertion collected in a
    delegated frame is refused by the verifier and made unreachable by `frame-ancestors`, and the two are
    independent on purpose.
15. **Promotion and migration cannot be confused.** A never-established Local workspace is admitted under a
    device-signed genesis checkpoint binding its pre-account actors, retaining its existing generation and
    creating the first recovery keypair. Repeating with a terminal lineage package instead preserves historical
    attribution, retains the recovery identity where available, rotates to a fresh generation and creates a new
    lineage. Neither path copies the source database or accepts an old-lineage envelope into the new accepted
    set.

Test 14 is unavoidable because **same-origin code is inside the end-to-end boundary.** A passkey is
phishing-resistant because it is bound to the relying-party origin; it does not distinguish the intended app
from hostile script served at that legitimate origin.

**Five cumulative assurance levels, and where each lands:**

| Level                                       | Evidence produced                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1. Project-owned threat model and tests     | This contract, protocol vectors, negative tests and CI controls                                     |
| 2. Versioned web-security baseline          | **OWASP ASVS 5.0.0 at L2 as a floor**, plus named higher-level requirements and an addendum for what the standard does not cover (TRD §10.9) |
| 3. Independent protocol design review       | Review of authorization, key delivery, envelopes, epochs, rotation, recovery and downgrade handling |
| 4. Independent implementation audit         | Review and testing of the shipped client, relay and deployment against the contract                 |
| 5. Ongoing disclosure and response program  | A vulnerability-reporting path, rotation/recovery runbook, dependency monitoring, incident drills   |

**Levels 1–3 before network sync ships. Level 5 live from the day it ships. Level 4 on a stated trigger.**

**"Ships" means the first deployment that carries data belonging to anyone but the author** — a deliberately
bounded test audience included — **or any public description of the security properties.** The author
synchronizing his own devices through his own service is development and precedes every gate. This is a
narrower boundary than §7.11's as-built data review, which binds later, at *wider* availability; a bounded test
audience sits between the two.

- **Before sync ships:** the project-owned threat model and conformance tests; a recorded, versioned
  web-security baseline profile; and an **independent protocol design review**. **The baseline profile is
  selected** — OWASP ASVS 5.0.0, at L2 as a floor rather than as a target, because a standard written for
  applications with a server that holds user data covers this one's actual surface thinly: it has a single
  requirement about browser storage and none at all about offline operation. What that costs is a recorded
  deviation and a short addendum, both of which are better than a level chosen high enough to look thorough
  (TRD §10.9).
- **Level 3 is two engagements**, because encryption at rest ships well before network sync and the synchronous
  journal AEAD is the only new construction in the plan. A narrow **storage and journal review** is answered
  before the first deployment writes real data under that construction; the **protocol review** is answered
  before sync ships. One combined review would either arrive too late to protect the storage work or hold it
  until the protocol was specified.
- **From the day sync ships:** the disclosure and response program. A vulnerability-reporting path that does
  not exist when the first report arrives is the cheapest possible thing to get wrong.
- **Level 4 is required before either of two triggers:** the phrase *end-to-end encrypted* appearing in
  marketing copy, or the escrow add-on holding a real key.

**Not promised.** Level 3 does not prove the implementation follows the reviewed design. Level 5 cannot
compensate for an incoherent key hierarchy or recovery model. And a versioned web-security baseline says
little about a bespoke cryptographic protocol.

**Failure and lifecycle. The sequencing is real and is not schedule padding.** Level 3 waits until the
technical document supplies concrete authorization state, envelopes, key rotation, finalization and test
vectors — booking a design review of product-level boundaries alone buys an opinion about a sketch. And level
4 is triggered rather than required at ship because an implementation audit has to repeat after
security-boundary changes, several of which are still pending: the storage-encryption and journal-AEAD work,
the escrow add-on, and the evolving as-built data flows. Buying the audit before those settle purchases
evidence about a system that will not be the shipped one. The triggers are chosen so the audit lands before
the two moments where its absence would make a claim dishonest rather than merely unproven: **saying the
words, and holding someone else's key.**

---

## 8. Portability and service continuity

### 8.1 Export

**Invariant.** Export produces a zip of plain markdown, with no server involved, at any time, from any
replica. Plain markdown is the permanent **escape** format: its job is that another program can read your
writing.

**What the user sees.** `master.md`, one file per day, and `unfiled.md` where retained cards have no visible
collection. The master list is dumped verbatim — it is already markdown.

**Not promised.** **Plain markdown is the wrong *round-trip* format**, and this is the format doing its own
job rather than a defect. Card identity does not survive it, and card authorship is not in it. A byte-identical
export → import → export round trip is a **format** guarantee and does not supply identity.

**Failure and lifecycle.** Export is the free, immediate remedy offered first whenever durability is in
question (§7.10), and it is what a user takes before a destructive local operation.

**TRD.** TRD §9.1 specifies the layout and the byte-identical round trip, and enumerates the four fields the
format deliberately drops — `id`, `author`, `origin` and `createdAt` — with the consequence of each.

### 8.2 Import

**Invariant.** **Import is a requirement of equal standing with export.** An export without an import
preserves the writing and not the continuity of the application.

**Import creates a workspace's contents; it does not merge into a populated one.** That serves the first
deployment's migration and a clean-install restore, which is what import is for.

**Import is a maintenance operation, not an authoring one**, and its placement follows from that:

- **Outside the freeze.** A migration import is the app reconciling histories rather than a person editing the
  past. Gating it the way an edit is gated would silently drop every day older than three, which on a ten-day
  export is most of it. The precedent is not novel: compaction is already an app-level system operation held
  outside the freeze by explicit design, so the code already distinguishes *authoring the past* from
  *maintaining the store*. Import is the second member of the second category, not a hole punched in the first.
- **Outside the cap.** The cap binds the paths that author and does not bind replication; import sits on the
  replication side, so imported items do not silently vanish at three.
- **Attributed to the system actor**, which is what the system actor is for.

**Not promised.** Merging into a populated workspace is a different project, and two gates make it so. **Days
collide by construction**, since entries are keyed by date and both sides have that date. And **no card
identity survives the round trip** — cards are markdown list items, nothing distinguishes re-importing the same
file from importing new content, so import is not idempotent and duplicates on every repeat.

**Failure and lifecycle. What a non-empty import would look like if it is ever built**, recorded so the shape
is not re-derived:

- **The text half is easy and manual.** A second master list is appended beneath a horizontal rule and a label
  saying where it came from, and the user cleans it up. No per-character merge, no adjudication.
- **The structured half is the unsolved part**: day collision and duplicate suppression without ids.
- **A mechanical CRDT merge is available and meaningless, which is the argument against it.** Two independent
  documents *can* be merged, and the result is interleaved text and both sets of cards in arbitrary order. The
  objection is not that it is impossible; it is that the sophisticated version converges on the manual version
  above, having first destroyed the thing it was meant to preserve.

**The eventual answer is a format question already on the roadmap**, not a new one: the encrypted fidelity
archive carries CRDT state, which is what makes card identity survive (§8.3).

**TRD.** TRD §9.2 carries all three: that import is scoped to an empty workspace; that it sits outside the
freeze and outside the cap as a maintenance rather than an authoring operation, attributed to the system actor;
and that the byte-identical round trip is a **format** guarantee which does not supply card identity. It also
states the parsing rule that keeps the format unambiguous — column-zero `- ` list-item starts — so that a card may
itself contain blank lines without becoming its own boundary.

### 8.3 The fidelity archive

**Invariant.** A second artifact with a different job from the markdown export: an **encrypted fidelity
archive** containing CRDT state, retained content-key generations, the recovery public key, the sealed
recovery private key where an account recovery identity exists, and the material needed to resume. **This is
the exact restore format.**

**What the user sees.** Something the app drives — a periodic verified archive, or a destination configured
once — rather than something the user is trusted to remember. This is the one requirement here with a recurring
cost to the user's attention rather than a one-off engineering cost.

**Not promised.** **It is not a recovery factor**, and having its own code does not make it one. It answers
*does any ciphertext still exist* and never *can you decrypt it*. A user who holds an archive and has lost the code has an encrypted file and no way in. It
improves **durability** and **portability**, not **recoverability** (§2.4).

**A purely Local archive has its own code, and until now it had nothing** (`S0-6`, `P-6`). It has no account
recovery keypair to borrow, so it holds a key of its own, sealed under a generated code of its own — and
without that, a Local archive was an encrypted file that **nobody could ever open**, including its owner, in
precisely the situation it exists for. That was not a gap in the copy; it was a gap in the design, and the
paragraph that used to sit here described the hole rather than filling it.

**One code per workspace, not one per archive.** Archiving is meant to be something the app drives on a
schedule, and a code per run would be the recurring attention cost this section already refuses. One code
covers every archive of that workspace, saved once.

**The app asks for it back once, before it calls any archive restorable.** Until then, the honest description
of an archive is the one above: ciphertext, and no way in. A show-once warning would leave the app claiming
restorability on no evidence, and the consequence of being wrong here is total. Because the code is
per-workspace, that ceremony is paid once and never again.

**Replacing the code protects future archives, not past ones**, and the copy has to say so. Files already
written are bytes at a destination the app may not be able to reach, rewrite, or even list. A user who changes
the code will otherwise assume the old files rotated with it — the same misunderstanding §7.6 has to head off
about the recovery code, in a place where nothing can compensate afterwards.

**When a Local workspace becomes an account, the archive code retires to legacy.** New archives are ordinary
packages under the account recovery identity; the old code keeps opening the archives written before, and the
product says which is which rather than leaving two live codes to tell apart.

**Failure and lifecycle. The archive is load-bearing in exactly one cell and partly in one more**, which is
narrower than "you must keep an archive":

| Service | Devices        | Who holds usable bytes                                                    | Archive load-bearing?    |
| ------- | -------------- | -------------------------------------------------------------------------- | ------------------------ |
| Alive   | ≥1             | The service plus each device's last replica                                | No                       |
| Alive   | 0              | Service ciphertext and generation wraps, opened with the code-sealed key   | No — this is §7.7        |
| Gone    | ≥1, current    | The surviving device, migrated to a new service                            | No                       |
| Gone    | ≥1, **stale**  | That device, minus everything since it last synced                         | **Partly — for the gap** |
| Gone    | 0              | Nothing, unless the user already holds an independent ciphertext archive   | **Yes — only here**      |

Deliberately not the word "complete": a device holds its **last** replica, not the workspace as it last stood.
Hence the fourth row — a device that went in a drawer before the wind-down is an independently controlled copy
that is still short a month, with the relay gone and no other device willing to sync with it.

Because the last cell is usually reached through one of the others, the archive's main job is protecting the
user who was not paying attention during a wind-down window, or for whom the two events were not separated in
time. **Shipping a self-hostable relay does not put any bytes in it** — software you can run after the fact
cannot reconstruct data that only ever lived in an account that has been closed.

### 8.4 Independently runnable software

**Invariant.** **Software continuity comes from an independently runnable client and service stack, not from
preserving this operator.** Publicly available open source is the ordinary and preferred way to satisfy that.
A triggered source-escrow or wind-down release with perpetual build-and-run rights is an acceptable but weaker
fallback. **Binary availability alone is insufficient**: it helps an orderly handoff but does not let an
arbitrary user reinstall after browsers, operating systems or signing requirements change.

**What the package concretely requires**, so it can be scoped rather than admired:

- Independently obtainable source and release artifacts for the **client, authorization service, relay and
  durable store**, under terms permitting indefinite independent operation. Open-sourcing only the UI preserves
  neither sync nor recovery.
- Build and deployment instructions with pinned dependencies and checksums.
- A documented, versioned envelope and checkpoint protocol.
- Endpoints configurable without editing workspace content.
- Export **and** import.
- A standalone recovery and inspection tool.
- A user-held recovery secret.
- A tested migration that creates a new account and authorization lineage without importing the former
  service's authority.

**Not promised.** A wind-down mechanism that mails people a download link is precisely the shape this rejects
as sufficient, because it requires the company to exist and act exactly when the scenario assumes it does not.
**Who serves any of this after the company is gone is deliberately not answered here** — continuity comes from
independently runnable software and material the user already holds, not from the operator arranging anything
at the moment of failure.

**Not promised.** An orderly corporate succession may keep the hosted service running, and enough users may
make that commercially likely. **That is welcome operational continuity, not the architectural guarantee**:
the product must remain recoverable when there is no buyer, no cooperative wind-down and no original domain.

**Failure and lifecycle.** **Custody is not replica count.** Three processes, machines or buckets under one
provider account, billing relationship, domain and operator improve availability against machine and regional
failure and do nothing about closure of the account, loss of the domain, or a deliberate shutdown. **One
independently controlled copy is worth more than three operator-controlled ones.**

The two rows that carry most of what a user means by "outlives the company" are the two substantially in hand:
opening and editing on a device that already has it, and reading the data without this app. The rest —
reinstalling on a replacement device, continuing to sync between existing devices, restoring after losing every
device, admitting or revoking a device, moving to another service — do not follow from local persistence and
would not have followed from peer-to-peer either.

**TRD.** Drawing the interfaces is cheap now and expensive later, and does not require deploying five
services. **The first deployment may remain one small process, provided its interfaces already distinguish**
rendezvous and connection authentication; ephemeral live fan-out and awareness; durable encrypted envelopes and
checkpoints; authorization signing and accepted-set finalization; and account storage. That separation is what
later lets retention, replacement and self-hosting boundaries be drawn without a rewrite — and it keeps
ephemeral presence data from silently inheriting the retention policy of durable workspace state (§7.11 above).
TRD §7.3 draws exactly those five interfaces.

A **content-blind durable store cannot merge what it holds**, so it needs a bounded recovery representation:
immutable authenticated envelopes; a client-produced authenticated checkpoint; a manifest binding that
checkpoint to its authorization head, content-key generation, covered range **and an authenticated coverage
attestation**; the update suffix after it; and retention rules for superseded checkpoints. The attestation must
cover insertions *and* deletions — a snapshot's state-vector-plus-delete-set pair, or a receipt for that
specific checkpoint — because **a bare state vector says nothing about deletions and so cannot establish that a
replica contains what the checkpoint contains.**

### 8.5 Migration to a replacement service

**Invariant.** **Migration replaces succession.** The workspace moves; the old service's authority does not.
The replacement service establishes a **new** authorization lineage; the old lineage stops governing the
migrated package; the client rotates to a **fresh** content-key generation; and the existing recovery keypair
is reused where the user holds it.

**What the user sees.** A surviving device — or a clean device holding independently available ciphertext and
the content-recovery factor — restores the content and creates an account at a replacement service. The other
devices enroll again.

**The two enrollment gates stay separate.** The replacement service may authorize a new credential, but only a
surviving content-holding device or the recovery-factor-unsealed private key may deliver the old content keys.
**Possession of restored content does not prove continuity of the former account; it creates a new one.**

**Not promised.** The old service's device list, epochs and claim to authority do not continue. **Migration
cannot manufacture a terminal record from an authority that has vanished**: if the old service is reachable,
migration requests deletion or a signed terminal commit; if it is not, the portable cutover package marks that
lineage **superseded for this restored workspace**, and the fresh lineage identifier plus accepted checkpoint
prevents any old envelope from replaying into it. The old service, if it later returns, may still regard its
own copy and credentials as live — **migration has isolated that copy, not remotely revoked it** — and the
product must say so and offer deletion if contact returns. This is why *migration starts a new lineage* is a
security boundary while *migration retires the old lineage* is only a conditional cleanup claim.

**Attribution is carried forward.** Historical writes stay attributable to the credential and actor that made
them. The alternative — reattributing the whole baseline to the migrating device — is rejected: a migration
that silently converts every past write into "restored by this device" keeps the survivability promise by
breaking the authorship one.

**The cost of carrying it is accepted, and it is not "a small archive of public keys".** Verifying a
pre-migration write end to end needs four things:

1. **An authenticated old trust root** — the vanished service's authorization signing key, bound so it cannot
   be substituted. Otherwise whoever can write the archive can rewrite who wrote what. **What holds that
   binding down is the user's own code** (`S0-6`): the archive commits to its trust root behind the same
   factor that opens it, so an archive assembled by somebody else names a root the code does not vouch for and
   is refused before anything is decrypted. Every other item on this list is service-signed and therefore
   re-signable by whoever supplies the signing key; this one terminates in something only the user holds,
   which is the whole reason it can be trusted after the service is gone.
2. **Enough of the old authorization history** to establish which credential held which capability at the
   referenced epoch.
3. **Either the original signed envelopes or a validated attribution-preserving checkpoint.** A checkpoint that
   flattens several credentials' work into one signature is the forbidden shape. **The target is the
   checkpoint**, since retaining every envelope grows without bound.
4. **The historical content-key generations**, because the attributed actor sits inside the seal — so verifying
   authorship requires decrypting (§7.4).

**Retaining the old service's public material is not succession.** It proves who wrote history and authorizes
nothing. The rule that nobody may *change* authorization outside the service is untouched by material that
cannot change anything.

**Failure and lifecycle. What makes the restored history admissible under a lineage that never accepted it.**
Every historical envelope carries the *former* service's acceptance evidence, issued under a key the
replacement has no reason to honour. Replaying them cannot work, and must not, or migration would be a way to
launder unaccepted writes into a fresh workspace. **The checkpoint is the re-baseline point**: the restoring
client attests the state it recovered, the new service accepts that attestation as the lineage's origin, and
the prior envelope history becomes **archival rather than replayable**. Every write after the checkpoint
carries the new service's evidence in the ordinary way.

**The cutover window produces divergence on every enrolled device, not just the restoring one.** Devices keep
writing locally throughout, because a migration is a service event and offline-first means nothing stops.

- **A device's own window edits are its own writes**, so on enrolling under the new lineage it re-signs them
  and submits them as ordinary envelopes. Nothing is re-attributed: the same credential and actor sign the same
  operations.
- **The enrolling device applies the admitted checkpoint first and descends from it by construction.** Its own
  pre-migration work is still there afterwards, alongside everything the checkpoint brought — both are replicas
  of one workspace sharing an ancestor, so merging is the ordinary case. Descent is a state the device
  *reaches*, not a qualification it either has or lacks.
- **A delta cannot be filtered by signing credential.** Update bytes carry a client id that is random per
  document instance, so "keep only the operations this credential authored" asks the update stream for
  attribution it provably does not contain. **What works instead is the envelope**: a device retains its own
  outbound signed envelopes since the checkpoint, which it has by construction because it signed them, and
  re-envelops the same operations under the new epoch with the same credential and actor.
- **Coverage is a subtraction, not a filter.** Checkpoint plus this device's own envelope suffix accounts for
  part of its replica; any residue — operations it *received* from another device during the window — is not
  this device's to carry and it cannot honestly re-sign it. That residue travels on **that** device's
  enrollment, replayed from its own envelopes.
- **The one thing migration cannot carry.** Operations from a credential that reached one device and never
  reached the archive travel on that credential's enrollment or not at all. If the device that wrote them never
  enrolls, they are gone — not replaced, not adjudicated, simply never re-signed under a lineage that would
  accept them. The loss is bounded by how much work a never-returning device did inside the window.
- **The window should therefore be short**, and that is a design requirement rather than an aspiration.

### 8.6 What may be claimed, and when

**Invariant.** Claims are staged and each is gated by the tests that demonstrate it. **An open repository is
evidence of availability, not evidence that the software builds, restores or migrates.** Conversely, an unbuilt
test does not make the product architecture undecided.

**The claim available today**, which should be made rather than held back — it is already stronger than most of
the category:

> Your existing installation and the last workspace replica it holds keep working with the service
> unreachable, and nothing you read or write waits on us. That replica exports to ordinary Markdown at any
> time. Hosted synchronization, fresh-device setup and any server-held recovery material stop being available.

**The claim enabled by the independently runnable package**, which **must not ship before its tests pass**:

> If the hosted service disappears, your app and local data continue to work. Your data is available as
> ordinary Markdown. An independently runnable release can be installed without us, and a surviving workspace
> replica can be moved to another compatible sync service under a new account.

**The stronger conjunction — the company is gone *and* every device is lost** — adds one condition the software
cannot create after the fact:

> If you hold a verified encrypted archive and your recovery factor, the encrypted workspace can be restored on
> a replacement device and moved to another compatible sync service without the original provider.

**The gate**, demonstrated without production credentials or the original app origin:

1. Start an existing installation with app and relay origins unreachable; read and edit normally.
2. Export to Markdown and inspect every user-authored item with ordinary tools.
3. Import that export into a clean, independently served build **without silently losing frozen history** —
   the freeze must not eat the import (§4.4).
4. Restore an encrypted workspace archive on a clean device using only saved recovery material.
5. Start the documented self-hosted service and store, and migrate one surviving replica without modifying its
   content.
6. Create a new authorization lineage at the replacement service, then add and revoke a device.
7. With two devices diverged while the former service was unavailable, use one replica to establish the
   replacement workspace; enroll the other, verify it applies the checkpoint, retains its own divergent work and
   re-signs **only its own credential's** operations under the new lineage, then converge edits made after
   enrollment. Verify separately that operations from a third credential which never reached the archive are
   **not** re-signed by the enrolling device.
8. Repeat with the store holding the newest checkpoint unavailable, falling back to the next-newest retained
   checkpoint and its suffix.
9. **Run tests 4 through 7 again with the entire original provider account unavailable** — not one store, not
   one region, but every service the company operated — using only material the user already holds.

**Tests 1–3 are cheap, near-term and cover most of the felt meaning of the promise. Tests 4–9 are a serious
program, and 9 is the one that cannot be faked**: it is the test the survivability claim is actually about, and
it is the one a within-provider replica drill can pass while the real scenario still fails.

**Not promised.** These gate the corresponding **release claim**, not the product decisions above and not the
start of technical design.

---

## 9. Explicit non-goals

- **No images**, ever. No attachments, embeds, or pasted screenshots.

- **No human collaboration.** One person per workspace — no sharing, no invitations, no multi-user workspaces,
  no comments. **This is separate from service multi-tenancy**: many isolated principals may each hold an
  account and a workspace without any two humans sharing one, and an individual service account is not a
  "multi-user account". **Agent membership is anticipated** and is why membership attaches to a principal or an
  agent rather than to an account; an agent may be a member without implying another human. Another human
  joining a workspace requires a separate product document, taken deliberately or not at all.

- **No notifications or reminders.** This tool does not interrupt you.

- **No time tracking, estimates, velocity, deadlines, or analytics.**

- **No tags/labels taxonomy in v1.** Search covers it; a taxonomy invites the structure-maintenance overhead
  this workflow exists to avoid.

- **No recurring tasks in v1.**

- **Not inventing local-first techniques.** The design owns message schemas, state transitions, downgrade
  rules, key rotation and finalization; it does **not** invent cryptographic primitives, distributed
  authorization or a new CRDT.

- **No peer-to-peer transport.** Not as a configuration, not as a pricing boundary, not as a second
  authorization semantics. It returns only as an optimization beneath one envelope protocol under measured
  conditions (§2.3). An emergency service-absent peer mode is a different feature belonging to service
  continuity, and it is not permission to continue a vanished service's lineage.

- **No workspace management.** No creation flow, no naming, no reconciliation, no administration surface.
  Selecting between local workspaces one person already holds is the single permitted exception (§6.8).

- **No actor management. There is nothing to administer.** Actors are minted by the app and never claimed,
  merged, pruned or picked from a list (§5.2); the only identity a person edits is their own name and colour
  (§5.1) and their own device names (§6.4). The older form of this non-goal said *no presence UI, no
  permissions, no actor management* — the first clause is retired, because carets for every input surface are
  presence and are shipped deliberately (§5.5), and the second is superseded by agent membership and
  capabilities (§5.8). **What survives is this clause, and it survives intact.**

- **No sharing a single day, a single card, or a link to anything.**

- **No server-side content processing**, permanently and by construction: no server-side search, no server-side
  export, no server-rendered anything. Local search is unaffected.

- **No forward secrecy by default** (§7.8), **no unlinkability** (§7.5), and **no remote wipe** (§6.5).

- **No service escrow of content keys**, excluded from the service by construction; an opt-in add-on may exist
  only if operated by a separate legal entity and scoped to the recovery private key alone (§7.3).

- **No cross-device undo, and no tab count** (§5.4, §5.6).

- **No document history.** Provenance of a merge is an orientation aid bounded by the divergence, not a
  timeline (§5.7).

- **No stable task identity in the master list.** Authoritative completion propagation, duplicate merging or
  relationships between occurrences would turn a document containing intentions into a task database rendered
  as text (§4.9).

---

## 10. Phasing

**Phase 1 — the editor.** Live-preview markdown, one document, local persistence. No sync, no navigation, no
cards. _Exit: the author prefers it to a plain textarea, and the swipe-vs-select gesture model works on a real
Android device._

**Phase 2 — the workflow, and the local foundations sync will need.** Documents, collections, cards, the
three-cap, movement flows, spatial navigation, responsive layouts, actor attribution and per-tab scoped undo.

Four things join this phase that were previously assumed or deferred, and each is cheaper here than later:

- **Local genesis creates the full local identity**: an unnamed principal, home-workspace membership, device,
  human actor, and the workspace's first content-key generation. None of it is exposed and nothing is asked
  (§6.1).
- **Every app-managed persistent store is authenticated ciphertext** — the workspace database, the synchronous
  crash journal, and any persistent derived index. The journal needs a reviewed synchronous AEAD (§7.1).
- **Import**, alongside the existing export, placed outside the freeze and outside the cap (§8.2).
- **The durability warning for the environment case** (§7.10, first row).

_Exit: every core workflow and navigation path works on real Android and desktop devices without a
workflow-blocking defect; a profile snapshot after ordinary use yields no recognizable content in any store._

**The first deployment sits between Phase 2 and Phase 3, and it is a migration.** What runs today is Vite
behind Tailscale on a laptop in continuous daily use, with sync configured by hand on each device against a
shared bearer token, a plaintext relay document, and no principal or authorization lineage. **That
installation occupies no supported configuration** — it is multi-device sync with no account, which works
because it has exactly one user who trusts every device on his own tailnet, and it does not generalise past
that. **The proposed cutover is to export from the development installation and import into the first real
deployment, and to treat that as the migration** rather than attempting to carry a live document across. It is
not yet the selected cutover: question 10 must first decide whether re-attributing the imported history to the
system actor is acceptable or whether the fidelity archive has to arrive early and carry the CRDT state instead.
Adding hidden authorship fields to the Markdown escape format is not an option. After cutover comes a versioning
and upgrade story, built preventatively rather than at the first incompatible change.

Two consequences worth stating: the import must not be gated by the freeze, or a ten-day export silently loses
everything older than three days (§4.4); and **if question 10 selects export/import and encryption-at-rest lands
before any external user exists, that export/import *is* its migration and no in-place encryption state machine
is ever built** (§7.1).

**Phase 3 — accounts and sync.** The largest phase, and it is not "relay deployment" any more.

- **Account creation**: the name, the account credential and its device-local offline slot verifier, and the
  mandatory saved-and-re-entered recovery code. One question about the existing list: promote, or start fresh
  (§6.1, §6.2).
- **Storage keyed by _(principal, workspace)_**, several stores per device, providers never crossing between
  them, and the device-local slot index (§6.7).
- **The envelope protocol**: client-encrypted updates, signed envelopes with the actor inside the seal,
  service-signed authorization epochs, and authenticated acceptance evidence (§7.5).
- **A content-blind durable store**: authenticated checkpoints, a manifest with a coverage attestation, the
  update suffix, retention of superseded checkpoints (§8.4).
- **Enrollment**, with its two independent gates (§6.3).
- **The device list and revocation**, which arrive **with** sync rather than after it, because the first device
  to enroll is also the first byte of ciphertext on a server (§6.4, §6.5).
- **Key rotation** on lost read access, client-produced and service-committed (§7.4).
- **The workspace picker**, where a slot holds more than one (§6.8).
- **Provenance mode for cards**, which can ship with sync since it needs no new card data (§5.7).
- **Cross-device caret colour and principal-based peer-list dedupe**, which arrive with enrollment (§5.5,
  §5.6).

_Gates: assurance levels 1–3 — project-owned threat model and conformance tests, a recorded versioned
web-security baseline, and an independent protocol design review — before this ships. The disclosure and
response program is live from the day it ships (§7.12)._

_Exit: phone and laptop consistent across a week including offline edits on both; daily use for a week without
falling back to the previous system; the conformance tests in §7.12 pass._

**Phase 4 — retrieval.** Search and calendar picker, scoped by principle 6: search over the master list and
recent days earns its place; deep-history search and backlink graphs probably don't. Build the narrow version
and see whether the rest is ever missed.

**The first search index is in memory**, rebuilt lazily from the decrypted workspace after startup and off the
cold-start path. A **persistent** derived index may ship only when its on-disk representation is encrypted, and
no browser engine currently supplies that transparently — row-level security is access control rather than
encryption, column encryption produces ciphertext ordinary full-text indexing cannot index, and the available
browser SQLite options either document no encrypted persistence, label it experimental, or gate it behind a
commercial extension. Measure the in-memory rebuild and add a persistent encrypted representation only if
measurement demands it. **That empirical decision gates neither the first deployment nor the storage-and-journal
review.**

**Phase 5 — deferred: advisory LLM assistance.** Scope-checking Next for project-shaped items. Out of scope
until the above are in daily use, and it must remain advisory — never blocking, never rewriting user text.

**Phase 6 — deferred: agent membership and authoring assistance.** Agents as members with capabilities,
presence and authenticated attribution, generating markdown that's tedious to write by hand. Would likely
reintroduce tables. **Requires an account**, because admitting an agent changes authorization and only the
service changes authorization — the free product has no agents (§5.8). Distinct from Phase 5: Phase 5 reads and
comments, Phase 6 writes.

**Not a phase — two programs that run alongside and gate specific claims:**

- **The survivability package** (§8.4). Its tests 1–3 are cheap and near-term; 4–9 are a serious program. They
  gate the corresponding release claim and nothing else.
- **The service data inventory** (§7.11). It starts with the technical design, evolves with implementation, and
  is reconciled and reviewed as-built **before availability is widened** beyond development or a bounded test
  audience.

- **The independent implementation audit** (assurance level 4) is required before either of two triggers rather
  than at a phase boundary: the phrase *end-to-end encrypted* appearing in marketing copy, or the escrow add-on
  holding a real key.

---

## 11. Remaining product questions

Everything else in this document is settled. These are the questions that are genuinely open, each stated
precisely enough that answering it is a bounded act, with what it blocks named — because for most of them the
answer is *nothing*.

**An answered question keeps its number and is struck through in place.** Renumbering would silently invalidate
every reference made to it while it was open — TRD §15 and [sequencing.md](./sequencing.md) both cite these by
number — so the list is allowed to carry its own answers rather than shrinking.

**Deferred deliberately, and downstream of everything here:**

1. **What does hosted sync cost, and how should it be priced?** Free, paid, bundled or metered — none of which
   changes any identity, authorization, storage or transport decision above. **Blocks nothing, and no sentence
   in this document may be written to depend on its answer.** What to measure when there are users:
   update-envelope bytes per active workspace at p50/p95/p99; relay egress, durable-store writes, retained
   bytes and recovery downloads; checkpoint frequency and size; and the fraction of users who never create an
   account at all. Note that the signup this would be pricing has a recovery-code ceremony in it, and the
   conversion cost of that gate is not the conversion cost of a name field.
   **What is left to build if the answer is ever *paid* is smaller than it was.** The lapse machine itself —
   the states, the one clock, the deletion ledger, the resume and re-seed rules, and how it races with
   deletion — is selected and depends on no price (TRD §14.7). What still waits here is the entitlement
   record's exact wire and its signer: the part that says *this account's plan lapsed*. Everything the rest of
   the product has to promise about a lapse is decided without it.

**Open, with a real product answer owed:**

2. **What does the app do on a historically admitted workspace with no local identity?** Refuse to write, offer
   sign-in or recovery where the lineage is live, or quarantine until the human chooses. The *detection* is
   settled — authenticated lineage state, never the roster (§6.11). This is the response. A rare and alarming
   state; blocks nothing.

3. **What is the staleness interval after which a device is shown muted?** The behaviour is settled — muted,
   never hidden (§6.4). This is the number.

4. **How are two devices of the same kind disambiguated?** A suffix from the existing random device id; a
   prompt at the moment a second device appears; or both, with the generated name pre-filling the prompt. The
   guardrail is settled — **not by fingerprinting** — and the audience is one person, which lowers the bar
   (§6.4).

5. ~~**What is the hosted-content retention duration after a lapse?**~~ **Answered: twelve months**, from the
   moment hosted synchronization stops, as a floor on the promise and a ceiling on the data (§6.10, TRD §15
   row 16). It was filed as conditional on question 1, and it was conditional on **one bit** of question 1 —
   whether a lapse can exist at all — rather than on what a plan costs. That binary is taken; nothing here
   depends on the price, and question 1 stays exactly as deferred as it was.

6. **What is the card split threshold?** Three consecutive returns is a starting guess — likely too
   undiscoverable, and expected to drop to two or one once the interaction proves out. A tunable, not a
   decision (§4.8).

7. **Is document text attributed, or only cards?** Cards are attributed today. Per-character attribution
   inside the master list is possible but costs real time on the keystroke path, and nobody asks the question
   until an agent is actually editing prose. It is what line-level provenance tinting in Goals would need
   (§5.7), and it is the one open question that would make that feature possible.

8. **Is Done's reconstructed order good enough in practice?** Done's order survives replication except in
   one case — a day *neither* device has written to before, where both mint the day container, one wins
   outright, and the loser's ordering has to be rebuilt from when each card was *written* rather than when it
   was finished. Almost always the same instant, since most things are typed straight into Done; visibly
   wrong for something written in Next in the morning and finished in the evening, which comes back lower in
   the list than it belongs. There is a known storage fix that removes the reconstruction entirely, deferred
   because it costs a property the storage design currently rests on. **Watch for it in real use** — the
   imprecision is the signal to go and do it, and nothing else about the app depends on the answer
   (TRD §10.8).

9. **What is the per-install human actor kind called?** "Actor" is carrying both *who is writing* and *which
   install is writing*, and those are different questions with different answers. Worth naming properly before
   it reaches the UI (§5.2).

10. **Selected 2026-09-10: accept system attribution for the author's development cutover.** There is no
    deployed instance or external user to migrate. Use the existing private importer with Markdown/system
    semantics; retain content and placement while accepting the metadata losses in §8.2. The fidelity archive
    stays separate. TRD §15 row 21 is selected; sequencing §5.4 records the operator-assisted procedure and
    distinguishes its diagnostic packet from a general ZIP import UI. Application integration, conformance
    and review requirements remain.

**Copy and interaction detail, each attached to a settled decision:**

11. **The destructive-confirmation copy** for remove-from-device and reset for handoff — specifically, how
    it distinguishes what the app can actually clear from external recovery material it cannot reach (§6.6).

12. **The account-creation flow's presentation** — how the name, the account credential and the recovery code
    are sequenced in one moment without the code reading as optional (§6.1), and the recovery-code
    generation, step-up authentication and confirmation UX, including the replacement flow and the loss
    warnings. The latter is not a detail of the recovery flow — **if the code is the only thing between an
    account-holder and permanent loss, how it is generated, confirmed and replaced *is* the recovery flow**
    (§7.6).

13. **The required local-factor enrollment flow and its copy**, including the first-run explanation: *this is the only copy, and we cannot open it for you either* (§7.2).

14. **The provenance mode's interface** — where the settings toggle lives, and how the off switch surfaces
    while the mode is on (§5.7).

**A design check rather than a decision:**

15. **Does the local native cursor read as deliberately distinct from remote-caret decorations, in both
    themes** — rather than merely happening to differ (§5.5)?

**An empirical question, worth confirming before anything relies on either answer:**

16. **Is an installed PWA a separate storage context from browser tabs on the target platforms?** If it is, it
    is a separate *device* by this product's definition, with its own actor and its own local user slot.

**Explicitly not open**, and listed because each has been mistaken for a live question at least once: whether
the app ever asks who you are at first run; whether a device may claim an existing actor; what happens when a
device with its own history signs in; whether undo crosses devices or tabs; whether the app shows a tab count;
whether local content is encrypted at rest; whether the service can decrypt a workspace; whether peer-to-peer
is built; and whether a revoked device can be wiped remotely.

**Deliberately outside this document**, and each needing its own: the agent capability model — roles,
delegation rules and management UI; human collaboration — invitations, sharing, multi-workspace navigation and
permissions; the survivability package's implementation; and the operational and legal program — vendor
contracts, jurisdiction-specific notices, support playbooks and filing obligations.


## Sidebar organization — operator UX clarification, 2026-10-23

Date navigation stays directly visible: a date/calendar ghost control backed by a native date input,
with Yesterday, Today and Tomorrow beneath it. Account, Sync, Data and Install are native collapsible
sections, closed by default on a fresh mount. Account combines identity/preferences, local protection,
devices and session/lifecycle actions. Sync contains sending/receiving status and setup. Data groups
readable export with history maintenance. Device membership/history remains reached through Devices.
Installation is omitted when already installed; an available app update remains outside the disclosures.

Use another account and Sign out retain their distinct §6.6 effects. Switching preserves the remembered
login; sign-out ends it. Both retain local writing. Collapsing a section does not reset a form, cancel
an in-flight operation or change authorization. This organizational clarification changes no protection,
removal, history-maintenance or synchronization guarantee.

### Automatic local history maintenance — 2026-10-26

Once activated, local technical-history reduction runs automatically with no user opt-in step.
Ordinary deferrals for editing, receiving and unfinished operations remain quiet. Data shows a
local-history explanation and a collapsed-section “Maintenance paused” indicator for persistent
capacity/history/ineligibility problems. Check again requests the same guarded maintenance path,
retaining quiet/retry delays; it never authorizes a cut. A storage/verification halt requires lock
and reopen, with no claim that an uncertain write succeeded. Tasks, notes and day writing are not
selected for age-based deletion. Local maintenance and explicit service snapshot/pruning controls
remain distinct. [Contract](./account-local-retention-automatic.md).
