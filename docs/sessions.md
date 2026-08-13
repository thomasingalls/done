# done — Sessions and Identity: Product Requirements

**Status:** Draft v5 — **19 of 25 decisions recorded**, the rest open. See §8.
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

## 1. The levels

| Level       | Answers                                      | Example                       | Exists today               |
| ----------- | -------------------------------------------- | ----------------------------- | -------------------------- |
| **Account** | who you are, across devices                  | you                           | **No** — the missing level |
| **Actor**   | one account's writing identity on one device | you-on-your-phone; the app    | Yes, and misnamed (§1.1)   |
| **Device**  | which install                                | your phone                    | Yes                        |
| **Session** | which tab, this run of it                    | the tab you are looking at    | No                         |
| **Room**    | who is allowed (D-11)                        | your document and its members | As a settings field only   |

Draft v1 and v2 put the missing level at the bottom. **It is at the top.** Sessions were the visible
gap because multi-tab needed them, but the level that explains the rest — grouping your devices,
finding your own peers, two people on one laptop — is the one above actor, and it does not exist
because nothing in the app knows what an account is.

### 1.1 Actor is the wrong word for what the code has

The PRD's "actor" means "anything that can write" — you, the app, later an agent. The code's actor is
narrower than that and nobody noticed: it is minted per browser profile and never travels, so what it
identifies is **one account's writing identity on one device.** Two devices, two of them, permanently
(§2.2a).

D-4 decides that this is correct and should stay. Which means the naming problem is real: "actor" is
being asked to carry both "who is writing" and "which install is writing", and those are different
questions with different answers. Given D-4, the useful statements are:

- **For humans, actor and device are one thing.** One per account per install. Calling them two levels
  is bookkeeping, not a distinction anyone can observe. The two separate UUIDs in
  `localStorage` — `done.actor` and `done.device` — are one fact stored twice.
- **For non-humans they come apart**, which is why both levels survive. The system actor is a constant
  (`SYSTEM_ACTOR_ID = 'system'`) shared by every device, and an agent would be an actor with no device
  at all.
- **The level that groups them is the account**, and the thing that supplies it is authentication.
  Which is why D-4 turns out to be downstream of auth, exactly as suspected.

A working name for the human case would help, since "actor" is taken and "device" is the install
rather than the identity on it. This document uses **actor** throughout and flags where it means the
per-install kind; naming it properly is worth doing before it reaches the UI.

Each level is the right answer to different questions, and picking the wrong level is the whole
category of bug this document is about:

- Attribution ("who wrote this card") is **actor**. Cards already carry `author` (`newCard` sets it).
- "Last synced from ⟨x⟩" is **device**.
- Anything shown to a human as "you" is **account** — which is why it cannot be built yet.
- A caret is **session**: a caret is a place input is happening, and two tabs are two places (D-8).
- Undo is **session**, per tab (D-7, D-15).
- An exclusive resource — the search index's OPFS lock — is **session**, arbitrated per device.
- Sync configuration is **device** today, and D-10 says the user should never have to think about it.

### 1.2 Two rules that settle future cases

Both came out of the decisions below and both generalise past them, so they are recorded here rather
than buried in the decision that produced them. They rank beneath the PRD's principles and above
anything in this document.

**Rule 1. The user never manages rooms.** Room management is not a task to make pleasant; it is a task
to remove. Anything that requires a person to know what a room is, name one, or copy one between
devices has failed (D-10, D-11).

**Rule 2. The UI never promises anything about a remote device that cannot be kept.** No auto-hiding a
member as though they were gone, no "removed" that does not remove, no presence claim that outlives
the connection it was inferred from. Where the truth is unknown, show it as unknown — a muted colour
for a device not seen in a while is honest; omitting it is not (D-6).

A corollary of Rule 1, worth stating because it cannot be fully achieved: **security cannot be hidden
as completely as room management can.** Signal, WhatsApp and every serious attempt converge on a small
irreducible surface — a way to verify a peer, a warning when a peer's identity changes, and a list of
your own devices. Notably, that list is the same artifact D-18 wants for session invalidation and the
same one D-19 wants for peer discovery, which suggests the irreducible security surface and the useful
device surface are one screen rather than two.

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
contains documents. D-11 now takes the second reading, which raised the possibility of content becoming
a level of its own — and then closed it again, because "one logged-in user, one document" collapses room,
document and account into one thing rather than separating them (§5.4). §1's table reflects the
collapsed model; §5.4 is the reading that needs confirming.

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

### 4.7 Ladder transitions (none of which exist yet)

Added because the decisions in §5 created them. Every row is a promotion or demotion between rungs of
§5.1.1, and every one moves data.

| #       | Scenario                                            | Raises                |
| ------- | --------------------------------------------------- | --------------------- |
| **S34** | Pairs a second device, having never had an account. | D-19, D-23            |
| **S35** | Creates an account, having already paired devices.  | **D-24** — the risk   |
| **S36** | Deletes the account, keeping the devices.           | D-17, D-24 in reverse |
| **S37** | Revokes a device that is currently offline.         | **D-18**              |
| **S38** | Opens a device that has been revoked.               | **D-18**              |
| **S39** | Loses the only device in a paired group.            | D-19, D-12            |

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
  rung 2 exists at all. But "cheap" is not "zero marginal cost" — D-16 relaxes this: per-user cost that
  scales with use is acceptable when the per-user quantities are tiny, and the real variable is what
  fraction of users never cross into the paid tier.
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

> **Decided: no. A new device is a new actor, always.** Browser, profile, phone, computer — each
> install that writes gets its own writing identity, and none of them ever claims another's.

