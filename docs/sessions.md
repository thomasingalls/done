# done — Sessions and Identity: Product Requirements

**Status:** Draft v11 — **all 27 dispositions recorded**. D-17 is the only unresolved architecture gate,
and it gates the one artifact still missing (the security contract, §8.1). **Not ready to promote into
the PRD** — see §8.2.
**Date:** 2026-08-13
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
mechanism is not), or **Open**. A decided product direction may still depend on an open mechanism or
security gate; §8 distinguishes recorded dispositions from implementation readiness.

### 0.2 The conflict with the PRD, stated up front

PRD §12 says **"No human collaboration. One person, own devices — no sharing, no multi-user
accounts, no comments."** The header of that document says single-tenant, not a product.

This document drives toward **a multi-tenant service**, which contradicts the PRD's single-tenant header
and requires separating an individual service account from its "multi-user accounts" non-goal. It does
**not** reopen human collaboration. Those are different axes: many isolated principals may each have an
account and workspace without any two humans sharing one. Agent membership is in scope later; another
human joining a workspace is not, and gets a separate product document if it is ever considered (§5.4.1, §9).

Two things make the account and membership work worth doing now anyway:

1. **Most of what is below is single-principal product work.** Sessions, devices, reinstall, workspace switching and
   the roster-of-duplicate-Yous are all problems for one person with three devices. They do not need
   a second human to be real, and three of them are shipping today.
2. **The service-authority question is two specific decisions**, not a diffuse direction: may the relay
   decide _who connects_, and may it validate _what is accepted_ (D-14). They have different costs and
   answers. Both arise for one human's devices and for agents before human sharing exists.

---

## 1. The identity levels and the workspace relation

| Concept       | Answers                                                                   | Example                        | Exists today             |
| ------------- | ------------------------------------------------------------------------- | ------------------------------ | ------------------------ |
| **Account**   | your _optional_ relationship with the service                             | billing, contact, recovery     | No                       |
| **Principal** | which human several devices belong to                                     | you                            | **No** — the missing one |
| **Workspace** | which document and authorization boundary                                 | your document                  | As a settings field only |
| **Member**    | a workspace-scoped grant for a principal or agent, including capabilities | you as owner; an editing agent | No                       |
| **Actor**     | the concrete identity attributed with a write                             | you-on-your-phone; an agent    | Yes, and misnamed (§1.3) |
| **Device**    | which install                                                             | your phone                     | Yes                      |
| **Session**   | which tab, this run of it                                                 | the tab you are looking at     | No                       |

Two earlier drafts put the missing level in the wrong place. v1 and v2 put it at the bottom (session);
v3 through v8 put it at the top and called it the **account**. The second was wrong in a way that
contradicted a decision already made.

### 1.1 Principal and membership, and why an account cannot do their jobs

**An account cannot be the thing that groups your devices, because rung 2 groups them without one.**
D-19 builds a pairing flow that needs no account, and D-2 says every list shows one entry per person in
a shared colour — so at rung 2 there is already a person grouping several actors, with no account to
hang the grouping on. An earlier draft asserted the account supplied "anything shown to a human as
you", which contradicted the rung it had already agreed to build.

So the grouping identity and the workspace relationship are their own things, and both precede the
account:

- **Principal** — an unnamed human identity that groups its actors. It exists from local genesis even
  when it groups only one actor; pairing proves that another device belongs to that same principal. No
  account or server is required. This is what "you" means in any list, and what a caret's colour
  identifies.
- **Member** — a workspace-scoped grant connecting a principal or an agent to a workspace. It carries
  capabilities such as read or edit; being a member does not by itself mean being a writer. Membership
  deliberately does not attach to the account, so adding an agent does not require inventing an account
  for it.
- **Account** — _optional_, and about the service rather than the document: billing, an address to be
  contacted at, recovery, service settings, logs, backups. **Account creation binds an existing
  principal to a service account**, which is what makes D-24's "the account adopts the group" precise
  rather than aspirational: there is already a principal there to adopt.

The code half-anticipates this — `ActorKind` is already `human | agent | system`, so kinds of writer
exist. What is missing is both the level above human actors that says several are the same person and
the workspace-scoped grant that says which principals, agents and credentials are authorized.

### 1.2 A word for it: workspace, not room

"Room" is `y-websocket` and `y-webrtc` vocabulary for a channel name that goes in a URL path. It names
a transport concept, it is not what a user owns, and it drags its origins with it — which is the
argument for not letting it become architectural. So the product word is **workspace**.

Why that one: it is understood without teaching (Slack, Notion, Linear, VS Code all use it), it
connotes a container with members rather than a channel, and its usual multi-document, multi-member
sense is useful here — it precludes neither another member nor a principal reaching another document,
so it does not have to be renamed if either arrives. The honest objection is register: "workspace" is
corporate-flavoured, and this app's voice is deliberately not that (PRD §1, §12). If that grates
enough, **vault** is the strongest alternative — it fits the encryption decision in D-20 and reads as
personal rather than professional — at the cost of connoting storage rather than membership. Avoid
**journal**: the codebase already uses that word for the localStorage write-ahead log.

**Scope of the rename.** Product and code use "workspace". The wire may keep "room" if the transport
insists, since that is where the word belongs. This document uses "workspace" for the concept and
keeps "room" only when describing what the code says today — `normalizeRoom`, `RELAY_ROOMS`, the
settings field — because pretending otherwise would misdescribe the thing being changed.

### 1.3 Actor is the wrong word for what the code has

The PRD's "actor" means "anything that can write" — you, the app, later an agent. The code's human
actor is narrower than that and nobody noticed: it is minted per browser profile and never travels, so
what it identifies is **one human member writing through one device.** Two devices, two of them,
permanently (§2.2a).

D-4 decides that this is correct and should stay. Which means the naming problem is real: "actor" is
being asked to carry both "who is writing" and "which install is writing", and those are different
questions with different answers.

**Actor and device are not the same fact, and an earlier draft was wrong to say so.** It claimed that
for humans the two are "one fact stored twice" and the UUIDs could be merged. D-11 forbids it: a device
may host several principals, so a **human actor is the writing identity for one member on one device**,
and one install can carry several human actors. The 1:1 that holds today holds only because there is
exactly one member per install today. **Do not merge `done.actor` and `done.device`** — the apparent
redundancy is the model already being shaped for something the product intends.

That formula is deliberately human-only. An agent actor acts for an agent member and needs its own
credential but may have no device. The system actor is not a member at all: it is a constant
(`SYSTEM_ACTOR_ID = 'system'`) used for app-generated operations, authenticated through an authorized
credential when those operations replicate. D-27 has to cover all three rather than pretending every
signer is a device.

A working name for the human per-install case would still help, since "actor" is taken and "device" is
the install rather than the identity on it. This document uses **actor** throughout and flags where it
means the per-install kind; naming it properly is worth doing before it reaches the UI.

Each level is the right answer to different questions, and picking the wrong level is the whole
category of bug this document is about:

- Attribution ("who wrote this card") is **actor**. Cards already carry `author` (`newCard` sets it).
- "Last synced from ⟨x⟩" is **device**.
- Anything shown to a human as "you" is **principal**.
- A caret is **session**: a caret is a place input is happening, and two tabs are two places (D-8).
- Undo is **session**, per tab (D-7, D-15).
- An exclusive resource — the search index's OPFS lock — is **session**, arbitrated per device.
- Sync configuration is **device** today, and D-10 says the user should never have to think about it.

### 1.4 Two rules that settle future cases

Both came out of the decisions below and both generalise past them, so they are recorded here rather
than buried in the decision that produced them. They rank beneath the PRD's principles and above
anything in this document.

**Rule 1. The user never manages workspaces.** It is not a task to make pleasant; it is a task to remove.
Anything that requires a person to know what a workspace is, name one, or copy one between devices has
failed (D-10, D-11).

**Rule 2. The UI never promises anything about a remote device that cannot be kept.** No auto-hiding a
member as though they were gone, no "removed" that does not remove, no presence claim that outlives
the connection it was inferred from. Where the truth is unknown, show it as unknown — a muted colour
for a device not seen in a while is honest; omitting it is not (D-6).

A corollary of Rule 1, worth stating because it cannot be fully achieved: **security cannot be hidden
as completely as workspace management can.** Signal, WhatsApp and every serious attempt converge on a small
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
profile — one shared laptop, one browser, two principals — and each needs their own local document, their
own actor, and their own credential. So the local database is keyed by something like _(principal,
document)_ rather than by the room alone. This is not a decision to take here; it is the reason D-11
and D-14 cannot be decided independently.

