# Goals context, scanning and nearby transfer controls

2026-10-23 · design study · sequential patch61 · no application implementation selected.

The operator asked to specify three interactions before coding: automatic card context from parent
headings, a better scanning experience without gathering, and move/copy controls nearer the writing.
The separate mobile formatting feasibility report follows in patch62. This packet contains fictional
sample writing only. The existing app, preview8443, account data, dependencies and security guarantees
are unchanged.

## Open the sketch

[Standalone interactive HTML](mockup.html) has three tabs, narrow layouts, dark/light previews,
folding, source-location reveal, context reveal, sample transfers, Next capacity and Undo. It needs no
packages, account, external asset or network request. Open it directly in a browser, or serve this
directory with a local static server. The review session uses loopback53917, separate from preview8443.

- [Card context](screenshots/context.png).
- [Two scanning versions](screenshots/scanning.png).
- [Two nearby action versions](screenshots/actions.png).
- [Narrow scanning layout](screenshots/mobile-scanning.png).
- [Narrow light context layout](screenshots/mobile-context-light.png).

The controls outside the app frames are design-comparison tools, not proposed application chrome.
The examples are not CodeMirror editors or working application commands. Their transfers/Undo/cap
are illustrative in-memory behavior; they do not establish real admission, encryption or sync.

## What the operator has decided

- Gathering/tray is withdrawn as a direction: it feels too rigid. Improve scanning instead.
- Explore automatic tags from parent header hierarchy; probably opt-in in the settings sidebar.
  No setting mock is requested.
- Show multiple scanning and near-cursor transfer alternatives before selecting an implementation.
- Retain the existing multiline-card requirement and agreed whole-subtree transfer semantics.
  The earlier gather sketches are historical context, not an implementation queue.

All choices below remain proposals unless expressly identified above. In particular the operator has
not selected snapshot/live behavior, a card metadata format, an export policy, a scanning variant or
an action placement.

## 1. Automatic heading context on a card

### Visual proposal

A quiet breadcrumb sits below the card writing and above its ordinary actions:

```text
Replace the “coming soon” page
  Use the short introduction from the pitch
  Link the two recent projects

↳ Work › Studio site › Launch
```

It supplies the context the operator currently types into titles, without requiring a tag taxonomy.
The alternative compact label shows only `#Launch`; tapping it reveals the complete ancestry. The
breadcrumb is the starting recommendation because “Later, maybe” or “Launch” can occur in several
branches. Long paths wrap and remain readable on a narrow phone. Color does not convey the hierarchy
on its own. Existing authored tags remain text.

### Proposed behavior

- **Heading ancestors only.** Use the Markdown heading path of the source item, including skipped
  heading levels as actually authored. Bullet/list ancestors are not automatically reinterpreted as
  tags. Transfer includes the selected item and its descendants, preserving their relative nesting;
  selecting a child does not include its parent or siblings. No headings means no invented label.
- **Capture at transfer.** Copy/Move from Goals captures context together with the source subtree.
  The source item's position is authoritative; the existing viewport breadcrumb may show a different
  place and cannot supply this snapshot. A selected heading used as the title excludes itself from
  its ancestor path.
- **Historical snapshot.** Renaming/reparenting/deleting source writing does not rewrite earlier
  day cards. Moving a card between day sections and duplicating it retain captured context.
  Cards created directly in a day have no Goals context unless a future explicit interaction supplies it.
- **Opt in for new transfers.** Proposed setting: “Add Goals context to new cards.” Turning it off
  stops future capture, without erasing existing snapshots. No automatic backfill by matching text.
  A separate hide-all display preference can wait; it is not silently the same setting.
- **Whole-subtree transfer.** The selected item becomes one title and its descendants become the
  body. Several selected sibling subtrees create one card each with their own correct context;
  children already included through a selected parent do not become duplicate cards.

### Format and portability decision still owed

The current card has no source heading path or stable Goals source-location identity: `origin` is
`master`, a source card ID, or null. Existing day Markdown export carries card body text, not arbitrary
metadata. Thus this is not only styling. The proposed separate breadcrumb needs encrypted retained
metadata, compatibility handling and an explicit export/import policy. Appending context to the
Markdown instead changes the user's writing. Settle this choice before implementing either route.

Any retained context belongs inside encrypted workspace content; do not put heading labels in clear
routing fields, plaintext browser preferences, logs or analytics. Showing/exporting a card can reveal
its project ancestry, so that context must be visible and its inclusion intentional. Nothing in this
sketch establishes new task identity, live backlinks, completion propagation or search facets.

## 2. Scanning without gathering