The reason this looked complicated is that D-4 was two questions wearing one coat, and only one of
them is about claiming:

1. **"Which of these entries is me?"** — a _presentation_ question, and D-2 already answered it: one
   entry per person in every list, the device never disclosed or reflected back. Nothing needs claiming
   for that; it needs a level above actor to group by, which is §1's account.
2. **"Which of these devices are mine at all?"** — a _discovery_ question, and it is the real hole.
   Today the answer is entirely manual: you type the same endpoint, room and token into both devices,
   and that act of typing _is_ the discovery mechanism. Under any account model it would be implied by
   signing in. This is now **D-19**, and it is indeed downstream of auth.

So the shape is: two independent installs, each writing under its own identity, that at some point
learn they belong to the same person and thereafter share a history. Nothing about that requires either
one to pretend to be the other — which is what makes "always a new actor" the clean answer rather than
a limitation, and it is why the roster having two entries is only a bug when the UI shows both to a
human as though they were two people.

**D-19. How does a device find the other devices that are yours?** _(The hole D-4 was circling.)_

Today the mechanism is three text fields typed identically on both devices, which Rule 1 forbids and
which is also the only reason the two ever meet. So this is not a refinement of an existing flow; it is
a flow that does not exist yet. Options, all of which assume something about the credential:

| Option                         | The user does                                        | Needs                                                           |
| ------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------- |
| Manual configuration (today)   | Types endpoint, room and token on each device.       | Nothing. Violates Rule 1.                                       |
| Implied by signing in          | Signs in. Their devices are the ones on the account. | An account, so **D-14** and the ladder's rung 2 or 3 (§5.1.1).  |
| Pairing between devices        | Scans a code shown on the other device.              | Both devices present at once; a pairing protocol; no account.   |
| Discovery on the local network | Nothing, on a shared network.                        | mDNS or similar, which a browser cannot do — so a relay anyway. |

> **Decided: build both middle options.** A pairing flow that creates the discovery channel without
> creating an account, and a sign-in flow for when there is one. The ladder does not merely permit both,
> it requires them.

**Why the ladder requires both, spelled out**, because this is what makes its rungs functional rather
than decorative:

| Rung             | Discovery mechanism | What it buys                                   |
| ---------------- | ------------------- | ---------------------------------------------- |
| **1. Generated** | none                | one device, local only                         |
| **2. Named**     | **pairing**         | your devices find each other, with no account  |
| **3. Account**   | **sign-in**         | the same, plus everything an account can carry |

Without pairing, rung 2 cannot exist: cross-device sync would require an account, which collapses the
ladder to "local or signed in" — the shape D-17 threatens as a fallback and which should not arrive by
default. Without sign-in, rung 3 has nothing to authenticate. So the two mechanisms are the rungs, and
building one is building half a ladder.

**Both satisfy Rule 1, and it is worth seeing why in the same sentence: pairing _derives_ the room,
sign-in _assigns_ it.** Under pairing, whatever the two devices agree on can also produce the channel
identifier, so nobody types a room name. Under sign-in, the account determines it, so nobody types a
room name. There is no third thing to configure in either case, which is the strongest evidence so far
that "room" belongs at the wire level and nowhere near a user (D-11).

**Three consequences, one of them a real asymmetry.**

1. **Pairing needs both devices present at once, so rung 2 has no recovery story.** Lose your only
   paired device and the group is gone with it — there is nothing to pair the replacement against. Rung
   3 recovers by signing in. That sharpens what the rungs mean and is worth confirming as intended:
   **rung 2 buys convenience, rung 3 buys durability.** It also gives D-12 the shape of an answer, since
   what the app can offer after storage loss depends entirely on which rung the user was on.
2. **Two mechanisms are two trust roots.** Pairing establishes device-to-device trust out of band, via a
   human carrying a code between two things they physically hold, and needs the relay to know nothing.
   Sign-in establishes device-to-server trust. The first is compatible with D-14 staying "no" and with
   the stateless requirement of D-16; the second is what makes revocation possible at all (D-18). They
   are not redundant, and neither subsumes the other.
3. **The promotion path is new, and it is where this class of product loses data.** Pairing three devices
   at rung 2 and later creating an account has to do something coherent with the group that already
   exists. That is **D-24**, and it is not a detail.

Both mechanisms end at the same artifact — a list of your own devices — which is the list D-18 revokes
from and the one §1.2 calls the irreducible security surface. One screen, three jobs, reached two ways.

**D-23. Does pairing alone trigger the name prompt?** _(Open — a refinement of D-1, not a re-opening.)_
D-1 asks for a name when the user opts into cross-device sync or online backup. But pairing two of your
own devices has no audience for a name: per D-2 every list shows one entry per person, and with one
person that entry is you. The audience appears when someone else can see it — a second member in your
room — or when an account needs a handle. So D-1's trigger may have bundled two events that D-19 has now
separated, and the question is whether rung 2 has a name at all or whether the prompt belongs to sharing
and account creation only. Cheap either way, and better answered before the first-run flow is drawn.

**D-5. What should opting into sync for the first time do when the room already has a document?**
Today it merges, silently and irreversibly (S10). This is the one moment where an ordinary settings
action produces an outcome that cannot be undone.

> **Decided, by case:**
>
> | Local | Remote | Behaviour                                                               |
> | ----- | ------ | ----------------------------------------------------------------------- |
> | empty | full   | Adopt remote wholesale.                                                 |
> | full  | empty  | Adopt local wholesale.                                                  |
> | empty | empty  | Nothing to discuss. Adopt local, as policy.                             |
> | full  | full   | **Stop and ask**, with a preview, and never merge without confirmation. |
>
> And in every case the user may choose **merge · theirs · ours · abort**.