And a distinction that D-11 was written without: **"which content" and "who is allowed" are not
obviously the same axis.** The boundary could be a document, or a membership boundary containing
documents. D-11 takes the second reading and calls the result a **workspace** (§1.2), which raised the
possibility of content becoming a level of its own and then closed it again — a workspace holds exactly
one document, so there is nothing for a content level to distinguish. The collapse stops there: the
**principal and account remain separate**, since a principal groups one human's actors and devices even
without a service, while an account carries billing, contact, recovery and service settings (§5.4).

**c. The relay's token is not per room — and this is a target for change, not a constraint to design
around.** `RelayPolicy` is one shared `token` plus an allowlist of `rooms`. Anyone holding the token
may connect to any allowed room. There is no per-principal or per-device credential and nothing that ties one to
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

| #       | Scenario                                       | Today                                                                                                          | Raises       |
| ------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------ |
| **S16** | Renames the device.                            | Local only. Shows up on other devices as "last synced from ⟨new name⟩".                                        | —            |
| **S17** | Renames the actor, or changes its colour.      | Synced. Every device sees it. Only `kind: 'human'` actors are editable.                                        | D-1          |
| **S18** | Sees two "You" entries and wants one.          | **No mechanism.** Cannot merge actors, cannot delete one, cannot claim one.                                    | **D-4**, D-6 |
| **S19** | Wants to be a different person on this device. | No mechanism in the current UI. The architecture permits several principals per device, but exposes no switch. | D-11, D-13   |
| **S20** | Wants to know which of their devices is which. | Device names are guesses from the user agent (`Android`, `Mac`) until renamed. Two Macs are both `Mac`.        | D-3          |

### 4.4 Rooms

| #       | Scenario                                      | Today                                                                                                  | Raises     |
| ------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| **S21** | Wants a second, separate document ("work").   | Not possible. One local database, one document, regardless of room.                                    | **D-11**   |
| **S22** | Wants to move a document to a different room. | Change the room; the document follows because it never left. Merges with anything there.               | D-11       |
| **S23** | Two tabs briefly hold different sync configs. | Possible mid-edit in settings. Each tab targets its own room; both merge into the same local document. | D-10, D-11 |
| **S24** | Wants to open two rooms at once.              | Not possible.                                                                                          | D-11       |

### 4.5 Service and sharing boundaries (all currently impossible)

| #       | Scenario                             | Today                                                                                                              | Raises                   |
| ------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| **S25** | Two people in one workspace.         | Mechanically works as two actors, but has no human-membership, permission or authenticated-attribution model.      | Future sharing doc; D-27 |
| **S26** | Inviting another human.              | No mechanism. Human sharing remains a separate product decision; handing over today's relay-wide token is not one. | Future sharing doc       |
| **S27** | Someone claiming to be someone else. | Unpreventable today. Any writer can write any actor entry and attribute anything to any id.                        | **D-27**                 |
| **S28** | Removing a device or agent.          | No mechanism today. Future exclusion is key rotation plus authorization enforcement.                               | **D-20**, D-26           |

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

| #       | Scenario                                                                                                                                  | Raises                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **S34** | Pairs a second device, having never had an account.                                                                                       | D-19, D-23            |
| **S35** | Creates an account, having already paired devices.                                                                                        | **D-24** — the risk   |
| **S36** | Deletes the account, keeping the devices.                                                                                                 | D-17, D-24 in reverse |
| **S37** | Revokes a device that is currently offline.                                                                                               | **D-18**              |
| **S38** | Opens a device that has been revoked.                                                                                                     | **D-18**              |
| **S39** | Loses the only device in a paired group.                                                                                                  | D-19, D-12            |
| **S40** | Revokes a device while another of their own devices is offline — and that offline device has meanwhile been syncing with the revoked one. | **D-26**              |

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

> **Decided.** Generated by default. A name is asked for at **account creation** and at no earlier point —
> not at first run, not at first peer, and per D-23 not at pairing either.

That answer generates a structure the rest of the document needs, so it is written out in §5.1.1.

#### 5.1.1 The identity ladder

D-1's answer is not one state but three, with named events that promote between them. Each rung is
reached only by asking for something that needs it, and each is named for what it does rather than for
what it collects.

| Rung           | What the user has                          | Reached by                                                                                        | Costs money? |
| -------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------ |
| **1. Local**   | No name, one device.                       | Opening the app. The default, forever, for anyone who never asks for more.                        | No           |
| **2. Paired**  | Several devices. **Still no name** (D-23). | Pairing a second device (D-19). No account, no server in the sync path.                           | No           |
| **3. Account** | A name, a credential, durability           | Creating an account: paid durability, connecting an AI, **or every user if D-17's bar needs one** | Yes          |

**What actually distinguishes the rungs is durability and necessity — not price.** The rungs and the
business model happen to line up, and it is worth keeping the two apart on purpose, because only one of
them is a technical constraint. The technical statement:

- **Rung 1 and rung 2 differ in how many devices hold a copy, not in what holds it.** Both are
  device-only. A lost device at rung 1 is total loss; at rung 2 it is one replica, unless it was the last
  one — and pairing needs another device present, so a group cannot be rebuilt from nothing (D-19).
- **Rung 3 is where something other than your own devices holds or decides something.** That is the
  boundary, and it is the point at which **an account becomes technically necessary** — a server-held copy
  needs a stable identity to attach to and a credential to retrieve it, and revocation needs somewhere to
  keep state (D-18). Not a pricing statement: a statement about what cannot work without an account.

The same line also happens to be where costs appear, which is why D-16 puts a billing boundary near it and
why D-25 and D-26 both route toward it. **That coincidence is not a law.** Pricing could sit elsewhere —
above rung 3 with server durability offered free at a loss, or on something orthogonal entirely — and
nothing in this document should be read as having decided it. What this section fixes is only when an
account is _required_; what it costs is a separate conversation with a separate answer.

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

| Option                     | The user sees                                                       | Forces                                                                            |
| -------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| No — a device is an actor  | Nothing new. Accept S6, S7, S18.                                    | D-2 must be "per device" or "labelled pair".                                      |
| Pick from the roster       | After first sync: "Which of these are you?" with names and colours. | Trivial to impersonate; incompatible with authenticated attribution.              |
| Transfer a secret          | A code or QR from the old device.                                   | Real friction, and a new thing to lose. Needs the old device present.             |
| Derive from the credential | Nothing — implied by the token used.                                | Collapses actor into principal and contradicts the chosen per-device actor model. |

> **Decided: no. A new device is a new actor, always.** Browser, profile, phone, computer — each
> install that writes gets its own writing identity, and none of them ever claims another's.

The reason this looked complicated is that D-4 was two questions wearing one coat, and only one of
them is about claiming:

1. **"Which of these entries is me?"** — a _presentation_ question, and D-2 already answered it: one
   entry per person in every list, the device never disclosed or reflected back. Nothing needs claiming
   for that; it needs a level above actor to group by, which is §1.1's principal.
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

| Option                         | The user does                                          | Needs                                                           |
| ------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------- |
| Manual configuration (today)   | Types endpoint, room and token on each device.         | Nothing. Violates Rule 1, in today's words.                     |
| Implied by signing in          | Signs in. Their devices belong to the bound principal. | An account, so **D-14** and the ladder's rung 3 (§5.1.1).       |
| Pairing between devices        | Scans a code shown on the other device.                | Both devices present at once; a pairing protocol; no account.   |
| Discovery on the local network | Nothing, on a shared network.                          | mDNS or similar, which a browser cannot do — so a relay anyway. |

> **Decided: build both middle options.** A pairing flow that creates the discovery channel without
> creating an account, and a sign-in flow for when there is one. The ladder does not merely permit both,
> it requires them.

**Why the ladder requires both, spelled out**, because this is what makes its rungs functional rather
than decorative:

| Rung           | Discovery mechanism | What it buys                                   |
| -------------- | ------------------- | ---------------------------------------------- |
| **1. Local**   | none                | one device, local only                         |
| **2. Paired**  | **pairing**         | your devices find each other, with no account  |
| **3. Account** | **sign-in**         | the same, plus everything an account can carry |

