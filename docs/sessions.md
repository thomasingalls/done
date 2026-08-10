# done — Sessions and Identity: Product Requirements

**Status:** Draft v1 — **decisions deliberately open.** See §8.
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

It **does not decide.** The product calls in §5 are the author's, and §8 is the register to walk
through together. Where a decision is already narrowed by something the PRD ranks, §5 says so and
names the narrowing rather than skipping the question. Where a "decision" is not really one because
mechanics settle it, it is in §6 so we do not spend a meeting on it.

### 0.2 The conflict with the PRD, stated up front

PRD §12 says **"No human collaboration. One person, own devices — no sharing, no multi-user
accounts, no comments."** The header of that document says single-tenant, not a product.

This document drives toward a multi-tenant future, which contradicts that non-goal, and the
contradiction should be resolved deliberately rather than by drift (§9). Two things make it worth
doing now anyway:

1. **Most of what is below is single-tenant work.** Sessions, devices, reinstall, room switching and
   the roster-of-duplicate-Yous are all problems for one person with three devices. They do not need
   a second human to be real, and three of them are shipping today.
2. **The multi-tenant question turns out to be one specific decision**, not a diffuse direction — it
   is D-14, whether the relay stops being a dumb pipe. Everything else can be decided without
   answering it, as long as it is decided knowing which way it leans.

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

**b. The local database is room-independent.** `DB_NAME` is the constant `'done'` and nothing passes
`dbName` outside tests. The room, meanwhile, lives only in the sync configuration. So the room does
not select a document — it selects **who your one local document tries to merge with.** Changing the
room in settings does not open a different document; it points your existing document at a different
remote and converges the two. Whatever "switch rooms" is supposed to mean, that is almost certainly
not it (D-11).

**c. The relay's token is not per room.** `RelayPolicy` is one shared `token` plus an allowlist of
`rooms`. Anyone holding the token may connect to any allowed room. There is no per-user credential
and nothing that ties an identity to a room, so the current auth model **cannot separate tenants** —
not weakly, not at all (D-14).

**d. Storage failure silently reissues identity.** Every localStorage access in `localStore.ts` is
wrapped and swallows its error, deliberately, so the app starts even where storage is denied. The
consequence is that in a context without durable localStorage — private browsing, storage blocked,
or after Safari evicts script-writable storage for a site not used in a week — **every launch is a
new actor and a new device**, silently, and each one leaves a permanent entry in the synced roster.

**e. There is no session.** `doc.clientID` is the only per-tab identity that exists, it is a Yjs
implementation detail, it is random, and it is what the peer list is currently counting when it says
`Mac, Mac`.

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

**D-2. Is an identity per person, per device, or a labelled pair?**

| Option             | The user sees                                                     | Forces                                                                               |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Per device (today) | One "You" per device; three devices, three colours.               | S18 is by design. Undo is per device, which is at least consistent.                  |
| Per person         | One "You" everywhere, whatever device it came from.               | Needs D-4. Makes cross-device undo a real question (D-7).                            |
| A labelled pair    | "Tom — phone", "Tom — laptop", grouped as one person in any list. | Keeps today's mechanism; changes only presentation. Needs a person-level name (D-1). |

**D-3. Are device names worth improving?** Today they are user-agent guesses (`Mac`, `Android`) and
two of the same kind collide. Options: leave them, prompt on first sync, or disambiguate
automatically ("Mac (2)"). Small, but it is the label the whole device level surfaces through.

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

**D-7. If actors span devices (D-2), should undo span them too?** Undo is currently per session, and
the PRD describes it as per actor. If one actor spans devices, those two statements diverge further:
should the laptop be able to undo what the phone typed? Options: no — undo is always the session's
own history (today's behaviour, and what every tabbed editor does); yes within a device; yes
anywhere. This is a decision about the PRD's own sentence as much as about code.

### 5.3 Sessions — D-8, D-9

**D-8. What is a session allowed to be seen doing?** Options for carets: none between your own tabs;
per-session carets in the actor's colour (the multi-tab note's conclusion); per-session carets only
when more than one actor is present. And for the peer list: group by device, list sessions, or both.

**D-9. Does the app ever tell you how many tabs you have open?** Options: never; always; only when it
explains something the user is otherwise owed — a search index held by another tab, or two tabs of
the same document open on one screen. The cost of "always" is a number nobody acts on, which is the
kind of thing PRD §7.4 is otherwise careful about.

### 5.4 Rooms — D-10, D-11

