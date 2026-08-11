# done — Sessions and Identity: Product Requirements

**Status:** Draft v2 — **7 of 18 decisions recorded**, the rest open. See §8.
**Date:** 2026-08-10
**Audience:** the author, deciding. Not an implementation plan.
**Amends:** PRD §11 (Actors), PRD §12 (non-goals) — see §9.

---

## 0. Why this document exists

The multi-tab work went looking for a place to put "which tab is this" and found that the app has
no answer, and that two of the three answers it does have are load-bearing in ways nobody wrote
down. The peer list saying `Mac, Mac`, a caret from your own second tab that looks like a stranger's,
and a roster that quietly grows a new "You" for every device you have ever opened the app on are all
one defect: **surfaces reading identity at a level that does not describe what they are showing.**

Multi-tab was where it surfaced. It is not where it ends. The same missing model is what "switch
rooms" would need, what a second person in a document would need, and what a reinstall on a phone
already needs and does not have.

### 0.1 What this document does, and does not do

It **enumerates**: the levels of identity, everything that is true today, the full state space, and
every scenario that moves through it.

It **frames decisions** — options with what the user sees for each, and what each choice forces
elsewhere.

It **records decisions as they are made**, and does not make them. The product calls are the
author's; §5 keeps the options and the consequences beside each answer so a recorded decision can be
re-opened on the same evidence it was made on. Where a decision is already narrowed by something the
PRD ranks, §5 says so and names the narrowing rather than skipping the question. Where a "decision"
is not really one because mechanics settle it, it is in §6 so we do not spend a meeting on it.

Each decision carries a status: **Decided**, **Decided in principle** (the answer is settled, the
mechanism is not), or **Open**. Nothing marked Open below has been leaned on by anything marked
Decided.

### 0.2 The conflict with the PRD, stated up front

PRD §12 says **"No human collaboration. One person, own devices — no sharing, no multi-user
accounts, no comments."** The header of that document says single-tenant, not a product.

This document drives toward a multi-tenant future, which contradicts that non-goal, and the
contradiction should be resolved deliberately rather than by drift (§9). Two things make it worth
doing now anyway:

1. **Most of what is below is single-tenant work.** Sessions, devices, reinstall, room switching and
   the roster-of-duplicate-Yous are all problems for one person with three devices. They do not need
   a second human to be real, and three of them are shipping today.
2. **The multi-tenant question is two specific decisions**, not a diffuse direction: may the relay
   decide _who connects_, and may it decide _what is written_ (D-14). They have different costs and
   different answers available, and the first is nearly independent of everything else here. Most of
   the rest can be decided before either, provided each choice records which way it leans — the
   exception being D-11, which §2.2b shows is entangled with the credential model and should be taken
   alongside it.

---

## 1. The four levels

| Level       | Answers                      | Example                       |
| ----------- | ---------------------------- | ----------------------------- |
| **Actor**   | _who_ is writing             | you; the app itself; an agent |
| **Device**  | _where from_ — which install | your phone; your laptop       |
| **Session** | _which view_, this run of it | the tab you are looking at    |
| **Room**    | _which document_             | `done`; `work`; a shared one  |

The PRD has the first. The code has the first two. The multi-tab note argued for the third. The
fourth already exists as a field in the sync settings, and is the one that has never been thought of
as identity at all — which is why §2.2b is a surprise.

**There may be a fifth.** If a room turns out to mean "who is allowed" rather than "which content",
then content is its own level and the room stops implying it (§2.2b, D-11). The count is not settled,
and it is one of the two things D-11 decides.

Each level is the right answer to different questions, and picking the wrong level is the whole
category of bug this document is about:

- Attribution ("who wrote this card") is **actor**.
- "Last synced from ⟨x⟩" is **device**.
- A caret is **session** — a caret is a place someone is looking, and two tabs are two places.
- Undo is **session** today, and the PRD describes it as **actor** (§9).
- An exclusive resource — the search index's OPFS lock — is **session**, arbitrated per device.
- Sync configuration is **device** today. Whether it should be is D-10.

---

## 2. What is true today

Mechanics, included only because the decisions in §5 are not real without them.

### 2.1 What is stored where

| Fact                        | Where                              | Synced | Scope                                 |
| --------------------------- | ---------------------------------- | ------ | ------------------------------------- |
| Actor roster (name, colour) | `meta[actor:<id>]` in the document | yes    | per document                          |
| Which actor this client is  | `localStorage['done.actor']`       | no     | per browser profile                   |
| Device id and name          | `localStorage['done.device']`      | no     | per browser profile                   |
| Sync endpoint, room, token  | `localStorage['done.sync']`        | no     | per browser profile                   |
| Last sync time and source   | `localStorage['done.sync.last']`   | no     | per browser profile                   |
| The document itself         | IndexedDB database `done`          | —      | **per browser profile, not per room** |
| Session                     | nowhere                            | —      | —                                     |

Ids are UUIDv4, so collision is not a concern anywhere below. The menu already edits the actor's name
and colour and renames the device, so an identity surface exists to extend.

Note the phrase "per browser profile", which is what localStorage actually scopes to. **A device is
not a machine.** Chrome and Firefox on one laptop are two devices. Two Chrome profiles are two
devices. A private window is a third, and a fourth tomorrow.

### 2.2 Five things that are consequences, not decisions

These are not open questions. They are what the code does now, and each one constrains §5.

**a. Every device becomes a new actor.** `resolveActor` reads `done.actor`; finding nothing, it mints
a fresh id, registers `{kind: 'human', name: 'You', color: <random>}` into the synced roster, and
that is your identity on that device forever. One person with a phone and a laptop is **two actors**
in the document, with two colours, both called "You". PRD §11.3's "one human actor, created on first
run" is true per device and false per person, and the gap is invisible until sync makes both actors
visible in one roster.

