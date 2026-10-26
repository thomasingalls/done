# Goals scanning direction selected

2026-10-25 · sequential design patch65 · decision record, not app implementation.

## Selected by the operator

- **Gentle context**, available through a settings-sidebar toggle, **on by default**.
- **Per-breadcrumb navigation menus**, while **retaining the existing full-page outline dropdown**.
- Preserve the formatted live-preview editor, caret-line syntax reveal, ordinary editing, source
  geography and current footer transfer controls. No separate scanning surface or outliner.
- Park the scroll-opening experiment. The operator found its viewport activation boundary unrelated
  to their reading attention, including a fixed percentage alternative.
- Park the reading rail: the operator finds it distracting and sees the same activation problem.
  Both remain historical design experiments, not incomplete selected features.

This selection does not authorize application implementation or select the inherited-card-context
format, capture default, export policy or Move-back-to-Goals behavior. In particular **gentle context
default-on is a different setting from automatic heading-context capture on cards**. Only card
breadcrumb placement has visual approval; existing card styling remains intact.

## Navigation keeps both levels of access

The existing Goals/full-outline affordance must continue to expose the **whole document heading
hierarchy**. Do not quietly turn it into a top-level-only list when adding the individual menus.
Each breadcrumb can additionally expose local child/sibling navigation. These are complementary
ways to reach authored text; neither changes the document's visible scope or content.

Keep the existing scroll-aware location label. Navigation should not request the mobile keyboard
or move the editing caret merely to update the label. A full-outline entry can navigate to a deep
heading directly without walking one menu at a time. Exact affordance geometry remains a UI detail;
an implementation must preserve a recognizable full-outline dropdown.

## Gentle context: selected direction and remaining detail

The current section and at most two nearest authored heading ancestors remain at ordinary contrast;
unrelated text becomes quieter without moving, hiding or reflowing lines. The preference is on when
no user choice has been saved. Turning it off restores ordinary contrast throughout the editor.
No new document organization, task identity or persistent heading-text cache follows from this.

The prototype's checked offscreen-caret fallback restores ordinary contrast while the caret is out
of view. Retaining that fallback is the recommendation: reading elsewhere should not leave the whole
visible page dim. This is an implementation/detail proposal, not an additional direct instruction
from the operator. Exact contrast, preference scope and whether a deliberately navigated reading
location should temporarily affect emphasis remain to settle before coding. Never silently move the
caret or change stored writing to express reading attention.

## Alternatives to a fixed viewport cutoff

The failure is the attempted inference, not merely the choice of a percentage. Scroll coordinates
locate text on a screen, but do not specify which text the user is attending to. A direction-aware
band, delay or hysteresis can reduce rapid toggling; it is still an unvalidated attention heuristic.
No claim of a naturally correct threshold or reading model is established here.

Two stronger signals are available if this question is reopened:

1. **Explicit intent latch.** A deliberate caret placement or section-focus action selects a section;
   scrolling alone does not replace it. Breadcrumb/outline navigation is another deliberate signal,
   but treating it as an emphasis anchor must remain separate from moving the editing caret.
   The tradeoff is that subsequent free scrolling provides no new explicit attention signal.
2. **User-initiated reveal.** If folding is ever desired, a heading/outline action can explicitly reveal
   its branch, retaining that choice until another explicit action. This gives up automatic
   scroll-opening and therefore does not claim to solve attention tracking. It also does not put
   manual folding into the presently selected implementation scope.

Pointer hover, stopping a scroll and dwell time are weaker hints: a mouse need not track reading,
there is no equivalent hover on ordinary touch, and stopping does not name the attended line. These
are design cautions, not measured comparative results. No gaze tracking, predictive ranking or new
prototype is selected. The useful outcome from C/D is a constraint: automatic presentation should
not claim to know the reading focus merely from a viewport boundary.

## Boundary

This patch records the choice and open details. Existing studies/assets, prior patches61–64,
application source, tests, dependencies, preview8443, real accounts and security guarantees remain
unchanged. No new performance/phone/qualification evidence is claimed. No signing, commit, push,
merge or deployment occurs. [Revision64](editor-study.md) remains the editable historical comparison.