The hard case is the one worth spending on: a preview of what the merge would produce — a room preview,
a side-by-side, something that makes the outcome legible before it is irreversible — plus an explicit
warning and an invitation to back up first. The motivation is right and worth recording, because it
explains what "good" means here: a git-style flow where a large merge can be inspected and adjusted
piece by piece is genuinely useful precisely when the merge is big, and the absence of anything like it
is why silent convergence is unacceptable rather than merely impolite.

**What the four choices cost, because they are not symmetric.** This is mechanics, not product, but the
product choice should be made knowing it:

- **merge** is free. It is what the CRDT does natively.
- **abort** is free _if nothing has been exchanged yet_, and impossible afterwards — there is no
  un-merge. So the preview has to be built from remote state fetched into a **separate** document and
  rendered from there, with the real document untouched until confirmation. That is straightforward, and
  it is the mechanism that makes abort a real option rather than a button that lies.
- **theirs** is achievable locally: discard the local database and adopt the remote. Destructive on this
  device, and only this device.
- **ours** is the awkward one. In a CRDT you cannot remove another replica's history by pushing to it —
  you can only add. So "ours" means either the relay supports truncating a room, or the local document
  moves to a **new** room and the old one is abandoned. The second needs no new server capability and
  is probably the honest implementation; the first is a third example of a capability the relay could
  gain without gaining authority over content (§2.3, D-14).

**D-22. Should merged content show its provenance?** _(Open, and worth keeping.)_ The idea: after a
merge, tint cards by which device created them until the freeze window passes, so what needs rearranging
is visible. Two useful facts about feasibility:

- **For cards this is available now.** `newCard` records `author`, and per D-4 a human actor _is_ a
  device, so "which device created this" is already stored on every card. No new data.
- **For the master list and Goals it is not.** Per-character attribution inside a document is explicitly
  deferred (PRD §14, open question 2) and is the costly thing there. So line-level tinting in Goals needs
  that decision first, and the card version does not have to wait for it.

Which makes this splittable rather than off-topic: the card half is cheap and could ship with D-5, and
the text half is a different question about attribution granularity.

**D-24. How does a paired group become an account?** _(Open, and the highest-risk question in the
document.)_

D-19 builds both discovery mechanisms, so a user can arrive at rung 3 having already paired three devices
at rung 2. What happens to the group is the promotion path, and promotion paths are where local-first
products lose data. Three shapes, and they are not equally safe:

- **The account adopts the group.** The existing devices and document carry over; the account is a new
  credential over the same group. Safest, and it requires the account model to be able to accept an
  identity that predates it — which is a constraint on D-14's design, not a detail of the UI.
- **The account starts fresh and the group is abandoned.** Simplest to build and the one that loses a
  month of someone's history. If this is where the implementation lands by default, that is the failure
  mode to catch in review, not in use.
- ~~**They coexist.**~~ **Ruled out by D-17's one-functional-trust-root-at-a-time constraint.** Two live
  trust roots is exactly what that forbids, so a paired group cannot run alongside an account.

So D-24 is down to one safe answer and one unsafe one, which makes it less a decision than a thing to not
get wrong. The remaining question is the reverse direction: D-17 also says deleting an account means
re-introducing your devices, so **demotion from rung 3 to rung 2 costs you your pairings** and needs the
same care in the opposite direction (S34).

Note that this is D-5 again, at a different level: two histories meeting, with a decision about which
survives. The four choices there — merge, theirs, ours, abort — are the same four, and so is the
requirement to show what will happen before it happens irreversibly. Whichever way D-24 goes, it should
reuse that flow rather than invent a second one.

**D-6. Can a dead actor be pruned, and by whom?**

> **Decided, per Rule 2.** No auto-hiding — a member never silently disappears from a list because the
> app inferred they were gone. Showing staleness is fine and honest: a device not seen for some interval
> may be muted rather than removed. The interval is an open parameter.

And what deletion could never do is worth keeping in view: cards carry an `author` id, so removing a
roster entry removes the _name_, not the attribution. There is no version of pruning that unwrites
history.

**D-20. How is a member actually excluded?** _(Open, and larger than D-6.)_ "Any node may begin refusing
updates from any other node" is a different and much bigger want than pruning a list, and the honest
statement of the problem is that a CRDT with a forwarding relay has three mechanisms, of which only two
work:

1. **Local refusal.** A node filters incoming updates by their origin. Yjs updates are opaque but not
   opaque _to_ us — client ids can be read out of an update — so this is mechanically possible. It does
   not work, for two independent reasons: Yjs client ids are random per document instance rather than
   stable per device, so there is nothing durable to filter on; and a filtered peer's changes arrive
   anyway, transitively, through any other peer that did not filter. Local refusal is a preference, not
   an exclusion.
2. **Forking the room.** Copy the state to a new room the excluded member cannot reach, and tell the
   remaining members. This works, needs nothing from the relay beyond a second room, and is the reason
   the instinct in the review — "probably fork the room per membership edit" — is the correct instinct.
   It costs a room name per membership change and it makes room identity churn, which collides with
   Rule 1 unless the churn is entirely invisible.
3. **Content encryption with key rotation.** Encrypt document content; on removal, rotate the key and
   re-encrypt forward. The removed member holds a key that opens history and nothing newer. This is what
   Keyhive does (§5.8), and the important observation for this project is that **it is the mechanism most
   compatible with the relay staying a dumb pipe** — a relay forwarding ciphertext is exactly as dumb as
   one forwarding plaintext, so D-14 can stay "no" or "partly" and exclusion still works. The costs are
   real and land elsewhere: key management becomes the hard problem, and any future server-side feature
   that needs to read content becomes impossible by construction.