**b. The local database is room-independent, and single-identity.** `DB_NAME` is the constant `'done'`
and nothing passes `dbName` outside tests. The room, meanwhile, lives only in the sync configuration.
So the room does not select a document — it selects **who your one local document tries to merge
with.** Changing the room in settings does not open a different document; it points your existing
document at a different remote and converges the two.

Two things follow, and the second is about the future rather than today.

_Today:_ **converging two histories is not a thing anyone wants**, under any reading of what a room
is. It is not an option in D-11, it is a defect that D-11 has to stop producing. Recording it as a
"maybe someone wants a merge" is wrong, and this paragraph said so in draft v1.

_Ahead:_ **`dbName` almost certainly has to become a parameter**, and the axis is not only the room.
If two people can authenticate with the relay separately, they can do it from the same browser
profile — one shared laptop, one browser, two users — and each needs their own local document, their
own actor, and their own credential. So the local database is keyed by something like _(identity,
document)_ rather than by the room alone. This is not a decision to take here; it is the reason D-11
and D-14 cannot be decided independently.

And a distinction that D-11 was written without: **"which content" and "who is allowed" are not
obviously the same axis.** A room could be a document, or it could be a membership boundary that
contains documents. Under the second reading — the more natural one if the relay ever gains a notion
of users — the four levels of §1 become five, because content gets its own level and stops being
implied by the room. D-11 now asks that question directly rather than presupposing the answer.

**c. The relay's token is not per room — and this is a target for change, not a constraint to design
around.** `RelayPolicy` is one shared `token` plus an allowlist of `rooms`. Anyone holding the token
may connect to any allowed room. There is no per-user credential and nothing that ties an identity to
a room, so the current auth model **cannot separate tenants** — not weakly, not at all.

Replacing it is part of why this document exists, which changes its status here: the rest of the
document may assume the credential model is in play, and no decision below should be shaped to
preserve a single shared token. What replaces it is D-14, and §2.3 is the mechanism question that
turns out to sit underneath it.

**d. Storage failure silently reissues identity.** Every localStorage access in `localStore.ts` is
wrapped and swallows its error, deliberately, so the app starts even where storage is denied. Where
there is no durable localStorage, **a new actor and a new device are minted silently**, and if that
context ever syncs, each one leaves a permanent entry in the roster.

Draft v1 filed private browsing under this and was wrong about the mechanics. Modern browsers do give
private windows a working, ephemeral localStorage, so identity is stable _within_ a private context
and discarded at the end — which is defensible behaviour rather than a defect. Safari goes further
and does not share localStorage between private tabs, which means **each private Safari tab is its own
device** by this app's definition. The genuine cases for this paragraph are narrower and worse:
storage blocked outright by settings or an embedded context, and Safari's eviction of script-writable
storage for a site not used in a week — which takes the document with it, not just the identity
(S30).

**e. There is no session.** `doc.clientID` is the only per-tab identity that exists, it is a Yjs
implementation detail, it is random, and it is what the peer list is currently counting when it says
`Mac, Mac`.

### 2.3 Cookies and offline-first: less funny than it sounds

The question is whether session cookies and offline-first are in conflict. They are not, and the
reason is worth stating precisely, because it opens a middle position on D-14 that the binary version
of that decision hides.

