import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { transactionAffectsMembership, Y } from '../src/crdt';
import { useYDocValue } from '../src/ui/useYjs';

let root: Root | undefined;
let doc: Y.Doc | undefined;
let entries: Y.Map<string> | undefined;
let cards: Y.Map<Y.Map<unknown>> | undefined;
let locations: Y.Map<string> | undefined;
let master: Y.Text | undefined;
let cardText: Y.Text | undefined;
let archiveText: Y.Text | undefined;
let done: Y.Array<string> | undefined;
let keyReads = 0;
let valueReads = 0;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  act(() => root?.unmount());
  doc?.destroy();
  root = undefined;
  doc = undefined;
  entries = undefined;
  cards = undefined;
  locations = undefined;
  master = undefined;
  cardText = undefined;
  archiveText = undefined;
  done = undefined;
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
          valueReads += 1;
          return entries?.size ?? 0;
        },
        (value) => {
          keyReads += 1;
          return `${value}`;
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

  it('skips unrelated transactions and scans once for each relevant transaction', () => {
    doc = new Y.Doc();
    const initializedDays = doc.getMap<Y.Map<unknown>>('days');
    const initializedCards = doc.getMap<Y.Map<unknown>>('cards');
    const initializedLocations = doc.getMap<string>('cardLocations');
    cards = initializedCards;
    locations = initializedLocations;
    master = doc.getText('master');
    const day = new Y.Map<unknown>();
    done = new Y.Array<string>();
    const card = new Y.Map<unknown>();
    cardText = new Y.Text();
    archiveText = new Y.Text();

    doc.transact(() => {
      day.set('done', done);
      day.set('archive', archiveText);
      initializedDays.set('2026-08-10', day);
      card.set('text', cardText);
      initializedCards.set('card', card);
      initializedLocations.set('card', '2026-08-10:done');
    });

    const container = document.createElement('div');
    root = createRoot(container);

    const Probe = (): React.ReactElement => {
      const summary = useYDocValue(
        doc,
        () => {
          valueReads += 1;
          return `${cards?.size ?? 0}:${locations?.size ?? 0}:${done?.length ?? 0}`;
        },
        (value) => {
          keyReads += 1;
          return value;
        },
        (transaction) => transactionAffectsMembership(transaction.doc, transaction),
      );
      return <span>{summary}</span>;
    };

    act(() => root?.render(<Probe />));
    const readsAfterMount = { key: keyReads, value: valueReads };

    act(() => master?.insert(0, 'heading'));
    act(() => cardText?.insert(0, 'card text'));
    act(() => archiveText?.insert(0, 'archived card text'));
    expect({ key: keyReads, value: valueReads }).toEqual(readsAfterMount);

    act(() => done?.insert(0, ['card']));
    expect({ key: keyReads, value: valueReads }).toEqual({
      key: readsAfterMount.key + 1,
      value: readsAfterMount.value + 1,
    });

    act(() => {
      cards?.set('second-card', new Y.Map<unknown>());
    });
    act(() => {
      locations?.set('card', '2026-08-10:deferred');
    });
    expect({ key: keyReads, value: valueReads }).toEqual({
      key: readsAfterMount.key + 3,
      value: readsAfterMount.value + 3,
    });
  });
});
