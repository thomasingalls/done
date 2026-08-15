# done — Sessions and Identity: Product Requirements

**Status:** Draft v15 — **34 dispositions recorded.** The largest change since v14: **D-16 is decided,
and the answer removes a rung.** Local remains free and permanent; hosted synchronization requires an
account; this document makes no pricing decision. Peer-to-peer is not built. The **Paired** rung —
cross-device sync without an account — is retired, and with it the second transport, the second
revocation semantics, and one of D-17's open selections. **D-33** (§5.11) records what survives the
service disappearing and which claims that licenses, promoting material that previously lived only in
the durability appendix. **Both appendices have since been folded into this document and removed**; they
remain in git history, and every reference to them below is historical.

**D-5 is also answered rather than built**: where a workspace already has a history, that history is the
list and the joining device's does not survive,
so the merge · theirs · ours · abort adjudication is withdrawn and D-30's motivating case goes with it.
**D-30 is therefore closed with Rule 1 unchanged.** The *rule* is a product decision; the *transition* is
not free, and §5.2.1 records what it costs.

**Four corrections review found in the first v15 draft, recorded rather than quietly fixed**, because
each was an over-claim in the direction of the decision this revision wanted to make: D-16 removed the
accountless authorization path but did not by itself decide who held account authority; §5.7.2 now does —
the service authorizes, while the user holds the content-recovery root and migrates rather than preserving
the old authorization lineage; relay refusal is not content finalization against a hostile relay
(§5.2.3); and a device that has been offline keeps its **last replica**, not a complete copy (D-24, D-29).

**D-17's custody question is now answered, and it was the largest thing still open.** The product is
**non-custodial for content**: the service controls account authorization, while at account creation the
user saves one high-entropy recovery code that seals the **content-recovery root**. Authorization alone
never releases a content key, so the service cannot decrypt a workspace under any proof or any order.
Service escrow is **excluded by construction** and survives only as an opt-in add-on that must be operated
by a separate legal entity, scoped to the content root — which makes compelled disclosure a two-party
problem rather than a policy promise. The device key is a non-extractable `CryptoKey`, PRF-wrapped where
the authenticator supports it, and the assurance bar is independent protocol design review before sync
ships with an implementation audit on a stated trigger. **All five selections are recorded, and D-17 is
closed** (§5.7.2, §5.7.4–§5.7.6, §5.7.8).

**And closing it opened one thing: D-34.** Whether **local user content** is encrypted at rest was
asserted twice in this document as a premise and never actually decided — plaintext is what the app does
today in **two** stores (IndexedDB and the synchronous journal), with Phase 4's search index a planned
third, and the browser's origin sandbox is a boundary between web origins, not an at-rest boundary.
**Its shape is now decided and only its existence is open**: any device lock is opt-in, keyed from a
user-held factor, governs every store holding content, and accepts that forgetting the factor loses the
data — total and final at Local. It also reaches further than it looks, fixing whether account creation is
a whole-document encryption pass (§5.2.1), and it is worth taking before Phase 4 builds the third store
rather than after (§5.7.4).

**The remaining architecture gate is now closed: D-28** selects a service-authoritative envelope
protocol around end-to-end-encrypted Yjs updates (§5.8.1). The exact formats and constructions belong in
the TRD and then in independent protocol review. **D-32 is also closed at the product level:** immutable
data-handling constraints precede the TRD, a living inventory follows the architecture, and an as-built
review gates wider availability (§5.10). **D-33 is now closed at the product level:** an independently
runnable client and service stack is required; public open source is the preferred path and a triggered
source release is an acceptable fallback; the corresponding claims wait for release evidence (§5.11).
**No product-level readiness gate remains. D-31** (pricing) stays deferred and genuinely downstream.
**Ready to promote into the PRD and begin the TRD; not implementation-ready** — see §8.2.
**Date:** 2026-08-15
**Audience:** the author, deciding. Not an implementation plan.
**Amends:** PRD §0, §2, §4, §6, §11, §12 and §14, plus TRD §2, §4.8, §7.2 and §10.6 — the full list, with
what each needs, is §9.

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

It **records decisions as they are made.** It did not start out doing that — v1 through v8 enumerated and
framed without answering — and the shift is why §5 now reads as a register rather than a menu. The product
calls remain the author's; §5 keeps the options and the consequences beside each answer so a recorded decision can be
re-opened on the same evidence it was made on. Where a decision is already narrowed by something the
PRD ranks, §5 says so and names the narrowing rather than skipping the question. Where a "decision"
is not really one because mechanics settle it, it is in §6 so we do not spend a meeting on it.

Each decision carries a status: **Decided**, **Decided in principle** (the answer is settled, the
mechanism is not), **Decided conditionally** (the answer is settled, but it only takes effect if a
deferred decision goes a particular way — D-29 is the only one), **Existence open; shape decided** (the
constraints any *yes* must satisfy are fixed, and only whether to build it remains — D-34 is the only
one), **Open**, **Deferred on purpose**
(answerable later, and nothing is foreclosed by
waiting), or **Re-opened** (answered once, and new evidence has withdrawn the answer). A decided product
direction may still depend on an open mechanism or security gate; §8 distinguishes recorded dispositions
from implementation readiness.

### 0.2 The conflict with the PRD, stated up front

PRD §12 says **"No human collaboration. One person, own devices — no sharing, no multi-user
accounts, no comments."** The header of that document says single-tenant, not a product.

This document drives toward **a multi-tenant service**, which contradicts the PRD's single-tenant header
and requires separating an individual service account from its "multi-user accounts" non-goal. It does
**not** reopen human collaboration. Those are different axes: many isolated principals may each have an
account and workspace without any two humans sharing one. Agent membership is in scope later; another
human joining a workspace is not, and gets a separate product document if it is ever considered (§5.4.1, §9).

Two things make the account and membership work worth doing now anyway:

1. **Most of what is below is single-principal product work.** Sessions, devices, reinstall, workspace adoption and migration, and
   the roster-of-duplicate-Yous are all problems for one person with three devices. They do not need
   a second human to be real, and three of them are shipping today.
2. **The service-authority question is two specific decisions**, not a diffuse direction: may the relay
   decide _who connects_, and may it validate _what is accepted_ (D-14). They have different costs and
   answers. Both arise for one human's devices and for agents before human sharing exists.

---

## 1. The identity levels and the workspace relation

| Concept       | Answers                                                                   | Example                        | Exists today             |
| ------------- | ------------------------------------------------------------------------- | ------------------------------ | ------------------------ |
| **Account**   | your _optional_ relationship with the service                             | contact, account recovery, billing if any | No                       |
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

**An account cannot be the thing that groups your devices, and D-16's answer changed the reason without
changing the conclusion.** Until v15 the argument was that the Paired rung grouped devices without an
account, so the grouping level had to precede the account. That rung is gone (§5.1.1), and the argument
has to be re-derived rather than inherited. It survives, on four grounds that do not depend on a rung:

1. **The account adopts a principal that already exists.** Every account-holder used the app locally
   first, so there is always a prior identity and a prior document for the account to bind to. If sign-up
   minted a fresh identity instead, D-24's data-loss hazard is exactly what happens — and after D-16 that
   promotion is no longer an edge case but the **only** way anyone ever reaches hosted sync.
2. **"You" must be answerable with no network and no service.** PRD principle 3 forbids the read path
   waiting on the *network*, and a list that says "You" cannot consult an account to do it. A person is
   not a service relationship.
3. **Membership attaches to a principal or an agent, not to an account**, so admitting an agent does not
   require inventing an account **for the agent**. The owner still needs one, because only the service
   changes authorization (§5.4.1, §5.7.3); what this ground rules out is a customer record per
   non-human member, not an account for the human.
4. **A lapse is a billing event, not an identity event** (D-29). If the account were the principal, a
   failed card would be an act of forgetting who someone is.

The first ground is the load-bearing one, and note what D-16 did to it: **most principals now never
acquire an account at all**, because local-only is the whole free product. Principal-without-account is
not a transitional rung any more; it is the steady state for everyone who never asks for a hosted
service.

So the grouping identity and the workspace relationship are their own things, and both precede the
account:

- **Principal** — an unnamed human identity that groups its actors. It exists from local genesis even
  when it groups only one actor, and for most users it will only ever group one. No account or server is
  required for it to exist; what an account adds is the ability to bind a *second* device to it (D-19).
  This is what "you" means in any list, and what a caret's colour identifies.
- **Member** — a workspace-scoped grant connecting a principal or an agent to a workspace. It carries
  capabilities such as read or edit; being a member does not by itself mean being a writer. Membership
  deliberately does not attach to the account, so adding an agent does not require inventing an account
  for it.
- **Account** — _optional_, and about the service rather than the document: an address to be contacted
  at, account recovery, service settings, logs, backups, and billing if any. Content recovery is a
  separate user-held power (D-17). **Account creation binds an existing
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

Rule 1 looked for two drafts as though it had an exception, and v15 withdrew it. The exception was
**D-5's merge · theirs · ours · abort flow**, described here as "the most demanding piece of workspace
management in the product" and defended on the grounds that two histories meeting "is not a task that can
be removed, because the outcome is irreversible and the app cannot pick for the user." **That last claim
was false.** The app can pick, because D-24 establishes which history is the workspace, and D-5 now does
pick. The flow is gone and the user adjudicates nothing.

The general lesson is worth keeping, because this document reached for a UI twice before noticing it:
**an apparent exception to Rule 1 is usually a missing rule.** Where the app seems to need the user to
choose between workspace states, the question to ask first is whether anything in the model already
determines the answer. **D-30 closes with Rule 1 unchanged.**

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

**Two of those three have no referent in this product, and the borrowed sentence hid it.** There are no
peers but your own devices — human sharing is out of scope (§5.4.1) and agents are members rather than
peers — and identity changes are the service's to attest, not another human's to compare fingerprints
with. So the irreducible surface here is **one item, not three: the list of your own devices**, carrying
what D-18 revokes from and what §5.7.4 shows as each device's key-storage tier. That is a smaller budget
than the comparison implies, and the comparison should not be used to argue for more screens than the
product has questions for.

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
normal state") intact is one sentence: **nothing on the read or write path may await a _network_
credential**, which is the constraint TRD §7.1 already imposes on sync state. An expired cookie has to
degrade to "sync is offline", never to "the app is locked". The qualifier matters: principle 3 is about
waiting on the network, not about ceremonies as such, so this rule does not by itself forbid a local
device unlock (D-34, §5.7.4).

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
   request the service has to answer. This is the middle position: **the service can gain an authentication
   surface without gaining document-content authority.** It can decide who may open a socket while the
   relay still treats content as opaque. Under D-28 it may also reject an envelope whose authorization,
   signature, replay or finalization evidence is invalid; what it cannot do is reject one because of the
   meaning of its Yjs mutation. D-14 as originally written asked one question; it is really two, and this
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

### 2.4 The installation that exists today

Absent from every earlier draft, and the omission mattered: this document treats every transition
between identity states as a data-loss hazard deserving a decision, while the first such transition the
project will actually perform was not written down.

**What is running.** Vite behind Tailscale on a laptop. Not a deployment — just enough to be in
continuous daily use, which it has been for ten days, and it slid in with remarkably little friction.
Sync is configured by hand on each device with the shared bearer token of §2.2c. There is no principal,
no authorization epoch, and the relay's document is plaintext.

**Which means the ladder has no level for it**, and D-16 did not change that. **Local** is one device with
no sync; **Account** is hosted sync with a credential and an encrypted server copy. The current
installation is several devices syncing through a shared token with none of the machinery either level
assumes — it is, in effect, the thing D-16 declined to ship: multi-device sync with no account. It works
because it has exactly one user, who trusts every device on his own tailnet, and it does not generalise
past that. Everything below that talks about promotion assumes a starting point this installation does
not occupy.

**The plan, recorded so it can be argued with.** Build import; export from the development installation
and import into the first real deployment; treat that as the migration rather than attempting to carry a
live document across. Then a versioning and upgrade story, built preventatively rather than at the first
incompatible change.

**One consequence of that plan is a defect waiting to happen, and it is worth fixing before the
migration rather than after.** The freeze is enforced in `moves.ts` through a `writable()` check on
every app-level create, move and destroy — including the system-origin recovery path, which declines to
rewrite frozen history on purpose. Import does not exist yet, so nothing has decided which side of that
line it lands on. If it lands on the app-level side, **importing a ten-day export silently drops every
day older than three**, which is most of it.

The correct scope is the one §6 now records, and it is a three-way split rather than a two-way one.
**Replication is outside the freeze entirely** — remote updates arrive through `Y.applyUpdate` and never
consult `isFrozen`, so a frozen day merges normally today. **Every app-level write path is inside it**,
for every actor including the system one; the recovery path declines to rewrite frozen history on purpose,
and that is correct rather than an oversight. **Import belongs outside it**, because a migration import is
the app reconciling two histories rather than a person editing the past — and gating it the way an edit is
gated is exactly the ten-day defect above.

**Import is not a novel exception, and the precedent is worth naming, because it is the thing that makes
the placement defensible rather than convenient.** Compaction is already an app-level system operation
that sits outside the freeze by explicit design: `compaction.ts` says *"nothing here may consult the
freeze, and freeze.ts may not consult this"*, TRD §4.5 makes their independence a rule, and
`test/freeze.test.ts` keeps a regression test on it. So the code already distinguishes *authoring the
past*, which the freeze governs, from *maintaining the store*, which it does not. Import is the second
member of that second category, not a hole punched in the first.

Which means import cannot be placed by asking whether it is app-level — it is — and the answer does not
fall out of the replication/app-level split that settles the ordinary cases. It has to be decided on what
import *is*, and decided before the code exists, because the default an ordinary implementation lands on
is the gated one.

---

## 3. The state space

### 3.1 It is not a 2×2×2

A session is always new: opening a tab creates one, and there is no such thing as arriving with an
existing session. Reloading is the only case that even asks the question, and it asks whether a
session id should survive a reload — which is settled in §6.

Levels also constrain each other. A new device implies a new session. An existing device implies a
stored actor id already exists, so "existing device, new actor" only happens if something deliberate
or destructive has occurred.

**This section was written before §1.1 had a principal in it and before D-4 and D-12 were decided, and
it was not re-derived; review caught that.** Two corrections, and they change what the space is:

- **Actor is the wrong top axis.** D-4 decides a new device is _always_ a new actor and never claims an
  existing one, so "existing actor on a new device" is not a state anything can arrive in. What varies
  across devices is the **principal**, and the arrival question is whether this device's new actor
  belongs to one that already exists.
- **The authorization epoch is an arrival-time property, not a later one.** D-12 decides that epoch 0
  may silently re-mint a lost identity and a later epoch must not. That decision is made _on arrival_,
  which means the epoch belongs in the arrival space rather than in the discussion downstream of it.

So the space is **principal × device**, crossed with the **authorization epoch** and with **how you
arrived**.

### 3.2 Arrival: principal × device

|                        | **New device**                                                                                                                                                  | **Existing device**                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New principal**      | **A. Genesis.** First run ever, or a new install with no sync. Today: mints an actor and a device, and the principal is implicit in there being nothing else.   | **B. Reset or handoff.** Storage cleared, or a deliberate "I am someone else". Today: indistinguishable from Genesis, and the document keeps the abandoned actor forever. |
| **Existing principal** | **C. Enrollment.** A second device joining a principal that already exists — which after D-16 always means signing in to an account. A new actor, always (D-4): what is shared is the principal, not the writing identity. | **D. Ordinary launch.** Reads actor and device from localStorage. The only well-served cell.                                                                              |

Cell **C** is the hole, and naming the axis correctly says what kind of hole it is: earlier drafts
called it "rejoin" and read it as a claiming problem, which sent D-4 looking for a way to say "I am
that one." There is no such thing to say. C is a **discovery** problem — how a device learns which
principal it belongs to — which is D-19, and it is why D-4's answer is "no" rather than a limitation.

Cell **B** is the one that leaks, and the epoch is what decides how badly. At epoch 0 it is Genesis with
extra steps and may re-mint silently. At any later epoch a fresh random identity appearing and beginning
to write is the unapproved-writer problem, and the app must not mint one (D-12).

Cell **D** is the one that works, and it is the only one anyone has tested by using the app.

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

**Which of these are epoch 0, and which are not.** D-12's answer turns on this and the table above does
not carry it. S1 and S5 are epoch 0 by construction. S8 and S9 are epoch 0 unless the context has been
enrolled. **S7 is the interesting one and it is either**: a reinstall on a device that was never enrolled in an
account is epoch 0 and may re-mint silently, while a reinstall on an enrolled device is an admitted
workspace with no local identity, which is the state D-12 says must not be papered over. The same split applies to S29 and
S30. Nothing distinguishes them today, which is the point of requiring signed authorization state rather
than inferring admission from the roster (§5.5).

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

### 4.7 Level transitions (none of which exist yet)

Added because the decisions in §5 created them, and **rewritten in v15 because D-16 deleted a level**.
Every row is a movement between **Local** and **Account** (§5.1.1), and every one moves data.

| #       | Scenario                                                                                                       | Raises                    |
| ------- | -------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **S34** | Signs in on a second device to enroll it, having created the account on the first.                             | D-19, D-24                |
| **S35** | Creates an account having already used the app locally **on two devices**, each with its own history.          | **D-24, D-5**             |
| **S36** | Deletes the account, keeping the devices.                                                                      | D-24 in reverse, D-13, D-29 |
| **S37** | Revokes a device that is currently offline.                                                                    | **D-18**                  |
| **S38** | Opens a device that has been revoked.                                                                          | **D-18**                  |
| **S39** | Loses their only device, having never created an account.                                                      | D-25                      |
| **S40** | Revokes a device while another of their own devices is offline.                                                | **D-26**, D-18            |
| **S51** | The account lapses — payment fails or the subscription expires — while every device is online.                 | **D-29**                  |
| **S52** | The account lapses while a device is offline, and that device next opens after the grace period has run out.   | **D-29**, D-18            |
| **S53** | Deliberate downgrade from a paid plan, if D-31 later selects one: keeps the devices, stops paying.             | **D-29**, D-24, S36       |

**Two rows changed character in v15, and in opposite directions.**

**S35 became common, and D-5 made it cheap.** It used to describe someone who had paired devices without
an account and then created one — an uncommon, deliberate act by an engaged user. With no accountless sync, every
multi-device user runs local-only on each device first, so two non-empty histories meeting is now
ordinary rather than exotic. D-5's answer is a rule rather than a flow: the workspace's history is the
list, the joining device is told what it is about to lose and offered the export, and nothing is merged
or adjudicated. What the scenario costs is messaging, not engineering (D-24).

**S40 got much better, and used to be the hardest scenario in the document.** It described a revoked
device continuing to sync with a peer that had not heard about the revocation, producing a divergence
that could only be resolved by discarding somebody's honest work. With one relay-mediated path the
revoked device has no route to the offline device at all: it is refused at the relay from the commit
point, and the offline device simply learns about the revocation when it reconnects. The scenario
survives only as the ordinary question of what a stale device is told (D-18, D-26).

**And two rows were deleted rather than rewritten**, because the states they described no longer exist:
pairing a second device with no account, and demoting from an account to a paired group. The second is
now S36, which lands in **Local** rather than on a rung below.

### 4.8 Security and recovery

These were implicit in D-17 and therefore absent from the state space even though the rest of the document
depends on them. They are separated by **which credential is lost or compromised**, because "a leaked
credential" has no useful meaning until the credential's authority is named.

| #       | Scenario                                                                                                      | Raises               |
| ------- | ------------------------------------------------------------------------------------------------------------- | -------------------- |
| **S41** | An outsider knows the relay endpoint and workspace identifier, but has no credential.                         | **D-17**, D-14       |
| **S42** | The relay or its stored database is read, modified, rolled back or selectively withheld.                      | **D-17**, D-20, D-27 |
| **S43** | A short-lived relay connection token leaks, but no device key does.                                           | **D-17**, D-14       |
| **S44** | A device signing or decryption credential is copied or used by an attacker.                                   | **D-17**, D-18, D-20 |
| **S45** | Malicious code runs in the app's own origin through XSS, a dependency or a bad release.                       | **D-17**             |
| **S46** | An authorized agent or device writes maliciously without exceeding its granted capability.                    | **D-17**, D-20, D-27 |
| **S47** | Every device is lost while a hosted server-side ciphertext copy still exists.                                 | **D-17**, D-25, D-33 |
| **S48** | An attacker uses the account-recovery path rather than attacking the primary credential.                      | **D-17**             |
| **S49** | Two authorized devices concurrently produce different authorization successors.                               | **D-17**, D-26       |
| **S50** | The service is unavailable temporarily, or disappears permanently.                                            | **D-33**, D-17, D-25 |
| **S54** | The user deletes an account while server ciphertext, metadata, logs, backups and offline replicas exist.      | **D-32**, D-20, D-24 |
| **S55** | The user asks what the service holds, exports it, corrects account data or requests deletion.                 | **D-32**             |
| **S56** | Support or an operator needs to diagnose a tenant problem without gaining document access.                    | **D-32**, D-17       |
| **S57** | The service detects abuse, receives a legal request or must suspend an account without destroying local data. | **D-32**, D-29       |
| **S58** | Every device is lost and the user attempts restore from an encrypted archive plus held recovery material.     | **D-33**, D-17       |
| **S59** | The original relay is gone; surviving devices are repointed at a replacement store without altering content.  | **D-33**             |
| **S60** | The workspace migrates to a replacement service under a new authorization lineage, then admits and revokes a device. | **D-33**, D-17, D-18 |

**S49 changed character in v15.** Without a server witness it was a genuine fork — two authorization
lineages, each internally valid, with no rule to say which was real short of the sanctioned-lineage
design D-26 no longer needs. With one relay-mediated path the server serializes successor commits, so
concurrency resolves to *one accepted epoch and one refused attempt that retries*. It is a conflict, not
a partition.

**S58, S59 and S60 are new**, and they exist because D-33 promoted service survivability from an appendix
thought-experiment to a decision. They are the rows that no amount of local persistence answers on its
own, and note that peer-to-peer would not have answered them either (D-16).

---

## 5. The decisions

Options, with what the user sees and what each choice forces, kept beside the answer rather than deleted
by it — so a recorded decision can be re-opened on the evidence it was made on. **The options tables do
not recommend**; the argument for the selection is stated after them, and several later decisions (D-26,
D-28, D-32, D-33) have no options table at all because nothing was ever chosen between. Where a PRD
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
> not at first run, not at first peer, and per D-23 not at device enrollment either.
>
> This answers the *name* only. Account creation asks for one other thing, and it is the heavier of the
> two: a saved, re-entered recovery code (§5.7.6). D-1 governs when the app learns who you are; it does
> not describe the whole of that moment.

That answer generates a structure the rest of the document needs, so it is written out in §5.1.1.

#### 5.1.1 The identity ladder, now two levels

D-1's answer is two states with one named event between them. Each is named for what it does rather
than for what it collects.

| Level       | What the user has                                                           | Reached by                                                                  | Service and price                         |
| ----------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| **Local**   | No name, no service, and this install's copy is the only one                 | Opening the app. The default, permanently, for anyone who asks for no more  | No service; permanently free              |
| **Account** | A name, an account credential, a saved recovery code, hosted sync across devices and an encrypted server copy | Creating an account (D-17, D-19, D-24), which requires confirming the independently held code (§5.7.6) | Hosted service; price is deferred to D-31 |

**The middle rung is retired, and the ordinals with it.** Until v15 there were three rungs, and the
middle one — **Paired**, cross-device sync between your own devices with no account and no relay
carrying content — was the accountless sync rung. D-16 removes it. The numbers went too: "rung 2" and "rung 3" were
only meaningful as positions on a three-step ladder, and leaving them in place would let a reader who
knows the earlier drafts read the wrong thing. This document now says **Local** and **Account**.

The full argument is D-16's. The summary is that Paired failed on three reinforcing grounds: it was the
**most expensive** thing to build rather than the cheapest, its manufactured durability limitation
demanded recurring disclosure, and it may not have **worked** — a phone asleep in a pocket
does not sync peer-to-peer with a laptop, which is the entire device pair the product has.

**What may survive the removal is an enrollment mechanism, not a tier.** D-19's out-of-band
device-to-device proof **remains one available content-delivery path**; it is not an invariant of
enrollment. Signing in proves who you are to the service, while a PRF-capable passkey, a saved recovery
factor, an existing device or the separate escrow add-on can deliver the content key under D-17's selected
custody model (§5.7.5). If the device-to-device ceremony is used — show a code on the
laptop, scan it on the phone — it happens **after the service authorizes the new device**, rather than
establishing a second, device-centric authority of its own. That is the difference
between an enrollment option and a tier, and it is where nearly all of the deleted complexity lived.

**A phrase this document kept getting wrong, retained because the correction still bites.** Earlier
drafts said the middle rung had "no server in the sync path", which was never true: a browser cannot
establish a peer connection without a signalling server, pairing and authorization traffic need a
rendezvous point, and the app itself is served from somewhere. What that rung avoided was **a relay
carrying content bytes**. The imprecise version invited an architecture built to satisfy a constraint
nobody had, and it also let the tier borrow credibility for a property it did not have — see D-16 and
D-33. Say **no relay**, or **no server-held content**, or **no metered bandwidth** — whichever is meant —
and never "no server".

