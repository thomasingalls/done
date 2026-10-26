# Revision: the editor stays the editor

2026-10-23 · design patch64 · follows the operator's four browser comments on61–63.

[Editable sketch](editor-study.html) · [gentle context](editor-screenshots/gentle-context.png) ·
[breadcrumb menus](editor-screenshots/breadcrumb-menus.png) · [reading rail](editor-screenshots/reading-rail.png) ·
[scroll-open experiment](editor-screenshots/scroll-open.png) · [card styling](editor-screenshots/breadcrumb-only.png) ·
[narrow editor](editor-screenshots/mobile-editor.png).

## Direction established by the feedback

- The operator likes **only the inherited breadcrumb placement** on cards. The earlier card restyling
  is withdrawn. Keep existing card typography, padding, borders, surface and actions.
- Goals must remain the formatted live-preview editor. Caret-line syntax reveal and ordinary editing
  stay; scanning must not require entering a separate reading mode or adopting an outliner.
- Explore gentle context dimming, individual breadcrumb menus, and scroll-driven section opening.
  A reading rail is an additional alternative; none is selected for application implementation.
- Park both nearby transfer-control proposals. Existing footer controls may be the better mobile
  placement. Desktop transfer shortcuts are a candidate, with exact bindings and scope undecided.
- Retain “move back to Goals” with maximum heading-ancestry matching as a new design candidate.

The explicit approval of placement does not settle snapshot/live behavior, opt-in capture, storage,
export/import policy or return semantics. The [earlier study](README.md) remains historical evidence.

## What is real in this sketch

There is one editable CodeMirror instance and one fictional in-memory document. Comparison buttons
are **outside the app frame**; they switch proposed presentation overlays without recreating that
editor, changing its Markdown or moving its caret. They are not proposed everyday scanning modes.
Actual app modules supply live preview, editor theme, heading parsing, static card rendering and
semantic text-command functions. Current app CSS is imported; the cards add one context row.
The breadcrumb toggle removes only that row, allowing a direct geometry comparison.

The sandbox does not mount a workspace, admission owner, journal, account, service, persistence or
sync connection. Direct CodeMirror edits here operate only on fictional memory. This is not a
suggestion to bypass admission in the app. Reusing renderer/command code does not claim full app
keyboard, composition, focus, security, collaboration or durability behavior in the prototype.

## A — Gentle caret context

Keep the current heading section at normal contrast together with at most two nearest authored
heading ancestors, counting actual nodes rather than numeric heading levels. In the sample,
Studio site and Launch stay readable while Work and unrelated writing become quieter. Selected
text remains readable. Use text-color line decorations; do not change opacity on the editor,
font metrics, line height, wrapping or source placement.

The offscreen-caret problem is exposed explicitly: strict caret-only emphasis can dim all the
writing currently being read. A checked comparison option restores ordinary contrast when the
caret leaves the visible viewport. It changes presentation without moving that caret. That fallback
is proposed, not settled; uncheck it to compare strict behavior. Dimming strength/accessibility and
whether to include a larger parent section remain design decisions.

## B — Menus on individual breadcrumbs

Each crumb's text navigates to that heading; its chevron opens direct children. A leaf offers its
siblings. The root lists top-level sections. Small authored previews and full paths distinguish
repeated titles. Navigation scrolls without moving the caret or focusing the editor. The location
path remains scroll-aware, independently of the caret-context overlay.

This can accompany A or D rather than replace them. It borrows the structural-navigation idea from
the operator's JetBrains reference, without importing caret-following location behavior over the
app's existing scroll-aware contract. [JetBrains editor breadcrumbs](https://www.jetbrains.com/help/idea/using-code-editor.html#breadcrumbs).

## C — Scroll-open experiment

After scrolling settles, a section near the reading location may open at an externally selected
H1/H2/H3 level. The caret/selection sections remain protected; active composition suspends automatic
fold changes. The sandbox avoids closing intersecting visible text, and attempts to retain a visible
source anchor after a change. Show the whole sheet removes the experimental folds.

