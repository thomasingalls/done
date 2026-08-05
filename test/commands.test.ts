import { indentLess, indentMore } from '@codemirror/commands';
import { describe, expect, it } from 'vitest';
import { toggleBold, toggleItalic, toggleTask } from '../src/editor/commands';
import { continueList } from '../src/editor/keymap';
import { run, stateFor } from './helpers';

const at = (doc: string, cursor: number) => stateFor(doc, cursor);

const withSelection = (doc: string, from: number, to: number) =>
  stateFor(doc, from).update({ selection: { anchor: from, head: to } }).state;

describe('idempotent wrapping', () => {
  it('wraps a selection and unwraps it again, returning to the original', () => {
    const doc = 'make this bold';
    const start = doc.indexOf('this');
    const state = withSelection(doc, start, start + 4);

    const wrapped = run(state, toggleBold);
    expect(wrapped.state.doc.toString()).toBe('make **this** bold');

    const unwrapped = run(wrapped.state, toggleBold);
    expect(unwrapped.state.doc.toString()).toBe(doc);
  });

  it('leaves the selection over the content, not the markers', () => {
    const doc = 'make this bold';
    const start = doc.indexOf('this');
    const wrapped = run(withSelection(doc, start, start + 4), toggleBold).state;
    const range = wrapped.selection.main;
    expect(wrapped.doc.sliceString(range.from, range.to)).toBe('this');
  });

  it('unwraps when the markers are inside the selection', () => {
    const doc = 'make **this** bold';
    const start = doc.indexOf('**');
    const state = withSelection(doc, start, start + 8);
    expect(run(state, toggleBold).state.doc.toString()).toBe('make this bold');
  });

  it('wraps the word under an empty cursor', () => {
    const doc = 'make this bold';
    const state = at(doc, doc.indexOf('this') + 2);
    expect(run(state, toggleItalic).state.doc.toString()).toBe('make *this* bold');
  });

  it('does not confuse italic with bold', () => {
    const doc = 'a word here';
    const start = doc.indexOf('word');
    const italic = run(withSelection(doc, start, start + 4), toggleItalic).state;
    expect(italic.doc.toString()).toBe('a *word* here');
    const bold = run(italic, toggleBold).state;
    expect(bold.doc.toString()).toBe('a ***word*** here');
  });
});

describe('task toggling', () => {
  it('flips an open box to done and back', () => {
    const doc = '- [ ] call the dentist';
    const once = run(at(doc, doc.length), toggleTask).state;
    expect(once.doc.toString()).toBe('- [x] call the dentist');
    expect(run(once, toggleTask).state.doc.toString()).toBe(doc);
  });

  it('adds a box to a plain list item', () => {
    const doc = '- write the thing';
    expect(run(at(doc, doc.length), toggleTask).state.doc.toString()).toBe('- [ ] write the thing');
  });

  it('makes a task out of a bare line, keeping its indentation', () => {
    const doc = '    write the thing';
    expect(run(at(doc, doc.length), toggleTask).state.doc.toString()).toBe(
      '    - [ ] write the thing',
    );
  });

  it('touches every line a selection covers, once each', () => {
    const doc = '- [ ] one\n- [ ] two\n- [ ] three';
    const state = withSelection(doc, 2, doc.indexOf('two'));
    expect(run(state, toggleTask).state.doc.toString()).toBe('- [x] one\n- [x] two\n- [ ] three');
  });

  it('handles ordered list markers', () => {
    const doc = '1. first thing';
    expect(run(at(doc, doc.length), toggleTask).state.doc.toString()).toBe('1. [ ] first thing');
  });
});

describe('list continuation', () => {
  it('continues a bullet on Enter', () => {
    const doc = '- one';
    expect(run(at(doc, doc.length), continueList).state.doc.toString()).toBe('- one\n- ');
  });

  it('continues a task as an empty task', () => {
    const doc = '- [x] one';
    expect(run(at(doc, doc.length), continueList).state.doc.toString()).toBe('- [x] one\n- [ ] ');
  });

  it('ends the list on the first Enter on an empty item', () => {
    const doc = '- one\n- ';
    expect(run(at(doc, doc.length), continueList).state.doc.toString()).toBe('- one\n');
  });

  it('outdents a nested empty item rather than ending the list', () => {
    const doc = '- one\n  - ';
    expect(run(at(doc, doc.length), continueList).state.doc.toString()).toBe('- one\n- ');
  });

  it('renumbers as it continues an ordered list', () => {
    const doc = '1. one';
    expect(run(at(doc, doc.length), continueList).state.doc.toString()).toBe('1. one\n2. ');
  });
});

describe('indentation', () => {
  it('indents by two spaces and outdents back', () => {
    const doc = '- one\n- two';
    const state = at(doc, doc.length);
    const indented = run(state, indentMore).state;
    expect(indented.doc.toString()).toBe('- one\n  - two');
    expect(run(indented, indentLess).state.doc.toString()).toBe(doc);
  });
});
