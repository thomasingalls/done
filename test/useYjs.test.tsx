import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Y } from '../src/crdt';
import { useYDocValue } from '../src/ui/useYjs';

let root: Root | undefined;
let doc: Y.Doc | undefined;
let entries: Y.Map<string> | undefined;
let keyReads = 0;
let valueReads = 0;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  act(() => root?.unmount());
  doc?.destroy();
  root = undefined;
  doc = undefined;
  entries = undefined;
  keyReads = 0;
  valueReads = 0;
});

describe('useYDocValue', () => {
  it('scans on document changes, not unrelated React renders', () => {
    doc = new Y.Doc();
    entries = doc.getMap<string>('entries');
    const container = document.createElement('div');
    root = createRoot(container);

    const Probe = ({ tick }: { tick: number }): React.ReactElement => {
      const size = useYDocValue(
        doc,
        () => {
          keyReads += 1;
          return `${entries?.size ?? 0}`;
        },
        () => {
          valueReads += 1;
          return entries?.size ?? 0;
        },
      );
      return <span data-tick={tick}>{size}</span>;
    };

    act(() => root?.render(<Probe tick={0} />));
    const readsAfterMount = { key: keyReads, value: valueReads };

    act(() => root?.render(<Probe tick={1} />));
    expect({ key: keyReads, value: valueReads }).toEqual(readsAfterMount);

    act(() => {
      entries?.set('card', 'one');
    });
    expect(container.textContent).toBe('1');
    expect(keyReads).toBe(readsAfterMount.key + 1);
    expect(valueReads).toBe(readsAfterMount.value + 1);
  });
});