This is intentionally the uncertain alternative. Folding changes document height and scrollbar
proportions; anchoring does not establish a jump-free interaction. The sample produces actual
fold placeholders, not merely a screenshot, but no physical touch/keyboard result or suitable
default level is established. A future implementation must distinguish automatic from deliberate
manual folds and must not silently override the latter. No automatic folding policy is selected.

## D — Reading rail

One quiet margin mark follows the visible section and a second its parent, independently of the
editing caret. Every line remains at normal contrast and in place. This adds orientation without
hiding writing or requiring a separate scan view. Its limitation is less reduction in visual noise.
Breadcrumb menus remain available. The rail is a proposal, not new document structure.

**Starting recommendation:** compare A plus B with D plus B. Keep C experimental until its geometry
and heading-level behavior feel useful. No implementation direction is chosen on the operator's behalf.

## Return a card to Goals: matching is only part of the contract

For captured `Work › Studio site › Launch`, resolve the longest matching **root-to-leaf prefix**
against current parsed headings. Initially use the same display-title extraction as breadcrumbs
and exact case-sensitive comparison. Do not skip a missing intermediate heading to match an
unrelated leaf. Equal-depth duplicate paths require a destination chooser, not first/last choice.

The append point is the matched heading's **direct-content block**, before its first child heading.
At the end of a whole subtree, Markdown would make the new writing belong to the final descendant.
For a childless heading, its direct-content end is before the next sibling/ancestor or EOF. With
no prefix match, offer a location or the end of the unheaded preamble before the first heading;
EOF is safe as a root append only when there are no headings. Recreating missing headings is an
explicit alternative, not a silent fallback. These insertion rules remain proposals for confirmation.

Return appends writing; it does not deduplicate against an original left by Copy, infer completion,
or restore a live source link. Preserve the title and complete multiline body as one item with a
reversible Markdown encoding. Blank lines, nested lists, fences and whitespace need their own precise
encoding contract. A missing ancestry suffix would otherwise disappear when card metadata is removed:
choose whether to retain it in Markdown, recreate the path or explicitly omit it. The illustration
shows four destination cases; it does not implement a matching/mutation protocol.

A real Move must revalidate the current hierarchy and source under existing admission, insert Goals
text and remove the card atomically, retain one Undo, and leave the source intact on refusal. Preserve
frozen-day and guarded-Done rules. No clear routing metadata, plaintext preference cache, logs or
analytics may acquire captured heading content.

## Review, reproduction and limits

Rebuild with `node docs/product-design/2026-10-23-goals-context/build-editor-study.mjs` using the
repository's installed Vite/dependencies. The bundle, source input hashes, eight exact app CSS inputs
and19 dependency license texts are retained in `editor-assets/`. The bundle is a separate design
artifact, not part of the app entry or service-worker precache. Loopback53917 serves it;8443 is unchanged.

[Review](editor-review.json) records fictional typing/Undo, text/caret preservation across the four
ideas, unchanged measured line geometry for dimming, caret-preserving breadcrumb navigation without
editor focus, rail display, three observed fold placeholders, offscreen contrast fallback, unchanged
card-writing geometry when toggling context, and nine width/tab overflow checks at1300/390/320px.
Dark and narrow screenshots were inspected. Focused design-source typechecking passes. No old test
was edited and no full app/phone/performance/release qualification result is claimed.

Preserve the preliminary failures: an initial browser assertion compared the edited caret275 with
the post-Undo caret263, incorrectly reporting navigation movement; the corrected boundary records263
before and after navigation. Initial external typecheck configuration lacked ambient-type paths and
inherited incompatible composite file-list rules; those harness settings were corrected. Six new
prototype dataset accesses were corrected for the repository's strict index-signature rule. A stalled
pnpm launcher was interrupted; installed local binaries completed formatting/typechecking/build.
These do not establish an app defect. App source, tests, dependency lock, preview8443, real data and
security guarantees are untouched; source staging/signing, publication and deployment remain separate.