Without pairing, rung 2 cannot exist: cross-device sync would require an account, which collapses the
ladder to "local or signed in" — the shape D-17 threatens as a fallback and which should not arrive by
default. Without sign-in, rung 3 has nothing to authenticate. So the two mechanisms are the rungs, and
building one is building half a ladder.

**Both satisfy Rule 1, and it is worth seeing why in the same sentence: pairing _derives_ the workspace
identifier, sign-in _assigns_ it.** Under pairing, whatever the two devices agree on can also produce the channel
identifier, so nobody types a workspace identifier. Under sign-in the account determines it, so again nobody types
one. There is no third thing to configure in either case, which is the strongest evidence so far that the
identifier belongs at the wire level and nowhere near a user (§1.2).

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
from and the one §1.4 calls the irreducible security surface. One screen, three jobs, reached two ways.

**D-23. Does pairing alone trigger the name prompt?**

> **Decided: no. Pairing asks for nothing. Account creation asks for a name.**

D-1's trigger bundled two events that D-19 pulled apart, and this is the separation: pairing two of your own
devices has no audience for a name, since per D-2 every list shows one entry per person and with one person
that entry is you. The audience arrives with the account.

**Which means rung 2 has no name, and the ladder's middle rung was mislabelled** — "Named" is now wrong for
a rung that asks for nothing. §5.1.1 renames it **Paired**, and the ladder reads: local, paired, account.
That is a better ladder anyway, because each rung is now named for what it _does_ rather than for what it
collects, and the first thing the app ever asks for arrives at rung 3 instead of rung 2.

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

**D-22. Should merged content show its provenance?**

> **Decided: yes, as a mode that is off nearly always.** Enabled from a settings menu — appropriately
> buried, since it is niche. While it is on, the **off switch appears in the main interface** so it can be
> dismissed immediately rather than hunted for. Not document history.

Niche but genuinely used; Google Docs' document history is the proof that people reach for this when a merge
gets big. The boundary that keeps it small is worth writing down, because this is the point where the idea
starts wanting to become a feature: **this is a post-merge orientation aid, not a history feature.** It
answers "which of my devices put this here" for as long as that is a live question — the freeze window is
the natural bound, since a frozen day is finished and nothing about it needs rearranging. It does not answer
"what did this look like last Tuesday", and building that is a different project.

Two useful facts about feasibility:

- **For cards this is available now.** `newCard` records `author`, and a human actor is bound to one
  member on one device (§1.3), so "which device created this" is already recoverable from that binding.
  No new card data is needed.
- **For the master list and Goals it is not.** Per-character attribution inside a document is explicitly
  deferred (PRD §14, open question 2) and is the costly thing there. So line-level tinting in Goals needs
  that decision first, and the card version does not have to wait for it.

Which makes this splittable rather than off-topic: the card half is cheap and could ship with D-5, and
the text half is a different question about attribution granularity.

**D-24. How does a paired group become an account?**

> **Decided: the account adopts the group.** The existing principal, device credentials, home-workspace
> membership and document carry over; the account becomes the service binding and new trust root rather
> than minting a replacement identity.

D-19 builds both discovery mechanisms, so a user can arrive at rung 3 having already paired three devices
at rung 2. What happens to the group is the promotion path, and promotion paths are where local-first
products lose data. Three shapes were available, and they were not equally safe:

- **The account adopts the group.** ✅ **Chosen.** The requirement it carries is worth stating because it
  lands on the account model rather than the UI: **the account has to be able to accept an identity that
  predates it.** A design where signing up mints a fresh identity and attaches storage to it cannot do
  this, and that is the design that falls out of an ordinary implementation.
- **The account starts fresh and the group is abandoned.** The one that loses a month of someone's
  history — and the one an implementation drifts into if nobody wrote the sentence above down.
- ~~**They coexist.**~~ Ruled out by D-17's one-functional-trust-root-at-a-time constraint.

The reverse direction still needs the same care: D-17 also says deleting an account means re-introducing
your devices, so **demotion from rung 3 to rung 2 costs you your pairings** (S36).

Note that this is D-5 again, at a different level: two histories meeting, with a decision about which
survives. The four choices there — merge, theirs, ours, abort — are the same four, and so is the
requirement to show what will happen before it happens irreversibly. Whichever way D-24 goes, it should
reuse that flow rather than invent a second one.

**D-6. Can a dead actor be pruned, and by whom?**

> **Decided, per Rule 2.** No auto-hiding — a person, agent or actor never silently disappears from a list because the
> app inferred they were gone. Showing staleness is fine and honest: a device not seen for some interval
> may be muted rather than removed. The interval is an open parameter.

And what deletion could never do is worth keeping in view: cards carry an `author` id, so removing a
roster entry removes the _name_, not the attribution. There is no version of pruning that unwrites
history.

**D-20. How is a member actually excluded?**

> **Decided: content encryption with key rotation.**

A correction first, because the previous draft said "local refusal does not work" and that was too broad.
It is true of exactly one thing — **filtering incoming updates while remaining in the same document** —
which fails for two independent reasons: Yjs client ids are random per document instance, so there is
nothing durable to filter on, and a filtered peer's changes arrive transitively through any peer that did
not filter. But **forking is also client-side refusal, and forking works.** The boundary genuinely can
live on the client; what cannot work is staying in a document and declining to listen. Three mechanisms,
then, not two:

1. **Filter and stay.** Does not work, per above.
2. **Fork.** Copy the state somewhere the excluded member cannot reach and tell the remaining members.
   Works, entirely client-side, no server involvement — which is the point being made in review, and it is
   correct.
3. **Encrypt and rotate.** ✅ **Chosen.** Content is encrypted; on lost read access the key rotates and is
   wrapped only for the remaining reader credentials. The removed member or device retains a key that opens
   history and nothing newer.

**Rotation is fork's effect without fork's copy — and the difference that decides it is not the copy.**
The mechanics differ in the right way: forking changes the document's _identifier_ and duplicates state,
rotation keeps the identifier and changes _readability going forward_. But the deciding argument is
Rule 1. A fork per membership edit is a new document identity per membership edit, which is room churn,
which is the thing the user must never have to think about. Rotation leaves the user with the one visible
home document D-11 says the current interface reveals. That is why this option is consistent with what is already decided and forking is
not — the avoided history copy is a bonus.

It also keeps the relay dumb: **a relay forwarding ciphertext is exactly as dumb as one forwarding
plaintext.** Exclusion stops depending on the server having authority, which is what makes it compatible
with D-14 at "partly" instead of requiring "yes".

**The three UX questions this raises, answered as far as they can be.**

- **The excluded member or device.** It keeps everything up to the rotation. Anything newer arrives as bytes it
  cannot read — so from the user's side the document simply stops updating. **Silence is the wrong answer
  and Rule 2 forbids it**: "no new changes" is a false statement, and an interface implying it is the
  same defect as auto-hiding a member. So an excluded credential has to be _told_, explicitly, which means the
  rotation carries a signal it can still read even though the content is closed to it.
  That is a protocol requirement falling directly out of a rule, and it is easy to miss because the crypto
  works fine without it.
- **Remaining members, between the rotation and receiving the new key.** They are not broken, only stale
  on authorization: still holding the old key, still accepting the excluded credential's writes. This is where
  D-26 comes from, and it is the hard part of the whole design.
- **The excluder, before the new key propagates.** Their new content is unreadable by their own remaining
  members until each of them has the key. So **rotation does not remove the propagation problem, it moves
  it** — from "tell everyone the new room name" to "get the new key to every remaining reader credential" —
  and that new problem has exactly the same reachability constraints as everything else here, including
  needing the other device online at rung 2.

**Three costs to accept knowingly.**

- **Key management becomes the hard problem.** It is the problem Keyhive and `@localfirst/auth` exist to
  solve (§5.8), which is a reason to read them rather than to invent.
- **Server-side anything that reads content becomes impossible**, permanently and by construction. Local
  search (Phase 4, TRD §6.2) is unaffected because it is local. Server-side search, server-side export,
  server-rendered anything: gone. That is probably a feature.
- **Awareness leaks what content no longer does.** Presence carries names, colours and cursor positions,
  and if it stays in the clear the relay learns who is editing what and when while learning nothing about
  the text. Either awareness is encrypted too, or the threat model states plainly that presence metadata
  is visible to the relay. This needs a deliberate answer rather than a default.

Under every mechanism one thing stays true, and Rule 2 requires saying it out loud: **a member who has
already synced keeps their copy forever.** Removal governs the future, never the past.