**These are levels of an install, not of a person**, and the table reads as though they were the second
until you notice. A person may hold several Local installs at once — that is exactly Tom's phone and
laptop before he creates an account (§7, S5) — and may sit at Account on one device and Local on another
for as long as the second is unenrolled. "Local" therefore describes *this copy's* relationship to the
service, not a claim that its owner has one device.

**What distinguishes the two levels is service participation, not price.** D-16 deliberately aligns
durability with whether the service holds or decides anything, while D-31 remains free to price that
service later or not at all:

- **Local is where only your own device holds anything.** One device, one replica. Losing it is total
  loss, and D-25 must say so once, plainly, at a moment the user can act on.
- **Account is where something other than your own devices holds or decides something.** That is the
  point at which an account becomes **technically necessary** — a server-held copy needs a stable
  identity to attach to and a credential to retrieve it, and revocation needs somewhere to keep state
  (D-18). It is also the point at which the service starts incurring per-user cost, but what to do about
  that cost is D-31 and is not part of the identity or synchronization decision.

Two constraints survive:

- **Local remains free and permanent.** An account is never required to keep using the complete local
  application on one device.
- **Cheap to host remains a product requirement**, but it no longer decides whether a rung exists. It
  informs D-31, where pricing is deliberately deferred rather than smuggled into this ladder.

And one constraint is **discharged**: earlier drafts warned that if D-17's security bar could not be met
without real accounts, the ladder would collapse to "local-only or signed-in" and called this "the single
largest branch in this document". That branch has now been taken for product reasons before the security
research forced it. D-17 can no longer collapse the ladder, because the ladder is already the shape D-17
threatened to make it — which removes a dependency rather than resolving one (§5.7.7).

#### 5.1.2 Eight properties, not one promise

Promoted from the former durability appendix, because the table above is exactly where this document
kept compressing several different promises into the word **durability**, and D-25, D-16 and D-33 all
route through the distinction.

This is §1.3's argument applied to promises instead of identities: picking the wrong level is the whole
category of bug. "Local-first", "synced" and "backed up" are each three or four of these at once, and a
claim built out of them is not testable.

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

The combinations that catch people out, and each one has bitten a draft of this document:

- A cloud copy improves **durability** without improving **recoverability** — ciphertext whose only
  decryption root is gone is not recovered data (§5.7.5, §5.7.6).
- Plain-Markdown export provides **portability** without preserving CRDT identity or continued
  **synchronization** (D-33, §5.11.2).
- A cached PWA provides **local availability** on a device that already has it, and no way to install on
  a replacement device (D-33).
- Peer-to-peer provided **synchronization** without providing **service independence**, which is the
  specific error D-16 corrects: the retired middle rung looked like an independence mechanism and was
  not one.

**Where the two levels actually land**, said in these terms rather than in one word:

| Property             | Local                            | Account                                                            |
| -------------------- | -------------------------------- | ------------------------------------------------------------------ |
| Local availability   | Yes                              | Yes — never awaits a credential (§6)                               |
| Synchronization      | No                               | Yes, relay-mediated, including devices never awake together        |
| Durability           | One device only                  | Encrypted server copy, retention stated (D-29)                     |
| Recoverability       | Export only                      | Yes — the saved code unwraps the content root (§5.7.6)             |
| Portability          | Markdown export; import is owed  | Same, plus a fidelity archive (D-33)                               |
| Service independence | Existing install: **total**. Reinstall/recovery: needs D-33 | Requires the survival package (D-33)                    |
| Safety               | Nothing admitted, epoch 0        | Service authorization, signed epochs, revocation (D-18, D-20, D-26) |
| Confidentiality      | Local device only                | End-to-end; relay holds ciphertext; presence metadata is open      |

Two rows are worth reading twice. **Recoverability at Account is now decided and it is conditional** — an
encrypted server copy became a recovery promise when D-17 selected a factor (§5.7.6), but the promise is
*you can recover this, with the code you saved*, never *we can recover this for you*. D-25 must carry that
conditional every time it uses the word, because the two readings differ only for the user who has lost
everything, which is the only user who will ever test the sentence.

And **service independence is highest at Local, for an installation that already exists.** That is the
reframing D-16 produces and it is worth having. But the property as defined above includes surviving the
loss of the **app origin**, and a Local user who clears their browser store or replaces their laptop needs
somewhere to install the app from. So the honest split is: *existing installation, total independence;
reinstallation and recovery, dependent on D-33's survival package.* Local removes the runtime dependency,
not every dependency.

**D-2. Is an identity per person, per device, or a labelled pair?**

| Option             | The user sees                                                     | Forces                                                                               |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Per device (today) | One "You" per device; three devices, three colours.               | S18 is by design. Undo is per device, which is at least consistent.                  |
| Per person         | One "You" everywhere, whatever device it came from.               | Needs D-4. Makes cross-device undo a real question (D-7).                            |
| A labelled pair    | "Tom — phone", "Tom — laptop", grouped as one person in any list. | Keeps today's mechanism; changes only presentation. Needs a person-level name (D-1). |

> **Decided. Identity is per device; presentation is per person.** The two are separable, and
> separating them is what makes "per device" safe: **the device is never disclosed to another
> principal, and never appears in the ordinary presentation of who is present or who wrote
> something.** Any list shows one entry per person. Carets are per input surface (D-8), labelled with
> the person's name and never with the device.

This is the arrangement Google Docs has, and it is worth naming why it works rather than only that it
does: the device level exists to answer questions the _system_ has, and the person level exists to
answer questions a _human_ has. Leaking the first into the UI is the whole bug in §2.2a.

**An earlier draft said the device is "never reflected back at you", and this document then contradicted
itself three times.** The claim was too strong: your own devices are shown to you deliberately, in three
places that are each decided elsewhere here. The rule is about disclosure to _another principal_ and
about the ordinary case, not about hiding your own devices from you.

| Surface                     | Shows the device to you   | Decided in      |
| --------------------------- | ------------------------- | --------------- |
| "Last synced from ⟨device⟩" | Yes, in the ordinary case | §1.3, PRD §11.3 |
| Merge provenance mode       | Yes, deliberately, rarely | D-22            |
| The device list             | Yes, and it must          | D-18, §1.4      |

Which also corrects a count: the live reasons to keep the device level are not two but at least four —
telling multiple carets apart, invalidating from a UI (D-18), naming a sync source, and answering "which
of my devices put this here" (D-22).

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
| Implied by signing in          | Signs in. Their devices belong to the bound principal. | An account, so **D-14** and the Account level (§5.1.1).         |
| Pairing between devices        | Scans a code shown on the other device.                | Both devices present at once; a pairing protocol; no account.   |
| Discovery on the local network | Nothing, on a shared network.                          | mDNS or similar, which a browser cannot do — so a relay anyway. |

> **Decided, and simplified by D-16: one discovery flow, with a selected key-delivery path.** Discovery is
> **implied by signing in**. The accountless pairing flow is **not built as a separate mechanism or a
> separate trust root**. Enrollment obtains the content key through the custody path D-17 selects;
> out-of-band approval by an existing device is one available path, not a requirement of every enrollment.

**Why enrollment has two logical jobs, and why this is not the old rung 2 wearing a hat.** Signing in on a
new device proves to the service who you are. That is enough for the service to admit the device
provisionally, hand it the workspace identifier and serve it ciphertext. Under D-20's intended
non-escrow shape it is **not** enough to read anything, because the service does not hold the content key
and cannot mint one (§5.7.5). The second job is therefore obtaining that key through D-17's selected
account-custody path:

| Where the key comes from                    | What the user does                             | Selected in |
| ------------------------------------------- | ---------------------------------------------- | ----------- |
| An existing authorized device delivers it    | Show a code on the laptop, confirm on the phone | §5.7.2's second gate |
| A non-custodial recovery factor unwraps it   | Present a passkey with PRF, or a saved code     | §5.7.5 row 2 |
| The service holds it                         | Nothing — and the product stops being E2E      | §5.7.5 row 3, which reopens D-20 |

**The first row is the old pairing ceremony, and retaining it as a content-delivery option is not a
hedge.** It is the convenient path when two devices are available. What it no longer does is establish
authorization: the service admits the device and signs the epoch, while the ceremony transfers a key
beneath that. Those are independent gates (§5.7.2).

**Rule 1 is satisfied because sign-in _assigns_ the workspace identifier.** The account determines it, so
nobody types one, and there is no third thing to configure. That remains the strongest evidence that the
identifier belongs at the wire level and nowhere near a user (§1.2).

**Three consequences, and the first is what D-16 bought.**

1. **There is one authorization authority instead of two, and one recovery story instead of none.** The retired rung
   had no recovery path at all — lose your only device and the group was gone, because pairing needs
   something to pair against. Every synced user now has an account, so "sign in on the replacement" is
   available for **authorization** through the service's recovery policy. **Content** comes from an
   existing device or D-17's independently held recovery factor; §5.1.2 is explicit that those are
   different properties. Do not let "sign in to recover" imply the second.
2. **The device list is no longer deferrable.** An earlier draft suggested pairing could ship before a
   device list existed, since there was no server-held copy to protect. There is now, from the first
   synced user, so D-18's list arrives with sync rather than after it.
3. **The promotion path is now the _only_ path, and it is where this class of product loses data.**
   Every account-holder has local history on at least one device, and frequently on two. That is
   **D-24**, and D-16 promoted it from an edge case to the main road.

Enrollment ends at the same artifact the old two mechanisms did — a list of your own devices — which is
the list D-18 revokes from and the one §1.4 calls the irreducible security surface. One screen, three
jobs, now reached one way.

**D-23. Does pairing alone trigger the name prompt?**

> **Decided, and largely dissolved by D-16: the app asks for a name exactly once, at account creation.**
> There is no longer an accountless multi-device state for the question to be about. "Exactly once" is
> about the *name*; the same moment also requires the recovery code, which is the larger ask (§5.7.6).

D-1's trigger bundled two events that D-19 pulled apart, and D-16 has now put one of them back together —
**precisely, and only, at the first one**: account creation and the *first* hosted sync coincide, so
"does pairing ask for a name" no longer names a distinct event. Later device enrollments do not coincide
with a new identity question, and ask for no new name: signing in on a fourth device is not a moment the
product needs to learn who the user is again. Enrollment still performs account authentication and the
separate content-key-delivery gate (D-17). What survives is the substance — the name has an audience only
when there is a service relationship to attach it to, and per D-2 every list shows one entry per person,
which with one person is just you.

**The consequence D-16 creates, and it is a real cost worth stating rather than absorbing.** Under the old
ladder the app's first identity question arrived at the third rung, and a user with two devices never had
to answer it. Now that question arrives at the boundary of the accountless product: **the moment you want
your list on a second device, you are asked who you are and asked to create an account.** No commercial
step is implied, because D-31 remains undecided. The account requirement is a sharper edge than the old
ladder had; D-17 adds the separate recovery cost below.

**And D-17 made that edge sharper again, which this paragraph did not originally account for.** The name
is the small half. §5.7.6 makes a high-entropy recovery code mandatory at the same moment — generated,
saved somewhere other than the device in hand, and **confirmed before the account exists**. So the
accurate statement of the boundary is not "you are asked who you are"; it is **you are asked who you are,
and required to take custody of something you must not lose.** §5.7.6's own options table calls that class
of step the largest deliberate security interaction in the product, and it is now unavoidable rather than
a fallback.

That is a genuinely worse first experience than a name prompt, and it is worth being exact about why it
is still the right shape: it is the **whole** of what non-custodial costs, paid once, at the only moment
the user has a reason to care. The alternative is not a lighter version of the same product — it is
§5.7.5's rejected rows, where either the service can decrypt or all-device loss is unrecoverable. There is
no third option that keeps the promise and skips the ceremony.

Three things make it defensible rather than merely accepted. It is **honest** — the questions arrive with
the service that needs them, not before, and D-1's "never ask at first run" survives completely intact for
the entire free product. It is **not a manufactured obstacle** — nothing was made worse to create it,
which is precisely the test the retired rung failed (D-16). And it is **load-bearing rather than
procedural**: unlike a name, the code is the thing that later makes *we cannot recover this for you* a
true sentence instead of an evasion (§5.7.7).

**Two consequences that belong to other decisions and should not be discovered inside them.** D-31 will be
pricing a service whose signup has this gate in it, and the conversion cost of the gate is not the
conversion cost of a name field. And D-25's copy now has to survive a user who has just been handed a code
at the least motivated moment in the relationship — which is the same requirement §5.7.7 states from the
recovery side, arriving here from the onboarding side.