Under every mechanism, one thing stays true and Rule 2 requires saying it: **a member who has already
synced keeps their copy forever.** Removal governs the future, never the past, and the UI must not
suggest otherwise.

**D-7. Should undo ever cross devices?**

> **Decided: no. Distributed undo is a bad idea, and undo never leaves the device it happened on.**

This settles the ceiling and leaves the floor to D-15: within one device, undo is currently per tab,
which is what every tabbed editor does and what the Google Docs comparison in D-2 also gives. Nothing
here decides between per-tab and per-device, and the phrase "undo per device" is doing ceiling work
rather than floor work.

What it does settle is the PRD: §11.3's "undo scoped to your own changes" cannot mean per actor if an
actor may span devices, and cannot mean per actor if it may not (§2.2a makes actor and device the same
thing today). Either way the sentence needs a level in it (§9).

**D-15. Within one device, is undo per tab or shared across tabs?**

> **Decided: per tab.** "Per device" in the D-7 discussion was a misspeak; the ceiling is the device and
> the floor is the tab.

Which is today's behaviour, what tabbed editors do, and what keeps a tab you are not looking at from
losing work you can see. PR #18's assumption stands, and nothing about undo needs to change.

### 5.3 Sessions — D-8, D-9

**D-8. What is a session allowed to be seen doing?**

> **Decided.** Any input surface in a document gets a caret showing where its cursor is — **one caret
> per tab, including your own tabs** — and **all of your carets share your colour.** Labelled with the
> person's name per D-2, never with the device or the tab. Separately, **the caret where input is
> actually happening gets a distinguished treatment**, and that treatment is the same for everyone
> rather than per-person. The peer list is **deduplicated**: it answers whether someone is present, not
> how many times.

The principle underneath is worth keeping, because it decides future cases without another meeting: **a
caret represents an input device in the document, so it exists wherever input can happen.** Whether the
input belongs to you is not part of the test.

On colour: an intermediate draft of this document had colour distinguishing carets from each other
rather than identifying their owner, and that was wrong. Google Docs is the reference and it settles it —
a person is doing input in one place at a time, so a shared "active" treatment carries the "here is
where the work is happening" signal, which frees colour to mean identity. Four tabs showing four carets
in one colour is clearer than four colours, not less clear, because the question a caret answers is
whose it is. **So PR #18's rule — colour comes from the actor — is correct as written, and that branch
needs no change.**

**D-21. What does "the active caret" mean?**

> **Decided: locally active.** The caret in the tab you are looking at — which is your own cursor.
> Nothing about global recency is relevant to a caret.

The cheap reading, and it is very nearly already true: `yCollab` renders _remote_ carets as decorations
while your own is CodeMirror's native cursor, so "the one you are typing in looks different" may require
no mechanism at all. What it does require is a design check rather than a decision — that the native
cursor reads as deliberately distinct from the remote-caret decorations, in both themes, rather than
merely happening to differ.

What this decision buys is what it avoids: no last-input timestamp in awareness, no cross-client
agreement about recency, no highlight that travels between devices. The observation that a person is
doing input in one place at a time remains the _motivation_ for the design without needing to be
_modelled_ — each tab already knows whether it is the one being typed in, and no tab needs to know
anything about the others to render this.

**A dependency D-21 makes visible.** D-8 says all of your carets share your colour, and colour today
comes from the actor: `resolveActor` assigns a random one from a fixed palette per actor, and awareness
carries it as `user.color`. Since an actor is per device (D-4), two devices mean two colours — so "all of
your carets" only holds within one device until there is an account level to hang a colour on. Which
means PR #18's rule is exactly right for the case it can see, one device with several tabs, and the
cross-device half of D-8 is deferred by dependency rather than by choice. It arrives with D-19's pairing,
not before.

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

> **Decided in principle, as Rule 1: the user never manages rooms.** The mechanism is open and depends
> on the account model, but the target is that room management stops being a task rather than becoming
> a nicer one.

That rules something specific out, which is what makes it useful rather than aspirational: **the current
settings panel is the thing being ruled out.** Three fields — endpoint, room, token — typed by hand on
every device, is the maximal version of the task Rule 1 deletes. Whatever replaces it, the room name is
not something a person types twice.

It does not rule out a security surface, and §1.2's corollary says why: room management can disappear
entirely, and security cannot. The irreducible minimum that Signal, WhatsApp and every serious system
converges on is a way to verify a peer, a warning when a peer's identity changes, and a list of your own
devices — and since D-18 and D-19 both want that same device list, the honest budget is one screen that
serves all three, not zero screens.

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

The two live readings differ in one word: whether a room is **content** or **permission**.

> **Decided in principle: permission.** A room is a membership boundary. With three constraints
> alongside it: **one logged-in user has exactly one document**; **one device may host several logged-in
> users**; and **"room" must not become architectural**, because the transport it came from is going
> away.

Those three constraints do more work than they look like they do, and one consequence is worth confirming
before it gets built on.

**The constraints nearly determine the model.** If a room is permission, and one user has exactly one
document, then a room cannot be a container of many users' documents without contradicting the second
constraint. The reading that satisfies all three is: **a room is one document plus the list of who may
reach it.** Sharing means adding a member to _your_ room, not joining a shared pool. Two people who each
share with the other have two rooms, and each keeps their own Done list — which happens to match the
app's premise that this is one person's workflow rather than a team's.