**D-26. What happens when a revocation is learned late and the document has already diverged?**

> **Decided, and differently per tier — which is what makes it easy rather than hard.**
>
> - **Free:** sanction A's lineage, discard B's divergence, **tell the user exactly what happened and why**,
>   and offer the paid tier as the thing that prevents it.
> - **Paid:** prevented by construction, **from the moment the server has committed the revocation** — see
>   the state machine below, which is the part "by construction" was hiding.
>
> Filtered replay is not built. It is interesting and it is unnecessary.

**The paid guarantee needs a commit point, and the scenario names it: "A revokes C, _then goes offline_."**
If A was offline when it revoked, the server has not heard, and C can still push. So "revoked" cannot mean
"the owner pressed the button". Three states, and only the middle one is the guarantee:

| State                               | What is true                                                             | What the UI may say               |
| ----------------------------------- | ------------------------------------------------------------------------ | --------------------------------- |
| **requested**                       | recorded locally; the server may not know; C can still push              | "Pending — not yet active"        |
| **committed** (server, key rotated) | C cannot push; no new divergence can form from here                      | "Revoked"                         |
| **acknowledged** by every device    | no remaining device is still accepting C; existing divergence is settled | "Revoked, all devices up to date" |

Only **committed** may be presented as revoked, and a request that has not reached the server has to say
that it is pending. This supersedes the acknowledgement display sketched below: acknowledgement is the third
state, not the guarantee.

**And the guarantee has a bypass condition worth stating.** It holds only if paid devices have no direct
peer path that routes around server enforcement. If the paid tier keeps peer-to-peer sync for speed while
relying on the server for revocation, the hole reopens exactly where it was closed — so either enforcement
lives on every path, or the paid tier's sync is server-mediated in fact and not merely by default.

This is the fourth time the free/paid boundary has landed on durability, and at this point that is the
organising principle rather than a coincidence (§5.1.1). The case is only hard if the goal is to engineer
around it; treated as a product boundary it is a sentence in the free tier and an absence in the paid one.

The case, which is not exotic: **A revokes C, then goes offline. B never hears about it and keeps syncing
with C. A comes back.** Now B holds content from a device A has excluded, and merging is not a neutral act
— it reintroduces exactly what the revocation was for.

**First, the principle that has to hold regardless: authorization reconciles before content.** Two devices
settle the current epoch, credentials and capabilities before they exchange a single document update. This is the same shape as TRD §6.1's
load-before-connect rule and deserves the same status. It is necessary and it is not sufficient — it stops
B accepting _new_ C content, and does nothing about what B already merged.

For what B already has, the options:

- **Filtered replay.** Rebuild B's document from its update log, skipping C's updates after the revocation
  point. Two useful facts: the material exists — the app already keeps an append-only log of updates in
  IndexedDB, which is exactly what replay needs. And it has a hard limit: **you cannot remove one
  participant's operations from a CRDT history without also losing whatever was built on top of them.**
  Where contributions are independent it works; where they interleave it orphans B's own edits. In this
  app that split is real and favourable — cards and days are separate structures, so card-level exclusion
  is tractable, while the master list is one text where interleaving is likely.
- **Keep both.** B ends up with two visible documents: the lineage that includes C, and the sanctioned one.
  This violates D-11's deliberately singular current surface even though the architecture can represent both.
  **That product contradiction is the finding**, not a storage limitation: a recovery edge case must not
  silently expose the multi-workspace UI that this document deliberately leaves for later.
- **Sanction A's lineage and discard B's divergence.** ✅ **The free tier's answer.** It does cost B's own
  honest work, so it has to be said out loud rather than done quietly — see below.
- **Prevent it by construction.** ✅ **The paid tier's answer.** If every sync goes through a server that
  enforces revocation, C cannot push after being revoked, so B never accepts post-revocation C content and
  the divergence never forms.

**Which resolves the three-way tension rather than choosing a loser.** The cheapest tier, the strongest
security want, and the one-document rule looked like they could not all hold; they can, because "keep both"
was the only option that broke D-11 and it is now unnecessary. Free accepts a bounded loss and says so;
paid removes the possibility; nobody ends up with two documents.

**What actually gets lost, precisely, because the warning has to be accurate.** The trigger is not the
revoked device merely being connected. Three conditions have to coincide: the revoked device makes an edit
_after_ revocation, that edit reaches another member, and **that member then does work of its own in the
same lineage**. Discarding the divergence discards everything in it, so:

- Revoked device syncs but never writes → nothing to exclude, no loss.
- Revoked device writes, nobody receives it → no loss.
- Revoked device writes, B receives it, B writes nothing → only the revoked device's content goes, which is
  the intended outcome and not a cost at all.
- Revoked device writes, B receives it, **B works on top of it** → B loses its own work too.

So the collateral is proportional to what the _receiving_ device did afterwards, not to what the revoked
device did. The honest one-line version: **the risk is to the data on your other devices, not on the one
you revoked.**

**Two cheap requirements that take the sharpest edge off, neither of which is filtered replay.**

1. **Export before discarding.** `exportEntries` and `downloadExport` already exist (`src/crdt/export.ts`),
   and PRD principle 4 already commits to plain-markdown export. So "discard B" can mean "hand B's user a
   file of what was discarded, then discard it." That turns irreversible loss into a file on disk for
   roughly the cost of one existing call, and it is the same instinct as D-5's "back up first".
2. **Show revocation acknowledgement state separately from revocation state.** Once the server commits the
   new authorization epoch and rotates the key, the device is revoked; acknowledgement means every remaining
   replica has learned that fact. "Revoked — 2 of 3 remaining devices are up to date" is honest and
   actionable without falsely reopening the commit point. Before server commit the UI says "Pending — not
   yet active"; after commit, an unacknowledged device is stale rather than evidence that revocation failed.

**And the structural insight still stands, now as a feature rather than a problem: this divergence is a
peer-to-peer problem.** Server-mediated sync eliminates it, direct device-to-device creates it, so it lands
precisely on the tier whose defining property is that there is no server in the path. It bites hardest where
revocation is most wanted — at rung 2 the authorized peers are your own devices, the motivating case is a lost phone,
and the window is "my laptop and the lost phone were online together while my other device was not." That is
not an unlikely sequence, and being able to name it as the reason to pay is better than being unable to name
it at all.

**D-7. Should undo ever cross devices?**

> **Decided: no. Distributed undo is a bad idea, and undo never leaves the device it happened on.**

This settles the ceiling and leaves the floor to D-15: within one device, undo is currently per tab,
which is what every tabbed editor does and what the Google Docs comparison in D-2 also gives. Nothing
here decides between per-tab and per-device, and the phrase "undo per device" is doing ceiling work
rather than floor work.

What it does settle is the PRD: §11.3's "undo scoped to your own changes" cannot use actor as a synonym
for principal. One principal has several per-device actors, while undo remains per session and never
crosses devices. The sentence needs the level written into it (§9).

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
your carets" only holds within one device until there is a principal to hang a colour on. Which
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

> **Decided in principle, as Rule 1: the user never manages workspaces.** The mechanism is open and depends
> on the principal/account credential model, but the target is that room management stops being a task rather than becoming
> a nicer one.

That rules something specific out, which is what makes it useful rather than aspirational: **the current
settings panel is the thing being ruled out.** Three fields — endpoint, room, token — typed by hand on
every device, is the maximal version of the task Rule 1 deletes. Whatever replaces it, the room name is
not something a person types twice.

It does not rule out a security surface, and §1.4's corollary says why: room management can disappear
entirely, and security cannot. The irreducible minimum that Signal, WhatsApp and every serious system
converges on is a way to verify a peer, a warning when a peer's identity changes, and a list of your own
devices — and since D-18 and D-19 both want that same device list, the honest budget is one screen that
serves all three, not zero screens.

**D-11. What is a workspace (formerly "room")?** The largest decision here, and the one §2.2b shows is already half-made in
a direction nobody chose.

