# Mobile formatting strip: feasibility and bounded scope

2026-10-23 · design investigation · sequential patch62 · no application implementation.

## Recommendation

A small **in-app Goals formatting strip is practical**. It can resemble a keyboard accessory while
remaining ordinary webpage UI. Start with the editor and command system already installed. A native
keyboard extension or native application wrapper is unnecessary for the requested buttons.

The uncertain part is keeping a strip perfectly attached to every browser/keyboard animation while
preserving composition and selection. No dependency identified in this review removes those
application-specific obligations. Prefer a stable editor-attached fallback over promising universal
keyboard docking. This is a reasonable bounded feature if that fallback is acceptable; universal
behavior across every old Android/browser/keyboard/iPad mode is not a defensible fixed scope.

## What already exists in done

- CodeMirror6, Markdown parsing and native mobile text selection.
- Semantic admitted commands for indent/outdent, bold/italic/code/strike, checkbox toggle and Undo/Redo
  in [admittedCommands.ts](../../../src/editor/admittedCommands.ts).
- The mutation boundary in [admittedEditor.ts](../../../src/editor/admittedEditor.ts) deliberately
  refuses arbitrary document-changing editor transactions. Buttons must submit admitted semantic
  actions, retaining synchronous encrypted writing, refusal behavior and shared Undo.
- Heading-level, bullet-list and numbered-list toggles still need explicit semantic adapters; the
  presence of a Markdown parser does not implement those transformations.
- [The viewport](../../../index.html) already requests `interactive-widget=resizes-content` and
  `viewport-fit=cover`. [The shell](../../../src/styles/shell.css) uses a constrained `100dvh` layout
  with nested editor scrolling. Do not assume a page-scrolling toolbar recipe fits this shell.

These are source findings, not a new device result.

## Standard facilities, and what they do not solve

