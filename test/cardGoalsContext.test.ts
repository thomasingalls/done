import { afterEach, describe, expect, it } from 'vitest';
import {
  cardAt,
  cardBody,
  cardGoalsContext,
  cardId,
  cardsIn,
  copyCard,
  compose,
  copyFromMaster,
  moveFromMaster,
  moveCard,
  splitCard,
  mergeCardBackwards,
  normalizeGoalsContext,
  exportEntries,
  applyUpdate,
  encodeState,
  createDoc,
  newText,
  serializeCollections,
  setCardLocation,
  collectionOf,
  dayAt,
  type GoalsContext,
} from '../src/crdt';
import { harness, TODAY, type Harness } from './workspace';
const WORK: GoalsContext = [
  { level: 1, title: 'Work' },
  { level: 3, title: 'Launch' },
];
const HOME: GoalsContext = [{ level: 1, title: 'Home' }];
const TO = { date: TODAY, section: 'scheduled' as const };
let h: Harness;
afterEach(() => h?.destroy());
const cards = () => cardsIn(h.store.doc, TODAY, 'scheduled');

describe('optional Goals context remains card metadata', () => {
  it('bounds and owns snapshots, refusing malformed/future data without changing text', async () => {
    h = await harness();
    compose(h.me, TO, 'writing', { goalsContext: WORK });
    const card = cards()[0]!;
    expect(cardGoalsContext(card)).toEqual(WORK);
    expect(cardGoalsContext(card)).not.toBe(WORK);
    expect(cardGoalsContext(card)).toBe(cardGoalsContext(card));
    expect(Object.isFrozen(cardGoalsContext(card))).toBe(true);
    for (const raw of [
      null,
      [],
      [null],
      [{ level: 0, title: 'bad' }],
      [{ level: 7, title: 'bad' }],
      [{ level: 1, title: ' ' }],
      [{ level: 1, title: 'a\nb' }],
      [{ level: 1, title: 'x'.repeat(1025) }],
      [
        { level: 2, title: 'a' },
        { level: 1, title: 'b' },
      ],
      [
        { level: 1, title: 'a' },
        { level: 1, title: 'b' },
      ],
    ]) {
      expect(normalizeGoalsContext(raw)).toBeNull();
    }
    card.set('goalsContext', { v: 2, headings: WORK });
    expect(cardGoalsContext(card)).toBeNull();
    expect(cardBody(card)).toBe('writing');
  });
  it('legacy cards stay unlabeled and detached copies own the optional path', async () => {
    h = await harness();
    compose(h.me, TO, 'old writing');
    compose(h.me, TO, 'new writing', { goalsContext: WORK });
    expect(cardGoalsContext(cards().find((card) => cardBody(card) === 'old writing')!)).toBeNull();
    const clone = copyCard(cards().find((card) => cardBody(card) === 'new writing')!);
    const doc = createDoc();
    try {
      doc.getMap('cards').set(cardId(clone), clone);
      expect(cardGoalsContext(clone)).toEqual(WORK);
      expect(cardBody(clone)).toBe('new writing');
    } finally {
      doc.destroy();
    }
  });
  it('markup-only selected lines do not shift later cards onto the wrong path', async () => {
    h = await harness();
    expect(copyFromMaster(h.me, TO, ['- first', '- ', '- second'], [WORK, null, HOME])).toBe(2);
    expect(cards().map(cardBody)).toEqual(['first', 'second']);
    expect(cards().map(cardGoalsContext)).toEqual([WORK, HOME]);
    expect(h.store.master.toString()).toBe('');
  });
  it('capacity and freeze checks still bound copying and moving', async () => {
    h = await harness();
    const next = { ...TO, section: 'next' as const };
    compose(h.me, next, 'one');
    compose(h.me, next, 'two');
    expect(copyFromMaster(h.me, next, ['a', 'b'], [WORK, HOME])).toBe(1);
    expect(
      cardGoalsContext(cardsIn(h.store.doc, TODAY, 'next').find((card) => cardBody(card) === 'a')!),
    ).toEqual(WORK);
    h.store.master.insert(0, 'a\nb');
    expect(
      moveFromMaster(
        h.me,
        h.store.master,
        next,
        [0, 1],
        new Map([
          [0, WORK],
          [1, HOME],
        ]),
      ),
    ).toBe(0);
    expect(h.store.master.toString()).toBe('a\nb');
    expect(copyFromMaster({ ...h.me, today: '2026-08-10' }, TO, ['x'], [HOME])).toBe(0);
  });
  it('move creation, source removal, path and undo remain one transaction', async () => {
    h = await harness();
    h.store.master.insert(0, 'first\nsecond');
    h.store.undo.stopCapturing();
    expect(moveFromMaster(h.me, h.store.master, TO, [1], new Map([[1, WORK]]))).toBe(1);
    expect(h.store.master.toString()).toBe('first');
    expect(cardGoalsContext(cards()[0]!)).toEqual(WORK);
    h.store.undo.undo();
    expect(cards()).toHaveLength(0);
    expect(h.store.master.toString()).toBe('first\nsecond');
    h.store.undo.redo();
    expect(cardGoalsContext(cards()[0]!)).toEqual(WORK);
  });
  it('moves and splits preserve context and equal-context merges retain it', async () => {
    h = await harness();
    compose(h.me, TO, 'headtail', { goalsContext: WORK });
    const id = cardId(cards()[0]!);
    const created = splitCard(h.me, TO, id, 4)!;
    expect(cardGoalsContext(cardAt(h.store.doc, created)!)).toEqual(WORK);
    expect(mergeCardBackwards(h.me, TO, created)).toBe(4);
    expect(cardGoalsContext(cards()[0]!)).toEqual(WORK);
    expect(moveCard(h.me, TO, id, { ...TO, section: 'done' })).toBe(true);
    expect(cardGoalsContext(cardsIn(h.store.doc, TODAY, 'done')[0]!)).toEqual(WORK);
  });
  it('merging different contexts clears an ambiguous label and undo restores both paths', async () => {
    h = await harness();
    compose(h.me, TO, 'home', { goalsContext: HOME });
    compose(h.me, TO, 'work', { goalsContext: WORK });
    const id = cardId(cards()[1]!);
    expect(mergeCardBackwards(h.me, TO, id)).toBe(4);
    expect(cards().map(cardBody)).toEqual(['workhome']);
    expect(cardGoalsContext(cards()[0]!)).toBeNull();
    h.store.undo.undo();
    expect(cards().map(cardGoalsContext)).toEqual([WORK, HOME]);
    h.store.undo.redo();
    expect(cardGoalsContext(cards()[0]!)).toBeNull();
  });
  it('merging labeled and unlabeled writing does not imply shared ancestry', async () => {
    h = await harness();
    compose(h.me, TO, 'work', { goalsContext: WORK });
    compose(h.me, TO, 'unrelated');
    mergeCardBackwards(h.me, TO, cardId(cards()[1]!));
    expect(cardGoalsContext(cards()[0]!)).toBeNull();
  });
  it('wire updates retain paths when peers read old cards and only move memberships', async () => {
    h = await harness();
    compose(h.me, TO, 'one', { goalsContext: WORK });
    const id = cardId(cards()[0]!);
    const peer = createDoc();
    try {
      applyUpdate(peer, encodeState(h.store.doc));
      // The old shape has no context accessor. A same-card move changes only
      // existing membership roots; the unknown advisory field stays opaque.
      const card = cardAt(peer, id)!;
      expect(card.get('text')).toBeDefined();
      const before = JSON.stringify(card.get('goalsContext'));
      expect(moveCard({ ...h.me, doc: peer }, TO, id, { ...TO, section: 'done' })).toBe(true);
      applyUpdate(h.store.doc, encodeState(peer));
      expect(JSON.stringify(cardAt(h.store.doc, id)!.get('goalsContext'))).toBe(before);
      expect(cardGoalsContext(cardAt(h.store.doc, id)!)).toEqual(WORK);
    } finally {
      peer.destroy();
    }
  });
  it('exports context in a versioned sidecar without changing day Markdown', async () => {
    h = await harness();
    compose(h.me, TO, 'text\nbody', { goalsContext: WORK });
    const withContext = exportEntries(h.store.doc, h.store.master.toString());
    const metadata = JSON.parse(withContext.find((e) => e.path === 'goals-context.json')!.content);
    expect(metadata).toEqual({
      v: 1,
      cards: [{ file: `days/${TODAY}.md`, section: 'scheduled', index: 0, headings: WORK }],
    });
    cards()[0]!.delete('goalsContext');
    const plain = exportEntries(h.store.doc, h.store.master.toString());
    expect(plain).toEqual(withContext.filter((e) => e.path !== 'goals-context.json'));
    expect(plain.some((e) => e.path === 'goals-context.json')).toBe(false);
  });
  it('unfiled context exports reference the actual unfiled card order', async () => {
    h = await harness();
    compose(h.me, TO, 'retained', { goalsContext: WORK });
    const id = cardId(cards()[0]!);
    collectionOf(dayAt(h.store.doc, TODAY), 'scheduled')!.delete(0, 1);
    setCardLocation(h.store.doc, id, null);
    const entries = exportEntries(h.store.doc, '');
    expect(JSON.parse(entries.find((e) => e.path === 'goals-context.json')!.content).cards).toEqual(
      [{ file: 'unfiled.md', section: null, index: 0, headings: WORK }],
    );
    expect(entries.find((e) => e.path === 'unfiled.md')!.content).toContain('retained');
  });
});

it('sidecars never assign live-card headings to a retained archive at the same position', async () => {
  h = await harness();
  compose(h.me, TO, 'live writing', { goalsContext: WORK });
  dayAt(h.store.doc, TODAY)!.set(
    'archive',
    newText(serializeCollections({ next: [], scheduled: ['older archived writing'], done: [] })),
  );
  const entries = exportEntries(h.store.doc, '');
  expect(entries.find((entry) => entry.path === `days/${TODAY}.md`)!.content).toContain(
    'older archived writing',
  );
  const contexts = entries.find((entry) => entry.path === 'goals-context.json');
  if (contexts)
    expect(
      JSON.parse(contexts.content).cards.every(
        (row: { file: string }) => row.file !== `days/${TODAY}.md`,
      ),
    ).toBe(true);
});
