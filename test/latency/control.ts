/** Independent controls built separately so they cannot change the application bundle. */
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
new EditorView({ state: EditorState.create(), parent: document.querySelector('#bare')! });