CodeMirror's own panel facility supports UI above/below the editor and external panel containers.
It is an appropriate starting primitive for the strip, with no new toolbar library. Panels do not
promise a native keyboard accessory or universal flush-to-keyboard placement.
[CodeMirror panel documentation](https://codemirror.net/examples/panel/).

The broadly available VisualViewport interface supplies visible dimensions/offsets and resize/scroll
events. Zoom and browser chrome affect those measurements too: a smaller viewport is not inherently
proof of an open keyboard. Avoid a height-only heuristic that accidentally opens/closes controls while
pinch zooming. [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport).

Chromium's VirtualKeyboard API can supply keyboard geometry and overlay control, but current
compatibility data records no Firefox/Safari support. It can be an enhancement, not the sole mechanism.
[API overview](https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API),
[compatibility data checked2026-10-23](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/VirtualKeyboard.json).

| Context | Reasonable starting point | Limit that remains |
| --- | --- | --- |
| Chrome on Android, tab or installed PWA | Existing resize-content request; editor panel; optional feature-detected keyboard geometry | Gboard/Samsung composition, browser UI and floating keyboard behavior still need application handling |
| Firefox on Android | Editor panel with VisualViewport/fallback placement | No VirtualKeyboard API; do not inherit Chromium positioning assumptions |
| Safari on iPhone/iPad, including installed web app | VisualViewport plus stable editor-attached fallback; safe-area-aware layout | Resize-content support cannot be assumed; browser UI, standalone mode, zoom and split/floating keyboards differ |
| Hardware keyboard or hidden keyboard | Accessible ordinary editor toolbar | Keyboard detection must not make formatting inaccessible |

Chrome documents its selectable viewport behavior and existing resize-content opt-in.
[Chrome viewport behavior](https://developer.chrome.com/blog/viewport-resize-behavior/).
WebKit's implementation request for that opt-in remains NEW at the time of this review; it is not
evidence that every browser now follows the app's meta tag.
[WebKit issue259770](https://bugs.webkit.org/show_bug.cgi?id=259770).

A real iOS input accessory belongs to native UIKit. Adopting a native shell such as Capacitor would
add a separate distribution/runtime project, not remove this PWA's editing contracts. It is not
recommended solely for formatting buttons. [Apple inputAccessoryView](https://developer.apple.com/documentation/uikit/uiresponder/inputaccessoryview),
[Capacitor keyboard plugin](https://capacitorjs.com/docs/apis/keyboard).

Browser API support and keyboard correctness are separate. Browser engine/version largely governs
geometry APIs; OS/input-method behavior still governs composition, autocorrect, selection and focus.
The table is a source-based design boundary, not a supported-version/device matrix.

## Proposed first scope

Goals only, one row: **Heading**, **Bullets**, **Numbers**, **Outdent**, **Indent**, **More**.
Heading opens a small explicit level selector. More can hold the already available inline formatting
and Undo; keep the primary row useful for the operator's heading/list use case.

Apply to the caret's line or the touched lines of a selection, with exact boundary semantics.
Choose list/heading transformations deliberately: replace or remove existing markers, respect nesting,
avoid modifying code fences, preserve checked state where appropriate, and keep prose/blank lines
predictable. Blindly prepending `#` or `-` is not a complete command.

Controls preserve the editor instance, selection, scroll and keyboard where the platform allows.
Capture the intended selection before toolbar focus moves; keep real accessible buttons and keyboard
navigation. A blanket prevent-default on every interaction is not a substitute for focus design.
Dock to the visible editing area where reliable; a stable top-of-editor panel is an acceptable fallback.
Do not try to track the shape of an arbitrary floating/split keyboard in the first feature.

Cards are a later slice: their editor can unmount on blur unless focus moves to the card's actions
([Card.tsx](../../../src/ui/Card.tsx)). A global toolbar would require an explicit shared focus region.
Goals-first avoids combining that lifecycle change with initial mobile formatting.

## Composition is the implementation-discriminating risk

Gboard/autocorrect may keep the current word provisional. CodeMirror documents that on Android even
placing the cursor on a word can begin composition. Thus disabling every command while composing can
make normal toolbar use impractical. [CodeMirror composition state](https://codemirror.net/docs/ref/#view.EditorView.compositionStarted).

Before selecting the interaction, establish how a tap commits or safely defers the preedit word,
captures the resulting selection, and orders one admitted formatting action. Do not format the
accepted predecessor while dropping or duplicating provisional text. Do not fake composition events,
edit DOM text directly, or bypass admission to make a button appear responsive. Native selection
handles, suggestion acceptance, storage refusal and late asynchronous results must retain clear owners.
No stronger keyboard/IME contract is claimed by this report.

## Bounded next phases and effort

1. **Resolve composition/focus on the intended keyboards.** A small exploratory slice: ordinary typing,
   current-word autocorrect, range selection, toolbar tap, keyboard retention and caret visibility.
   Include Android Chrome/Gboard and Safari tab/PWA first; add the actual additional keyboards the
   product intends to support. This selects an implementation approach rather than beginning a broad
   release campaign. If the safe interaction is awkward, stop before expanding the feature.
2. **Implement Goals commands and an editor-attached strip.** Reuse existing panel/command owners,
   add the missing heading/list adapters, and keep formatting ordinary admitted Markdown writing.
3. **Improve docking where the platform supports it.** Feature-detect, observe visual viewport changes,
   account for nested scrolling/safe areas, and retain the stable fallback. Consider card integration
   separately after the Goals interaction is useful.

Engineering estimates, not measurements or delivery promises: the bounded Goals strip is plausibly
several developer days; polished docking across the chosen Android/iOS combinations can add several
more with uncertainty. Expanding to every historical OS/browser and floating/split keyboard removes
that useful bound. No new dependency, permission, native shell, worker or security-policy change was
selected or installed. Two read-only subagents contributed, and primary sources were checked; no
actual phone keyboard was exercised in this investigation.