| Option                                                              | The user sees                                                                  | Forces                                                                                                                                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A relay detail, typed once                                          | One document, forever. The room field is plumbing.                             | S21, S22, S24 are permanent non-goals. Simplest, and honest about today.                                                                                                                                        |
| **A document** — a room names one                                   | Switching rooms shows a different document. Nothing merges.                    | The local database becomes room-derived; the existing `done` database happens to match the default room name, which makes the migration lucky rather than hard. Raises whether the actor is per room or global. |
| **A membership boundary** — a workspace is one document plus grants | Switching workspaces changes both the document and its authorization boundary. | Introduces members and signed authorization state. Does not require the relay to read content, and does not require exposing a picker now.                                                                      |
| Several rooms at once                                               | A picker; multiple local documents; possibly several open editors.             | Architecturally permitted; exposing the picker and navigation is separate product work.                                                                                                                         |

Note what is **not** in that table any more. "A share of one document", where switching re-points the
merge, was listed in draft v1 as an option; it is today's behaviour and it is a defect (§2.2b). No
reading of "room" makes converging two unrelated histories the desired outcome, so whichever row wins,
changing a room must not merge.

The two live readings differ in one word: whether a room is **content** or **permission**.

> **Decided in principle: permission.** A workspace is a membership boundary, and it is called a
> **workspace** rather than a room (§1.2). The current interface reveals exactly one home workspace and
> one document to a principal; a device may host several principals; and "room" must not become
> architectural, because the transport it came from is going away. None of those UI constraints limits
> how many workspace memberships the architecture can represent.

Those constraints do more work than they look like they do, and one consequence is worth confirming
before it gets built on.

**A workspace is one document plus the list of who may reach it.** So content does not become a level of
its own — a workspace already implies exactly one document, and there is nothing left for a separate
content level to distinguish.

#### 5.4.1 Architectural capacity versus revealed surface

The phrase "one logged-in user has exactly one document" read like a system invariant, and as an
invariant it is **incoherent with sharing**: if Alice owns a workspace and joins Bob's, Alice reaches two
documents, and mutual sharing produces two workspaces by construction. That contradiction is real, and it
is resolved by separating two things the sentence was conflating.

**Current product surface.** A principal is presented with exactly one home workspace, containing exactly
one document. There is no workspace picker, no creation flow, no workspace management UI. This is
deliberate and it is what Rule 1 is about.

**Architectural model.** A workspace contains exactly one document; a principal or agent may hold
memberships in several workspaces; the client may hold several locally while showing one. The product
reveals only the home workspace rather than making anything else impossible.

The cardinalities, written down so they stop being inferred:

| Relationship               | Today                  | Architecturally          |
| -------------------------- | ---------------------- | ------------------------ |
| account → principal        | none                   | 1 : 1                    |
| principal → home workspace | 1                      | 1                        |
| principal → membership     | 1 (the home one)       | **many**                 |
| agent → membership         | none                   | **many**                 |
| membership → workspace     | exactly 1              | exactly 1                |
| workspace → document       | 1                      | 1                        |
| workspace → membership     | 1 (later: plus agents) | **many**                 |
| device → human actor       | 1                      | **many** (shared device) |
| human actor → membership   | 1                      | 1                        |
| client → workspace shown   | 1                      | 1, while storing several |

**And membership is scoped deliberately, not by omission:**

- **Currently in scope:** the human owner, and later **agent members** with read/edit capabilities that
  are specified separately. Agents are why membership attaches to a principal or agent rather than to an
  account (§1.1) — an agent needs to be a member without being a customer.
- **Not currently planned:** another human joining the workspace.
- **Future human sharing is a separate document.** It exposes multi-workspace navigation, invitations,
  permissions, and the accountless-versus-account membership question, and none of that should be smuggled
  in through a cardinality. It is a distinct product decision, taken deliberately or not at all.

That distinction is the whole resolution: **capacity in the model, restraint in the interface.** Building
the 1:1 as an invariant would make human sharing a rewrite; revealing only the home workspace makes it a
feature.

Also from §2.2b: the local database would be keyed by _(principal, workspace)_ rather than by room, which
is forced by the second and third constraints together — two principals on one browser profile need two local
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

**The distinction that decides the policy is whether an external credential has ever been admitted.**

- **Authorization epoch 0 — local genesis.** No other credential has been admitted and no account trust
  root has been adopted. The actor id has no external audience, so minting a replacement is harmless and
  is just the genesis case (S1) with extra steps.
- **Authorization epoch greater than 0 — admitted.** Pairing, agent admission or account adoption has
  made the workspace a shared artifact whose authorization state means something. A fresh random identity
  that appears and begins writing is precisely the unapproved-writer problem. The app must **not** silently
  mint one; whether it refuses to write, offers re-pairing, or quarantines the workspace remains open.

**The test this document proposed for telling those apart does not work, and is withdrawn.** The claim was
that a surviving human roster entry proves the document predates the missing identity and has been shared.
It does not: `resolveActor` writes a `kind: 'human'` roster entry on **every ordinary first run**, before
any sync exists, so a never-synced document already satisfies the test. Nor does counting entries rescue
it — two storage clears on a purely local document leave two orphaned human entries, which is
indistinguishable from two devices having synced.

The roster is mutable, unauthenticated and written by genesis, so it cannot be evidence of admission to
anything. What the policy needs is a **monotonic, signed authorization epoch**. Epoch 0 means local genesis:
no external credential admitted and no account trust root adopted. The epoch advances whenever the set or
scope of authorized credentials changes — pairing or revoking a device, admitting or removing an agent or
human member, changing a member's capabilities, or adopting an account trust root.

> **Decided in principle.** Epoch 0 may re-mint silently; a workspace at a later authorization epoch must
> not. The two are distinguished by signed authorization state rather than by the roster. What the app _does_ on detecting an
> admitted document with no local identity is still open — see below.

**And that epoch is not a new open question: several decisions require the same signed authorization
state.** Its payload has to bind the workspace's membership grants, device and agent credentials,
capabilities, and content-key generation. The generation is broader than membership because pairing a
second device changes authorization without creating a second member.

| Decision | What it needs from the authorization state                                      |
| -------- | ------------------------------------------------------------------------------- |
| D-12     | **signed, and verifiable without a local secret**                               |
| D-19     | a pairing admission that binds the new device to the existing principal         |
| D-20     | key rotation when a read-capable credential loses access                        |
| D-26     | a definite committed epoch, server-witnessed at rung 3                          |
| D-27     | the credential, capabilities and represented actor authorized for each mutation |

Designing it once is therefore not a deferral of D-12 so much as a consequence of the decisions sharing
one security object. It belongs in the security contract (§8.1) with the rest of the signing model.

**What genuinely remains open in D-12 is a product question, not a mechanism:** on an admitted document with
no local identity, does the app refuse to write, offer to re-pair (D-19), or quarantine the document until
the human chooses? That is a UX decision about a rare and alarming state, and it blocks nothing.

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

### 5.6 The service-authority question — D-14

**D-14. Does the relay stop being a dumb pipe?**

This was originally framed as the decision that S25–S28 all reduce to. D-20 and D-27 expose why that
was too broad: an opaque relay can carry ciphertext plus verifiable authorization metadata, while clients
enforce key access and authenticated attribution. The relay's content authority is therefore one possible
enforcement layer, not the only place enforcement can exist. So:

- **No.** The relay forwards opaque bytes without deciding who connects or validating their envelopes.
  This can still be secure at the document layer if clients verify authorization state, signatures and
  key generations, but today's shared relay token supplies none of that and cannot separate tenants.
- **Yes.** The relay gains plaintext or schema-level authority and becomes able to decide whether the
  meaning of a mutation is allowed. That is a different system from the one TRD §2 describes and would
  sacrifice the strongest consequence of client-side content encryption.
- **Partly — and this is the position §2.3 uncovered.** The relay authenticates connections and can
  validate opaque envelope metadata — workspace, authorization epoch, credential, signature, replay and
  revocation — without reading document content. Clients remain authoritative for semantic capability and
  attribution checks. Rooms become separable by credential; S27 is answered by D-27 and S28 by D-20/D-26.

So D-14 is really two questions — _may the relay decide who connects?_ and _may it decide what is
written?_ — and they have different costs and different answers available.

> **Decided: at least "partly" for server-intermediated sync. "No" is ruled out there.** The version
> where everyone simply trusts every received byte is rejected — including for one person syncing between
> their own devices. Whether the relay goes all the way to schema-level content authority is still open,
> but D-20 and D-27 mean neither exclusion nor attribution depends on that answer.

