/**
 * Cards retained because their collection membership can no longer be shown.
 *
 * This is intentionally a card surface, not a diagnostic table: filing a card is a
 * normal workflow decision with the same content rendering and destinations as
 * every other card. The last-known location is context only; no action trusts
 * it as a live source collection.
 */

import {
  NEXT_CAP,
  cardId,
  countIn,
  isFrozen,
  fileCardTo,
  fileCardToGoals,
  removeUnfiledCard,
  type UnfiledCard,
  type Store,
  type Workspace,
} from '../crdt';
import type { CardHooks } from '../editor/cardCommands';
import { formatDayLong, type ISODate } from '../lib/date';
import { Card, type CardAction } from './Card';
import { useYValue } from './useYjs';

const unfiledHooks: CardHooks = {
  split: () => false,
  mergeBackwards: () => null,
  leave: () => {},
};

export interface UnfiledPanelProps {
  store: Store;
  workspace: Workspace;
  today: ISODate;
  cards: readonly UnfiledCard[];
  open: boolean;
  onClose: () => void;
}

export const UnfiledPanel = ({
  store,
  workspace,
  today,
  cards,
  open,
  onClose,
}: UnfiledPanelProps): React.ReactElement => {
  const nextIsFull = useYValue(
    store.days,
    () => `${countIn(store.doc, today, 'next')}`,
    () => countIn(store.doc, today, 'next') >= NEXT_CAP,
  );

  const actionsFor = (entry: UnfiledCard): CardAction[] => {
    const id = cardId(entry.card);
    const deletionDisabled = entry.location ? isFrozen(entry.location.date, today) : false;
    return [
      {
        label: 'Scheduled',
        hint: 'File into Scheduled today',
        run: () => void fileCardTo(workspace, id, { date: today, section: 'scheduled' }),
      },
      {
        label: 'Next',
        hint: 'File into Next today',
        disabled: nextIsFull,
        run: () => void fileCardTo(workspace, id, { date: today, section: 'next' }),
      },
      {
        label: 'Done',
        hint: 'File into Done today',
        run: () => void fileCardTo(workspace, id, { date: today, section: 'done' }),
      },
      {
        label: 'Goals',
        hint: 'File into Goals',
        disabled: deletionDisabled,
        run: () => void fileCardToGoals(workspace, store.master, id),
      },
      {
        label: 'Remove',
        hint: 'Remove this unfiled card',
        disabled: deletionDisabled,
        run: () => void removeUnfiledCard(workspace, id),
      },
    ];
  };

  return (
    <aside
      className="unfiled-panel"
      id="unfiled-panel"
      aria-label="Unfiled cards"
      aria-hidden={!open}
      inert={!open}
    >
      <header className="panel-header">
        <h2 className="panel-title">Unfiled</h2>
        <span className="unfiled-count">{cards.length}</span>
        <button type="button" className="panel-action" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="unfiled-body">
        <p className="unfiled-note">
          These cards were retained because their original collection can no longer display them.
          Choose a new home or remove them explicitly.
        </p>

        <div className="unfiled-list">
          {cards.map((entry) => {
            const id = cardId(entry.card);
            const location = entry.location;
            const provenance = location
              ? `Last seen in ${location.section}, ${formatDayLong(location.date)}`
              : 'Original location unavailable';
            return (
              <section className="unfiled-item" key={id}>
                <p className="unfiled-origin">{provenance}</p>
                <Card
                  store={store}
                  card={entry.card}
                  section="scheduled"
                  frozen={false}
                  guarded={false}
                  actions={actionsFor(entry)}
                  hooks={unfiledHooks}
                  editable={true}
                  origin={workspace.origin}
                />
              </section>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
