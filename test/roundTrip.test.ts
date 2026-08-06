/**
 * TRD §11: round-trip and convergence.
 *
 * "The document is plain markdown, always. What's stored is what you typed,
 * byte for byte" is the claim the ProseMirror family was rejected over, so it
 * is the claim that has to be held down by a test rather than by inspection.
 */

import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { Awareness, Y, createDoc, createUndoManager } from '../src/crdt';
import { createEditorState } from '../src/editor/createEditor';
import { prng, randomEdit } from './random';

interface Bound {
  view: EditorView;
  text: Y.Text;
  destroy: () => void;
}

const views: Bound[] = [];

const bind = (initial = ''): Bound => {
  const doc = createDoc();
  const text = doc.getText('master');
  if (initial) text.insert(0, initial);
  const awareness = new Awareness(doc);
  const origin = { actor: 'test', kind: 'human' as const, device: 'test' };
  const undo = createUndoManager(text, new Set([origin]));

  const parent = document.createElement('div');
  document.body.append(parent);

  const view = new EditorView({
    parent,
    state: createEditorState({ text, awareness, undo }),
  });

  const bound: Bound = {
    view,
    text,
    destroy: () => {
      view.destroy();
      parent.remove();
      undo.destroy();
      awareness.destroy();
      doc.destroy();
    },
  };
  views.push(bound);
  return bound;
};

afterEach(() => {
  while (views.length) views.pop()?.destroy();
});

describe('editor and Y.Text hold the same bytes', () => {
  it('starts from the stored text', () => {
    const { view } = bind('# Master\n\n- [ ] one\n');
    expect(view.state.doc.toString()).toBe('# Master\n\n- [ ] one\n');
  });

  it('stays byte-identical through an arbitrary edit sequence', () => {
    const { view, text } = bind('start\n');
    const random = prng(20260805);

    for (let step = 0; step < 300; step++) {
      const edit = randomEdit(random, view.state.doc.length);
      view.dispatch({
        changes: {
          from: edit.index,
          to: edit.index + edit.deleteCount,
          insert: edit.insert,
        },
      });
      expect(view.state.doc.toString()).toBe(text.toString());
    }
  });

  it('preserves blank lines, which are the card-split gesture', () => {
    const source = 'one\n\n\n\ntwo\n\n';
    const { view, text } = bind();
    view.dispatch({ changes: { from: 0, insert: source } });
    expect(text.toString()).toBe(source);
    expect(view.state.doc.toString()).toBe(source);
  });

  it('preserves markdown a rich-text model would rewrite', () => {
    // Escapes, tildes and underscores are exactly what round-tripping through a
    // structured document model is documented to alter.
    const source = 'a \\* b _c_ ~d~ [e](f) \\_g\\_ \t trailing   \n';
    const { view, text } = bind();
    view.dispatch({ changes: { from: 0, insert: source } });
    expect(text.toString()).toBe(source);
  });

  it('reflects writes made to the CRDT directly', () => {
    const { view, text } = bind('hello');
    text.insert(5, ' world');
    expect(view.state.doc.toString()).toBe('hello world');
  });
});

describe('convergence', () => {
  const replay = (seed: number): void => {
    const a = createDoc();
    const b = createDoc();
    const random = prng(seed);

    const textA = a.getText('master');
    const textB = b.getText('master');

    const updatesA: Uint8Array[] = [];
    const updatesB: Uint8Array[] = [];
    a.on('update', (update: Uint8Array) => updatesA.push(update));
    b.on('update', (update: Uint8Array) => updatesB.push(update));

    for (let step = 0; step < 60; step++) {
      const target = random() < 0.5 ? textA : textB;
      const edit = randomEdit(random, target.length);
      target.doc?.transact(() => {
        if (edit.deleteCount > 0) target.delete(edit.index, edit.deleteCount);
        if (edit.insert) target.insert(Math.min(edit.index, target.length), edit.insert);
      });
    }

    // Both orders, per §11.
    for (const update of updatesA) Y.applyUpdate(b, update);
    for (const update of [...updatesB].reverse()) Y.applyUpdate(a, update);
    for (const update of updatesA) Y.applyUpdate(b, update);

    expect(textA.toString()).toBe(textB.toString());

    a.destroy();
    b.destroy();
  };

  it('converges regardless of the order updates arrive in', () => {
    for (const seed of [1, 7, 42, 20260805, 999983]) replay(seed);
  });

  it('keeps both sides of the conflict the architecture exists for', () => {
    // The same master list, edited on two devices, neither having seen the other.
    const phone = createDoc();
    const laptop = createDoc();

    phone.getText('master').insert(0, 'Reviewed the deploy\n');
    Y.applyUpdate(laptop, Y.encodeStateAsUpdate(phone));

    phone.getText('master').insert(20, 'Called the dentist\n');
    laptop.getText('master').insert(20, 'Wrote the migration plan\n');

    Y.applyUpdate(laptop, Y.encodeStateAsUpdate(phone));
    Y.applyUpdate(phone, Y.encodeStateAsUpdate(laptop));

    const merged = phone.getText('master').toString();
    expect(merged).toBe(laptop.getText('master').toString());
    expect(merged).toContain('Called the dentist');
    expect(merged).toContain('Wrote the migration plan');

    phone.destroy();
    laptop.destroy();
  });
});