If that is right, then **the fifth level collapses rather than appearing**: room, document and account
are one thing seen from three sides, with membership as an attribute of it. §1's table is the model, and
the count stays at five with account at the top rather than growing to six. **This is the reading to
confirm or reject** — the alternative is that a room contains several members' separate documents, which
is a different and larger system.

**On "room" not becoming architectural: agreed, and the word is already the problem.** "Room" is
provider vocabulary — `y-websocket` and `y-webrtc` both use it for the channel name that goes in a URL
path, and other providers call the same thing a document id. It names a _channel_, which is why it
carries transport assumptions, and it is not what the user owns. The product word should be the thing
itself — the document, or the account's space — and "room" should survive only at the wire level, if the
replacement transport even wants it. Renaming it in the product is cheap now and expensive after it
reaches a settings screen.

Also from §2.2b: the local database would be keyed by _(identity, document)_ rather than by room, which
is forced by the second and third constraints together — two users on one browser profile need two local
databases, and neither of them should be named after a channel.

### 5.5 Resets — D-12, D-13

**D-12. What does the app do when local identity is gone but the document remembers it?** S7, S29, S30.

> **Decided in principle: treat the state as illegitimate.** Identity loss with a surviving document is
> not a configuration to support gracefully. It should not be reachable, and where it is reached the app
> should say so rather than paper over it by minting a replacement. What "say so" does next depends on the
> distinction below.

**How would we even get here?** The list is short, and the shape of the list is the argument:

- a bug, including any sync-collision case that turns out to produce it — also a bug;
- deliberate mischief, where someone deletes the identity keys and leaves the document;
- **a feature we build carelessly** — a sign-out that clears identity but not state, or one that does not
  wait for the document to finish being cleared, or an id scheme clever enough to keep local state while
  re-linking identity.

The third is the only one under our control, and it yields a constraint worth writing down: **sign-out
must not be able to leave identity and document out of step.** Clearing IndexedDB is asynchronous and
interruptible; a sign-out that navigates away mid-clear manufactures exactly this state on purpose.
Whatever D-13 turns out to be, it is atomic with respect to these two facts or it is a bug generator.

**The distinction that decides the policy is whether the document has ever been shared.**

- **Never synced.** The actor id is a label with no audience. Nothing observable depends on it — the
  name is "You" either way — so it could cycle on every keystroke and no user could tell. Minting a
  replacement here is harmless, and is just the genesis case (S1) with extra steps.
- **Ever synced.** The document is a shared artifact and membership means something. A fresh random
  identity that appears and begins writing is precisely the unapproved-writer problem, and per D-4 and
  D-19 membership is supposed to come from pairing or an account. So the app must **not** silently mint
  one, and what it should do instead — refuse to write, offer to re-pair, quarantine the document — is
  the part still open.

**And the app can tell which case it is in, from the document rather than from local storage.** The actor
roster lives in `meta[actor:<id>]` and syncs, so it survives localStorage loss. If local identity is
absent but the roster holds human actors, this document has a history that predates the identity now
asking to write. That is the evidence, it is already stored, and it needs no new mechanism.

Related but separate, and now its own decision: whether the app tells the user that durability is not
guaranteed. That is **D-25**.

**D-25. Does the app tell the user when durability is not guaranteed?**

> **Decided: yes, prominently and persistently.** An app whose central claim is local-first must not be
> quiet about a context where the data is not durable. The warning names the reason and offers the action
> — grant persistence where that is a real option, and otherwise route toward server sync.

Today the storage state is reported into the menu, and the menu is a panel the codebase itself describes
as usually closed. So the current arrangement is honest and invisible at the same time, which is the gap.

**Warn about the property, not the diagnosis.** The instinct is to say "you are in private browsing", and
that should be resisted: private-mode detection is unreliable, and every reliable-ish technique is a
fingerprinting vector browsers are actively closing. What _is_ knowable is the consequence —
`navigator.storage.persisted()` answers it directly, and that is the thing worth reporting. Likely causes
can be offered as explanation without being claimed as fact.

The reasons that need distinct copy, because they have different actions:

| Situation                    | Detectable?                    | The action                         |
| ---------------------------- | ------------------------------ | ---------------------------------- |
| Persistence never requested  | yes                            | request it                         |
| Requested and denied         | yes                            | explain; route to sync             |
| Storage API absent           | yes                            | route to sync                      |
| Insecure context             | yes (`isSecureContext`)        | fix the deployment; dev-only       |
| Private or ephemeral context | **not reliably**               | report the property, not the cause |
| Eviction risk on an old iOS  | engine-inferable, not directly | route to sync                      |

**Two things worth knowing about the platform**, since they change how bleak this is:

- **Modern iOS is fine.** The Storage API, including `persist()`, is fully supported from Safari 17 and
  iOS 17. The 7-day cap on script-writable storage applies to origins that have _not_ been granted
  persistence, so the grant is the exemption. There were reports that a grant may not survive a browser
  restart and the documentation is thin, so the app should re-check on every launch rather than trust a
  past grant — which `useStore` already does, calling `persisted()` on mount.
- **The grant interaction is not ours to design.** Firefox shows a browser-controlled permission prompt
  in a location we do not choose; Chrome decides silently on engagement heuristics; an installed Android
  PWA may simply be persistent without ever asking. Standardising that is out of our hands, which is an
  argument for the warning explaining the situation rather than pretending to drive it.

A warning that can never be cleared is noise rather than information, so the escape hatch matters: where
persistence genuinely cannot be granted, the honest resolution is not a permanent banner but the route to
server-side durability — which is the same funnel D-16 identifies as the paid capability.

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

Three questions that decide the shape of the ladder in §5.1.1 and are not answerable by preference. Two
of them are now settled enough to act on; the middle one is not, and it is the one that matters most.