**D-10. Is sync configuration a property of the device or of the document?** Today: the device, and
each browser profile is configured independently by hand (S13, S23). Options: keep it local (a token
belongs to the browser it was typed into, which is TRD §4.8's stated reason); sync the endpoint but
not the token; sync everything but the token and prompt for that.

**D-11. What is a room?** The largest decision here, and the one §2.2b shows is already half-made in
a direction nobody chose.

| Option                            | The user sees                                                      | Forces                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A relay detail, typed once        | One document, forever. The room field is plumbing.                 | S21, S22, S24 are permanent non-goals. Simplest, and honest about today.                                                                                                                                        |
| **A document** — a room names one | Switching rooms shows a different document. Nothing merges.        | The local database becomes room-derived; the existing `done` database happens to match the default room name, which makes the migration lucky rather than hard. Raises whether the actor is per room or global. |
| A share of one document           | Today's behaviour: switching re-points the merge.                  | Keep only if the field is renamed to say so, because "room" does not say it.                                                                                                                                    |
| Several rooms at once             | A picker; multiple local documents; possibly several open editors. | The biggest change in this document. Multiplies every level below it.                                                                                                                                           |

### 5.5 Resets — D-12, D-13

**D-12. What does the app do when local identity is gone but the document remembers it?** S7, S29,
S30. Options: silently mint a new one (today); notice and offer D-4's claim flow; or notice and say
so without offering anything, which is at least honest. Related: should the app ever _tell_ the user
that storage is not durable? `requestPersistentStorage` already reports granted/denied and the menu
already shows it, so there is a surface for this.

**D-13. Is there a deliberate "start fresh" or "not me" action?** Options: none; reset identity only;
reset identity and document. Single-tenant this is near-useless; under D-14 it becomes sign-out, and
the two are the same button.

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

Everything else in this document can be decided before D-14, provided each choice records which way
it leans. D-4's roster picker, for instance, is fine under "no" and a hole under "yes".

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

| ID       | Question                                                | Blocks                     | If left undecided                                    |
| -------- | ------------------------------------------------------- | -------------------------- | ---------------------------------------------------- |
| **D-1**  | Does the user tell the app who they are, and when?      | D-2, D-4, first-run design | Generated names forever; S18 unfixable               |
| **D-2**  | Is identity per person, per device, or a labelled pair? | D-4, D-7, attribution UI   | Per device, undeclared                               |
| **D-3**  | Are device names worth improving?                       | Menu copy                  | Two devices both called `Mac`                        |
| **D-4**  | Can a new device claim an existing actor?               | S6, S7, S18, S31           | Every device is a new actor forever                  |
| **D-5**  | What happens when sync first meets a non-empty room?    | S10                        | Silent irreversible merge                            |
| **D-6**  | Can dead actors be pruned?                              | S32                        | The roster only grows                                |
| **D-7**  | Does undo span devices if an actor does?                | PRD §11.3 wording          | Per session, as today, with the PRD saying otherwise |
| **D-8**  | What may a session be seen doing?                       | Multi-tab work (PR #18)    | Blocks the caret and peer-list changes               |
| **D-9**  | Does the app ever show a tab count?                     | Menu                       | No                                                   |
| **D-10** | Is sync configuration per device or per document?       | S13, S23                   | Per device, configured by hand each time             |
| **D-11** | What is a room?                                         | S14, S21–S24, D-5          | "A share of one document", which nobody chose        |
| **D-12** | What happens when local identity is lost?               | S7, S29, S30               | Silent new identity                                  |
| **D-13** | Is there a deliberate reset?                            | S19                        | No                                                   |
| **D-14** | Does the relay stop being a dumb pipe?                  | S25–S28, D-4               | Multi-tenancy stays cooperative-only and undeclared  |

Suggested order for working through these together, on dependency rather than importance: **D-11**
(what a room is) and **D-14** (what the relay is) first, because they constrain the rest; then
**D-1** and **D-2**; then **D-4**, **D-5** and **D-12**, which are the flows the user actually walks
through; then **D-8** and **D-9**, which the multi-tab work is waiting on; then the remainder.

---

## 9. PRD amendments this would require

- **§0 Terminology** — add device, session and room beside actor, since three of the four are already
  in the code and none of them is defined in the document.
- **§11.3** — "One human actor, created on first run" is true per device and false per person
  (§2.2a). Either the sentence changes or the behaviour does; today they disagree silently.
- **§11.3** — "Undo scoped to your own changes" needs to say at what level. It is per session.
- **§12** — the non-goal "No human collaboration. One person, own devices — no sharing, no multi-user
  accounts" is what D-14 asks about. If D-14 is "no", this document narrows to single-tenant identity
  hygiene and the non-goal stands as written. If "yes", the non-goal and the document's
  single-tenant framing both have to be rewritten, not footnoted.
- **§14 Open questions** — D-1 through D-14 belong here, or here by reference, once decided.
- **A new section, or this document promoted** — the four levels (§1) are product surface, not an
  implementation detail, and they are currently written down nowhere.

## 10. Out of scope for this document

- **How any of it is built.** No storage shapes, no protocols, no migrations beyond noting where one
  would be needed. That is the TRD's, once the decisions exist.
- **The multi-tab implementation**, which is specified separately (PR #18) and which needs D-8 and
  nothing else here.
- **Permissions.** PRD §11.4 already settles that they do not follow from the actor model, and D-14
  is where the subject legitimately reopens.
- **Sharing a single day, a single card, or a link to anything.** Not raised by any scenario above,
  and a different feature.
