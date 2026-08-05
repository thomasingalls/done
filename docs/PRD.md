# done — Product Requirements

**Status:** Draft v2
**Date:** 2026-08-05
**Audience:** one user (the author). Single-tenant personal tool, not a product.

---

## 1. What this is

A local-first PWA that reifies a task-management workflow the author already practices.
It is not a general task manager and should not grow features to become one. Four moving
parts:

1. **A master list** of tasks and projects, loosely structured. No forced hierarchy, no
   mandatory metadata, no required dates.
2. **A daily log** recording *what actually got done*. What lands here is often not lifted
   from the master list — frequently it's a subtask, incidental work, or something that
   only became visible once the day started.
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

## 3. Documents vs. collections

The central structural decision, and the answer to "how much structure where."

Two of these surfaces are **documents**. The unit of interaction is the whole text; you
write prose in them; structure is whatever you typed. Strong structure makes them worse.

- **Master list** — freely-structured markdown outline. Everything: tasks, projects,
  someday-maybes, notes-to-self. Nesting allowed, never required.
- **Daily log** — free prose and lists describing what got done.

Three are **collections**. The unit of interaction is the *item*. They have cardinality
(≤3), membership that moves between them, per-item state, and per-item interaction.

- **Next**, **Scheduled**, **Done**.

Collection items are **cards**: an independently-editable block of markdown, rendered with
its own chrome. Within a card, the first line is the **title** (high contrast) and
everything after is the **description** (lower contrast). This is presentation over
markdown, not a schema — the card contains ordinary text.

Everything remains markdown at the bottom. The difference is whether the app tracks
identity and ordering for you, and it only does that where the workflow demands it.

## 4. Item movement

Moving items between surfaces is the workflow's actual mechanic, so the flows are
specified by difficulty on purpose.

| From → To | Difficulty | Flow |
|---|---|---|
| *nothing* → Done | **Trivial. Non-negotiable.** | Persistent compose field at the foot of Done. Type, Enter, done. |
| Next → Done | **Trivial.** | One gesture on the card (checkbox / swipe). Single atomic move. |
| Scheduled → Next / Done | Easy | One gesture. |
| Master → Next / Scheduled / Done | Deliberate, two steps | **Copy-to** places a copy in the target; **Remove** separately deletes from master. Never one action. |
| Log line → Master | Deliberate | Explicit promote action. |
| Done → editable | **Deliberately hard** | Long-press or explicit unlock. See §5. |

The master list is **not** expected to stay 1:1 with what appears in daily views. Copying
out of it does not remove from it. Clearing completed items from the master list is
**manual only** — no auto-archive.

## 5. Done items are guarded

Done is a record. Once written, editing it should require intent.

Creation is easy and editing is hard, and these do not conflict because they're different
affordances. A done card renders as static text; it does not become editable by tapping
it. Unlocking is a long-press (mobile) or explicit action (desktop). Meanwhile the compose
field is always live at the foot of the list, so recording something new is a single
uninterrupted keystroke path.

## 6. Days go read-only

Unfinished Next items are **left where they are** at midnight. They are not carried
forward, not dropped, not prompted about.

Instead, a day's **commitment records — Next, Scheduled, and Done — become permanently
read-only three days after that date.** Before that lands, the app surfaces a passive
indicator (dot, banner, whatever reads as ambient rather than modal) that there are stale
Next items in recent days worth resolving, with bulk actions:

- **Move all to Scheduled for today**
- **Move all to the master list**

The **daily log stays editable indefinitely.** The log is a journal, and retrospective
notes are legitimate; the commitment records are a record of what you said you'd do, and
their value depends on not being retconned. *(This split is an interpretation — see §11
Q1.)*

The three-day window is deliberately coarse so that nothing depends on knowing precisely
when the user's midnight is (§8).

## 7. Layout and navigation

### 7.1 Mobile — a spatial plane

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
search, settings) sits left. Goals sits right. Movement is continuous and interruptible —
the adjacent view is partially visible during the drag, and releasing below threshold
snaps back. It should feel like moving a sheet of paper, not a page transition.

