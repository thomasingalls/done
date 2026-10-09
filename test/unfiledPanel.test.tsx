import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cardId,
  cardBody,
  cardAuthor,
  cardOrigin,
  cardsIn,
  compose,
  dayAt,
  unfiledCards,
  transact,
} from '../src/crdt';
import { UnfiledPanel } from '../src/ui/UnfiledPanel';
import { harness, TODAY, type Harness } from './workspace';

let context: Harness;
vi.mock('../src/ui/workspaceUi', () => ({
  useWorkspaceUi: () => ({ snapshot: { days: [] }, execute: async () => true }),
}));
afterEach(() => context?.destroy());

describe('the unfiled panel', () => {
  it('renders retained cards with provenance and every supported destination', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'done' }, 'file this');
    const id = cardId(cardsIn(context.store.doc, TODAY, 'done')[0]!);
    transact(context.store.doc, context.store.actor.systemOrigin, () => {
      dayAt(context.store.doc, TODAY)?.delete('done');
    });

    const cards = unfiledCards(context.store.doc);
    expect(cards.map(({ id: unfiledId }) => unfiledId)).toEqual([id]);

    const html = renderToStaticMarkup(
      <UnfiledPanel
        today={TODAY}
        cards={cards.map(({ id, card, location }) => ({
          id,
          text: cardBody(card),
          author: cardAuthor(card),
          origin: cardOrigin(card),
          location,
        }))}
        open={true}
        onClose={() => {}}
      />,
    );

    expect(html).toContain('aria-label="Unfiled cards"');
    expect(html).toContain('Last seen in done');
    for (const action of ['Scheduled', 'Next', 'Done', 'Goals', 'Remove']) {
      expect(html).toContain(`>${action}</button>`);
    }
  });
});