**D-16. Can cross-device sync be cheap enough to be free?**

> **Deliberately deferred, and the framing was too strict.** "No per-user cost that scales with use" is
> not the requirement — a Redis-like broadcast plus a bucket of encrypted backups scales per user, and the
> per-user quantities are tiny. The real question is what _fraction_ of users sit in the dirt-cheap tier
> versus the tier that is already paying, and that is a business-model question answerable with data
> rather than by argument. Build the free/no-sync and paid/sync versions first, then measure.

**The billing boundary is now identified, and it is a good one:** the paid capability is
**server-intermediated sync** — getting updates without needing another of your devices online at the
same time. Free is direct device-to-device while both are online. Plus whatever is unavoidably charged
by payment processing and the ordinary cost of having a business online, which has to be counted too.

That boundary lines up exactly with everything else in this section, which is the strongest argument for
it:

| Rung | Discovery (D-19) | Transport                     | Durability             | Cost |
| ---- | ---------------- | ----------------------------- | ---------------------- | ---- |
| 1    | none             | none                          | this device only       | free |
| 2    | pairing          | device-to-device, both online | none — the group is it | free |
| 3    | sign-in          | server-intermediated          | server-side copy       | paid |

Note what that makes of the earlier derivation: **rung 2 having no recovery story (D-19) and rung 2 being
free are the same fact.** There is no server-side copy, which is exactly why it costs nothing and exactly
why losing your last device loses the group. Durability is the paid thing, arrived at independently from
the product side and the cost side.

**And the sequencing satisfies the no-free-then-charge constraint** rather than colliding with it: shipping
free-without-sync and paid-with-sync is not starting free and then charging, it is charging from the start
for the part that costs money. That is what makes deferring this question safe.

**One cost risk worth flagging now, because it undermines "bandwidth will not run me out of business."**
Direct device-to-device in a browser means WebRTC, and WebRTC does not always connect directly. Symmetric
NAT and mobile carrier networks are the common failures, and the fallback is TURN — a relay, which is
bandwidth, which is the cost being avoided. Phone-to-phone across two mobile networks is the case most
likely to need it. So the free tier's unit cost depends on a connection-success rate that is measurable
but not yet measured, and it should be measured on real devices on real networks rather than estimated.
Note also that this puts WebRTC back on the table for the _transport_ after §3.4 dismissed it for
cross-tab use — different job, different verdict.

**D-17. What does "reasonably secure" mean, concretely enough to test?** _(Open, and the largest branch
in the document — but with one constraint now recorded and one path narrowed.)_

If the bar cannot be met without real accounts, then accounts are not rung 3, they are the entry
requirement, rung 1 becomes a local-only mode, and the first run changes for every user. So the bar needs
writing down as something checkable — at minimum: what an attacker with the relay URL can do, what they
can do with a leaked credential, and what is true of data at rest if there is a server.

> **Recorded constraint: exactly one functional trust root at a time.** Where a server account exists, the
> device-to-device credentials do not remain independently functional. Deleting the account means
> re-introducing your devices to each other to re-establish the device-centric path.

That constraint does real work immediately: **it kills D-24's "they coexist" option.** If only one trust
root can be live, a paired group cannot run alongside an account, so promotion must either adopt the group
or abandon it — and abandoning it is the data-loss branch. D-24 is down to one safe answer.

**On the discomfort about a web app minting its own secrets: it is well-founded, and there are two ways
out.** The no-account path does require key material to exist client-side, and a browser is a worse
keystore than a phone's. Two mitigations are real:

- **Non-extractable keys.** WebCrypto `CryptoKey` objects created with `extractable: false` and stored in
  IndexedDB cannot be read out by script, even by script that has already achieved XSS. An attacker can
  _use_ the key while they are running; they cannot take it with them. That is a meaningful reduction in
  blast radius, not a cure.
- **Let the platform mint it instead.** The WebAuthn **PRF extension** derives a deterministic 32-byte
  secret bound to a passkey, usable directly as symmetric key material via WebCrypto — so the authenticator
  holds the root and the web app never invents one. Support has arrived: Safari 18+, Chrome 132+, Firefox
  139, with iCloud Keychain on macOS 15 and the earlier iOS cross-device bugs fixed in 18.4. The known gap
  is that Apple does not pass extension data to external roaming authenticators. This is the most promising
  answer to "I do not want to mint secrets in a web app" and it should be evaluated properly.

**And the basics are in scope for this decision, not adjacent to it.** In a design where the client holds
key material, **an XSS is a key compromise**, not merely a stolen session — which is what promotes CSP,
certificate hygiene, defence-in-depth against injection, sandboxing anything user-generated, and cookie
attributes from good practice to load-bearing. The relevant OWASP items should be enumerated as part of
the bar rather than assumed.

**D-18. Are devices enumerable and revocable from a UI?**

> **Decided, in most respects.** **The unit of revocation is the device, not the session.** A session is a
> tab (§6), and revoking a tab is meaningless; the thing an actor with bad intentions uses is a device.
> Invalidation must propagate to every online device quickly, and every device must check whether it has
> been revoked on reconnect, before it syncs. The amount of server state this needs is not what makes
> hosting expensive.

**On offline devices, say the true thing.** A revocation cannot reach a device that is not connected, and
Rule 2 forbids implying otherwise. Dropbox's phrasing is the model worth copying: the session is revoked,
cleanup will be attempted when the device is next seen, and the honest caveat is that the data should be
assumed already copied. That is three sentences, and all three are true.

