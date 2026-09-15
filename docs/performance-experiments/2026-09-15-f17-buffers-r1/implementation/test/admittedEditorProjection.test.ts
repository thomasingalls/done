import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdmittedEditor } from '../src/editor/admittedEditor';
import type { AdmittedTextSurface, TextSnapshot } from '../src/editor/admittedText';
import type { AdmissionStatus } from '../src/crdt/admission';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

const mount = (text = 'accepted text') => {
  let snapshot: TextSnapshot = {
      text,
      selection: EditorSelection.single(0).toJSON(),
      undo: 0,
      redo: 0,
    },
    status: AdmissionStatus = {
      state: 'active',
      revision: 0,
      pendingItems: 0,
      pendingBytes: 0,
      reservedBytes: 0,
      durable: true,
      pressure: null,
    },
    unreadable = false,
    updates = 0;
  const publications = new Set<() => void>(),
    statuses = new Set<(status: AdmissionStatus) => void>();
  const read = vi.fn(() => {
    if (unreadable) throw Error('unreadable');
    return snapshot;
  });
  const input = vi.fn<AdmittedTextSurface['input']>(() => ({
    id: 1,
    accepted: Promise.resolve({ id: 1, source: 'local', revision: 1, slices: 1 }),
  }));
  const surface: AdmittedTextSurface = {
    get status() {
      return status;
    },
    read,
    input,
    subscribe(listener) {
      publications.add(listener);
      return () => publications.delete(listener);
    },
    onStatus(listener) {
      statuses.add(listener);
      return () => statuses.delete(listener);
    },
    retry() {},
    discardPending() {},
  };
  const parent = document.createElement('div');
  document.body.append(parent);
  const editor = createAdmittedEditor({
    parent,
    document: surface,
    extra: [EditorView.updateListener.of(() => updates++)],
  });
  cleanups.push(() => {
    editor.destroy();
    parent.remove();
  });
  const publish = () => {
    for (const listener of publications) listener();
  };
  return {
    ...editor,
    parent,
    read,
    input,
    publish,
    get updates() {
      return updates;
    },
    resetUpdates: () => (updates = 0),
    setSnapshot(value: Partial<TextSnapshot>) {
      snapshot = { ...snapshot, ...value };
      publish();
    },
    setUnreadable(value: boolean) {
      unreadable = value;
    },
    setStatus(value: Partial<AdmissionStatus>) {
      status = { ...status, ...value };
      for (const listener of statuses) listener(status);
    },
  };
};

