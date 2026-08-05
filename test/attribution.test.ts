/**
 * TRD §4.8 and §11: every mutation carries its actor, and undo is scoped by it.
 *
 * The interesting configuration is not a hand-written transaction — it is the
 * editor, because the editor is what actually writes. `y-codemirror.next`
 * supplies its own transaction origin, so without `claimEditorOrigin` every
 * edit the user makes belongs to nobody: the attribution test below fails and
 * nothing else does, which is exactly why it is worth writing down.
 *
 * The undo tests pass either way today — the binding's undo plugin registers
 * its own origin when a view mounts. They are here because that is a property
 * of the binding rather than of this design, and Phase 2 gains system
 * operations that the scoping has to keep out.
 */

import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { Awareness, createDoc, createUndoManager, transact, type Origin } from '../src/crdt';
import { createEditorState } from '../src/editor/createEditor';

const HUMAN: Origin = Object.freeze({ actor: 'human-1', kind: 'human', device: 'device-1' });
const SYSTEM: Origin = Object.freeze({ actor: 'system', kind: 'system', device: 'device-1' });

const teardown: (() => void)[] = [];
afterEach(() => {
  while (teardown.length) teardown.pop()?.();
});

const editor = () => {
  const doc = createDoc();
  const text = doc.getText('master');
  const awareness = new Awareness(doc);
  const undo = createUndoManager(text, new Set([HUMAN]));

  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: createEditorState({ text, awareness, undo, origin: HUMAN }),
  });

  teardown.push(() => {
    view.destroy();
    parent.remove();
    undo.destroy();
    awareness.destroy();
    doc.destroy();
  });

  return { doc, text, view, undo };
};

const type = (view: EditorView, insert: string): void => {
  view.dispatch({ changes: { from: view.state.doc.length, insert } });
};

describe('edits made through the editor', () => {
  it('carry the actor and the device', () => {
    const { doc, view } = editor();
    const origins: unknown[] = [];
    doc.on('update', (_update: Uint8Array, origin: unknown) => origins.push(origin));

    type(view, 'call the dentist');

    expect(origins).toHaveLength(1);
    expect(origins[0]).toMatchObject({ actor: 'human-1', kind: 'human', device: 'device-1' });
  });

  it('are undoable', () => {
    const { text, view, undo } = editor();
    type(view, 'call the dentist');
    expect(text.toString()).toBe('call the dentist');

    undo.undo();
    expect(text.toString()).toBe('');
    expect(view.state.doc.toString()).toBe('');

    undo.redo();
    expect(text.toString()).toBe('call the dentist');
  });
});

describe('undo scoping holds where the editor is the writer', () => {
  it('skips a system operation and reverts what was typed', () => {
    const { doc, text, view, undo } = editor();

    type(view, 'typed by me');
    // Stands in for compaction, import, or a bulk stale-item resolution.
    transact(doc, SYSTEM, () => text.insert(0, 'SYSTEM\n'));

    undo.undo();

    const after = text.toString();
    expect(after).toContain('SYSTEM');
    expect(after).not.toContain('typed by me');
  });

  it('leaves a system operation in place however many times undo is pressed', () => {
    const { doc, text, view, undo } = editor();

    type(view, 'one');
    transact(doc, SYSTEM, () => text.insert(0, 'SYSTEM\n'));

    for (let press = 0; press < 5; press++) undo.undo();

    expect(text.toString()).toBe('SYSTEM\n');
  });
});