**On what happens to a revoked device, deliberately unsettled.** The shape is: freeze the interface, blur
it, and offer the user options while cleanup work queues. What is _not_ decided — and should not be assumed
— is that wiping local data is the right response. Someone arriving at a revoked device may be an owner who
lost a phone, an owner who revoked the wrong device, or a person who should not have it, and those want
different affordances. This needs its own thought rather than a default.

**One ordering trap.** "Check for revocation before anything on reconnect" must not become "block startup
on a network call", which would contradict PRD principle 3 and TRD §7.1. The resolution: the check gates
**sync**, not the app. Unknown or offline means full local function; _known_ revoked is what triggers the
freeze. Reading and writing locally never waits on the answer.

Open within this: what the options on a revoked device are and whether cleanup is automatic; whether
propagation needs anything cleverer than "the relay tells whoever is connected, and everyone asks on
reconnect" — gossip is the obvious next step and is probably overkill at this scale; and whether "sign out"
is honestly labelled when the credential behind it cannot be revoked (D-13), which is still unanswered.

The device list this produces is the same artifact D-19's two flows converge on and the same one §1.2 calls
the irreducible security surface. It may be deferrable: pairing could plausibly ship without a device list
before there is stored, paid server sync to protect.

### 5.8 Prior art worth watching

The problem of authentication and authorisation for local-first CRDTs is being actively worked on, and
not in the Yjs ecosystem. **Ink & Switch's Keyhive** is the serious effort: capability-based access
control designed for partition tolerance, with read/write/admin modelled as chains of signed
delegations, group membership derived from those chains, revocation by the delegator, and an
integration into Automerge Repo as an auth provider. The interesting part for this document is that it
is designed so that _the server does not have to be the authority_ — capabilities travel with the
data, which is the only known shape that gives D-14 a "yes" without giving up principle 3.

**And there is a second project that is closer to D-19's pairing flow than Keyhive is.**
`@localfirst/auth` (Herb Caudill; formerly Taco) does decentralised authentication and authorisation from
a chain of signed cryptographic operations, explicitly for apps that do not want to depend on a
centralised authentication server or key-management service. The parts that map directly onto decisions
here: **device-level keys held in each device's own storage**, and **invitations via a Seitan token
exchange**, where an invitee proves they were invited without revealing the invitation secret and any
existing member — not only an admin — can validate the proof. That is the pairing flow of D-19 with the
protocol already worked out, and it is worth reading before designing one.

Three implications, none of which is a decision:

1. **Both are Automerge-adjacent, not Yjs's.** Keyhive integrates with Automerge Repo, and
   `@localfirst/auth` ships an Automerge Repo provider. Nothing equivalent exists behind this app's seam,
   so a real authorisation story is bespoke, server-side (the "yes" branch, with its costs), or a reason
   to re-examine the CRDT choice — and TRD §10.1 already treats a Yjs v14 migration as planned debt, so
   that cost is known rather than unbounded.
2. **The protocols are more portable than the integrations.** Signed delegation chains and token-based
   device invitations are not Automerge-specific ideas; only the plumbing is. Reading them for the design
   is available even if adopting the libraries is not.
3. **Watch rather than wait.** The single-tenant work in this document does not depend on either, and
   D-14's "partly" branch is available regardless.

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

| ID       | Question                                                       | Status                   | Answer, or what happens without one                                                                                                        |
| -------- | -------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **D-1**  | Does the user tell the app who they are, and when?             | **Decided**              | Generated by default; a name when opting into backup or cross-device sync (§5.1.1)                                                         |
| **D-2**  | Is identity per person, per device, or a labelled pair?        | **Decided**              | Per device internally; per person in every list. Device never disclosed or reflected                                                       |
| **D-3**  | Are device names worth improving?                              | **Decided in principle** | Yes. Mechanism open — and it does not need a fingerprint                                                                                   |
| **D-4**  | Can a new device claim an existing actor?                      | **Decided**              | No. A new device is always a new actor; the real question was D-19                                                                         |
| **D-5**  | What happens when sync first meets a non-empty room?           | **Decided**              | By case; both-full stops and asks with a preview. merge · theirs · ours · abort                                                            |
| **D-6**  | Can dead actors be pruned?                                     | **Decided**              | No auto-hiding. Staleness may be muted; the interval is open. Exclusion is D-20                                                            |
| **D-7**  | Should undo ever cross devices?                                | **Decided**              | No. Never leaves the device                                                                                                                |
| **D-8**  | What may a session be seen doing?                              | **Decided**              | A caret per tab, own tabs included, **all yours in your colour**, person's name. Active caret distinguished (D-21). Peer list deduplicated |
| **D-9**  | Does the app ever show a tab count?                            | **Decided**              | Never, save a high-bar exception that must be justified in writing                                                                         |
| **D-10** | Is sync configuration per device or per document?              | **Decided in principle** | Rule 1: the user never manages rooms. Mechanism open; today's three fields are ruled out                                                   |
| **D-11** | What is a room — content, or permission?                       | **Decided in principle** | Permission. One user, one document; a device may host several users; "room" stays off the architecture                                     |
| **D-12** | What happens when local identity is lost?                      | **Decided in principle** | The state is illegitimate. Never-synced may re-mint; ever-synced must not. The roster is the evidence                                      |
| **D-13** | Is there a deliberate reset?                                   | **Decided**              | Yes. Whether it is sign-out, and what it clears, open                                                                                      |
| **D-14** | May the relay decide who connects? What is written?            | Open                     | Multi-tenancy stays cooperative-only and undeclared                                                                                        |
| **D-15** | Within a device, is undo per tab or shared?                    | **Decided**              | Per tab                                                                                                                                    |
| **D-16** | Can cross-device sync be cheap enough to be free?              | **Deferred on purpose**  | Paid boundary is server-intermediated sync. Ship both tiers, measure. TURN is the cost risk                                                |
| **D-17** | What does "reasonably secure" mean, concretely?                | Open — research          | Cannot tell whether accounts are optional or mandatory                                                                                     |
| **D-18** | Are devices enumerable and revocable from a UI?                | **Decided**              | Yes. The unit is the device. Gates sync, not startup. Freeze and offer options; no automatic wipe                                          |
| **D-19** | How does a device find the other devices that are yours?       | **Decided**              | Build both: pairing for rung 2, sign-in for rung 3. Pairing derives the room, sign-in assigns it                                           |
| **D-20** | How is a member actually excluded?                             | Open                     | Not at all — and local refusal does not work (§5.2)                                                                                        |
| **D-21** | What does "the active caret" mean — local, or globally recent? | **Decided**              | Locally active. No recency modelling; a design check that it reads as distinct                                                             |
| **D-22** | Does merged content show its provenance?                       | Open                     | No. Cards could today; document text needs deferred attribution                                                                            |
| **D-23** | Does pairing alone trigger the name prompt?                    | Open                     | A name is asked for at a moment that may have no audience                                                                                  |
| **D-24** | How does a paired group become an account?                     | Open — narrowed          | Coexistence ruled out by D-17; adopt-the-group is the only safe branch                                                                     |
| **D-25** | Does the app warn when durability is not guaranteed?           | **Decided**              | Yes, prominently. Warn about the property, not the context. Offer the grant, else route to sync                                            |