describe('admitted editor projection', () => {
  it('reads every publication while leaving an unchanged editor state alone', () => {
    const editor = mount('unchanged master '.repeat(6000));
    const before = editor.view.state;
    editor.resetUpdates();
    editor.read.mockClear();
    for (let index = 0; index < 5; index++) editor.publish();
    expect(editor.read).toHaveBeenCalledTimes(5);
    expect(editor.view.state).toBe(before);
    expect(editor.updates).toBe(0);
  });

  it('preserves a local selection when another surface publishes', () => {
    const editor = mount();
    editor.view.dispatch({ selection: EditorSelection.single(2, 7) });
    const before = editor.view.state;
    editor.resetUpdates();
    editor.setSnapshot({ selection: EditorSelection.single(0).toJSON() });
    expect(editor.view.state).toBe(before);
    expect(editor.view.state.selection.main.anchor).toBe(2);
    expect(editor.view.state.selection.main.head).toBe(7);
    expect(editor.updates).toBe(0);
  });

  it('projects selection-only changes including secondary ranges and main range', () => {
    const editor = mount();
    const selection = EditorSelection.create(
      [EditorSelection.range(0, 2), EditorSelection.range(6, 8)],
      1,
    );
    editor.resetUpdates();
    editor.setSnapshot({ selection: selection.toJSON() });
    expect(editor.view.state.selection.toJSON()).toEqual(selection.toJSON());
    expect(editor.updates).toBe(1);
    editor.setSnapshot({ selection: { ...selection.toJSON(), main: 0 } });
    expect(editor.view.state.selection.mainIndex).toBe(0);
    expect(editor.updates).toBe(2);
  });

  it('still normalizes cursor association, bidi level and goal column', () => {
    const editor = mount();
    editor.view.dispatch({
      selection: EditorSelection.create([EditorSelection.cursor(2, 1, 1, 9)]),
    });
    editor.resetUpdates();
    editor.publish();
    const cursor = editor.view.state.selection.main;
    expect(cursor.head).toBe(2);
    expect(cursor.assoc).toBe(0);
    expect(cursor.bidiLevel).toBe(null);
    expect(cursor.goalColumn).toBeUndefined();
    expect(editor.updates).toBe(1);
  });

  it('normalizes an undirectional range on an otherwise unchanged publication', () => {
    const editor = mount();
    editor.view.dispatch({
      selection: EditorSelection.create([EditorSelection.undirectionalRange(2, 7)]),
    });
    expect(editor.view.state.selection.main.undirectional).toBe(true);
    editor.resetUpdates();
    editor.publish();
    expect(editor.view.state.selection.main.undirectional).toBe(false);
    expect(editor.updates).toBe(1);
  });

  it('applies text changes with the accepted selection and drops the old local selection', () => {
    const editor = mount();
    editor.view.dispatch({ selection: EditorSelection.single(3) });
    editor.resetUpdates();
    editor.setSnapshot({
      text: 'accepted new text',
      selection: EditorSelection.single(12).toJSON(),
    });
    expect(editor.view.state.doc.toString()).toBe('accepted new text');
    expect(editor.view.state.selection.main.head).toBe(12);
    expect(editor.updates).toBe(1);
    editor.setSnapshot({ selection: EditorSelection.single(4).toJSON() });
    expect(editor.view.state.selection.main.head).toBe(4);
  });

  it('projects editability-only changes and restores editing', () => {
    const editor = mount();
    editor.resetUpdates();
    editor.setSnapshot({ editable: false });
    expect(editor.view.state.facet(EditorView.editable)).toBe(false);
    expect(editor.view.contentDOM.getAttribute('contenteditable')).toBe('false');
    editor.setSnapshot({ editable: true });
    expect(editor.view.state.facet(EditorView.editable)).toBe(true);
    expect(editor.updates).toBe(2);
  });

  it('clears stale writing when a publication becomes unreadable and projects a later valid read', () => {
    const editor = mount();
    editor.setUnreadable(true);
    editor.publish();
    expect(editor.view.state.doc.toString()).toBe('');
    expect(editor.view.state.facet(EditorView.editable)).toBe(false);
    editor.setUnreadable(false);
    editor.publish();
    expect(editor.view.state.doc.toString()).toBe('accepted text');
    expect(editor.view.state.facet(EditorView.editable)).toBe(true);
  });

  it('keeps blocked pending input out of the editor and reacts to unavailable status', () => {
    const editor = mount();
    editor.setStatus({ state: 'blocked', pendingItems: 1 });
    editor.publish();
    expect(editor.view.state.doc.toString()).toBe('accepted text');
    expect(editor.parent.querySelector('[role=status]')?.textContent).toContain(
      'Input is waiting for storage.',
    );
    editor.setUnreadable(true);
    editor.setStatus({ state: 'failed' });
    expect(editor.view.state.doc.toString()).toBe('');
    expect(editor.parent.querySelector('[role=status]')?.textContent).toContain(
      'Editing is unavailable.',
    );
  });

  it('keeps a local input error visible through an unchanged publication', () => {
    const editor = mount();
    editor.input.mockImplementationOnce(() => {
      throw Error('input refused');
    });
    editor.view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
    );
    editor.publish();
    expect(editor.parent.querySelector('[role=status]')?.textContent).toContain('input refused');
    expect(editor.view.state.doc.toString()).toBe('accepted text');
  });

  it('keeps projection transactions during composition and reconciles after a cancelled preedit', async () => {
    const editor = mount();
    editor.view.contentDOM.dispatchEvent(
      new CompositionEvent('compositionstart', { bubbles: true, data: '' }),
    );
    editor.resetUpdates();
    editor.publish();
    expect(editor.updates).toBeGreaterThan(0);
    editor.view.contentDOM.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true, data: '' }),
    );
    editor.resetUpdates();
    await Promise.resolve();
    expect(editor.updates).toBeGreaterThan(0);
    expect(editor.view.state.doc.toString()).toBe('accepted text');
  });
});
