/**
 * One binding table (TRD §8.5).
 *
 * Bindings live in a single list with descriptions so they are discoverable
 * and remappable later, rather than scattered across the extensions that
 * happen to implement them.
 */

import { indentLess, indentMore } from '@codemirror/commands';
import {
  deleteMarkupBackward,
  insertNewlineContinueMarkupCommand,
} from '@codemirror/lang-markdown';
import { type Extension } from '@codemirror/state';
import { type Command, type KeyBinding, keymap } from '@codemirror/view';
import {
  blurEditor,
  toggleBold,
  toggleInlineCode,
  toggleItalic,
  toggleStrikethrough,
  toggleTask,
} from './commands';

export interface Binding {
  key: string;
  mac?: string;
  run: Command;
  description: string;
  /** Keep the browser or the platform from also acting on the key. */
  preventDefault?: boolean;
}

/**
 * `nonTightLists: false` because the default disagrees with the requirement.
 * Out of the box, Enter on an empty second item of a tight list inserts a blank
 * line *above* it — the list becomes non-tight and a second Enter is needed to
 * end it. TRD §5.4 asks for "Enter on an empty list item, which outdents then
 * terminates", one press.
 */
export const continueList = insertNewlineContinueMarkupCommand({ nonTightLists: false });

export const editorBindings: Binding[] = [
  {
    key: 'Enter',
    run: continueList as Command,
    description: 'New line, continuing the list; an empty item outdents, then ends the list',
  },
  {
    key: 'Backspace',
    run: deleteMarkupBackward as Command,
    description: 'Delete backwards, removing list and quote markup a piece at a time',
  },
  {
    key: 'Tab',
    run: indentMore as Command,
    description: 'Indent',
    preventDefault: true,
  },
  {
    key: 'Shift-Tab',
    run: indentLess as Command,
    description: 'Outdent',
    preventDefault: true,
  },
  {
    key: 'Mod-b',
    run: toggleBold as Command,
    description: 'Bold',
    preventDefault: true,
  },
  {
    key: 'Mod-i',
    run: toggleItalic as Command,
    description: 'Italic',
    preventDefault: true,
  },
  {
    key: 'Mod-Shift-x',
    run: toggleStrikethrough as Command,
    description: 'Strikethrough',
    preventDefault: true,
  },
  {
    key: 'Mod-e',
    run: toggleInlineCode as Command,
    description: 'Inline code',
    preventDefault: true,
  },
  {
    key: 'Mod-Enter',
    run: toggleTask as Command,
    description: 'Toggle the task checkbox on every line the selection touches',
    preventDefault: true,
  },
  {
    key: 'Escape',
    run: blurEditor,
    description: 'Leave the editor',
  },
];

const toKeyBinding = (binding: Binding): KeyBinding => ({
  key: binding.key,
  ...(binding.mac === undefined ? {} : { mac: binding.mac }),
  run: binding.run,
  ...(binding.preventDefault === undefined ? {} : { preventDefault: binding.preventDefault }),
});

export const doneKeymap = (): Extension => keymap.of(editorBindings.map(toKeyBinding));