**Cookies are inert offline, not hostile to it.** A cookie is a request-time mechanism: it is attached
to HTTP requests, and offline there are no requests. So a cookie contributes nothing to what the app
can do while offline — and takes nothing away either. The rule that keeps principle 3 ("offline is the
normal state") intact is one sentence: **nothing on the read or write path may await a credential**,
which is the constraint TRD §7.1 already imposes on sync state. An expired cookie has to degrade to
"sync is offline", never to "the app is locked".

**Where a cookie is actively better than what exists.** Today the relay token travels as a query
parameter, because `WebSocket` takes a URL and nothing else — the app's own comments say so. A cookie
is the one credential a browser attaches to a WebSocket upgrade by itself, since the upgrade is an
HTTP request. That means the credential can be `HttpOnly` (XSS cannot read it), `Secure`, and
`SameSite`, and it stops appearing in relay access logs the way a query string does. It is also more
durable than localStorage under Safari's ITP, which caps script-written storage rather than
server-set cookies. All of that is a strict improvement on §2.2c, independent of every product
decision below.

**Where the real conflicts are.** Three, and they are specific:

1. **A cookie cannot be the app's identity key.** `HttpOnly` means the app cannot read it — that is
   the point of it. So identity-for-display still lives in local storage, and the app ends up with two
   mechanisms doing two different jobs: a cookie that authenticates the connection, and a local record
   of who you are. Not a conflict so much as a thing to not conflate.
2. **Setting a cookie requires a server that serves HTTP, not just a socket.** A login endpoint is a
   request the relay has to answer. This is the middle position: **the relay can gain an authentication
   surface without gaining document authority.** It can decide who may open a socket — it already
   does — while still treating every byte through that socket as opaque, and therefore still being
   unable to reject a write. D-14 as originally written asked one question; it is really two, and this
   is the first.
3. **Stateless is cheap; revocation is not.** A signed token in a cookie needs no server-side session
   table, which is what makes it cheap to host and survivable across restarts. But nothing stateless
   can be revoked before it expires — and "invalidate sessions from a UI upon logging in" is
   explicitly wanted (D-2's rationale, now D-18). Short expiry plus refresh is the usual compromise,
   and it reintroduces a request the app must never wait on. This tension is the sharpest thing in
   this document that is not a product decision, and it is why D-16 and D-18 are separate questions
   rather than details of D-14.

None of this is a transport design. It does suggest that "drop WebSockets for something cheaper to
host" and "authenticate with a cookie" are one move rather than two, since request/response sync over
plain HTTP is exactly where cookie auth is free and where hosting is cheapest. That belongs in its own
spec.

---

## 3. The state space

### 3.1 It is not a 2×2×2

A session is always new: opening a tab creates one, and there is no such thing as arriving with an
existing session. Reloading is the only case that even asks the question, and it asks whether a
session id should survive a reload — which is settled in §6.

Levels also constrain each other. A new device implies a new session. An existing device implies a
stored actor id already exists, so "existing device, new actor" only happens if something deliberate
or destructive has occurred. So the interesting space is **actor × device**, crossed with **how you
arrived**.

### 3.2 Arrival: actor × device

|                    | **New device**                                                                                                                                                                             | **Existing device**                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New actor**      | **A. Genesis.** First run ever, or a new install with no sync. Today: mints both.                                                                                                          | **B. Reset or handoff.** Storage cleared, or a deliberate "I am someone else". Today: indistinguishable from Genesis, and the document keeps the abandoned actor forever. |
| **Existing actor** | **C. Rejoin.** The same person on a second device, with the actor already in the document. **Today this is impossible** — there is no way to say "I am that one", so C silently becomes A. | **D. Ordinary launch.** Reads both from localStorage. The only well-served cell.                                                                                          |

Cell **C** is the hole. Cell **B** is the one that leaks. Cell **D** is the one that works, and it is
the only one anyone has tested by using the app.

### 3.3 Arrival modes

Crossed with the above: **first tab** on this device this session · **an additional tab** · **a
reload** · **a bfcache or discarded-tab restore** · **a private window** · **an installed PWA
launch** (which on iOS is a separate storage context from Safari's tabs in some configurations, and
therefore potentially a separate _device_ — worth confirming before relying on either answer).

---

## 4. Enumerated scenarios

Each scenario: what the user does, what happens today, and which decisions it raises. "Today" is
factual; the decisions are §5.

### 4.1 Genesis and arrival

| #      | Scenario                                         | Today                                                                                                                       | Raises        |
| ------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **S1** | First run ever. No sync.                         | Actor + device minted. Never asked anything. Starts typing immediately.                                                     | D-1, D-2      |
| **S2** | Opens a second tab.                              | Second Yjs client. No live sync unless a relay is configured. Peer list would say `Mac, Mac` if it were.                    | D-8, D-9      |
| **S3** | Reloads a tab.                                   | Same actor, same device. Document reloads from IndexedDB and the journal.                                                   | §6            |
| **S4** | Tab restored from bfcache, or after discard.     | Same identity; the document may be stale with no signal.                                                                    | §6            |
| **S5** | New device, sync **not** configured.             | New actor, new device, **and a second independent document.** Two forks with no relationship.                               | D-2, D-11     |
| **S6** | New device, sync configured immediately.         | New actor joins the existing document. Roster now has two "You"s in two colours.                                            | **D-4**, D-3  |
| **S7** | Reinstall / cleared site data on a known device. | Cell B. New actor; the old one stays in the roster, attributed to past cards, with no owner.                                | **D-4**, D-12 |
| **S8** | Private window.                                  | New actor and device on every launch, permanently recorded in the roster if it ever syncs (§2.2d).                          | D-12, D-13    |
| **S9** | Installed PWA alongside browser tabs.            | Possibly a separate storage context, therefore possibly a separate actor and device, for the same person on the same phone. | D-2, D-13     |

### 4.2 Sync lifecycle

| #       | Scenario                                     | Today                                                                                                                 | Raises        |
| ------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------- |
| **S10** | Opts into sync for the first time.           | The local document merges with the room's. If the room has another document, the two converge into one — permanently. | **D-5**, D-11 |
| **S11** | Turns sync off, then on.                     | `enabled: false` keeps the configuration. Off is a pause, not a forget.                                               | —             |
| **S12** | Forgets the sync configuration.              | Config and last-sync time removed. Actor and device survive; the document survives.                                   | D-12          |
| **S13** | Changes endpoint, same room.                 | Reconnects to a different relay for the same document name.                                                           | D-10          |
| **S14** | Changes the room.                            | **Does not switch documents** (§2.2b). Re-targets the merge.                                                          | **D-11**      |
| **S15** | Token refused (4401) or room unknown (4404). | A sentence in the menu; the document is unaffected. No identity consequence.                                          | —             |

### 4.3 Identity changes

| #       | Scenario                                       | Today                                                                                                   | Raises       |
| ------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------ |
| **S16** | Renames the device.                            | Local only. Shows up on other devices as "last synced from ⟨new name⟩".                                 | —            |
| **S17** | Renames the actor, or changes its colour.      | Synced. Every device sees it. Only `kind: 'human'` actors are editable.                                 | D-1          |
| **S18** | Sees two "You" entries and wants one.          | **No mechanism.** Cannot merge actors, cannot delete one, cannot claim one.                             | **D-4**, D-6 |
| **S19** | Wants to be a different person on this device. | No mechanism, and no reason to want it in a single-tenant app — which changes if D-14 changes.          | D-13         |
| **S20** | Wants to know which of their devices is which. | Device names are guesses from the user agent (`Android`, `Mac`) until renamed. Two Macs are both `Mac`. | D-3          |

### 4.4 Rooms

| #       | Scenario                                      | Today                                                                                                  | Raises     |
| ------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| **S21** | Wants a second, separate document ("work").   | Not possible. One local database, one document, regardless of room.                                    | **D-11**   |
| **S22** | Wants to move a document to a different room. | Change the room; the document follows because it never left. Merges with anything there.               | D-11       |
| **S23** | Two tabs briefly hold different sync configs. | Possible mid-edit in settings. Each tab targets its own room; both merge into the same local document. | D-10, D-11 |
| **S24** | Wants to open two rooms at once.              | Not possible.                                                                                          | D-11       |

### 4.5 Multi-tenant (all currently impossible)

| #       | Scenario                             | Today                                                                                                                   | Raises   |
| ------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| **S25** | Two people in one room.              | Mechanically works — two actors, two colours, attribution and scoped undo all function. Nothing else does.              | **D-14** |
| **S26** | Inviting someone to a room.          | No mechanism. Would mean handing over the relay-wide token (§2.2c), which grants every room on that relay.              | **D-14** |
| **S27** | Someone claiming to be someone else. | Unpreventable, by design. Any writer can write any actor entry and attribute anything to any id (PRD §11.4, TRD §10.6). | **D-14** |
| **S28** | Removing someone from a room.        | No mechanism, and nothing positioned to enforce one.                                                                    | **D-14** |

### 4.6 Degenerate and hostile

| #       | Scenario                                              | Today                                                                                                        | Raises   |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| **S29** | localStorage denied or full.                          | Silent. New identity every launch (§2.2d), no indication.                                                    | **D-12** |
| **S30** | Safari evicts storage after a week of not using it.   | The document is gone locally, not just the identity. Recovered from the relay if configured; otherwise gone. | D-12     |
| **S31** | Same actor id live on two devices at once.            | Only reachable if D-4 allows claiming. CRDT-safe; makes "last synced from" and undo scoping ambiguous.       | D-4, D-7 |
| **S32** | Roster accumulates dozens of dead actors.             | Nothing prunes it. Entries are small, and permanent.                                                         | D-6      |
| **S33** | An actor entry is edited concurrently on two devices. | Last-writer-wins on the whole `{kind, name, color}` value.                                                   | —        |

---

## 5. The decisions

Options, with what the user sees and what each choice forces. **No recommendations.** Where a PRD
principle narrows a decision, that is noted as a narrowing, not an answer.

### 5.1 Identifying yourself — D-1, D-2, D-3

**D-1. Does the user ever tell the app who they are, and when?**

| Option                                         | The user sees                                               | Forces                                                            |
| ---------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| Never — always generated                       | Nothing, ever. "You" everywhere.                            | D-4 has nothing to key on. S18 stays unfixable.                   |
| A name, at first run                           | A field before the first keystroke.                         | Directly contests PRD principles 1 and 2.                         |
| A name, at the first moment it means something | One field, once, when a second device or person can see it. | Requires choosing the trigger: configuring sync? first peer seen? |
| A real account                                 | Sign-in.                                                    | Requires D-14 and a relay with authority.                         |

**Narrowing, not an answer:** principle 1 ("text entry is the product") and principle 2 ("structure
is opt-in, never demanded") both cut against asking at first run. They do not settle the trigger, and
the trigger is the actual decision.

> **Decided.** Generated by default. A name is asked for when the user wants something a name is
> needed for — online backup or cross-device sync — and not before. The trigger is the opt-in, not
> the first run and not the first peer.

That answer generates a structure the rest of the document needs, so it is written out in §5.1.1.

#### 5.1.1 The identity ladder

D-1's answer is not one state but three, with named events that promote between them. Each rung is
reached only by asking for something that needs it.

| Rung             | What the user has                  | Reached by                                                                                                | Costs money? |
| ---------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------ |
| **1. Generated** | No name. Local only.               | Opening the app. The default, forever, for anyone who never asks for more.                                | No           |
| **2. Named**     | A display name; cross-device sync  | Opting into cross-device sync or online backup.                                                           | Open — D-16  |
| **3. Account**   | A real credential; payment-capable | Paid online backup; connecting an AI; **or every user, if D-17's security bar cannot be met without one** | Yes          |

Three constraints on that ladder, stated as constraints rather than as questions:

- **No free-then-charge.** If rung 2 cannot be sustained free, it does not ship free first. That rules
  out finding out later, which is what makes D-16 a gate rather than a preference.
- **Cheap to host is a product requirement, not an implementation preference.** It decides whether
  rung 2 exists at all. Cheap here means both dimensions: no per-user server cost that scales with
  use, and no server state to keep alive (§2.3, point 3).
- **Rung 3 is reachable from several directions**, and one of them is not a feature: if the security
  bar (D-17) cannot be met without real accounts, then rung 3 is not the top of a ladder, it is the
  entry requirement, and rung 1 becomes a local-only mode rather than the default path. **This is the
  single largest branch in this document** and it is decided by research, not by preference.

**D-2. Is an identity per person, per device, or a labelled pair?**

| Option             | The user sees                                                     | Forces                                                                               |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Per device (today) | One "You" per device; three devices, three colours.               | S18 is by design. Undo is per device, which is at least consistent.                  |
| Per person         | One "You" everywhere, whatever device it came from.               | Needs D-4. Makes cross-device undo a real question (D-7).                            |
| A labelled pair    | "Tom — phone", "Tom — laptop", grouped as one person in any list. | Keeps today's mechanism; changes only presentation. Needs a person-level name (D-1). |

> **Decided. Identity is per device; presentation is per person.** The two are separable, and
> separating them is what makes "per device" safe: the device is never disclosed to anyone else and
> never reflected back at you. Any list shows one entry per person. Carets are per input surface
> (D-8), labelled with the person's name and never with the device.

This is the arrangement Google Docs has, and it is worth naming why it works rather than only that it
does: the device level exists to answer questions the _system_ has, and the person level exists to
answer questions a _human_ has. Leaking the first into the UI is the whole bug in §2.2a. The two live
reasons to keep the device level at all are both system questions: **telling multiple carets apart**,
and **being able to invalidate a session from a UI when signing in** (D-18).

**D-3. Are device names worth improving?** Today they are user-agent guesses (`Mac`, `Android`) and
two of the same kind collide.

> **Decided in principle: yes.** The mechanism is open, with one guardrail below.

The instinct is to append something derived from the device to disambiguate, and that instinct arrives
at a fingerprint — deriving a stable identifier from device characteristics, which is the thing
privacy budgets and every browser vendor are actively closing off, and which would be a poor look in
a local-first app whose pitch is that your data stays yours.

It is also unnecessary. **A stable random device id already exists** in `localStorage['done.device']`,
minted by `newId()` and carrying no information about the machine. A suffix taken from it — four
characters, or a deterministic word from a small list, `Mac (violet)` — disambiguates two Macs without
deriving anything from the device at all. That leaves the real options as: a suffix from the existing
random id; prompt for a name at the moment a second device appears; or both, with the generated name
as the default the prompt pre-fills. Since the device name is never shown to anyone else (D-2), the
audience for it is one person, which lowers the bar considerably.

### 5.2 Rejoining and pruning — D-4, D-5, D-6, D-7

**D-4. Can a new device claim an actor that already exists in the document?** Cell C of §3.2, and the
decision the most scenarios point at.

| Option                     | The user sees                                                       | Forces                                                                |
| -------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| No — a device is an actor  | Nothing new. Accept S6, S7, S18.                                    | D-2 must be "per device" or "labelled pair".                          |
| Pick from the roster       | After first sync: "Which of these are you?" with names and colours. | Trivial to impersonate — acceptable single-tenant, a hole under D-14. |
| Transfer a secret          | A code or QR from the old device.                                   | Real friction, and a new thing to lose. Needs the old device present. |
| Derive from the credential | Nothing — implied by the token used.                                | Requires per-user tokens, i.e. **D-14 first**.                        |

**D-5. What should opting into sync for the first time do when the room already has a document?**
Today it merges, silently and irreversibly (S10). Options: merge as now; merge but say so first;
refuse and make the user pick which document survives; or treat a non-empty room as a different
document entirely (which is D-11). The user-visible stake is high — this is the one moment where an
ordinary settings action can produce an outcome that cannot be undone.

**D-6. Can a dead actor be pruned, and by whom?** Options: never (S32 forever); hidden from lists
once it has no recent writes; explicitly deletable. Note what deletion cannot do: cards already
attribute to that id, so removing the entry removes the _name_, not the attribution.

**D-7. Should undo ever cross devices?**

> **Decided: no. Distributed undo is a bad idea, and undo never leaves the device it happened on.**

This settles the ceiling and leaves the floor to D-15: within one device, undo is currently per tab,
which is what every tabbed editor does and what the Google Docs comparison in D-2 also gives. Nothing
here decides between per-tab and per-device, and the phrase "undo per device" is doing ceiling work
rather than floor work.

What it does settle is the PRD: §11.3's "undo scoped to your own changes" cannot mean per actor if an
actor may span devices, and cannot mean per actor if it may not (§2.2a makes actor and device the same
thing today). Either way the sentence needs a level in it (§9).

**D-15. Within one device, is undo per tab or shared across tabs?** _(Open — the floor D-7 left.)_
Per tab is today's behaviour, is what tabbed editors do, and keeps two tabs from surprising each
other. Shared-across-tabs would need a cross-tab undo protocol and would let a tab you are not looking
at lose work you can see. The multi-tab note (PR #18) assumed per tab; this is the decision that
confirms or overturns that assumption.

### 5.3 Sessions — D-8, D-9

**D-8. What is a session allowed to be seen doing?**

> **Decided.** Any input surface in a document gets a caret showing where its cursor is — **one caret
> per tab, including your own tabs, each in a different colour.** Labelled with the person's name, per
> D-2, never with the device or the tab. And the peer list is **deduplicated**: it answers whether
> someone is present, not how many times.

The principle underneath is worth keeping in the document, because it decides future cases without
another meeting: **a caret represents an input device in the document, so it exists wherever input can
happen.** Whether the input belongs to you is not part of the test.

⚠️ **This supersedes the multi-tab note.** PR #18 §4.1 argues for per-session carets in _the actor's_
colour, so that sameness of colour reads as "this is also you". D-8 says colour distinguishes carets
instead, and identity is carried by the name. That branch needs the colour rule corrected before it
merges; the rest of its §4.1 — session ids in awareness, ephemeral and never persisted, peers grouped
rather than listed — is unaffected and is what D-2 and D-8 both rest on.

Left open by this: what colour a caret gets, given that colour is no longer the actor's. Per-session
random risks two similar colours; a fixed rotation risks a caret changing colour between reloads,
which is harmless but noticeable.

**D-9. Does the app ever tell you how many tabs you have open?**

> **Decided: never — with a deliberately high-bar exception.** A count may be shown only when it
> explains something the user is otherwise owed, _and_ the justification is strong enough to write
> down at the time. Preference is to solve the underlying thing invisibly instead.

The candidate exception raised is a PWA that cannot update because other tabs are open, so it is worth
recording what is actually true of this app: the service worker calls `skipWaiting()` on install and
`clients.claim()` on activate (`vite/precacheServiceWorker.ts`), so **it does not wait for tabs to
close** and the classic "quit every tab to update" problem does not exist here. The residual case is
narrower: activate also deletes the previous cache, so an open tab running the old build that later
requests a lazily-loaded chunk finds it evicted. The fetch handler falls through to the network, so
online it recovers silently and offline it fails — and the fix is cache retention or a reload prompt,
not a tab count. Which is the shape the exception should always take: if a tab count is the answer,
the question was probably wrong.

The other candidate is Phase 4's search index, where one tab holds the OPFS lock and the others cannot
search. TRD §6.2 already commits to saying so — but note that "search is unavailable in this tab" is
the useful sentence, and it does not require a count either.

### 5.4 Rooms — D-10, D-11

**D-10. Is sync configuration a property of the device or of the document?** Today: the device, and
each browser profile is configured independently by hand (S13, S23). Options: keep it local (a token
belongs to the browser it was typed into, which is TRD §4.8's stated reason); sync the endpoint but
not the token; sync everything but the token and prompt for that.

**D-11. What is a room?** The largest decision here, and the one §2.2b shows is already half-made in
a direction nobody chose.

| Option                                                                             | The user sees                                                            | Forces                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A relay detail, typed once                                                         | One document, forever. The room field is plumbing.                       | S21, S22, S24 are permanent non-goals. Simplest, and honest about today.                                                                                                                                        |
| **A document** — a room names one                                                  | Switching rooms shows a different document. Nothing merges.              | The local database becomes room-derived; the existing `done` database happens to match the default room name, which makes the migration lucky rather than hard. Raises whether the actor is per room or global. |
| **A membership boundary** — a room is who is allowed, and documents live inside it | Switching rooms changes both who can see it and what you are looking at. | Content becomes a fifth level (§1, §2.2b), separate from the room. Requires D-14, since "who is allowed" needs something able to allow. The natural reading if the relay ever knows about users.                |
| Several rooms at once                                                              | A picker; multiple local documents; possibly several open editors.       | The biggest change in this document. Multiplies every level below it.                                                                                                                                           |

Note what is **not** in that table any more. "A share of one document", where switching re-points the
merge, was listed in draft v1 as an option; it is today's behaviour and it is a defect (§2.2b). No
reading of "room" makes converging two unrelated histories the desired outcome, so whichever row wins,
changing a room must not merge.

The two live readings differ in one word: whether a room is **content** or **permission**. That is
worth settling before the rest, because it decides whether §1 has four levels or five, and because
_(identity, document)_ rather than _(room)_ is what the local database would be keyed by (§2.2b).

### 5.5 Resets — D-12, D-13

**D-12. What does the app do when local identity is gone but the document remembers it?** S7, S29,
S30. Options: silently mint a new one (today); notice and offer D-4's claim flow; or notice and say
so without offering anything, which is at least honest. Related: should the app ever _tell_ the user
that storage is not durable? `requestPersistentStorage` already reports granted/denied and the menu
already shows it, so there is a surface for this.

**D-13. Is there a deliberate "start fresh" or "not me" action?**

> **Decided: yes, such an action exists.** Whether it is the same thing as sign-out is open, and so is
> what it clears.

Two sub-questions left, both worth settling with D-14 rather than before it. **What it clears:**
identity only, leaving the document; or identity and document. They are very different promises — the
first is "I am someone else now", the second is "there was never anyone here" — and only the second is
what a shared-laptop user means. **Whether it equals sign-out:** if the ladder reaches rung 3, sign-out
already has to exist, and a second nearby button that does almost the same thing is how people lose
data they meant to keep. Under §2.3's stateless-token discussion, note that "sign out" on a device
whose token cannot be revoked is a local action with no remote effect — which makes the honest label
different from the expected one, and is exactly the kind of thing D-18 decides.

### 5.6 The multi-tenant question — D-14

**D-14. Does the relay stop being a dumb pipe?**

This is the decision that S25–S28 all reduce to, and it deserves to be recognised as one decision
rather than a direction of travel. The PRD's own argument about agents applies verbatim to humans:
in a local-first CRDT with a relay that treats updates as opaque, **there is nothing positioned to
reject a write** (PRD §11.4, TRD §10.6). So:

- **No.** Multi-tenancy is possible but strictly cooperative: everyone in a room can write anything,
  attribute it to anyone, and edit anyone's roster entry. Fine among people who already trust each
  other with the whole document — a couple sharing a list, a pair of colleagues. Not fine as a
  product for strangers. Rooms stay separated only by knowing the room name and the relay token, and
  §2.2c says the token does not even separate rooms today.
- **Yes.** The relay gains identity, room membership, and per-user credentials, and becomes the thing
  that can refuse. That is a different system from the one TRD §2 describes, with a real auth story,
  an account model, and a server that is no longer optional — and PRD principle 3 ("offline is the
  normal state") has to be re-argued against it.
- **Partly — and this is the position §2.3 uncovered.** The relay gains an _authentication_ surface
  without gaining _document_ authority. It decides who may open a connection, which it already does,
  and issues a per-user credential, which it does not. Every byte through that connection stays opaque,
  so it still cannot reject a write and §2.2c's problem is fixed while PRD §11.4's argument stays
  intact. Rooms become separable by credential; content inside a room stays cooperative. This is a
  smaller change than "yes" and a real answer to S26, and it does **not** answer S27 or S28 — nothing
  short of authority over content does.

So D-14 is really two questions — _may the relay decide who connects?_ and _may it decide what is
written?_ — and they have different costs and different answers available. Everything else in this
document can be decided before either, provided each choice records which way it leans: D-4's roster
picker, for instance, is fine under "no", fine under "partly", and a hole under "yes".

### 5.7 The gates — D-16, D-17, D-18

Three questions that decide the shape of the ladder in §5.1.1 and are not answerable by preference.
They are research, and they belong to a different conversation; they are recorded here because the
ladder is not real until they are answered.

**D-16. Can cross-device sync be cheap enough, and stateless enough, to be free?** _(Open —
research.)_ "Cheap" has two dimensions and both are hard requirements: no per-user cost that scales
with use, and no server state that has to be kept alive. The no-free-then-charge constraint (§5.1.1)
makes this a gate rather than a preference — it has to be answered before rung 2 ships, not after. Note
the interaction: WebSockets are the expensive shape, so this question and "what replaces the relay's
transport" are one investigation.

**D-17. What does "reasonably secure" mean, concretely enough to test?** _(Open — and it is the
largest branch in the document.)_ If the bar cannot be met without real accounts, then accounts are not
rung 3, they are the entry requirement, and rung 1 becomes a local-only mode rather than the default
path. That changes the first run for every user, so the bar needs to be written down as something
checkable — at minimum: what an attacker with the relay URL can do, what they can do with a leaked
credential, and what is true of data at rest on the server if there is one. §2.3 improves two of those
independently of the answer.

**D-18. Are sessions enumerable and revocable from a UI?** _(Open.)_ Wanted explicitly — "invalidate
sessions upon logging in" is one of the two live reasons the device level exists at all (D-2). It is
also in direct tension with D-16: revocation needs server state, statelessness is what makes hosting
cheap, and short-expiry-plus-refresh is the usual compromise at the cost of a request the app must
never block on (§2.3, point 3). Sub-questions: is the unit revoked a session or a device (they differ —
a device outlives its tabs); does revoking reach a device that is offline, or only take effect when it
next connects; and is "sign out" on an unrevokable credential honestly labelled (D-13).

### 5.8 Prior art worth watching

The problem of authentication and authorisation for local-first CRDTs is being actively worked on, and
not in the Yjs ecosystem. **Ink & Switch's Keyhive** is the serious effort: capability-based access
control designed for partition tolerance, with read/write/admin modelled as chains of signed
delegations, group membership derived from those chains, revocation by the delegator, and an
integration into Automerge Repo as an auth provider. The interesting part for this document is that it
is designed so that _the server does not have to be the authority_ — capabilities travel with the
data, which is the only known shape that gives D-14 a "yes" without giving up principle 3.

Two implications, neither of which is a decision:

1. **It is Automerge's, not Yjs's.** Nothing equivalent exists behind this app's seam, so a real
   authorisation story is either bespoke, server-side (which is the "yes" branch, with its costs), or a
   reason to re-examine the CRDT choice — and TRD §10.1 already treats a Yjs v14 migration as planned
   debt, so the cost of that re-examination is known rather than unbounded.
2. **Watch it rather than wait for it.** The single-tenant work in this document does not depend on it,
   and the "partly" branch above is available regardless.

---

## 6. Forced, for the record

Not decisions. Listed so they do not consume discussion.

- **A session id is ephemeral and never persisted.** Persisting it would make two tabs share one
  session and a reload keep a stale one, which is the opposite of what it is for.
- **A session id is not the Yjs client id.** That is an implementation detail, random per document
  instance, and already the thing the peer list mis-counts.
- **A device is a browser profile.** Not a machine. Two browsers on one laptop are two devices
  because localStorage says so, and no product decision changes that.
- **The actor roster syncs; which actor you are does not.** Already TRD §4.8, and correct: a device
  name that synced would stop being about the device.
- **Attribution cannot be revoked.** Cards carry an actor id. Deleting a roster entry deletes the
  name, not the history.
- **Changing a room must not converge two histories.** No reading of "room" makes that the wanted
  outcome, so it is a defect to remove rather than an option in D-11 (§2.2b).
- **A cookie cannot be waited on.** Whatever the credential turns out to be, nothing on the read or
  write path may await it — TRD §7.1 already says this about sync state, and §2.3 is why it now also
  covers authentication.
- **Actor ids do not collide.** UUIDv4.
- **A restored or unfrozen tab must re-establish its view.** It has no way to know what it missed.

---

## 7. What this costs the first experience

The initial experience is where identity decisions are most expensive, because it is the only moment
the user has no reason to care and no context to answer. Three constraints already exist and are worth
having in front of us before §8:

1. **The first run cannot ask who you are** — principle 1 and principle 2 both point this way (D-1).
   So any name is either generated or deferred, and "deferred to when?" is the real question.
2. **There is exactly one moment today when a name becomes load-bearing:** configuring sync, because
   that is the first time another device can see it. If the answer to D-1 is "ask lazily", that moment
   is the only candidate the current app offers.
3. **The most consequential action in the app is a settings field.** Turning on sync (S10) or changing
   a room (S14) can converge two documents irreversibly, and both are one text field and a save.
   Whatever D-5 and D-11 decide, the gap between how ordinary those controls look and how permanent
   their effect is deserves to close.

### A worked example, three ways

Tom has been using `done` on his laptop for a month. He gets a new phone and wants his list on it.

- **Today.** Installs, types nothing, opens settings, enters the relay and token, saves. His month of
  laptop history appears. He is now a second actor called "You" with a different colour; the roster
  has two entries; nothing tells him. Cards he writes on the phone attribute to the phone-actor
  forever, and undo on the laptop never touches them.
- **With D-4 "pick from the roster".** Same flow, plus one screen after the first sync: "Which of
  these are you?" — one entry, "You", his colour. He taps it. One actor, two devices, and the phone
  says "last synced from Mac".
- **With D-11 "a room is a document" and D-1 "ask lazily".** Entering the relay asks which room, and
  a room he has not opened here before is offered as a document to open rather than merged into the
  empty one he has. The name prompt appears once, at the same moment, because it is the first time
  the answer will be seen anywhere.

The three differ by two screens. That is roughly the whole budget this document is arguing about.

---

## 8. Decision register

| ID       | Question                                                        | Status                   | Answer, or what happens without one                                                        |
| -------- | --------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| **D-1**  | Does the user tell the app who they are, and when?              | **Decided**              | Generated by default; a name when opting into backup or cross-device sync (§5.1.1)         |
| **D-2**  | Is identity per person, per device, or a labelled pair?         | **Decided**              | Per device internally; per person in every list. Device never disclosed or reflected       |
| **D-3**  | Are device names worth improving?                               | **Decided in principle** | Yes. Mechanism open — and it does not need a fingerprint                                   |
| **D-4**  | Can a new device claim an existing actor?                       | Open                     | Every device is a new actor forever                                                        |
| **D-5**  | What happens when sync first meets a non-empty room?            | Open                     | Silent irreversible merge                                                                  |
| **D-6**  | Can dead actors be pruned?                                      | Open                     | The roster only grows                                                                      |
| **D-7**  | Should undo ever cross devices?                                 | **Decided**              | No. Never leaves the device                                                                |
| **D-8**  | What may a session be seen doing?                               | **Decided**              | A caret per tab, own tabs included, distinct colour, person's name. Peer list deduplicated |
| **D-9**  | Does the app ever show a tab count?                             | **Decided**              | Never, save a high-bar exception that must be justified in writing                         |
| **D-10** | Is sync configuration per device or per document?               | Open                     | Per device, configured by hand each time                                                   |
| **D-11** | What is a room — content, or permission?                        | Open                     | "A share of one document", which nobody chose and which merges histories                   |
| **D-12** | What happens when local identity is lost?                       | Open                     | Silent new identity                                                                        |
| **D-13** | Is there a deliberate reset?                                    | **Decided**              | Yes. Whether it is sign-out, and what it clears, open                                      |
| **D-14** | May the relay decide who connects? What is written?             | Open                     | Multi-tenancy stays cooperative-only and undeclared                                        |
| **D-15** | Within a device, is undo per tab or shared?                     | Open                     | Per tab, as today and as PR #18 assumed                                                    |
| **D-16** | Can cross-device sync be cheap and stateless enough to be free? | Open — research          | Rung 2 of the ladder cannot ship either way                                                |
| **D-17** | What does "reasonably secure" mean, concretely?                 | Open — research          | Cannot tell whether accounts are optional or mandatory                                     |
| **D-18** | Are sessions enumerable and revocable from a UI?                | Open                     | Signing in cannot invalidate anything                                                      |

Suggested order for the remainder, on dependency rather than importance:

1. **D-11** and **D-14** — content-or-permission, and what the relay may decide. They constrain
   everything left, and §2.2b shows they cannot be decided independently.
2. **D-17**, then **D-16** — the two research gates. D-17 first, because if its bar needs accounts then
   the ladder collapses to one rung and several questions below stop mattering.
3. **D-4**, **D-5**, **D-12** — the flows a user actually walks through, all three of which are shaped
   by whether D-4 has a credential to key on.
4. **D-15** and **D-18** — the two floors left by decided ceilings (D-7 and D-2).
5. **D-6**, **D-10** — the remainder, neither of which blocks anything.

**Unblocked now:** the multi-tab work was waiting on D-8, which is decided, subject to the colour
correction noted there.

---

## 9. PRD amendments this would require

- **§0 Terminology** — add device, session and room beside actor, since three of the four are already
  in the code and none of them is defined in the document.
- **§11.3** — "One human actor, created on first run" is true per device and false per person
  (§2.2a). Either the sentence changes or the behaviour does; today they disagree silently.
- **§11.3** — "Undo scoped to your own changes" needs a level in it. Per D-7 it never crosses devices;
  per D-15 the level inside a device is still open, and the sentence should not be rewritten until it
  is.
- **§11.3** — "No presence UI" is no longer true as written. D-8 ships carets for every input surface,
  which is presence, deliberately, and the sentence's real intent — no actor management, nothing to
  administer — survives and should be what it says.
- **§12** — the non-goal "No human collaboration. One person, own devices — no sharing, no multi-user
  accounts" is what D-14 asks about. If D-14 is "no", this document narrows to single-tenant identity
  hygiene and the non-goal stands as written. If "yes" or "partly", the non-goal and the document's
  single-tenant framing both have to be rewritten, not footnoted.
- **§14 Open questions** — D-1 through D-18 belong here, or here by reference, once decided.
- **A new section, or this document promoted** — the levels of §1 are product surface, not an
  implementation detail, and they are currently written down nowhere. Note that the count is not
  settled: D-11 decides whether there are four or five.

### 9.1 One change owed to the multi-tab branch

PR #18 §4.1 specifies per-session carets in **the actor's** colour, arguing that sameness of colour
reads as "this is also you". D-8 decides the opposite — a distinct colour per caret, with the person's
name carrying identity — so that branch needs its colour rule corrected before it merges. Everything
else in its §4.1 stands, including the session field in awareness, the never-persisted rule, and
grouping peers rather than listing them, which D-8's deduplicated peer list confirms.

## 10. Out of scope for this document

- **How any of it is built.** No storage shapes, no protocols, no migrations beyond noting where one
  would be needed. That is the TRD's, once the decisions exist.
- **The multi-tab implementation**, which is specified separately (PR #18) and which needs D-8 and
  nothing else here.
- **Permissions.** PRD §11.4 already settles that they do not follow from the actor model, and D-14
  is where the subject legitimately reopens.
- **Sharing a single day, a single card, or a link to anything.** Not raised by any scenario above,
  and a different feature.
