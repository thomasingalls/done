# done — Product Requirements

**Status:** Draft v3
**Date:** 2026-08-05
**Audience:** one user (the author). Single-tenant personal tool, not a product.

---

## 0. Terminology

**"Journal"** is the day's free-prose surface — the record of what got done. Earlier
drafts called this "the log"; that name is retired because in a Yjs project "log"
unavoidably reads as the CRDT update log. Nothing in this document refers to Yjs internals.

**"Freeze"** is a UX rule: a surface becomes read-only. **"Compaction"** is a storage
optimization with no user-visible effect. They are deliberately independent — see §6.

---

## 1. What this is

A local-first PWA that reifies a task-management workflow the author already practices.
It is not a general task manager and should not grow features to become one. Four moving
parts:

1. **A master list** of tasks and projects, loosely structured. No forced hierarchy, no
   mandatory metadata, no required dates.
2. **A daily journal** recording *what actually got done*. What lands here is often not
   lifted from the master list — frequently it's a subtask, incidental work, or something
   that only became visible once the day started.
3. **A Next list** for the current day: at most **three** items, task-shaped rather than
   project-shaped.
4. **Scheduled items** attached to specific days, today and forward.

The entire value of the tool is in how well it supports **writing and reading text**.
Everything else is subordinate.

## 2. Design principles

Ranked. When two conflict, the higher wins.

1. **Text entry is the product.** If a feature makes the editor worse, the feature loses.
2. **Structure is opt-in, never demanded.** Never block the user from writing something
   down because they haven't said what kind of thing it is.
3. **Offline is the normal state, not a degraded one.** No spinner, no reconnecting
   banner, no read-only mode when the network is gone.
4. **Your data outlives the app.** Plain-markdown export is a requirement, not a checkbox.
5. **Constraints are the feature.** The three-item cap is not a limitation to work around;
   enforcing it is a core function.
6. **The past is written, not read.** The value is in the act of recording, not in the
   archive. Assume history is essentially never revisited. This is why the freeze has no
   escape hatch (§6), why compaction is safe, and why retrieval is weighted toward recent
   days and the master list rather than deep history (§11).
7. **Don't build a calendar.** The author has one. Nothing here tracks deadlines,
   durations, reschedule counts, or completion rates.

## 3. Documents vs. collections

The central structural decision, and the answer to "how much structure where."

Two surfaces are **documents**. The unit of interaction is the whole text; you write prose
in them; structure is whatever you typed. Strong structure makes them worse.

- **Master list** — freely-structured markdown outline. Everything: tasks, projects,
  someday-maybes, notes-to-self. Nesting allowed, never required.
- **Daily journal** — free prose and lists describing what got done.

Three are **collections**. The unit of interaction is the *item*. They have cardinality
(≤3), membership that moves between them, per-item state, and per-item interaction.

- **Next**, **Scheduled**, **Done**.

Collection items are **cards**: an independently-editable block of markdown with its own
chrome. Within a card, the first line is the **title** (high contrast) and everything after
is the **description** (lower contrast). This is presentation over markdown, not a schema —
the card contains ordinary text.

Everything remains markdown at the bottom. The difference is only whether the app tracks
identity and ordering for you, and it does that solely where the workflow demands it.

## 4. Item movement

Moving items between surfaces is the workflow's actual mechanic, so flows are specified by
difficulty on purpose.

| From → To | Difficulty | Flow |
|---|---|---|
| *nothing* → Done | **Trivial. Non-negotiable.** | Persistent compose field at the foot of Done. Type, Enter, done. |
| Next → Done | **Trivial.** | One gesture on the card. Single atomic move. |
| Scheduled → Next / Done | Easy | One gesture. |
| Master → Next / Scheduled / Done | Deliberate, two steps | **Copy-to** places a copy in the target; **Remove** separately deletes from master. Never one action. |
| Journal line → Master | Deliberate | Explicit promote action. |
| Done → editable | **Deliberately hard** | Long-press or explicit unlock. See §5. |

The master list is **not** expected to stay 1:1 with what appears in daily views. Copying
out of it does not remove from it. Clearing completed items from the master list is
**manual only** — no auto-archive.

## 5. Done items are guarded