The same fictional Goals document includes loose notes, prose, repeated “Later, maybe” headings,
vague parent items with useful descendants, and nested Work/Home branches. This follows the existing
[one-document projection contract](../../PRD.md#49-long-document-navigation).

### A — Fold in place

Heading disclosure controls fold exactly that authored branch, retaining the document's geography.
Nested headings fold independently; visible counts describe hidden items/notes. Open all is one
action. First use begins expanded; the partially folded screenshot demonstrates subsequent user
actions. No fold or unfold follows caret movement. Folding does not change Markdown or reveal the
mobile keyboard. The prototype limits folds to headings; list-parent folding would be a later scope.

This is the smallest conceptual change, with a cost: folding “General” still hides useful details.
Counts communicate that material is hidden; they do not pretend that a chosen preview found the
important parts. A later explicit Peek/one-level-deeper action could expose authored children, but
first-three-line previews should not be mistaken for comprehensive scanning.

### B — Read through the nesting

A temporary compact reading view presents every bullet item and standalone note in source order.
Nested items are brought back toward the left edge, with their parent text shown quietly as context.
Heading ancestry stays visible. Parent items are included along with children; free prose and
unheaded notes are included too. There is no inferred “actionable” filter, ranking or automatic choice.

Long continuation text could become an explicit `+N lines` expansion; the short sample does not
need that control. Tap an item to reveal its exact location in the original editor, expanding folds
as needed. The interactive sketch wires several labeled examples; a real implementation would
map every rendered item. Return to the whole document is one action, without a navigation stack.

This directly exposes buried children, but does not guarantee a shorter list. It adds a second
temporary representation and source-mapping work. It is not another store or a list to curate.

**Starting recommendation:** A is a bounded first implementation; B is worth comparing because
the operator's underlying difficulty is finding useful details under weak parent titles. Both stay
available for discussion, and neither is currently selected.

## 3. Move/copy nearer the text

### A — Gutter button and popover

An explicit accessible button beside the selected item opens a small anchored popover. The scope
includes its highlighted descendants. Copy/Move is explicit, and the destination day and Next capacity
are shown. The active item owns the button; there is no permanently crowded button row on every line.
On desktop it can reveal on hover/focus, but touch cannot depend on hover. Do not commandeer native
long-press text selection or replace the OS selection menu.

The sketch opens this popover initially for comparison. Its trigger toggles it, close/Escape dismiss
it, and sample actions create a result below. A real anchored overlay also needs viewport clamping,
safe-area handling, selection preservation, outside dismissal and no focus reclamation after exit.

### B — Attached action strip

An explicit Actions affordance reveals Copy to… / Move to… below the selected item. Selecting the
verb reveals destination buttons attached to the same scope. This gives fingers more room and makes
the source obvious, at the cost of deliberate layout movement while open. It never opens merely
because the caret moved. If later docked above a keyboard, it must retain the source title/scope;
that docking is not established by this static prototype.

Variant B is shown after deliberate activation, with its destinations already revealed. The sketch
wires mode/destination/Undo, but not that initial Actions reveal or dismissal; those remain illustrative.

**Starting recommendation:** compare A's footprint with B's clearer touch scope. A desktop popover
and a phone action strip could share one command owner, but selecting different placements is still
a product decision. These controls should compose with either scanning view.

### Shared transfer contract

Copy defaults; successful transfers reset the verb to Copy. The destination is the day in view,
not necessarily Today. Next cannot accept a fourth local card; frozen-day and Done rules remain.
Capture scope before toolbar focus moves. A Move is one atomic admitted operation: remove exactly
the accepted source subtree and add destination cards together; Undo restores both. If the source or
included descendants changed while queued, refuse/retry rather than act on stale line numbers.
Hidden included descendants must be disclosed. Active IME composition needs a defined ordering
before formatting/transferring provisional writing. These are implementation requirements, not claims
that the prototype exercises the real storage path.

## Review and limits

[Prototype review](prototype-review.json) records sample context/reveal/Undo, both transfer variants,
both Next caps, folding/source reveal and nine width/tab overflow checks at1320/390/320px. Screenshots
were visually inspected in dark and light narrow layouts. A local server bind was initially refused
by the sandbox and retried with the required execution permission. An initially misdirected sample
source link was corrected during review. The gutter target was enlarged before final capture.

Follow-up design patch63 preserves the sealed61/62 artifacts and incorporates the read-only review:
clarify descendant-only transfer scope, identify B as an already-open illustration, and correct the
Work fold's count to its two direct sections. Existing screenshots show Work expanded, so the hidden
count correction does not change their illustrated state.

This demonstrates the standalone sketch only. It does not exercise a real phone keyboard, CodeMirror
projection/folding, account data, app accessibility end-to-end, real command admission, migration,
encryption, sync or performance. No old tests or application source were changed. Two read-only
subagents reviewed interaction/storage boundaries and mobile-toolbar feasibility. No commit, push,
merge, deployment, preview8443 restart or release qualification action was taken.