**D-5. What happens when a device with its own history joins a workspace that already has one?**
_(Reframed in v15. It was "what should opting into sync for the first time do when the room already has
a document" — a question about typing a room name, which D-11 removes and D-19 replaces with sign-in.)_

> **Decided. Where the workspace has a history, it is the list and the joining device's does not survive
> the join. Where it has none, the first joiner's history becomes it. The four-way adjudication is
> withdrawn.**
>
> | Joining device | Workspace | Behaviour                                                                              |
> | -------------- | --------- | -------------------------------------------------------------------------------------- |
> | empty          | anything  | Adopt the workspace. Silent, no prompt — this is the good case and stays frictionless.  |
> | full           | empty     | The workspace adopts this device's history. Nothing is lost, so nothing is asked.       |
> | full           | full      | **State what is about to go, write the export, require confirmation, then adopt.**      |
>
> **No choice of winning history, and no merge, preview or side-by-side.** There is a **cancel**, and it
> leaves the device exactly as it was: not joined, nothing exported over, nothing replaced. Export is the
> escape hatch, and it is a **file the user keeps**, readable elsewhere and importable into a fresh
> install — not a way to fold the replaced history back into the workspace it joined (§5.2.2).

**"No abort" was the wrong phrase and is corrected here.** v15's first draft said the flow has no abort,
meaning there is no un-merge to offer after histories have been exchanged. That is true and it is not
what a reader takes from the sentence: a confirmation prompt without a cancel is not a confirmation. The
accurate statement is that **the user cannot choose which history wins, and can always decline to join.**
Declining is cheap precisely because nothing has been exchanged yet — which is a requirement, not a
convenience, and it is the next section.

#### 5.2.1 The transition is not free, and today's code would get it wrong

**This decision is a product decision; the transition it implies is machinery, and an earlier draft of
this section wrongly said otherwise.** "Nothing in the CRDT, the relay or the protocol has to change"
was true of the *rule* and false of *carrying it out*. What follows is the correction.

**The hazard is that today the app would merge before anyone was asked.** `DB_NAME` is the module
constant `'done'` (`src/crdt/persistence.ts`), and the room selects only what the one local document
tries to converge with (§2.2b). So a provider constructed against the workspace would begin exchanging
updates with the local document immediately, and the histories would be merged before the confirmation
dialog could be drawn. **That is the exact defect D-5 exists to remove, arriving through the back door.**

Four requirements follow, and they belong in the TRD rather than here, but they are recorded now because
the decision is not implementable without them:

1. **Preflight before the provider exists.** Whether the workspace and this device are both non-empty
   must be determined *before* any sync provider is constructed. **The joining document must never
   connect to the workspace before replacement is complete.** A connection is the merge.
2. **The old database is preserved, not dropped in place.** The joining device's existing document is
   retained until the switch has succeeded, so a failure leaves the user with their data rather than
   with neither history.
3. **The workspace gets its own database.** This is §2.2b's "`dbName` almost certainly has to become a
   parameter" arriving with a concrete reason and a date: the local database is keyed by the workspace
   (and, later, the principal), so adopting a workspace is opening a different database rather than
   overwriting the only one.
4. **The switch is crash-safe.** Which database is current is a single committed fact, and an interrupted
   switch resolves to exactly one of the two states on next launch. A half-completed adoption that leaves
   identity and document out of step is the state D-12 says must not be manufactured, and §5.5 already
   names carelessly built features as the only cause of it under our control.

**A fifth requirement is missing from that list and from the whole document: when does the content
encryption exist?** Local is plaintext and Account is end-to-end encrypted (§5.1.2), so somewhere in this
transition a workspace acquires a content key, a first generation, and a root wrapped to the user's
recovery code. Nothing anywhere says where. The four requirements above were written after the
Local/Account confidentiality split was already recorded, and are all about which database is current.

**It is not an independent question, though — it is downstream of D-34, and either answer settles it.**
If the local document is encrypted at rest from genesis, encryption never "begins": the key exists from
first run, and account creation only wraps it to a recovery root and starts uploading ciphertext, which is
a key-custody step rather than a data transformation. If the local document stays plaintext, then account
creation *is* the moment encryption begins, and it is a whole-document transformation that has to be
crash-safe on the same terms as requirement 4 — an interrupted encryption pass that leaves half a
workspace unreadable is a worse failure than an interrupted database switch. **So D-34 should be decided
knowing it also decides this**, which its own entry does not currently say (§5.7.4).

**Automatic export is a requirement in the full/full case, not a suggestion.** An earlier draft recorded
it as a cheap upgrade to consider; that was too weak for an irreversible step. `exportEntries` and
`downloadExport` already exist (`src/crdt/export.ts`) and PRD principle 4 already commits to the format,
so the file is written before the switch, unconditionally, and the confirmation names where it went. The
user may then ignore it. What must not happen is someone declining an offer they did not understand and
losing the only copy.

**What "empty" means, since the table turns on it.** Empty is **no user-authored content**: no cards, no
master-list or Goals text, no non-empty day. It is *not* "no document" and *not* "no history" — a fresh
install has a document, a roster entry from `resolveActor` (§2.2d) and possibly days created by opening
the app. Those are app-generated and carry nothing the user would miss. A device that has only ever been
opened is empty; a device with one card is full. Where the test is uncertain, **treat the device as full**
and ask: a needless confirmation costs a click, and a wrong "empty" costs someone their list.

**Why the previous answer was wrong in its premise, not merely expensive.** v14 said two document
histories meeting "is not a task that can be removed, because the outcome is irreversible and the app
cannot pick for the user", and built a git-style preview with merge · theirs · ours · abort to hand the
choice over. The second half of that sentence is false. **The app does have a basis to pick**: account
creation establishes which history is the workspace (D-24), so at every subsequent join there is a
definite answer to "which one is the list", and the joining device is by construction not it.

Once that rule exists the adjudication machinery has nothing left to decide. The preview existed to make
an irreversible merge legible — there is no merge. `merge` and `ours` existed to let the joining device's
history survive or win — that is the case the rule refuses. What survives is `theirs`, which this
decision's own mechanics note already identified as the cheap one: adopt the remote, destructive on that
device and only that device. **The saving is real but it is in the adjudication, not in the transition.**

**What is actually lost, stated exactly, because the messaging is the other half of this decision.**

- Everything written on the joining device before it joined: its days, its cards, its master list.
- Not the attribution or identity — the device keeps its own credential and actor and becomes an
  ordinary member (D-4, D-19).
- Not anything on the workspace side. This is never destructive to the list the user is keeping.

**One sentence prevents most of it, and it belongs in the interface rather than in a support article:
create the account on the device whose list you want to keep.** It is memorable, and D-24 makes it true —
account creation adopts the creating device's history. The interface should say it at the moment it is
actionable, not after.

**It is the memorable mitigation rather than the only one**, and the difference matters for what the
interface has to allow. A second ordering is equally safe: create the account on a device that is
*empty*, then enroll the one that has the history, which the empty workspace adopts (D-5, row 2). Both
work because only a **populated** workspace refuses an incoming history. What has no safe ordering is two
devices that both hold content the user wants — that one loses a history whichever way round it is done,
and it is the case D-5 stops and asks about (D-24).

**Import is the escape hatch, and it is owed anyway** — required by the §2.4 migration and by D-33's
continuity requirement independently of D-5. Its placement against the freeze is one enabling decision
(§2.4, §6). But an earlier draft of this paragraph claimed more for it than it can carry, and the
scope this forces is a product decision rather than a correction.

#### 5.2.2 Import targets an empty workspace — a deliberate limit, not a tidy-up

> **Decided, for now: import creates a workspace's contents; it does not merge into a populated one.**
> That serves §2.4's migration and D-33's restore, which both target a clean install. It does **not**
> let a user fold an export back into the workspace that replaced it.
>
> **The cost is accepted knowingly and belongs to the product, not to the implementation.** A user whose
> history was replaced under D-5 receives a file they can read, and from which they can build a *fresh*
> workspace. They cannot put it back into the list they just joined — not now, and not by trying harder.
> That is a real reduction in what D-5's export is worth, taken because the alternative is a merge this
> document is not ready to specify, and it should be defended as a choice rather than explained as a
> consequence.

**Which means D-5 must stop implying otherwise.** The claim that a determined user "brings the content
across afterwards" described a merge into a live workspace. D-5's copy has to
offer the file as what it is. This is the one place in this document where the escape hatch was doing
more work than the mechanism supports.

**Four gates make merging-into-populated a different project, and only one of them was known.** The
freeze was found (§2.4). The other three come from what `exportEntries` actually produces — a zip of
`master.md` and `days/<date>.md`:

1. **Days collide by construction**, since entries are keyed by date and both sides have that date.
2. **No card identity survives the round trip.** Cards are Markdown list items; nothing distinguishes
   re-importing the same file from importing new content, so import is not idempotent and duplicates on
   every repeat.
3. **`NEXT_CAP` is a second silent-drop gate on the same path.** A day already holding three Next items
   cannot accept a fourth, and PRD principle 5 forbids resolving that by rearranging what is there — so
   imported items would vanish exactly the way §2.4's frozen days would have. The document found one gate
   of this shape and walked past the other.

**Attribution is not a fourth gate, because it is already answered.** `Card.author` is absent from the
export and D-27 requires an authenticated actor, but PRD §11.3 assigns the **system actor** to
"compaction, import, and bulk operations", and §1.3 already permits an authorized credential the narrow
ability to represent it. Imported content is a system write.

**And this is where Markdown-for-everything reaches its limit, which is worth naming rather than
patching around.** Plain Markdown is the right *escape* format — its job is that another program can read
your writing, and PRD principle 4 commits to exactly that. It is the wrong *round-trip* format, because
the identity the app needs to reconcile two histories is precisely what plain text does not carry. That
is not a defect in the export; it is the format doing its own job and not a second one.

**The second format already exists in this document, under a different name.** §5.11.2 requires an
encrypted fidelity archive "containing CRDT state and the material needed to resume", and treats it
purely as a survivability artifact. It is also the format that could carry import history, because CRDT
state is what makes card identity survive. Recording that here means the eventual answer to non-empty
import is a *format* question already on the roadmap rather than a new one — though note the archive as
specified is encrypted to the content root, so a Local-level fidelity export needs its own answer.

**What a non-empty import would look like if it is ever built**, recorded so the shape is not re-derived:

- **The text half is easy and manual.** A second Goals or master list is appended beneath a horizontal
  rule and a label saying where it came from, and the user cleans it up. No per-character merge, no
  adjudication — the same instinct as D-5, applied one level down.
- **The structured half is the unsolved part**: day collision, duplicate suppression without ids, and the
  cap.
- **A mechanical CRDT merge is available and meaningless, which is the argument against it.** Two
  independent documents *can* be merged — `Y.applyUpdate` both into one — and §2.2b already describes
  what that produces and calls it a defect: interleaved text and both sets of cards in arbitrary order.
  So the objection is not that it is impossible. It is that the sophisticated version converges on the
  manual version above, having first destroyed the thing it was meant to preserve.

**What this leaves of S10 and the old room behaviour.** Today's silent, irreversible convergence on a
room change (S10, S14, §2.2b) is still a defect, and D-11 still removes it. What changes is that its
replacement is a rule plus a careful transition, rather than a flow.

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

Which makes this splittable rather than off-topic: the card half is cheap and could ship with sync
itself, and the text half is a different question about attribution granularity.

**D-24. How does existing local history become an account?** _(Renamed. It was "how does a paired group
become an account", and after D-16 there are no paired groups — there is local history, which every
account-holder has.)_

> **Decided: the account adopts what is already there.** The existing principal, device credential,
> home-workspace membership and document carry over; the account becomes the service binding and brings
> the workspace under service authorization rather than minting a replacement identity.

**D-16 promoted this from an edge case to the main road, and that is the most important thing to record
here.** Under the old ladder, a second device usually arrived early, empty, and without an account — so
the common case was an empty device adopting an existing history, which is D-5's easy row. Now **every**
user runs local-only first, and many will run local-only on two devices before creating an account. So the first sync a
person ever performs is frequently **two non-empty histories meeting**, which is D-5's hard row and the
one that stops and asks.

**And D-5 answers what happens then, at the product level rather than the technical one: the joining
device's history does not survive.** The workspace's list is the list; the joining device is told what is
about to go, offered the export, and asked to confirm. There is no merge and no adjudication.

Three things follow. None requires merge or history-adjudication machinery, although adoption itself
requires the transition machinery in §5.2.1:

- **Account creation is the moment that decides which history survives**, because the creating device's
  history becomes the workspace. That makes one sentence load-bearing in the interface: *create the
  account on the device whose list you want to keep.*
- **The order of operations is the whole mitigation, and there are two safe orders rather than one.**
  Account on the device with the history, then enroll the others, and the destructive row never occurs —
  the enrolling devices are empty or their content was never wanted. **Account on an empty device also
  works**, because an empty workspace adopts its first joiner's history (D-5, row 2); the account can be
  created on a device that has nothing and the one real list carried in afterwards. What has no safe
  order is *two* devices that both have content the user wants: one of them loses, whichever way round it
  is done, and that is the case D-5 stops and asks about. The interface should make a safe ordering the
  path of least resistance rather than leaving it to chance.
- **What is owed is messaging, export/import and transition machinery — not adjudication machinery.** The
  loss has to be stated before it happens and the export has to be real. Import is owed for its own
  reasons (§2.4, D-33), but it targets an empty workspace and so does **not** bring the replaced history
  back afterwards (§5.2.2) — which makes the messaging carry more weight, not less. Preflight, separate
  workspace databases and a crash-safe switch are the distinct implementation requirements in §5.2.1.

Three shapes were available for the adoption itself, and they were not equally safe:

- **The account adopts the group.** ✅ **Chosen.** The requirement it carries is worth stating because it
  lands on the account model rather than the UI: **the account has to be able to accept an identity that
  predates it.** A design where signing up mints a fresh identity and attaches storage to it cannot do
  this, and that is the design that falls out of an ordinary implementation.
- **The account starts fresh and the group is abandoned.** The one that loses a month of someone's
  history — and the one an implementation drifts into if nobody wrote the sentence above down.
- ~~**They coexist.**~~ **Deferred by the revealed surface, not foreclosed by the architecture** — and an
  earlier version of this line said "ruled out by D-5's selection", which was both circular and wrong
  about the mechanism. §5.4.1 deliberately keeps the capacity for a principal to hold several workspace
  memberships and for a client to store several while showing one. So two histories *could* be two
  workspaces. What stops it is that the product reveals exactly one home workspace, and exposing a second
  means a picker — which Rule 1 forbids and which §5.4.1 assigns to the future human-sharing document
  rather than smuggling in through a cardinality. **Worth keeping distinct**, because a design that ever
  reveals multiple workspaces makes this option available again on the same day, and it should be
  re-examined then rather than assumed dead.

**Why the creating device's history becomes the workspace, since it reads as stipulation and is not.** At
account creation there is exactly one device and therefore exactly one candidate history. It either
becomes the workspace's or it is thrown away, and throwing it away is the second bullet above — the shape
that loses a month of someone's work. So the rule is not chosen from a field of options; it is the only
non-destructive thing available at that moment.

**And that is what separates this decision from D-5's, which an earlier draft had leaning on each
other.** D-24 sets an **initial condition**: the workspace acquires a history, from the only device that
can supply one. D-5 states a **rule**: a workspace that has a history keeps it, one that has none adopts
its first joiner's. The rule does not derive its justification from the initial condition — it stands on
"one list, and the app must be able to pick without asking". What the initial condition supplies is the
factual guarantee that by the time any second device arrives there *is* a definite answer to which history
is the workspace's. Condition and rule, not premise and conclusion.

**The reverse direction is cleaner than it used to be, and worth stating because it is now a supported
end state rather than a fall.** Deleting the account retires the service authorization lineage, so each
device becomes an independent **Local** install and they stop converging (S36). Nothing is locked; what
ends is synchronization. That is the free product, arrived at from above, and it is the same place a
lapsed subscription would eventually land if D-31 later selects one (D-29).

**The principal survives, and this document never said so although its own argument requires it.** §1.1's
first ground is that the account *adopts* an identity that already exists; an identity that predates the
account is not retired by ending it. §1.1's fourth ground says a lapse is a billing event rather than an
identity event, and deletion is the same kind of event for the same reason — a service relationship
ending is not the app forgetting who someone is. So each device keeps its principal, its actors stay
grouped under it, and cards written on the phone still read as **You** on the laptop.

**Which is the right outcome and not merely the tidy one.** The alternative — minting a fresh principal
per device at deletion — would orphan every actor entry already in the document and reproduce §2.2a's
roster of duplicate Yous, the defect this entire document exists to remove, arriving through a feature
instead of a gap. Retaining it is also honest under Rule 2, because the principal is a claim about *who
wrote what*, which stays true, rather than a claim that the devices are still one list, which does not.
That second thing is what D-24 requires be said out loud, and the two are separable: **the same person,
no longer the same list.**

**But "each device keeps a complete copy" is false, and a v15 draft said it.** A device holds **its last
local replica** — whatever it had synced when it last connected. A device that has been offline for a
month, or that was enrolled and then left in a drawer, is missing everything since. Once the authorization lineage and the
server-held copy are retired, there is nowhere left for it to get the remainder: the relay is gone, the
other devices will not sync with it, and its gap is permanent. Rule 2 forbids describing that as a
complete copy.

Two requirements follow, and they are the price of account deletion being safe rather than merely
available:

- **Destructive deletion requires either a verified-current device or a fresh export.** Before the service
  authorization lineage and hosted copy are retired, the app must be able to point at one replica it knows is up to date — or write the export
  from one. Deleting an account while every reachable device is stale is a silent data loss with no
  survivor, and it is the one shape of this that cannot be undone.
- **A catch-up window before retirement is probably necessary**, not merely nice. Sync should continue
  long enough for enrolled devices to converge before the service copy goes, and devices that never appear should
  be named in the confirmation rather than quietly abandoned — the same honesty D-18 requires about
  offline devices, applied to the moment it matters most.

The one thing that must not be quiet about it is the divergence: from the moment sync stops, edits on the
laptop and edits on the phone are two histories, and if the user ever pays again they meet through D-5.
Rule 2 forbids implying otherwise.

Note that this and D-5 are one question asked at two moments, and v15 gave them one answer. D-24 decides
**which history becomes the workspace** — the creating device's. D-5 decides **what happens to every other
history that later meets it** — it is stated, exported and replaced. Neither needs an **adjudication**
flow, because between them there is always a determinate answer to "which one is the list". D-5 still
requires confirmation, automatic export and the crash-safe transition in §5.2.1; what disappears is only
the choice over which history wins. An earlier draft proposed that D-24 reuse D-5's four-way adjudication;
there is no longer one to reuse, and that is the saving.

**D-6. Can a dead actor be pruned, and by whom?**

> **Decided, per Rule 2.** No auto-hiding — a person, agent or actor never silently disappears from a list because the
> app inferred they were gone. Showing staleness is fine and honest: a device not seen for some interval
> may be muted rather than removed. The interval is an open parameter.

**Which surface this governs, since D-2 rules out the obvious reading.** Staleness is a per-device fact,
and D-2's person-level lists have no device in them — five devices of which three are stale are still
exactly one "You", and there is nowhere in that entry to put a muted state. So D-6 governs **the device
list (D-18) and the authorization roster**, which are the surfaces that have devices on them. The
person-level surfaces have no staleness state because they have nothing to hang it on.

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

It also keeps the relay **content-blind**: forwarding ciphertext and validating its opaque envelope does
not require parsing Yjs or learning plaintext. Cryptographic read exclusion therefore does not depend on
schema-level service authority. D-28 still assigns account authorization and accepted-write finalization
to the service and opaque validation to the relay; that is D-14's selected "partly" boundary, not the old
"dumb pipe" model.

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
  it** — from "tell everyone the new room name" to "get the new key to every remaining reader credential".
  After D-16 that problem is much smaller than it was: every remaining credential is reachable through the
  relay, which holds the wrapped key until the device next connects. It is a store-and-forward problem
  rather than a both-devices-awake problem.

**Three costs to accept knowingly.**

- **Key management becomes the hard problem.** It is the problem Keyhive and `@localfirst/auth` exist to
  solve (§5.8), which is a reason to read them rather than to invent.
- **Server-side anything that reads content becomes impossible**, permanently and by construction. Local
  search (Phase 4, TRD §6.2) is unaffected because it is local. Server-side search, server-side export,
  server-rendered anything: gone. That is probably a feature.
- **Awareness leaks what content no longer does.** Presence carries names, colours and cursor positions,
  and if it stays in the clear the relay learns who is editing what and when while learning nothing about
  the text. Either awareness is encrypted too, or the threat model states plainly that presence metadata
  is visible to the relay. This needs a deliberate answer rather than a default, and it now has its own
  row in the security contract (§8.1) so that it stops being a note inside a decision about something
  else.

**And one honest note about which direction this cuts, because it is the opposite of the others.**
§5.7.2 establishes that under one symmetric content key **edit implies read**. Agents are the reason
membership attaches to a principal or agent rather than to an account (§1.1). So granting an agent edit
hands the plaintext of the entire workspace — every day, the whole master list, all of it — to that
agent and to whatever service executes it. The relay is blinded by construction and the model provider
is not, which is a strange place for a document this concerned with confidentiality to arrive at without
saying so. It does not change any decision here: the agent feature is a future maybe, unspecified, and
belongs to its own document (§10). But the interface that grants agent membership has to present it as
what it is — disclosure of the whole workspace — and that requirement is recorded here so the agent
document inherits it rather than rediscovering it.

Under every mechanism one thing stays true, and Rule 2 requires saying it out loud: **a member who has
already synced keeps their copy forever.** Removal governs the future, never the past.

**D-26. What happens when a revocation is learned late and the document has already diverged?**

> **Decided, and D-16 collapsed this from the hardest decision in the document to one of the easiest:
> the divergence is prevented from the moment the revocation is committed.** Here **committed** means one
> atomic security boundary: the server has accepted the authorization successor, rotated the content key
> and published an authenticated finalization boundary for the removed credential's accepted writes.
> Every sync is relay-mediated, so a revoked credential has no honest path to any other device, and the
> two-lineage divergence this decision was named for cannot form.
>
> Nothing is discarded, no lineage is sanctioned over another, and filtered replay is not built.
>
> **Relay refusal alone is not this commit boundary.** The authenticated finalization component is what
> makes the guarantee hold against a hostile relay — see §5.2.3 below. "Prevented by construction" was too
> strong on its own.

#### 5.2.3 Refusal at the relay is not the same as finalization

**A v15 draft said the guarantee was unconditional, and it is not.** The threat model already contains a
**malicious or compromised relay** (S42, §5.7.1), and relay-side refusal is exactly the control such a
relay declines to apply. The attack does not require forging anything:

1. Credential C, or an attacker holding it, signs an update referencing epoch *n*, which the credential
   legitimately holds keys for.
2. The hostile relay **withholds it from the accepted set** rather than refusing it, and delivers it to
   another device after C's revocation has committed at epoch *n+1*.
3. The receiving client sees a validly signed envelope under a past epoch — and **must accept genuine
   late-arriving old-epoch updates**, because a device that was offline across a rotation produces
   exactly that shape. Local-first sync is asynchronous by design; "old epoch" is not evidence of
   anything.

**So the epoch field cannot distinguish "accepted before revocation" from "withheld until afterwards",
and nothing else in the current design does either.** Signature verification passes, epoch verification
passes, and the update lands.

**What closes it is authenticated acceptance evidence plus a content finalization boundary**, and the
security contract has to specify both. Three shapes are available, all cheaper than the partition-tolerant
machinery D-16 deleted because there is one authorization service to commit the answer:

| Mechanism                                      | How it closes the hole                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Per-envelope acceptance receipts**           | The authorization service signs each accepted envelope digest and sequence; clients admit only receipted envelopes, so the relay cannot turn a merely valid signature into an accepted write |
| **An append-only accepted log with inclusion proofs** | The authorization service commits a gap-free, non-equivocating per-credential log; each delivered envelope carries proof under an authenticated log head, and revocation finalizes C's last accepted head |
| **A checkpoint plus an authenticated suffix**  | A checkpoint attests the accepted prefix; every later envelope still carries a receipt or inclusion proof until the next checkpoint and the revocation cutoff |

The middle one is the closest fit to the structures already required, but **a numeric high-water mark by
itself is not a finalization boundary.** A compromised credential can sign two different envelopes at the
same sequence or fill a gap the authorization service never accepted; a hostile relay could then choose
which valid envelope at or below *k* to show a client. The accepted stream therefore has to be non-equivocating from a
client's point of view — for example, a gap-free per-credential hash chain whose final sequence and head
digest are committed together, with inclusion proofs for the delivered envelopes. The revocation is
already a committed authorization event, so adding that authenticated head makes the cutoff part of the
same signed object every client must fetch anyway. It also composes with D-33's checkpoint manifest, which
already binds an authorization head to a covered update range (§5.11.3).

**The acceptance proof is needed before revocation too.** A cutoff learned at epoch *n+1* cannot prevent a
stale client that still knows only epoch *n* from applying an unaccepted envelope while a hostile relay
withholds the successor. Requiring a receipt or inclusion proof on every applied envelope closes that
timing hole: the relay may hide the new authorization head, but it cannot supply acceptance evidence for
the withheld write. The client refuses the write without needing to know yet that C was revoked. If the
relay withholds the proof as well, synchronization stops; that is the availability failure §5.7.1 permits.

**Two things this does not do.** It does not reopen D-16 — the hole exists on any relay-mediated design
and is far smaller than the sanctioned-lineage rule, precisely because the authorization service attests
acceptance and issues the cutoff. And it does not make the relay trusted: the acceptance evidence and
cutoff are authenticated under authority the relay does not possess and are verified by clients, so a
hostile relay can still delay or withhold, which is availability rather than integrity (§5.7.1).

**The honest phrasing, which replaces "prevented by construction".** Against a relay that behaves,
divergence cannot form. Against one that does not, divergence is prevented by the finalization boundary —
**which is a security-contract requirement that is specified but not yet designed**, and is now a row in
§8.1 and a test in §5.7.8.

**What this decision used to be, recorded because the deletion is the point.** Until v15 there were two
answers, one per path. The accountless path had no server in the content path, so a revoked device could keep
syncing with a peer that had not yet heard about the revocation, and the answer was to **sanction the
revoker's lineage and discard the divergence** — which cost the receiving device its own honest work,
required an export-before-discard consolation, and needed a sanctioned-lineage rule in the protocol to
decide which of two authorization successors was real (S49). That rule was the single largest piece of
bespoke cryptographic design in the plan, and it existed **only** to serve the accountless path D-16 has now removed.
It is gone with it.

That is worth stating plainly for the cost accounting: **the accountless path's real cost was never TURN
bandwidth, it was partition-tolerant authorization.** D-16 counted the transport and undercounted this.

**The guarantee still needs a commit point, and the scenario names it: "A revokes C, _then goes
offline_."** If A was offline when it revoked, the server has not heard, and C can still push. So
"revoked" cannot mean "the owner pressed the button". Three states, and only the middle one is the
guarantee:

| State                                                 | What is true                                                              | What the UI may say               |
| ----------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| **requested**                                         | recorded locally; the server may not know; C can still push               | "Pending — not yet active"        |
| **committed** (server, key rotated, cutoff finalized) | C cannot create an accepted write; no new divergence can form from here   | "Revoked"                         |
| **acknowledged** by every device                      | no remaining device is still accepting C; all replicas know the boundary  | "Revoked, all devices up to date" |

Only **committed**, with all three parts above, may be presented as revoked. A request that has not reached
the server — or an authorization successor whose content cutoff has not been finalized — is still pending.
The implementation may make the three parts one transaction; the product semantics may not omit one. This
supersedes the acknowledgement display sketched below: acknowledgement is the third state, not the
guarantee.

**The alternate-path bypass condition that used to qualify this guarantee is now satisfied by
construction.** It held only if devices had no direct peer path routing around server enforcement — and
after D-16 there is no peer path to have. Enforcement lives on every path because there is one path. That
removes the old peer-path qualifier; it does **not** remove the hostile-relay qualifier, which is why the
authenticated finalization boundary above remains part of the security contract.

**What remains is a window, not a divergence.** Between **requested** and **committed** the server has not
finished the transaction: it may not have heard the request, or it may not yet have published the accepted
set and cutoff. C's writes may still be accepted into that pre-commit set. Those writes are **kept**.
Nothing accepted before the finalized cutoff is discarded, because this is exactly what D-20 already says
removal means: *removal governs the future, never the past.* A revoked device's accepted history up to the
cutoff is part of the document in the same way a departed colleague's writing is part of a file. The old
design's painful part was never this window — it was reconciling two lineages afterwards, and there are no
longer two.

**The principle that has to hold regardless: authorization reconciles before content.** Two devices settle
the current epoch, credentials and capabilities before they exchange a single document update. Same shape
as TRD §6.1's load-before-connect rule, and it deserves the same status. With one relay-mediated path this
is now sufficient rather than merely necessary.

**One display requirement survives, because the three states are still distinguishable and Rule 2 requires
saying which one is true.** Once the server commits the new authorization epoch, rotates the key **and
publishes the authenticated content cutoff**, the device is revoked; acknowledgement means every remaining
replica has learned that fact. "Revoked — 2 of 3 remaining devices are up to date" is honest and actionable.
Before that commit the UI says "Pending — not yet active"; after it, an unacknowledged device is stale rather
than evidence that revocation failed.

**Two mechanisms this decision used to need are now unnecessary, and should not be rebuilt by reflex.**
_Filtered replay_ — rebuilding a document from its update log while skipping a revoked participant's
operations — was always limited by the fact that you cannot remove one participant's operations from a CRDT
history without losing what was built on top of them. It is not needed and is not built. _Keep both_ —
showing the user two lineages — would have violated D-11's deliberately singular surface, and the case that
produced it cannot occur.

**And the structural insight, which now reads as the argument for the decision rather than a consolation:
the hard form of this divergence was a peer-to-peer problem.** Direct device-to-device sync creates a
partition-tolerant authorization problem; server-mediated sync supplies one place to serialize revocation
and finalize accepted content, provided clients verify that boundary rather than trusting relay behaviour.
It bit hardest exactly where revocation is most wanted — the motivating case is a lost phone, and the
window was "my laptop and the lost phone were online together while my other device was not", which is not
an unlikely sequence. The old plan's answer was to name that risk as a reason to adopt hosted sync. The current plan's
answer is a single relay path plus a client-verifiable finalization boundary.

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

**The peer list's deduplication carries the same dependency, and an earlier draft only noticed it for
colour.** Deduplicating requires knowing which awareness states are the same _person_, and there is no
principal to ask. Today `createSync` builds the list from awareness device names, which is why it says
`Mac, Mac`. So: **dedupe by device id now** — awareness already publishes one, and it fixes the
two-tabs case exactly — **by principal once D-19 lands**, and **never by name**, since D-3 exists
precisely because two different Macs are both called `Mac`.

**A dependency D-21 makes visible.** D-8 says all of your carets share your colour, and colour today
comes from the actor: `resolveActor` assigns a random one from a fixed palette per actor, and awareness
carries it as `user.color`. Since an actor is per device (D-4), two devices mean two colours — so "all of
your carets" only holds within one device until there is a principal to hang a colour on. Which
means PR #18's rule is exactly right for the case it can see, one device with several tabs, and the
cross-device half of D-8 is deferred by dependency rather than by choice. It arrives with D-19's enrollment,
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
- **Agent membership requires the owner to have an account**, and this follows rather than being chosen:
  admitting an agent changes authorization, only the service changes authorization (§5.7.3), and a Local
  workspace has no service. So agents live at **Account** and the free product has none. That is a real
  boundary on §7's "Local asks for nothing, ever" — Local asks for nothing and correspondingly delegates
  nothing — and it should be stated wherever the agent feature is described rather than discovered when
  someone tries to grant one from a local install.
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

- **Authorization epoch 0 — local genesis.** No other credential has been admitted and no service
  authorization has been adopted. The actor id has no external audience, so minting a replacement is harmless and
  is just the genesis case (S1) with extra steps.
- **Authorization epoch greater than 0 — admitted.** The service has authorized something: a second
  device, an agent member, a capability change. The workspace is now a shared artifact whose
  authorization state means something. A fresh random identity that appears and begins writing is
  precisely the unapproved-writer problem. The app must **not** silently mint one; whether it refuses to
  write, offers to sign in again, or quarantines the workspace remains open.

**Which is simpler than it looks, because after §5.7.3 the two cases are the two levels.** Only the
service changes authorization, and agent membership requires an account (§5.4.1), so every event that
advances the epoch requires one. **A Local workspace is always at epoch 0 and an Account workspace is
always past it** — the epoch is not a third axis crossing the ladder, it is the ladder seen from the
authorization side. That collapses the detection problem D-12 was worried about into one question with a
definite answer: *is there signed service authorization state in this document?* Absent means Local
genesis and re-minting is harmless; present means admitted and it is not.

**The test this document proposed for telling those apart does not work, and is withdrawn.** The claim was
that a surviving human roster entry proves the document predates the missing identity and has been shared.
It does not: `resolveActor` writes a `kind: 'human'` roster entry on **every ordinary first run**, before
any sync exists, so a never-synced document already satisfies the test. Nor does counting entries rescue
it — two storage clears on a purely local document leave two orphaned human entries, which is
indistinguishable from two devices having synced.

The roster is mutable, unauthenticated and written by genesis, so it cannot be evidence of admission to
anything. What the policy needs is a **monotonic, signed authorization epoch**. Epoch 0 means local genesis:
no external credential admitted and no service authorization adopted. The epoch advances whenever the set or
scope of authorized credentials changes — admitting or revoking a device, admitting or removing an agent or
human member, changing a member's capabilities, or adopting service authorization.

> **Decided in principle.** Epoch 0 may re-mint silently; a workspace at a later authorization epoch must
> not. The two are distinguished by signed authorization state rather than by the roster. What the app _does_ on detecting an
> admitted document with no local identity is still open — see below.

**And that epoch is not a new open question: several decisions require the same signed authorization
state.** Its payload has to bind the workspace's membership grants, device and agent credentials,
capabilities, and content-key generation. The generation is broader than membership because admitting a
second device changes authorization without creating a second member.

| Decision | What it needs from the authorization state                                      |
| -------- | ------------------------------------------------------------------------------- |
| D-12     | **signed, and verifiable without a local secret**                               |
| D-19     | an enrollment admission binding the new device to the existing principal        |
| D-20     | key rotation when a read-capable credential loses access                        |
| D-26     | a definite committed epoch, signed and serialized by the authorization service  |
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
>
> **And D-17 gave this decision a third condition, which is not a warning.** A hosted copy is recoverable
> *by the user, with the code they saved*, and by nobody else including the service (§5.7.5, §5.7.6).
> D-25 owns saying that at account creation, saying it without implying more, and being able to say
> *the data is gone* to someone who has lost both their devices and the code.

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

A warning that can never be cleared is noise rather than information, so the escape hatch matters. Where
persistence genuinely cannot be granted there are **two** honest resolutions, and an earlier draft named
only the second: **export**, which is free, immediate and already built (PRD principle 4); and hosted
sync, whose price is outside this decision. Naming the local remedy first matters — a storage warning
must not function only as an account-acquisition surface.

**The conflict this decision previously failed its own test on, and what D-16 did to it.** In v14 the
accountless sync rung was Paired, whose live durability was "none — the group is it" with no automatic
recovery story. Manual export remained an honest mitigation, but it did not keep a continuously current
copy without repeated user action; hosted sync was the only automatic resolution. That does not make the
tier logically impossible to describe. It does mean a transport choice manufactures a limitation that
then demands recurring disclosure, which this document rejects as a product choice.

D-16 removed the manufactured half of that. **A single local device holding the only copy is not a
limitation the product built; it is what a local application on one computer is.** The statement "this
is the only copy" is now a plain description of a configuration the user chose, of the same kind as a text
editor saving to one disk — not a deficiency engineered so that a warning could point at it.

What survives is the environment case, and the three conditions must each be treated differently — only
the first is a warning at all:

| Condition                                                          | Clears?                        | Treatment                                                                 |
| ------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------- |
| **This context is not durable** — `persisted()` false (S29, S30)   | Yes — grant it, export, or move | D-25 as written: prominent, persistent, names the action                  |
| **Only this device holds a copy** — Local, by definition           | No — it is what Local _is_     | Stated once, at the moments it is actionable; never a recurring banner    |
| **The hosted copy needs your code** — Account, by construction     | No — it is what non-custodial _is_ | Stated once at account creation, and again wherever recovery is described |

The first is a defect in the environment and warning about it is a service. The second is a property of
the configuration the user is in, and it belongs to the surfaces that describe their setup — the storage
section of the menu, and the moment they are about to do something that assumes a second copy exists.

**The third row is the one that will be got wrong, because the mistake is silence rather than a false
sentence.** Nothing has to claim "we can restore your data" for an account-holder to believe it; *"your
list is backed up to our servers"* is true, and a reasonable person reads recovery into it. So the copy
has to carry the dependency in the same breath as the reassurance — the hosted copy is real, and the code
is what opens it — at account creation, in whatever describes the account's storage, and at the moment
the code is generated (§5.7.7).

**And the sentence that has to exist before it is needed.** For a user who has lost every device and
cannot find the code, the true answer is that the workspace is unrecoverable. That sentence is only
survivable if nothing earlier implied otherwise, which is why this row is a D-25 obligation rather than a
support-article problem. Its own test applies: *would this sentence exist if the product had no business
model?* It would — a non-custodial local-first app with no revenue would still owe it.

**One test to apply to any copy written for the second row**, because it is the test v14 failed and the
one the outside reading will apply: *would this sentence exist if the product had no business model?* "This is
the only copy of your data — export it, or turn on sync" passes; it is true, and a local-only app with no
business model would still want to say it. "Your data is not safe until you create an account" does not.

**D-13. Is there a deliberate "start fresh" or "not me" action?**

> **Decided: yes, such an action exists.** Whether it is the same thing as sign-out is open, and so is
> what it clears.

**What it clears is four separate objects, and an earlier version of this paragraph collapsed two of
them.** They can be cleared in combination, and the combinations are what the button is choosing between:

1. **Identity** — `done.actor` and `done.device`. Display-level, and the only one an earlier draft
   considered.
2. **Capability** — this device's signing credential, any PRF wrap protecting it, and the content-key
   generations it holds. This is what lets the device write as itself and read the workspace.
3. **The document** — IndexedDB and the journal beside it.
4. **Recovery material** — any copy of the recovery code the user stashed on this device, which §5.7.6
   asks them not to do and some will do anyway.

**Clearing 1 and 3 without 2 is the shape to avoid, and it was the shape the old two-way framing
described.** "There was never anyone here" is what a shared-laptop user means, and it is not achieved by
removing the name and the list while leaving an authorized credential and a live content key in the
profile — that hands the next person at that machine a device that can still read and still write, and
does it while telling the departing user the machine is clean. **So a shared-device reset clears 1, 2 and
3 together**, and should revoke the credential at the service as well, since a machine you have handed
over is exactly D-18's motivating case.

**Two of the four can be irreversible, and an earlier version of this paragraph named only one.** Objects
3 and 4 both destroy, under conditions the app is differently able to detect:

- **Clearing the document** is recoverable at Account with a current sync, and what it takes back depends
  on whether object 2 went with it. **Document only:** the device keeps its credential and content keys,
  reconnects, and decrypts what it re-receives. **Document and capability together** — which is the
  shared-device combination above — signing in restores authorization and ciphertext and *not the ability
  to read it*: the content key comes back through §5.7.2's second gate, from an existing device or the
  recovery factor. "It comes back when you sign in" collapses the four recovery objects and this document
  has made that mistake before (§5.7.6). It is **total loss at Local**, where this device is the only copy
  by definition (§5.1.1), and it loses whatever has not yet synced at Account. The app knows which case it
  is in: whether an account exists, whether anything is pending, and which objects the button is about to
  clear.
- **Clearing the recovery material** can make a hosted workspace permanently unreadable (§5.7.6, §5.7.7)
  and cannot be undone by signing in again. The app knows a hosted workspace exists; it cannot know
  whether another copy of the code survives, so this one has to warn pessimistically.

**So both need warnings, and they are different warnings.** The document warning is conditional and
checkable — say it when it is true, stay quiet when the service holds a current copy. The recovery-material
warning cannot be conditioned on the fact that matters, so it says what it destroys and asks the user to
confirm they still have the code elsewhere. Neither may ride along silently with a reset that is otherwise
recoverable, which is the argument for keeping the four objects separable rather than shipping one button
that clears everything.

**Whether it equals sign-out:** wherever there is an account, sign-out already has to exist, and a second
nearby button that does almost the same thing is how people lose data they meant to keep. That is now
sharper rather than softer, because the two buttons differ in a way the labels will not carry on their
own — one ends a session, the other can end the workspace.

**And the premise this paragraph used to rest on is gone.** It read that "sign out" on a device whose
token cannot be revoked is a local action with no remote effect. Under §5.7.2 the device credential is
revocable at the service and D-18 makes that the unit of revocation, so signing out *can* have a remote
effect and the honest label is available. What genuinely cannot be revoked before it expires is the
scoped relay bearer token (§2.3, §5.7.9), and that is a bounded window rather than a permanent gap. The
open question is therefore not whether the label can be honest — it can — but **which combination of the
four objects each button clears**, and whether an ordinary sign-out revokes this device or merely stops
using it. The shared-device case answers itself; the single-owner case is the one still open.

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

> **Decided: "partly", and after D-16 that covers every synchronized workspace rather than one tier of
> them.** The service authenticates connections and authorization state; the relay validates opaque
> envelope metadata and signatures. It does not receive plaintext, parse Yjs content or decide whether a
> mutation is semantically allowed. "No" and schema-level content authority are both rejected; D-28 fixes
> the boundary.

**One thing D-16 changed here, worth noting because it makes the second half easier rather than harder.**
While an accountless peer path existed, any authority given to the relay was authority that half the users' sync
did not pass through, so relay-side enforcement could never be more than defence in depth. With one
mediated path, relay-side checks are on every byte that crosses between devices. That does not decide the
content semantics — D-28 assigns those to clients — and client-side verification is still what the
promises rest on, per D-20 and D-27. It does mean the relay's opaque checks are worth what they cost.

**On "is there any other option, if revocation is part of the story?" — yes, and it is D-20.** Once content
is encrypted and keys rotate on removal, a revoked device can connect and receive bytes it cannot read. Read
exclusion is enforced by the key, not by the door. Relay-level refusal alone is therefore **defence in
depth** for confidentiality and bandwidth; it is not the accepted-write boundary. D-26 and D-28 separately
require authorization-service acceptance and finalization evidence so clients reject the revoked
credential's future writes without giving the service plaintext authority.

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

**And one factual correction that this depends on.** TRD §4.8 said, until this branch corrected it in
place, that "transaction origins are still recorded in the update stream regardless, so coarse attribution
is recoverable if it ever matters." That is not so. `Y.applyUpdate(doc, update, origin)` takes the origin
as an argument supplied by the _receiver_; it is a local property of the transaction and is not encoded in
the update bytes. What the bytes do carry
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

**D-28 now closes the remaining half of D-14.** D-20 and D-27 set the client-verifiable guarantees;
schema-level relay authority is unnecessary defence in depth with a much larger confidentiality cost, so
the selected service boundary stops at opaque metadata and authenticated acceptance evidence.

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
change into a Yjs transaction in memory. Signing has no business there, and the shape of the API makes
that hard to get wrong by accident: `crypto.subtle.sign` returns a promise, so while it can be _called_
from a synchronous input handler it cannot _complete_ before that handler returns, and a signature
nobody waited for is not on the keystroke path. The load-bearing argument is the next paragraph's, not
this one's.

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
- **Preserve source-authenticated envelopes end to end.** A relay, store or future transport must not combine mutations from
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

Three questions that decided the shape of the ladder in §5.1.1 and were not answerable by preference.
**Two are closed, and closing the first changed the third's job.** D-16 is decided and did most of the
work in v15; D-18 was already decided and is now non-deferrable because of it; and **D-17 is now decided
too**, all five selections recorded across §5.7.2, §5.7.4, §5.7.5–§5.7.6 and §5.7.8. Closing it opened
**D-34** (§5.7.4), which is a smaller question than any it replaced.

**D-16. Where does the account/service boundary sit?** _(Decided, after one round re-opened. This and the
pricing question were one row until v14; separating them is the correction. Pricing is D-31 and this
decision does not anticipate its answer.)_

> **Decided: hosted synchronization is the account boundary.**
>
> - **Local remains free and permanent.** The complete application on one device, with export. No
>   account, no service and no server-held copy.
> - **Hosted sync requires an account** — relay-mediated, end-to-end encrypted, across devices that are
>   never awake together, with a server-held encrypted copy. Whether that service is free or paid is D-31.
> - **Peer-to-peer is not built.** Not as a tier, not as a separate authorization path, and not yet as a
>   transport optimization.
>
> The prior candidate — direct device-to-device sync as an accountless rung beside hosted sync — is
> **rejected**, and the "build both paths, then measure" instruction it carried stays withdrawn.

**The derivation does not need a business model.** An account is necessary when the service first holds
or decides something for a principal: a server copy needs an identity and retrieval credential, and
revocation needs service-signed state. Accountless peer sync would add a second transport, discovery flow and
authorization semantics without removing the signalling service or supplying survivability. The choice
is therefore between one hosted path whose role is clear and two paths with different failure semantics;
pricing does not decide between them.

**The rejected candidate had a real product intention underneath it, and it should be recorded rather
than dismissed:** let people synchronize their own devices without first establishing a service
relationship. That is coherent. It failed on three independent execution grounds, any one of which is
sufficient.

#### Ground 1: the cost inversion

**The accountless path was the expensive one.** The hosted path's shape is already running: `relay/src/server.ts`
describes its own purpose as existing "because two devices that are never online at the same time still
have to exchange bytes", and `relay/src/persistence.ts` implements exactly that window — one file per
room, four dependencies, no native code.

The accountless path existed nowhere and would have required a WebRTC transport, a signalling service, STUN,
TURN for the 10–20% of connections that cannot connect directly, a second connection-establishment path,
a second set of failure modes concentrated on the case most likely to fail, and a second revocation
semantics (D-26).

**One correction to how that argument was stated in v14, because the conclusion survives and the phrasing
does not.** "The hosted capability is already built" is too strong. The relay that exists holds and applies
a **plaintext** Yjs document — `Y.applyUpdate` on load, `Y.encodeStateAsUpdate(doc)` on write — and under
D-20 it can do neither. A content-blind durable store needs client-produced authenticated checkpoints, a
manifest binding each checkpoint to its authorization head and content-key generation, the update suffix
after it, and retention rules for superseded checkpoints (D-33). Add D-27's envelope verification and
D-26's commit point and the relay required is a substantially different program from the one running.

The honest claim is therefore: **the shape is proven and the operating model is known**, whereas WebRTC's
is neither. That is still decisive — a store-and-forward service whose failure modes are understood is far
cheaper than that service *plus* a second transport — but stating it as "already built" invites a later
discovery of the rewrite and a conclusion that this decision rested on a false premise. It did not; it
rested on a narrower and still-sufficient one.

#### Ground 2: its limitation would have dominated the product surface

D-25 requires the app to say when durability is not guaranteed. Under the candidate path, "your data
exists on your devices only" was permanently true for every accountless synced user. A user could maintain
current exports, but hosted sync was the only automatic remedy. The result is a recurring warning created
by a transport choice rather than by an unavoidable property of local use. This is a product-value
objection, not a proof that no honest copy could be written.

**The test that makes this precise, and it is worth keeping because it generalises past this decision:**
*would you build this limitation if you had unlimited money and no business model?*

- "We do not keep a copy of your data unless you ask us to" — **yes.** That is a privacy position, and a
  well-funded local-first project would still hold it.
- "Your two devices sync only while both are awake, over a transport built specifically to have that
  property, while a transport without that property is already running" — **no.** It manufactures a
  limitation without advancing privacy, independence or the product's core experience.

A limitation that fails this test is not made desirable merely by disclosing it clearly. **A constraint
whose principal product surface is a recurring warning deserves suspicion.** The current boundary
passes the product test: local-only is not a degraded sync tier, it is an application on a computer, and
D-25's copy for it is a description rather than a prompt.

#### Ground 3: it might not have worked

The retired rung synced only while both devices were awake and connected at the same moment. The device
pair this product actually has is a phone and a laptop, and the phone spends the day as a suspended PWA
in a pocket with no background WebRTC. The realistic experience is that nothing converges until the user
deliberately opens both devices and waits — which is not a usable synchronization experience, it is
friction that reads as broken.

The test was to be a week of ordinary phone-and-laptop use converging without the user consciously
performing a sync. **It is now moot, and worth recording as unrun**: the decision did not need it, but
anyone reopening this should know the path was never demonstrated to be usable, and that the burden of
that demonstration falls on whoever proposes it again.

#### What the removal actually deletes

The saving is much larger than a transport, and v14 mis-accounted it by counting bandwidth:

| Deleted with the accountless path                      | Where it lived            | What it was                                              |
| ------------------------------------------------------ | ------------------------- | -------------------------------------------------------- |
| WebRTC transport, signalling, STUN, TURN               | D-31                      | A second connection path, maintained in parallel forever |
| The sanctioned-lineage rule and divergence discard     | D-26                      | **Partition-tolerant authorization** — the largest piece of bespoke cryptography in the plan |
| Divergent authorization successors                     | S49                       | A fork-resolution semantics with no server witness       |
| The accountless authorization authority                | §5.7.3                    | A user-held root ordinary people would have had to operate and recover             |
| A second trust root and a second discovery flow        | D-19                      | Two protocols where one now suffices                     |
| The accountless branch of the revocation guarantee     | D-26, §5.7.1              | Every guarantee's qualifying clause                      |

**The real cost of the accountless path was never TURN bandwidth; it was partition-tolerant authorization.**
That is the finding, and it is why this decision was worth taking before anything WebRTC-shaped existed.

**One entry belongs on the other side of that ledger, and it was written in the same commit as the ledger
itself.** Removing the peer path is what forced D-33's promotion — §5.11 says so directly: the notional
configuration in which a user depended on nobody is gone, so an **independently runnable client and
service stack** stops being a roadmap item and becomes what makes the pitch true. That is not small:
source and release artifacts for client, authorization service, relay and durable store under terms
permitting indefinite independent operation, pinned dependencies and checksums, a documented versioned
envelope and checkpoint protocol, a standalone restore tool, and a tested migration (§5.11.5). None of it
appears in the table above, which counts only what the rejected path would have cost.

**The conclusion survives the correction, and it is worth being explicit about why rather than asserting
it.** The two costs are not the same kind. Partition-tolerant authorization was **bespoke cryptographic
design** with no reference implementation, on the critical path, and load-bearing for a guarantee — the
sort of work that is hard to scope and harder to be confident in. The survivability package is
**packaging and documentation of software that has to exist anyway**: the client, service and relay are
being built regardless, and D-33 obliges the project to make them independently runnable and to prove it
once, rather than to invent anything. So the ledger still nets out in the same direction. What is no
longer true is that the removal was pure saving.

#### What is genuinely given up

Two things, and only one of them is real.

**An accountless cross-device story.** This is the true cost and it should not be minimised: a person with
a phone and a laptop who does not want an account has two independent copies of the app. That trade belongs
to D-16 regardless of how hosted sync is eventually priced.

**The appearance of service independence, which was never real.** The retired rung looked like a
configuration that would keep working if this company disappeared, and it was not one: browser peers need
signalling and a rendezvous point, and a peer group that continues through service absence needs a
fork-resolution rule it did not have. That resemblance is probably part of why the path survived four
drafts of scrutiny. Real service independence comes from independent custody, portable software and a
tested migration path — **D-33** — and none of those is a transport property. Note where independence
actually now sits: **Local is the most service-independent configuration in the product** for an install
that already exists, it is free, and it already exists. Reinstalling it still needs the survival package,
which is a dependency the retired rung would not have removed either (§5.1.2).

#### What would bring peer-to-peer back

Deferred, not refuted. It returns as an **optimization beneath one envelope protocol** — never as a tier,
a pricing boundary or a separate authorization semantics — and only when all of the following hold:
measured relay egress is actually a cost worth attacking; measured device-pair overlap shows enough
simultaneous reachability for a direct path to fire often; direct-connect success on the real
phone-and-laptop network mix is high enough that TURN is not the common case; and a failed direct path
falls back to the relay without changing document meaning. An emergency service-absent peer mode is a
different feature again, belongs to D-33, and needs replaceable signalling plus migration to a replacement
authorization service. It is not permission to continue the vanished service's lineage.

**D-31. What does a synced user cost, and how should hosted sync be priced?** _(Deferred on purpose and
split from D-16. It is a business-model question, not an identity or synchronization decision.)_

> **Deliberately deferred and out of scope here.** D-16 requires an account for hosted sync and says
> nothing about what that account costs. Hosted sync may be free, paid, bundled or metered without
> changing any identity, authorization or transport decision in this document.

**What makes deferring this safe.** Nothing architectural is foreclosed by not knowing the answer, and
no sentence elsewhere in this document may rely on one. The eventual decision should use measured relay
egress, durable-store writes, retained ciphertext, checkpoint volume, recovery downloads, payment costs
and the ordinary economics of operating the service.

**What to measure, when there are users**, since the list is short and the instrumentation is cheap to
add before it is needed:

- update-envelope bytes per active workspace at p50, p95 and p99;
- relay egress, durable-store writes, retained bytes and recovery downloads;
- checkpoint frequency and size (D-33's bounded recovery representation drives both);
- the fraction of users who never create an account at all.

**And one body of research this decision no longer needs, recorded so nobody repeats it.** The candidate
boundary's unit cost hinged on WebRTC, whose two helper services have opposite economics: **STUN** merely
tells a peer its own public address, and free public endpoints exist and are widely used; **TURN** relays
the actual traffic, so offering it free means paying for strangers' bandwidth, and production-grade free
TURN essentially does not exist. Reported figures cluster around **10–20% of connections requiring TURN**,
with 8–10% attributed to symmetric NAT and restrictive firewalls. The mix here would have been unusually
hostile — phone-to-phone across two mobile carriers is both the case most likely to fail and the case a
task-list-on-your-phone product hits most. None of this bears on the current design, which has no WebRTC
in it. It becomes live again only under the conditions D-16 sets for reopening peer-to-peer.

**D-17. What does "reasonably secure" mean, concretely enough to test?** _(Decided. All five selections
recorded; D-28 selects the protocol architecture that implements them.)_

The earlier framing made this sound like a choice between "browser keys" and "real accounts". It is six
choices: **what the product promises; whether any authority may change authorization outside the service; where
an ordinary device key lives; what an account adds; how recovery works; and what counts as evidence.** An
answer to only the first is an aspiration, and an answer to only the key-storage question is a mechanism
without a threat model.

**The second, fourth and fifth are answered by separating authorization from content custody.** No
authority changes authorization outside the service; account recovery restores the service relationship;
and a single user-saved code seals the content-recovery root that unwraps the document. The service holds
authorization authority and **no content root it can open** — it may hold a wrapped one, which is not an
exception because the factor that unwraps it never reaches the service (§5.10.1). The third is answered in
§5.7.4 and the sixth in §5.7.8, which closes D-17.

**The first — what the product promises — was never a free choice**, and it is worth saying why the list
above puts it first anyway. §5.7.1 derives it from decisions already taken rather than selecting it, so
the honest reading is that the promise was fixed by D-20, D-26, D-27 and D-18 before D-17 was opened, and
D-17's job was to assign each authority and recovery path without collapsing them. That is what the five
selections do.

**What D-16 did to the second of those, precisely.** D-16 removed the everyday accountless authority;
the migration decision now removes the break-glass successor as well. The account service is the only
authorization authority. If it disappears, the content moves to a new service under a new lineage rather
than trying to prove that the new authority is the old one's legitimate successor (§5.7.2–§5.7.3).

Several options remain unavailable without reopening decisions. D-20 requires content encryption and key
rotation, so transport encryption with plaintext at the relay is not enough. D-27 requires authenticated
attribution, so a shared room secret that lets every holder write as anyone is not enough. D-18 requires
device-level revocation, so a principal-wide key copied unchanged to every device is not enough. D-26
requires a server commit point, so a relay that merely forwards whatever arrives is not enough. The
selected split is service authorization plus user-held content recovery; D-28 chooses its protocol shape.

#### 5.7.1 The minimum promise already forced by the other decisions

"Secure" without an attacker is not testable. This table is the minimum claim the recorded decisions
already imply; choosing a stronger root may improve individual rows, but choosing one that cannot meet a
row means reopening the decision named above.

| Attacker or event                                      | What must remain true                                                                                                                        | What is not promised                                                                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Knows the relay URL and workspace identifier (S41)     | Cannot decrypt content, become a member or create an accepted mutation. A workspace identifier is an identifier, never a bearer secret.      | Cannot be prevented from reaching a public endpoint; rate and resource abuse are a service-availability problem.                            |
| Passive network observer                               | Learns no content or reusable credential from traffic. Transport security still applies outside the content encryption.                      | Hiding that traffic exists, its rough volume, or the network addresses involved.                                                            |
| Relay reading envelope metadata                        | The attributed actor is not directly present in envelope metadata — it is inside the seal (§5.8.1), so no actor identifier crosses in the clear. | **Not unlinkability.** The relay sees a credential identifier per envelope and validates authorization state that binds credentials to members and capabilities, so it can generally tell which device or agent wrote, and therefore a human's writes from an agent's. Sealing the actor removes a field, not the inference. Write times, rates and volumes per credential are visible and are not removable while the relay validates authorization at all. |
| Malicious or compromised relay (S42)                   | Cannot read content, forge an accepted mutation, sign an authorization epoch, make an already-seen older epoch look current, **or land a revoked credential's withheld old-epoch write after the commit** (§5.2.3). | It can delay, omit, reorder or refuse bytes. End-to-end encryption supplies confidentiality and integrity, not availability.                |
| Malicious or compromised authorization service        | Cannot decrypt content, forge an existing device's mutation or cause content-key delivery by authorizing a credential.                      | It can admit or revoke credentials, change capabilities, choose the authorization state it recognizes, suspend the account or deny service. |
| Leaked relay bearer token (S43)                        | Does not decrypt content, sign a mutation, authorize a device or recover an account. It is scoped, expires and can be refused independently. | The holder may consume relay service and obtain ciphertext or metadata until refusal or expiry.                                             |
| Compromised authorized device or agent (S44, S46)      | Cannot impersonate another actor, exceed its capability or survive revocation by inventing authority it was never granted.                   | It can read everything its capability permits, copy it forever, and make every malicious edit its capability permits until revoked.         |
| Revoked credential                                     | After the applicable commit point, cannot add an accepted write or decrypt a later content-key generation.                                   | Erasure of any plaintext, key or ciphertext it obtained before revocation. Removal governs the future, as D-20 already says.                |
| Copied browser profile                                 | On a PRF-wrapped device, the copied operational-key wrapper is unusable without the authenticator; a lower-tier device makes no such promise. Service revocation limits future access. | Protection for plaintext document data copied with the profile (D-34), or after the attacker can invoke the key through an unlocked app. |
| Unlocked device or running app                         | After the service revokes its credential and the content key rotates, the attacker cannot extend access into the new generation.             | Protection while the attacker can run the app as the user, read its plaintext or exercise its current device capabilities.                  |
| Same-origin XSS, compromised dependency or bad release | The content-recovery root remains absent during ordinary operation. After hostile code is removed, the service can revoke operational credentials and a clean device can recover content and rotate its keys. | Confidentiality or integrity while hostile code runs with the app's origin and privileges, including any recovery material entered then. Client-side encryption cannot provide that. |
| All devices and authenticators lost while hosted ciphertext still exists (S47) | Account recovery restores authorization; the independently stored recovery factor restores content-key access; the hosted copy supplies the ciphertext **and the wrapped content root the factor opens**. Together those paths complete workspace recovery (§5.7.6). | Authorization does not decrypt, the recovery factor does not restore the service account or missing ciphertext, and no party substitutes for a lost content-recovery factor. |
| Service outage or disappearance (S50)                  | Existing local documents remain readable and writable; no local operation awaits the service.                                                | Server-mediated sync, server-held recovery material or a promise that the service's copy remains reachable after the service disappears.    |

> **Decided as the minimum security promise.** A protocol that cannot meet every claim in the middle
> column reopens the upstream decision that forced it. D-28 selects the architecture boundary; the TRD
> and security review specify and test the mechanism without weakening this table by default.

**The four recovery objects remain separate here as they do in §5.7.6.** Account recovery supplies
objects 1 and 2 — account access and the service's authorization of a replacement credential. The saved
code or another independent wrap supplies object 3, content-key access. A surviving device, hosted copy
or archive supplies object 4, ciphertext. The service-disappearance path in D-33 creates a new account
and authorization lineage, but it still needs independently available ciphertext and the content factor.

**Copied storage and a running device are different attackers.** The PRF wrap can make a copied profile's
persisted device-key wrapper unusable; it cannot stop an attacker who can invoke the already-unlocked key.
Neither fact decides whether the content beside it is plaintext, which remains D-34.

Two phrases in that table carry more work than they appear to. **Already-seen** is the bound on
rollback protection: a returning client can remember the newest authorization head it has seen and reject
an ancestor, but a brand-new client trusts the authorization service to identify the current head. And
**accepted mutation** is stronger than "valid signature": a removed device can
sign an update under an old epoch and lie about when it did so. **The answer is authenticated acceptance
evidence plus the authorization service's committed ordering, and after D-16 that is the only answer needed** — there is
no peer path requiring a sanctioned-lineage rule to settle which of two successors is real. A
client-supplied timestamp is not an answer.

#### 5.7.2 Service authorization, user-held content recovery

The previous model made a user-held administration root portable so that the same authorization lineage
could survive the service. That is more continuity than the product needs. **D-33 now requires migration
of the data, not succession of the former service's authority.** Once that distinction is accepted, the
authorization authority can live where the ordinary account experience already puts it: at the service. The
content-recovery root remains with the user, because authorization and decryption are different powers.

| Artifact                              | May do                                                                                                  | Must not do                                                                                              | Held by                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Relay admission token**             | Open a scoped transport connection for a bounded time                                                   | Decrypt, sign content, admit a device, change capabilities or recover an account                         | Device temporarily; service issues |
| **Device or agent credential**        | Sign mutations; unwrap content keys if read-capable                                                     | Change service authorization; represent an arbitrary actor                                                | The device or agent             |
| **Service authorization authority**   | Admit and revoke credentials, choose capabilities, sign authorization epochs and finalize accepted sets | Decrypt content, sign a device's mutations, represent its actor or deliver a content key by authorization alone | The account service             |
| **Content-recovery root**             | Unwrap content-key generations after device loss                                                        | Admit or revoke anything, change capabilities, sign mutations or recover the service account              | The user, sealed under recovery factors |

The device row still contains two cryptographic jobs. Signing proves who sent an envelope; public-key
encryption or key agreement lets a content key be wrapped for one reader. A library may represent them
together, but the contract cannot assume that a signing key can also receive an encrypted key.

**The symmetric content key also collapses one apparently available capability distinction: edit implies
read.** An agent cannot construct an encrypted Yjs update without the content key, and a holder of that key
can decrypt the document. A nominal write-only agent could sign a _proposal_ that a read-capable device
validates and encrypts, but then it is not independently editing while that device is offline. Achieving
cryptographic write-without-read needs a different content construction, not a capability flag. So the
agent feature may offer read and read+edit; it must not promise cryptographic write-only isolation while
D-20 uses one symmetric document key. Granting an agent edit therefore discloses the whole workspace to
it and to whatever runs it (D-20).

> **Decided: the service is the authorization authority; the user holds the content-recovery root.** At
> **Local** there is no authorization state beyond epoch 0. Account creation binds the existing principal,
> device and workspace to a service-controlled authorization lineage. The service admits and revokes
> credentials, assigns capabilities and signs the current authorization state. The user-held root does
> one job only: recover content keys.

This model deliberately trusts the service for **authorization integrity and availability**, while not
trusting it for content confidentiality or attributed mutation integrity. A compromised authorization
service can admit or revoke credentials, change capabilities, freeze an account or lie about which
authorization state it currently recognizes. It still cannot decrypt the workspace, forge an existing
device's signature or produce a meaningful encrypted mutation without obtaining a content key. Those are
different promises, and §5.7.1 must name both rather than treating "the server" as one undifferentiated
attacker.

**Enrollment therefore has two independent gates:**

1. **Authorization.** Account authentication lets the service admit the new device credential and sign a
   successor authorization epoch. No old or designated device needs to remain online.
2. **Content-key delivery.** The new device receives a content key from an existing device or unwraps it
   with an independent recovery factor. **Service authorization alone must never cause an existing client
   to release a content key.** Otherwise a malicious service could authorize its own credential and turn
   authorization authority into decryption authority through the back door.

The second gate is where correlated loss matters. A phone, its device credential, a device-bound passkey,
its local ciphertext and a recovery code stored on that phone may be five artifacts and one failure
domain. A passkey wrap counts as recovery only when it is available outside the lost device; text or an
archive stored only on that device does not. §5.7.6 carries that requirement into the recovery decision.

**Migration replaces succession.** If the service disappears, a surviving device — or a clean device
holding independently available ciphertext and the content-recovery factor — restores the content and
creates a new account under a replacement service. That service establishes a new authorization lineage;
the user's other devices enroll again. The product does not promise that the vanished service's device
list, epochs or authorization history continue as authoritative. This is enough for data and application
continuity, which is the promise D-33 now makes.

Account deletion similarly ends the service authorization lineage and synchronization; it cannot erase
content or recovery material already held by the user. Each device becomes an independent Local install
with its last replica (D-24). D-13 and D-32 constrain deletion; the TRD inventory records exactly which
local and service-held recovery artifacts each deletion event clears.

#### 5.7.3 Who may change authorization outside the service? — decided: nobody

> **Decided: no credential changes authorization outside the service.** While the account service exists,
> it is the sole authority for admission, revocation, capabilities and epoch ordering. If it disappears,
> the old authorization lineage stops evolving. Recovery creates a new service relationship and a new
> lineage; it does not appoint a successor to the vanished authority.

This closes the question that the portable administration root was introduced to answer. There is no
break-glass administration secret, surviving-device quorum, delegated administration credential or
witness-succession operation. The recovery code protects the content-recovery root only. Account recovery
restores the service's willingness to authorize; content recovery separately restores the ability to
decrypt.

The authorization service's signed state — not the mutable display roster — remains the source of the
device list. A relay process that lacks the service authorization key cannot invent an epoch, but the
service authority itself is trusted to do so honestly. That trust boundary is narrower and more familiar
than the previous root model, and it must be stated rather than hidden behind the word "witness".

#### 5.7.4 Where the ordinary device secret lives

Every live option still needs an operational signing key available without putting a passkey prompt on
every sync. The browser offers storage, not a general promise of a hardware-backed application keystore.

| Option                                    | The user sees                                                  | What it buys                                                                                               | What it does not buy                                                                                                                          |
| ----------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Extractable key bytes in IndexedDB        | Nothing                                                        | Broad compatibility; backup and transfer are mechanically simple                                           | A profile copy or same-origin script can export the key permanently                                                                           |
| Non-extractable WebCrypto `CryptoKey`     | Nothing                                                        | Prevents `exportKey`/`wrapKey` when disallowed and avoids casually serializing raw key bytes               | No hardware or encrypted-at-rest guarantee. WebCrypto permits structured-cloning a key across origins and explicitly warns that XSS can do so |
| Software key wrapped by a passkey PRF     | A platform authentication when the key must be unlocked        | The persisted wrapper is useless without an assertion from that credential; useful protection while locked | PRF is optional; its output and the unwrapped software key reach same-origin code, so live XSS still wins                                     |
| Software key wrapped by a recovery secret | A high-entropy code at enrollment and on a new or reset device | Portable across browser and authenticator ecosystems; no service can guess it if generated properly        | The user becomes the keystore; copying, phishing or losing the code has the obvious consequence                                               |
| Native or extension-backed OS keystore    | An install, extension or native-app permission                 | Can supply an OS or hardware boundary unavailable to an ordinary web page                                  | Changes the product and distribution model; does not protect an already-unlocked app from using the key                                       |
| No persisted device key at all            | Re-authenticate to obtain a fresh credential each session      | Avoids claiming that browser storage meets the bar for a long-lived key                                    | Puts a service round-trip in front of sync on every launch, and still leaves the live credential reachable by same-origin code while in use   |

The correction in the second row matters. `extractable: false` is a useful misuse guard, but it is not the
XSS containment boundary the previous draft claimed. The WebCrypto security considerations explicitly
allow a `CryptoKey` to be shared across origins with structured clone and warn that injected script may
post it to an attacker-controlled origin, which can then keep using it. The specification also makes no
normative promise that the underlying key material is hardware-backed, encrypted on disk or inaccessible
to another process with the user's privileges. **Non-extractable means one API refuses to export the raw
bytes; it does not mean the capability cannot leave.**

WebAuthn does provide an authenticator-held credential, but it is not a drop-in mutation-signing key.
Assertions are user-agent-mediated ceremonies over a challenge. The PRF extension can return a deterministic
32-byte output for the same credential and input, so the workable shape is to derive a wrapping key from that
output and unlock an ordinary device credential for use — not to invoke WebAuthn for every CRDT update.
The output is deliberately returned to the client, which is why it strengthens storage at rest without
changing the same-origin-code boundary.

> **Decided: a non-extractable WebCrypto `CryptoKey`, wrapped by a passkey PRF where the authenticator
> supports it.** Where PRF is absent the key persists non-extractable and unwrapped, and **the device list
> shows which tier a device is on** (D-18). A two-tier bar is acceptable; a silent one is not (§5.7.6).
>
> The unlock **gates sync, not the app** — the same resolution D-18 reached for revocation checks. Reading
> and writing locally never waits on it, because the local document does not need this key at all (D-34).

**This was chosen against a much smaller threat than the table above implies, and the reason is worth
stating.** After §5.7.2, a compromised device key cannot change service authorization and cannot unwrap
the content-recovery root. What it can do is read what its capability permits and write as its actor until
revoked (§5.7.1). So the question §5.7.4 is really answering is
*how much should it cost to protect a write capability that revocation already bounds* — and the answer is
"the cheap options, both of them", not "the one that changes the distribution model".

**What the PRF wrap buys, precisely.** It protects the *persisted wrapper* against an attacker who has the
browser profile but cannot produce a platform assertion — a stolen laptop, a copied profile, an OS backup.
That is §5.7.1's "copied browser profile" row, and the value is concentrated in the window *before the
owner knows to revoke*, since revocation already handles the noticed case. It buys nothing against live
same-origin code, which the specification says outright and this document has already recorded.

**And what it conspicuously does not buy: confidentiality of the document.** An attacker who copied the
profile to steal the key also copied the plaintext workspace sitting beside it, and no option in the table
above changes that. The key-storage question and the at-rest question are separate, and the second one has
never actually been decided —

**D-34. Is local user content encrypted at rest?** _(**Existence open; shape decided.** It was asserted
twice as a premise and never decided. "The local document" was too narrow — content lands in more than one
store, and the journal is on the synchronous write path.)_

> **Decided, as constraints on any affirmative answer.** Whether a device lock exists at all is open. If
> one does:
>
> - It is **opt-in per device**, never a default and never required to start using the app. Only a
>   user-held factor protects anything (a key stored beside the data travels with a copied profile), and
>   requiring one at first run contradicts D-1 and §7.
> - It is keyed from a **user-held factor** — PRF-derived or code-derived — and unlocks at cold start.
> - **Forgetting the factor loses the data**, and at Local that is total and final. Accepted knowingly,
>   on the same terms as §5.7.6's recovery code: a non-custodial promise the user cannot break is custody
>   under another name. The opt-in copy carries it.
> - It governs **every store that holds user content**, not the document alone.
>
> What remains open is only whether to build it, and the constraints above are what any *yes* must satisfy.

The two assertions are §5.7.9's forward-secrecy aside — *"the plaintext sits in IndexedDB on every device
by design — that is what local-first means"* — and §5.7.1's copied-profile row, which concedes no protection
for plaintext document data sitting beside the key. Neither is a decision. The first is a premise inside an argument about
ratcheting, and **"that is what local-first means" is doing unearned work**: local-first means the data is
on your device, not that it is unencrypted on your device.

**One thing this document implied and should retract.** PRD principle 3 does not forbid a device lock.
Principle 3 is *"offline is the normal state, not a degraded one — no spinner, no reconnecting banner"*,
which is about waiting on the **network**. A local unlock ceremony is not a network wait. What a device
lock would actually cost is §5.1.2's "never awaits a credential" — this document's own formulation, and a
weaker thing to be bound by than a PRD principle.

**The subject is local plaintext at rest, not the IndexedDB document alone**, and the difference is the
first thing to get right because it sets the size of the question. This app writes user content to
**two** places on disk today, with a third planned, and encrypting one of them is theatre:

| Store | What it holds | Where it is described |
| ----- | ------------- | --------------------- |
| IndexedDB (`done`) | The workspace document | §2.1 |
| `localStorage` journal | Each update, written synchronously so a page kill between transaction and IndexedDB commit cannot lose it | §5.6.2, TRD §6.1 |
| OPFS SQLite index | Phase 4's search index — the derived text of everything searchable. **Planned, not built**: `persistence.ts` records that it "belongs to Phase 4", and there is no SQLite dependency yet | TRD §6.2, PRD §13 |

The journal is the sharp one: it exists precisely so that content survives a crash, which means it holds
recent content by design, and it is written on the synchronous path where an async encryption step is
exactly what §5.6.2 says cannot go. The search index is the largest and holds text rather than CRDT
structure — and because it does not exist yet, it is the one D-34 can still **govern by design** rather
than retrofit, which is an argument for deciding D-34 before Phase 4 rather than after.

What is genuinely at stake, so the decision can be taken on its merits later:

- **The browser's origin sandbox is not an at-rest boundary.** It separates web origins. IndexedDB is
  ordinary files in the profile directory, readable by any process running as the same OS user, by a copied
  disk image, or through an OS backup. What protects that data today is **full-disk encryption and a locked
  screen** — the platform's job, reasonably reliable on modern defaults, and absent or disabled more often
  than one would like.
- **End-to-end encryption that terminates in a plaintext database is a real property with a sharp edge**:
  the relay cannot read the workspace and anything on the user's own machine can. D-25's honesty duty
  probably reaches this, and §5.7.1's row states it accurately but quietly.

The shape an answer would take, recorded so the question is not re-derived: opt-in per device rather than
default; a PRF-derived or code-derived key; unlock at cold start; and explicit copy about what it does not
protect, which is a running unlocked app. It interacts with **D-13** (what a reset clears), **D-18** (a
revoked device still holding plaintext) and **D-25**.

**One thing D-34 decides beyond itself, which is worth knowing before it is taken.** It settles when the
content encryption exists at all (§5.2.1). Encrypted from genesis means account creation only wraps an
existing key to a recovery root; plaintext at Local means account creation is a whole-document encryption
pass that has to be crash-safe. That is a real implementation difference falling out of what reads as a
device-security question.

**And the obvious instinct — encrypt at rest for everyone, account or not — runs into D-1 rather than
into cost.** The key has to come from somewhere, and only a user-held factor helps: a key stored beside
the data travels with a copied profile and is used by the browser in the copy, so it defeats reading the
IndexedDB files and not the threat that motivates the question. A passphrase or a passkey ceremony does
help, and asking a Local user for either contradicts *"the first run cannot ask who you are"* (D-1) and
*"Local asks for nothing, ever"* (§7) — the strongest promise in the product. **That collision is the
whole reason the shape above is opt-in rather than default**, and it means the real question D-34 answers
is not "should local data be encrypted" but "what may the app ask a Local user for, and when".

**The cost of the opt-in shape, accepted rather than discovered.** A device lock introduces a way to lose
everything by forgetting a factor, and at **Local** that loss is total and final — no service copy, no
wrapped root, no recovery code, nobody to ask, all by construction (§5.1.1). So this feature can make the
free product's one promise — your list is here and it stays here — untrue for a user who opts in and then
forgets. **That consequence is accepted**, on the same terms as §5.7.6's recovery code and for the same
reason: a non-custodial promise that cannot be broken by the user is not a non-custodial promise, it is
custody by another name. What it obliges is the copy at the moment of opting in — this is the only copy,
and we cannot open it for you either — which is D-25's third-row problem arriving at Local, where it is
harder because there is no second copy anywhere to soften it.

**Deliberately not decided here.** It surfaced at the end of a long round, it deserves its own, and
§5.7.4's selection is unaffected either way — the device key is protected identically whether or not the
document beside it is encrypted.

#### 5.7.5 What an account can add — and what it cannot add by itself

"Create an account" answers who the service recognizes. It does not by itself answer who can decrypt a
server-held document. These are the available account shapes:

| Option                                   | What sign-in recovers                                                                      | Can the service read content?                        | What a new device still needs                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Service authorization only               | Account access, authorization, the device list, current authorization head and ciphertext | No                                                   | An existing device or separate recovery factor to deliver the content root                                 |
| Non-custodial encrypted recovery         | All of the above, plus a wrapped content root                                               | No, if the wrapping factor never reaches the service | An independently available PRF-capable passkey, recovery secret or selected quorum that can unwrap the root |
| Service escrow                           | Everything after the service accepts the recovery proof                                    | **Yes, in capability if not in routine operation**   | Nothing else; the same capability that makes recovery smooth lets the service or its compromise decrypt     |
| Account-authorized, device-approved data | Account access authorizes the device; another device must approve content access            | No                                                   | A surviving content-holding device every time; the account improves identity and revocation, not recovery   |

The first and fourth rows make a subtle product promise: **hosted durability would mean durable ciphertext,
not guaranteed recoverability.** That can be a coherent product, but only if D-25 says it plainly. The
second row is the only shape that combines all-device-loss recovery with a server that cannot decrypt,
and it therefore pushes all of the problem into the recovery factor. The third is operationally familiar
and cryptographically contrary to D-20's recorded consequence that server-side content reading is gone;
choosing it reopens D-20 and the content-authority half of D-14.

A passkey used only to authenticate to the account is the first or fourth row, not the second. WebAuthn
sign-in proves control of a credential to the service; it does not materialize the document key. The PRF
extension is what makes a passkey potentially useful for non-custodial decryption, and that is a separate
capability with separate support and recovery properties.

> **Decided: non-custodial encrypted recovery — row 2.** The content root is wrapped to a factor the
> user holds. The service never receives that factor and never holds plaintext, so it cannot decrypt a
> workspace whatever proof it is shown and whatever it is ordered to do.
>
> Rows 1 and 4 are **rejected**: both foreclose all-device-loss restore, including D-33's migration from
> an independently held archive, and both put D-25 in the position of saying *we cannot recover your
> data* at account creation — which §5.7.7 already identifies as the harder copy problem, not the easier
> one. Row 3 is **rejected by construction**, for the reason below.

**Why service escrow is excluded, and why the reason is not cryptographic taste.** The objection is not
that escrow is inelegant; it is that a decryption capability is a *compellable* capability. A service that
can turn a customer's ciphertext into plaintext can be ordered to, and the order arrives with a gag
attached. Escrow's convenience and its liability are the same mechanism seen from two directions, and no
amount of internal policy separates them — policy is exactly what a court overrides.

**The opt-in variant deserves its own rejection, because it is the form the idea comes back in.** Making
escrow per-user and optional does preserve the default: a demand naming a user who never opted in cannot
be satisfied, and that is a real property rather than a rhetorical one. But it degrades the answer in two
specific ways that are easy to miss.

1. It converts an **architectural inability** into a **per-user policy**. *We cannot* and *we cannot for
   this one* are different answers under pressure, and only the first survives an adversary who is
   patient.
2. The client code that wraps a root to an escrow key ships to **every** user. Enabling it for someone who
   did not opt in becomes a configuration change rather than an attack. §5.7.1's last row already concedes
   that hostile code at the app's origin defeats everything — but escrow makes that a one-line flip with a
   key already waiting at the receiving end, which is a materially different posture from *the receiving
   end does not exist*.

> **Recorded: an escrow add-on may be built, opt-in, and it must not be operated by the legal entity that
> operates the service.** Its scope is the **content root only** — it holds a wrap of the content root and
> nothing else. It may not admit or revoke credentials, change capabilities, sign authorization state or
> operate the account (§5.7.2).

**The separation is a security property, not liability arrangement.** Split across two entities, the
service holds ciphertext and a root wrapped only to the user's code; the escrow agent holds a root wrapped
to the escrow key and no ciphertext. **Neither party alone can produce plaintext** — the service's wrap
opens only for the user, so a demand against it yields ciphertext and a blob, and a demand against the
escrow agent yields a key with nothing to apply it to. Compelled disclosure therefore requires two demands
against two entities, potentially in two jurisdictions, and either one failing leaves the plaintext
unreachable. That
is a substantively better position than one company holding both halves and promising not to join them.

**And on building it early rather than when it is asked for**, which is the part that looks like
over-engineering and is not: the situation that produces demand for escrow is an enterprise buyer with an
administrative-recovery requirement, mid-sale. Designing custody for the most security-sensitive code path
in the product under contract schedule pressure is the worst available condition for that work. The
choice is not *build it now* versus *build it never* — it is *build it deliberately* versus *build it
hurriedly, later, badly*. Recording the boundary now costs a section; discovering it during a sale costs
the boundary.

#### 5.7.6 Recovery: four objects and nine options

Recovery is where the previous framing was least complete. Four different things may be missing:

1. **Account access** — can the service recognize the person again?
2. **Authorization** — will the service admit the new credential as a legitimate member/device and
   establish a new epoch?
3. **Content-key access** — can it decrypt the current and stored document generations?
4. **Ciphertext availability** — does any copy of the encrypted document still exist?

No mechanism below supplies the fourth unless another device, an export or the hosted service actually has
the bytes. A recovery code cannot recover a document that no longer exists; a server backup cannot recover
one whose only decryption root is gone.

**Artifacts count by independent failure domain, not by name.** A lost phone commonly takes its device
credential, a device-bound passkey, its local ciphertext and any recovery text saved on that phone with
it. Those are four artifacts but one loss event. A recovery path counts here only if it remains available
after the loss it is supposed to recover from; several wraps synchronized by one credential ecosystem are
similarly not several independent paths.

| Recovery option                               | Restores                                                                                     | The user sees                                           | Failure / attack implication                                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A surviving authorized device                 | Content keys; ciphertext too if that device has it                                           | Transfer or approve from the old device                 | The service separately authorizes the replacement. No all-device-loss recovery; compromise exposes that device's content and capability |
| A synced copy of the same PRF-capable passkey | Account access and potentially the wrapped content root; ciphertext only from another holder | Platform passkey selection                              | Counts only if the passkey remains available after device loss; its ecosystem's compromise and recovery enter this threat model          |
| A separately enrolled passkey                 | Account access; content root only if it was separately wrapped to that credential            | Choose a backup passkey/security key                    | PRF output is per credential, and a passkey bound to the lost device is not a backup                                                     |
| A random saved recovery secret                | Content root; ciphertext only from another holder                                            | Save a long code or QR, then present it during recovery | A bearer secret: phishable, copyable and losable. A copy kept only on the enrolled device is not recovery                                |
| A password or passphrase                      | Whatever the design lets a derived key unwrap                                                | Remember and type a secret                              | A server copy permits offline guessing against wrapped data; an ordinary human password cannot simply be treated as a content key       |
| Email, support or another service proof       | Account access and, through it, service authorization                                         | Recovery message, delay or support process              | Becomes the weakest account-takeover path. Cannot reconstruct a non-custodial content key unless an escrow holder also cooperates        |
| Service escrow                                | Content root; account and authorization still follow the service's recovery policy            | Familiar account recovery                               | The escrow holder is a decryption principal. If it is the service, breach or compulsion reaches both halves                             |
| Threshold / combination of factors            | Whatever content root was split or multiply wrapped                                          | Two-of-three devices, passkeys, codes or contacts       | Only independent factors add resilience; one shared failure domain still counts as one, and thresholds add a lockout mode               |
| No recovery                                   | Nothing beyond surviving local copies                                                        | An explicit warning and preferably a verified export    | No separate recovery principal holds a root; losing the last live root makes a hosted ciphertext copy permanently unreadable            |

There is no honest "forgot password" flow for a content key that the service cannot recover. Email may
prove control of an account and a server may then authorize a fresh device, but neither fact conjures the
old content root. If a fresh device can decrypt after email alone, the service had enough capability to
make that happen and the design is custodial in the security sense, whatever the UI calls it.

**PRF's optionality produces a product branch, not a compatibility footnote.** If non-custodial account
recovery selects PRF, an authenticator that reports no PRF result has to land somewhere explicit:

| Unsupported-PRF policy                | What happens                                                                | Implication                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Require it                            | Account creation or encrypted recovery is unavailable on that authenticator | Clean promise, narrower device/authenticator support                                             |
| Fall back to a saved recovery secret  | Account works after the user stores and confirms a code                     | Portable and non-custodial; adds the largest deliberate security interaction in the product      |
| Fall back to existing-device approval | Account works, but a new device cannot decrypt after all devices are lost   | Preserves confidentiality; downgrades "durability" to durable ciphertext                         |
| Fall back to browser-stored key       | The device works with a visibly lower storage-assurance level               | Preserves reach but makes the security bar device-dependent and must not be a silent downgrade   |
| Fall back to service escrow           | Recovery works through the account                                          | Changes who can decrypt and therefore changes the product promise, not merely the implementation |

> **Decided: the content-recovery root is wrapped 1-of-N, and a high-entropy recovery code is the
> mandatory floor.**
>
> - At account creation the content root is wrapped to a **high-entropy code the user saves outside the
>   enrolling device**. Every account has one, and there is no account without one. Enrollment requires
>   the user to **re-enter the code from wherever they put it** before the account completes.
> - **Additional independent wraps may be added** — PRF-capable passkeys, preferably in more than one
>   ecosystem. Each is a complete path to the same root only if it remains available after loss of the
>   device it protects.
> - This is **1-of-N, not k-of-n**. No threshold, no quorum, no lockout when a threshold cannot be met.
> - **Rejected as root-wrapping factors:** a password or passphrase, because server-held wrapped data
>   permits offline guessing; email or support proof, because §5.7.6's own prose shows it is escrow
>   wearing a different label; and threshold splitting, which buys nothing over 1-of-N at this scale
>   while adding setup, explanation and a new way to be locked out.

**What that re-entry actually establishes, since an earlier version of this decision claimed more.** It
said enrollment must confirm "an independently available copy", which is not a checkable property: a user
who pastes the code into a note on the same phone passes every test the app can run, and that is precisely
§5.7.2's five-artifacts-one-failure-domain case. **Re-entry proves transcription and possession — that the
code was recorded accurately and the user can reach it right now — and nothing about where.** Saying so is
not a weakening; it is refusing to let a mechanism take credit for a property only the copy can carry.

**Which puts the weight on the copy, and is the argument for one specific interface choice.** The moment
of generation is the only moment the user is thinking about this, so it is where the *where* has to be
said, in the terms that make it concrete — not on this device, not only in this browser, somewhere you
would still have if this device were stolen tonight. And the app should assume it failed: §5.7.2 already
treats a phone and everything bound to it as one loss event, so the device list, the recovery surface and
D-25's copy should all be written for a user whose "independent" copy is on the device in their hand. The five-row table above exists
because PRF was assumed load-bearing. Under a mandatory independently saved code it is not: an
authenticator that returns no PRF result costs its owner an optional convenience wrap and nothing else.
No branch, no device-dependent security bar, no silent downgrade — which were the three things that table
was trying to protect against. **The row it would have selected is "require it"; the reason it needn't is
that recovery does not depend on it.** A device-bound PRF wrap may still protect that device's persisted
key without being counted as an all-device-loss recovery factor.

**And one artifact that is not a recovery factor, recorded because a draft of this document treated it as
one.** The verified encrypted fidelity archive (§5.11.5) answers **object 4** — does any ciphertext still
exist — and never **object 3**. Encrypted to the root it needs the root to read; carrying the root wrapped
to the code it needs the code; carrying the root unwrapped, the file *is* a bearer secret with the code's
failure modes, larger and likelier to be kept in a cloud drive. It improves **durability** and
**portability**, not **recoverability** — the exact distinction §5.1.2 exists to hold. It stays in D-33's
package on its own merits, doing its own job.

**What this leaves genuinely unserved, said plainly rather than engineered around.** A user who will not
take custody of anything has no non-custodial recovery path — not from a second code, not from a second
passkey, not from an archive. That is not a gap in this design; it is what non-custodial *means*. The
answer for that user is the opt-in escrow add-on of §5.7.5, operated by a separate entity, and it is the
only honest answer that exists. Every product that appears to serve that user without escrow is either
custodial and not saying so, or is about to lose someone's data.

#### 5.7.7 What the options do to the promise

**This subsection used to be about what D-17 does to the ladder, and D-16 emptied it of that job.** The
third row of the old table — "an app account is required for every networked workspace" — was the outcome
D-17 was feared to force, and the product chose it first, for cost and honesty reasons, before the
security research arrived. So no remaining selection can collapse a level, reopen D-19 or D-23, or move
the Local/Account boundary. **D-17 can no longer change the shape of the product; it can only change what the
Account level is able to promise** — a much smaller blast radius, and the reason this decision stopped
being the largest branch in the document.

What the selection moved is **recoverability**: one row of §5.1.2's property table, and the one that was
marked undecided until §5.7.5–§5.7.6 closed. It is now decided, and this table records what was chosen
against what was refused rather than presenting a live menu.

| Shape                                    | What Account would buy                                                                  | Disposition                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Non-custodial saved-code recovery**    | Recovery after losing every device, without the service ever holding plaintext            | **Selected.** Adds a first-class enrollment and recovery flow; D-13 must distinguish sign-out from destroying roots  |
| Content recovery remains device-approved | Server availability, sync and revocation — **durable ciphertext, not recoverability**     | **Rejected.** Forecloses all-device-loss restore and makes D-25 say *we cannot recover your data* at account creation |
| No recovery                              | Redundant storage, not protection from losing every decryption root                       | **Rejected**, same grounds, more starkly                                                                            |
| Service escrow                           | The smoothest recovery, with the service as a decryption principal                        | **Rejected by construction** (§5.7.5). Survives only as an opt-in add-on operated by a separate legal entity        |

**One consequence of D-16 lands on the selected row rather than the rejected one, and it did not go away
with the rejection — it moved.** An account-holder may reasonably read "your data is on our servers" as
a recovery promise, whatever the account costs. Under a device-approved shape the burden was to explain an absence; under
the selected shape it is to explain a **dependency**: the copy on our servers is recoverable *by you, with
the code you saved*, and by nobody else including us. That is a better sentence to have to write, and it
is still a hard one. **The test is unchanged: it is a coherent product only if D-25's language survives
contact with someone who has just lost their only phone** — and now the interesting case is the person who
lost the phone *and* cannot find the code, for whom the true answer is that the data is gone. D-25 must
be able to say that without having implied otherwise at signup.

**Which promotes one interface question out of the "live sub-questions" list.** If the code is the only
thing between an account-holder and permanent loss, then how it is generated, confirmed and replaced is
not a detail of the recovery flow — it is the recovery flow. **Re-display and replacement are different
operations:** re-display requires retaining a recoverable copy of the code somewhere, while replacement
can re-wrap or migrate the content root from a device that already has content access. Whether that latter
operation is allowed, and what fresh account authentication it requires, remains with D-18's compromised-
device analysis. Calling it "recovery" would hide the distinction that resolved §5.7.2.

#### 5.7.8 What would count as evidence

A threat table still does not make the claim true. The contract needs conformance tests for its own
invariants and a declared level of independent scrutiny. At minimum, the following are test cases rather
than prose:

1. A client with only an endpoint and workspace id cannot retrieve usable content or add an accepted
   envelope.
2. A relay token cannot be used as a mutation credential, content-wrapping key or recovery proof; expiry
   and refusal do not block local use.
3. Changing the workspace id, actor, capability, epoch, ciphertext or update digest invalidates an
   envelope; an envelope cannot be replayed into another workspace.
4. A client that has witnessed epoch _n_ rejects an ancestor as current, and the server serializes
   successor commits so that two concurrently produced successors resolve to one accepted epoch with the
   loser refused rather than forked (S49).
5. After a committed revocation — authorization successor, key rotation and finalized accepted-log cutoff —
   the removed credential cannot decrypt a new generation or create a newly accepted write, while its
   historical local copy remains usable.
6. **A hostile relay withholds an envelope signed by the revoked credential that is absent from the
   committed accepted set, then delivers it after revocation; every client refuses it.** An envelope from
   that credential included in the pre-commit accepted set is still admitted, as is a genuine late-arriving
   old-epoch update from a still-authorized offline device (§5.2.3).
7. **Authorization alone cannot cause content-key delivery.** A malicious authorization service admits
   a credential it controls and presents a valid successor epoch; every existing client refuses to wrap
   or send a content key without a separate user-mediated content-delivery proof (§5.7.2).
8. **A workspace is migrated, not succeeded, with the original service unreachable.** A clean device
   restores independently held ciphertext using the content-recovery factor, creates an account at a
   replacement service under a new authorization lineage, and then admits and revokes a device. Nothing
   claims that the new service inherited the old service's authority (§5.11.4).
9. A relay or durable-store snapshot contains ciphertext, public authorization material and the
   explicitly accepted metadata — no **unwrapped** content root, plaintext, reusable device secret, PRF
   output or recovery code. A content root wrapped to the user's code may be present and is not a finding;
   what the test checks is that nothing in the snapshot opens it (§5.10.1). The authorization service has
   its own signing key and account state, and no material that unwraps a root. **Repeated against the
   escrow agent's store, which must contain a root wrapped to the escrow key and no ciphertext** — the
   two-party property of §5.7.5 is real only if neither store alone is sufficient, so each store is tested
   for what it can *open*, not for what it holds.
10. Every recovery path is exercised after loss of one device, all devices, a device-bound passkey, an
    independently synced passkey, the account session and the service. The result is checked separately
    for all four recovery objects. A device plus every artifact stored or bound only to it is treated as
    one correlated loss; loss of every independent content factor is an expected permanent-loss outcome,
    not a bug.
11. Unsupported PRF, interrupted enrollment, duplicate recovery, concurrent authorization changes and a
    half-completed account deletion fail closed without silently changing the confidentiality promise.
12. Mutation verification and first-sync checkpoint verification meet the latency and history-size budgets
    in §5.6.2 without moving cryptography onto the keystroke or local-replay path.
13. The web application is verified as part of the cryptographic boundary: no unreviewed third-party script
    executes in the key-holding origin; injection controls, CSP, Trusted Types where supported, dependency
    integrity, service-worker update integrity, cookie attributes and WebSocket origin checks are tested.

The last row is unavoidable because **same-origin code is inside the end-to-end boundary.** A passkey is
phishing-resistant because it is bound to the relying-party origin; it does not distinguish the intended
app from hostile script served at that legitimate origin. The baseline can be tied to a named, versioned
standard such as the applicable OWASP ASVS 5.0 requirements, but that standard does not review a novel
authorization or CRDT-envelope protocol.

The available assurance levels are cumulative:

| Option                                  | Evidence produced                                                                                    | Implication                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Project-owned threat model and tests    | This contract, protocol vectors, negative tests and CI controls                                      | Necessary and cheapest; the same team that designed the protocol is also judging its omissions                    |
| Versioned web-security baseline         | A recorded ASVS profile and repeatable verification of every applicable requirement                  | Makes "the OWASP basics" concrete; still says little about the bespoke cryptographic protocol                     |
| Independent protocol design review      | Review of authorization, key delivery, envelopes, epochs, rotation, recovery and downgrade handling   | Catches architectural errors before implementation; does not prove the implementation follows the reviewed design |
| Independent implementation audit        | Review and testing of the shipped client, relay and deployment against the contract                  | Strongest launch evidence here; costs money and has to repeat after security-boundary changes                     |
| Ongoing disclosure and response program | A vulnerability-reporting path, rotation/recovery runbook, dependency monitoring and incident drills | Treats security as an operating property; cannot compensate for an incoherent root or recovery model              |

> **Decided: levels 1–3 before network sync ships, level 5 live from the day it ships, level 4 on a
> stated trigger.**
>
> - **Before sync ships:** the project-owned threat model and conformance tests; a recorded, versioned
>   ASVS profile; and an **independent protocol design review**.
> - **From the day sync ships:** the disclosure and response program. A vulnerability-reporting path that
>   does not exist when the first report arrives is the cheapest possible thing to get wrong.
> - **Level 4, the independent implementation audit**, is required before either of two triggers: the
>   phrase *end-to-end encrypted* appearing in marketing copy, or the escrow add-on holding a real key.

**The sequencing constraint is real and it is not schedule padding.** D-28 now names the architecture a
protocol reviewer will review, but level 3 waits until the TRD supplies concrete authorization state,
envelopes, key rotation, finalization and test vectors. Booking a design review of product-level boundaries
alone still buys an opinion about a sketch.

**Why level 4 is triggered rather than required at ship**, which is the row most likely to be read as
corner-cutting: an implementation audit has to repeat after security-boundary changes, and several are
still pending — D-34, the escrow add-on and D-32's evolving as-built data flows each move a boundary.
Buying the audit before
those settle purchases evidence about a system that will not be the shipped one. The triggers are chosen
so that the audit lands before the two moments where its absence would make a claim dishonest rather than
merely unproven: saying the words, and holding someone else's key.

**All five of D-17's selections are now recorded.** The service is the sole authorization authority and
migration starts a new lineage (§5.7.2–§5.7.3); the account's relationship to the content root is
non-custodial encrypted recovery (§5.7.5); the recovery factor is a mandatory, independently saved
high-entropy code with optional independent wraps (§5.7.6); the device key is a non-extractable
`CryptoKey`, PRF-wrapped where available (§5.7.4); and the assurance bar is above.

**The authority and recovery selections were made together because authorization and decryption must not
silently collapse into one power.** The familiar account path can replace a lost device and revoke the
old one without keeping an authoritative device online. It cannot deliver content merely because the
service authorized the replacement. The user-held factor does that second job, and migration — not an
offline administration key — covers service disappearance.

**And deciding them surfaced a question this document had been assuming rather than answering**, which is
recorded as **D-34** (§5.7.4): whether local user content is encrypted at rest, in any of the three
stores that hold it. It is not a D-17
selection and does not gate the contract, but it is the last place where "end-to-end encrypted" and what
a user would understand by it can still come apart.

#### 5.7.9 The common core beneath the options

The previous draft said a menu of options was the wrong output and then fixed a passkey PRF into the
answer. That skipped the product choices above. What Keyhive, `@localfirst/auth` and the passkey ecosystem
actually supply is a common **shape** with swappable roots and recovery factors. Each piece still needs
review by someone who does this professionally before it is built; the value here is knowing what the
review is reviewing.

| Piece                                                          | Its job                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Separate signing and key-agreement credentials per device      | authenticate its writes and receive content keys; storage protection is §5.7.4's choice    |
| The same separation per agent member                           | authenticate an agent without pretending it is a device; receive keys only if read-capable |
| Separate authorization and content-delivery proofs             | let the service admit a device without thereby causing a client to deliver or wrap the content key |
| A signed chain or log of authorization operations              | bind memberships, credentials, capabilities, actors and content-key generations            |
| A service-held authorization signing authority                 | extend and order that chain; sign admissions, revocations, capabilities and accepted-set finalization (§5.7.2) |
| A symmetric content key, wrapped per reader credential         | encrypt the document; rotation on lost read access is D-20                                 |
| A high-entropy recovery code sealing the content-recovery root, 1-of-N with optional independent passkey wraps | restore content keys under the non-custodial promise selected in §5.7.5–§5.7.6 |
| A scoped, expiring relay bearer token                          | let the relay decide who connects without granting document authority                      |

Two notes on that last row, because it is the one that connects to the cost model. Attenuable capability
tokens — fly.io's macaroons are the well-known instance — carry their own caveats and are verified by
signature rather than by lookup, which is the "relay decides who connects with little server state" shape
that keeps hosting cheap (D-31). The unavoidable catch is the one already recorded in §2.3: statelessness
and revocation-before-expiry are in tension, so short expiry plus refresh is the usual landing place — and
D-18 makes revocation load-bearing, so the tension is real rather than theoretical.

**And one thing not required by the current promise: forward secrecy.** Signal's ratcheting protects past
messages after a later key compromise. Here a read-capable device must be able to materialize the current
workspace, including its accumulated content, whether that state is persisted as plaintext today or later
placed behind a D-34 device lock. A per-update ratchet therefore does not hide the current workspace from
an attacker controlling an unlocked authorized device. It should not be built by default; a future,
stronger historical-confidentiality claim would have to reopen the question explicitly.

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
reconnect" — gossip is the obvious next step and is probably overkill at this scale; and whether signing
out revokes this device's credential or merely stops using it (D-13). That last one is a choice rather
than a constraint: the credential *is* revocable at the service (§5.7.2), so both labels are honest and
the question is which behaviour the button should have.

The device list this produces is the same artifact D-19's enrollment ends at and the same one §1.4 calls
the irreducible security surface. **It is no longer deferrable, and D-16 is why.** An earlier draft
suggested pairing could ship before a device list existed, since there was nothing stored on a server to
protect. After D-16 the first device to enroll is also the first byte of ciphertext on a server, so the
list and the thing it protects arrive together.

### 5.8 Prior art worth watching

The problem of authentication and authorisation for local-first CRDTs is being actively worked on, and
not in the Yjs ecosystem. **Ink & Switch's Keyhive** is the serious effort: capability-based access
control designed for partition tolerance, with read/write/admin modelled as chains of signed
delegations, group membership derived from those chains, revocation by the delegator, and an
integration into Automerge Repo as an auth provider. The interesting part for this document is that it
is designed so that _the server does not have to be the authority_ — capabilities travel with the data.
That solves the harder service-independent authorization problem this product has now rejected, while its
credential separation and signed-operation patterns remain useful prior art.

**And there is a second project that is closer to the retired accountless authorization flow than
Keyhive is.**
`@localfirst/auth` (Herb Caudill; formerly Taco) does decentralised authentication and authorisation from
a chain of signed cryptographic operations, explicitly for apps that do not want to depend on a
centralised authentication server or key-management service. The parts that map directly onto decisions
here: **device-level keys held in each device's own storage**, and **invitations via a Seitan token
exchange**, where an invitee proves they were invited without revealing the invitation secret and any
existing member — not only an admin — can validate the proof. This product does not adopt that invitation
as authorization: the service admits the device (D-19, §5.7.2). Its ceremony and credential-separation
patterns may still inform the optional device-to-device content-key delivery step.

Three implications, none of which is a decision:

1. **Both are Automerge-adjacent, not Yjs's.** Keyhive integrates with Automerge Repo, and
   `@localfirst/auth` ships an Automerge Repo provider. Nothing equivalent exists behind this app's seam.
   Their authorization patterns remain useful prior art, but adopting either integration would buy
   decentralized authority the product no longer needs (§5.7.2) at the price of a CRDT migration.
2. **The protocols are more portable than the integrations.** Signed operation chains and token-based
   device ceremonies are not Automerge-specific ideas; only the plumbing is. They remain useful prior art
   without importing decentralized authorization into the selected service-authoritative design.
3. **Watch rather than wait.** The principal/device work in this document does not depend on either, and
   D-14's selected "partly" boundary does not require their decentralized authority.

#### 5.8.1 What carries the authorization protocol — D-28

**D-28. What carries authorization around encrypted Yjs updates?** _(Decided.)_

The old four-way choice was inherited from a model in which authorization might have to survive without
the service. §5.7.2 removed that requirement. Once the service is the sole authorization authority, the
tractable shape is neither a decentralized capability system nor a schema-aware server: it is a narrow
service-authoritative control plane around an end-to-end-encrypted Yjs data plane.

> **Decided: keep Yjs and add a service-authoritative envelope protocol around it.** The service owns
> account authorization and signed authorization state. Clients own content keys, encrypt Yjs updates,
> sign their envelopes and verify authorization and finalization evidence. The relay and durable store
> handle only opaque envelopes and authenticated metadata. No service component parses document content
> or receives a content key.

The boundary is easiest to see by component:

| Component | Responsible for | Must not become |
| --------- | --------------- | --------------- |
| **Authorization service** | Authenticate the account; admit and revoke device/agent credentials; assign capabilities; sign and serialize authorization epochs; issue authenticated acceptance/finalization evidence | A content-key holder, mutation signer or Yjs semantic authority |
| **Client envelope layer** | Encrypt outbound Yjs updates; bind workspace, epoch, credential and digest in the clear and **the attributed actor inside the seal**; sign envelopes over both; verify inbound authorization, signatures and acceptance evidence; wrap and rotate content keys | A second authorization authority, a network dependency on the local edit path, or a source of actor-level metadata for the relay |
| **Relay and durable store** | Authenticate transport; validate opaque envelope fields, authorization epoch and signatures; sequence and store ciphertext; carry service-signed acceptance evidence | A plaintext processor, CRDT merger or source of authorization by itself |
| **Yjs** | Represent and merge document content locally after an envelope has passed verification | An identity, authorization or recovery system |

This is still a bespoke **protocol integration**, and the distinction matters. The project owns the
message schemas, state transitions, downgrade rules, key rotation and finalization construction. It does
not invent cryptographic primitives, distributed authorization or a new CRDT. Standard reviewed
signatures, authenticated encryption and key-wrapping constructions are inputs; §5.7.8's independent
design review evaluates how they are composed.

The alternatives are rejected for reasons the later decisions make sharper:

- **A decentralized Yjs authorization system** solves service-absent lineage continuity, which migration
  deliberately does not promise, while retaining the largest bespoke problem.
- **The Automerge-adjacent stack** buys that same decentralized authority through a CRDT migration.
- **Schema-aware server enforcement** gives the service content authority and breaks D-20's
  confidentiality boundary.
- **Reducing D-27 to advisory attribution** gives up the accountability property the agent case requires.

**Where the seal falls is a product constraint, not a TRD preference.** An earlier version of the table
above bound the actor alongside the workspace, epoch and credential without saying which side of the
encryption it sat on, which would have handed the relay a per-write record of *who* — human or agent,
which member — for a workspace whose whole point is that the relay learns nothing. **D-14 already
forecloses that**: its selected boundary lists what the relay may validate as workspace, epoch,
credential, signature, replay and revocation, with attribution explicitly reserved to clients. So the
actor binding goes inside the seal, verified by the clients that can already decrypt, and D-27's
invariant is unaffected — attribution is checked by whoever reads the content, which is exactly who is
entitled to check it.

**What that does not buy, and an earlier version of this paragraph claimed too much.** It said sealing
the actor stops the relay knowing *who* wrote. It does not. The relay sees a **credential identifier** per
envelope, because it validates per-credential authorization and cannot do that blind — and the
authorization state it validates is precisely what binds credentials to members and capabilities (§5.5).
So a relay that can read the epoch can generally map credential to member, which means it can tell a
device's writes from an agent's whether or not an actor field is present.

**What sealing the actor actually achieves is narrower and still worth having:** no actor identifier
crosses in the clear, so the relay is left inferring from authorization state rather than reading a label,
and a workspace whose membership it has not seen change is correspondingly harder to attribute. The honest
claim is **"the actor is not directly present in envelope metadata"**, not "the relay cannot tell who
wrote".

**Buying the stronger property would mean an unlinkable credential-to-member boundary** — the relay able
to verify that a writer is authorized without learning which member it is. That is a different and much
larger cryptographic commitment than anything else in this document, nobody has asked for it, and it is
recorded here as the thing that would be required rather than quietly implied by a weaker mechanism.
Traffic analysis at credential granularity — write times, rates, volumes — remains visible either way and
is unavoidable given D-14's "partly".

**What remains is TRD work, not another product branch:** credential and algorithm selection; the exact
authorization-state and envelope formats, including which fields are associated data and which are
sealed; batching; key wrapping and rotation; receipt, accepted-log or
checkpoint finalization; downgrade and interrupted-rotation behavior; and concrete test vectors. TRD
§10.1's planned Yjs v13 → v14 migration does not supply any of these, but neither does this decision make
the CRDT migration larger than it already was.

### 5.9 Raised in review — D-29, D-30

Two decisions this document needed and did not have. Placed at the end rather than folded into the
sections they touch, so that the existing numbering and landmarks stay where they were.

**D-29. What happens if D-31 later gives an account a paid plan that lapses?** _(S51, S52, S53.)_

The account service is the sole authorization authority (§5.7.2), and S36 establishes that retiring its
lineage ends synchronization between a person's devices. If D-31 later selects subscription pricing, a failed payment must not become an event
that severs a person's devices from each other and starts two histories diverging — the worst possible
outcome delivered to the least attentive moment.

> **Decided conditionally: a grace period, then read-only.** If a paid plan exists, a lapse does not retire the authorization lineage and does
> not touch the enrolled devices. During the grace period everything continues. After it, the account goes
> **read-only**: the server-held copy is retained and readable, server-intermediated sync stops, and the
> devices keep working locally exactly as they always did, because nothing on the read or write path
> ever awaited a credential (§6).
>
> **Retention covers the wrapped content root on the same terms as the ciphertext**, because retaining
> one without the other is retention that recovers nothing. **Resuming is not recovery**: a user who
> starts paying again from a device they still have simply resumes sync, presenting no code and
> performing no ceremony. The code is needed only if every device is gone as well — and that path has to
> keep working for as long as the copy is retained, or read-only is a state in which the service holds
> the user's bytes and cannot give them back.

Four things that follow and should not be rediscovered later:

- **Read-only means the service's copy, not the app.** PRD principle 3 is not negotiable, and a lapse is
  a billing state rather than a network state. The app is fully writable on every device throughout.
- **Retention has to be a stated number**, because "retained" without a duration is a promise nobody can
  plan around, and D-25's durability copy depends on it. The number bounds two different things at once —
  how long resuming restores the hosted history, and how long a total-device-loss recovery remains
  possible — and it is the same number for both, since both need the same retained objects.
- **What expiry ends is the hosted copy, not the account.** When retention runs out the ciphertext and
  the wrapped root go together, and a user who resumes after that is an account with no server-side
  history: their devices' replicas are the workspace, and D-5 decides which one. This is the one moment
  in the lapse path that destroys something, so it is the one that has to be said in advance rather than
  discovered — the same honesty D-24 requires before account deletion, at the same kind of boundary.
- **Deliberate downgrade (S53) is the same mechanism**, and it is the case that must not silently
  become S36's account deletion. Stopping payment and deleting an account are different acts with
  different consequences for service authorization and hosted retention, and the interface has to keep them apart.

**And D-16 gave this conditional decision a floor it did not have.** Where a lapse ends, the user is in **Local** —
which is now a complete, permanent, supported product rather than the bottom of a ladder they have fallen
off. That materially improves what a lapse means: not a degraded state, but the free product, with export
available on every device.

**With the same correction D-24 needs: each device retains its _last local replica_, not a full copy.**
A device offline across the lapse holds what it had when it last synced and will never receive the rest.
This is a second reason the grace period is a real mechanism rather than a courtesy — it is the window in
which stale devices can still converge — and a reason retention should outlast it, so that a device
reappearing shortly after the deadline is not silently short of a month's work.

One thing must still be said out loud when sync stops, because Rule 2 requires it and because it is the
part a user will not infer: **from that moment the devices stop converging, and each one's edits are its
own.** If the subscription resumes later, D-5 applies: whichever device the workspace continues from
keeps its history, and the others are told what they are about to lose and offered the export. Silence
about the divergence would let someone believe their phone and laptop were still one list for weeks after
they stopped being one — and then lose the difference without warning.

**D-30. Does Rule 1 have exceptions, or the wrong formulation?** _(Decided.)_

**The case that raised this has been withdrawn.** Rule 1 says the user never manages workspaces; v14's
D-5 then required them to adjudicate two document histories with a preview and four choices, which was
workspace management at its most demanding. v15's D-5 removes that flow entirely — the workspace's
history wins by rule, and the user confirms a loss rather than choosing an outcome (§1.4).

> **Decided: Rule 1 stands as written — the user never manages workspaces.** A workspace remains a real
> architectural object: one document plus its authorization boundary. The product exposes the intentions
> that act on it — devices, access, account recovery, export, import and migration — without asking the
> user to name, select, reconcile or administer workspace containers.

The security corollary is not an exception. Revoking a phone is device and access management; saving a
recovery factor is recovery; confirming replacement of a joining device's local history is consent to an
irreversible data transition. Each changes workspace state underneath, but none requires the user to hold
a workspace model. D-5 is the proof: once the product supplies the rule that selects the history, the
workspace-management UI disappears and only the consequence needs explaining.

Rule 1 would need reopening if the product introduced multiple visible workspaces and asked a person to
name, choose between, move among or administer them. Current architectural capacity for multiple
memberships does not do that; the revealed product remains one home workspace/document (§5.4.1).

### 5.10 The service data boundary — D-32

**D-32. What may the service retain, observe and do to an account or workspace?** _(Decided in
principle; inventory evolves with the TRD and implementation.)_

The previous draft required a complete service data and operations contract before the service
architecture was implementation-ready. That reverses the dependency: the concrete stores, queues, logs,
backups and processors do not exist until the TRD and implementation choose them, so an exhaustive prior
inventory would be speculative and would immediately drift. Building first and surveying only at the end
is also too late where storage topology has already made deletion, isolation or least privilege expensive.

> **Decided: fix the irreversible data-handling constraints now; maintain a living inventory as the TRD
> and implementation introduce data; review the as-built inventory before external availability.** The
> inventory is a view of the architecture, not a second architecture document, and it does not block
> beginning the TRD.

#### 5.10.1 Constraints that precede the TRD

These are product and architecture boundaries, not an attempted inventory:

1. **No synchronization, account or authorization component receives document plaintext, a content key
   or a recovery factor.** A wrapped content root and ciphertext are not exceptions; the factor that
   unwraps them remains with the user or the separately operated escrow add-on (§5.7.5). A user may still
   deliberately send exported content to someone, including support; that is an explicit disclosure, not
   a decryption capability in the service.
2. **Every subject-bearing persisted record has a deletion scope.** Account-, workspace-, device- and
   credential-related data must be attributable to the subject whose deletion, export or correction acts
   on it. Aggregated operational measurements must not quietly retain subject identifiers.
3. **No reusable credential or recovery secret enters logs, telemetry or support artifacts, and no
   plaintext document content is collected there automatically.** Diagnostics use an explicit allowlist
   rather than attempting to redact arbitrary objects after collection. User-supplied support material is
   an explicit, separately scoped disclosure with its own retention rule.
4. **Service suspension and service-side deletion never disable an existing local replica.** Deletion can
   remove service-held material and future access; it cannot recall bytes already copied to an offline
   device or agent (D-20, D-24, D-29).
5. **Operator powers are explicit, least-privilege and auditable.** Support may diagnose service state but
   cannot bypass content encryption; authorization changes, suspension and exceptional access to account
   metadata leave an audit record.
6. **Presence is not accidentally durable.** Awareness metadata is encrypted, kept ephemeral, or given an
   explicit purpose and retention rule; it must not inherit the retention of workspace ciphertext merely
   because both pass through the relay (D-20).

These are the things expensive to retrofit. They constrain the TRD without prescribing its service split,
tables, vendors, retention durations or backup mechanism.

#### 5.10.2 The inventory follows the architecture

As a store, queue, log, telemetry event, backup or processor is introduced, its design record adds one
compact row:

> **data class · purpose · subject/deletion scope · storage or recipient · retention · deletion event ·
> operator visibility · third parties**

That record lives beside the schema, service or infrastructure definition that makes it true and changes
with it. The TRD starts the inventory with its proposed stores and flows; implementation reconciles it to
what is actually deployed. Exact vendors, processors, backup behavior, log fields, support workflows and
retention periods are discovered and decided there rather than guessed in this product document.

#### 5.10.3 The as-built review is a release gate, not a PRD gate

Before availability is widened beyond development or a deliberately bounded test audience, review the
deployed inventory, processor list, operator roles, backup expiry, deletion/export behavior, incident
path, and jurisdiction- and audience-specific legal surface. The evidence is generated deletion/export
tests and a reconciliation against deployed infrastructure, not the existence of a long policy document.

D-17 answers what attackers and cryptographic authorities can do; D-32 answers which constraints the
service must preserve while its concrete data surface is discovered. Neither substitutes for the other,
but only the constraints belong in the PRD. The inventory and operational program belong to the TRD,
implementation and release review at the stages where they can be accurate.

### 5.11 What survives the service — D-33

**D-33. What continues to work if this company stops existing, and what may the product claim about it?**
_(Decided in principle. Promoted from the former durability appendix, which analysed it as a transport question
and concluded it was not one.)_

**Why this is here rather than in an appendix, and why D-16 forced the promotion.** That appendix had asked
whether ordinary sync should be peer-to-peer, and found two concerns underneath: operating cost, and the
wish that adopting a local-first tool should not require betting on the operator's survival. It concluded
that **peer-to-peer answers the first, badly, and does not answer the second at all** — a durable node
that returns what a sleeping device missed is a relay whatever it is called, and independence comes from
custody, portable software and tested migration rather than from the route bytes take.

D-16 then removed the peer path, which has a consequence this document has to own: **the fig leaf is
gone.** While an accountless peer path existed, there was notionally a configuration in which users were not
dependent on this service. It was never real (§5.7.3, D-16), but it was there. Now every synchronizing
user is on infrastructure this company operates, so the work below stops being a roadmap item and becomes
the thing that makes the product's pitch true.

> **Decided: software continuity comes from an independently runnable client and service stack, not from
> preserving this operator.** Publicly available open source is the ordinary and preferred way to satisfy
> that requirement. A triggered source-escrow or wind-down release with perpetual build-and-run rights is
> an acceptable but weaker fallback. Binary availability alone is useful during an orderly handoff but
> does not satisfy replacement-device continuity. Claims remain staged and evidence-gated at release;
> building and proving the package is not a gate on the PRD or the start of the TRD.

An orderly corporate succession may keep the hosted service running, and enough users may make that the
commercially likely path. It is welcome operational continuity, not the architectural guarantee: the
product must remain recoverable when there is no buyer, no cooperative wind-down and no original domain.

#### 5.11.1 Decompose the scenario rather than answering it yes or no

| After the service disappears, the user wants to… | Required mechanism                                                                     | State today                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| Open and edit on a device that already has it     | Its usable last local replica; no read or write awaits network or credential              | **Held** (§6, PRD principle 3)     |
| Read the data without `done`                      | Plain, documented export format                                                          | **Substantially held** — Markdown export exists |
| Reinstall on a replacement device                 | Independently obtainable, legally runnable client source/build; not dependent on the original origin | **Plausible path selected:** public open source, or triggered source release; not yet shipped |
| Continue syncing between existing devices         | Independently runnable authorization service, relay and store; configurable endpoints; documented migration | Same distribution path; unbuilt   |
| Restore after losing every device                 | Independently held ciphertext, content-recovery factor and standalone restore path         | **No longer gated** — D-17 selected the factor (§5.7.6); archive and restore tool are unbuilt |
| Admit or revoke a device                          | Account recovery or creation at the replacement service                                   | Missing as a migration flow       |
| Move to another hosted or self-hosted service     | Restore content, create a new account and enroll devices under the new service's authority | Missing                            |

The first two rows are most of what a user means by "outlives the company", and they are the two that are
substantially in hand. The rest do not follow from local persistence, and none of them would have followed
from peer-to-peer either.

#### 5.11.2 Three continuities, each of which can fail alone

- **Data continuity.** Export must be paired with **import**, or the Markdown archive preserves the
  user's writing without preserving continuity of this application. Import is already owed for the §2.4
  migration; this makes it a survivability requirement too. Beyond it, the stronger story needs a second
  artifact with a different job: **Markdown is the permanent escape format; an encrypted fidelity archive
  containing CRDT state and the material needed to resume is the exact restore format.** Neither may
  depend on an undocumented database layout or a live original service.
- **Application continuity.** A cached PWA continues through an outage; it does not survive a cleared
  browser store or a replacement device, and an expired origin serves nothing. The normal answer is a
  publicly available source release under terms that permit anyone to build, serve and run it indefinitely,
  with pinned dependencies, instructions, checksums and independently downloadable release artifacts.
  A third-party source escrow or automatic wind-down release can satisfy the same requirement less
  reliably if its trigger, license and contents are fixed in advance. A promise that a buyer may keep
  existing binaries running helps an orderly succession but does not let an arbitrary user reinstall
  after browsers, operating systems or signing requirements change. The release must cover the
  authorization service, relay, durable store and migration tooling as well as the client; open-sourcing
  only the UI preserves neither sync nor recovery.
- **Cryptographic continuity.** Server-held ciphertext is not recoverable data unless the user can recover
  the decryption root. Restoring account access must never be described as restoring content-key access
  (§5.7.5, §5.1.2). This was D-17's recovery selection seen from the survivability side, and the two were
  answered together: the **content recovery root**, unwrapped by the user's saved code, is what makes
  server-held ciphertext recoverable data. It is held by the user, so it survives the service by
  construction rather than by arrangement.

**Authorization is deliberately not continuous across service disappearance.** §5.7.2 chooses the
service as the authorization authority and migration as the boundary: the old lineage ends, the content
is restored under user-held recovery material, and the replacement service starts a new account and
authorization lineage. The product preserves the workspace, not the vanished service's device list,
epochs or claim to authority. That is narrower than succession, easier for users to recognize as moving
services, and sufficient for the claim in §5.11.4.

**Which raises a question the two decisions were taken four hours apart and never reconciled: what makes
the restored history admissible under a lineage that never accepted it?** §5.2.3 requires acceptance
evidence on every applied envelope, and every historical envelope carries the *dead* service's — issued
under a key the replacement has no reason to honour and clients have no reason to trust. Replaying them
under the new lineage cannot work, and must not, or migration would be a way to launder unaccepted writes
into a fresh workspace.

**The checkpoint is the re-baseline point, and it is already required for other reasons.** §5.11.3's
content-blind store already needs a client-produced authenticated checkpoint with a manifest binding it to
an authorization head, key generation and covered range. At migration that checkpoint is what the
replacement lineage admits: the restoring client attests the state it recovered, the new service accepts
that attestation as the lineage's origin, and the prior envelope history is **archival rather than
replayable** — kept for the record, never re-admitted. Every write after the checkpoint carries the new
service's evidence in the ordinary way.

**But a checkpoint that re-baselines acceptance also re-signs everyone's history as one client, and
§5.6.2 forbids exactly that.** Its rule is that a source "must not combine mutations from several
credentials into new bytes and sign the result as itself; that would erase the property D-27 is meant to
establish", and it requires first sync to use "either the signed envelope history or an authenticated
checkpoint **whose construction preserves attribution**". A naive migration checkpoint is the forbidden
shape: every card any device ever wrote, attested by whichever device happened to perform the restore.

**So migration has to choose, and the choice is a product one because it decides what D-27 promises
across a service boundary:**

| Option | What survives | What it costs |
| ------ | ------------- | ------------- |
| **Carry attribution forward** | Historical writes stay attributable to the credential and actor that made them | The old lineage's public authorization material must be retained as **historical verification material** — not as current authority, which §5.7.3 forbids, but as the trust root against which pre-migration signatures still verify |
| **Reattribute the baseline** | Nothing before the cutover is individually attributed; the whole baseline is one system-actor import by the migrating device | Cheaper, and honest only if said — D-22's provenance mode goes blank for everything older than the migration, and "who wrote this" becomes "restored on 3 March" |

Neither is wrong. What is wrong is shipping the second while D-27 still promises the first, so **whichever
is chosen, §5.7.1's table and D-27 have to say what attribution means either side of a migration.** Note
that retaining old public material for verification is not succession: it proves who wrote history, it
authorizes nothing, and §5.7.3's rule is about who may *change* authorization.

**And "during" needs a rule, because §5.11.4's test 7 names it as a case.** A migration is a cutover: the
checkpoint fixes a covered range, and an edit made after that range is computed but before the new lineage
accepts anything belongs to neither side. The workable shape is that the restoring device stays writable
throughout — nothing on the write path may await a service (§6) — and edits made during the window are
**re-based onto the checkpoint and re-signed under the new lineage** as that device's own writes, which is
attribution-preserving because they *are* its writes. Any other device is enrolling afresh and has no
window to have written in.

So the accepted-set requirement and the migration boundary meet at a checkpoint rather than conflicting,
and §5.11.4's test 7 — converging edits from before, during and after a migration — is passable because
"before" arrives as attested state and not as a stream of foreign receipts. The construction is TRD work;
that it exists, and that nothing else could serve, is the product-level part.

The migration must keep the two enrollment gates separate. The replacement service may authorize a new
credential, but only a surviving content-holding device or the content-recovery factor may deliver the
content key (§5.7.2). Possession of restored content does not prove continuity of the former account; it
creates a new one.

#### 5.11.3 Custody is not replica count

Three processes, machines or buckets under one provider account, billing relationship, domain and operator
improve availability against machine and regional failure. They do nothing about closure of the account,
loss of the domain, or a deliberate shutdown. **For this decision one independently controlled copy is
worth more than three operator-controlled ones.** Immutable encrypted blobs can be copied to independent
stores and verified by digest without moving authorization authority. Migration creates fresh
authorization state at the destination instead of importing the vanished service's signing authority.

Related, and it lands on the relay's design rather than on policy: a content-blind durable store cannot
merge what it holds. **It therefore needs a bounded recovery representation** — immutable authenticated
envelopes, a client-produced authenticated checkpoint, a manifest binding that checkpoint to its
authorization head, content-key generation and covered range, the update suffix after it, and retention
rules for superseded checkpoints. This is already implied by D-28 and §8.1; D-33 makes it a storage
requirement as well as a replay-performance one, and it is the concrete reason "the relay is already
built" was too strong (D-16).

#### 5.11.4 The claim, staged

The claim available **today**, and it should be made rather than held back — it is already stronger than
most of the category:

> Your existing installation and the last workspace replica it holds keep working with the service
> unreachable, and nothing you read or write waits on us. That replica exports to ordinary Markdown at
> any time. Hosted synchronization,
> fresh-device setup and any server-held recovery material stop being available.

The claim enabled by the independently runnable software package, and **it must not ship before the
corresponding tests below pass**:

> If the hosted service disappears, your app and local data continue to work. Your data is available as
> ordinary Markdown. An independently runnable release can be installed without us, and a surviving
> workspace replica can be moved to another compatible sync service under a new account.

The stronger conjunction — the company is gone **and** every device is lost — adds one condition the
software cannot create after the fact:

> If you hold a verified encrypted archive and your recovery factor, the encrypted workspace can be
> restored on a replacement device and moved to another compatible sync service without the original
> provider.

The gate, demonstrated without production credentials or the original app origin:

1. Start an existing installation with app and relay origins unreachable; read and edit normally.
2. Export to Markdown and inspect every user-authored item with ordinary tools.
3. Import that export into a clean, independently served build without silently losing frozen history
   (§2.4 — the freeze must not eat the import).
4. Restore an encrypted workspace archive on a clean device using only saved recovery material.
5. Start the documented self-hosted service and store, and migrate one surviving replica without modifying
   its content.
6. Create a new authorization lineage at the replacement service, then add and revoke a device.
7. With two devices diverged while the former service was unavailable, use one replica to establish the
   replacement workspace; enroll the other under D-5, verify that its divergent local history is disclosed,
   exported and replaced rather than silently merged, then converge edits made after enrollment under the
   replacement lineage.
8. Repeat with the store holding the newest checkpoint unavailable, using the documented replica order.
9. **Run tests 4 through 7 again with the entire original provider account unavailable** — not one store,
   not one region, but every service the company operated — using only material the user already holds.
   This is the test the survivability claim is actually about, and it is the one a within-provider replica
   drill can pass while the real scenario still fails.

**Tests 1–3 are cheap, near-term and cover most of the felt meaning of the promise; 4–9 are a serious
program, and 9 is the one that cannot be faked.** They gate the corresponding release claim, not PRD
promotion or the start of the TRD. An open repository is evidence of availability, not evidence that the
software builds, restores or migrates; those claims still wait for the tests. Conversely, an unbuilt test
does not make the product architecture undecided.

#### 5.11.5 The package

What "replaceable" concretely requires, so it can be scoped rather than admired: independently
obtainable source and release artifacts for the client, authorization service, relay and durable store,
under terms that permit indefinite independent operation; build and deployment instructions with pinned
dependencies and checksums; a documented, versioned envelope and checkpoint protocol; endpoints
configurable without editing workspace content; export **and** import; a standalone recovery and
inspection tool; a user-held recovery secret; and a tested migration that creates a new account and
authorization lineage without importing the former service's authority.

**Public open source is the straightforward delivery mechanism.** A source escrow or automatic wind-down
release counts only if it delivers the same source, rights and instructions without requiring the vanished
operator to act. Perpetual rights to existing binaries are useful for a buyer or orderly succession, but
they are a bridge rather than this package: they do not repair a build, support a new platform or give a
user an independently installable replacement after the binary stops running.

The exact-recovery claim for simultaneous company disappearance and total device loss additionally needs
the item a v15 draft left out —

- **A copy of the ciphertext that already exists outside this service.** Either a **verified encrypted
  fidelity archive** the user has taken and the app has confirmed is restorable, or a **continuously
  replicated user-controlled destination**. §5.11.3 argues that one independently controlled copy beats
  three operator-controlled ones, and then the package listed only software — which is the gap. **Shipping
  a self-hostable relay does not put any bytes in it.** Software you can run after the fact cannot
  reconstruct data that only ever lived in an account that has been closed.

That is the difference between *replaceable* and *survivable*, and it is the one requirement here with a
recurring cost to the user's attention rather than a one-off engineering cost — which is why it needs to
be designed as something the app drives (a periodic verified archive, or a destination configured once)
rather than something the user is trusted to remember.

**The scope of that requirement is narrower than the paragraph above implies, and the correction is worth
making rather than leaving the stronger claim standing.** Every surviving install holds an independently
controlled **last** local replica (§5.11.1, row 1) — the axis §5.11.3 cares about is custody, not currency.
An offline replica may therefore be stale:

| Service | Devices     | Who holds usable bytes                                                     | Archive load-bearing?       |
| ------- | ----------- | --------------------------------------------------------------------------- | --------------------------- |
| Alive   | ≥1          | The service plus each device's last replica                                 | No                          |
| Alive   | 0           | Service ciphertext and wrapped root, opened with the user's saved code      | No — this is §5.7.6         |
| Gone    | ≥1, current | The surviving device, migrated to a new service (§5.11.4 test 5)            | No                          |
| Gone    | ≥1, stale   | That device, minus everything since it last synced                          | **Partly — for the gap**    |
| Gone    | 0           | Nothing, unless the user already holds an independent ciphertext archive    | **Yes — only here**         |

**Deliberately not the word "complete".** D-24 and D-29 make *complete copy* mean something specific and
false — a device holds its **last** replica, not the workspace as it last stood — and the argument here
needs the custody sense instead. Hence the fourth row: a device that went in a drawer before the wind-down
is an independently controlled copy that is still short a month, with the relay gone and no other device
willing to sync with it. That is the same qualifier D-24 already puts on destructive account deletion,
which requires *a verified-current device or a fresh export*, applied to the moment the service ends
involuntarily rather than by request.

So the archive is irreplaceable for any recovery in one cell — **the conjunction of company disappearance
and total device loss** — and partly load-bearing in another, where the only surviving device is stale and
the archive covers what it missed. Because the conjunction is usually reached through one of the other
cells, the archive's main
job is protecting the user who was not paying attention during a wind-down window, or for whom the two
events were not separated in time. That is a genuine requirement and not an obvious one; it is simply not
the requirement "shipping a self-hostable relay does not put any bytes in it" appears to be arguing for,
since in the third row the bytes are already on a machine the user owns.

**And it is not a recovery factor.** The archive answers §5.7.6's fourth object — does ciphertext still
exist — and never the third. A user who holds an archive and has lost the code has an encrypted file and
no way in (§5.7.6). Keeping those two objects distinct is what stops the package from looking complete
while a whole class of loss remains unaddressed.

Drawing those interfaces is cheap now and expensive later, and it does not require deploying five
services. The first deployment may remain one small process, provided its **interfaces** already
distinguish rendezvous and connection authentication, ephemeral live fan-out and awareness, durable
encrypted envelopes and checkpoints, authorization signing and accepted-set finalization, and account
storage (plus billing storage only if D-31 introduces it). That
separation is what later lets retention, replacement and self-hosting boundaries be drawn without a
rewrite — and it keeps ephemeral presence data from silently inheriting the retention policy of durable
workspace state (D-32).

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
- **A cookie cannot be waited on.** Whatever the _network_ credential turns out to be, nothing on the
  read or write path may await it — TRD §7.1 already says this about sync state, and §2.3 is why it now
  also covers authentication. **This is scoped to the network deliberately.** It says nothing about a
  local unlock ceremony, which is not a network wait and is not forced by anything here; whether one
  exists is **D-34**, and it is open.
- **Actor ids do not collide.** UUIDv4.
- **A restored or resumed tab must re-establish its view.** It has no way to know what it missed. (Tab
  lifecycle, not the day freeze — the words collide and this one is the browser's.)
- **The freeze governs operations that author the past — not replication, not compaction, not a
  migration import.** A frozen day still merges: remote updates arrive through `Y.applyUpdate` and never
  consult `isFrozen`, so the freeze has never been a barrier to another device's history. Compaction is
  held independent of it by explicit design (`compaction.ts`, TRD §4.5, with a regression test). Within
  the app's own write paths it binds every actor including the system one — the recovery path declines to
  rewrite frozen history on purpose, and that is correct. **Import is the case that has to be placed
  deliberately** (§2.4, §5.2.2): a migration import is the app reconciling histories rather than a person
  editing the past, so gating it the way an edit is gated would silently discard everything older than
  three days. Note the second gate on that path, which is not the freeze: `NEXT_CAP` (§5.2.2).

---

## 7. What this costs the first experience

The initial experience is where identity decisions are most expensive, because it is the only moment
the user has no reason to care and no context to answer. Four constraints now define it:

1. **The first run cannot ask who you are** — principle 1 and principle 2 both point this way (D-1).
   Local genesis creates an unnamed principal, home-workspace membership, device and human actor without
   exposing any of those concepts.
2. **Local asks for nothing, ever.** After D-16, Local is not a trial or a first rung;
   it is a complete application that never requests a name, an address or a credential. D-1's promise
   therefore holds for the entire experience of every user who does not ask for a hosted service.
3. **The questions arrive with the service that needs them**, and not before: creating an account to get
   a second device asks for a name (D-23) **and requires a saved, independently confirmed high-entropy
   recovery code** (D-17, §5.7.6). Those are one moment and two different kinds of ask — the name is a
   label, while the code is custody of the only thing standing between the user and permanent loss. Any
   commercial step is D-31 and outside this flow. The account requirement is a sharper edge than the
   retired ladder had, the code makes it sharper still, and this is the honest place to put both — when
   the app starts holding ciphertext and acting on the user's behalf through a service.
4. **Nothing silently discards a history.** Where a joining device's own history is about to be replaced
   by the workspace's, D-5 requires that it be said plainly, that the export be offered, and that the
   user confirm. **This is now a common path rather than a corner case** (D-24, S35) — which raises what
   the copy has to be, not what the machinery has to do.

### A worked example of the chosen flow

Tom has been using `done` on his laptop for a month. He has never been asked for anything: no name, no
account, no sync configuration. His data is on his laptop and nowhere else, and the storage section of the
menu says so plainly and without alarm (D-25).

He gets a new phone, installs the app, and uses it for a week before thinking about sync. That phone now
has its own local genesis — its own principal, device, actor and history — and the two installs have no
relationship at all (S5).

Then he wants one list instead of two. **This is the boundary at which the product begins asking for
something:** he starts creating an account on the laptop and chooses a name (D-23).

**And it asks for one more thing, which is the heavier half.** Before the account exists, the laptop
generates a recovery code, tells him it is the only way back to his list if he ever loses every device,
and asks him to store it somewhere that is not this laptop and confirm it (§5.7.6). This is the largest
deliberate security interaction in the product, it happens exactly once, and there is no version of the
account without it — the alternative is a service that can read his list, which §5.7.5 rejects. What the
interface owes him here is the reason, in a sentence, at the moment he is being asked: *we will not be
able to recover this for you, so you have to be able to.*

Once he confirms the independently held code, the account exists. It binds to the principal that already
exists rather than minting a replacement, and adopts the laptop's document (D-24).

He signs in on the phone. The account admits the phone's device credential, the service signs the new
authorization epoch, and the phone is enrolled — but it still cannot read anything, because authorizing a
device does not deliver a content key (§5.7.2). So the laptop shows a one-time pairing QR, the phone scans
it, and the key arrives out of band (D-19). He never needs the recovery code for this: it is the fallback
for when no existing device survives, not a step in ordinary enrollment, and the QR does not create a
second authorization path. No workspace name, room or endpoint is typed anywhere (Rule 1).

**Then the part that costs something, and it is a sentence rather than a flow.** The phone has a week of
its own notes and the workspace has the laptop's month. D-5 does not ask Tom to adjudicate: the workspace
is the list. The phone tells him plainly that its own week will not be carried over, offers him the
export, and waits for him to confirm. Then it adopts the laptop's history and the two are one list.

He loses the week unless he took the file — and the file is something he can read, not something he can
pour back into the list a week later (§5.2.2). That is a real cost and the interface has to be honest
about it at the moment it happens rather than afterwards.

**Note what the mitigation did and did not do here, because it is easy to state too well.** Tom *followed*
the instruction — he created the account on the laptop, the device whose list he wanted — and he still
lost the week. **Once two devices both hold content, no ordering preserves both.** What the instruction
buys is that the *month* survives rather than the week; it chooses the winner, it does not avoid the loss.
The only thing that avoids it entirely is earlier than any ordering: **create the account before the second
device accumulates anything.** Had Tom installed the app on the phone after creating the account, the phone
would have been empty and nothing would have been asked at all.

**And two different things are being paid for here, which the paragraph above ran together.** That *one*
history becomes the list is a product rule (D-5, D-24) — permanent, deliberate, and the thing that makes
"one list" mean anything. That the week cannot be **put back into the joined workspace** is not the rule;
it is the current scope of import (§5.2.2).

**"Unrecoverable" is the wrong word for what Tom is left holding**, and precision matters because the
interface has to describe it. The file is readable in any editor, and it can seed a *fresh* workspace. What
it cannot do is rejoin the list it was replaced from. With a fidelity format and a populated import that
last part becomes possible — and it would be a **merge Tom performs**, not one the app performs for him.
That is what "no merge" has always meant in D-5: no *automatic adjudication*, no app deciding between two
histories behind a preview. A user deliberately importing a file they kept is the opposite of the thing the
rule refuses. So: the rule is settled, and the limitation is one the product currently accepts and could
later lift without touching it.

Afterwards, the phone has a new human actor because attribution remains per member-per-device, but the
interface groups both actors under the same principal: one "You", one colour. "Last synced from phone" may
still name the device, and undo remains local to each tab.

If D-31 later makes hosted sync a subscription and Tom stops paying, a grace period passes and the account
goes read-only: both devices keep working completely, holding everything they had, and they stop
converging from that moment (D-29). He is back in Local, which is a place rather than a punishment.

If Tom later enables an agent, the agent receives its own workspace membership, capabilities and signing
credential. Its edits are attributed to its agent actor; removing read access rotates the content key. No
second human, sharing UI or second visible document is implied by that architectural capacity.

---

## 8. Decision register

**These are recorded dispositions, not claims that every mechanism is finished.** Several rows marked
Decided carry live UX or parameter questions in their bodies. The column below says what has been settled;
§8.1 isolates the remaining TRD parameters and release gates from those non-blocking details.

**v15 changed nine rows from one decision.** D-16 landing moved D-19, D-23, D-24, D-25, D-26, D-29 and
D-31, removed D-17's everyday user-held authorization mechanism, and first re-weighted D-28 — which is
the clearest evidence that the account/service boundary was never a pricing question. §5.7.2's service
authority decision then narrowed D-28 to the control-plane/data-plane split it now selects.

| ID       | Question                                                       | Status                    | Answer, or what happens without one                                                                                                         |
| -------- | -------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-1**  | Does the user tell the app who they are, and when?             | **Decided**               | Generated by default; a name at account creation only, per D-23. The name is not the whole of that moment — the recovery code is asked for too (§5.7.6) |
| **D-2**  | Is identity per person, per device, or a labelled pair?        | **Decided**               | Per device internally; per person in ordinary lists. Own devices appear only on explicit device/security surfaces and are not disclosed to another principal |
| **D-3**  | Are device names worth improving?                              | **Decided in principle**  | Yes. Mechanism open — and it does not need a fingerprint                                                                                    |
| **D-4**  | Can a new device claim an existing actor?                      | **Decided**               | No. A new device is always a new actor; the real question was D-19                                                                          |
| **D-5**  | What happens when a device with history joins a workspace?     | **Decided**               | An existing workspace history wins; an empty one adopts the first joiner's. No adjudication. Cancel leaves the device untouched. Export is written first; the switch needs §5.2.1's mechanics. Import does not undo it (§5.2.2) |
| **D-6**  | Can dead actors be pruned?                                     | **Decided**               | No auto-hiding. Staleness may be muted; the interval is open. Exclusion is D-20                                                             |
| **D-7**  | Should undo ever cross devices?                                | **Decided**               | No. Never leaves the device                                                                                                                 |
| **D-8**  | What may a session be seen doing?                              | **Decided**               | A caret per tab, own tabs included, **all yours in your colour**, person's name. Active caret distinguished (D-21). Peer list deduplicated  |
| **D-9**  | Does the app ever show a tab count?                            | **Decided**               | Never, save a high-bar exception that must be justified in writing                                                                          |
| **D-10** | Is sync configuration per device or per document?              | **Decided in principle**  | Rule 1: the user never manages workspaces. Mechanism open; today's three fields are ruled out                                               |
| **D-11** | What is a workspace — content, or permission?                  | **Decided in principle**  | Permission. UI reveals one home workspace/document; architecture supports many memberships; "room" stays off the architecture               |
| **D-12** | What happens when local identity is lost?                      | **Decided in principle**  | Authorization epoch 0 may re-mint; later epochs must not. Signed state, not roster. Since only the service advances the epoch, epoch 0 is Local and any later epoch is Account. Response open |
| **D-13** | Is there a deliberate reset?                                   | **Decided**               | Yes. Four clearable objects: identity, capability, document, recovery material. A shared-device reset clears the first three; open is what an ordinary sign-out clears and whether it revokes |
| **D-14** | May the relay decide who connects? What is written?            | **Decided**               | Service authenticates connections and authorization; relay validates opaque envelopes; clients retain semantic authority; no service component reads Yjs content |
| **D-15** | Within a device, is undo per tab or shared?                    | **Decided**               | Per tab                                                                                                                                     |
| **D-16** | Where does the account/service boundary sit?                  | **Decided**               | Local is free and permanent; hosted sync requires an account; pricing is D-31; the Paired rung is retired; **peer-to-peer is not built**    |
| **D-17** | What does "reasonably secure" mean, concretely?                | **Decided**               | Service authorization, user-held content recovery and migration; one independently saved code seals the content-recovery root; escrow excluded from the service; non-extractable PRF-wrapped device key; levels 1–3 before sync ships, level 5 at ship, level 4 on trigger |
| **D-18** | Are devices enumerable and revocable from a UI?                | **Decided**               | Yes. The unit is the device. Gates sync, not startup. Freeze and offer options; no automatic wipe. The list also shows each device's key-storage tier (§5.7.4); whether sign-out revokes is open (D-13) |
| **D-19** | How does a device find the other devices that are yours?       | **Decided**               | Sign-in discovers and authorizes; an existing device or recovery factor separately delivers the content key. One account flow; wire identifier hidden |
| **D-20** | How is a member actually excluded?                             | **Decided**               | Content encryption with key rotation. Keeps the relay content-blind; key management is the cost                                             |
| **D-21** | What does "the active caret" mean — local, or globally recent? | **Decided**               | Locally active. No recency modelling; a design check that it reads as distinct                                                              |
| **D-22** | Does merged content show its provenance?                       | **Decided**               | Yes, as a rarely-on mode. Settings toggle, off switch surfaced while active. Cards only, freeze-window bound                                |
| **D-23** | Does pairing alone trigger the name prompt?                    | **Decided**               | Largely dissolved by D-16: one name prompt, at account creation, which is now the same moment as first sync — and as the recovery-code ceremony, which is the larger ask |
| **D-24** | How does existing local history become an account?             | **Decided**               | Adopts the creating device's history, which makes D-5 decidable. Deletion leaves each device its **last replica**, not a full copy, and the principal survives it |
| **D-25** | Does the app warn when durability is not guaranteed?           | **Decided**               | Yes, for the environment case. Warn about the property, not the cause. Offer the grant, then export, then sync. Also owns the hosted copy's dependency on the saved code |
| **D-26** | Revocation learned late, history already diverged?             | **Decided**               | No lineage rule, no discard, no filtered replay. Needs a **finalization boundary** against a hostile relay (§5.2.3) — a contract row        |
| **D-27** | Is attribution authenticated, or advisory?                     | **Decided**               | Authenticated by an epoch-authorized credential; actor is derived or explicitly authorized for representation                               |
| **D-28** | What carries the authorization protocol?                       | **Decided**               | A service-authoritative control plane around end-to-end-encrypted Yjs updates; the attributed actor sits inside the seal, so the relay gets no actor-level metadata; exact envelopes, finalization and key constructions belong in the TRD |
| **D-29** | What happens if a paid account plan lapses?                    | **Decided conditionally** | If D-31 selects such a plan: grace period, then read-only. Ciphertext and wrapped root are retained together so resuming works; local use is untouched; expiry is what destroys |
| **D-30** | Does Rule 1 have exceptions, or the wrong formulation?         | **Decided**               | Rule 1 stands: users manage devices, access, recovery and data transitions without managing or seeing workspace containers                 |
| **D-31** | What does hosted sync cost, and how should it be priced?       | **Deferred on purpose**   | Business-model question outside this document. D-16 requires an account but does not presume free, paid, bundled or metered                 |
| **D-32** | What may the service retain, observe and do?                   | **Decided in principle**  | Fix irreversible constraints before the TRD; maintain a living inventory during design/build; reconcile and review the as-built surface before wider availability |
| **D-33** | What survives the service, and what may be claimed?            | **Decided in principle**  | Independently runnable client and service stack; open source preferred, triggered source release acceptable; binary-only continuity insufficient; claims gated by corresponding tests |
| **D-34** | Is local user content encrypted at rest?                       | **Existence open; shape decided** | Two plaintext stores today, a third planned. Any lock is opt-in, user-held factor, governs every store, and accepts total loss if the factor is forgotten. Open only: whether to build it. Also settles when content encryption begins (§5.2.1) |

### 8.1 The security contract is bounded; the TRD must instantiate it

An earlier draft said "only D-17 is open", which flattened a real distinction; the draft after it said
"four blocking questions", which fragmented one. The accurate statement is: **D-17 fixes the security
promise and authority split, D-28 fixes the protocol boundary, and the remaining mechanism choices are
inputs to one TRD security contract rather than new product branches.**

The contract now has both fixed requirements and deliberately unselected fields:

| Piece                                    | Fixed by this document                                                                  | Still to select or specify                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Threat boundary and negative promises    | §5.7.1's attacker table; offline local use and availability limits                      | Any stronger claim, including local-device-at-rest or traffic-metadata protection                          |
| Credential separation                    | Relay bearer, per-device/per-agent operational credentials, service authorization authority and content-recovery root | Concrete credential formats, algorithms, key separation and crypto-agility                 |
| **Protocol boundary**                     | **A service-authoritative control plane around client-encrypted Yjs updates**; service signs authorization/finalization, clients encrypt and sign content, relay/store handle opaque envelopes (D-28) | Exact message/state formats, verification APIs, batching and test vectors |
| **Authorization and recovery boundary**  | **Selected: the service alone authorizes; the user-held root recovers content only; service disappearance starts a new lineage through migration** (§5.7.2, §5.7.3) | Account-recovery policy and the exact user-mediated proof that gates content-key delivery |
| Browser key storage                      | **Selected: a non-extractable `CryptoKey`, PRF-wrapped where the authenticator supports it.** The tier is shown in the device list and is never silent; the unlock gates sync, not the app (§5.7.4) | PRF enrollment flow, and the copy shown for a device on the lower tier |
| **Local storage at rest**                | **Selected: if a device lock exists it is opt-in, user-held-factor-keyed, governs every store holding content, and accepts total loss on a forgotten factor.** Content is plaintext today in IndexedDB and the journal, with the Phase-4 index a planned third; the origin sandbox is not an at-rest boundary | Whether to build it at all — **D-34** (§5.7.4). Its answer also fixes whether account creation is a whole-document encryption pass (§5.2.1) |
| **Signed authorization epoch**           | Binds membership, credentials, capabilities and key generation; the service signs and serializes successors | Chain-head discovery for a fresh device, checkpoint and downgrade rules. **Fork rules are no longer needed** (D-16) |
| Signed mutation envelopes                | Source-authenticated; workspace/epoch/credential/digest in the clear, **attributed actor inside the seal** so the relay gets no actor-level metadata (§5.8.1) | Which fields are associated data, envelope and batching granularity, anti-replay/finalization rule and authenticated checkpoint construction |
| Attribution binding                      | Actor is derived from the credential or explicitly authorized for representation        | How an update's affected attributed fields are inspected or derived                                        |
| Revocation commit semantics              | Requested · committed · acknowledged; no peer path bypasses the relay                   | Protocol and recovery behaviour for interrupted rotation                                                   |
| **Content finalization boundary**        | A valid mutation is not accepted without authorization-service evidence; a hostile relay can withhold and later deliver a valid old-epoch write. **Across a migration the checkpoint re-baselines admissibility** — prior envelopes are archival, not replayable (§5.11.2) | Per-envelope receipts, accepted-log inclusion proofs, or checkpoints with an authenticated suffix; every shape ends in a committed cutoff (§5.2.3) |
| Content-key wrapping and rotation        | Symmetric generations wrapped per reader credential; edit implies read under this shape | Algorithms and generation retention                                                                        |
| **Awareness and presence metadata**      | Presence is outside the content encryption as currently designed                        | Encrypt awareness, or state in the threat boundary that the relay learns who edits what and when (D-20)    |
| Account relationship to the content root | **Selected: non-custodial encrypted recovery.** The service never receives the wrapping factor and cannot decrypt under any proof or order. Escrow is excluded from the service and survives only as an opt-in add-on operated by a separate legal entity, scoped to the content root (§5.7.5) | The add-on's operating boundary, and the copy that explains a two-party disclosure requirement |
| Recovery                                 | **Selected: a mandatory high-entropy code saved outside the enrolling device, wrapped 1-of-N**, with optional independent PRF-passkey wraps (§5.7.6). Re-entry at enrollment proves transcription and possession, never location — the copy carries independence, not the mechanism. Account, authorization, content key and ciphertext remain four separate objects | Code generation and confirmation, replacement policy, loss warnings and account-deletion semantics (D-13) |
| Web application and protocol assurance   | **Selected: levels 1–3 before sync ships, 5 live at ship, 4 on a stated trigger.** Same-origin code is inside the cryptographic boundary; D-28 fixes the design-review scope at the architecture level (§5.7.8) | Which ASVS profile and version, who performs the design review, the audit's scope, and the concrete TRD protocol submitted for review |
| **Durable store representation**         | A content-blind store cannot merge; recovery needs checkpoints, not a merged state      | Checkpoint construction and cadence, manifest binding, retention of superseded checkpoints (D-33, §5.11.3) |
| **Portability and migration**            | Export, import, an independently obtainable build and creation of a fresh authorization lineage at a replacement service are requirements, not roadmap | Formats, distribution mechanism and migration flow (D-33) |

**D-17 gated the selections in the right-hand column, not the existence of every left-hand requirement —
and all five are now recorded.** The authorization/content boundary, the account's relationship to the
content root, the recovery factor, the device key's storage, and the assurance bar. **D-17 is closed.** The common
core in §5.7.9 now has D-28's architecture boundary and can be specified in the TRD, then put in front of
someone who does this professionally (§5.7.8).

**Deciding it opened one new question rather than closing every one.** **D-34** — whether local user
content is encrypted at rest — was assumed twice in this document and never decided (§5.7.4). Its shape is
now fixed and only its existence is open: opt-in, user-held factor, every store that holds content, and
total loss accepted if the factor is forgotten. It is not a security-contract selection and does not gate
the protocol, but it is the remaining place where the phrase *end-to-end encrypted* and a reasonable
user's understanding of it can still diverge, so it belongs beside the contract rather than in the
sub-questions list.

**The authority and recovery selections were entangled and had to be taken together.** The service may
replace and revoke devices without keeping an authoritative user device online, but its authorization
must never deliver the content key by itself. The independently saved content factor supplies that second
power. When the service disappears, migration creates a new lineage instead of asking the factor to
become an administration credential.

**A v15 draft preserved a break-glass user authority after D-16 removed the everyday one. §5.7.2 now
removes both.** That is not a weakening of content survivability: the user retains the content-recovery
root and can migrate the workspace. What does not survive is the old service's authorization lineage,
which the product has no need to portray as continuous.

**D-28 closes D-14's second half with it.** The service owns authorization and opaque acceptance evidence;
clients own content semantics and keys. The relay may validate metadata and signatures but never gains
schema-level content authority. The contract's envelope, epoch and checkpoint rows now have an
architecture to instantiate in the TRD and a defined boundary for §5.7.8's reviewer.

**Live sub-questions inside recorded dispositions.** Each is a UX or parameter choice and none blocks the
contract: D-12's response on an admitted document with no identity · D-13's destructive semantics · D-18's
revoked-device options and cleanup policy · D-6's staleness interval · D-3's disambiguation mechanism ·
D-21's design check · D-22 and D-23's interface details · D-29's retention duration for a lapsed
account. D-20's awareness-leakage question has left this list: it is now a contract row of its own,
because "presence metadata is visible to the relay" is a threat-boundary claim rather than an interface
detail.

**D-16 is settled and it did most of the work in this revision.** The boundary was decided before
anything was built, which was the whole of the saving; pricing is **D-31**, stays deferred, and changes
nothing in D-16. Neither blocks the security contract, and the boundary's answer *shrank* it.

**D-32 is settled at the only level this document can settle it.** The product constraints on custody,
deletion scope, diagnostics, local continuity, operator power and presence retention are fixed. The
inventory starts in the TRD, evolves with implementation and is reconciled before wider availability;
inventing an exhaustive inventory here would be premature rather than prudent (§5.10).

**D-33 is settled at the product level too** (§5.11). Independently runnable client and service software
is the continuity mechanism; open source is the preferred delivery path and a triggered source release is
the fallback. Its checkpoint and migration requirements belong in the TRD, while the tests gate only the
claims they demonstrate. The combined company-disappearance and total-device-loss claim additionally
requires ciphertext already outside the service.

### 8.2 Ready to promote; the TRD and release evidence remain

**This document is ready to be folded into the PRD and translated into a TRD.** It is not
implementation-ready for the separate and ordinary reason that the TRD has not yet instantiated the
selected architecture, and none of the release evidence has yet been produced. All five artifacts review
requires are complete at the product-decision level:

1. **The corrected ontology**, which §1 now has — account, principal, workspace, member, actor, device
   and session — with the pre-account principal and workspace-scoped membership as the load-bearing
   additions. D-16 made the first of those more important, not less: principal-without-account is now the
   steady state for most users rather than a transitional rung (§1.1).
2. **Explicit cardinalities**, which §5.4.1 now has, separating architectural capacity from revealed
   surface.
3. **A bounded security contract**, complete as product input and awaiting technical specification and
   review. §5.7 gives the threat claims, decisions and conformance tests; D-28 selects the
   service-authoritative envelope architecture; §8.1 separates fixed requirements from the parameters the
   TRD must supply. **D-34** is new and does not gate the contract — though it does settle whether
   account creation is a whole-document encryption pass (§5.2.1), which is a TRD input rather than a
   product gate.
4. **A service data boundary and staged inventory obligation**, now fixed by D-32. §5.10 records the
   irreversible constraints that precede the TRD, the compact inventory row added as the architecture
   introduces data, and the as-built reconciliation that gates wider availability. A speculative complete
   inventory is no longer required before the services are designed.
5. **An independently runnable software requirement and staged release claim**, now fixed by D-33.
   Public open source is the preferred path; a triggered source release with perpetual build-and-run
   rights is an acceptable fallback; binary-only continuity is insufficient. The implementation and tests
   remain, and independent ciphertext is additionally required only for the conjunction of company
   disappearance and total device loss (§5.11.5).

The ontology and the cardinalities were the two things review said were missing or contradictory, and both
are now written down. What changed in this round is larger: **a product decision (D-16) removed a rung,
and with it a transport, a revocation semantics, a second authorization path and one of the security contract's open
selections.** The remaining design task is correspondingly smaller than it was in v14.

What should survive future rounds unchanged, because it has now held up under every one of them:
invisible workspace management (Rule 1), reads and writes never awaiting a **network** credential —
the qualifier matters, and D-34 is why (§5.7.4) — an account adopting an identity that predates it
(D-24), honest durability warnings (D-25), and removal governing future access rather than pretending to
erase copies already made.

**Where this revision's cost actually landed.** D-16 moved complexity out of the protocol, and a little of
it onto the user: someone who runs local-only on two devices and then creates an account loses the second device's
history (D-5, D-24, S35). Two things about that are worth holding on to. It is **bounded and
explicable** — one device, one moment, stated before it happens, with a file offered — rather than the
open-ended adjudication v14 was heading toward. And it is **a copy problem, not an architecture problem**:
what remains to get right is the sentence the user reads and the ordering the interface encourages. If
this proves worse in practice than it reads here, the thing to revisit is the messaging and the import
path, not the boundary.

**On splitting this document, which the fourth review round proposed: the ordering condition is now
satisfied.** The revisions landed first; the product decisions can now be promoted into the PRD and the
mechanism parameters into the TRD. Preserve the landmarks or a cross-reference while doing so—the
argument is easier to split now, but its security, recovery and survivability decisions still depend on
the shared ontology in §1.

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
  Under D-20's symmetric document key, edit cryptographically implies read; write-only would require a
  proposal/approval flow or a different content construction rather than a capability label. And the
  consequence that follows from it should be stated where the feature is described: granting an agent
  discloses the entire workspace to it and to whatever service runs it (D-20).
- **§6 Freeze** — the freeze's scope needs writing into the sentence, on the authoring-versus-maintenance
  distinction rather than the looser "human editing surface" one. It governs operations that **author the
  past**; it has never bound replication, it is deliberately independent of compaction (TRD §4.5), and it
  must not bind a migration import (§2.4, §5.2.2, §6).
- **TRD §2 and §7.2** — the relay they describe is no longer the relay this document selects, and neither
  was previously on this list. §2 chooses Yjs "with the relay as a dumb pipe … It holds no authority, runs
  no application logic, and can be absent entirely"; §7.2 specifies a shared bearer token over TLS on the
  grounds that "the threat model is one person's task list", and says the relay is not a backup because
  "every device holds a full replica". D-14 gives the relay envelope-metadata authority, D-28 gives it
  authenticated acceptance evidence to carry, D-16 makes the hosted copy a server-held encrypted replica
  rather than nothing, and D-24 corrects the full-replica claim to a **last** replica. The dumb-pipe
  property survives only in the sense that matters — no service component reads content — and the
  sentences should say that rather than the stronger thing they say now.
- **TRD §10.6** — now wrong, and not previously on this list although its product twin PRD §11.4 was.
  It says permissions are unenforceable here and that real enforcement would require giving the relay
  schema awareness, "which forfeits the 'dumb pipe, no authority' property" — which treats enforcement
  and plaintext authority as one axis when they are two. D-20 makes read exclusion cryptographic; D-27
  makes attribution client-verifiable; D-28 gives the service authorization and accepted-set authority
  while the relay validates only opaque envelopes. What survives is only the
  semantic-capability case, and it survives because edit implies read under one content key (§5.7.2),
  not because the relay is dumb. Left standing for now rather than corrected in place: it is a
  technical-doc amendment that belongs with the rest of the promotion, not an ad-hoc edit alongside
  this one.
- **§14 Open questions** — D-1 through D-33 are now dispositions to promote into the applicable product
  sections or a referenced decision register, not open questions. Retain only their explicitly named live
  UX/parameter details and D-34 as open items.
- **§1 / §2, or wherever the product is described** — D-16 makes a claim the PRD does not currently
  contain: **Local is free and permanent, while hosted synchronization requires an account.** Whether
  that service is free or paid is D-31 and is not a product-shape claim here. PRD §12's non-goals should
  stop implying that sync is simply a feature the app has.
- **§4 Export, and a new import commitment** — principle 4 promises plain-markdown export. D-33 makes
  **import** a requirement of equal standing, on two independent grounds: the §2.4 migration needs it, and
  an export without an import preserves the writing but not the continuity of the application. Import
  targets an empty workspace (§5.2.2), and the same amendment should record why: plain Markdown is the
  right escape format and the wrong round-trip one, so a **second, fidelity export carrying CRDT state**
  is what a populated import would eventually need (§5.11.2).
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
- **Peer-to-peer transport**, removed from the plan by D-16 rather than deferred vaguely. It returns only
  as an optimization beneath one envelope protocol, under the measured conditions D-16 records — never as
  a tier, a pricing boundary or a second authorization semantics. An emergency service-absent peer mode is
  a different feature and belongs to D-33.
- **The implementation of the survivability package.** D-33 fixes what must exist and what may be claimed;
  building the self-hostable relay, the standalone restore tool and the distribution mechanism is
  engineering work with its own document.
- **The implementation of the operational and legal program** — vendor contracts, jurisdiction-specific
  notices, support playbooks and filing obligations do not belong in this product document. D-32 fixes
  the product constraints; the TRD and implementation maintain the living inventory; jurisdiction- and
  audience-specific review occurs before availability widens.
