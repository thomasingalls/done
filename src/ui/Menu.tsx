/**
 * The menu (PRD §7.3).
 *
 * Search and a full calendar picker belong to Phase 4 — both want the SQLite
 * index that phase builds (TRD §6.2, §8.5). What is here is what this phase can
 * answer honestly: which day you are on and how to reach another one, whether
 * the browser has promised to keep the data, which actor this client is, and a
 * way to get everything out as markdown.
 *
 * The export is not decoration. Until sync exists it *is* the backup story
 * (TRD §10.5), and "your data outlives the app" is a ranked principle.
 */

import {
  actorById,
  downloadExport,
  setRolloverHour,
  updateActor,
  type Settings,
  type StoragePersistence,
  type Store,
} from '../crdt';
import { addDays, formatDayLong, relativeDay, type ISODate } from '../lib/date';
import { useYValue } from './useYjs';

const STORAGE_LABEL: Record<StoragePersistence, string> = {
  granted: 'Persistent',
  denied: 'Best-effort',
  unsupported: 'Unknown',
  unknown: 'Not yet asked',
};

const STORAGE_NOTE: Record<StoragePersistence, string> = {
  granted: 'The browser has agreed not to evict this data on its own.',
  denied:
    'The browser may evict this data under storage pressure. Export is the backup story until sync exists.',
  unsupported: 'This browser does not report whether storage is durable.',
  unknown: 'Durable storage is requested on your first edit.',
};

export interface MenuProps {
  store: Store;
  storage: StoragePersistence;
  settings: Settings;
  today: ISODate;
  date: ISODate;
  onGoTo: (date: ISODate) => void;
  onClose: () => void;
  /** The shell measures the panel to turn a drag into a fraction of its width. */
  ref?: React.Ref<HTMLElement>;
}

/** A week either side, which is the range the plane is comfortable walking. */
const NEARBY = [-7, -2, -1, 0, 1, 2, 7];

export const Menu = ({
  store,
  storage,
  settings,
  today,
  date,
  onGoTo,
  onClose,
  ref,
}: MenuProps): React.ReactElement => {
  const actor = useYValue(
    store.meta,
    () => JSON.stringify(actorById(store.doc, store.actor.id) ?? store.actor.actor),
    () => actorById(store.doc, store.actor.id) ?? store.actor.actor,
  );

  const changeActor = (patch: { name?: string; color?: string }): void => {
    const next = updateActor(store.doc, store.actor.origin, store.actor.id, patch);
    if (!next) return;
    Object.assign(store.actor.actor, next);
    store.awareness.setLocalStateField('user', {
      name: next.name,
      color: next.color,
      colorLight: `${next.color}33`,
    });
  };

  return (
    <aside className="menu" id="menu" aria-label="Menu" ref={ref}>
      <section className="menu-section">
        <h2 className="menu-heading">Day</h2>
        <p className="menu-note">{formatDayLong(date)}</p>
        <div className="menu-days">
          {NEARBY.map((offset) => {
            const target = addDays(today, offset);
            return (
              <button
                key={offset}
                type="button"
                className="menu-day"
                data-current={target === date}
                onClick={() => {
                  onGoTo(target);
                  onClose();
                }}
              >
                {relativeDay(target, today)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="menu-section">
        <h2 className="menu-heading">Storage</h2>
        <div className="menu-row">
          <span>Local data</span>
          <span className="menu-value">{STORAGE_LABEL[storage]}</span>
        </div>
        <p className="menu-note">{STORAGE_NOTE[storage]}</p>
        <button
          type="button"
          className="menu-button"
          onClick={() => downloadExport(store.doc, store.master.toString())}
        >
          Export markdown
        </button>
      </section>

      <section className="menu-section">
        <h2 className="menu-heading">This client</h2>
        <div className="menu-row">
          <span>Actor</span>
          <span className="menu-value">
            <span
              className="actor-swatch"
              style={{ '--actor-color': actor.color } as React.CSSProperties}
            />
            {actor.name}
          </span>
        </div>
        <div className="menu-row">
          <span>Device</span>
          <span className="menu-value">{store.actor.device.name}</span>
        </div>
        <label className="menu-row">
          <span>Name</span>
          <input
            className="menu-input"
            value={actor.name}
            aria-label="Actor name"
            onChange={(event) => changeActor({ name: event.target.value })}
          />
        </label>
        <label className="menu-row">
          <span>Color</span>
          <input
            className="menu-color"
            type="color"
            value={actor.color}
            aria-label="Actor color"
            onChange={(event) => changeActor({ color: event.target.value })}
          />
        </label>
        <label className="menu-row">
          <span>Day rollover</span>
          <select
            className="menu-input"
            value={settings.rolloverHour}
            aria-label="Day rollover hour"
            onChange={(event) => {
              setRolloverHour(
                store.doc,
                store.meta,
                store.actor.origin,
                Number(event.target.value),
              );
            }}
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="menu-section">
        <h2 className="menu-heading">Phase 2</h2>
        <p className="menu-note">
          The workflow: days, cards, the three-item cap, the freeze. No sync and no search yet —
          those are Phase 3 and Phase 4.
        </p>
      </section>
    </aside>
  );
};
