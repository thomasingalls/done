/**
 * Mounts one CodeMirror view onto a `Y.Text` and gets out of the way.
 *
 * React owns the host element and nothing else. The editor's content is the
 * CRDT's, not component state, so there is no value to synchronise and no
 * re-render that can disturb the caret.
 */

import { useEffect, useRef } from 'react';
import type { EditorView } from '@codemirror/view';
import type { Awareness, Origin, YText, YUndoManager } from '../crdt';
import { createEditor } from '../editor/createEditor';

export interface EditorProps {
  text: YText;
  awareness: Awareness;
  undo: YUndoManager;
  origin: Origin;
  placeholder?: string;
  autoFocus?: boolean;
}

export const Editor = ({
  text,
  awareness,
  undo,
  origin,
  placeholder,
  autoFocus = false,
}: EditorProps): React.ReactElement => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;

    const editor = createEditor({
      parent,
      text,
      awareness,
      undo,
      origin,
      ...(placeholder === undefined ? {} : { placeholder }),
    });
    view.current = editor;

    // Not on touch: focusing would raise the soft keyboard over a document the
    // user has not asked to edit yet.
    if (autoFocus && !window.matchMedia('(pointer: coarse)').matches) editor.focus();

    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [text, awareness, undo, origin, placeholder, autoFocus]);

  return <div className="editor-host" ref={host} />;
};