### 7.2 Mobile gestures: swipe navigates, long-press-then-drag selects

A plain swipe anywhere is navigation, including over text. Text *selection* requires
long-press first, then drag. Tapping to place a cursor is unaffected.

This prioritizes the frequent action over the rare one, which is right for a phone. The
cost is that selection becomes a two-stage deliberate act, and the long-press entry point
partially overlaps the Done-card unlock gesture — those two need to be distinguishable by
context (Done cards are static, so long-press there unlocks; long-press in live text
starts selection).

### 7.3 Desktop — responsive panels, not gestures

Above a width breakpoint the same three surfaces sit side by side:

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

Today and Goals each fill the viewport height and scroll internally — the page itself
never scrolls or overflows. Above and below Today, the adjacent days peek through as
faded panel edges (rounded corners, dimmed) that hint at their existence and act as click
targets to move a day.

Desktop is keyboard-first: arrow keys or `h j k l` with a modifier move along the axes,
`Cmd/Ctrl-K` opens a command palette, `t` returns to today.

**Half-width desktop is deferred** — an intermediate breakpoint is needed but its layout
is not yet specified.

## 8. Time

Dates are stored in UTC and displayed in local time. Day rollover happens in the user's
last-known timezone. Rollover hour is configurable, but this is an affordance, not a
feature.

**Any feature that leans heavily on knowing precisely when the user's midnight is requires
serious justification.** The three-day freeze is coarse enough that a ±1 day timezone
ambiguity is immaterial, and that is the intended standard for anything time-dependent.

## 9. Editing experience

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
indentation, checkbox toggle by click and keystroke, and clean selection across formatting
marks.

Inside a card, **three consecutive returns splits into a new card.** Three is chosen
because it's unlikely to fire accidentally; it is almost certainly too undiscoverable and
will likely drop to two or one once the interaction proves out. Treat the threshold as a
tunable, not a decision.

## 10. Explicit non-goals

- **No images**, ever. No attachments, embeds, or pasted screenshots.
- **No collaboration.** One person, own devices. No sharing, permissions, presence, or
  comments.
- **No notifications or reminders.** This tool does not interrupt you.
- **No time tracking, estimates, velocity, or analytics.**
- **No tags/labels taxonomy in v1.** Search covers it; a taxonomy invites the
  structure-maintenance overhead this workflow exists to avoid.
- **No recurring tasks in v1.**
- **Not inventing local-first techniques.**

## 11. Phasing

**Phase 1 — the editor.** Live-preview markdown, one document, local persistence. No sync,
no navigation, no cards. *Exit: the author prefers it to a plain textarea, and the
swipe-vs-select gesture model works on a real Android device.*

**Phase 2 — the workflow.** Documents, collections, cards, the three-cap, movement flows,
spatial navigation, responsive desktop layout. *Exit: daily use for two weeks with no
fallback to the previous system.*

**Phase 3 — sync.** Relay deployment, multi-device. *Exit: phone and laptop consistent
across a week including offline edits on both.*

**Phase 4 — retrieval.** Full-text search, calendar picker, cross-references, backlinks.

**Phase 5 — deferred: LLM assistance.** Scope-checking Next for project-shaped items.
Out of scope until the above are in daily use, and it must remain advisory — never
blocking, never rewriting user text.

## 12. Open questions

1. **Does the freeze apply to the log, or only to Next/Scheduled/Done?** §6 assumes
   commitments freeze and the log stays open. Needs confirmation — it's the difference
   between "the past is a record" and "the past is read-only."
2. **Is there any unfreeze escape hatch?** A freeze with an easy override isn't a freeze;
   no override at all makes last week's typo permanent. Suggest: none in v1, add a
   deliberately tedious per-day unlock only if the absence actually hurts.
3. **Half-width desktop layout** (§7.3) — deferred, needs a pass.
4. **Do Scheduled items belong to a day, or carry a date?** If a scheduled item moves from
   Thursday to Friday, is it the same item with a changed date, or a move between two
   days' collections? Affects whether reschedule history is visible.
5. **Card split threshold** — three returns is a starting guess (§9).
