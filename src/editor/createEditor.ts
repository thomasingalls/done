/**
 * One editing surface (TRD §3, §5.1).
 *
 * CodeMirror 6 bound to a `Y.Text`. The document CodeMirror holds is the
 * markdown, byte for byte — there is no serializer anywhere in the write path,
 * which is the whole reason the ProseMirror family was ruled out.
 *
 * Deliberately minimal: no `basicSetup`. Every extension here is one the app
 * asked for, which keeps the initial bundle inside the §12 budget and keeps
 * the editing surface from acquiring behaviour nobody chose.
 */

import { defaultKeymap } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightSpecialChars,
  keymap,
  placeholder,
} from '@codemirror/view';
import {
  ySyncFacet,
  yCollab,
  yUndoManagerKeymap,
  type Awareness,
  type Origin,
  type YText,
  type YUndoManager,
} from '../crdt';
import { doneKeymap } from './keymap';
import { livePreview } from './livePreview';
import { editorTheme } from './theme';

export interface EditorOptions {
  parent: HTMLElement;
  text: YText;
  awareness: Awareness;
  undo: YUndoManager;
  /** The actor these edits belong to (TRD §4.8). See `claimEditorOrigin`. */
  origin?: Origin;
  placeholder?: string;
  /**
   * Native selection is the default because mobile text selection depends on
   * it: `drawSelection` replaces the platform's selection handles with painted
   * rectangles, and the long-press-to-select gesture (PRD §7.2) needs the real
   * handles. Enabled only where multiple selections matter.
   */
  drawSelection?: boolean;
}

export const editorExtensions = (options: Omit<EditorOptions, 'parent'>): Extension[] => [
  // Ours first: keymap precedence follows extension order.
  doneKeymap(),
  keymap.of(yUndoManagerKeymap),
  keymap.of(defaultKeymap),

  markdown({ base: markdownLanguage, addKeymap: false }),
  indentUnit.of('  '),
  EditorView.lineWrapping,
  highlightSpecialChars(),
  EditorState.allowMultipleSelections.of(true),
  livePreview(),
  editorTheme,
  ...(options.placeholder === undefined ? [] : [placeholder(options.placeholder)]),
  ...(options.drawSelection ? [drawSelection()] : []),

  // Last: the binding owns the document's content and its undo history.
  yCollab(options.text, options.awareness, { undoManager: options.undo }),
];

/**
 * y-codemirror.next constructs its own `YSyncConfig` and passes it as the
 * transaction origin for every edit the editor makes, so out of the box the
 * app's writes reach the document carrying no actor — and TRD §4.8 requires
 * every mutation to name one. Attribution is not decoration here: it is what
 * separates the human's changes from the system's.
 *
 * Undo happens to work anyway, because the binding's undo plugin registers that
 * same object with the undo manager when the view mounts. That is the binding
 * looking after itself, not the actor model working; it holds only for a
 * mounted view, and it would keep holding just as well if the actor model were
 * deleted.
 *
 * Claiming the object settles both: the actor's identity is written onto it, so
 * it *is* the human's origin rather than an anonymous one that undo has been
 * told about, and the manager is told to track it here rather than on mount.
 * System operations keep their own origin object and stay out of the user's
 * undo stack by construction.
 *
 * This is the one place the binding's internals are reached into, and
 * `ySyncFacet` comes through the §10.1 seam so the Yjs v14 migration finds it.
 */
const claimEditorOrigin = (state: EditorState, options: Omit<EditorOptions, 'parent'>): void => {
  const editorOrigin = state.facet(ySyncFacet) as unknown as Partial<Origin>;
  if (options.origin) Object.assign(editorOrigin, options.origin);
  options.undo.addTrackedOrigin(editorOrigin);
};

/**
 * The binding synchronises subsequent changes but does not seed the initial
 * document; the stored text has to be the state's starting `doc` or the first
 * remote change arrives against an empty editor.
 */
export const createEditorState = (options: Omit<EditorOptions, 'parent'>): EditorState => {
  const state = EditorState.create({
    doc: options.text.toString(),
    extensions: editorExtensions(options),
  });
  claimEditorOrigin(state, options);
  return state;
};

export const createEditor = (options: EditorOptions): EditorView => {
  const { parent, ...rest } = options;
  return new EditorView({ parent, state: createEditorState(rest) });
};