**On "is there any other option, if revocation is part of the story?" — yes, and it is D-20.** Once content
is encrypted and keys rotate on removal, a revoked device can connect and receive bytes it cannot read. The
exclusion is enforced by the key, not by the door. So relay-level refusal becomes **defence in depth rather
than the mechanism**: still worth having, because it saves bandwidth and closes the write channel, but no
longer the thing exclusion depends on. That is the strongest practical reason D-20's third option matters.

**On where defence against a headstrong agent belongs — key distribution is necessary and not sufficient,
and the earlier draft stopped a step short.** "You cannot prevent a writer who holds the key; you can only
control who holds the key" is true of _confidentiality_ and of _exclusion_. It is not true of
**attribution**, and the difference matters most in exactly the case that motivated the question.

A **read-capable member** can obtain the content key. Nothing about holding it stops an edit-capable member
producing perfectly valid ciphertext that edits another actor's roster entry, or writes a card claiming
someone else's `Card.author`. Signing _authorization operations_ authenticates who is in the workspace;
it says nothing about who authored a given mutation. So an agent member — precisely the writer the concern is about — can
impersonate its owner inside the workspace, and rotation does not touch that.

That gap needs an invariant, and it is a product promise rather than an implementation detail:

> **Every mutation admitted to the shared lineage is authenticated by a credential authorized at the
> referenced authorization epoch. Its attributed actor is derived from that credential, or is an actor
> that epoch explicitly authorizes the credential to represent.**

Which implies signed mutation envelopes or authenticated operations, verified before admission to the
shared lineage, not only key rotation. **D-27** is the product question underneath it.

**And one factual correction that this depends on.** TRD §4.8 currently says "transaction origins are still
recorded in the update stream regardless, so coarse attribution is recoverable if it ever matters." That is
not so. `Y.applyUpdate(doc, update, origin)` takes the origin as an argument supplied by the _receiver_;
it is a local property of the transaction and is not encoded in the update bytes. What the bytes do carry
is the writing document's Yjs **client id**, which is random per `Y.Doc` instance — per tab, per page
load — so it identifies neither a device nor an actor durably. Nothing about attribution can be recovered
from an update stream, and a design that assumed otherwise would be assuming a guarantee that does not
exist (§9).

**And on the Red Queen worry** — that this is complexity insisted upon where it could be opted out of. Worth
recording the counter-argument rather than only the instinct: the opt-out version is not "less security",
it is "any process that can reach the document is you", and that includes a browser extension, a shared
laptop, a stale session on a sold phone, and any agent given access for one purpose. The 1990s assumption
that whoever is at the keyboard is the owner was defensible when the keyboard was the only way in. It is not
the design that costs less; it is the design that has already made a decision.

Everything else in this document can be decided before the remaining half of D-14. D-20 and D-27 set the
client-verifiable guarantees; giving the relay schema-level authority later may duplicate their enforcement
as defence in depth, but does not change what the product promises.

#### 5.6.1 Authenticated attribution — D-27

**D-27. Is attribution authenticated, or advisory?**

> **Decided: authenticated.** The invariant is adopted — **every mutation admitted to the shared lineage
> is authenticated by a credential authorized at the referenced authorization epoch, and its attributed
> actor is derived from that credential or explicitly authorized for it to represent.** Implementation is
> deferred to the security contract (§8.1); what is settled is that the app makes this promise rather than
> presenting a forgeable field as evidence.

Today it is **advisory and undefended**: `Card.author` is a field, any writer can set it to any value, and
`meta[actor:<id>]` is an ordinary map entry any edit-capable member can overwrite. That is fine while the only writer is
you. It stops being fine at the first agent member, because "the agent did this, not me" and "I did this,
not the agent" both become claims the document cannot substantiate.

The indirection is deliberate. A human write is signed by a device credential and attributed to the human
actor bound to that device and membership. An agent write is signed by the agent member's own credential
and attributed to its agent actor; it does not need a device. A system operation is not a workspace member,
but an authorized device, agent or hosting credential may be granted the narrow ability to represent the
system actor. "Actor equals signer" would fail all three cases by collapsing an attributed identity into a key.

| Option                       | The promise                                                       | Cost                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Advisory** (today)         | "written by" is a label, not a fact — and the UI says so          | None, but any agent accountability rests on a value anyone can forge                                     |
| **Authenticated writes**     | every mutation envelope is signed; invalid envelopes are rejected | Signatures verified on receipt, plus the authorization state D-20 needs anyway                           |
| **Authenticated authorship** | the above, _plus_ the actor is derived or authorized              | Requires inspecting what an update touched, or deriving attribution from authenticated envelope metadata |

The third is chosen. PRD §11.3's "cards record their author" then means what it appears to mean, which it
does not today.

#### 5.6.2 Does it fit the latency budget?

It can, for a structural reason rather than because signatures are fast: **the trust boundary is not the
keystroke.** TRD §12 budgets keystroke → paint at under 16 ms p95, and that path is CodeMirror applying a
change into a Yjs transaction in memory. Signing has no business there and could not be put there by
accident even if someone tried — `crypto.subtle.sign` returns a promise, so it cannot run inside a
synchronous input handler at all.

Where authentication belongs is the boundary where bytes leave the device or arrive from another one. Three
consequences worth stating now, because they shape the design rather than following from it:

- **The synchronous journal stays unsigned, and that is correct.** `persistence.ts` writes each update to
  localStorage synchronously so a page kill between transaction and IndexedDB commit cannot lose it (TRD
  §6.1), and it cannot wait for an async signature. It does not need to: the journal never leaves the
  device, and an attacker who can write your IndexedDB can write your JavaScript. **Authentication is a
  property of the transport boundary, not of local storage.**
- **Local replay must not verify.** If every historical update had to be verified on load, the cost would
  land on "Yjs doc load < 500 ms" and "cold start < 2.5 s" and would grow with history. Verify at receipt,
  trust the disk thereafter, and the load path is untouched.
- **Preserve source-authenticated envelopes end to end.** A relay or peer must not combine mutations from
  several credentials into new bytes and sign the result as itself; that would erase the property D-27 is
  meant to establish. A source may batch its own mutations when actor, credential and authorization epoch
  are the same. Forwarded mutations retain their original envelopes. First sync therefore needs either the
  signed envelope history or an authenticated checkpoint whose construction preserves attribution.

So the keystroke budget need not absorb signing, but the latency question is not completely settled until
the security contract chooses envelope and checkpoint granularity. The harder design cost remains the
attribution half: either inspect what an update touched or derive attribution from authenticated envelope
metadata instead of trusting a field in the document.

#### 5.6.3 Undo is an append, and is not exempt

An earlier draft said this gap "does not touch undo", which was too loose. **Undo is input.** `Y.UndoManager`
does not remove history; it appends a new transaction whose ops invert earlier ones. So an undo produces a
mutation, that mutation crosses the boundary, and under D-27 **it is signed like any other write**. There is
no exemption.

The narrower thing that is true, and worth keeping because it is the reason undo is safe: **the undo stack
is assembled from in-memory transaction origins, which never travel.** `trackedOrigins` matches origin
objects by identity, those objects exist only in the page that made them, and — per the TRD §4.8 correction
above — nothing about origin is encoded in an update. So no document content can insert an entry into your
undo stack, no matter what it claims. **Origin is trustworthy precisely because it never leaves**, and that
same property is exactly why it cannot serve as cross-device attribution. One mechanism, two conclusions
that look contradictory until you notice which direction each runs.

One thing this forecloses: because undo appends, **undoing a revoked member's content is not a way to
exclude them.** An inverse op is just another op, and they can write again. Exclusion is D-20; undo is
housekeeping.

### 5.7 The gates — D-16, D-17, D-18

Three questions that decide the shape of the ladder in §5.1.1 and are not answerable by preference. Two
of them are now settled enough to act on; the middle one is not, and it is the one that matters most.

**D-16. Can cross-device sync be cheap enough to be free?**

> **Deliberately deferred, and the framing was too strict.** "No per-user cost that scales with use" is
> not the requirement — a Redis-like broadcast plus a bucket of encrypted backups scales per user, and the
> per-user quantities are tiny. The real question is what _fraction_ of users sit in the dirt-cheap tier
> versus the tier that is already paying, and that is a business-model question answerable with data
> rather than by argument. Build free/direct sync and paid/server-intermediated sync first, then measure.

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

**One cost risk, and the free-infrastructure question answered: STUN is free, TURN is not.**

