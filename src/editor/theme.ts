/**
 * The CodeMirror-owned surface.
 *
 * TRD §8.3 orders the cascade with layers (`reset, vendor, app, theme`) and
 * names CodeMirror as the concrete justification. Layers do that job for every
 * stylesheet the app *authors*, and all of the `.cm-md-*` classes this app adds
 * live in `@layer app` accordingly.
 *
 * They cannot do it for CodeMirror's own base theme. `style-mod` injects it as
 * an unlayered `<style>` at the top of `<head>` at runtime, and unlayered
 * declarations outrank every layered one regardless of order — so `@layer app`
 * would *lose* to `.cm-line`, which is the opposite of what §8.3 wants. The
 * requirement §8.3 is protecting is that overrides must not become a
 * specificity contest and that tokens must be single-sourced. Both hold here:
 * CodeMirror's own supported override channel is `EditorView.theme`, whose
 * generated rules always outrank the base theme, and every value below is a
 * `var(--token)` read from the same stylesheet the rest of the app reads.
 *
 * The properties named here are exactly the ones CodeMirror sets itself, plus
 * the two block decorations that need `padding` on `.cm-line` — a property
 * CodeMirror's base theme also sets, so a layered rule would lose to it.
 * Everything else the app invents (`.cm-md-*`) has no vendor competition and
 * lives in `src/styles/markdown.css` under `@layer app`.
 */

import { EditorView } from '@codemirror/view';

export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--color-text)',
    backgroundColor: 'transparent',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--font-size)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  // The editor's scroller is the document panel's designated scrolling region
  // (TRD §8.2): the page itself never scrolls.
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: 'var(--line-height)',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    // This is the nearest scroll container for a press in Goals, so the outer
    // shell's touch-action does not participate. Keep native vertical panning
    // here while reserving horizontal movement for the navigation recognizer.
    touchAction: 'pan-y',
  },
  '.cm-content': {
    // `dvh`, not `vh` (TRD §8.2): mobile browser chrome makes `vh` wrong
    // exactly when it matters. The tail is room to keep writing at the bottom.
    padding: 'var(--space-4) var(--space-4) 40dvh',
    caretColor: 'var(--color-accent)',
    fontFamily: 'inherit',
    lineHeight: 'var(--line-height)',
    // The measure is a typographic constraint, not a layout one.
    maxWidth: 'var(--measure)',
    margin: '0 auto',
    width: '100%',
  },
  '.cm-line': {
    padding: '0',
  },
  // The browser's native caret fills the line-height. Beside placeholder text
  // that makes it look too tall, since the glyphs themselves are only 1em.
  // Put the empty line's leading in padding so each placeholder line and the
  // caret are both 1em tall. A single-line placeholder keeps the ordinary
  // line's 1.6em total height; on narrow screens the placeholder may wrap.
  '.cm-line:has(.cm-placeholder)': {
    lineHeight: '1',
    paddingBlock: '0.3em',
  },
  '.cm-line:has(.cm-placeholder) .cm-widgetBuffer': {
    verticalAlign: 'top',
  },
  // Block decorations that need `padding`, which CodeMirror also sets on
  // `.cm-line`. Negative margin cancels the content inset so the block reads
  // as flush with the prose while its background extends past it.
  '.cm-md-quote': {
    marginInlineStart: 'calc(var(--space-2) * -1)',
    paddingInlineStart: 'var(--space-3)',
    borderInlineStart: '2px solid var(--color-quote-bar)',
  },
  '.cm-md-codeblock': {
    marginInline: 'calc(var(--space-2) * -1)',
    paddingInline: 'var(--space-2)',
    backgroundColor: 'var(--color-code-bg)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--color-accent)',
    borderLeftWidth: '2px',
  },
  '.cm-placeholder': {
    color: 'var(--color-text-faint)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, & ::selection': {
    backgroundColor: 'var(--color-selection)',
  },
});

/**
 * The card surface (TRD §4.4).
 *
 * A card editor owns none of its own geometry: font, line height, measure and
 * padding all come from the `.card-surface` wrapper, which the static render
 * sits in too. That is what makes "static render and mounted editor must be
 * pixel-identical" a property of one element rather than an agreement between
 * two stylesheets.
 *
 * Everything below is either `inherit` — deferring to that wrapper — or a
 * neutralisation of something CodeMirror's own base theme sets and an app
 * stylesheet cannot reach (see the note at the top of this file). The block
 * decorations repeat the values from the document theme above because they need
 * `padding` on `.cm-line`, which is the one property in the same position.
 * `src/styles/cards.css` states them a third time for `.md-line`, from the same
 * tokens, and `test/geometry/cards.spec.ts` measures the three against
 * each other.
 */
export const cardTheme = EditorView.theme({
  '&': {
    height: 'auto',
    color: 'var(--color-text)',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: 'inherit',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: 'inherit',
    // A card grows with its content; the day's body is the scrolling region.
    overflow: 'visible',
  },
  '.cm-content': {
    padding: '0',
    margin: '0',
    maxWidth: 'none',
    minHeight: '0',
    caretColor: 'var(--color-accent)',
    fontFamily: 'inherit',
    lineHeight: 'inherit',
  },
  '.cm-line': {
    padding: '0',
  },
  // The same caret-versus-placeholder correction the document theme makes, and
  // for the same reason: the native caret fills the line height, and beside 1em
  // glyphs that reads as too tall.
  '.cm-line:has(.cm-placeholder)': {
    lineHeight: '1',
    paddingBlock: '0.3em',
  },
  '.cm-line:has(.cm-placeholder) .cm-widgetBuffer': {
    verticalAlign: 'top',
  },
  '.cm-md-quote': {
    marginInlineStart: 'calc(var(--space-2) * -1)',
    paddingInlineStart: 'var(--space-3)',
    borderInlineStart: '2px solid var(--color-quote-bar)',
  },
  '.cm-md-codeblock': {
    marginInline: 'calc(var(--space-2) * -1)',
    paddingInline: 'var(--space-2)',
    backgroundColor: 'var(--color-code-bg)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--color-accent)',
    borderLeftWidth: '2px',
  },
  '.cm-placeholder': {
    color: 'var(--color-text-faint)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, & ::selection': {
    backgroundColor: 'var(--color-selection)',
  },
});
