/**
 * Cards retained because their collection membership can no longer be shown.
 *
 * This is intentionally a card surface, not a diagnostic table: filing a card is a
 * normal workflow decision with the same content rendering and destinations as
 * every other card. The last-known location is context only; no action trusts
 * it as a live source collection.
 */

import { NEXT_CAP } from '../crdt/days';
import { isFrozen } from '../crdt/freeze';
import type { WorkspaceSnapshot } from '../crdt/admittedWorkspace';
import { useWorkspaceUi } from './workspaceUi';
import type { CardHooks } from '../editor/cardCommands';
import { formatDayLong, type ISODate } from '../lib/date';
import { Card, type CardAction } from './Card';

const unfiledHooks: CardHooks = {
  split: () => false,
  mergeBackwards: () => null,
  leave: () => {},
};

export interface UnfiledPanelProps {
  today: ISODate;
  cards: WorkspaceSnapshot['cards'];
  open: boolean;
  onClose: () => void;
}

export const UnfiledPanel = ({
  today,
  cards,
  open,
  onClose,
}: UnfiledPanelProps): React.ReactElement => {
  const { snapshot, execute } = useWorkspaceUi();
  const nextIsFull =
    (snapshot.days.find((day) => day.date === today)?.next.length ?? 0) >= NEXT_CAP;

  const actionsFor = (entry: WorkspaceSnapshot['cards'][number]): CardAction[] => {
    const id = entry.id;
    const deletionDisabled = entry.location ? isFrozen(entry.location.date, today) : false;
    return [
      {
        label: 'Scheduled',
        hint: 'File into Scheduled today',
        run: () => void execute({ kind: 'file', id, to: { date: today, section: 'scheduled' } }),
      },
      {
        label: 'Next',
        hint: 'File into Next today',
        disabled: nextIsFull,
        run: () => void execute({ kind: 'file', id, to: { date: today, section: 'next' } }),
      },
      {
        label: 'Done',
        hint: 'File into Done today',
        run: () => void execute({ kind: 'file', id, to: { date: today, section: 'done' } }),
      },
      {
        label: 'Goals',
        hint: 'File into Goals',
        disabled: deletionDisabled,
        run: () => void execute({ kind: 'file', id, to: 'master' }),
      },
      {
        label: 'Remove',
        hint: 'Remove this unfiled card',
        disabled: deletionDisabled,
        run: () => void execute({ kind: 'remove', id }),
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
            const id = entry.id;
            const location = entry.location;
            const provenance = location
              ? `Last seen in ${location.section}, ${formatDayLong(location.date)}`
              : 'Original location unavailable';
            return (
              <section className="unfiled-item" key={id}>
                <p className="unfiled-origin">{provenance}</p>
                <Card
                  card={entry}
                  section="scheduled"
                  frozen={false}
                  guarded={false}
                  actions={actionsFor(entry)}
                  hooks={unfiledHooks}
                  editable={false}
                />
              </section>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
