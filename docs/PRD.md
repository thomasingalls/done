# done — Product Requirements

**Status:** Draft v1
**Date:** 2026-08-05
**Audience:** one user (the author). This is a single-tenant personal tool, not a product.

---

## 1. What this is

A local-first PWA that reifies a specific task-management workflow the author already
practices on paper and in text files. It is not a general task manager, and it should
not grow features to become one. The workflow has four moving parts:

1. **A master list** of tasks and projects, loosely structured. No forced hierarchy,
   no mandatory metadata, no required due dates.
2. **A daily entry** that records *what actually got done*. Crucially, the things
   recorded here are often not items lifted from the master list — frequently they're
   subtasks, incidental work, or things that only became visible once the day started.
3. **A "Next" list** for the current day: at most **three** items, each of which must be
   *task-shaped* rather than *project-shaped*.
4. **Scheduled items** attached to specific days, for today and any future day.

The entire value of the tool is in how well it supports **writing and reading text**.
Everything else is subordinate to that.

## 2. Design principles

These are ranked. When two conflict, the higher one wins.

1. **Text entry is the product.** Every interaction budget goes here first. If a feature
   makes the editor worse, the feature loses.
2. **Structure is opt-in, never demanded.** The tool must never block you from writing
   something down because you haven't told it what kind of thing it is.
3. **Offline is the normal state, not a degraded one.** No spinner, no "reconnecting"
   banner, no read-only mode when the network is gone. Sync is a background convenience.
4. **Your data outlives the app.** Plain-markdown export is a first-class requirement,
   not a checkbox.
5. **Constraints are the feature.** The three-item cap on Next is not a limitation to be
   worked around; enforcing it is a core function.

## 3. Explicit non-goals

- **No images.** Not in v1, not later. Attachments, embeds, pasted screenshots — all out.
- **No collaboration.** Sync is one person across their own devices. No sharing, no
  permissions, no presence cursors, no comments.
- **No notifications or reminders.** This tool does not interrupt you.
- **No time tracking, estimates, velocity, or analytics.**
- **No tags/labels taxonomy in v1.** Plain text search covers it; a taxonomy invites
  the structure-maintenance overhead this workflow exists to avoid.
- **No recurring tasks in v1.** Revisit only if the absence proves painful in real use.
- **Not inventing local-first techniques.** Use boring, proven libraries.

## 4. Core concepts

### 4.1 Item

The atom. An item is a line of markdown, typically a list item, that may or may not have
a stable identity.

Most items are **anonymous** — just text in a list. An item acquires a **stable ID** only
when it needs one: when it's scheduled, promoted to Next, referenced from a day entry, or
given subtasks. This keeps the master list feeling like a text file rather than a database
form, while still allowing real cross-referencing where it matters.

An item has no required fields beyond its text. Optionally it carries: completion state,
a scheduled date, and a parent.

**Task-shaped vs project-shaped** is a distinction the author makes intuitively: a task is
something you could sit down and finish in one sitting; a project is something that
decomposes further. **v1 does not attempt to detect or enforce this.** The data model
reserves room for it (§8) and an LLM-assisted check is deferred to a later phase.

### 4.2 Master list (Goals view)

One long, freely-structured markdown outline containing everything: tasks, projects,
someday-maybes, notes-to-self. Nesting is allowed and meaningful (subtasks) but never
required. This is a document you write in, not a table you fill.

Completed items stay in place, struck through, until manually cleared. The list is a
working surface, not an archive.

### 4.3 Day entry

One markdown document per calendar date. It has three regions:

**Log** — free prose plus list items describing what got done. This is the primary
writing surface of the app and where most keystrokes land. Items here can be typed
directly, or pulled in as a reference to a master-list item (which then reflects that
item's live title and completion state).

**Next** — at most three items, today only. See §5.

**Scheduled** — items assigned to this date. Present on today and all future days.
Absent (or read-only) on past days.

Day entries are created lazily; an untouched day has no entry and consumes nothing.

### 4.4 The three-item cap

Hard cap, not a warning. Adding a fourth item to Next requires displacing one of the
existing three, in a single deliberate interaction: pick which one to bump, and choose
whether it goes back to the master list or is marked done. There is no override, no
"just this once", no setting to raise the limit. If the cap can be quietly exceeded it
provides no value.

Next lists are recorded historically. Looking at a past day shows what you had committed
to that day, read-only, alongside what you actually logged. This gap is diagnostic and
worth preserving.

## 5. Navigation model

The app is a spatial plane. Today is the origin, and every view is a fixed direction away
from it. There is no navigation stack, no back button semantics, no nested screens.

```
                    ┌──────────┐
                    │   PAST   │   (drag down / ↑ key)
                    └────┬─────┘
                         │
   ┌────────┐       ┌────┴─────┐       ┌────────┐
   │  MENU  │───────│  TODAY   │───────│ GOALS  │
   └────────┘       └────┬─────┘       └────────┘
   (drag right)          │             (drag left)
                    ┌────┴─────┐
                    │  FUTURE  │   (drag up / ↓ key)
                    └──────────┘
```

- **Days run vertically**, journal-style: past is above, future is below. Dragging *down*
  pulls earlier days into view. This matches how you scroll back through a chat log.
- **Goals sits to the right** of Today; drag left to bring it in.
- **Menu sits to the left**; drag right to bring it in. Contains at minimum: a calendar
  picker for jumping to an arbitrary date, full-text search, and settings.
- Movement is **continuous and interruptible** — the adjacent view is partially visible
  during the drag, and releasing below the threshold snaps back. Navigation should feel
  like moving a sheet of paper, not like a page transition.

### 5.1 Desktop is keyboard-first

Half the target platforms are desktop, where mouse-dragging to navigate is an unusual and
slow interaction. On desktop the spatial model is preserved but driven by keys:

- Arrow keys / `h j k l` with a modifier move along the axes.
- `Cmd/Ctrl-K` opens a command palette (jump to date, search, toggle views).
- `t` returns to today from anywhere.

Dragging still works on desktop with a mouse, but it is never the only way to do
something.

### 5.2 The gesture/editing conflict

This is the highest UX risk in the project and needs explicit resolution rather than
discovery during implementation. A full-surface drag gesture directly competes with:

- Placing a cursor and selecting text (the app's primary activity).
- Android Chrome's edge-swipe back navigation.
- Scrolling a day entry longer than the viewport.

The v1 resolution: navigation gestures require a **directional lock** after a small
movement threshold, vertical drags inside a scrollable editor scroll it and only navigate
at scroll extremes, and horizontal navigation is additionally available from a persistent
non-editor chrome strip. Edge-swipe conflict is handled by not requiring gestures to
start at the screen edge. This needs validation on a real device early — see the
Phase 1 exit criteria in §9.

## 6. Editing experience

The bar is Obsidian's Live Preview, and this is a hard requirement, not an aspiration:

- The document is **plain markdown, always**. What's stored is what you typed, byte for
  byte. No rich-text model, no HTML, no lossy round-trip.
- Formatting renders **while you edit**. Bold text is bold as you type it.
- Syntax characters are **visible on the line your cursor is on** and hidden elsewhere.
  Moving the cursor into a heading reveals its `##`; moving away hides it again.
- Line heights must not shift when syntax is revealed or hidden. Text must not jump under
  the cursor.

Supported markdown: headings, bold/italic/strikethrough, inline code, code blocks, links,
blockquotes, bullet/numbered lists, task checkboxes, horizontal rules. **No images, no
tables in v1** (tables are a live-preview implementation cost with little payoff for this
workflow).

Editor behaviors that matter disproportionately: list continuation on Enter, `Tab`/
`Shift-Tab` to indent list items, checkbox toggle by click and by keystroke, and
smart handling of selection across formatting marks.

## 7. Sync

Sync must never be a precondition for use. The app is fully functional with no account,
no server configured, and no network — that is the default state on first launch.

When the user chooses to configure a sync endpoint, changes propagate between their
devices automatically and merge without conflict prompts. Two devices editing the same
day while both offline must both survive and merge on reconnect; the user is never asked
to resolve a conflict, and text edits merge at character granularity.

The sync endpoint is a dumb relay. It holds no authority over the data, runs no
application logic, and its unavailability is invisible to the user beyond a subtle
"last synced" indicator in the menu.

## 8. Data portability

- **Export**: the entire dataset writes out as a folder of plain `.md` files — one per
  day plus one for the master list — readable in Obsidian or any text editor, with no
  proprietary wrapper.
- **Import**: at minimum, restore from a previous export.
- Export must be possible from the app with no server involved.

## 9. Phasing

**Phase 1 — the editor.** CodeMirror with live-preview markdown, one document, local
persistence only. No sync, no navigation, no items. *Exit criteria: the author prefers
writing in it over a plain textarea, and the gesture/editing conflict from §5.2 is
resolved on a real Android device.*

**Phase 2 — the workflow.** Day entries, master list, Next with the three-cap, scheduled
items, spatial navigation, keyboard equivalents. *Exit criteria: the author uses it daily
for two weeks without falling back to their previous system.*

**Phase 3 — sync.** Relay deployment, multi-device. *Exit criteria: phone and laptop stay
consistent across a week of ordinary use including offline edits on both.*

**Phase 4 — search and retrieval.** Full-text search, calendar picker, cross-references.

**Phase 5 — deferred: LLM assistance.** Scope-checking the Next list — flagging when an
item is project-shaped rather than task-shaped. Explicitly out of scope until the
preceding phases are in daily use, and it must remain an advisory overlay that never
blocks or rewrites user text.

## 10. Open questions

1. **Clearing completed items from the master list.** Manual only, or an "archive done"
   action? Leaning manual, but this may become annoying quickly.
2. **What happens to an unfinished Next item at midnight?** Silently carries to the new
   day, is dropped, or prompts? Carrying silently risks a permanently stale list; dropping
   loses the commitment. Leaning: carry, but visually mark it as carried over with a day
   count, so staleness is legible.
3. **Should the Log be able to reference an item without the item existing in the master
   list?** (i.e. can a day-entry item be promoted *into* the master list?) Probably yes,
   but the interaction needs design.
4. **Timezone/day-boundary handling** for a user who works past midnight. Configurable
   day-rollover hour, or strict local midnight?