Direct device-to-device in a browser means WebRTC, and the two helper services it needs have completely
different economics. **STUN** just tells a peer its own public address — one small exchange, no traffic
through it — and free public servers do exist and are widely used, Google's among them. Depending on an
unofficial endpoint with no SLA for a product is its own risk, but the cost is genuinely near zero.
**TURN** is the opposite: it relays the actual traffic, so offering it free means paying for strangers'
bandwidth, and consequently production-grade free TURN essentially does not exist. Development-tier free
services exist; commercial or self-hosted `coturn` is what production means, and either way it is a
bandwidth bill.

How often it is needed is the number the free tier's unit cost depends on. Reported figures cluster around
**10–20% of connections requiring TURN**, with roughly 8–10% attributed specifically to symmetric NAT and
restrictive firewalls, and 85–90% of connections succeeding without it. Those are consumer-mix figures, and
the mix here is unusually hostile: **phone-to-phone across two mobile carriers is the case most likely to
fail**, and it is also the case a task-list-on-your-phone product will hit most. So the honest position is
that the free tier's cost hinges on a success rate that is measurable but not yet measured, and it should be
measured on real devices on real networks before it is priced.

Note also that this puts WebRTC back on the table for the _transport_ after §3.4 dismissed it for cross-tab
use — different job, different verdict.

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
  139, with iCloud Keychain on macOS 15 and the earlier iOS cross-device bugs fixed in 18.4. Apple does not
  pass extension data to external roaming authenticators.

  **Two caveats that are requirements rather than footnotes.** PRF is an **optional** extension, so an
  authenticator may simply not offer it — which means a design resting on it needs a defined path for
  authenticators that do not support it, not a support matrix and a hope. And the derived secret is returned
  **to the client**, which is what makes it usable and also what makes **recovery a first-class problem**:
  if the content key descends from a passkey and the passkey is gone, the encrypted data is gone with it.
  Combined with D-20's encryption, "lost passkey" becomes indistinguishable from "evicted storage" as far as
  the user's data is concerned — which is a durability claim D-25 makes promises about, so the two have to
  be answered together. Escrow, a recovery code, or a second enrolled authenticator: something has to be
  chosen, and choosing nothing chooses data loss.

**And the basics are in scope for this decision, not adjacent to it.** In a design where the client holds
key material, **an XSS is a key compromise**, not merely a stolen session — which is what promotes CSP,
certificate hygiene, defence-in-depth against injection, sandboxing anything user-generated, and cookie
attributes from good practice to load-bearing. The relevant OWASP items should be enumerated as part of
the bar rather than assumed.

#### 5.7.1 The shape the existing art converges on

Written more directively than the rest of this document, at request: the author's stated position is that
their imagination is not authoritative for cryptographic design, which makes a menu of options the wrong
output here. So this is the shape that Keyhive, `@localfirst/auth` and the passkey ecosystem independently
arrive at, with each piece's job named. **It needs review by someone who does this professionally before
any of it is built** — the value below is in knowing what to ask them about, not in being right.

| Piece                                                  | Its job                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| A signing keypair per device, non-extractable          | identifies a device; signs writes and authorization operations   |
| A signing keypair per agent member                     | authenticates an agent without pretending it is a device         |
| Out-of-band pairing with an invitation proof           | admits a device to a principal without a server                  |
| A signed chain of authorization operations             | binds memberships, credentials, capabilities and actors          |
| A symmetric content key, wrapped per reader credential | encrypts the document; rotation on lost read access is D-20      |
| A passkey with the PRF extension, at rung 3            | gives the account a hardware-held root the app never mints       |
| A stateless attenuable bearer token                    | lets the relay decide who connects without keeping session state |

Two notes on that last row, because it is the one that connects to the cost model. Attenuable capability
tokens — fly.io's macaroons are the well-known instance — carry their own caveats and are verified by
signature rather than by lookup, which is exactly the "relay decides who connects with no server state"
shape D-16 wants. The unavoidable catch is the one already recorded in §2.3: statelessness and
revocation-before-expiry are in tension, so short expiry plus refresh is the usual landing place.

**And one thing not to build: forward secrecy.** Signal's ratcheting exists so that compromising a
long-lived key does not decrypt past messages, which matters when the messages exist only in transit. Here
the plaintext sits in IndexedDB on every device by design — that is what local-first means — so ratcheting
would protect the wire while the disk stays open. It is real work spent on the wrong threat. Worth knowing
so it can be ruled out deliberately rather than worried about indefinitely.

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

The device list this produces is the same artifact D-19's two flows converge on and the same one §1.4 calls
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
3. **Watch rather than wait.** The principal/device work in this document does not depend on either, and
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
- **The actor roster syncs; the local actor/device binding does not.** Already TRD §4.8, and correct:
  each install must know which credential and actor it actually controls rather than trusting the roster.
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
the user has no reason to care and no context to answer. Three constraints now define it:

1. **The first run cannot ask who you are** — principle 1 and principle 2 both point this way (D-1).
   Local genesis creates an unnamed principal, home-workspace membership, device and human actor without
   exposing any of those concepts.
2. **Pairing asks for no profile data.** It proves that a second device belongs to the same principal and
   advances authorization state; it does not create another member or account (D-19, D-23).
3. **No text field may silently choose a document lineage.** If two non-empty histories meet, D-5's
   preview and explicit merge · theirs · ours · abort flow runs before either history changes.

### A worked example of the chosen flow

Tom has been using `done` on his laptop for a month. He gets a new phone and wants his list on it.

The phone starts locally with its own provisional genesis. Tom chooses **Pair another device** and scans
the laptop's code. The proof adds the phone's device credential to the laptop's existing principal and
home workspace, advances the signed authorization epoch, and gives the phone the current content key. It
does not ask for a name, account, workspace or room. Because the phone's document is empty, it adopts the
laptop history wholesale; if both were non-empty, the flow would stop for D-5's preview instead.

The phone has a new human actor because attribution remains per member-per-device, but the interface groups
both actors under the same principal: one "You", one colour. "Last synced from phone" may still name the
device, and undo remains local to each tab. If Tom later pays for durability, creating an account binds the
existing principal and adopts this group rather than replacing it (D-24).

If Tom later enables an agent, the agent receives its own workspace membership, capabilities and signing
credential. Its edits are attributed to its agent actor; removing read access rotates the content key. No
second human, sharing UI or second visible document is implied by that architectural capacity.

---

## 8. Decision register

**These are recorded dispositions, not claims that every mechanism is finished.** Several rows marked
Decided carry live UX or parameter questions in their bodies. The column below says what has been settled;
§8.1 isolates the one remaining architecture gate from those non-blocking details.

