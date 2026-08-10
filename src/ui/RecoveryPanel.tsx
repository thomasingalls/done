/**
 * Cards retained because their collection membership can no longer be shown.
 *
 * This is intentionally a card surface, not a diagnostic table: recovery is a
 * normal workflow decision with the same content rendering and destinations as
 * every other card. The last-known location is context only; no action trusts
 * it as a live source collection.
 */

import {
  NEXT_CAP,
  cardId,
  countIn,
  isFrozen,
  recoverCardTo,
  recoverCardToGoals,
  removeRecoveryCard,
  type RecoveryCard,
  type Store,
  type Workspace,
} from '../crdt';
import type { CardHooks } from '../editor/cardCommands';
import { formatDayLong, type ISODate } from '../lib/date';
import { Card, type CardAction } from './Card';
import { useYValue } from './useYjs';

const recoveryHooks: CardHooks = {
  split: () => false,
  mergeBackwards: () => null,
  leave: () => {},
};

export interface RecoveryPanelProps {
  store: Store;
  workspace: Workspace;
  today: ISODate;
  cards: readonly RecoveryCard[];
  open: boolean;
  onClose: () => void;
}

export const RecoveryPanel = ({
  store,
  workspace,
  today,
  cards,
  open,
  onClose,
}: RecoveryPanelProps): React.ReactElement => {
  const nextIsFull = useYValue(
    store.days,
    () => `${countIn(store.doc, today, 'next')}`,
    () => countIn(store.doc, today, 'next') >= NEXT_CAP,
  );

  const actionsFor = (entry: RecoveryCard): CardAction[] => {
    const id = cardId(entry.card);
    const deletionDisabled = entry.location ? isFrozen(entry.location.date, today) : false;
    return [
      {
        label: 'Scheduled',
        hint: 'Recover to Scheduled today',
        run: () => void recoverCardTo(workspace, id, { date: today, section: 'scheduled' }),
      },
      {
        label: 'Next',
        hint: 'Recover to Next today',
        disabled: nextIsFull,
        run: () => void recoverCardTo(workspace, id, { date: today, section: 'next' }),
      },
      {
        label: 'Done',
        hint: 'Recover to Done today',
        run: () => void recoverCardTo(workspace, id, { date: today, section: 'done' }),
      },
      {
        label: 'Goals',
        hint: 'Recover to Goals',
        disabled: deletionDisabled,
        run: () => void recoverCardToGoals(workspace, store.master, id),
      },
      {
        label: 'Remove',
        hint: 'Remove this recovery card',
        disabled: deletionDisabled,
        run: () => void removeRecoveryCard(workspace, id),
      },
    ];
  };

  return (
    <aside
      className="recovery-panel"
      id="recovery-panel"
      aria-label="Card recovery"
      aria-hidden={!open}
      inert={!open}
    >
      <header className="panel-header">
        <h2 className="panel-title">Recovery</h2>
        <span className="recovery-count">{cards.length}</span>
        <button type="button" className="panel-action" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="recovery-body">
        <p className="recovery-note">
          These cards were retained because their original collection can no longer display them.
          Choose a new home or remove them explicitly.
        </p>

        <div className="recovery-list">
          {cards.map((entry) => {
            const id = cardId(entry.card);
            const location = entry.location;
            const provenance = location
              ? `Last seen in ${location.section}, ${formatDayLong(location.date)}`
              : 'Original location unavailable';
            return (
              <section className="recovery-item" key={id}>
                <p className="recovery-origin">{provenance}</p>
                <Card
                  store={store}
                  card={entry.card}
                  section="scheduled"
                  frozen={false}
                  guarded={false}
                  actions={actionsFor(entry)}
                  hooks={recoveryHooks}
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