Suggested order for the remainder, on dependency rather than importance. Note how much of it is now one
cluster: nearly everything open is a consequence of not knowing what a credential is.

1. **Confirm or reject two readings this document derived rather than was told.** §5.4's, that a room is
   one document plus its member list and therefore that room, document and account are one thing; and
   §5.3's, that rung 2 buys convenience while rung 3 buys durability, which follows from pairing needing
   both devices present. Both are small confirmations with large blast radii, and everything below
   assumes them.
2. **D-17**, then **D-14** — what "secure enough" means, and what the relay may decide. D-17 first now:
   it is the only remaining question that can collapse the ladder, and D-19 has made that collapse
   expensive, since it would strand the pairing flow that rung 2 is made of. Its two concrete next steps
   are evaluating WebAuthn PRF as the key root and writing the bar down as something checkable.
3. **D-20** — exclusion. Fork or encrypt, and the encryption branch is the one that keeps the relay dumb,
   which makes it the branch most compatible with everything already decided.
4. **D-24** — narrowed to one safe answer by D-17's trust-root constraint, so this is now a thing to not
   get wrong rather than a thing to decide. Worth a written note before the account model is built,
   because the unsafe branch is the one that falls out of an ordinary implementation.
5. **D-22**, **D-23**, D-6's staleness interval, and the open parts of D-18 — the options on a revoked
   device, whether cleanup is automatic, and whether "sign out" is honestly labelled. UI-shaped, and none
   of them block anything.

**Deliberately not on this list:** D-16, deferred until there are two shipped tiers and real unit costs to
look at. That deferral is safe because the sequencing charges for the expensive thing from the start.

**Unblocked now:** the multi-tab work was waiting on D-8, and D-8 is decided in the direction PR #18
already assumed. No change is owed to that branch.

---

## 9. PRD amendments this would require

- **§0 Terminology** — add device, session and room beside actor, since three of the four are already
  in the code and none of them is defined in the document.
- **§11.3** — "One human actor, created on first run" is true per device and false per person
  (§2.2a). Either the sentence changes or the behaviour does; today they disagree silently.
- **§11.3** — "Undo scoped to your own changes" needs a level in it, and now has one: **per tab**, never
  crossing devices (D-7, D-15).
- **§11.3** — "No presence UI" is no longer true as written. D-8 ships carets for every input surface,
  which is presence, deliberately, and the sentence's real intent — no actor management, nothing to
  administer — survives and should be what it says.
- **§12** — the non-goal "No human collaboration. One person, own devices — no sharing, no multi-user
  accounts" is what D-14 asks about. If D-14 is "no", this document narrows to single-tenant identity
  hygiene and the non-goal stands as written. If "yes" or "partly", the non-goal and the document's
  single-tenant framing both have to be rewritten, not footnoted.
- **§14 Open questions** — D-1 through D-22 belong here, or here by reference, once decided.
- **A new section, or this document promoted** — the levels of §1 are product surface, not an
  implementation detail, and they are currently written down nowhere. The account level in particular is
  the one the PRD talks around: "one user" appears throughout without ever being a thing the system has.
- **§2 Design principles** — the two rules in §1.2 are of the same kind as the ranked principles there
  and would sit better beside them than in a companion document.

### 9.1 Nothing is owed to the multi-tab branch

An intermediate draft of this document had D-8 overturning PR #18's caret colour rule. It does not: all
of your carets carry your colour, which is what that branch already specifies, and what changes instead
is that the _active_ caret gets a shared treatment of its own (D-21). PR #18 needs no edit.

## 10. Out of scope for this document

- **How any of it is built.** No storage shapes, no protocols, no migrations beyond noting where one
  would be needed. That is the TRD's, once the decisions exist.
- **The multi-tab implementation**, which is specified separately (PR #18) and which needs D-8 and
  nothing else here.
- **Permissions.** PRD §11.4 already settles that they do not follow from the actor model, and D-14
  is where the subject legitimately reopens.
- **Sharing a single day, a single card, or a link to anything.** Not raised by any scenario above,
  and a different feature.