| ID       | Question                                                       | Status                   | Answer, or what happens without one                                                                                                        |
| -------- | -------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **D-1**  | Does the user tell the app who they are, and when?             | **Decided**              | Generated by default; a name at account creation only, per D-23                                                                            |
| **D-2**  | Is identity per person, per device, or a labelled pair?        | **Decided**              | Per device internally; per person in every list. Device never disclosed or reflected                                                       |
| **D-3**  | Are device names worth improving?                              | **Decided in principle** | Yes. Mechanism open — and it does not need a fingerprint                                                                                   |
| **D-4**  | Can a new device claim an existing actor?                      | **Decided**              | No. A new device is always a new actor; the real question was D-19                                                                         |
| **D-5**  | What happens when sync first meets a non-empty workspace?      | **Decided**              | By case; both-full stops and asks with a preview. merge · theirs · ours · abort                                                            |
| **D-6**  | Can dead actors be pruned?                                     | **Decided**              | No auto-hiding. Staleness may be muted; the interval is open. Exclusion is D-20                                                            |
| **D-7**  | Should undo ever cross devices?                                | **Decided**              | No. Never leaves the device                                                                                                                |
| **D-8**  | What may a session be seen doing?                              | **Decided**              | A caret per tab, own tabs included, **all yours in your colour**, person's name. Active caret distinguished (D-21). Peer list deduplicated |
| **D-9**  | Does the app ever show a tab count?                            | **Decided**              | Never, save a high-bar exception that must be justified in writing                                                                         |
| **D-10** | Is sync configuration per device or per document?              | **Decided in principle** | Rule 1: the user never manages workspaces. Mechanism open; today's three fields are ruled out                                              |
| **D-11** | What is a workspace — content, or permission?                  | **Decided in principle** | Permission. UI reveals one home workspace/document; architecture supports many memberships; "room" stays off the architecture              |
| **D-12** | What happens when local identity is lost?                      | **Decided in principle** | Authorization epoch 0 may re-mint; later epochs must not. Signed state, not roster. Response open                                          |
| **D-13** | Is there a deliberate reset?                                   | **Decided**              | Yes. Whether it is sign-out, and what it clears, open                                                                                      |
| **D-14** | May the relay decide who connects? What is written?            | **Decided in part**      | Server sync authenticates connections/envelopes; schema-level content authority is open and not required by D-20/D-27                      |
| **D-15** | Within a device, is undo per tab or shared?                    | **Decided**              | Per tab                                                                                                                                    |
| **D-16** | Can cross-device sync be cheap enough to be free?              | **Deferred on purpose**  | Paid boundary is server-intermediated sync. Ship both tiers, measure. TURN is the cost risk                                                |
| **D-17** | What does "reasonably secure" mean, concretely?                | Open — research          | Cannot tell whether accounts are optional or mandatory                                                                                     |
| **D-18** | Are devices enumerable and revocable from a UI?                | **Decided**              | Yes. The unit is the device. Gates sync, not startup. Freeze and offer options; no automatic wipe                                          |
| **D-19** | How does a device find the other devices that are yours?       | **Decided**              | Build both: pairing for rung 2, sign-in for rung 3. Both bind devices to one principal and hide the wire identifier                        |
| **D-20** | How is a member actually excluded?                             | **Decided**              | Content encryption with key rotation. Keeps the relay dumb; key management is the cost                                                     |
| **D-21** | What does "the active caret" mean — local, or globally recent? | **Decided**              | Locally active. No recency modelling; a design check that it reads as distinct                                                             |
| **D-22** | Does merged content show its provenance?                       | **Decided**              | Yes, as a rarely-on mode. Settings toggle, off switch surfaced while active. Cards only, freeze-window bound                               |
| **D-23** | Does pairing alone trigger the name prompt?                    | **Decided**              | No at pairing; yes at account creation. Rung 2 has no name                                                                                 |
| **D-24** | How does a paired group become an account?                     | **Decided**              | The account adopts the group. Requires an account model that accepts a prior identity                                                      |
| **D-25** | Does the app warn when durability is not guaranteed?           | **Decided**              | Yes, prominently. Warn about the property, not the context. Offer the grant, else route to sync                                            |
| **D-26** | Revocation learned late, history already diverged?             | **Decided**              | Free: sanction, discard, explain, offer the upgrade. Paid: prevented by construction. No filtered replay                                   |
| **D-27** | Is attribution authenticated, or advisory?                     | **Decided**              | Authenticated by an epoch-authorized credential; actor is derived or explicitly authorized for representation                              |

### 8.1 One artifact remains, and D-17 gates it

An earlier draft said "only D-17 is open", which flattened a real distinction; the draft after it said "four
blocking questions", which fragmented one. With D-27 adopted, the accurate statement is narrower than either:
**the product decisions are made, and what is left is a single artifact that several of them all require.**

**The security contract.** It has to specify:

| Piece                          | Required by                      | Because                                                                          |
| ------------------------------ | -------------------------------- | -------------------------------------------------------------------------------- |
| Device and agent signing keys  | D-27, D-19, D-20                 | mutations and authorization operations need credentials for every writer kind    |
| **Signed authorization epoch** | **D-12, D-19, D-20, D-26, D-27** | binds membership, credentials, capabilities and key generation (§5.5)            |
| Signed mutation envelopes      | D-27                             | the invariant is not true without source-authenticated mutations                 |
| Attribution binding            | D-27                             | actor is derived from the credential or explicitly authorized for representation |
| Revocation commit semantics    | D-26                             | "revoked" must mean committed, not requested                                     |
| Content key wrapping, rotation | D-20                             | exclusion works by who receives the next key                                     |
| Key recovery                   | **D-17, D-25**                   | a lost key root makes data as gone as eviction, which D-25 makes promises about  |

**D-17 gates all of it**, which answers whether everything now hinges on D-17: essentially yes. Every row
above needs a key model, and D-17 is the key model — including the two sub-problems review named, PRF's
optionality and the recovery path. The next steps are unchanged: evaluate WebAuthn PRF as the root with an
explicit unsupported-authenticator path, and get §5.7.1's shape reviewed by someone who does this
professionally.

**The one item outside that cluster** is D-14's second half — whether the relay ever gains authority over
content. Genuinely independent, and much less urgent since D-20 made exclusion work without it.

**Live sub-questions inside recorded dispositions.** Each is a UX or parameter choice and none blocks the
contract: D-12's response on an admitted document with no identity · D-13's destructive semantics · D-18's
revoked-device options and cleanup policy · D-6's staleness interval · D-3's disambiguation mechanism ·
D-20's awareness-leakage question · D-21's design check · D-22 and D-23's interface details. D-16 stays
deferred until two tiers have shipped and unit costs are real.

### 8.2 Not ready to promote, and what would make it ready

This document should not be folded into the PRD or treated as implementation-ready yet, and the reason is
now specific rather than cautious. Of the three artifacts review asked for, two exist and one does not:

1. **The corrected ontology**, which §1 now has — account, principal, workspace, member, actor, device
   and session — with the pre-account principal and workspace-scoped membership as the load-bearing additions.
2. **Explicit cardinalities**, which §5.4.1 now has, separating architectural capacity from revealed
   surface.
3. **A security contract**, which does not exist and is the whole of what is left: signed mutation envelopes
   (D-27), the authorization epoch (D-12, D-19, D-20, D-26, D-27), revocation commit semantics (D-26), content key wrapping
   and rotation (D-20), and key recovery (D-17, D-25). §8.1 tabulates it. Every row needs a key model, so
   D-17 is the gate, and it is where the next round of work belongs.

The ontology and the cardinalities were the two things review said were missing or contradictory, and both
are now written down. What changed in this round is that the remaining work stopped being a list of open
questions and became one design task — which is a better place to stop than the last three drafts were.

What should survive that round unchanged, because it has held up under three rounds of review: invisible
workspace management (Rule 1), reads and writes never awaiting a credential, an account adopting an existing
paired group (D-24), honest durability warnings (D-25), and removal governing future access rather than
pretending to erase copies already made.

---

## 9. PRD amendments this would require

- **§0 Terminology** — add account, principal, workspace, member, device and session beside actor. Seven
  concepts, with membership a relation rather than another synonym for a writer.
- **TRD §4.8 — corrected in this branch.** It claimed transaction origins are recorded in the update stream
  and coarse attribution is therefore recoverable. Origins are supplied by the receiver to `Y.applyUpdate`
  and are never in the bytes; the client id that _is_ in the bytes is random per `Y.Doc` instance. The
  sentence has been replaced rather than left to mislead a future design, since D-27 depends on getting it
  right.
- **§11.3** — "One human actor, created on first run" is true per device and false per person
  (§2.2a). Either the sentence changes or the behaviour does; today they disagree silently.
- **§11.3** — "Undo scoped to your own changes" needs a level in it, and now has one: **per tab**, never
  crossing devices (D-7, D-15).
- **§11.3** — "No presence UI" is no longer true as written. D-8 ships carets for every input surface,
  which is presence, deliberately, and the sentence's real intent — no actor management, nothing to
  administer — survives and should be what it says.
- **§12** — keep "No human collaboration" as the current product boundary, but separate it from service
  multi-tenancy and agent membership. Many isolated principals may hold accounts without sharing a
  workspace; an agent may be a member without implying another human or a multi-user account.
- **§11.4** — agent access should be expressed as workspace membership with explicit read/edit
  capabilities and authenticated attribution, not as an actor that can necessarily write everything.
- **§14 Open questions** — D-1 through D-27 belong here, or here by reference, once ready to promote.
- **A new section, or this document promoted** — the concepts in §1 are product surface, not an
  implementation detail, and they are currently written down nowhere. The principal in particular is
  the thing the PRD talks around: "one user" appears throughout without ever being a thing the system has.
- **§2 Design principles** — the two rules in §1.4 are of the same kind as the ranked principles there
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
- **The detailed capability model.** This document requires workspace-scoped read/edit grants for agents,
  but the roles, delegation rules and management UI belong in the agent feature document.
- **Human collaboration.** The architecture must not make it impossible, but invitations, sharing,
  multi-workspace navigation and human permissions require a separate product document.
- **Sharing a single day, a single card, or a link to anything.** Not raised by any scenario above,
  and a different feature.