Done is a record. Once written, editing it should require intent.

Creation is easy and editing is hard, and these don't conflict because they're different
affordances. A done card renders as static text and does not become editable by tapping it;
unlocking is a long-press (mobile) or explicit action (desktop). Meanwhile the compose
field is always live at the foot of the list, so recording something new is a single
uninterrupted keystroke path.

## 6. Days go read-only

Unfinished Next items are **left where they are** at midnight. Not carried forward, not
dropped, not prompted about.

**Freeze:** three days after its date, a day's **Next, Scheduled, and Done become
permanently read-only.** There is no unfreeze, no override, and none will be added later.
Per principle 6, the past is not going to be read again; a freeze with an escape hatch
isn't a freeze.

The **daily journal stays editable indefinitely.** The journal is where writing happens and
the freeze exists to protect commitment records from retroactive editing, not to lock the
prose. *(Still my call rather than a stated requirement — cheap to reverse.)*

**The master list never freezes.** It is a living document with no date attached.

Before the freeze lands, a passive indicator (dot, banner — something ambient, not modal)
surfaces that there are stale Next items in recent days, with bulk actions:

- **Move all to Scheduled for today**
- **Move all to the master list**

The three-day window is deliberately coarse so nothing depends on knowing precisely when
the user's midnight is (§8).

**Compaction is a separate concern.** How the app stores frozen days internally is a
storage decision with no user-visible behavior, it happens on a different schedule, and it
must never be conflated with the freeze rule. See TRD §4.5.

## 7. Layout and navigation

### 7.1 Narrow — a spatial plane

Today is the origin. Every view is a fixed direction away. No navigation stack, no back
button semantics, no nested screens.

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

Days run vertically, journal-style: past above, future below. Menu (calendar picker,
search, settings) sits left; Goals sits right. Movement is continuous and interruptible —
the adjacent view is partially visible during the drag, and releasing below threshold snaps
back. It should feel like moving a sheet of paper, not a page transition.

### 7.2 Gestures: swipe navigates, long-press-then-drag selects

A plain swipe anywhere is navigation, including over text. Text *selection* requires
long-press first, then drag. Tapping to place a cursor is unaffected.

This prioritizes the frequent action over the rare one, which is right for a phone. The
cost is that selection becomes a two-stage deliberate act, and the long-press entry point
overlaps the Done-card unlock gesture — those disambiguate by context (Done cards are
static, so long-press unlocks; long-press in live text starts selection).

### 7.3 Wide — three panels

```
┌──────────┬─────────────────────────┬──────────────┐
│          │   ┌───── yesterday ───┐ │              │
│   MENU   │   ╰───────────────────╯ │    GOALS     │
│          │  ┌─────────────────────┐│              │
│ calendar │  │                     ││   master     │
│ search   │  │       TODAY         ││   list       │
│ settings │  │                     ││              │
│          │  └─────────────────────┘│              │
│          │   ╭─── tomorrow ──────╮ │              │
└──────────┴─────────────────────────┴──────────────┘
```

Today and Goals each fill viewport height and scroll internally — the page itself never
scrolls or overflows. Above and below Today, adjacent days peek through as faded, rounded,
dimmed panel edges that hint at their existence and act as click targets to move a day.

### 7.4 Medium — two panels, menu behind a trigger

At half-screen width the menu collapses behind a trigger. Today and Goals stay side by
side; half width is still enough for text-only content to remain usable in both.

```
┌─────────────────────────┬──────────────┐
│   ┌───── yesterday ───┐ │              │
│  ┌─────────────────────┐│    GOALS     │
│  │       TODAY         ││              │
│  └─────────────────────┘│              │
│   ╭─── tomorrow ──────╮ │              │
└─────────────────────────┴──────────────┘
```

**The menu trigger's location is deliberately unspecified.** It is the author's call and
has not been made. No layout, component boundary, or spacing decision may assume a
position for it. When the decision arrives it should not force a re-layout of anything
above.

The opened menu may overlay or push; that follows from the trigger decision and is
likewise open.

### 7.5 Keyboard

Desktop is keyboard-first: arrow keys or `h j k l` with a modifier move along the axes,
`Cmd/Ctrl-K` opens a command palette, `t` returns to today.

