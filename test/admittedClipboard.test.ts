import { EditorSelection } from '@codemirror/state';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdmittedEditor } from '../src/editor/admittedEditor';
import type { AdmittedTextSurface } from '../src/editor/admittedText';

const dispose: (() => void)[] = [];
afterEach(() => {
  while (dispose.length) dispose.pop()!();
});
const mount = (text: string, ranges = [[0, 0]]) => {
  let pending = false,
    readable = true,
    editable = true;
  const input = vi.fn<AdmittedTextSurface['input']>(() => ({
    id: 1,
    accepted: Promise.resolve({ id: 1, source: 'local', revision: 1, slices: 1 }),
  }));
  const selection = EditorSelection.create(
    ranges.map(([from, to]) => EditorSelection.range(from!, to!)),
  ).toJSON();
  const surface: AdmittedTextSurface = {
    get status() {
      return {
        state: 'active' as const,
        revision: 0,
        pendingItems: pending ? 1 : 0,
        pendingBytes: 0,
        reservedBytes: 0,
        durable: !pending,
        pressure: null,
      };
    },
    read() {
      if (!readable) throw Error('Locked');
      return { text, selection, editable, undo: 0, redo: 0 };
    },
    input,
    subscribe: () => () => {},
    onStatus: () => () => {},
    retry() {},
    discardPending() {},
  };
  const parent = document.createElement('div');
  document.body.append(parent);
  const editor = createAdmittedEditor({ parent, document: surface });
  dispose.push(() => {
    editor.destroy();
    parent.remove();
  });
  return {
    input,
    parent,
    pending: () => {
      pending = true;
    },
    lock: () => {
      readable = false;
    },
    freeze: () => {
      editable = false;
    },
    cut(mode = 'normal') {
      let copied: string | undefined;
      const data =
        mode === 'missing'
          ? undefined
          : {
              setData(_type: string, value: string) {
                if (mode === 'throw') throw Error('Clipboard refused');
                if (mode !== 'silent') copied = value;
              },
              getData() {
                return copied ?? '';
              },
            };
      const event = new Event('cut', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: data });
      editor.view.contentDOM.dispatchEvent(event);
      return { copied, prevented: event.defaultPrevented };
    },
  };
};

it.each([
  ['one\ntwo\nthree', [[1, 1]], 'one\n', [[0, 4]]],
  ['one\ntwo\nthree', [[5, 5]], 'two\n', [[4, 8]]],
  ['one\ntwo', [[5, 5]], 'two', [[4, 7]]],
  ['only', [[2, 2]], 'only', [[0, 4]]],
  ['one\n\nthree', [[4, 4]], '\n', [[4, 5]]],
] as const)(
  'copies complete visible line from %s before requesting admitted deletion',
  (text, ranges, copied, removed) => {
    const f = mount(
      text,
      ranges.map((r) => [...r]),
    );
    expect(f.cut()).toEqual({ copied, prevented: true });
    expect(f.input).toHaveBeenCalledExactlyOnceWith(
      { name: 'insert', text: '' },
      {
        ranges: removed.map(([anchor, head]) => ({ anchor, head })),
        main: 0,
      },
    );
  },
);

it('keeps ordinary selected-text cutting and deduplicates multiple carets on one line', () => {
  const selected = mount('one\ntwo', [[1, 3]]);
  expect(selected.cut().copied).toBe('ne');
  expect(selected.input.mock.calls[0]![1]).toEqual({ ranges: [{ anchor: 1, head: 3 }], main: 0 });
  const carets = mount('one\ntwo\nthree', [
    [1, 1],
    [2, 2],
    [5, 5],
  ]);
  expect(carets.cut().copied).toBe('one\ntwo\n');
  expect(carets.input.mock.calls[0]![1]).toEqual({ ranges: [{ anchor: 0, head: 8 }], main: 0 });
});

for (const mode of ['throw', 'silent', 'missing']) {
  it(`does not delete writing when clipboard data is ${mode}`, () => {
    const f = mount('keep this');
    expect(f.cut(mode).prevented).toBe(true);
    expect(f.input).not.toHaveBeenCalled();
    expect(f.parent.querySelector('[role="status"]')!.textContent).toContain('clipboard');
  });
}

for (const state of ['pending', 'lock', 'freeze'] as const) {
  it(`does not copy or delete ${state} writing`, () => {
    const f = mount('keep this');
    f[state]();
    expect(f.cut()).toEqual({ copied: undefined, prevented: true });
    expect(f.input).not.toHaveBeenCalled();
  });
}

it('does not overwrite the clipboard for an empty document', () => {
  const f = mount('');
  expect(f.cut()).toEqual({ copied: undefined, prevented: true });
  expect(f.input).not.toHaveBeenCalled();
});
