import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { cardId, cardsIn, compose, dayAt, recoveryCards, transact } from '../src/crdt';
import { RecoveryPanel } from '../src/ui/RecoveryPanel';
import { harness, TODAY, type Harness } from './workspace';

let context: Harness;
afterEach(() => context?.destroy());

describe('the recovery panel', () => {
  it('renders retained cards with provenance and every supported destination', async () => {
    context = await harness();
    compose(context.me, { date: TODAY, section: 'done' }, 'recover this');
    const id = cardId(cardsIn(context.store.doc, TODAY, 'done')[0]!);
    transact(context.store.doc, context.store.actor.systemOrigin, () => {
      dayAt(context.store.doc, TODAY)?.delete('done');
    });

    const cards = recoveryCards(context.store.doc);
    expect(cards.map(({ id: recoveryId }) => recoveryId)).toEqual([id]);

    const html = renderToStaticMarkup(
      <RecoveryPanel
        store={context.store}
        workspace={context.me}
        today={TODAY}
        cards={cards}
        open={true}
        onClose={() => {}}
      />,
    );

    expect(html).toContain('aria-label="Card recovery"');
    expect(html).toContain('Last seen in done');
    for (const action of ['Scheduled', 'Next', 'Done', 'Goals', 'Remove']) {
      expect(html).toContain(`>${action}</button>`);
    }
  });
});