## 8. Time

Dates are stored in UTC and displayed in local time. Day rollover happens in the user's
last-known timezone. Rollover hour is configurable, but this is an affordance, not a
feature.

**Any feature leaning heavily on knowing precisely when the user's midnight is requires
serious justification.** The three-day freeze is coarse enough that ±1 day of timezone
ambiguity is immaterial, and that is the standard for anything time-dependent.

## 9. Scheduled items

A scheduled item means **"I think I'm going to do this task on this day."** That is the
whole semantic. It is not a due date, not a calendar event, not a commitment being tracked.

Consequently a scheduled item is simply a card living in a day's collection. **The day it
lives in is its date** — there is no separate date field, and therefore no reschedule
history, no slip counter, and no distinction between cut-and-pasting an item forward and
leaving it behind while re-adding it tomorrow. Both are ordinary card operations and the
app has no opinion about which you use.

*(An earlier draft asked whether reschedule history was worth capturing. It isn't. The
repetition is already visible in the days themselves, and per principle 6 nobody would open
a slip report. Question withdrawn.)*

For the same reason there is **no inline date syntax** (`📅2026-09-01`) and **no completion
timestamps** (`✅2026-08-04`) in documents. Both are deadline-tracking scaffolding for a
system this explicitly isn't. Anything the user genuinely wants to note can be typed as
plain text and found by search.

## 10. Editing experience

The bar is Obsidian's Live Preview, and it's a hard requirement:

- The document is **plain markdown, always**. What's stored is what you typed, byte for
  byte. No rich-text model, no lossy round-trip.
- Formatting renders **while you edit**.
- Syntax characters are **visible on the line the cursor is on**, hidden elsewhere.
- **Line heights must not shift** when syntax reveals or hides. Text must never jump under
  the cursor.

Supported: headings, bold/italic/strikethrough, inline code, code blocks, links,
blockquotes, bullet/numbered lists, task checkboxes, rules. **No images. No tables in v1.**

Behaviors that matter disproportionately: list continuation on Enter, `Tab`/`Shift-Tab`
indentation, checkbox toggle by click and keystroke, clean selection across formatting
marks.

Inside a card, **three consecutive returns splits into a new card.** Three is a starting
guess — likely too undiscoverable, and expected to drop to two or one once the interaction
proves out. It is a tunable, not a decision.

## 11. Explicit non-goals

- **No images**, ever. No attachments, embeds, or pasted screenshots.
- **No collaboration.** One person, own devices.
- **No notifications or reminders.** This tool does not interrupt you.
- **No time tracking, estimates, velocity, deadlines, or analytics.**
- **No tags/labels taxonomy in v1.** Search covers it; a taxonomy invites the
  structure-maintenance overhead this workflow exists to avoid.
- **No recurring tasks in v1.**
- **Not inventing local-first techniques.**

## 12. Phasing

**Phase 1 — the editor.** Live-preview markdown, one document, local persistence. No sync,
no navigation, no cards. *Exit: the author prefers it to a plain textarea, and the
swipe-vs-select gesture model works on a real Android device.*

**Phase 2 — the workflow.** Documents, collections, cards, the three-cap, movement flows,
spatial navigation, responsive layouts. *Exit: daily use for two weeks with no fallback to
the previous system.*

**Phase 3 — sync.** Relay deployment, multi-device. *Exit: phone and laptop consistent
across a week including offline edits on both.*

**Phase 4 — retrieval.** Search and calendar picker, scoped by principle 6: search over the
master list and recent days earns its place; deep-history search and backlink graphs
probably don't. Build the narrow version and see whether the rest is ever missed.

**Phase 5 — deferred: LLM assistance.** Scope-checking Next for project-shaped items. Out
of scope until the above are in daily use, and it must remain advisory — never blocking,
never rewriting user text.

## 13. Open questions

1. **Menu trigger placement** (§7.4) — author's call, not yet made. Deliberately left open.
2. **Card split threshold** (§10) — three returns is a starting guess.
3. **Does the daily journal freeze?** §6 says no. Low-stakes and cheap to reverse, but it's
   my call rather than a stated requirement.
